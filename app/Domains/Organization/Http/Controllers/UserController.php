<?php

namespace App\Domains\Organization\Http\Controllers;

use App\Domains\Organization\Http\Requests\StoreUserRequest;
use App\Domains\Organization\Http\Requests\UpdateUserRequest;
use App\Domains\Organization\Http\Resources\UserResource;
use App\Domains\Organization\Repositories\UserRepositoryInterface;
use App\Exceptions\ApiException;
use App\Models\Setting;
use App\Models\User;
use App\Support\Constants\Roles;
use App\Support\Http\ApiResponse;
use App\Support\Import\UserImport;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;
use Maatwebsite\Excel\Facades\Excel;
use Maatwebsite\Excel\Validators\ValidationException;
use PhpOffice\PhpSpreadsheet\Reader\Exception as PhpSpreadsheetException;
use Symfony\Component\HttpFoundation\Response;

class UserController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private UserRepositoryInterface $userRepository,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('user.manage');

        $users = $this->userRepository->paginateWithRelations(
            perPage: min(max($request->integer('per_page', 15), 1), 100),
            relations: ['team.field', 'roles'],
        );

        return ApiResponse::paginated($users, UserResource::class);
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $this->authorize('user.manage');

        $data = $request->only(['name', 'nip', 'email', 'team_id', 'rank', 'position', 'phone']);
        $data['is_active'] = true;
        $data['must_change_password'] = true;

        // Inject default password from Setting if not provided
        if ($password = $request->input('password')) {
            $data['password'] = $password;
        } else {
            $roles = $request->input('roles', []);
            $hasAdmin = in_array(Roles::ADMIN, $roles);

            $data['password'] = $hasAdmin
                ? Setting::get('password_default_admin', 'admin123')
                : Setting::get('password_default_user', 'user1234');
        }

        $user = $this->userRepository->create($data);

        $user->syncRoles($request->input('roles', []));

        if ($request->has('permissions')) {
            $user->syncPermissions($request->input('permissions', []));
        }

        return ApiResponse::created(
            new UserResource($user->load(['team.field', 'roles', 'permissions'])),
            'User berhasil dibuat.',
        );
    }

    public function show(User $user): JsonResponse
    {
        $this->authorize('user.manage');

        $user->load(['team.field', 'roles', 'permissions']);

        return ApiResponse::ok(new UserResource($user));
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $this->authorize('user.manage');

        $data = $request->only(['name', 'nip', 'email', 'team_id', 'rank', 'position', 'phone', 'is_active']);
        $this->userRepository->update($user->id, $data);

        if ($request->has('roles')) {
            $user->syncRoles($request->input('roles', []));
        }

        if ($request->has('permissions')) {
            $user->syncPermissions($request->input('permissions', []));
        }

        return ApiResponse::ok(
            new UserResource($user->fresh(['team.field', 'roles', 'permissions'])),
            'User berhasil diperbarui.',
        );
    }

    public function destroy(User $user): Response
    {
        $this->authorize('user.manage');

        $user->delete();

        return ApiResponse::deleted();
    }

    public function import(Request $request): JsonResponse
    {
        $this->authorize('user.import');

        $request->validate([
            'file' => ['required', 'file', 'mimes:xlsx,xls,csv', 'max:10240'],
        ]);

        $import = new UserImport;

        try {
            Excel::import($import, $request->file('file'));
        } catch (ValidationException $e) {
            // Row-level validation (bad role names, malformed emails) is
            // client-fixable: 422 with the import guidance message.
            Log::error('User import failed', ['exception' => $e]);

            throw new ApiException('Import gagal. Silakan periksa format file.', 422);
        } catch (PhpSpreadsheetException $e) {
            // The file could not be parsed as a spreadsheet: client-fixable.
            Log::error('User import failed', ['exception' => $e]);

            throw new ApiException('Import gagal. Silakan periksa format file.', 422);
        }
        // Anything else (DB, IO, ...) escapes to the Handler → 500 generic.

        // Assign roles from imported role column
        foreach ($import->roleAssignments as $email => $roleName) {
            $user = User::where('email', $email)->first();
            if ($user) {
                $user->assignRole($roleName);
            }
        }

        return ApiResponse::ok($import->results, 'Import selesai.');
    }
}

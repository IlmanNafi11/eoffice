<?php

namespace App\Domains\Organization\Http\Controllers;

use App\Domains\Organization\Http\Requests\StoreUserRequest;
use App\Domains\Organization\Http\Requests\UpdateUserRequest;
use App\Domains\Organization\Http\Resources\UserResource;
use App\Domains\Organization\Repositories\UserRepositoryInterface;
use App\Models\Setting;
use App\Models\User;
use App\Support\Constants\Roles;
use App\Support\Import\UserImport;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;
use Maatwebsite\Excel\Facades\Excel;

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
            perPage: min($request->integer('per_page', 15), 100),
            relations: ['team.field', 'roles'],
        );

        return response()->json([
            'success' => true,
            'data' => UserResource::collection($users->items()),
            'meta' => [
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
                'total' => $users->total(),
            ],
        ]);
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

        return response()->json([
            'success' => true,
            'message' => 'User berhasil dibuat.',
            'data' => new UserResource($user->load(['team.field', 'roles', 'permissions'])),
        ], 201);
    }

    public function show(int $id): JsonResponse
    {
        $this->authorize('user.manage');

        $user = $this->userRepository->find($id, relations: ['team.field', 'roles', 'permissions']);

        if (! $user) {
            return response()->json([
                'success' => false,
                'message' => 'User tidak ditemukan.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => new UserResource($user),
        ]);
    }

    public function update(UpdateUserRequest $request, int $id): JsonResponse
    {
        $this->authorize('user.manage');

        $user = $this->userRepository->find($id);
        if (! $user) {
            return response()->json([
                'success' => false,
                'message' => 'User tidak ditemukan.',
            ], 404);
        }

        $data = $request->only(['name', 'nip', 'email', 'team_id', 'rank', 'position', 'phone', 'is_active']);
        $this->userRepository->update($id, $data);

        if ($request->has('roles')) {
            $user->syncRoles($request->input('roles', []));
        }

        if ($request->has('permissions')) {
            $user->syncPermissions($request->input('permissions', []));
        }

        return response()->json([
            'success' => true,
            'message' => 'User berhasil diperbarui.',
            'data' => new UserResource($user->fresh(['team.field', 'roles', 'permissions'])),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $this->authorize('user.manage');

        $deleted = $this->userRepository->delete($id);

        if (! $deleted) {
            return response()->json([
                'success' => false,
                'message' => 'User tidak ditemukan.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'message' => 'User berhasil dihapus.',
        ]);
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

            // Assign roles from imported role column
            foreach ($import->roleAssignments as $email => $roleName) {
                $user = User::where('email', $email)->first();
                if ($user) {
                    $user->assignRole($roleName);
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'Import selesai.',
                'data' => $import->results,
            ]);
        } catch (\Throwable $e) {
            Log::error('User import failed', ['error' => $e->getMessage()]);

            return response()->json([
                'success' => false,
                'message' => 'Import gagal. Silakan periksa format file.',
            ], 422);
        }
    }
}

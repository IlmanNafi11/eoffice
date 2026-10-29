<?php

namespace App\Domains\ChangeManagement\Http\Controllers;

use App\Domains\ChangeManagement\Http\Requests\DecideChangePackageRequest;
use App\Domains\ChangeManagement\Http\Requests\StoreChangePackageRequest;
use App\Domains\ChangeManagement\Http\Requests\SubmitChangePackageRequest;
use App\Domains\ChangeManagement\Http\Requests\UpdateChangePackageRequest;
use App\Domains\ChangeManagement\Http\Requests\UploadChangePackageAttachmentsRequest;
use App\Domains\ChangeManagement\Http\Resources\AttachmentResource;
use App\Domains\ChangeManagement\Http\Resources\ChangePackageResource;
use App\Domains\ChangeManagement\Repositories\ChangeManagementRepositoryInterface;
use App\Domains\ChangeManagement\Services\ChangePackageDecision;
use App\Domains\ChangeManagement\Services\DocNumberGenerator;
use App\Support\Http\ApiResponse;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Symfony\Component\HttpFoundation\Response;

class ChangePackageController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private ChangeManagementRepositoryInterface $repo,
        private ChangePackageDecision $decisions,
        private DocNumberGenerator $docNumberGenerator,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('change.initiation.view');

        $page = $this->repo->paginatePackages(
            perPage: self::perPage($request),
            filters: $request->only(['status', 'field_id']),
            actor: $request->user(),
        );

        return ApiResponse::paginated($page, ChangePackageResource::class);
    }

    public function store(StoreChangePackageRequest $request): JsonResponse
    {
        $this->authorize('change.initiation.create');

        $docNumber = $this->docNumberGenerator->generate();

        $package = $this->repo->createPackage(
            initiation: array_merge($request->input('initiation', []), [
                'initiator_id' => $request->user()->id,
                'doc_number' => $docNumber,
                'initiation_date' => now()->toDateString(),
            ]),
            implementation: $request->input('implementation', []),
            typeIds: $request->input('implementation.change_type_ids', []),
        );

        return ApiResponse::created(
            new ChangePackageResource($package),
            'Draft paket perubahan berhasil dibuat.',
        );
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->authorize('change.initiation.view');

        $package = $this->repo->packageVisibleTo($id, $request->user());

        if ($package) {
            return ApiResponse::ok(new ChangePackageResource($package));
        }

        // Null conflates 404 and 403; resolve which by re-fetching without scope.
        if ($this->repo->findPackage($id)) {
            return ApiResponse::fail('Anda tidak memiliki akses ke paket ini.', 403);
        }

        return ApiResponse::fail('Paket perubahan tidak ditemukan.', 404);
    }

    public function update(UpdateChangePackageRequest $request, int $id): JsonResponse
    {
        $this->authorize('change.initiation.update');

        $package = $this->repo->findPackage($id);

        if (! $package) {
            return ApiResponse::fail('Paket perubahan tidak ditemukan.', 404);
        }

        if ($package->initiator_id !== $request->user()->id) {
            return ApiResponse::fail('Hanya inisiator yang dapat mengubah paket.', 403);
        }

        if ($package->status !== 'draft') {
            return ApiResponse::fail('Hanya paket draft yang dapat diubah.');
        }

        $updated = $this->repo->updatePackage(
            id: $id,
            initiation: $request->input('initiation', []),
            implementation: $request->input('implementation', []),
            typeIds: $request->input('implementation.change_type_ids', []),
        );

        return ApiResponse::ok(
            new ChangePackageResource($updated),
            'Paket perubahan berhasil diubah.',
        );
    }

    public function destroy(Request $request, int $id): Response
    {
        $this->authorize('change.initiation.update');

        $package = $this->repo->findPackage($id);

        if (! $package) {
            return ApiResponse::fail('Paket perubahan tidak ditemukan.', 404);
        }

        if ($package->initiator_id !== $request->user()->id) {
            return ApiResponse::fail('Hanya inisiator yang dapat menghapus paket.', 403);
        }

        if ($package->status !== 'draft') {
            return ApiResponse::fail('Hanya paket draft yang dapat dihapus.');
        }

        $this->repo->deletePackage($id);

        return ApiResponse::deleted();
    }

    public function submit(SubmitChangePackageRequest $request, int $id): JsonResponse
    {
        $this->authorize('change.initiation.submit');

        $package = $this->repo->findPackage($id);

        if (! $package) {
            return ApiResponse::fail('Paket perubahan tidak ditemukan.', 404);
        }

        if ($package->initiator_id !== $request->user()->id) {
            return ApiResponse::fail('Hanya inisiator yang dapat mensubmit paket.', 403);
        }

        if ($package->status !== 'draft') {
            return ApiResponse::fail('Hanya paket draft yang dapat disubmit.');
        }

        // Persist the submit payload (staf fills all business fields) before transition.
        $this->repo->updatePackage(
            id: $id,
            initiation: $request->input('initiation', []),
            implementation: $request->input('implementation', []),
            typeIds: $request->input('implementation.change_type_ids', []),
        );

        $this->repo->transitionPackage($id, 'pending', [
            'initiator_signed_at' => now(),
            'verification_token' => $package->verification_token ?? bin2hex(random_bytes(32)),
        ], []);

        return ApiResponse::ok(
            new ChangePackageResource($this->repo->findPackage($id)),
            'Paket berhasil disubmit untuk persetujuan.',
        );
    }

    public function approve(DecideChangePackageRequest $request, int $id): JsonResponse
    {
        $this->authorize('change.initiation.approve');

        $package = $this->repo->findPackage($id);

        if (! $package) {
            return ApiResponse::fail('Paket perubahan tidak ditemukan.', 404);
        }

        return ApiResponse::ok(
            new ChangePackageResource(
                $this->decisions->decide($package, $request->user(), approve: true),
            ),
            'Paket perubahan berhasil disetujui.',
        );
    }

    public function reject(DecideChangePackageRequest $request, int $id): JsonResponse
    {
        $this->authorize('change.initiation.reject');

        $package = $this->repo->findPackage($id);

        if (! $package) {
            return ApiResponse::fail('Paket perubahan tidak ditemukan.', 404);
        }

        return ApiResponse::ok(
            new ChangePackageResource(
                $this->decisions->decide($package, $request->user(), approve: false),
            ),
            'Paket perubahan ditolak.',
        );
    }

    public function uploadAttachments(UploadChangePackageAttachmentsRequest $request, int $id): JsonResponse
    {
        $this->authorize('change.implementation.update');

        $package = $this->repo->findPackage($id);

        if (! $package) {
            return ApiResponse::fail('Paket perubahan tidak ditemukan.', 404);
        }

        if ($package->initiator_id !== $request->user()->id) {
            return ApiResponse::fail('Hanya inisiator yang dapat mengunggah lampiran.', 403);
        }

        if ($package->status !== 'draft') {
            return ApiResponse::fail('Hanya paket draft yang dapat dilampirkan.');
        }

        $paths = [];
        foreach ($request->file('files', []) as $file) {
            $paths[] = $file->store('change-attachments', 'public');
        }

        $this->repo->addAttachments($package->implementation->id, $paths);

        $attachments = $package->implementation->fresh('attachments')->attachments;

        return ApiResponse::ok(
            AttachmentResource::collection($attachments),
            'Lampiran berhasil diunggah.',
        );
    }

    /**
     * Uniform list clamp: per_page is bounded to 1..100 (SPEC-envelope item 3).
     */
    private static function perPage(Request $request): int
    {
        return min(max($request->integer('per_page', 15), 1), 100);
    }
}

<?php

namespace App\Domains\ChangeManagement\Http\Controllers;

use App\Domains\ChangeManagement\Http\Requests\DecideChangePackageRequest;
use App\Domains\ChangeManagement\Http\Requests\StoreChangePackageRequest;
use App\Domains\ChangeManagement\Http\Requests\SubmitChangePackageRequest;
use App\Domains\ChangeManagement\Http\Requests\UpdateChangePackageRequest;
use App\Domains\ChangeManagement\Http\Requests\UploadChangePackageAttachmentsRequest;
use App\Domains\ChangeManagement\Http\Resources\ChangePackageResource;
use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\ChangeManagement\Repositories\ChangeManagementRepositoryInterface;
use App\Domains\ChangeManagement\Services\DocNumberGenerator;
use App\Models\User;
use App\Support\Constants\Roles;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ChangePackageController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private ChangeManagementRepositoryInterface $repo,
        private DocNumberGenerator $docNumberGenerator,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('change.initiation.view');

        $page = $this->repo->paginatePackages(
            perPage: (int) $request->input('per_page', 15),
            filters: $request->only(['status', 'field_id']),
            actor: $request->user(),
        );

        return response()->json([
            'success' => true,
            'data' => ChangePackageResource::collection($page->items()),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
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

        return response()->json([
            'success' => true,
            'message' => 'Draft paket perubahan berhasil dibuat.',
            'data' => new ChangePackageResource($package),
        ], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->authorize('change.initiation.view');

        $package = $this->repo->findPackage($id);

        if (! $package) {
            return response()->json([
                'success' => false,
                'message' => 'Paket perubahan tidak ditemukan.',
            ], 404);
        }

        if (! $this->actorCanAccessPackage($request->user(), $package)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke paket ini.',
            ], 403);
        }

        return response()->json([
            'success' => true,
            'data' => new ChangePackageResource($package),
        ]);
    }

    public function update(UpdateChangePackageRequest $request, int $id): JsonResponse
    {
        $this->authorize('change.initiation.update');

        $package = $this->repo->findPackage($id);

        if (! $package) {
            return response()->json([
                'success' => false,
                'message' => 'Paket perubahan tidak ditemukan.',
            ], 404);
        }

        if ($package->initiator_id !== $request->user()->id) {
            return response()->json([
                'success' => false,
                'message' => 'Hanya inisiator yang dapat mengubah paket.',
            ], 403);
        }

        if ($package->status !== 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Hanya paket draft yang dapat diubah.',
            ], 422);
        }

        $updated = $this->repo->updatePackage(
            id: $id,
            initiation: $request->input('initiation', []),
            implementation: $request->input('implementation', []),
            typeIds: $request->input('implementation.change_type_ids', []),
        );

        return response()->json([
            'success' => true,
            'message' => 'Paket perubahan berhasil diubah.',
            'data' => new ChangePackageResource($updated),
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->authorize('change.initiation.update');

        $package = $this->repo->findPackage($id);

        if (! $package) {
            return response()->json([
                'success' => false,
                'message' => 'Paket perubahan tidak ditemukan.',
            ], 404);
        }

        if ($package->initiator_id !== $request->user()->id) {
            return response()->json([
                'success' => false,
                'message' => 'Hanya inisiator yang dapat menghapus paket.',
            ], 403);
        }

        if ($package->status !== 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Hanya paket draft yang dapat dihapus.',
            ], 422);
        }

        $this->repo->deletePackage($id);

        return response()->json([
            'success' => true,
            'message' => 'Paket perubahan berhasil dihapus.',
        ]);
    }

    public function submit(SubmitChangePackageRequest $request, int $id): JsonResponse
    {
        $this->authorize('change.initiation.submit');

        $package = $this->repo->findPackage($id);

        if (! $package) {
            return response()->json([
                'success' => false,
                'message' => 'Paket perubahan tidak ditemukan.',
            ], 404);
        }

        if ($package->initiator_id !== $request->user()->id) {
            return response()->json([
                'success' => false,
                'message' => 'Hanya inisiator yang dapat mensubmit paket.',
            ], 403);
        }

        if ($package->status !== 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Hanya paket draft yang dapat disubmit.',
            ], 422);
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

        return response()->json([
            'success' => true,
            'message' => 'Paket berhasil disubmit untuk persetujuan.',
            'data' => new ChangePackageResource($this->repo->findPackage($id)),
        ]);
    }

    public function approve(DecideChangePackageRequest $request, int $id): JsonResponse
    {
        $this->authorize('change.initiation.approve');

        $package = $this->repo->findPackage($id);

        if (! $package) {
            return response()->json([
                'success' => false,
                'message' => 'Paket perubahan tidak ditemukan.',
            ], 404);
        }

        if ($package->initiator_id === $request->user()->id) {
            return response()->json([
                'success' => false,
                'message' => 'Inisiator tidak dapat menyetujui paketnya sendiri.',
            ], 422);
        }

        if ($package->status !== 'pending') {
            return response()->json([
                'success' => false,
                'message' => 'Hanya paket pending yang dapat disetujui.',
            ], 422);
        }

        if (! $this->actorCanAccessPackage($request->user(), $package)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke paket ini.',
            ], 403);
        }

        $now = now();
        $userId = $request->user()->id;

        $this->repo->transitionPackage($id, 'approved', [
            'reviewer_id' => $userId,
            'review_status' => 'approved',
            'reviewed_at' => $now,
        ], [
            'reviewer_id' => $userId,
            'reviewer_signed_at' => $now,
            'responsible_id' => $userId,
            'responsible_signed_at' => $now,
            'review_status' => 'diterima',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Paket perubahan berhasil disetujui.',
            'data' => new ChangePackageResource($this->repo->findPackage($id)),
        ]);
    }

    public function reject(DecideChangePackageRequest $request, int $id): JsonResponse
    {
        $this->authorize('change.initiation.reject');

        $package = $this->repo->findPackage($id);

        if (! $package) {
            return response()->json([
                'success' => false,
                'message' => 'Paket perubahan tidak ditemukan.',
            ], 404);
        }

        if ($package->initiator_id === $request->user()->id) {
            return response()->json([
                'success' => false,
                'message' => 'Inisiator tidak dapat menolak paketnya sendiri.',
            ], 422);
        }

        if ($package->status !== 'pending') {
            return response()->json([
                'success' => false,
                'message' => 'Hanya paket pending yang dapat ditolak.',
            ], 422);
        }

        if (! $this->actorCanAccessPackage($request->user(), $package)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke paket ini.',
            ], 403);
        }

        $userId = $request->user()->id;
        $now = now();

        $this->repo->transitionPackage($id, 'rejected', [
            'reviewer_id' => $userId,
            'review_status' => 'rejected',
            'reviewed_at' => $now,
        ], [
            'reviewer_id' => $userId,
            'reviewer_signed_at' => $now,
            'review_status' => 'ditolak',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Paket perubahan ditolak.',
            'data' => new ChangePackageResource($this->repo->findPackage($id)),
        ]);
    }

    public function uploadAttachments(UploadChangePackageAttachmentsRequest $request, int $id): JsonResponse
    {
        $this->authorize('change.implementation.update');

        $package = $this->repo->findPackage($id);

        if (! $package) {
            return response()->json([
                'success' => false,
                'message' => 'Paket perubahan tidak ditemukan.',
            ], 404);
        }

        if ($package->status !== 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Hanya paket draft yang dapat dilampirkan.',
            ], 422);
        }

        if (! $package->implementation) {
            return response()->json([
                'success' => false,
                'message' => 'Implementasi tidak ditemukan.',
            ], 404);
        }

        $paths = [];
        foreach ($request->file('files', []) as $file) {
            $paths[] = $file->store('change-attachments', 'public');
        }

        $this->repo->addAttachments($package->implementation->id, $paths);

        return response()->json([
            'success' => true,
            'message' => 'Lampiran berhasil diunggah.',
            'data' => $package->implementation->fresh('attachments')->attachments,
        ]);
    }

    /**
     * Single source of truth for package visibility. Mirrors paginatePackages scope:
     * admin = all, kepala_tim/kepala_bidang = same team, staf = own.
     */
    private function actorCanAccessPackage(User $actor, ChangeInitiation $package): bool
    {
        if ($actor->hasRole(Roles::ADMIN)) {
            return true;
        }

        if ($actor->hasAnyRole([Roles::KEPALA_TIM, Roles::KEPALA_BIDANG])) {
            return $actor->team_id !== null
                && $actor->team_id === $package->initiator?->team_id;
        }

        return $package->initiator_id === $actor->id;
    }
}

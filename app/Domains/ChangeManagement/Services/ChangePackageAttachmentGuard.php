<?php

namespace App\Domains\ChangeManagement\Services;

use App\Domains\ChangeManagement\Models\ChangeImplementationAttachment;
use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\ChangeManagement\Repositories\ChangeManagementRepositoryInterface;
use App\Exceptions\ApiException;
use App\Models\User;

/**
 * Single definition of the attachment guards shared by upload and delete:
 * initiator-only, draft-only, attachment-belongs-to-package, and the spec cap
 * of 10 attachments per implementation. Both actions and any future caller
 * therefore share one guard order: 404 package (controller) → 403 initiator →
 * 422 draft → 404 attachment.
 */
final class ChangePackageAttachmentGuard
{
    /** Spec cap (SPEC-change-package.md): total lampiran per implementasi. */
    public const MAX_ATTACHMENTS = 10;

    public function __construct(
        private ChangeManagementRepositoryInterface $repo,
    ) {}

    /**
     * @param  string  $action  Verb in the refusal message ("mengunggah"/"menghapus").
     */
    public function assertMayMutate(ChangeInitiation $package, User $actor, string $action): void
    {
        if ($package->initiator_id !== $actor->id) {
            throw new ApiException("Hanya inisiator yang dapat {$action} lampiran.", 403);
        }

        if ($package->status !== 'draft') {
            throw new ApiException("Hanya paket draft yang dapat {$action} lampiran.", 422);
        }
    }

    /**
     * Resolve an attachment named in the URL against the package named in the
     * URL: an attachment of another package is a 404, not a 403, because the
     * caller has no business knowing it exists.
     */
    public function attachmentOf(ChangeInitiation $package, int $attachmentId): ChangeImplementationAttachment
    {
        $attachment = $package->implementation?->attachments()
            ->where('id', $attachmentId)
            ->first();

        if (! $attachment) {
            throw new ApiException('Lampiran tidak ditemukan.', 404);
        }

        return $attachment;
    }

    /**
     * The FormRequest caps ONE request at 10 files; the spec cap is on the
     * implementation's total, so successive batches must not bypass it.
     */
    public function assertUploadFitsCap(ChangeInitiation $package, int $incomingCount): void
    {
        $existing = $package->implementation->attachments()->count();

        if ($existing + $incomingCount > self::MAX_ATTACHMENTS) {
            throw new ApiException('Maksimal 10 lampiran.', 422);
        }
    }

    public function deleteDraftAttachment(ChangeInitiation $package, User $actor, int $attachmentId): void
    {
        $this->assertMayMutate($package, $actor, 'menghapus');

        $this->repo->deleteAttachment($this->attachmentOf($package, $attachmentId));
    }
}

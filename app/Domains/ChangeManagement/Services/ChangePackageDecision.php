<?php

namespace App\Domains\ChangeManagement\Services;

use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\ChangeManagement\Repositories\ChangeManagementRepositoryInterface;
use App\Exceptions\ApiException;
use App\Models\User;

/**
 * Single definition of the approve/reject decision: guard in shipped order
 * (pending 422 → access 403 via packageVisibleTo → self 403) then transition
 * and reload. Behavior-frozen by the dedup-state module — no status, message,
 * or guard-order change vs. the pre-refactor controller.
 */
final class ChangePackageDecision
{
    public function __construct(
        private ChangeManagementRepositoryInterface $repo,
    ) {}

    public function decide(
        ChangeInitiation $package,
        User $actor,
        bool $approve,
        string $reason = '',
    ): ChangeInitiation {
        if ($package->status !== 'pending') {
            throw new ApiException(
                $approve
                    ? 'Hanya paket pending yang dapat disetujui.'
                    : 'Hanya paket pending yang dapat ditolak.',
                422,
            );
        }

        if (! $this->repo->packageVisibleTo($package->id, $actor)) {
            throw new ApiException('Anda tidak memiliki akses ke paket ini.', 403);
        }

        if ($package->initiator_id === $actor->id) {
            throw new ApiException(
                $approve
                    ? 'Inisiator tidak dapat menyetujui paketnya sendiri.'
                    : 'Inisiator tidak dapat menolak paketnya sendiri.',
                403,
            );
        }

        $now = now();
        $userId = $actor->id;

        if ($approve) {
            $this->repo->transitionPackage($package->id, 'approved', [
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
        } else {
            $this->repo->transitionPackage($package->id, 'rejected', [
                'reviewer_id' => $userId,
                'review_status' => 'rejected',
                'reviewed_at' => $now,
            ], [
                'reviewer_id' => $userId,
                'reviewer_signed_at' => $now,
                'review_status' => 'ditolak',
            ]);
        }

        return $this->repo->findPackage($package->id);
    }
}

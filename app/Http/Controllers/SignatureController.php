<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\Constants\Roles;
use App\Support\Http\ApiResponse;
use App\Support\Signature\SignaturePath;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Symfony\Component\HttpFoundation\Response;

/**
 * Serves e-signature images from the private disk. Signatures embed real
 * names/NIPs into documents, so they are never web-served statically: a
 * viewer must be authenticated, and a signature is only shown to its owner
 * (self or user.manage) or — inside an approval flow — to a kepala_* of the
 * same bidang.
 */
class SignatureController extends Controller
{
    public function show(Request $request, User $user): Response|JsonResponse
    {
        $actor = $request->user();

        $isSelf = $actor->id === $user->id;
        $isManager = $actor->can('user.manage');

        if (! $isSelf && ! $isManager) {
            $actor->loadMissing('team.field');
            $user->loadMissing('team.field');

            $actorField = $actor->team?->field?->id;
            $userField = $user->team?->field?->id;

            /*
             * Gate on a permission, not on a role name (ship review SEC-02):
             * role literals silently grant read access to any holder of
             * kepala_tim/kepala_bidang regardless of whether that user has any
             * approval duty. wfh.monitoring.view is the existing "may inspect
             * other people's report material" permission, held by exactly the
             * roles that need it; the role+field check stays as a second,
             * narrowing condition.
             */
            $sameFieldKepala = $actor->can('wfh.monitoring.view')
                && $actor->hasRole([Roles::KEPALA_TIM, Roles::KEPALA_BIDANG])
                && $actorField !== null
                && $actorField === $userField;

            if (! $sameFieldKepala) {
                return ApiResponse::fail('Anda tidak memiliki akses ke tanda tangan ini.', 403);
            }
        }

        if (! SignaturePath::exists($user->signature_path)) {
            return ApiResponse::fail('Tanda tangan tidak ditemukan.', 404);
        }

        // Same reasoning as the attachment stream: BinaryFileResponse would
        // otherwise append "public" alongside our "no-store".
        return response()
            ->file(SignaturePath::resolve($user->signature_path), [
                'Content-Type' => 'image/png',
                'Cache-Control' => 'no-store',
            ])
            ->setPrivate();
    }
}

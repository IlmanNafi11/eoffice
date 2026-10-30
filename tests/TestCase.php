<?php

namespace Tests;

use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    /**
     * Give a user a real signature file on the private disk so PDF export can
     * resolve it (signature_path may otherwise be null in tests).
     */
    protected function setUserSignature(User $user): User
    {
        $path = "signatures/{$user->id}.png";

        $dir = storage_path('app/signatures');
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        file_put_contents(storage_path('app/'.$path), 'dummy-signature');

        $user->update(['signature_path' => $path]);

        return $user->fresh();
    }
}

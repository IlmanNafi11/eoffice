<?php

namespace Tests\Feature\Support;

use Dompdf\Dompdf;
use Dompdf\Options;
use Tests\TestCase;

/**
 * Ship #23 (temuan test-engineer): hardening `config/dompdf.php` —
 * `allowed_protocols` hanya `data://` dan `https://` — tidak punya penguji,
 * dan hardening ship #22 ternyata NO-OP: kunci ditaruh di level atas
 * `config/dompdf.php` padahal provider paket hanya membaca `dompdf.options`,
 * sehingga file:// dan http:// tetap hidup di runtime. Penguji ini mengunci
 * OPSI EFEKTIF Dompdf\Options (bukan `config()` mentah) agar pergeseran
 * nesting semacam itu gagal merah, bukan lolos.
 */
class DompdfConfigTest extends TestCase
{
    public function test_effective_allowed_protocols_exclude_file_and_http(): void
    {
        $protocols = array_keys($this->effectiveOptions()->getAllowedProtocols());

        $this->assertContains('data://', $protocols);
        $this->assertContains('https://', $protocols);
        $this->assertNotContains('file://', $protocols, 'file:// access must stay disabled for the PDF renderer.');
        $this->assertNotContains('http://', $protocols, 'Plaintext http fetches must stay disabled for the PDF renderer.');
    }

    public function test_remote_fetching_stays_disabled(): void
    {
        $this->assertFalse(
            $this->effectiveOptions()->getIsRemoteEnabled(),
            'Remote asset fetching must stay disabled.',
        );
    }

    /** Opsi Dompdf persis seperti yang dilihat renderer saat render. */
    private function effectiveOptions(): Options
    {
        return (new Dompdf($this->app->make('dompdf.options')))->getOptions();
    }
}

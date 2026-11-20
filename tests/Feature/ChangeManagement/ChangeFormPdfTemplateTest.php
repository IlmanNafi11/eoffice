<?php

namespace Tests\Feature\ChangeManagement;

use App\Support\Pdf\PdfImage;
use Tests\TestCase;

class ChangeFormPdfTemplateTest extends TestCase
{
    private function initiationData(): array
    {
        return [
            'docNumber' => '706/9/1.1/114/2018',
            'tanggal' => '08 Maret 2026',
            'bidang' => 'Aplikasi Informatika',
            'neededByDate' => '08 Maret 2026',
            'description' => 'Integrasi modul Mudik Gratis',
            'reason' => 'Memfasilitasi akses layanan',
            'initiatorName' => 'I WAYAN RUDY ARTHA',
            'initiatorNip' => '197705172009011005',
            'initiatorPosition' => 'Pranata Komputer Ahli Muda',
            'initiatorSig' => 'data:image/png;base64,AAAA',
            'reviewerName' => 'REVIEWER',
            'reviewerNip' => '1',
            'reviewerPosition' => 'Kepala Tim',
            'reviewerSig' => 'data:image/png;base64,AAAA',
            'qrSvg' => '<svg></svg>',
            'logoDoc' => PdfImage::dataUri('images/logo-doc.webp'),
        ];
    }

    public function test_initiation_template_has_letterhead_logo_and_no_legal_clause(): void
    {
        $html = view('pdf.change-initiation', $this->initiationData())->render();

        $this->assertStringContainsString('data:image/webp;base64,', $html);
        $this->assertStringContainsString('PEMERINTAH PROVINSI JAWA TIMUR', $html);
        $this->assertStringContainsString('DINAS KOMUNIKASI DAN INFORMATIKA', $html);
        $this->assertStringContainsString('FORMULIR INISIASI PERUBAHAN', $html);
        $this->assertStringContainsString('INISIATOR PERUBAHAN', $html);
        $this->assertStringContainsString('Aplikasi Informatika', $html);
        $this->assertStringNotContainsString('ditandatangani secara elektronik', $html);
        $this->assertStringNotContainsString('BSrE-BSSN', $html);
    }
}

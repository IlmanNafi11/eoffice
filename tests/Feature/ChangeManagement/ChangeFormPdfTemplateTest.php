<?php

namespace Tests\Feature\ChangeManagement;

use App\Support\Pdf\PdfImage;
use App\Support\Pdf\PdfRendererService;
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

    private function implementationData(): array
    {
        return [
            'docNumber' => '706/9/1.1/114/2018',
            'tanggal' => '08 Maret 2026',
            'bidang' => 'Aplikasi Informatika',
            'description' => 'Integrasi modul Mudik Gratis',
            'priority' => 'emergency',
            'impact' => 'Mayor',
            'productionImpact' => 'Lingkungan produksi',
            'requiredEffort' => 'Deploy',
            'costNeeded' => 'Tidak',
            'costAmount' => '-',
            'resources' => '2 personil',
            'testPlan' => 'Uji tampilan',
            'changeTypes' => 'Aplikasi',
            'reviewStatus' => 'diterima',
            'reviewResponse' => 'Disetujui',
            'executionDate' => '08 Maret 2026',
            'responsibleTeamName' => 'Tim Aplikasi',
            'implementationResult' => 'Rilis',
            'attachmentImages' => [],
            'releaseDate' => '19 Maret 2026',
            'evaluatorName' => 'EVALUATOR',
            'evaluatorNip' => '1',
            'evaluatorPosition' => 'Aptika',
            'evaluatorSig' => 'data:image/png;base64,AAAA',
            'reviewerName' => 'REVIEWER',
            'reviewerNip' => '2',
            'reviewerPosition' => 'Prakom',
            'reviewerSig' => 'data:image/png;base64,AAAA',
            'responsibleName' => 'PENANGGUNG',
            'responsibleNip' => '3',
            'responsiblePosition' => 'Dev',
            'responsibleSig' => 'data:image/png;base64,AAAA',
            'logoDoc' => PdfImage::dataUri('images/logo-doc.webp'),
            'isNormalPriority' => false,
            'isEmergencyPriority' => true,
            'isMinorImpact' => false,
            'isMayorImpact' => true,
            'isAccepted' => true,
            'isRejected' => false,
        ];
    }

    public function test_implementation_template_is_two_pages_with_logo_and_checkboxes(): void
    {
        $html = view('pdf.change-implementation', $this->implementationData())->render();

        $this->assertStringContainsString('data:image/webp;base64,', $html);
        $this->assertStringContainsString('PEMERINTAH PROVINSI JAWA TIMUR', $html);
        $this->assertStringContainsString('DINAS KOMUNIKASI DAN INFORMATIKA', $html);
        $this->assertStringContainsString('FORMULIR PERSETUJUAN PERUBAHAN', $html);
        $this->assertStringContainsString('Berdasarkan Inisiasi Bidang', $html);
        $this->assertStringContainsString('EVALUASI DAMPAK PERUBAHAN', $html);
        $this->assertStringContainsString('TINJAUAN PERUBAHAN', $html);
        $this->assertStringContainsString('IMPLEMENTASI PERUBAHAN', $html);
        $this->assertStringContainsString('page-break-before', $html);
        $this->assertStringNotContainsString('ditandatangani secara elektronik', $html);
        $this->assertStringNotContainsString('BSrE-BSSN', $html);
    }

    public function test_implementation_pdf_renders_exactly_two_pages(): void
    {
        $pdf = app(PdfRendererService::class)->render('pdf.change-implementation', $this->implementationData());

        $this->assertSame(2, preg_match_all('/\/Type\s*\/Page\b(?!s)/', $pdf));
    }
}

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

    public function test_initiation_signature_image_renders_inside_the_box_without_negative_offset(): void
    {
        $html = view('pdf.change-initiation', $this->initiationData())->render();

        $this->assertStringNotContainsString('top:-55px', $html);
        $this->assertStringNotContainsString('top: -55px', $html);
        $this->assertDoesNotMatchRegularExpression(
            '/\.signature-box\s+img\s*\{[^}]*position:\s*absolute/',
            $html,
            'Signature image must not be absolutely positioned out of the box.',
        );
        $this->assertMatchesRegularExpression('/\.signature-box\s*\{[^}]*display:\s*flex/', $html);
        $this->assertMatchesRegularExpression('/\.signature-box\s*\{[^}]*align-items:\s*flex-end/', $html);
        $this->assertMatchesRegularExpression('/\.signature-box\s*\{[^}]*justify-content:\s*center/', $html);
        $this->assertMatchesRegularExpression('/\.signature-box\s+img\s*\{[^}]*max-height:\s*65px/', $html);
        $this->assertMatchesRegularExpression('/\.signature-role\s*\{[^}]*margin-bottom:\s*8px/', $html);
        $this->assertMatchesRegularExpression('/signature-box">\s*<img src="/', $html);
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
            'changeTypes' => ['Aplikasi'],
            'reviewStatus' => 'diterima',
            'reviewResponse' => 'Disetujui',
            'executionDate' => '08 Maret 2026',
            'responsibleTeamName' => 'Tim Aplikasi',
            'implementationResult' => 'Rilis',
            'attachmentImages' => [],
            'releaseDate' => '19 Maret 2026',
            'evaluatorName' => 'I WAYAN RUDY ARTHA',
            'evaluatorNip' => '197705172009011005',
            'evaluatorPosition' => 'Pranata Komputer Ahli Muda',
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

    public function test_implementation_template_has_single_meta_block_after_initiation_reference(): void
    {
        $html = view('pdf.change-implementation', $this->implementationData())->render();

        // The number/date/page block belongs to the bordered form header beside
        // the title; the reference table below "Berdasarkan Inisiasi Bidang"
        $this->assertSame(1, substr_count($html, '<strong>No.</strong>'));
        $this->assertSame(0, substr_count($html, '<strong>Nomor</strong>'));
        $this->assertSame(1, substr_count($html, '<strong>Tanggal</strong>'));
        $this->assertSame(1, substr_count($html, '<strong>Halaman</strong>'));
        $this->assertSame(1, substr_count($html, 'Berdasarkan Inisiasi Bidang'));
    }

    public function test_implementation_template_checks_selected_change_types_only(): void
    {
        $data = $this->implementationData();
        $data['changeTypes'] = ['Aplikasi', 'Network'];

        $html = view('pdf.change-implementation', $data)->render();

        foreach (['Hardware', 'Network', 'Software', 'Utilities', 'Aplikasi', 'Prosedur', 'Operating System', 'Personil'] as $type) {
            $this->assertStringContainsString($type, $html);
        }

        $this->assertStringContainsString('data-option="Aplikasi">[v]</td>', $html);
        $this->assertStringContainsString('data-option="Network">[v]</td>', $html);
        foreach (['Hardware', 'Software', 'Utilities', 'Prosedur', 'Operating System', 'Personil'] as $type) {
            $this->assertStringContainsString('data-option="'.$type.'">[ ]</td>', $html);
        }
    }

    public function test_implementation_template_renders_priority_and_impact_as_checkbox_grids(): void
    {
        $html = view('pdf.change-implementation', $this->implementationData())->render();

        $this->assertStringContainsString('data-option="Normal">[ ]</td>', $html);
        $this->assertStringContainsString('data-option="Emergency">[v]</td>', $html);
        $this->assertStringContainsString('data-option="Minor">[ ]</td>', $html);
        $this->assertStringContainsString('data-option="Mayor">[v]</td>', $html);
    }

    public function test_implementation_template_renders_signing_identity_in_three_column_rows(): void
    {
        $html = view('pdf.change-implementation', $this->implementationData())->render();

        foreach (['Dievaluasi Oleh', 'Ditinjau Oleh', 'Penanggungjawab Pelaksana Perubahan'] as $section) {
            $this->assertStringContainsString($section, $html);
        }

        foreach (['Nama', 'Bidang', 'Jabatan', 'Tanda Tangan'] as $label) {
            $this->assertStringContainsString($label, $html);
        }

        $this->assertStringContainsString('I WAYAN RUDY ARTHA', $html);
        $this->assertStringContainsString('REVIEWER', $html);
        $this->assertStringContainsString('PENANGGUNG', $html);
        $this->assertMatchesRegularExpression(
            '/<td class="signature">\s*<div class="signature-label">Tanda Tangan<\/div>\s*<img/',
            $html,
        );
        $this->assertSame(3, substr_count($html, 'class="signature-label"'));
    }

    public function test_implementation_template_embeds_signature_image_in_each_identity_row(): void
    {
        $html = view('pdf.change-implementation', $this->implementationData())->render();

        // Each signing identity row (Dievaluasi/Ditinjau/Penanggungjawab) must
        // embed its own signature image once. There is no separate horizontal
        // signature strip below the tables.
        $this->assertSame(3, substr_count($html, 'data:image/png;base64,AAAA'));
        $this->assertStringNotContainsString('signature-block', $html);
        $this->assertStringNotContainsString('sig-table', $html);
        $this->assertStringNotContainsString('sig-role', $html);
    }

    public function test_implementation_template_renders_production_impact_not_description(): void
    {
        $html = view('pdf.change-implementation', $this->implementationData())->render();

        // "Dampak Terhadap Lingkungan Produksi" must show production_impact,
        // not the initiation description.
        $this->assertStringContainsString('Lingkungan produksi', $html);
        $this->assertStringNotContainsString('Integrasi modul Mudik Gratis', $html);
    }

    public function test_implementation_pdf_renders_exactly_two_pages(): void
    {
        $pdf = app(PdfRendererService::class)->render('pdf.change-implementation', $this->implementationData());

        $this->assertSame(2, preg_match_all('/\/Type\s*\/Page\b(?!s)/', $pdf));
    }
}

<?php

namespace Tests\Feature\Wfh;

use App\Support\Pdf\PdfImage;
use Tests\TestCase;

class WfhReportPdfTemplateTest extends TestCase
{
    private function data(): array
    {
        return [
            'nama' => 'Budi Santoso',
            'nip' => '199001012023011001',
            'pangkat' => 'Penata Muda',
            'jabatan' => 'Pranata Komputer',
            'unitKerja' => 'Bidang Aplikasi Informatika',
            'tanggalPelaksanaan' => '03 Juli 2026',
            'kegiatan' => [['waktu' => '07.30 – 08.30', 'kegiatan' => 'Rapat', 'links' => ['https://example.test/a']]],
            'isApproved' => true,
            'signatureMakerPath' => null,
            'signatureSupervisorPath' => null,
            'makerName' => 'BUDI SANTOSO',
            'makerNip' => '199001012023011001',
            'supervisorName' => 'ATASAN',
            'supervisorNip' => '198210162011011005',
            'qrSvg' => null,
            'logoDoc' => PdfImage::dataUri('images/logo-doc.webp'),
        ];
    }

    public function test_template_renders_the_letterhead_logo(): void
    {
        $html = view('pdf.wfh-report', $this->data())->render();

        $this->assertStringContainsString('data:image/webp;base64,', $html);
        $this->assertStringContainsString('PEMERINTAH PROVINSI JAWA TIMUR', $html);
        $this->assertStringContainsString('DINAS KOMUNIKASI DAN INFORMATIKA', $html);
        $this->assertStringContainsString('LAPORAN PELAKSANAAN TUGAS', $html);
        $this->assertStringNotContainsString('LOGO<br>', $html);
    }

    public function test_letterhead_uses_table_with_vertically_aligned_logo_and_text(): void
    {
        $html = view('pdf.wfh-report', $this->data())->render();

        $this->assertStringContainsString('<table class="kop-surat">', $html);
        $this->assertMatchesRegularExpression('/\.kop-surat td\s*\{\s*vertical-align:\s*middle;/', $html);
        $this->assertStringNotContainsString('display: flex', $html);
    }

    public function test_signature_date_sits_directly_above_supervisor_column(): void
    {
        $html = view('pdf.wfh-report', $this->data())->render();

        // Tanggal harus berada di dalam sel kanan signature-table (induk
        // dari label "Atasan Langsung"), bukan baris full-width di luar tabel.
        $this->assertMatchesRegularExpression(
            '/<td class="atasan">\s*<div class="tanggal">Surabaya, .*?<\/div>.*?Atasan Langsung/s',
            $html,
        );
    }

    public function test_template_omits_the_electronic_signature_legal_paragraph(): void
    {
        $html = view('pdf.wfh-report', $this->data())->render();

        $this->assertStringNotContainsString('ditandatangani secara elektronik', $html);
        $this->assertStringNotContainsString('BSrE-BSSN', $html);
    }
}

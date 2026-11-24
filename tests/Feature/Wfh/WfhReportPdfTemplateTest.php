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
        // Guard 0baf1ea: kop surat harus table-based, bukan flex (unreliable
        // di DOMPDF). Cakupan pada blok CSS .kop-surat saja — signature-box
        // (T8) memakai flex tersendiri.
        $this->assertDoesNotMatchRegularExpression(
            '/\.kop-surat\s*\{[^}]*flex/',
            $html,
        );
    }

    public function test_signature_date_sits_directly_above_supervisor_column(): void
    {
        $html = view('pdf.wfh-report', $this->data())->render();

        // Tanggal berada di baris tabel khusus di atas kolom kanan (sel
        // `atasan`) — bukan di dalam sel label "Atasan Langsung".
        $this->assertMatchesRegularExpression(
            '/<tr>\s*<td><\/td>\s*<td class="atasan">\s*<div class="tanggal">Surabaya, .*?<\/div>\s*<\/td>\s*<\/tr>/s',
            $html,
        );
    }

    public function test_maker_and_supervisor_labels_share_one_table_row(): void
    {
        $html = view('pdf.wfh-report', $this->data())->render();

        // Kedua label tanda tangan berada di <tr> yang SAMA: tidak ada konten
        // apa pun di antara keduanya (regresi keselarasan horizontal).
        $this->assertMatchesRegularExpression(
            '/<tr>\s*<td>\s*<div class="signature-role">Yang Membuat Laporan<\/div>.*?<\/td>\s*<td>\s*<div class="signature-role">Atasan Langsung<\/div>/s',
            $html,
        );
        // Tanggal harus berada SEBELUM baris label — tidak menyelip di antara
        // keduanya.
        // `strrpos`: kop surat juga menyebut "Surabaya," — posisi yang
        // relevan adalah kemunculan di blok tanda tangan (akhir dokumen).
        $datePos = strrpos($html, 'Surabaya,');
        $makerPos = strrpos($html, 'Yang Membuat Laporan');
        $supervisorPos = strrpos($html, 'Atasan Langsung');
        $this->assertNotFalse($datePos);
        $this->assertNotFalse($makerPos);
        $this->assertNotFalse($supervisorPos);
        $this->assertTrue($datePos < $makerPos && $makerPos < $supervisorPos);
    }

    public function test_template_omits_the_electronic_signature_legal_paragraph(): void
    {
        $html = view('pdf.wfh-report', $this->data())->render();

        $this->assertStringNotContainsString('ditandatangani secara elektronik', $html);
        $this->assertStringNotContainsString('BSrE-BSSN', $html);
    }

    private function assertSignatureImageSitsInsideTheBox(string $html): void
    {
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
        // img berada di dalam .signature-box (regresi M1).
        $this->assertMatchesRegularExpression('/signature-box">\s*<img src="/', $html);
    }

    public function test_signature_image_renders_inside_the_box_without_negative_offset(): void
    {
        $html = view('pdf.wfh-report', $this->data())->render();

        $this->assertSignatureImageSitsInsideTheBox($html);
    }

    public function test_admin_signature_image_renders_inside_the_box_without_negative_offset(): void
    {
        $html = view('pdf.wfh-report-admin', array_merge($this->data(), [
            'namaTim' => 'Tim Test',
            'staff' => [['name' => 'USER A', 'nip' => '1', 'links' => []]],
            'sessions' => ['pagi' => [], 'siang' => [], 'sore' => []],
        ]))->render();

        $this->assertSignatureImageSitsInsideTheBox($html);
    }

    private function adminData(): array
    {
        return array_merge($this->data(), [
            'namaTim' => 'Tim Test',
            'staff' => [['name' => 'USER A', 'nip' => '1', 'links' => []]],
            'sessions' => ['pagi' => [], 'siang' => [], 'sore' => []],
        ]);
    }

    public function test_team_letterhead_uses_table_with_vertically_aligned_logo_and_text(): void
    {
        $html = view('pdf.wfh-report-admin', $this->adminData())->render();

        $this->assertStringContainsString('<table class="kop-surat">', $html);
        $this->assertMatchesRegularExpression('/\.kop-surat td\s*\{\s*vertical-align:\s*middle;/', $html);
        // Kop surat tim harus table-based, bukan flex (unreliable di DOMPDF) —
        // cakupan pada blok CSS .kop-surat saja.
        $this->assertDoesNotMatchRegularExpression(
            '/\.kop-surat\s*\{[^}]*flex/',
            $html,
        );
    }

    public function test_team_signature_date_sits_directly_above_supervisor_column(): void
    {
        $html = view('pdf.wfh-report-admin', $this->adminData())->render();

        // Tanggal berada di baris tabel khusus di atas kolom kanan (sel
        // `atasan`) — bukan di dalam sel label "Atasan Langsung".
        $this->assertMatchesRegularExpression(
            '/<tr>\s*<td><\/td>\s*<td class="atasan">\s*<div class="tanggal">Surabaya, .*?<\/div>\s*<\/td>\s*<\/tr>/s',
            $html,
        );
        // Kedua label tanda tangan berada di <tr> yang SAMA.
        $this->assertMatchesRegularExpression(
            '/<tr>\s*<td>\s*<div class="signature-role">Yang Membuat Laporan<\/div>.*?<\/td>\s*<td>\s*<div class="signature-role">Atasan Langsung<\/div>/s',
            $html,
        );
        // Tanggal berada SEBELUM baris label; blok footer tanggal lama tidak
        // boleh ikut merender (tanggal hanya di dalam tabel tanda tangan).
        $this->assertStringNotContainsString('<div class="footer-bar">', $html);
        $datePos = strrpos($html, 'Surabaya,');
        $makerPos = strrpos($html, 'Yang Membuat Laporan');
        $supervisorPos = strrpos($html, 'Atasan Langsung');
        $this->assertNotFalse($datePos);
        $this->assertNotFalse($makerPos);
        $this->assertNotFalse($supervisorPos);
        $this->assertTrue($datePos < $makerPos && $makerPos < $supervisorPos);
    }
}

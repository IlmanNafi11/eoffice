<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @page { margin: 25px 35px; size: A4; }
        * { box-sizing: border-box; }
        body { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 10px; color: #000; line-height: 1.25; margin: 0; padding: 0; }

        .kop-surat { width: 100%; border-collapse: collapse; border-bottom: 2px solid #000; margin-bottom: 6px; }
        .kop-surat td { vertical-align: middle; padding-bottom: 2px; }
        .kop-logo { width: 64px; }
        .kop-logo img { width: 58px; height: auto; display: block; }
        .kop-text { text-align: center; }
        .kop-text h3 { margin: 0; font-size: 11px; text-transform: uppercase; font-weight: bold; }
        .kop-text h2 { margin: 1px 0; font-size: 14px; text-transform: uppercase; font-weight: bold; }
        .kop-text p { margin: 1px 0 0; font-size: 7px; }

        .form-header { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
        .form-header td { border: 1px solid #000; padding: 3px 6px; vertical-align: top; }
        .form-header td.meta { width: 32%; }
        .form-header td.title { text-align: center; vertical-align: middle; }
        .form-title { font-size: 12px; font-weight: bold; text-transform: uppercase; }

        .ref-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
        .ref-table td { padding: 1px 6px; }

        .section { margin-bottom: 6px; }
        .section-title { font-weight: bold; text-transform: uppercase; font-size: 10px; border: 1px solid #000; padding: 2px 6px; margin-bottom: 0; background-color: #f0f0f0; }

        .info-table { width: 100%; border-collapse: collapse; }
        .info-table td { border: 1px solid #000; padding: 2px 5px; vertical-align: top; }
        .info-table td.label { font-weight: bold; background-color: #f0f0f0; width: 150px; }
        .info-table td.signature { width: 110px; text-align: center; vertical-align: middle; }
        .info-table td.signature img { height: 42px; width: auto; max-width: 100%; }

        .check { white-space: nowrap; }

        .identity { width: 100%; border-collapse: collapse; }
        .identity td { border: none; padding: 0 3px; vertical-align: top; }
        .identity td.k { width: 48px; font-weight: bold; }

        .page-break { page-break-before: always; }
    </style>
    <title>Form Persetujuan Perubahan</title>
</head>
<body>

    {{-- KOP SURAT --}}
    <table class="kop-surat">
        <tr>
            <td class="kop-logo"><img src="{{ $logoDoc }}" alt="Logo Jawa Timur"></td>
            <td class="kop-text">
                <h3>PEMERINTAH PROVINSI JAWA TIMUR</h3>
                <h2>DINAS KOMUNIKASI DAN INFORMATIKA</h2>
                <p>Jalan Ahmad Yani Nomor 242-244, Gayungan, Surabaya, Jawa Timur 60235<br>
                Tlp. (031) 8294608, Fak. (031) 8294517, Laman kominfo.jatimprov.go.id, Pos-el kominfo@jatimprov.go.id</p>
            </td>
        </tr>
    </table>

    {{-- HEADER FORMULIR --}}
    <table class="form-header">
        <tr>
            <td class="meta">
                <div><strong>No.</strong> : {{ $docNumber }}</div>
                <div><strong>Tanggal</strong> : {{ $tanggal }}</div>
                <div><strong>Halaman</strong> : 1</div>
            </td>
            <td class="title">
                <div class="form-title">FORMULIR PERSETUJUAN PERUBAHAN</div>
            </td>
        </tr>
    </table>

    <table class="ref-table">
        <tr>
            <td><strong>Berdasarkan Inisiasi Bidang</strong> : {{ $bidang }}</td>
        </tr>
    </table>

    @php
        $selectedTypes = is_array($changeTypes ?? null) ? $changeTypes : [];
    @endphp

    {{-- EVALUASI DAMPAK PERUBAHAN --}}
    <div class="section">
        <div class="section-title">EVALUASI DAMPAK PERUBAHAN</div>
        <table class="info-table">
            <tr>
                <td class="label">Tipe Perubahan</td>
                <td class="check" data-option="Hardware">[{{ in_array('Hardware', $selectedTypes, true) ? 'v' : ' ' }}]</td>
                <td>Hardware</td>
                <td class="check" data-option="Network">[{{ in_array('Network', $selectedTypes, true) ? 'v' : ' ' }}]</td>
                <td>Network</td>
            </tr>
            <tr>
                <td class="label"></td>
                <td class="check" data-option="Software">[{{ in_array('Software', $selectedTypes, true) ? 'v' : ' ' }}]</td>
                <td>Software</td>
                <td class="check" data-option="Utilities">[{{ in_array('Utilities', $selectedTypes, true) ? 'v' : ' ' }}]</td>
                <td>Utilities</td>
            </tr>
            <tr>
                <td class="label"></td>
                <td class="check" data-option="Aplikasi">[{{ in_array('Aplikasi', $selectedTypes, true) ? 'v' : ' ' }}]</td>
                <td>Aplikasi</td>
                <td class="check" data-option="Prosedur">[{{ in_array('Prosedur', $selectedTypes, true) ? 'v' : ' ' }}]</td>
                <td>Prosedur</td>
            </tr>
            <tr>
                <td class="label"></td>
                <td class="check" data-option="Operating System">[{{ in_array('Operating System', $selectedTypes, true) ? 'v' : ' ' }}]</td>
                <td>Operating System</td>
                <td class="check" data-option="Personil">[{{ in_array('Personil', $selectedTypes, true) ? 'v' : ' ' }}]</td>
                <td>Personil</td>
            </tr>
            <tr>
                <td class="label">Prioritas Perubahan</td>
                <td class="check" data-option="Normal">[{{ $isNormalPriority ? 'v' : ' ' }}]</td>
                <td>Normal</td>
                <td class="check" data-option="Emergency">[{{ $isEmergencyPriority ? 'v' : ' ' }}]</td>
                <td>Emergency</td>
            </tr>
            <tr>
                <td class="label">Dampak Perubahan</td>
                <td class="check" data-option="Minor">[{{ $isMinorImpact ? 'v' : ' ' }}]</td>
                <td>Minor</td>
                <td class="check" data-option="Mayor">[{{ $isMayorImpact ? 'v' : ' ' }}]</td>
                <td>Mayor</td>
            </tr>
            <tr>
                <td class="label">Dampak Terhadap Lingkungan Produksi</td>
                <td colspan="4">{{ $productionImpact }}</td>
            </tr>
            <tr>
                <td class="label">Upaya / Tindakan yang diperlukan</td>
                <td colspan="4">{{ $requiredEffort }}</td>
            </tr>
            <tr>
                <td class="label">Kebutuhan Biaya</td>
                <td colspan="4">{{ $costNeeded }} @if($costAmount !== '-') — {{ $costAmount }} @endif</td>
            </tr>
            <tr>
                <td class="label">Kebutuhan Sumber Daya (Personil, H/W, S/W)</td>
                <td colspan="4">{{ $resources }}</td>
            </tr>
            <tr>
                <td class="label">Penjelasan Rencana Pengujian</td>
                <td colspan="4">{{ $testPlan }}</td>
            </tr>
            <tr>
                <td class="label">Dievaluasi Oleh</td>
                <td colspan="3">
                    <table class="identity">
                        <tr><td class="k">Nama</td><td>: {{ $evaluatorName }}</td></tr>
                        <tr><td class="k">Bidang</td><td>: {{ $evaluatorBidang ?? '-' }}</td></tr>
                        <tr><td class="k">Jabatan</td><td>: {{ $evaluatorPosition }}</td></tr>
                    </table>
                </td>
                <td class="signature">
                    <img src="{{ $evaluatorSig }}" alt="Tanda Tangan">
                </td>
            </tr>
        </table>
    </div>

    {{-- TINJAUAN PERUBAHAN --}}
    <div class="section">
        <div class="section-title">TINJAUAN PERUBAHAN</div>
        <table class="info-table">
            <tr>
                <td class="label">Status Permintaan Perubahan</td>
                <td colspan="4">
                    <span class="check">[{{ $isAccepted ? 'v' : ' ' }}] DITERIMA</span>
                    &nbsp;&nbsp;
                    <span class="check">[{{ $isRejected ? 'v' : ' ' }}] DITOLAK</span>
                </td>
            </tr>
            <tr>
                <td class="label">Tanggapan</td>
                <td colspan="4">{{ $reviewResponse }}</td>
            </tr>
            <tr>
                <td class="label">Tanggal Pelaksanaan Perubahan</td>
                <td colspan="4">{{ $executionDate }}</td>
            </tr>
            <tr>
                <td class="label">Penanggungjawab Pelaksana Perubahan</td>
                <td colspan="4">{{ $responsibleTeamName }}</td>
            </tr>
            <tr>
                <td class="label">Ditinjau Oleh</td>
                <td colspan="3">
                    <table class="identity">
                        <tr><td class="k">Nama</td><td>: {{ $reviewerName }}</td></tr>
                        <tr><td class="k">Bidang</td><td>: {{ $reviewerBidang ?? '-' }}</td></tr>
                        <tr><td class="k">Jabatan</td><td>: {{ $reviewerPosition }}</td></tr>
                    </table>
                </td>
                <td class="signature">
                    <img src="{{ $reviewerSig }}" alt="Tanda Tangan">
                </td>
            </tr>
        </table>
    </div>

    {{-- HALAMAN 2 --}}
    <div class="page-break"></div>

    {{-- IMPLEMENTASI PERUBAHAN --}}
    <div class="section">
        <div class="section-title">IMPLEMENTASI PERUBAHAN</div>
        <table class="info-table">
            <tr>
                <td class="label">Hasil Tanggapan Perubahan</td>
                <td colspan="4">{{ $implementationResult }}</td>
            </tr>
            <tr>
                <td class="label">Hasil Pengujian Implementasi</td>
                <td colspan="4">
                    @forelse($attachmentImages as $image)
                        <img src="{{ $image }}" alt="hasil pengujian" style="max-width: 100%; margin-bottom: 6px;">
                    @empty
                        -
                    @endforelse
                </td>
            </tr>
            <tr>
                <td class="label">Tanggal Rilis</td>
                <td colspan="4">{{ $releaseDate }}</td>
            </tr>
            <tr>
                <td class="label">Penanggungjawab Pelaksana Perubahan</td>
                <td colspan="3">
                    <table class="identity">
                        <tr><td class="k">Nama</td><td>: {{ $responsibleName }}</td></tr>
                        <tr><td class="k">Bidang</td><td>: {{ $responsibleBidang ?? '-' }}</td></tr>
                        <tr><td class="k">Jabatan</td><td>: {{ $responsiblePosition }}</td></tr>
                    </table>
                </td>
                <td class="signature">
                    <img src="{{ $responsibleSig }}" alt="Tanda Tangan">
                </td>
            </tr>
        </table>
    </div>

</body>
</html>

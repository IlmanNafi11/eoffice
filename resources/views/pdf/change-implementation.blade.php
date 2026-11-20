<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @page { margin: 50px; size: A4; }
        * { box-sizing: border-box; }
        body { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 11px; color: #000; line-height: 1.5; margin: 0; padding: 0; }

        .kop-surat { width: 100%; border-collapse: collapse; border-bottom: 3px solid #000; margin-bottom: 12px; }
        .kop-surat td { vertical-align: middle; padding-bottom: 8px; }
        .kop-logo { width: 80px; }
        .kop-logo img { width: 74px; height: auto; display: block; }
        .kop-text { text-align: center; }
        .kop-text h3 { margin: 0; font-size: 13px; text-transform: uppercase; font-weight: bold; }
        .kop-text h2 { margin: 2px 0; font-size: 17px; text-transform: uppercase; font-weight: bold; }
        .kop-text p { margin: 3px 0 0; font-size: 8px; }

        .form-header { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        .form-header td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
        .form-header td.meta { width: 32%; }
        .form-header td.title { text-align: center; vertical-align: middle; }
        .form-title { font-size: 14px; font-weight: bold; text-transform: uppercase; }

        .ref-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        .ref-table td { padding: 2px 8px; }

        .section { margin-bottom: 12px; }
        .section-title { font-weight: bold; text-transform: uppercase; font-size: 11px; border: 1px solid #000; padding: 4px 8px; margin-bottom: 0; background-color: #f0f0f0; }

        .info-table { width: 100%; border-collapse: collapse; }
        .info-table td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
        .info-table td.label { font-weight: bold; background-color: #f0f0f0; width: 180px; }

        .check { white-space: nowrap; }

        .signature-block { margin-top: 15px; }
        .sig-table { width: 100%; border-collapse: collapse; }
        .sig-table td { width: 33%; text-align: center; vertical-align: top; padding: 0 5px; }
        .sig-role { font-weight: bold; margin-bottom: 40px; font-size: 10px; }
        .sig-box { position: relative; height: 60px; margin: 0 auto 3px; width: 160px; }
        .sig-box img { position: absolute; top: -45px; left: 0; height: 55px; width: auto; }
        .sig-name { font-weight: bold; border-top: 1px solid #000; padding-top: 2px; font-size: 10px; }
        .sig-nip { font-size: 9px; }
        .sig-position { font-size: 9px; }

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
            <td style="width: 120px;"><strong>Berdasarkan Inisiasi Bidang</strong> : {{ $bidang }}</td>
        </tr>
        <tr>
            <td><strong>Nomor</strong> : {{ $docNumber }}</td>
        </tr>
        <tr>
            <td><strong>Tanggal</strong> : {{ $tanggal }}</td>
        </tr>
        <tr>
            <td><strong>Halaman</strong> : 1</td>
        </tr>
    </table>

    {{-- EVALUASI DAMPAK PERUBAHAN --}}
    <div class="section">
        <div class="section-title">EVALUASI DAMPAK PERUBAHAN</div>
        <table class="info-table">
            <tr>
                <td class="label">Tipe Perubahan</td>
                <td>{{ $changeTypes }}</td>
            </tr>
            <tr>
                <td class="label">Prioritas Perubahan</td>
                <td>
                    <span class="check">[{{ $isNormalPriority ? 'v' : ' ' }}] Normal</span>
                    &nbsp;&nbsp;
                    <span class="check">[{{ $isEmergencyPriority ? 'v' : ' ' }}] Emergency</span>
                </td>
            </tr>
            <tr>
                <td class="label">Dampak Perubahan</td>
                <td>
                    <span class="check">[{{ $isMinorImpact ? 'v' : ' ' }}] Minor</span>
                    &nbsp;&nbsp;
                    <span class="check">[{{ $isMayorImpact ? 'v' : ' ' }}] Mayor</span>
                </td>
            </tr>
            <tr>
                <td class="label">Dampak Terhadap Lingkungan Produksi</td>
                <td>{{ $description }}</td>
            </tr>
            <tr>
                <td class="label">Upaya / Tindakan yang diperlukan</td>
                <td>{{ $requiredEffort }}</td>
            </tr>
            <tr>
                <td class="label">Kebutuhan Biaya</td>
                <td>{{ $costNeeded }} @if($costAmount !== '-') — {{ $costAmount }} @endif</td>
            </tr>
            <tr>
                <td class="label">Kebutuhan Sumber Daya (Personil, H/W, S/W)</td>
                <td>{{ $resources }}</td>
            </tr>
            <tr>
                <td class="label">Penjelasan Rencana Pengujian</td>
                <td>{{ $testPlan }}</td>
            </tr>
            <tr>
                <td class="label">Dievaluasi Oleh</td>
                <td>{{ $evaluatorName }}<br>NIP. {{ $evaluatorNip }} — {{ $evaluatorPosition }}</td>
            </tr>
        </table>
    </div>

    {{-- TINJAUAN PERUBAHAN --}}
    <div class="section">
        <div class="section-title">TINJAUAN PERUBAHAN</div>
        <table class="info-table">
            <tr>
                <td class="label">Status Permintaan Perubahan</td>
                <td>
                    <span class="check">[{{ $isAccepted ? 'v' : ' ' }}] DITERIMA</span>
                    &nbsp;&nbsp;
                    <span class="check">[{{ $isRejected ? 'v' : ' ' }}] DITOLAK</span>
                </td>
            </tr>
            <tr>
                <td class="label">Tanggapan</td>
                <td>{{ $reviewResponse }}</td>
            </tr>
            <tr>
                <td class="label">Tanggal Pelaksanaan Perubahan</td>
                <td>{{ $executionDate }}</td>
            </tr>
            <tr>
                <td class="label">Penanggungjawab Pelaksana Perubahan</td>
                <td>{{ $responsibleTeamName }}</td>
            </tr>
            <tr>
                <td class="label">Ditinjau Oleh</td>
                <td>{{ $reviewerName }}<br>NIP. {{ $reviewerNip }} — {{ $reviewerPosition }}</td>
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
                <td>{{ $implementationResult }}</td>
            </tr>
            <tr>
                <td class="label">Hasil Pengujian Implementasi</td>
                <td>
                    @forelse($attachmentImages as $image)
                        <img src="{{ $image }}" alt="hasil pengujian" style="max-width: 100%; margin-bottom: 6px;">
                    @empty
                        -
                    @endforelse
                </td>
            </tr>
            <tr>
                <td class="label">Tanggal Rilis</td>
                <td>{{ $releaseDate }}</td>
            </tr>
        </table>
    </div>

    {{-- TANDA TANGAN --}}
    <div class="signature-block">
        <table class="sig-table">
            <tr>
                <td>
                    <div class="sig-role">Dievaluasi Oleh</div>
                    <div class="sig-box"><img src="{{ $evaluatorSig }}" alt="sig"></div>
                    <div class="sig-name">{{ $evaluatorName }}</div>
                    <div class="sig-nip">NIP. {{ $evaluatorNip }}</div>
                    <div class="sig-position">{{ $evaluatorPosition }}</div>
                </td>
                <td>
                    <div class="sig-role">Ditinjau Oleh</div>
                    <div class="sig-box"><img src="{{ $reviewerSig }}" alt="sig"></div>
                    <div class="sig-name">{{ $reviewerName }}</div>
                    <div class="sig-nip">NIP. {{ $reviewerNip }}</div>
                    <div class="sig-position">{{ $reviewerPosition }}</div>
                </td>
                <td>
                    <div class="sig-role">Penanggungjawab</div>
                    <div class="sig-box"><img src="{{ $responsibleSig }}" alt="sig"></div>
                    <div class="sig-name">{{ $responsibleName }}</div>
                    <div class="sig-nip">NIP. {{ $responsibleNip }}</div>
                    <div class="sig-position">{{ $responsiblePosition }}</div>
                </td>
            </tr>
        </table>
    </div>

</body>
</html>

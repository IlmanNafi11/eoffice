<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @page { margin: 60px 50px 40px 50px; size: A4; }
        * { box-sizing: border-box; }
        body {
            font-family: "DejaVu Sans", Arial, sans-serif;
            font-size: 11px;
            color: #000;
            line-height: 1.4;
            margin: 0;
            padding: 0;
        }

        /* === KOP SURAT === */
        .kop-surat {
            display: flex;
            align-items: flex-start;
            margin-bottom: 5px;
            padding-bottom: 8px;
            border-bottom: 3px solid #000;
        }
        .kop-logo {
            width: 74px;
            flex-shrink: 0;
            margin-right: 14px;
        }
        .kop-logo img {
            width: 74px;
            height: auto;
            display: block;
        }
        .kop-text { text-align: center; flex-grow: 1; }
        .kop-text h3 { margin: 0; font-size: 16px; text-transform: uppercase; font-weight: bold; }
        .kop-text h2 { margin: 2px 0; font-size: 20px; text-transform: uppercase; font-weight: bold; }
        .kop-text p { margin: 3px 0 0; font-size: 9px; }

        /* === JUDUL === */
        .judul {
            text-align: center;
            margin: 18px 0 15px 0;
            text-decoration: underline;
            font-size: 13px;
            font-weight: bold;
            text-transform: uppercase;
        }

        /* === IDENTITAS === */
        .identitas { margin-bottom: 15px; }
        .identitas table { width: 100%; border-collapse: collapse; }
        .identitas td { padding: 2px 0; vertical-align: top; }
        .identitas td.label { width: 170px; }

        /* === TABEL STAF === */
        table.staff {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
        }
        table.staff th, table.staff td {
            border: 1px solid #000;
            padding: 6px 8px;
            text-align: left;
            vertical-align: top;
        }
        table.staff th {
            background-color: #f0f0f0;
            text-align: center;
            font-weight: bold;
        }
        table.staff td.no { text-align: center; width: 30px; }
        table.staff td.links { font-size: 9px; color: #333; line-height: 1.3; }

        /* === BLOK TANDA TANGAN === */
        .signature-area { position: relative; margin-top: 20px; }
        .signature-table { width: 100%; border-collapse: collapse; }
        .signature-table td { width: 50%; text-align: center; vertical-align: top; padding: 0 10px; }
        .signature-role { font-weight: bold; margin-bottom: 50px; }
        .signature-box { position: relative; height: 70px; margin: 0 auto 5px; width: 200px; }
        .signature-box img { position: absolute; top: -55px; left: 0; height: 65px; width: auto; }
        .signature-name { font-weight: bold; border-top: 1px solid #000; padding-top: 3px; margin-top: 2px; }
        .signature-nip { font-size: 10px; margin-top: 1px; }
        .footer-bar { position: relative; margin-top: 10px; }
        .tanggal { text-align: right; margin-bottom: 8px; }

        /* === DOKUMENTASI === */
        .dok-title {
            text-align: center;
            margin: 30px 0 20px 0;
            font-size: 13px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .dok-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        .dok-table th, .dok-table td {
            border: 1px solid #000;
            padding: 6px 8px;
            text-align: left;
            vertical-align: middle;
        }
        .dok-table th {
            background-color: #f0f0f0;
            text-align: center;
            font-weight: bold;
        }
        .dok-table td.no { text-align: center; width: 30px; }
        .dok-table td.photo { text-align: center; width: 80px; }
        .dok-photo { width: 60px; height: 60px; object-fit: cover; }
        .page-break { page-break-before: always; }
    </style>
    <title>Laporan WFH Tim - Admin</title>
</head>
<body>

    {{-- KOP SURAT --}}
    <div class="kop-surat">
        <img class="kop-logo" src="{{ $logoDoc }}" alt="Logo Jawa Timur">
        <div class="kop-text">
            <h3>PEMERINTAH PROVINSI JAWA TIMUR</h3>
            <h2>DINAS KOMUNIKASI DAN INFORMATIKA</h2>
            <p>Jalan Ahmad Yani Nomor 242-244, Gayungan, Surabaya, Jawa Timur 60235<br>
            Tlp. (031) 8294608, Fak. (031) 8294517, Laman kominfo.jatimprov.go.id, Pos-el kominfo@jatimprov.go.id</p>
        </div>
    </div>

    {{-- JUDUL --}}
    <div class="judul">
        LAPORAN PELAKSANAAN TUGAS WORK FROM HOME (WFH)
    </div>

    {{-- IDENTITAS --}}
    <div class="identitas">
        <table>
            <tr><td class="label">Nama Tim Kerja</td><td>: {{ $namaTim }}</td></tr>
            <tr><td class="label">Unit Kerja</td><td>: {{ $unitKerja }}</td></tr>
            <tr><td class="label">Tanggal Pelaksanaan</td><td>: {{ $tanggalPelaksanaan }}</td></tr>
        </table>
    </div>

    {{-- TABEL STAF --}}
    <table class="staff">
        <thead>
            <tr>
                <th style="width:30px;">No</th>
                <th style="width:200px;">Nama Pegawai</th>
                <th>Link Bukti Kerja</th>
            </tr>
        </thead>
        <tbody>
            @forelse($staff as $i => $member)
                <tr>
                    <td class="no">{{ $i + 1 }}</td>
                    <td>{{ $member['name'] }}<br><span style="font-size:9px;">NIP. {{ $member['nip'] }}</span></td>
                    <td class="links">
                        @forelse($member['links'] as $link)
                            <div>{{ $link }}</div>
                        @empty
                            -
                        @endforelse
                    </td>
                </tr>
            @empty
                <tr><td colspan="3" style="text-align:center;">-</td></tr>
            @endforelse
        </tbody>
    </table>

    {{-- FOOTER: TANGGAL --}}
    <div class="footer-bar">
        <div class="tanggal">Surabaya, {{ $tanggalPelaksanaan }}</div>
    </div>

    {{-- BLOK TANDA TANGAN --}}
    <div class="signature-area">
        <table class="signature-table">
            <tr>
                <td>
                    <div class="signature-role">Yang Membuat Laporan</div>
                    <div class="signature-box">
                        <img src="{{ $signatureMakerPath }}" alt="signature">
                    </div>
                    <div class="signature-name">{{ $makerName }}</div>
                    <div class="signature-nip">NIP. {{ $makerNip }}</div>
                </td>
                <td>
                    <div class="signature-role">Atasan Langsung</div>
                    <div class="signature-box">
                        @if ($isApproved && $signatureSupervisorPath)
                            <img src="{{ $signatureSupervisorPath }}" alt="signature">
                        @endif
                    </div>
                    <div class="signature-name">{{ $supervisorName }}</div>
                    <div class="signature-nip">NIP. {{ $supervisorNip }}</div>
                </td>
            </tr>
        </table>
    </div>

    {{-- HALAMAN DOKUMENTASI --}}
    <div class="page-break">
        <div class="dok-title">
            DOKUMENTASI TIM {{ strtoupper($namaTim) }} WORK FROM HOME {{ $tanggalPelaksanaan }}
        </div>

        @foreach($sessions as $sessionName => $entries)
            <table class="dok-table">
                <thead>
                    <tr>
                        <th colspan="3">SESI {{ strtoupper($sessionName) }}</th>
                    </tr>
                    <tr>
                        <th style="width:30px;">No</th>
                        <th>Nama</th>
                        <th style="width:80px;">Photo</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach($entries as $entry)
                        <tr>
                            <td class="no">{{ $entry['no'] }}</td>
                            <td>{{ $entry['name'] }}</td>
                            <td class="photo">
                                @if ($entry['photo'])
                                    <img src="{{ $entry['photo'] }}" class="dok-photo" alt="photo">
                                @else
                                    -
                                @endif
                            </td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        @endforeach
    </div>

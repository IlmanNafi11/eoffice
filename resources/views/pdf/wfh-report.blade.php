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
        .kop-text {
            text-align: center;
            flex-grow: 1;
        }
        .kop-text h3 {
            margin: 0;
            font-size: 16px;
            text-transform: uppercase;
            font-weight: bold;
        }
        .kop-text h2 {
            margin: 2px 0;
            font-size: 20px;
            text-transform: uppercase;
            font-weight: bold;
        }
        .kop-text p {
            margin: 3px 0 0;
            font-size: 9px;
        }

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
        .identitas {
            margin-bottom: 15px;
        }
        .identitas table {
            width: 100%;
            border-collapse: collapse;
        }
        .identitas td {
            padding: 2px 0;
            vertical-align: top;
        }
        .identitas td.label {
            width: 170px;
        }

        /* === TABEL KEGIATAN === */
        table.kegiatan {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
        }
        table.kegiatan th, table.kegiatan td {
            border: 1px solid #000;
            padding: 6px 8px;
            text-align: left;
            vertical-align: top;
        }
        table.kegiatan th {
            background-color: #f0f0f0;
            text-align: center;
            font-weight: bold;
        }
        table.kegiatan td.no {
            text-align: center;
            width: 30px;
        }
        table.kegiatan td.waktu {
            width: 120px;
            white-space: nowrap;
        }
        table.kegiatan td.links {
            font-size: 9px;
            color: #333;
            line-height: 1.3;
        }

        /* === BLOK TANDA TANGAN === */
        .signature-area {
            position: relative;
            margin-top: 20px;
        }
        .signature-table {
            width: 100%;
            border-collapse: collapse;
        }
        .signature-table td {
            width: 50%;
            text-align: center;
            vertical-align: top;
            padding: 0 10px;
        }
        .signature-role {
            font-weight: bold;
            margin-bottom: 50px;
        }
        .signature-box {
            /* Signature image rendered via relative position to test M1 precision */
            position: relative;
            height: 70px;
            margin: 0 auto 5px;
            width: 200px;
        }
        .signature-box img {
            position: absolute;
            top: -55px;
            left: 0;
            height: 65px;
            width: auto;
        }
        .signature-name {
            font-weight: bold;
            border-top: 1px solid #000;
            padding-top: 3px;
            margin-top: 2px;
        }
        .signature-nip {
            font-size: 10px;
            margin-top: 1px;
        }

        /* === TEMPAT/TANGGAL + QR === */
        .footer-bar {
            position: relative;
            margin-top: 10px;
        }
        .tanggal {
            text-align: right;
            margin-bottom: 8px;
        }
        .qr-box {
            position: absolute;
            top: 0;
            right: 0;
            width: 60px;
            height: 60px;
        }
        .qr-box svg {
            width: 60px;
            height: 60px;
        }
    </style>
    <title>Laporan WFH</title>
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
            <tr><td class="label">Nama</td><td>: {{ $nama }}</td></tr>
            <tr><td class="label">NIP</td><td>: {{ $nip }}</td></tr>
            <tr><td class="label">Pangkat/Gol</td><td>: {{ $pangkat }}</td></tr>
            <tr><td class="label">Jabatan</td><td>: {{ $jabatan }}</td></tr>
            <tr><td class="label">Unit Kerja</td><td>: {{ $unitKerja }}</td></tr>
            <tr><td class="label">Tanggal Pelaksanaan</td><td>: {{ $tanggalPelaksanaan }}</td></tr>
        </table>
    </div>

    {{-- TABEL KEGIATAN --}}
    <table class="kegiatan">
        <thead>
            <tr>
                <th style="width:30px;">No</th>
                <th style="width:120px;">Waktu Pelaksanaan</th>
                <th>Kegiatan</th>
                <th style="width:180px;">Link Bukti Kerja</th>
            </tr>
        </thead>
        <tbody>
            @foreach($kegiatan as $i => $item)
                <tr>
                    <td class="no">{{ $i + 1 }}.</td>
                    <td class="waktu">{{ $item['waktu'] }}</td>
                    <td>{{ $item['kegiatan'] }}</td>
                    <td class="links">
                        @foreach($item['links'] as $link)
                            <div>{{ $link }}</div>
                        @endforeach
                    </td>
                </tr>
            @endforeach
        </tbody>
    </table>


    {{-- FOOTER: TANGGAL + QR --}}
    <div class="footer-bar">
        <div class="tanggal">Surabaya, {{ $tanggalPelaksanaan }}</div>
        <div class="qr-box">
            @if ($isApproved && $qrSvg)
                {!! $qrSvg !!}
            @endif
        </div>
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

</body>
</html>

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
        .form-role { font-size: 12px; font-weight: bold; text-transform: uppercase; }
        .form-title { font-size: 14px; font-weight: bold; text-transform: uppercase; margin-top: 4px; }

        .form-body { width: 100%; border-collapse: collapse; }
        .form-body td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
        .form-body td.label { width: 32%; font-weight: bold; background-color: #f0f0f0; }
        .form-body tr.section td { font-weight: bold; text-transform: uppercase; background-color: #f0f0f0; }
        .form-body td.content { height: 60px; }

        .signature-area { position: relative; margin-top: 25px; }
        .signature-table { width: 100%; border-collapse: collapse; }
        .signature-table td { width: 50%; text-align: center; vertical-align: top; padding: 0 10px; }
        .signature-role { font-weight: bold; margin-bottom: 50px; }
        .signature-box { position: relative; height: 70px; margin: 0 auto 5px; width: 200px; }
        .signature-box img { position: absolute; top: -55px; left: 0; height: 65px; width: auto; }
        .signature-name { font-weight: bold; border-top: 1px solid #000; padding-top: 3px; margin-top: 2px; }
        .signature-nip, .signature-position { font-size: 10px; }

        .qr-box { position: absolute; top: 0; right: 0; width: 60px; height: 60px; }
        .qr-box svg { width: 60px; height: 60px; }
    </style>
    <title>Form Inisiasi Perubahan</title>
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
                <div class="form-role">INISIATOR PERUBAHAN</div>
                <div class="form-title">FORMULIR INISIASI PERUBAHAN</div>
            </td>
        </tr>
    </table>

    {{-- BADAN FORMULIR --}}
    <table class="form-body">
        <tr>
            <td class="label">Bidang</td>
            <td>{{ $bidang }}</td>
        </tr>
        <tr>
            <td class="label">Hasil perubahan dibutuhkan pada tanggal</td>
            <td>{{ $neededByDate }}</td>
        </tr>
        <tr class="section">
            <td colspan="2">Deskripsi Perubahan</td>
        </tr>
        <tr>
            <td colspan="2" class="content">{{ $description }}</td>
        </tr>
        <tr class="section">
            <td colspan="2">Alasan Perubahan</td>
        </tr>
        <tr>
            <td colspan="2" class="content">{{ $reason }}</td>
        </tr>
    </table>

    {{-- TANDA TANGAN --}}
    <div class="signature-area">
        <div class="qr-box">{!! $qrSvg !!}</div>
        <table class="signature-table">
            <tr>
                <td>
                    <div class="signature-role">Inisiator Perubahan</div>
                    <div class="signature-box">
                        <img src="{{ $initiatorSig }}" alt="signature">
                    </div>
                    <div class="signature-name">{{ $initiatorName }}</div>
                    <div class="signature-nip">NIP. {{ $initiatorNip }}</div>
                    <div class="signature-position">{{ $initiatorPosition }}</div>
                </td>
                <td>
                    <div class="signature-role">Disetujui Oleh</div>
                    <div class="signature-box">
                        <img src="{{ $reviewerSig }}" alt="signature">
                    </div>
                    <div class="signature-name">{{ $reviewerName }}</div>
                    <div class="signature-nip">NIP. {{ $reviewerNip }}</div>
                    <div class="signature-position">{{ $reviewerPosition }}</div>
                </td>
            </tr>
        </table>
    </div>

</body>
</html>

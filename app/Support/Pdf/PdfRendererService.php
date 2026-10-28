<?php

namespace App\Support\Pdf;

use Barryvdh\DomPDF\Facade\Pdf;

class PdfRendererService
{
    /**
     * Render a Blade view to PDF binary.
     *
     * @param  string  $view  Blade template path (e.g. 'pdf.wfh-report')
     * @param  array  $data  Data passed to the view
     * @param  string  $paper  Paper size (default A4)
     * @param  string  $orientation  Portrait or landscape
     * @return string PDF binary content
     */
    public function render(string $view, array $data = [], string $paper = 'A4', string $orientation = 'portrait'): string
    {
        $pdf = Pdf::loadView($view, $data);
        $pdf->setPaper($paper, $orientation);

        return $pdf->output();
    }
}

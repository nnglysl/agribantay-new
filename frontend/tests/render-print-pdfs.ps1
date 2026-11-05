param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference = 'Stop'
# Read browser-generated synthetic PDFs with the installed Windows PDF renderer.
# No application endpoint, printer, external network or operational data is used.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
$null = [Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime]
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null = [Windows.Data.Pdf.PdfPageRenderOptions,Windows.Data.Pdf,ContentType=WindowsRuntime]
$generic = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$action = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
function Await-Result($Operation, [Type]$ResultType) {
    $task = $generic.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    if (-not $task.Wait(30000)) { throw 'PDF read/render timed out.' }
    return $task.Result
}
function Await-Action($Operation) {
    $task = $action.Invoke($null, @($Operation))
    if (-not $task.Wait(30000)) { throw 'PDF rendering timed out.' }
}
$targetDirectory = (Resolve-Path -LiteralPath $Directory).Path
foreach ($pdfFile in Get-ChildItem -LiteralPath $targetDirectory -Filter '*.pdf') {
    $file = Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync($pdfFile.FullName)) ([Windows.Storage.StorageFile])
    $pdf = Await-Result ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
    $pages = @()
    for ($i=0; $i -lt $pdf.PageCount; $i++) {
        $page = $pdf.GetPage($i)
        $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
        $render = New-Object Windows.Data.Pdf.PdfPageRenderOptions
        $render.DestinationWidth = 1200
        Await-Action ($page.RenderToStreamAsync($stream, $render))
        $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
        $null = Await-Result ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
        $bytes = New-Object byte[] ([int]$stream.Size)
        $reader.ReadBytes($bytes)
        $png = Join-Path $targetDirectory ($pdfFile.BaseName + '-page-' + ($i+1) + '.png')
        [IO.File]::WriteAllBytes($png,$bytes)
        $pages += $png
        $reader.Dispose(); $page.Dispose(); $stream.Dispose()
    }
    $columns = 3; $cellWidth=330; $cellHeight=480
    $sheet = New-Object Drawing.Bitmap ($columns*$cellWidth), ([int][Math]::Ceiling($pages.Count/$columns)*$cellHeight)
    $graphics = [Drawing.Graphics]::FromImage($sheet); $graphics.Clear([Drawing.Color]::FromArgb(232,236,232))
    $font = New-Object Drawing.Font 'Arial',12
    for ($i=0; $i -lt $pages.Count; $i++) {
        $image = [Drawing.Image]::FromFile($pages[$i])
        $x = ($i % $columns)*$cellWidth + 8; $y = [Math]::Floor($i/$columns)*$cellHeight + 27
        $ratio = [Math]::Min(($cellWidth-16)/$image.Width,($cellHeight-40)/$image.Height)
        $graphics.DrawImage($image,[single]$x,[single]$y,[single]($image.Width*$ratio),[single]($image.Height*$ratio))
        $graphics.DrawString('Page '+($i+1),$font,[Drawing.Brushes]::Black,[single]$x,[single]($y-22))
        $image.Dispose()
    }
    $sheet.Save((Join-Path $targetDirectory ($pdfFile.BaseName+'-contact.png')),[Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose();$font.Dispose();$sheet.Dispose()
    Write-Output ($pdfFile.BaseName+': rendered '+$pdf.PageCount+' page(s).')
}

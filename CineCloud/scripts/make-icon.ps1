Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root 'build'
New-Item -ItemType Directory -Path $build -Force | Out-Null
$pngPath = Join-Path $build 'icon.png'
$icoPath = Join-Path $build 'icon.ico'

$bitmap = [System.Drawing.Bitmap]::new(256, 256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$rectangle = [System.Drawing.Rectangle]::new(0, 0, 256, 256)
$brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rectangle, [System.Drawing.Color]::FromArgb(25, 22, 32), [System.Drawing.Color]::FromArgb(122, 67, 79), 45)
$graphics.FillRectangle($brush, $rectangle)
$ringPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(80, 255, 216, 192), 8)
$graphics.DrawEllipse($ringPen, 20, 20, 216, 216)
$letterBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 246, 238))
$font = [System.Drawing.Font]::new('Arial', 156, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$graphics.DrawString('C', $font, $letterBrush, 47, 35)
$accent = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 164, 123))
$graphics.FillEllipse($accent, 177, 173, 32, 32)
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

$png = [System.IO.File]::ReadAllBytes($pngPath)
$header = [byte[]]@(0,0,1,0,1,0,0,0,0,0,1,0,32,0)
$length = [System.BitConverter]::GetBytes([uint32]$png.Length)
$offset = [System.BitConverter]::GetBytes([uint32]22)
$ico = [byte[]]::new($header.Length + $length.Length + $offset.Length + $png.Length)
[Array]::Copy($header, 0, $ico, 0, $header.Length)
[Array]::Copy($length, 0, $ico, $header.Length, $length.Length)
[Array]::Copy($offset, 0, $ico, $header.Length + $length.Length, $offset.Length)
[Array]::Copy($png, 0, $ico, 22, $png.Length)
[System.IO.File]::WriteAllBytes($icoPath, $ico)

$movoPngPath = Join-Path $build 'movo.png'
$movoIcoPath = Join-Path $build 'movo.ico'
$movoBitmap = [System.Drawing.Bitmap]::new(256, 256)
$movoGraphics = [System.Drawing.Graphics]::FromImage($movoBitmap)
$movoGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$movoGraphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$movoBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rectangle, [System.Drawing.Color]::FromArgb(41, 27, 40), [System.Drawing.Color]::FromArgb(211, 99, 91), 45)
$movoGraphics.FillRectangle($movoBrush, $rectangle)
$movoGraphics.DrawEllipse($ringPen, 20, 20, 216, 216)
$movoFont = [System.Drawing.Font]::new('Arial', 142, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$movoGraphics.DrawString('M', $movoFont, $letterBrush, 39, 50)
$movoGraphics.FillEllipse($accent, 190, 185, 23, 23)
$movoBitmap.Save($movoPngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$movoGraphics.Dispose()
$movoBitmap.Dispose()
$movoPng = [System.IO.File]::ReadAllBytes($movoPngPath)
$movoLength = [System.BitConverter]::GetBytes([uint32]$movoPng.Length)
$movoIco = [byte[]]::new(22 + $movoPng.Length)
[Array]::Copy($header, 0, $movoIco, 0, $header.Length)
[Array]::Copy($movoLength, 0, $movoIco, $header.Length, $movoLength.Length)
[Array]::Copy($offset, 0, $movoIco, $header.Length + $movoLength.Length, $offset.Length)
[Array]::Copy($movoPng, 0, $movoIco, 22, $movoPng.Length)
[System.IO.File]::WriteAllBytes($movoIcoPath, $movoIco)

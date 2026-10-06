Add-Type -AssemblyName System.Drawing

function Create-PwaIcon {
    param (
        [int]$size,
        [string]$outputPath,
        [bool]$maskable = $false
    )

    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Background
    $navy = [System.Drawing.Color]::FromArgb(255, 27, 54, 93)      # #1B365D
    $blue = [System.Drawing.Color]::FromArgb(255, 47, 92, 158)     # #2F5C9E
    $white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
    $teal = [System.Drawing.Color]::FromArgb(255, 111, 211, 192)   # #6FD3C0

    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $blue, $navy, 45.0)

    if ($maskable) {
        # Full fill for maskable
        $g.FillRectangle($bgBrush, 0, 0, $size, $size)
        $pad = $size * 0.15
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
        $radius = [int]($size * 0.22)
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $d = $radius * 2
        $path.AddArc(0, 0, $d, $d, 180, 90)
        $path.AddArc($size - $d, 0, $d, $d, 270, 90)
        $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
        $path.AddArc(0, $size - $d, $d, $d, 90, 90)
        $path.CloseFigure()
        $g.FillPath($bgBrush, $path)
        $pad = $size * 0.20
    }

    $innerW = $size - ($pad * 2)
    $innerH = $size - ($pad * 2)

    # Lines
    $penW = [Math]::Max(3.0, ($innerW * 0.08))
    $pen = New-Object System.Drawing.Pen($white, $penW)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $y1 = $pad + ($innerH * 0.25)
    $y2 = $pad + ($innerH * 0.50)
    $y3 = $pad + ($innerH * 0.75)

    # Line 1
    $g.DrawLine($pen, [float]($pad + ($innerW * 0.08)), [float]$y1, [float]($pad + ($innerW * 0.92)), [float]$y1)
    # Line 2 (shorter)
    $g.DrawLine($pen, [float]($pad + ($innerW * 0.08)), [float]$y2, [float]($pad + ($innerW * 0.52)), [float]$y2)
    # Line 3
    $g.DrawLine($pen, [float]($pad + ($innerW * 0.08)), [float]$y3, [float]($pad + ($innerW * 0.92)), [float]$y3)

    # Dot on line 2
    $dotR = [float]($innerW * 0.11)
    $dotX = [float]($pad + ($innerW * 0.78) - $dotR)
    $dotY = [float]($y2 - $dotR)
    $tealBrush = New-Object System.Drawing.SolidBrush($teal)
    $g.FillEllipse($tealBrush, $dotX, $dotY, ($dotR * 2), ($dotR * 2))

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Gerado: $outputPath ($size x $size)"
}

$pub = Join-Path $PSScriptRoot "..\public"
Create-PwaIcon -size 192 -outputPath (Join-Path $pub "pwa-192x192.png")
Create-PwaIcon -size 512 -outputPath (Join-Path $pub "pwa-512x512.png")
Create-PwaIcon -size 180 -outputPath (Join-Path $pub "apple-touch-icon.png")
Create-PwaIcon -size 512 -outputPath (Join-Path $pub "maskable-icon-512x512.png") -maskable $true

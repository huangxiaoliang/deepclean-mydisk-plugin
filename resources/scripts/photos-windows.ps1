# Read-only image decoding through the Windows .NET image codecs.
# Writes only explicitly requested temporary JPEG outputs (never input files).
param(
    [Parameter(Mandatory=$true)][ValidateSet('hash','thumbnail')][string]$Mode,
    [string]$InputPath,
    [string]$OutputPath,
    [ValidateRange(64,320)][int]$Size = 160
)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
    Add-Type -AssemblyName System.Drawing
    function Get-PhotoHash([string]$File) {
        $image = $null; $bitmap = $null; $graphics = $null
        try {
            $image = [System.Drawing.Image]::FromFile($File)
            $bitmap = [System.Drawing.Bitmap]::new(9, 8)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $graphics.DrawImage($image, 0, 0, 9, 8)
            $hex = [System.Text.StringBuilder]::new()
            $nibble = 0; $count = 0
            for ($y = 0; $y -lt 8; $y++) {
                for ($x = 0; $x -lt 8; $x++) {
                    $a = $bitmap.GetPixel($x, $y); $b = $bitmap.GetPixel($x + 1, $y)
                    $left = [Math]::Floor(0.299 * $a.R + 0.587 * $a.G + 0.114 * $a.B)
                    $right = [Math]::Floor(0.299 * $b.R + 0.587 * $b.G + 0.114 * $b.B)
                    $nibble = $nibble -shl 1
                    if ($left -gt $right) { $nibble = $nibble -bor 1 }
                    $count++
                    if ($count -eq 4) {
                        [void]$hex.Append($nibble.ToString('x'))
                        $nibble = 0; $count = 0
                    }
                }
            }
            return $hex.ToString()
        } finally {
            if ($graphics) { $graphics.Dispose() }
            if ($bitmap) { $bitmap.Dispose() }
            if ($image) { $image.Dispose() }
        }
    }
    if ($Mode -eq 'hash') {
        $files = ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())
        $results = @(foreach ($file in $files) {
            try { @{path=[string]$file; hash=(Get-PhotoHash ([string]$file))} }
            catch { @{path=[string]$file; error=$_.Exception.Message} }
        })
        ConvertTo-Json -InputObject $results -Depth 4 -Compress
    } else {
        $job = ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())
        $InputPath = [string]$job.path
        $OutputPath = [string]$job.output
        $Size = [int]$job.size
        if ($Size -lt 64 -or $Size -gt 320) { throw 'Invalid thumbnail size' }
        $image = $null; $bitmap = $null; $graphics = $null
        try {
            $image = [System.Drawing.Image]::FromFile($InputPath)
            $scale = [Math]::Min(1.0, $Size / [double][Math]::Max($image.Width, $image.Height))
            $width = [Math]::Max(1, [int]($image.Width * $scale))
            $height = [Math]::Max(1, [int]($image.Height * $scale))
            $bitmap = [System.Drawing.Bitmap]::new($width, $height)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $graphics.Clear([System.Drawing.Color]::White)
            $graphics.DrawImage($image, 0, 0, $width, $height)
            $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
        } finally {
            if ($graphics) { $graphics.Dispose() }
            if ($bitmap) { $bitmap.Dispose() }
            if ($image) { $image.Dispose() }
        }
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}

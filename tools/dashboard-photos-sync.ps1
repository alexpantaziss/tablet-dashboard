# dashboard-photos-sync.ps1
# Μικραίνει τις φωτογραφίες του φακέλου-πηγής σε 1280x800 (crop στο κέντρο), τις γράφει στο
# dashboard\dashboard-photos μαζί με το photos.js, και με -Push τις στέλνει στο tablet
# (/sdcard/Download/dashboard-photos). Οι αρχικές φωτογραφίες δεν αλλάζουν ποτέ.
#
# Χρήση:  διπλό κλικ στο "Ενημέρωση φωτογραφιών.bat", ή powershell -ExecutionPolicy Bypass -File tools\dashboard-photos-sync.ps1 -Push
param(
  [string]$Source = (Join-Path $PSScriptRoot '..\4K Wallpaper  Dump REUPLOAD'),
  [string]$Out    = (Join-Path $PSScriptRoot '..\dashboard\dashboard-photos'),
  [int]$Width = 1280, [int]$Height = 800, [int]$Quality = 80,
  [switch]$Push
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$adb = Join-Path $PSScriptRoot 'Android\platform-tools\adb.exe'
$remote = '/sdcard/Download/dashboard-photos'

# Με -Push: έλεγχος ότι το tablet είναι συνδεδεμένο, πριν από οποιαδήποτε δουλειά
if ($Push) {
  $state = (cmd /c "`"$adb`" get-state 2>nul" | Out-String).Trim()
  if ($state -ne 'device') {
    Write-Host "Το tablet δεν φαίνεται. Σύνδεσέ το με USB (και πάτα 'Να επιτρέπεται' αν το ζητήσει) και ξανατρέξε. Δεν άλλαξε τίποτα." -ForegroundColor Yellow
    exit 1
  }
}
# Πρώτα έλεγχος ότι υπάρχει η πηγή με φωτογραφίες, αλλιώς σταματάμε χωρίς να σβήσουμε τίποτα
if (-not (Test-Path -LiteralPath $Source)) { throw "Δεν βρέθηκε ο φάκελος με τις φωτογραφίες: $Source" }
$srcCount = (Get-ChildItem -LiteralPath $Source -Recurse -File | Where-Object { $_.Extension -match '^\.(jpe?g|png|bmp)$' }).Count
if ($srcCount -eq 0) { throw "Ο φάκελος $Source δεν έχει φωτογραφίες jpg/png/bmp. Δεν άλλαξε τίποτα." }

if (Test-Path -LiteralPath $Out) { Get-ChildItem -LiteralPath $Out -File | Remove-Item -Force }
else { New-Item -ItemType Directory -Path $Out | Out-Null }

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$Quality)

$files = Get-ChildItem -LiteralPath $Source -Recurse -File | Where-Object { $_.Extension -match '^\.(jpe?g|png|bmp)$' } | Sort-Object FullName
$names = New-Object System.Collections.Generic.List[string]
$n = 0; $skipped = 0
foreach ($f in $files) {
  try {
    $img = [System.Drawing.Image]::FromFile($f.FullName)
    # EXIF orientation (0x0112), ώστε οι κάθετες λήψεις κινητού να μη βγαίνουν πλάγια
    if ($img.PropertyIdList -contains 0x0112) {
      switch ([int]$img.GetPropertyItem(0x0112).Value[0]) {
        3 { $img.RotateFlip('Rotate180FlipNone') } 6 { $img.RotateFlip('Rotate90FlipNone') } 8 { $img.RotateFlip('Rotate270FlipNone') }
      }
    }
    # "cover": κλίμακα ώστε να γεμίσει το 1280x800 και crop στο κέντρο
    $s = [math]::Max($Width / $img.Width, $Height / $img.Height)
    $sw = [int][math]::Ceiling($Width / $s); $sh = [int][math]::Ceiling($Height / $s)
    $sx = [int](($img.Width - $sw) / 2); $sy = [int](($img.Height - $sh) / 2)
    $bmp = New-Object System.Drawing.Bitmap $Width, $Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.SmoothingMode = 'HighQuality'
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $Width, $Height), (New-Object System.Drawing.Rectangle $sx, $sy, $sw, $sh), 'Pixel')
    $n++; $name = 'p{0:D3}.jpg' -f $n
    $bmp.Save((Join-Path $Out $name), $codec, $ep)
    $names.Add($name)
    $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  } catch { $skipped++; Write-Warning "Παράλειψη: $($f.Name) ($($_.Exception.Message))" }
}
$other = (Get-ChildItem -LiteralPath $Source -Recurse -File | Where-Object { $_.Extension -notmatch '^\.(jpe?g|png|bmp)$' }).Count

$js = "window.DASH_PHOTOS = [" + (($names | ForEach-Object { '"' + $_ + '"' }) -join ',') + "];`n"
[System.IO.File]::WriteAllText((Join-Path $Out 'photos.js'), $js, (New-Object System.Text.UTF8Encoding $false))

$mb = [math]::Round(((Get-ChildItem -LiteralPath $Out -File | Measure-Object Length -Sum).Sum) / 1MB, 1)
"Έτοιμες: $n φωτογραφίες, $mb MB στο $Out. Παραλείφθηκαν: $skipped με σφάλμα, $other μη υποστηριζόμενου τύπου (π.χ. .webp)."

if ($Push) {
  & $adb shell rm -rf $remote
  & $adb push "$Out" '/sdcard/Download/' | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0) { throw "Η αποστολή στο tablet απέτυχε. Ξανατρέξε με το tablet συνδεδεμένο." }
  "Στάλθηκαν στο tablet: $remote. Στείλε 'refresh' στο Telegram για να φανούν οι νέες φωτογραφίες."
}

param(
  [string]$CustomerApk = '',
  [string]$RiderApk = ''
)

$ErrorActionPreference = 'Stop'
$destDir = Join-Path $PSScriptRoot '..' 'admin-web' 'public' 'downloads'
New-Item -ItemType Directory -Force -Path $destDir | Out-Null

function Install-Apk {
  param([string]$Source, [string]$DestName)
  if (-not $Source -or -not (Test-Path -LiteralPath $Source)) {
    Write-Host "Skip $DestName — source not found: $Source" -ForegroundColor Yellow
    return $false
  }
  $item = Get-Item -LiteralPath $Source
  if ($item.Length -lt 1MB) {
    Write-Host "Refusing $DestName — file is only $($item.Length) bytes (expected a real APK, usually 30–120 MB)." -ForegroundColor Red
    return $false
  }
  $dest = Join-Path $destDir $DestName
  Copy-Item -LiteralPath $Source -Destination $dest -Force
  $mb = [math]::Round($item.Length / 1MB, 2)
  Write-Host "Copied $DestName ($mb MB) -> $dest" -ForegroundColor Green
  return $true
}

$okCustomer = Install-Apk -Source $CustomerApk -DestName 'customer-app.apk'
$okRider = Install-Apk -Source $RiderApk -DestName 'rider-app.apk'

Write-Host ''
Write-Host 'Local: restart admin-web (npm run dev) — test /downloads/customer-app.apk' -ForegroundColor Cyan
Write-Host 'Deploy (same as before): commit APKs and push — they are tracked under admin-web/public/downloads/' -ForegroundColor Cyan
Write-Host '  git add admin-web/public/downloads/*.apk' -ForegroundColor DarkGray
Write-Host '  git commit -m "Update download APKs"' -ForegroundColor DarkGray
Write-Host '  git push' -ForegroundColor DarkGray
Write-Host ''
if (-not $okCustomer) {
  Write-Host 'Example:' -ForegroundColor DarkGray
  Write-Host '  .\scripts\publish-download-apks.ps1 -CustomerApk "C:\path\to\build.apk" -RiderApk "C:\path\to\rider.apk"' -ForegroundColor DarkGray
}
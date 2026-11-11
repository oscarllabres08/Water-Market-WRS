# Commit the WaterMarket project. Does not push.
# The current origin is still the previous client's repository.
# Set a new GitHub remote yourself before running git push.

param(
  [string]$Message = "Update WaterMarket"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$branch = git rev-parse --abbrev-ref HEAD
if ($LASTEXITCODE -ne 0) { throw "Not a git repository." }

$remote = git remote get-url origin 2>$null
if ($remote -match 'Water-Chaste') {
  Write-Host "Stopped. origin still points at the Water Chaste repository:" -ForegroundColor Yellow
  Write-Host "  $remote"
  Write-Host "Create a WaterMarket GitHub repo and point origin at it before pushing."
  exit 1
}

git add -A
$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host "No changes to commit." -ForegroundColor Yellow
  exit 0
}

git commit -m $Message
if ($LASTEXITCODE -ne 0) { throw "Commit failed." }

Write-Host "Committed on $branch. Push only after origin is the WaterMarket repository." -ForegroundColor Green

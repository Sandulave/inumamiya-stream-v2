param(
  [string]$WebBaseUrl = "https://stream.g1keibabattle.com",
  [switch]$SkipAnalysis
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $repoRoot "tools\highlight-analyzer\output"

Set-Location -LiteralPath $repoRoot

if (-not $SkipAnalysis) {
  pnpm archive:analyze
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Read-Host "Analysis failed. Press Enter to close"
    exit $LASTEXITCODE
  }
}

$latestAnalysis = Get-ChildItem -LiteralPath $outputDir -File -Filter "*.json" |
  Where-Object { $_.BaseName -match "^\d+$" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if ($null -eq $latestAnalysis) {
  Write-Host ""
  Write-Host "No analysis JSON found in $outputDir"
  Read-Host "Press Enter to close"
  exit 1
}

$vodId = $latestAnalysis.BaseName
$baseUrl = $WebBaseUrl.TrimEnd("/")
$url = "$baseUrl/archives/${vodId}?view=highlights"

Write-Host ""
Write-Host "Opening highlight explorer: $url"
Start-Process $url

Write-Host ""
Read-Host "Done. Press Enter to close"

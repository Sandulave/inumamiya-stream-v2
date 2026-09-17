param(
  [string]$WebBaseUrl = "https://stream.g1keibabattle.com",
  [string]$DiscordWebhookUrl = $env:DISCORD_ARCHIVE_ANALYSIS_WEBHOOK_URL,
  [string]$DiscordUsername = "Archive Analyzer",
  [switch]$SkipAnalysis
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $repoRoot "tools\highlight-analyzer\output"

Set-Location -LiteralPath $repoRoot

function Import-LocalEnvironment {
  param(
    [string[]]$Paths
  )

  foreach ($path in $Paths) {
    if (-not (Test-Path -LiteralPath $path)) {
      continue
    }

    Get-Content -LiteralPath $path | ForEach-Object {
      $line = $_.Trim()
      if ($line.Length -eq 0 -or $line.StartsWith("#") -or -not $line.Contains("=")) {
        return
      }

      $parts = $line.Split(@("="), 2, [System.StringSplitOptions]::None)
      $name = $parts[0].Trim()
      if ($name.Length -eq 0) {
        return
      }

      $value = $parts[1].Trim()
      if (
        ($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))
      ) {
        $value = $value.Substring(1, $value.Length - 2)
      }

      if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, "Process"))) {
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
      }
    }
  }
}

function Get-AnalysisFiles {
  if (-not (Test-Path -LiteralPath $outputDir)) {
    return @()
  }

  return Get-ChildItem -LiteralPath $outputDir -File -Filter "*.json" |
    Where-Object { $_.BaseName -match "^\d+$" }
}

function Get-AnalysisSnapshot {
  $snapshot = @{}
  Get-AnalysisFiles | ForEach-Object {
    $snapshot[$_.BaseName] = $_.LastWriteTimeUtc
  }
  return $snapshot
}

function ConvertFrom-Utf8Base64 {
  param(
    [string]$Value
  )

  return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Value))
}

function Convert-TwitchDurationToSeconds {
  param(
    [string]$Duration
  )

  if ([string]::IsNullOrWhiteSpace($Duration)) {
    return $null
  }

  $match = [regex]::Match($Duration, '^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$')
  if (-not $match.Success) {
    return $null
  }

  $hours = if ($match.Groups[1].Success) { [int]$match.Groups[1].Value } else { 0 }
  $minutes = if ($match.Groups[2].Success) { [int]$match.Groups[2].Value } else { 0 }
  $seconds = if ($match.Groups[3].Success) { [int]$match.Groups[3].Value } else { 0 }

  return ($hours * 3600) + ($minutes * 60) + $seconds
}

function Get-AnalysisDurationSeconds {
  param(
    [System.IO.FileInfo]$Analysis
  )

  try {
    $data = Get-Content -LiteralPath $Analysis.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    if (
      $data.durationSeconds -is [double] -or $data.durationSeconds -is [decimal] -or
      $data.durationSeconds -is [int] -or $data.durationSeconds -is [long]
    ) {
      return [int][Math]::Ceiling([double]$data.durationSeconds)
    }
  } catch {
    return $null
  }

  return $null
}

function Format-ArchiveDurationMinutes {
  param(
    [int]$DurationSeconds,
    [object]$Copy
  )

  $minutes = [int][Math]::Ceiling($DurationSeconds / 60)
  if ($minutes -lt 60) {
    return $Copy.minutes -f $minutes
  }

  $hours = [int][Math]::Floor($minutes / 60)
  $remainingMinutes = $minutes % 60
  if ($remainingMinutes -eq 0) {
    return $Copy.hours -f $hours
  }

  return $Copy.hoursWithMinutes -f $hours, $remainingMinutes
}

function Format-ArchiveTimeRange {
  param(
    [string]$PublishedAt,
    [int]$DurationSeconds,
    [object]$Copy
  )

  if ([string]::IsNullOrWhiteSpace($PublishedAt)) {
    return $null
  }

  try {
    $startedAt = [DateTimeOffset]::Parse($PublishedAt).ToOffset([TimeSpan]::FromHours(9))
    $culture = [System.Globalization.CultureInfo]::GetCultureInfo("ja-JP")
    $dateTimeFormat = "$($Copy.dateFormat) $($Copy.timeFormat)"
    if ($DurationSeconds -le 0) {
      return $startedAt.ToString($dateTimeFormat, $culture)
    }

    $endedAt = $startedAt.AddSeconds($DurationSeconds)
    if ($startedAt.Date -eq $endedAt.Date) {
      return $Copy.timeRange -f `
        $startedAt.ToString($Copy.dateFormat, $culture), `
        $startedAt.ToString($Copy.timeFormat, $culture), `
        $endedAt.ToString($Copy.timeFormat, $culture)
    }

    return $Copy.timeRangeAcrossDays -f `
      $startedAt.ToString($dateTimeFormat, $culture), `
      $endedAt.ToString($dateTimeFormat, $culture)
  } catch {
    return $null
  }
}

function Get-VodMetadataMap {
  param(
    [string]$BaseUrl
  )

  $metadataById = @{}
  $metadataUrl = "$BaseUrl/api/twitch/videos/inumamiya?first=100&sort=latest"

  try {
    # Windows PowerShell 5.1 misdecodes UTF-8 JSON when Content-Type omits charset.
    $httpResponse = Invoke-WebRequest -Uri $metadataUrl -Method Get -UseBasicParsing
    $response = [System.Text.Encoding]::UTF8.GetString($httpResponse.RawContentStream.ToArray()) | ConvertFrom-Json
    foreach ($video in @($response.videos)) {
      if ($null -ne $video.id) {
        $metadataById[[string]$video.id] = $video
      }
    }
  } catch {
    Write-Host "VOD metadata fetch failed: $($_.Exception.Message)"
  }

  return $metadataById
}

function New-ArchiveAnnouncementEmbed {
  param(
    [System.IO.FileInfo]$Analysis,
    [string]$BaseUrl,
    [hashtable]$MetadataById,
    [object]$Copy
  )

  $vodId = $Analysis.BaseName
  $url = "$BaseUrl/archives/$vodId`?view=highlights"
  $metadata = $MetadataById[$vodId]
  $durationSeconds = $null

  if ($null -ne $metadata) {
    $durationSeconds = Convert-TwitchDurationToSeconds $metadata.duration
  }

  if ($null -eq $durationSeconds -or $durationSeconds -le 0) {
    $durationSeconds = Get-AnalysisDurationSeconds $Analysis
  }

  $title = $Copy.archiveTitle
  if ($null -ne $metadata -and -not [string]::IsNullOrWhiteSpace($metadata.title)) {
    $title = ([regex]::Replace([string]$metadata.title, '\s+', ' ')).Trim()
    $titleInfo = [System.Globalization.StringInfo]::new($title)
    if ($titleInfo.LengthInTextElements -gt 80) {
      $title = $titleInfo.SubstringByTextElements(0, 79) + $Copy.ellipsis
    }
  }

  $range = $null
  if ($null -ne $metadata) {
    $range = Format-ArchiveTimeRange -PublishedAt $metadata.published_at -DurationSeconds $durationSeconds -Copy $Copy
  }

  $duration = $Copy.unknownDuration
  if ($durationSeconds -gt 0) {
    $duration = Format-ArchiveDurationMinutes -DurationSeconds $durationSeconds -Copy $Copy
  }

  $embed = @{
    author = @{ name = $Copy.heading }
    title = $title
    url = $url
    color = 0x8B5CF6
    fields = @(
      @{
        name = $Copy.timeLabel
        value = if ([string]::IsNullOrWhiteSpace($range)) { $Copy.unknownTime } else { $range }
        inline = $true
      },
      @{
        name = $Copy.durationLabel
        value = $duration
        inline = $true
      }
    )
    footer = @{ text = $Copy.footer }
  }

  if ($null -ne $metadata -and -not [string]::IsNullOrWhiteSpace($metadata.thumbnail_url)) {
    $thumbnailUrl = ([string]$metadata.thumbnail_url).
      Replace('%{width}', '320').Replace('%{height}', '180').
      Replace('{width}', '320').Replace('{height}', '180')
    $thumbnailUri = $null
    if (
      [Uri]::TryCreate($thumbnailUrl, [UriKind]::Absolute, [ref]$thumbnailUri) -and
      $thumbnailUri.Scheme -in @('http', 'https')
    ) {
      $embed.thumbnail = @{ url = $thumbnailUri.AbsoluteUri }
    }
  }

  return $embed
}

function Wait-DiscordRateLimit {
  param(
    [string]$Seconds
  )

  $delaySeconds = 0.0
  $validDelay = [double]::TryParse(
    $Seconds,
    [System.Globalization.NumberStyles]::Float,
    [System.Globalization.CultureInfo]::InvariantCulture,
    [ref]$delaySeconds
  )
  if (-not $validDelay -or $delaySeconds -lt 0 -or [double]::IsNaN($delaySeconds) -or [double]::IsInfinity($delaySeconds)) {
    $delaySeconds = 1.0
  }

  # Round up and leave a small margin so the next request is past the reset time.
  $remainingMilliseconds = [Math]::Ceiling($delaySeconds * 1000) + 100
  while ($remainingMilliseconds -gt 0) {
    $milliseconds = [int][Math]::Min(60000, $remainingMilliseconds)
    Start-Sleep -Milliseconds $milliseconds
    $remainingMilliseconds -= $milliseconds
  }
}

function Send-DiscordArchivePayload {
  param(
    [string]$WebhookUrl,
    [string]$Payload
  )

  $body = [System.Text.Encoding]::UTF8.GetBytes($Payload)
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      return Invoke-WebRequest `
        -Uri $WebhookUrl `
        -Method Post `
        -UseBasicParsing `
        -ContentType "application/json; charset=utf-8" `
        -Body $body `
        -ErrorAction Stop
    } catch {
      $response = $_.Exception.Response
      if ($null -eq $response -or [int]$response.StatusCode -ne 429 -or $attempt -eq 3) {
        throw
      }

      $retryAfter = $response.Headers['Retry-After']
      if ([string]::IsNullOrWhiteSpace($retryAfter)) {
        try {
          $rateLimit = $_.ErrorDetails.Message | ConvertFrom-Json
          $retryAfter = [string]$rateLimit.retry_after
        } catch {
          $retryAfter = $null
        }
      }

      Write-Host "Discord rate limit reached. Waiting before retrying this archive."
      Wait-DiscordRateLimit -Seconds $retryAfter
    }
  }
}

function Send-DiscordArchiveAnnouncement {
  param(
    [string]$WebhookUrl,
    [string]$Username,
    [object[]]$Analyses,
    [string]$BaseUrl
  )

  if ([string]::IsNullOrWhiteSpace($WebhookUrl)) {
    Write-Host "Discord webhook is not configured. Skipping announcement."
    return
  }

  if ($Analyses.Count -eq 0) {
    Write-Host "No newly analyzed archives. Skipping Discord announcement."
    return
  }

  try {
    # Keep Japanese copy editable while the launcher stays compatible with PowerShell 5.1.
    $copyPath = Join-Path $repoRoot "scripts\archive-announcement-copy.ja.json"
    $copy = Get-Content -LiteralPath $copyPath -Raw -Encoding UTF8 | ConvertFrom-Json

    # Confirm each post before moving on, preserving other webhook query parameters.
    $webhookUri = [UriBuilder]::new($WebhookUrl)
    $queryParts = @($webhookUri.Query.TrimStart('?').Split('&') |
      Where-Object { $_ -and $_ -notmatch '^wait=' })
    $webhookUri.Query = ($queryParts + @('wait=true')) -join '&'

    $metadataById = Get-VodMetadataMap -BaseUrl $BaseUrl
  } catch {
    Write-Host "Discord announcement setup failed: $($_.Exception.Message)"
    return
  }

  $sentCount = 0
  foreach ($analysis in $Analyses) {
    try {
      $embed = New-ArchiveAnnouncementEmbed -Analysis $analysis -BaseUrl $BaseUrl -MetadataById $metadataById -Copy $copy
      $embed.description = $copy.catchphrases | Get-Random
      $payload = @{
        username = $Username
        embeds = @($embed)
        allowed_mentions = @{ parse = @() }
      } | ConvertTo-Json -Depth 6

      $response = Send-DiscordArchivePayload -WebhookUrl $webhookUri.Uri.AbsoluteUri -Payload $payload
      $sentCount++
      Write-Host "Discord announcement sent for archive $($analysis.BaseName)."

      if ($analysis -ne $Analyses[-1] -and $response.Headers['X-RateLimit-Remaining'] -eq '0') {
        Wait-DiscordRateLimit -Seconds $response.Headers['X-RateLimit-Reset-After']
      }
    } catch {
      Write-Host "Discord announcement failed for archive $($analysis.BaseName): $($_.Exception.Message)"
      if ([int]$_.Exception.Response.StatusCode -in @(401, 403, 404, 429)) {
        Write-Host "Stopping announcements because the webhook is unavailable or still rate limited."
        break
      }
    }
  }

  Write-Host "Discord announcements complete: $sentCount/$($Analyses.Count) sent."
}

Import-LocalEnvironment -Paths @(
  (Join-Path $repoRoot ".env.local"),
  (Join-Path $repoRoot ".env")
)

if ([string]::IsNullOrWhiteSpace($DiscordWebhookUrl)) {
  $DiscordWebhookUrl = $env:DISCORD_ARCHIVE_ANALYSIS_WEBHOOK_URL
}

if ($DiscordUsername -eq "Archive Analyzer") {
  $DiscordUsername = ConvertFrom-Utf8Base64 "44Ki44O844Kr44Kk44OW6Kej5p6Q"
}

$beforeAnalysis = Get-AnalysisSnapshot

if (-not $SkipAnalysis) {
  pnpm archive:analyze
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Read-Host "Analysis failed. Press Enter to close"
    exit $LASTEXITCODE
  }
}

$analysisFiles = Get-AnalysisFiles
$newlyAnalyzed = $analysisFiles |
  Where-Object {
    -not $beforeAnalysis.ContainsKey($_.BaseName) -or
    $_.LastWriteTimeUtc -gt $beforeAnalysis[$_.BaseName]
  } |
  Sort-Object LastWriteTime -Descending

$baseUrl = $WebBaseUrl.TrimEnd("/")

Send-DiscordArchiveAnnouncement `
  -WebhookUrl $DiscordWebhookUrl `
  -Username $DiscordUsername `
  -Analyses @($newlyAnalyzed) `
  -BaseUrl $baseUrl

$latestAnalysis = $analysisFiles |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if ($null -eq $latestAnalysis) {
  Write-Host ""
  Write-Host "No analysis JSON found in $outputDir"
  Read-Host "Press Enter to close"
  exit 1
}

$vodId = $latestAnalysis.BaseName
$url = "$baseUrl/archives/${vodId}?view=highlights"

Write-Host ""
Write-Host "Opening highlight explorer: $url"
Start-Process $url

Write-Host ""
Read-Host "Done. Press Enter to close"

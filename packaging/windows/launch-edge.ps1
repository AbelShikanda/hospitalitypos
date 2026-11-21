$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$state = Join-Path $env:LOCALAPPDATA "HospitalityPOS"
New-Item -ItemType Directory -Force -Path $state | Out-Null

$log = Join-Path $state "launcher.log"
$outLog = Join-Path $state "stdout.log"
$errLog = Join-Path $state "stderr.log"

function Write-Log([string]$message) {
  Add-Content -Path $log -Value ((Get-Date).ToString("o") + " " + $message)
}

$port = if ($env:POS_PORT) { $env:POS_PORT } else { "4000" }
$url = "http://127.0.0.1:$port"

function Test-Healthy {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "$url/api/health"
    return ($response.Content -match '"status"\s*:\s*"ok"')
  } catch {
    return $false
  }
}

function Wait-Healthy([int]$tries = 60) {
  for ($i = 0; $i -lt $tries; $i++) {
    if (Test-Healthy) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Open-App {
  if ($env:POS_NO_OPEN -eq "1") { Write-Log "POS_NO_OPEN=1; not opening a browser"; return }

  $browsers = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
  )

  foreach ($browser in $browsers) {
    if ($browser -and (Test-Path $browser)) {
      Start-Process -FilePath $browser -ArgumentList @("--app=$url")
      Write-Log "Opened $browser --app=$url"
      return
    }
  }

  Start-Process $url
  Write-Log "Opened default browser $url"
}

Write-Log "Launcher invoked"

if (Test-Healthy) {
  Write-Log "Already running at $url"
  Open-App
  exit 0
}

$compose = Join-Path $root "docker\edge\docker-compose.yml"
if ((Test-Path $compose) -and (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Log "Starting edge via docker compose"
  & docker compose -f $compose up -d 2>&1 | Out-File -Append -FilePath $log
  if (Wait-Healthy 90) { Open-App; exit 0 }
  Write-Log "Edge server did not become healthy"
  exit 1
}

$edgePkg = Join-Path $root "apps\edge\package.json"
if ((Test-Path $edgePkg) -and (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Log "Starting edge via pnpm"
  Start-Process -FilePath "pnpm" `
    -ArgumentList @("--filter", "@hpos/edge", "start") `
    -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput $outLog -RedirectStandardError $errLog
  if (Wait-Healthy 60) { Open-App; exit 0 }
  Write-Log "Edge server did not become healthy"
  exit 1
}

$preview = Join-Path $root "scripts\preview-server.mjs"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Log "Node.js is required"
  exit 1
}

Write-Log "Starting preview server"
Start-Process -FilePath "node" `
  -ArgumentList @("`"$preview`"", "--host", "127.0.0.1", "--port", $port) `
  -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog

if (Wait-Healthy 20) { Open-App; exit 0 }
Write-Log "Preview server failed"
exit 1

param(
  [string]$Output = "renders\developer-radar-$(Get-Date -Format yyyy-MM-dd)-voiceover-final.mp4",
  [string]$Quality = "draft",
  [string]$VoiceRate = "-4%"
)

$ErrorActionPreference = "Stop"

function Assert-LastExitCode {
  param([string]$Step)
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE"
  }
}

function Resolve-Tool {
  param(
    [string]$Name,
    [string]$EnvName
  )
  $configured = [Environment]::GetEnvironmentVariable($EnvName)
  if ($configured) {
    if (Test-Path $configured) {
      return $configured
    }
    throw "$EnvName points to a missing executable: $configured"
  }
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  throw "Required executable not found: $Name. Install it or set $EnvName."
}

$Root = Split-Path -Parent $PSScriptRoot
$Node = Resolve-Tool "node" "NODE_EXE"
$Python = Resolve-Tool "python" "PYTHON_EXE"
$NpxCli = Resolve-Tool "npx" "NPX_EXE"
$Chrome = $env:HYPERFRAMES_BROWSER_PATH
if (!$Chrome) {
  $ChromeCandidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  )
  $Chrome = $ChromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
$FfmpegDir = Join-Path $Root "node_modules\@ffmpeg-installer\win32-x64"
$FfprobeDir = Join-Path $Root "node_modules\@ffprobe-installer\win32-x64"
$Ffmpeg = Join-Path $FfmpegDir "ffmpeg.exe"
$LocalPythonPackages = Join-Path $Root ".python-packages"
$NpmCache = Join-Path $Root ".npm-cache"
$Narration = Join-Path $Root "assets\narration.mp3"
$Timings = Join-Path $Root "data\timings.json"
$VideoOnly = Join-Path $Root "renders\developer-radar-video-only.mp4"
$Final = Join-Path $Root $Output
$SiteThumb = Join-Path $Root "renders\site-latest-thumbnail.png"

Set-Location $Root
$env:PATH = "$FfmpegDir;$FfprobeDir;$env:PATH"
if ($Chrome) {
  $env:HYPERFRAMES_BROWSER_PATH = $Chrome
}
New-Item -ItemType Directory -Force -Path $NpmCache | Out-Null
$env:npm_config_cache = $NpmCache
$env:NPM_CONFIG_CACHE = $NpmCache
if (Test-Path $LocalPythonPackages) {
  $env:PYTHONPATH = "$LocalPythonPackages;$env:PYTHONPATH"
}

& $Node "scripts\topic-history.mjs" check --days 7
Assert-LastExitCode "Topic history check"
& $Python -c "import edge_tts; print(edge_tts.__file__)"
Assert-LastExitCode "Edge TTS dependency check"
& $Python "scripts\generate-aligned-voiceover.py" --voice "zh-CN-YunxiNeural" --rate=$VoiceRate
Assert-LastExitCode "Edge Neural TTS generation"
$NarrationForMux = $Narration

& $Node "scripts\build-video.mjs"
Assert-LastExitCode "HyperFrames composition build"
& $NpxCli --yes "hyperframes@0.6.34" render --quality $Quality --output $VideoOnly
Assert-LastExitCode "HyperFrames render"

$Duration = 70
if (Test-Path $Timings) {
  $Duration = [double]((Get-Content -Raw -Encoding UTF8 $Timings | ConvertFrom-Json).totalDuration)
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Final) | Out-Null
& $Ffmpeg -y `
  -i $VideoOnly `
  -i $NarrationForMux `
  -f lavfi -t 8 `
  -i "anullsrc=channel_layout=mono:sample_rate=44100" `
  -filter_complex "[1:a]aresample=44100[a1];[a1][2:a]concat=n=2:v=0:a=1[a]" `
  -map "0:v:0" `
  -map "[a]" `
  -t $Duration `
  -c:v copy `
  -c:a aac `
  -b:a 160k `
  -movflags +faststart `
  $Final
Assert-LastExitCode "FFmpeg audio mux"

Write-Host "Wrote $Final"
& $Node "scripts\topic-history.mjs" record --video $Final
Assert-LastExitCode "Topic history record"
& $Ffmpeg -y -ss 2 -i $Final -frames:v 1 $SiteThumb
Assert-LastExitCode "Thumbnail extraction"
& $Node "scripts\export-site-data.mjs" --video $Final --thumbnail $SiteThumb
Assert-LastExitCode "Website data export"

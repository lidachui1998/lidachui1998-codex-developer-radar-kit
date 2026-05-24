param(
  [string]$Output = "renders\developer-radar-$(Get-Date -Format yyyy-MM-dd)-voiceover-final.mp4",
  [string]$Quality = "draft"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Node = if ($env:NODE_EXE) { $env:NODE_EXE } else { "node" }
$Python = if ($env:PYTHON_EXE) { $env:PYTHON_EXE } else { "python" }
$Npx = if ($env:NPX_EXE) { $env:NPX_EXE } else { "npx" }
$Chrome = $env:HYPERFRAMES_BROWSER_PATH
$FfmpegDir = Join-Path $Root "node_modules\@ffmpeg-installer\win32-x64"
$FfprobeDir = Join-Path $Root "node_modules\@ffprobe-installer\win32-x64"
$Ffmpeg = Join-Path $FfmpegDir "ffmpeg.exe"
$Narration = Join-Path $Root "assets\narration.mp3"
$Timings = Join-Path $Root "data\timings.json"
$VideoOnly = Join-Path $Root "renders\developer-radar-video-only.mp4"
$Final = Join-Path $Root $Output
$SiteThumb = Join-Path $Root "renders\site-latest-thumbnail.png"

Set-Location $Root
if (Test-Path $FfmpegDir) {
  $env:PATH = "$FfmpegDir;$FfprobeDir;$env:PATH"
}
if ($Chrome) {
  $env:HYPERFRAMES_BROWSER_PATH = $Chrome
}

& $Node "scripts\topic-history.mjs" check --days 7
& $Python -c "import edge_tts; print(edge_tts.__file__)"
& $Python "scripts\generate-aligned-voiceover.py" --voice "zh-CN-YunxiNeural" --rate=-8%
$NarrationForMux = $Narration

& $Node "scripts\build-video.mjs"
& $Npx --yes "hyperframes@0.6.34" render --quality $Quality --output $VideoOnly

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

Write-Host "Wrote $Final"
& $Node "scripts\topic-history.mjs" record --video $Final
& $Ffmpeg -y -ss 2 -i $Final -frames:v 1 $SiteThumb
& $Node "scripts\export-site-data.mjs" --video $Final --thumbnail $SiteThumb

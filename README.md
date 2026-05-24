# Codex Developer Radar Kit

Daily developer hot-topic video workflow for Douyin, TikTok, and Shorts.

This kit contains:

- multi-source topic fetchers for GitHub Trending, Hacker News, Product Hunt, and extra feeds
- topic history dedupe so recent projects are not repeated
- Chinese narration and Edge Neural TTS voiceover scripts
- HyperFrames rendering scripts for vertical videos
- a Cloudflare Worker static website template
- a Codex skill and an automation template for daily 22:30 generation

Production site example: https://radar.bjca.xyz/

## Setup

```powershell
npm install
npm install --save-dev @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe
python -m pip install edge-tts
```

Optional environment variables:

```powershell
$env:PYTHON_EXE = "python"
$env:NODE_EXE = "node"
$env:HYPERFRAMES_BROWSER_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$env:CLOUDFLARE_API_TOKEN = "<your-cloudflare-api-token>"
```

## Daily Workflow

```powershell
npm run fetch:topics
node scripts/topic-history.mjs check --days 7
npm run render:voiceover
npm run site:export
npm --prefix site run build:worker
npm run site:deploy
```

After publishing the Douyin video, add the real video URL:

```powershell
npm run site:set-douyin -- YYYY-MM-DD https://www.douyin.com/video/...
npm run site:export
npm run site:deploy
```

## Codex Skill

The reusable skill template is in:

```text
skills/github-trending-douyin-video/SKILL.md
```

Install it into your Codex skills directory, then use it when asking Codex to generate or refresh a daily developer hot-topic video.

## Automation

The automation template is in:

```text
automations/daily-github-hot-project-video.template.toml
```

Replace placeholders such as `<YOUR_PROJECT_DIR>` and `<YOUR_REPO_URL>` before creating the automation in Codex.

## Website

The Cloudflare Worker site lives under `site/`.

```powershell
npm --prefix site run serve
npm --prefix site run build:worker
npm run site:deploy
```

The site data is generated into:

```text
site/public/data/days.json
```

Do not commit local video paths, API tokens, rendered MP4 files, or machine-specific paths.

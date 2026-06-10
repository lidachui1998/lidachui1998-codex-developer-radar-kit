# Codex Developer Radar Kit

Daily developer hot-topic video workflow for Douyin, TikTok, and Shorts.

This kit contains:

- multi-source topic fetchers for GitHub Trending, Hacker News, Product Hunt, and extra feeds
- topic history dedupe so recent projects are not repeated
- Chinese narration and Edge Neural TTS voiceover scripts
- HyperFrames rendering scripts for vertical videos
- a Cloudflare Worker static website template
- WeChat public-account article draft generation and local publishing manager
- a Codex skill and an automation template for daily 22:30 generation, Douyin publishing, and site deployment

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
$env:HYPERFRAMES_BROWSER_PATH = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
$env:CLOUDFLARE_API_TOKEN = "<your-cloudflare-api-token>"
$env:WECHAT_APP_ID = "<optional-wechat-app-id>"
$env:WECHAT_APP_SECRET = "<optional-wechat-app-secret>"
$env:WECHAT_THUMB_MEDIA_ID = "<optional-wechat-cover-thumb-media-id>"
```

## Daily Workflow

```powershell
npm run fetch:topics
node scripts/topic-history.mjs check --days 7
npm run render:voiceover
npm run site:export
npm run wechat:generate -- YYYY-MM-DD
npm --prefix site run build:worker
npm run site:deploy
```

The Codex automation should publish the validated final MP4 through the authenticated Douyin Creator Center flow when available, fill title/description copy, and choose relevant hot-topic tags if the UI offers them. If login, CAPTCHA, or account selection is required, let the user complete it and then continue from that browser session.

When a public Douyin URL is visible, record the real video URL and redeploy. If the work is still under review, leave the site button pending instead of inventing a URL:

```powershell
npm run site:set-douyin -- YYYY-MM-DD https://www.douyin.com/video/...
npm run site:export
npm run site:deploy
```

## WeChat Publishing Manager

Generate daily article drafts:

```powershell
npm run wechat:generate -- YYYY-MM-DD
npm run wechat:generate:all
```

Open the local manager, copy rich text into the WeChat editor, then paste the published article URL back into the manager:

```powershell
npm run wechat:manager
```

If your account has API permissions, you can create a WeChat draft or submit publishing through the API:

```powershell
npm run wechat:publish -- --date YYYY-MM-DD --mode draft
npm run wechat:publish -- --date YYYY-MM-DD --mode publish
```

API publishing requires AppID, AppSecret, IP whitelist access, and a cover `thumb_media_id`. Personal subscription accounts may not have all required publishing permissions.

The manager updates:

```text
wechat/articles.json
site/public/data/wechat.json
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

---
name: github-trending-douyin-video
description: Generate and publish vertical Douyin-ready short videos from daily developer and AI hot topics using HyperFrames. Use when Codex needs to pull GitHub Trending, Hacker News, Product Hunt, Hugging Face, arXiv, RSS, or other trend sources; select topics; write Chinese short-video narration; generate voiceover; publish through Douyin Creator Center when an authenticated flow is available; update a Cloudflare Worker website; prepare WeChat public-account articles; or prepare a recurring developer hot-topic video workflow for Douyin, TikTok, or Shorts.
---

# GitHub Trending Douyin Video

## Purpose

Turn daily developer and AI trend sources into a 9:16 short video: a fast hook, seven ranked topics, readable Chinese takeaways, synchronized voiceover/subtitle copy, trend metrics, a closing CTA, and a matching WeChat public-account article.

Use HyperFrames as the default renderer.

## Runtime Setup

Use environment variables instead of hardcoded machine paths:

```powershell
$env:NODE_EXE = "node"
$env:PYTHON_EXE = "python"
$env:HYPERFRAMES_BROWSER_PATH = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
```

Install local FFmpeg binaries if system FFmpeg is missing:

```powershell
npm install --save-dev @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe
```

## Workflow

1. Fetch current candidate topics with `node scripts/fetch-hot-topics.mjs`.
2. Select seven topics by default, using GitHub Trending, Hacker News, Product Hunt, Hugging Face, arXiv, RSS, or other configured sources.
3. Compare selected items against `data/topic-history.json` and avoid any project or URL used in the last 7 days.
4. Rewrite `angle`, `voiceover`, and `narration` into concise Chinese short-video copy.
5. Open with a topic-first hook such as "今日热门项目" or "今日 AI 开发者热点". Codex-generated-video copy belongs in a smaller secondary badge or later voiceover line, not as the main first-frame headline.
6. Generate voiceover with `zh-CN-YunxiNeural` at about `-4%` rate using `scripts/generate-aligned-voiceover.py`.
7. Render with HyperFrames and mux the final MP4 with an AAC audio stream.
8. Record successful topics back into `data/topic-history.json`.
9. Export website data into `site/public/data/days.json`.
10. Publish the validated final MP4 to Douyin by default when an authenticated uploader/account flow is available. If login, CAPTCHA, account selection, or another manual gate appears, pause for the user to complete it, then continue from that session.
11. Use concise Chinese title/description copy, keep the public `回复 Codex` resource CTA, and choose a few relevant Douyin hot-topic tags when the UI offers them. Prefer matching popular topics over generic traffic tags.
12. Verify the Creator Center or Works Management status after publishing. If the work is `审核中`, report it as submitted for review and do not invent a public URL. If a public Douyin URL is visible, record it with `node scripts/set-douyin-link.mjs YYYY-MM-DD <douyin-url>` and rerun `node scripts/export-site-data.mjs`.
13. Generate the daily WeChat public-account article draft with `npm run wechat:generate -- YYYY-MM-DD`, or backfill all current days with `npm run wechat:generate:all`. Regenerate it after recording a Douyin URL so article/site metadata stays current.
14. Keep WeChat articles publishable, not just data lists: include a hook, conclusion, per-project "why it matters", "who it is for", source links, and a final resource CTA.
15. Use `npm run wechat:manager` to open the local publishing manager. Prefer "copy rich text" for manual WeChat editor publishing, then record the published article URL.
16. If the account has API publishing permissions, configure `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, and `WECHAT_THUMB_MEDIA_ID`, or the matching fields in `wechat/config.json`, then use `npm run wechat:publish -- --date YYYY-MM-DD --mode draft` or `--mode publish`. If credentials, IP whitelist, media ID, or account permissions are missing, report the blocker instead of claiming publication.
17. Keep the public website tutorial linked to the GitHub repository, skill template, automation template, and WeChat publishing manager. Do not expose local Windows paths on the public website.
18. Attempt Cloudflare Worker deployment with `npm run site:deploy` after every successful website data update. Deploy when credentials are available; if authentication is blocked, report the blocker and include the local website data path or preview URL.

## Voiceover

Use Edge Neural TTS:

```powershell
python scripts/generate-aligned-voiceover.py --voice zh-CN-YunxiNeural --rate=-4%
```

Do not use Windows SAPI voices for automated drafts. If `zh-CN-YunxiNeural` cannot be generated, fail the run and report the dependency or network problem instead of rendering a wrong-voice video.

## Automation Prompt Pattern

Ask Codex to:

- work in `<YOUR_PROJECT_DIR>`
- fetch multi-source candidates
- select seven topics
- avoid repeats from the last 7 days
- write Chinese Douyin copy
- render with `scripts/render-with-voiceover.ps1`
- update `site/public/data/days.json`
- publish the validated MP4 to Douyin automatically when the authenticated Creator Center flow is available
- choose a few relevant Douyin hot-topic tags during publishing when the UI offers them
- record the public Douyin URL in `site/data/douyin-links.json` when visible, or leave the site button pending while the work is under review
- generate the WeChat public-account article draft with `npm run wechat:generate -- YYYY-MM-DD`
- keep WeChat articles rich enough for publication, with conclusion, project value, suitable audience, links, and resource CTA
- keep `site/data/douyin-links.json` as the source of Douyin links
- keep the public tutorial linked to `<YOUR_REPO_URL>`
- attempt Cloudflare Worker deployment after every successful website data update
- report source URLs, selected topics, output MP4 path, audio verification, website data path, WeChat draft path, publish status, deployed URL, and warnings

Publish to Douyin automatically for this recurring daily workflow when the uploader/account flow is available. Do not publish to WeChat automatically unless the user explicitly asks and the relevant account/API flow is available.

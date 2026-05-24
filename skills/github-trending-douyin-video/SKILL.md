---
name: github-trending-douyin-video
description: Generate vertical Douyin-ready short videos from daily developer and AI hot topics using HyperFrames. Use when Codex needs to pull GitHub Trending, Hacker News, Product Hunt, Hugging Face, arXiv, RSS, or other trend sources; select topics; write Chinese short-video narration; generate voiceover; update a Cloudflare Worker website; or prepare a recurring developer hot-topic video workflow for Douyin, TikTok, or Shorts.
---

# GitHub Trending Douyin Video

## Purpose

Turn daily developer and AI trend sources into a 9:16 short video: a fast hook, seven ranked topics, readable Chinese takeaways, synchronized voiceover/subtitle copy, trend metrics, and a closing CTA.

Use HyperFrames as the default renderer.

## Runtime Setup

Use environment variables instead of hardcoded machine paths:

```powershell
$env:NODE_EXE = "node"
$env:PYTHON_EXE = "python"
$env:HYPERFRAMES_BROWSER_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
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
6. Generate voiceover with `zh-CN-YunxiNeural` at about `-8%` rate using `scripts/generate-aligned-voiceover.py`.
7. Render with HyperFrames and mux the final MP4 with an AAC audio stream.
8. Record successful topics back into `data/topic-history.json`.
9. Export website data into `site/public/data/days.json`.
10. Keep the public website tutorial linked to the GitHub repository, skill template, and automation template. Do not expose local Windows paths on the public website.
11. Deploy the Cloudflare Worker website when credentials are available.

## Voiceover

Use Edge Neural TTS:

```powershell
python scripts/generate-aligned-voiceover.py --voice zh-CN-YunxiNeural --rate=-8%
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
- keep `site/data/douyin-links.json` as the source of Douyin links
- keep the public tutorial linked to `<YOUR_REPO_URL>`
- deploy the Cloudflare Worker site
- report source URLs, selected topics, output MP4 path, audio verification, website data path, deployed URL, and warnings

Do not publish to Douyin automatically unless the user explicitly asks and the uploader/account flow is available.

---
name: github-trending-douyin-video
description: Generate and publish vertical Douyin-ready short videos from daily developer and AI hot topics using HyperFrames. Use when Codex needs to pull GitHub Trending, Hacker News, Product Hunt, Hugging Face, arXiv, RSS, or other trend sources; select topics; write Chinese short-video narration; generate voiceover; refresh the local github-daily-hot-video project; validate a HyperFrames composition; render MP4 drafts with audio; publish through Douyin Creator Center; update the Cloudflare Worker website; or prepare a recurring developer hot-topic video workflow for Douyin, TikTok, or Shorts.
---

# GitHub Trending Douyin Video

## Purpose

Turn daily developer and AI trend sources into a 9:16 short video: a fast hook, ranked topics, readable Chinese takeaways, synchronized voiceover/subtitle copy, trend metrics, and a neutral recap outro.

Use HyperFrames as the default renderer. Remotion is acceptable only when the user specifically asks for a React/Remotion implementation.

## Visual Quality Baseline

Starting with the 2026-07-08 daily run, treat viewer feedback that the prior video looked weak as a standing product requirement. Each daily run should preserve the Developer Radar identity but use a visibly more polished editorial-tech layout than the old flat grid/card version.

- Prefer a template-level upgrade in `scripts/build-video.mjs` over one-off edits to `index.html`, so future runs inherit the improved look.
- Use layered full-frame composition: strong first-frame headline, source/date rail, hero topic module, ranked topic scenes, accent bands, depth, typography contrast, and readable phone-scale hierarchy.
- Avoid a generic dark dashboard made only of repeated cards, tiny labels, plain grid backgrounds, or a single neon accent. Mix mint, amber, coral, and blue accents with restrained contrast.
- Keep cards at 8px radius or less, avoid cards inside cards, and keep the whole video from feeling like a web dashboard screenshot.
- Before publishing, run lint/inspect and do a visual sanity pass from the generated frames or preview. If the video looks visually flat, repetitive, cramped, or text-heavy, revise the generator before rendering the final MP4.
- Keep all Douyin audit constraints intact: no external-channel guidance, no reply keywords, no links, and no WeChat/public-account prompts in the video, title, or description.

## Audience Attraction Baseline

Starting with the follow-up feedback on 2026-07-08, do not treat "more polished" or "more cool" as sufficient. The video must create a reason to stop scrolling in the first three seconds and a reason to keep watching each topic.

- Write every daily run as benefit/problem-driven short-video copy, not as a project directory. The opening should answer: what can a developer avoid, improve, or decide after watching?
- Keep the first frame topic-first, but make the main headline a sharper promise when possible, for example "今天这 7 个，帮你少踩 Agent 的坑" instead of only "今日 AI 开发者热点".
- For each selected topic, add or derive viewer-facing fields such as `problem`, `payoff`, and `audience`. Show the problem/payoff first, then use the project name, source, and metrics as evidence.
- Prefer scenes that say "why this matters to your workflow/team" before showing stars, source badges, or repo metadata.
- Group the seven topics into memorable themes when possible, such as productivity, security, research automation, and tooling. Use these as hook chips or recap language.
- Keep voiceover conversational and tense: one sentence should usually contain a concrete action or risk, not only a neutral description.
- During visual review, reject any draft that reads like a static briefing page even if it is clean and animated. Revise the hook, information order, and visual hierarchy before rendering final output.

## Runtime Setup

Use a current Node.js runtime for HyperFrames. If your default `node` is too old, put a newer Node.js `bin` directory at the front of `PATH` before running project commands:

```powershell
$env:PATH = '<NODE_BIN_DIR>;' + $env:PATH
```

If HyperFrames cannot find its cached headless browser, point it at a locally installed Chrome or Chromium executable:

```powershell
$env:HYPERFRAMES_BROWSER_PATH = '<CHROME_OR_CHROMIUM_EXE>'
```

If system FFmpeg is missing, install project-local binaries:

```powershell
npm install --save-dev @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe
$env:PATH = "$PWD\node_modules\@ffmpeg-installer\win32-x64;$PWD\node_modules\@ffprobe-installer\win32-x64;" + $env:PATH
```

## Workflow

1. Fetch current candidate topics.
   - Use `scripts/fetch-hot-topics.mjs` in the video project for GitHub Trending, Hacker News, and Product Hunt candidates.
   - Add Hugging Face, arXiv, RSS feeds, or Chinese platforms when the user asks for those sources and access is available.
   - Preserve source URL, generated time, source name, title, metric labels, and source-specific hotness signals.

2. Select and rewrite the five strongest topics for Douyin.
   - Use short Chinese value propositions, not direct translations.
   - Explain why a developer should care in one sentence.
   - Prefer seven selected topics when the user wants a richer roundup; otherwise use five for shorter videos.
   - Before rendering, compare selected items against `data/topic-history.json` and avoid projects used in the last 7 days. If too few fresh GitHub items remain, fill from Hacker News, Product Hunt, Hugging Face, arXiv, or RSS rather than repeating recent repos.
   - Write `angle`, `voiceover`, and top-level `narration`.
   - For seven-topic videos, keep each item voiceover tight, usually one sentence under about 45 Chinese characters.
   - Avoid overclaiming beyond the source text and visible metrics.

3. Build a HyperFrames project.
   - Use 1080x1920, 25 to 40 seconds.
   - Structure: topic-first hook, ranked topic scenes, CTA-only outro.
   - First screen must tell viewers what the video is about, such as "今日热门项目" or "今日 AI 开发者热点". Codex-generated-video copy belongs in a smaller secondary badge or later voiceover line, not as the main first-frame headline.
   - Keep text large enough for phone viewing.
   - Define visual identity in `DESIGN.md` before writing composition HTML.
   - Add `<audio>` for `assets/narration.mp3`, but verify the final MP4 with ffprobe because some renders may need ffmpeg muxing.
   - Do not show internal labels like "automatic topic pool", "default sources", or backend workflow details in the final video.
   - Do not put any external-channel guidance in the video, title, description, or first-frame copy: avoid mentioning the WeChat public account, reply keywords, external links, downloads, private messages, or similar off-platform prompts. If you need to add a resource note after publishing, use one Douyin-native comment with only project names or a short neutral summary, without links or external guidance.

4. Validate before rendering.

```powershell
npx --yes hyperframes@0.6.34 lint --verbose
npx --yes hyperframes@0.6.34 inspect --samples 12
```

5. Generate voiceover and render a review draft.

```powershell
npm run render:voiceover
```

Use a natural neural voice by default: `zh-CN-YunxiNeural` at about `-4%` rate. Prefer `scripts/generate-aligned-voiceover.py` when available: generate hook/topic/outro audio as separate segments, measure each segment with ffprobe, write `data/timings.json`, then rebuild the HyperFrames scene timings from those measured durations. This prevents the voiceover from outrunning or lagging behind the visuals. Keep the full script under roughly 320 to 420 Chinese characters for a seven-topic video. Render `--quality high` only after the user approves the draft pacing and copy.

6. Publish the validated MP4 to Douyin.
   - For this user's recurring daily automation, Douyin publication is a default post-render step when an authenticated uploader/account flow is available.
   - Prefer the user's authenticated main Chrome for interactive publishing. For unattended or catch-up publishing, use `scripts/publish-douyin-batch.cjs`: it opens one persistent browser, defaults to a direct connection, reuses the authenticated session, and processes multiple metadata files without exporting cookies. If login, CAPTCHA, account selection, or another manual gate appears, pause for the user to complete it, then continue from that session.
   - Write Douyin publish metadata to a UTF-8 JSON file before opening the uploader, for example `data/douyin-publish-YYYY-MM-DD.json` with `date`, `video`, `title`, `description`, and `duration`.
   - Run `npm run douyin:publish -- --metadata data/douyin-publish-YYYY-MM-DD.json --validate-only` before upload, then remove `--validate-only` to publish. For backfills, repeat `--metadata` in chronological order so one browser publishes every missing date. The batch script uses the official upload UI and the authenticated `work_list` GET endpoint for duplicate/status checks; do not extract, print, or persist raw cookies. Do not pass Chinese `--title` or `--desc` through PowerShell command-line arguments, here-strings, pipes, or copied terminal snippets.
   - Abort publishing if the title or description contains `??`, `????`, replacement characters, or other obvious mojibake. Regenerate the UTF-8 JSON instead of manually fixing corrupted text in the Douyin form.
   - Upload the final `*-voiceover-final.mp4`, fill a concise Chinese title and description from the selected topics, keep them free of external-channel guidance, and choose a few relevant hot-topic tags when the UI offers them. Prefer matching popular topics over generic traffic tags. If a resource note is still useful after publish, add one Douyin-native comment with project names only.
   - After clicking publish, verify the Creator Center or Works Management status. If the work is still `审核中`, report it as submitted for review and do not invent a public URL.
   - When a public Douyin URL is visible, run `node scripts/set-douyin-link.mjs YYYY-MM-DD <douyin-url>` and rerun `node scripts/export-site-data.mjs`; if the URL is not visible yet, keep today's website button pending.

7. Update the Cloudflare Worker website data.
   - After successful rendering, `scripts\render-with-voiceover.ps1` should export a thumbnail and `site/public/data/days.json` via `scripts/export-site-data.mjs`.
   - Douyin URLs live in `site/data/douyin-links.json`; update them with `node scripts/set-douyin-link.mjs YYYY-MM-DD <douyin-url>` after the video is published, then rerun `node scripts/export-site-data.mjs`.
   - The site is under `site/`, with source files in `site/public` and a generated Worker bundle at `site/dist/worker.mjs`.
   - `site/public/index.html` includes a public generation tutorial with GitHub repository links, the daily workflow, skill template, and automation template. Do not expose local Windows paths on the public website.
   - Attempt `npm run site:deploy` after every successful website data update. Deploy when Wrangler has a valid login or `CLOUDFLARE_API_TOKEN`; if authentication is blocked, report the blocker and include the local website data path or preview URL. The Worker is `codex-developer-radar`, currently available at `https://radar.bjca.xyz/`.

8. Generate WeChat public-account article drafts.
   - Run `npm run wechat:generate -- YYYY-MM-DD` after `site/public/data/days.json` is updated, or `npm run wechat:generate:all` when backfilling previous days.
   - Drafts are stored in `wechat/articles/YYYY-MM-DD.md` and `wechat/articles/YYYY-MM-DD.html`, with status in `wechat/articles.json`. The article should be a publishable WeChat graphic article, not a bare data list: include a hook, conclusion, per-project "why it matters", "who it is for", source links, and a final resource CTA.
   - Use `npm run wechat:manager` to open the local publishing manager. Prefer the "copy rich text" action for manual WeChat editor publishing, then record the published article URL.
   - If the account has API publishing permissions, configure `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, and `WECHAT_THUMB_MEDIA_ID`, or the matching fields in `wechat/config.json`, then use `npm run wechat:publish -- --date YYYY-MM-DD --mode draft` or `--mode publish`. If credentials, IP whitelist, media ID, or account permissions are missing, report the blocker instead of pretending to publish.
   - The public site reads `site/public/data/wechat.json` to show WeChat article status and links. Do not publish local Windows paths.

9. Start Studio preview when useful.

```powershell
npx --yes hyperframes@0.6.34 preview --port 3017
```

Return the Studio URL in this form: `http://localhost:3017/#project/github-daily-hot-video`.

## Local Sample Project

Work from the project directory that contains `package.json`, `index.html`, `scripts/`, `site/`, and `wechat/`:

```text
<YOUR_PROJECT_DIR>
```

Use it as the base template when the user asks to "do today's one", "refresh the GitHub video", or "make another daily hot-project video".

## Voiceover

For Chinese voiceover on this Windows machine, prefer Edge Neural TTS:

```powershell
python scripts\generate-aligned-voiceover.py --voice zh-CN-YunxiNeural --rate=-4%
```

Do not use Windows SAPI voices such as `Microsoft Huihui Desktop` for the automated draft. If `zh-CN-YunxiNeural` cannot be generated, fail the run and report the dependency or network problem instead of rendering a video with the wrong voice. If HyperFrames TTS is used instead, `zf_xiaobei` is the Chinese Kokoro voice, but it requires `kokoro-onnx` and `soundfile`; do not switch to it unless the user explicitly asks.

## Automation Prompt Pattern

For recurring automations, ask Codex to:

- Open `<YOUR_PROJECT_DIR>`.
- Fetch multi-source candidates from GitHub Trending, Hacker News, Product Hunt, and any configured extra feeds.
- Select seven topics by default and rewrite `angle`, `voiceover`, and `narration` into concise Chinese Douyin copy.
- Run the project history check before rendering and avoid any topic recorded in `data/topic-history.json` within the last 7 days.
- Open with a topic-first hook such as "今日热门项目"; mention Codex generation only as secondary visual copy or later voiceover.
- Keep the video/title/description free of WeChat, reply-keyword, external-link, and other off-platform guidance; if needed, add one Douyin-native comment after publish with project names only.
- Run `powershell -ExecutionPolicy Bypass -File scripts\render-with-voiceover.ps1` for voice generation and rendering. This script uses Edge Neural TTS `zh-CN-YunxiNeural` in per-segment chunks, measures segment durations into `data/timings.json`, rebuilds visual scene durations from those timings, renders, and muxes an MP4 with an AAC audio stream. Do not edit the TTS scripts or use SAPI fallback during an automation run.
- After rendering and validation, write Douyin publish metadata to `data/douyin-publish-YYYY-MM-DD.json` as UTF-8 JSON. Include `date`, `video`, `title`, `description`, and `duration`. Validate it with `npm run douyin:publish -- --metadata data/douyin-publish-YYYY-MM-DD.json --validate-only`, then publish with the same `--metadata` file and no `--validate-only`. For missed dates, pass multiple `--metadata` arguments in order; the batch keeps one direct browser open, skips existing titles, and verifies through the authenticated status API without exporting cookies. Never pass Chinese title or description through PowerShell command-line arguments, here-strings, pipes, or copied terminal snippets; abort if validation shows `??`, `????`, replacement characters, or mojibake.
- After rendering and validation, publish the final MP4 to Douyin automatically when the authenticated Chrome/Douyin Creator Center flow is available; ask the user to complete login or CAPTCHA if needed, then continue. Use concise Chinese title/description copy without external guidance, and choose a few relevant Douyin hot-topic tags when the UI offers them. If a resource note is needed, add one platform-native comment after publish with project names only.
- After publishing, verify the Creator Center status. If the work is `审核中`, report it as submitted and leave the website button pending until a public URL is visible. If a public Douyin URL is available, record it with `node scripts/set-douyin-link.mjs YYYY-MM-DD <douyin-url>`.
- After rendering and after any Douyin URL update, update the website data in `site/public/data/days.json`, generate or regenerate the daily WeChat article draft with `npm run wechat:generate -- YYYY-MM-DD`, keep `site/data/douyin-links.json` as the source of Douyin video links, keep the generation tutorial in `site/public/index.html` accurate, and make sure it links to the public GitHub repository `https://github.com/lidachui1998/lidachui1998-codex-developer-radar-kit` instead of local skill or automation paths. Attempt Cloudflare deployment with `npm run site:deploy` after each successful website data update. The production custom domain is `https://radar.bjca.xyz/`.
- Report the source URLs, selected topics, output file, audio stream verification, preview URL if started, and any validation warnings.

Publish to Douyin automatically for this recurring daily workflow when the relevant uploader/account flow is available. Do not publish to WeChat automatically unless the user explicitly asks and the relevant account/API flow is available.

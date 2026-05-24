import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataPath = path.join(root, "data", "hot-topics.json");
const timingsPath = path.join(root, "data", "timings.json");
const outputPath = path.join(root, "index.html");

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function esc(value = "") {
  return String(value).replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
}

function sceneDuration(timing, fallback) {
  return Math.max(3.2, Number(timing?.duration || fallback));
}

const data = await readJson(dataPath, { title: "今日热门项目", items: [] });
const timings = await readJson(timingsPath, null);
const items = (data.items || []).slice(0, 7);
const hookDuration = sceneDuration(timings?.hook, 5);
const itemTimings = timings?.items || [];
const outroDuration = sceneDuration(timings?.outro, 4.5);
const totalDuration = Math.ceil(hookDuration + items.reduce((sum, item, index) => sum + sceneDuration(itemTimings[index], 5), 0) + outroDuration);

let cursor = 0;
const scenes = [];
scenes.push({ id: "hook", start: cursor, duration: hookDuration });
cursor += hookDuration;
items.forEach((item, index) => {
  const duration = sceneDuration(itemTimings[index], 5);
  scenes.push({ id: `topic-${index + 1}`, start: cursor, duration });
  cursor += duration;
});
scenes.push({ id: "outro", start: cursor, duration: outroDuration });

const topicCards = items.map((item, index) => `
<section class="scene topic" id="topic-${index + 1}" style="--start:${scenes[index + 1].start}s;--dur:${scenes[index + 1].duration}s">
  <div class="rank">#${index + 1}</div>
  <h2>${esc(item.title)}</h2>
  <p class="repo">${esc(item.subtitle || item.repo || item.source || "Developer Radar")}</p>
  <p class="angle">${esc(item.angle || item.description || item.voiceover || "值得关注的开发者热点")}</p>
  <div class="metric">${esc(item.metricLabel || "热度")} ${esc(item.metric || "")}</div>
</section>`).join("\n");

const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="hf:width" content="1080"><meta name="hf:height" content="1920"><meta name="hf:duration" content="${totalDuration}"><title>${esc(data.title || "Codex Developer Radar")}</title><style>
body{margin:0;background:#07100f;color:#f7f4e8;font-family:Inter,system-ui,"Microsoft YaHei",sans-serif;overflow:hidden}.canvas{position:relative;width:1080px;height:1920px;background:radial-gradient(circle at 16% 10%,rgba(92,225,165,.22),transparent 480px),#07100f}.scene{position:absolute;inset:0;padding:120px 84px;display:flex;flex-direction:column;justify-content:center;opacity:0;animation:show var(--dur) linear var(--start) forwards}.hook h1{font-size:116px;line-height:1;margin:0 0 30px}.hook p,.outro p{font-size:46px;line-height:1.35;color:#a9b8b2}.badge{width:max-content;padding:16px 22px;border:1px solid rgba(92,225,165,.5);border-radius:999px;color:#5ce1a5;font-weight:900}.topic .rank{font-size:64px;color:#5ce1a5;font-weight:900}.topic h2{font-size:86px;line-height:1.05;margin:24px 0}.repo{font-size:38px;color:#f2c66d}.angle{font-size:46px;line-height:1.35;color:#dfe8e4}.metric{width:max-content;margin-top:28px;padding:16px 20px;border-radius:8px;background:rgba(92,225,165,.12);color:#5ce1a5;font-size:34px;font-weight:900}.outro h2{font-size:92px;line-height:1.1;margin:0}@keyframes show{0%,100%{opacity:0;transform:translateY(20px)}4%,92%{opacity:1;transform:none}}
</style></head><body><main class="canvas"><audio src="assets/narration.mp3"></audio><section class="scene hook" id="hook" style="--start:0s;--dur:${hookDuration}s"><div class="badge">Codex 自动生成</div><h1>${esc(data.title || "今日热门项目")}</h1><p>${esc(data.subtitle || `今天看 ${items.length} 个开发者热点`)}</p></section>${topicCards}<section class="scene outro" id="outro" style="--start:${scenes.at(-1).start}s;--dur:${outroDuration}s"><h2>想要这套流程？</h2><p>${esc(data.cta || "评论 Codex，我把脚本、提示词和自动化拆给你。")}</p></section></main></body></html>`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, html, "utf8");
console.log(`Wrote ${outputPath}`);

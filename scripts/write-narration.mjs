import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataPath = path.join(root, "data", "hot-topics.json");
const outPath = path.join(root, "assets", "narration.txt");

const data = JSON.parse(await readFile(dataPath, "utf8"));
const lines = [];
lines.push(data.narration || data.hookVoiceover || "今日开发者热门项目，开始。");
for (const item of data.items || []) {
  lines.push(item.voiceover || item.angle || item.title);
}
lines.push(data.cta || "评论 Codex，我把脚本、提示词和自动化流程拆给你。");

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${outPath}`);

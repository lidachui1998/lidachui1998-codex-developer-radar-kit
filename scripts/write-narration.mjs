import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataPath = path.join(root, "data", "hot-topics.json");
const outPath = path.join(root, "assets", "narration.txt");

const data = JSON.parse(await readFile(dataPath, "utf8"));
const text =
  data.narration ||
  [
    `今天的开发者热点：${data.title}。`,
    ...data.items.slice(0, 5).map((item) => item.voiceover || item.angle || item.description),
    "明天继续自动抓取多来源热点。"
  ].join("\n");

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${text.trim()}\n`, "utf8");
console.log(`Wrote ${outPath}`);

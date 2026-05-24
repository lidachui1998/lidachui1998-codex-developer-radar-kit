import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const linksPath = path.join(root, "site", "data", "douyin-links.json");

function normalizeDate(value = "") {
  return String(value).slice(0, 10).replaceAll(".", "-").replaceAll("/", "-");
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

const date = normalizeDate(process.argv[2] || "");
const url = process.argv[3] || "";

if (!date || !url) {
  console.error("Usage: node scripts/set-douyin-link.mjs YYYY-MM-DD https://v.douyin.com/...");
  process.exit(2);
}

const links = await readJson(linksPath, {});
links[date] = url;

await mkdir(path.dirname(linksPath), { recursive: true });
await writeFile(linksPath, `${JSON.stringify(links, null, 2)}\n`, "utf8");
console.log(`Set Douyin link for ${date}`);

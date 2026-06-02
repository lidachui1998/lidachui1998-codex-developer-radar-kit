import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const siteRoot = path.join(root, "site");
const publicRoot = path.join(siteRoot, "public");
const outputPath = path.join(publicRoot, "data", "days.json");
const linksPath = path.join(siteRoot, "data", "douyin-links.json");
const topicsPath = path.join(root, "data", "hot-topics.json");
const historyPath = path.join(root, "data", "topic-history.json");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function normalizeDate(value = "") {
  return String(value).slice(0, 10).replaceAll(".", "-").replaceAll("/", "-");
}

function displayDate(value = "") {
  return normalizeDate(value).replaceAll("-", ".");
}

function relativePublicPath(file) {
  if (!file) return "";
  const absolute = path.resolve(file);
  const publicAbsolute = path.resolve(publicRoot);
  const relative = path.relative(publicAbsolute, absolute);
  if (relative.startsWith("..")) return "";
  return relative.split(path.sep).join("/");
}

async function readJson(file, fallback) {
  try {
    const text = await readFile(file, "utf8");
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function repoName(item) {
  if (item.subtitle?.includes("/")) return item.subtitle;
  const match = String(item.url || "").match(/github\.com\/([^/]+\/[^/?#]+)/i);
  return match?.[1] || item.title;
}

function topicFromFullItem(item) {
  return {
    rank: item.rank,
    title: item.title,
    repo: repoName(item),
    category: item.category || item.source || "Topic",
    source: item.source || "Unknown",
    language: item.language || "",
    metricLabel: item.metricLabel || "",
    metric: item.metric || "",
    secondaryLabel: item.secondaryLabel || "",
    secondaryMetric: item.secondaryMetric || "",
    angle: item.angle || item.description || "",
    url: item.url || "",
  };
}

function groupHistoryByDate(history) {
  const groups = new Map();
  for (const item of history.items || []) {
    const date = normalizeDate(item.date);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(item);
  }
  return groups;
}

function dayFromHistory(date, entries, links) {
  const first = entries[0] || {};
  return {
    date,
    displayDate: displayDate(date),
    title: "历史热门项目",
    subtitle: `${entries.length} 个已发布项目`,
    source: "Developer Radar",
    douyinUrl: links[date] || "",
    thumbnail: "",
    topics: entries.map((item, index) => ({
      rank: index + 1,
      title: item.title,
      repo: item.key,
      category: item.source,
      source: item.source,
      language: "",
      metricLabel: "",
      metric: "",
      secondaryLabel: "",
      secondaryMetric: "",
      angle: "",
      url: item.url || "",
    })),
  };
}

async function main() {
  const videoPath = argValue("--video");
  const thumbnailPath = argValue("--thumbnail");
  const full = await readJson(topicsPath, null);
  const history = await readJson(historyPath, { version: 1, items: [] });
  const links = await readJson(linksPath, {});
  const historyGroups = groupHistoryByDate(history);
  const days = [];

  if (full?.items?.length) {
    const date = normalizeDate(full.dateLabel || full.generatedAt || new Date().toISOString());
    let thumbnail = "";
    if (thumbnailPath) {
      const thumbnailName = `${date}.png`;
      const publicThumb = path.join(publicRoot, "assets", "thumbnails", thumbnailName);
      await mkdir(path.dirname(publicThumb), { recursive: true });
      await copyFile(thumbnailPath, publicThumb);
      thumbnail = `assets/thumbnails/${thumbnailName}`;
    }

    days.push({
      date,
      displayDate: displayDate(date),
      title: full.title || "今日热门项目",
      subtitle: full.subtitle || "",
      source: full.source || "Developer Radar",
      sourceUrl: full.sourceUrl || "https://github.com/trending?since=daily",
      douyinUrl: links[date] || "",
      thumbnail,
      topics: full.items.slice(0, 7).map(topicFromFullItem),
    });

    historyGroups.delete(date);
  }

  for (const [date, entries] of historyGroups) {
    days.push(dayFromHistory(date, entries, links));
  }

  days.sort((a, b) => b.date.localeCompare(a.date));
  const payload = {
    updatedAt: new Date().toISOString(),
    title: "Codex Developer Radar",
    description: "每日开发者热门项目、视频与来源链接",
    days,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

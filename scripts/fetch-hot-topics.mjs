import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outPath = path.join(root, "data", "hot-topics.raw.json");

function decodeHtml(value = "") {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value = "") {
  return decodeHtml(value.replace(/<[^>]*>/g, " "));
}

async function fetchGithubTrending() {
  const sourceUrl = "https://github.com/trending?since=daily";
  const response = await fetch(sourceUrl, {
    headers: { "User-Agent": "codex-developer-radar-video" }
  });
  const html = await response.text();
  return [...html.matchAll(/<article[\s\S]*?<\/article>/g)]
    .map((match, index) => {
      const article = match[0];
      const repo = article.match(/<h2[\s\S]*?<a[^>]*href="\/([^"]+)"/)?.[1]?.trim();
      if (!repo) return null;
      const escapedRepo = repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const [owner, name] = repo.split("/");
      return {
        rank: index + 1,
        source: "GitHub",
        category: "开源项目",
        title: name,
        subtitle: repo,
        url: `https://github.com/${repo}`,
        language: stripTags(article.match(/itemprop="programmingLanguage"[^>]*>([^<]+)/)?.[1] ?? "Unknown"),
        metricLabel: "今日新增 Star",
        metric: `+${article.match(/([\d,]+)\s+stars?\s+today/i)?.[1] ?? "0"}`,
        secondaryLabel: "总星标",
        secondaryMetric:
          article.match(new RegExp(`href="/${escapedRepo}/stargazers"[\\s\\S]*?</svg>\\s*([\\d,]+)`))?.[1] ?? "0",
        description: stripTags(article.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ""),
        owner
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

async function fetchHackerNews() {
  const ids = await (await fetch("https://hacker-news.firebaseio.com/v0/topstories.json")).json();
  const stories = [];
  for (const id of ids.slice(0, 15)) {
    const item = await (await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)).json();
    if (!item?.url || !item?.title) continue;
    stories.push({
      source: "Hacker News",
      category: "技术讨论",
      title: item.title,
      subtitle: new URL(item.url).hostname.replace(/^www\./, ""),
      url: item.url,
      language: "HN",
      metricLabel: "HN 热度",
      metric: `${item.score ?? 0} points`,
      secondaryLabel: "评论",
      secondaryMetric: String(item.descendants ?? 0),
      description: item.title
    });
  }
  return stories.slice(0, 8);
}

async function fetchProductHunt() {
  const sourceUrl = "https://www.producthunt.com/feed";
  const response = await fetch(sourceUrl, {
    headers: { "User-Agent": "codex-developer-radar-video" }
  });
  const xml = await response.text();
  return [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)]
    .map((match) => {
      const entry = match[0];
      const title = decodeHtml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
      const url = entry.match(/<link rel="alternate" type="text\/html" href="([^"]+)"/)?.[1] ?? "";
      const content = stripTags(entry.match(/<content type="html">([\s\S]*?)<\/content>/)?.[1] ?? "");
      if (!title || !url) return null;
      return {
        source: "Product Hunt",
        category: "新产品",
        title,
        subtitle: "Product Hunt",
        url,
        language: "PH",
        metricLabel: "来源",
        metric: "Product Hunt",
        secondaryLabel: "类型",
        secondaryMetric: "产品",
        description: content.slice(0, 180)
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

const now = new Date();
const [github, hn, productHunt] = await Promise.all([
  fetchGithubTrending(),
  fetchHackerNews(),
  fetchProductHunt().catch(() => [])
]);

const data = {
  source: "Developer Radar",
  generatedAt: now.toISOString(),
  dateLabel: new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .format(now)
    .replaceAll("/", "."),
  sources: [
    { name: "GitHub Trending", url: "https://github.com/trending?since=daily" },
    { name: "Hacker News", url: "https://news.ycombinator.com/" },
    { name: "Product Hunt", url: "https://www.producthunt.com/feed" }
  ],
  candidates: [...github, ...hn, ...productHunt]
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);

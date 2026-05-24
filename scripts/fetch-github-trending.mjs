import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outPath = path.join(root, "data", "github-hot.json");
const sourceUrl = "https://github.com/trending?since=daily";

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

function parseArticles(html) {
  const articles = [...html.matchAll(/<article[\s\S]*?<\/article>/g)].map((match) => match[0]);
  return articles
    .map((article, index) => {
      const repo = article.match(/<h2[\s\S]*?<a[^>]*href="\/([^"]+)"/)?.[1]?.trim();
      if (!repo) return null;

      const escapedRepo = repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const description = stripTags(article.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
      const language = stripTags(article.match(/itemprop="programmingLanguage"[^>]*>([^<]+)/)?.[1] ?? "Unknown");
      const starsToday = article.match(/([\d,]+)\s+stars?\s+today/i)?.[1] ?? "0";
      const stars =
        article.match(new RegExp(`href="/${escapedRepo}/stargazers"[\\s\\S]*?</svg>\\s*([\\d,]+)`))?.[1] ?? "0";

      return {
        rank: index + 1,
        repo,
        url: `https://github.com/${repo}`,
        language,
        stars,
        starsToday,
        description,
        angle: description
      };
    })
    .filter(Boolean);
}

async function main() {
  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "codex-github-trending-douyin-video"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub Trending request failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const items = parseArticles(html).slice(0, 5);
  if (items.length === 0) {
    throw new Error("Could not parse any repositories from GitHub Trending.");
  }

  const now = new Date();
  const data = {
    source: "GitHub Trending",
    sourceUrl,
    generatedAt: now.toISOString(),
    dateLabel: new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
      .format(now)
      .replaceAll("/", "."),
    title: "今日 GitHub 热榜",
    subtitle: "适合发抖音的开发者信号快报",
    items
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

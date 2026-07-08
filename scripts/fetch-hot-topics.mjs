import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "data");
const outPath = path.join(dataDir, "hot-topics.raw.json");

function decodeHtml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value = "") {
  return decodeHtml(value.replace(/<[^>]*>/g, " "));
}

function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    headers: { "User-Agent": "codex-developer-radar-video", ...(options.headers || {}) },
  });
  const text = await response.text();
  return { status: response.status, text };
}

async function fetchGithubTrending() {
  const sourceUrl = "https://github.com/trending?since=daily";
  const { status, text: html } = await fetchText(sourceUrl);
  const items = [...html.matchAll(/<article[\s\S]*?<\/article>/g)]
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
        owner,
      };
    })
    .filter(Boolean)
    .slice(0, 10);
  return {
    source: { name: "GitHub Trending", url: sourceUrl, status, method: "node_fetch" },
    items,
  };
}

async function fetchHackerNews() {
  const sourceUrl = "https://news.ycombinator.com/";
  const ids = await (await fetch("https://hacker-news.firebaseio.com/v0/topstories.json")).json();
  const stories = [];
  for (const id of ids.slice(0, 20)) {
    const item = await (await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)).json();
    if (!item?.url || !item?.title) continue;
    let hostname = "";
    try {
      hostname = new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      hostname = "news";
    }
    stories.push({
      source: "Hacker News",
      category: "技术讨论",
      title: item.title,
      subtitle: hostname,
      url: item.url,
      language: "HN",
      metricLabel: "HN 热度",
      metric: `${item.score ?? 0} points`,
      secondaryLabel: "评论",
      secondaryMetric: String(item.descendants ?? 0),
      description: item.title,
    });
  }
  return {
    source: { name: "Hacker News", url: sourceUrl, status: 200, method: "firebase_api" },
    items: stories.slice(0, 10),
  };
}

async function fetchProductHunt() {
  const sourceUrl = "https://www.producthunt.com/feed";
  const { status, text: xml } = await fetchText(sourceUrl);
  const items = [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)]
    .map((match) => {
      const entry = match[0];
      const title = decodeHtml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
      const url = entry.match(/<link rel="alternate" type="text\/html" href="([^"]+)"/)?.[1] ?? "";
      const content = stripTags(entry.match(/<content type="html">([\s\S]*?)<\/content>/)?.[1] ?? "");
      if (!title || !url) return null;
      return {
        source: "Product Hunt",
        category: "新产品",
        title: title.replace(/\s+-\s+Product Hunt$/i, ""),
        subtitle: "Product Hunt",
        url,
        language: "PH",
        metricLabel: "来源",
        metric: "Product Hunt",
        secondaryLabel: "类型",
        secondaryMetric: "产品",
        description: content.slice(0, 220),
      };
    })
    .filter(Boolean)
    .slice(0, 8);
  return {
    source: { name: "Product Hunt", url: sourceUrl, status, method: "rss_feed" },
    items,
  };
}

async function fetchHuggingFacePapers(dateKey) {
  const sourceUrl = "https://huggingface.co/papers";
  const { status, text: html } = await fetchText(sourceUrl);
  await writeFile(path.join(dataDir, `huggingface-papers-${dateKey}.html`), html, "utf8");
  const seen = new Set();
  const decoded = decodeHtml(html);
  const matches = [...decoded.matchAll(/"paper":\{"id":"([^"]+)"[\s\S]*?"title":"([^"]+)"/g)];
  const items = matches
    .map((match, index) => {
      const id = match[1];
      const title = stripTags(match[2]);
      if (!id || !title || seen.has(id)) return null;
      seen.add(id);
      return {
        source: "Hugging Face",
        category: /agent|gui|code|llm|reason|tool/i.test(title) ? "AI 研究" : "论文热点",
        title: title.split(":")[0].slice(0, 48),
        subtitle: "huggingface.co",
        url: `https://huggingface.co/papers/${id}`,
        language: "Paper",
        metricLabel: "HF Daily",
        metric: `rank ${index + 1}`,
        secondaryLabel: "方向",
        secondaryMetric: /agent/i.test(title) ? "Agent" : /code/i.test(title) ? "Code" : "AI",
        description: title,
      };
    })
    .filter(Boolean)
    .slice(0, 8);
  return {
    source: { name: "Hugging Face Papers", url: sourceUrl, status, method: "html_probe" },
    items,
  };
}

async function fetchArxiv(dateKey) {
  const sourceUrl = "https://arxiv.org/list/cs.AI/new";
  const { status, text: html } = await fetchText(sourceUrl);
  await writeFile(path.join(dataDir, `arxiv-cs-ai-${dateKey}.html`), html, "utf8");
  const chunks = [...html.matchAll(/<dt>[\s\S]*?<a[^>]*href\s*=\s*["']\/abs\/([^"']+)["'][\s\S]*?<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)];
  const items = chunks
    .map((match) => {
      const id = match[1];
      const dd = match[2];
      const title = stripTags(dd.match(/<div class=['"]list-title[^'"]*['"]>([\s\S]*?)<\/div>/)?.[1] ?? "").replace(/^Title:\s*/i, "");
      if (!id || !title) return null;
      return {
        source: "arXiv",
        category: /agent/i.test(title) ? "Agent 论文" : /code|program/i.test(title) ? "编码研究" : "AI 论文",
        title: title.split(":")[0].slice(0, 48),
        subtitle: "arxiv.org",
        url: `https://arxiv.org/abs/${id}`,
        language: "Paper",
        metricLabel: "arXiv",
        metric: "cs.AI new",
        secondaryLabel: "方向",
        secondaryMetric: /agent/i.test(title) ? "Agent" : /code|program/i.test(title) ? "Code" : "AI",
        description: title,
      };
    })
    .filter(Boolean)
    .slice(0, 8);
  return {
    source: { name: "arXiv cs.AI new", url: sourceUrl, status, method: "html_probe" },
    items,
  };
}

async function fetchGithubBlog(dateKey) {
  const sourceUrl = "https://github.blog/feed/";
  const { status, text: xml } = await fetchText(sourceUrl);
  await writeFile(path.join(dataDir, `github-blog-${dateKey}.xml`), xml, "utf8");
  const items = [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)]
    .map((match) => {
      const item = match[0];
      const title = decodeHtml(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
      const url = decodeHtml(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
      const description = stripTags(item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "");
      if (!title || !url) return null;
      return {
        source: "GitHub Blog",
        category: /security|secret|vulnerability/i.test(title) ? "供应链安全" : /copilot|ai|agent/i.test(title) ? "AI 开发工具" : "开发者生态",
        title: title.replace(/^GitHub\s+/i, "").slice(0, 48),
        subtitle: "github.blog",
        url,
        language: "Blog",
        metricLabel: "GitHub Blog",
        metric: "latest",
        secondaryLabel: "方向",
        secondaryMetric: /security|secret|vulnerability/i.test(title) ? "Security" : /copilot|ai|agent/i.test(title) ? "AI Dev" : "Developer",
        description: description || title,
      };
    })
    .filter(Boolean)
    .filter((item) => /ai|agent|copilot|code|developer|security|secret|actions|open source|git/i.test(`${item.title} ${item.description}`))
    .slice(0, 6);
  return {
    source: { name: "GitHub Blog", url: sourceUrl, status, method: "rss_feed" },
    items,
  };
}

async function safeFetch(label, fn) {
  try {
    return await fn();
  } catch (error) {
    return {
      source: { name: label, url: "", status: "error", method: "fetch", error: error.message },
      items: [],
    };
  }
}

const now = new Date();
const dateKey = todayKey(now);
await mkdir(dataDir, { recursive: true });

const results = await Promise.all([
  safeFetch("GitHub Trending", fetchGithubTrending),
  safeFetch("Hacker News", fetchHackerNews),
  safeFetch("Product Hunt", fetchProductHunt),
  safeFetch("Hugging Face Papers", () => fetchHuggingFacePapers(dateKey)),
  safeFetch("arXiv cs.AI new", () => fetchArxiv(dateKey)),
  safeFetch("GitHub Blog", () => fetchGithubBlog(dateKey)),
]);

const data = {
  source: "Developer Radar",
  generatedAt: now.toISOString(),
  dateLabel: new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .replaceAll("/", "."),
  sources: results.map((result) => result.source),
  candidates: results.flatMap((result) => result.items),
};

await writeFile(outPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
await writeFile(path.join(dataDir, `extra-source-status-${dateKey}.json`), `${JSON.stringify(data.sources, null, 2)}\n`, "utf8");
await writeFile(path.join(dataDir, `candidates-${dateKey}.json`), `${JSON.stringify({ ...data, selected: [] }, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);
console.log(`Fetched ${data.candidates.length} candidate(s) from ${data.sources.length} source(s).`);

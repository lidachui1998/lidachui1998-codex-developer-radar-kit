import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const siteDaysPath = path.join(root, "site", "public", "data", "days.json");
const wechatRoot = path.join(root, "wechat");
const articlesDir = path.join(wechatRoot, "articles");
const configPath = path.join(wechatRoot, "config.json");
const manifestPath = path.join(wechatRoot, "articles.json");
const publicWechatPath = path.join(root, "site", "public", "data", "wechat.json");

const defaultConfig = {
  accountName: "待填写公众号名称",
  author: "Codex Developer Radar",
  replyKeyword: "Codex",
  siteUrl: "https://radar.bjca.xyz/",
  articleFooter: "资料会持续沉淀到网站。公众号后台发布后，把文章链接录入管理工具，网站就能形成闭环。",
};

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeDate(value = "") {
  return String(value).slice(0, 10).replaceAll(".", "-").replaceAll("/", "-");
}

function compactUrl(url = "") {
  return String(url).replace(/[?&](region|mid|u_code|did|iid|with_sec_did|video_share_track_ver|titleType|share_sign|share_version|ts|from_aid|from_ssr|share_track_info)=[^&]*/g, "").replace(/[?&]$/, "");
}

function siteDayUrl(config, date) {
  const base = String(config.siteUrl || defaultConfig.siteUrl).replace(/\/+$/, "");
  return `${base}/?date=${date}#archive`;
}

function articleTitle(day) {
  const lead = day.topics?.slice(0, 3).map((topic) => topic.title).join("、") || "项目清单";
  return `${day.displayDate} 开发者热点：${lead}`;
}

function articleDigest(day) {
  const names = day.topics?.slice(0, 4).map((topic) => topic.title).join("、") || "热门项目";
  return `今日整理 ${day.topics?.length || 0} 个开发者热点：${names}。`;
}

function topicLines(day) {
  return (day.topics || []).map((topic) => [
    `## ${topic.rank}. ${topic.title}`,
    "",
    `- 来源：${topic.source || "Developer Radar"}${topic.category ? ` / ${topic.category}` : ""}`,
    `- 项目：${topic.repo || topic.title}`,
    topic.metric ? `- 热度：${topic.metricLabel || "指标"} ${topic.metric}${topic.secondaryMetric ? `，${topic.secondaryLabel || "补充"} ${topic.secondaryMetric}` : ""}` : "",
    topic.angle ? `- 看点：${topic.angle}` : "",
    topic.url ? `- 链接：${topic.url}` : "",
    "",
  ].filter(Boolean).join("\n"));
}

function renderMarkdown(day, config) {
  const date = normalizeDate(day.date);
  const siteUrl = siteDayUrl(config, date);
  const douyinUrl = compactUrl(day.douyinUrl || "");
  return [
    `# ${articleTitle(day)}`,
    "",
    `> ${articleDigest(day)}`,
    "",
    douyinUrl ? `抖音视频：${douyinUrl}` : "抖音视频：发布后补链接",
    `项目归档：${siteUrl}`,
    "",
    "今天这期适合快速扫一眼：哪些项目值得收藏，哪些方向值得后续深挖。",
    "",
    ...topicLines(day),
    "---",
    "",
    `完整历史清单：${siteUrl}`,
    `公众号回复「${config.replyKeyword}」获取脚本、提示词和自动化流程。`,
    config.articleFooter,
    "",
  ].join("\n");
}

function topicHtml(topic) {
  const metric = topic.metric
    ? `<p style="margin:8px 0 0;color:#8a8f98;font-size:14px;">${escapeHtml(topic.metricLabel || "指标")}：<strong style="color:#111827;">${escapeHtml(topic.metric)}</strong>${topic.secondaryMetric ? ` · ${escapeHtml(topic.secondaryLabel || "补充")}：${escapeHtml(topic.secondaryMetric)}` : ""}</p>`
    : "";
  const link = topic.url
    ? `<p style="margin:10px 0 0;"><a href="${escapeHtml(topic.url)}" style="color:#2563eb;text-decoration:none;">打开项目 / 原文</a></p>`
    : "";
  return `
    <section style="margin:18px 0;padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#ffffff;">
      <p style="margin:0 0 8px;color:#10b981;font-size:14px;font-weight:700;">#${topic.rank} · ${escapeHtml(topic.source || "Developer Radar")} ${topic.category ? `/ ${escapeHtml(topic.category)}` : ""}</p>
      <h2 style="margin:0;color:#111827;font-size:22px;line-height:1.25;">${escapeHtml(topic.title)}</h2>
      <p style="margin:8px 0 0;color:#6b7280;font-size:14px;">${escapeHtml(topic.repo || topic.title)}</p>
      ${metric}
      <p style="margin:12px 0 0;color:#1f2937;font-size:16px;line-height:1.75;">${escapeHtml(topic.angle || "值得关注。")}</p>
      ${link}
    </section>`;
}

function renderHtml(day, config) {
  const date = normalizeDate(day.date);
  const siteUrl = siteDayUrl(config, date);
  const douyinUrl = compactUrl(day.douyinUrl || "");
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(articleTitle(day))}</title>
  </head>
  <body style="margin:0;background:#f5f7fb;color:#111827;font-family:Arial,'Microsoft YaHei',sans-serif;">
    <main style="max-width:720px;margin:0 auto;padding:24px 18px 42px;">
      <p style="margin:0 0 10px;color:#10b981;font-size:14px;font-weight:700;">${escapeHtml(config.accountName)} · Developer Radar</p>
      <h1 style="margin:0;color:#111827;font-size:28px;line-height:1.25;">${escapeHtml(articleTitle(day))}</h1>
      <p style="margin:12px 0 0;color:#4b5563;font-size:16px;line-height:1.75;">${escapeHtml(articleDigest(day))}</p>
      <section style="margin:18px 0;padding:16px;border-radius:8px;background:#ecfdf5;">
        <p style="margin:0;color:#065f46;font-size:15px;line-height:1.7;">今天这期适合快速扫一眼：哪些项目值得收藏，哪些方向值得后续深挖。</p>
        <p style="margin:10px 0 0;color:#065f46;font-size:15px;line-height:1.7;">项目归档：<a href="${escapeHtml(siteUrl)}" style="color:#047857;">${escapeHtml(siteUrl)}</a></p>
        ${douyinUrl ? `<p style="margin:8px 0 0;color:#065f46;font-size:15px;line-height:1.7;">抖音视频：<a href="${escapeHtml(douyinUrl)}" style="color:#047857;">打开视频</a></p>` : ""}
      </section>
      ${(day.topics || []).map(topicHtml).join("\n")}
      <section style="margin:22px 0 0;padding:16px;border-radius:8px;background:#111827;">
        <p style="margin:0;color:#f9fafb;font-size:17px;font-weight:700;">想要脚本和自动化流程？</p>
        <p style="margin:10px 0 0;color:#d1d5db;font-size:15px;line-height:1.7;">公众号回复「${escapeHtml(config.replyKeyword)}」获取脚本、提示词和自动化流程。</p>
        <p style="margin:10px 0 0;color:#d1d5db;font-size:15px;line-height:1.7;">完整历史清单：<a href="${escapeHtml(siteUrl)}" style="color:#5eead4;">${escapeHtml(siteUrl)}</a></p>
      </section>
      <p style="margin:18px 0 0;color:#6b7280;font-size:13px;line-height:1.7;">${escapeHtml(config.articleFooter)}</p>
    </main>
  </body>
</html>
`;
}

function renderPayload(day, config, paths) {
  const date = normalizeDate(day.date);
  return {
    date,
    title: articleTitle(day),
    author: config.author,
    digest: articleDigest(day),
    content_source_url: siteDayUrl(config, date),
    thumb_media_id: "",
    need_open_comment: 0,
    only_fans_can_comment: 0,
    paths,
  };
}

async function loadState() {
  const daysData = await readJson(siteDaysPath, { days: [] });
  const config = { ...defaultConfig, ...(await readJson(configPath, {})) };
  const manifest = await readJson(manifestPath, { version: 1, updatedAt: "", articles: [] });
  return { days: daysData.days || [], config, manifest };
}

function upsertArticle(manifest, record) {
  const existing = new Map((manifest.articles || []).map((article) => [article.date, article]));
  const prev = existing.get(record.date) || {};
  existing.set(record.date, { ...prev, ...record, articleUrl: prev.articleUrl || record.articleUrl || "" });
  manifest.version = 1;
  manifest.updatedAt = new Date().toISOString();
  manifest.articles = [...existing.values()].sort((a, b) => b.date.localeCompare(a.date));
}

async function writeManifest(manifest, config) {
  await mkdir(wechatRoot, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writePublicWechatData(manifest, config);
}

async function writePublicWechatData(manifest, config) {
  const payload = {
    updatedAt: new Date().toISOString(),
    accountName: config.accountName,
    replyKeyword: config.replyKeyword,
    siteUrl: config.siteUrl,
    articles: (manifest.articles || []).map((article) => ({
      date: article.date,
      displayDate: article.displayDate,
      title: article.title,
      digest: article.digest,
      status: article.status || "draft",
      articleUrl: article.articleUrl || "",
      douyinUrl: article.douyinUrl || "",
      siteUrl: article.siteUrl || "",
    })),
  };
  await mkdir(path.dirname(publicWechatPath), { recursive: true });
  await writeFile(publicWechatPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function ensureConfig() {
  await mkdir(wechatRoot, { recursive: true });
  try {
    await readFile(configPath, "utf8");
  } catch {
    await writeFile(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`, "utf8");
  }
}

async function generateForDay(day, config, manifest) {
  const date = normalizeDate(day.date);
  const base = path.join(articlesDir, date);
  const mdPath = `${base}.md`;
  const htmlPath = `${base}.html`;
  const payloadPath = `${base}.payload.json`;
  await mkdir(articlesDir, { recursive: true });
  await writeFile(mdPath, renderMarkdown(day, config), "utf8");
  await writeFile(htmlPath, renderHtml(day, config), "utf8");
  const payload = renderPayload(day, config, {
    markdown: path.relative(root, mdPath).split(path.sep).join("/"),
    html: path.relative(root, htmlPath).split(path.sep).join("/"),
    payload: path.relative(root, payloadPath).split(path.sep).join("/"),
  });
  await writeFile(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  upsertArticle(manifest, {
    date,
    displayDate: day.displayDate || date.replaceAll("-", "."),
    title: payload.title,
    digest: payload.digest,
    status: "draft",
    articleUrl: "",
    douyinUrl: compactUrl(day.douyinUrl || ""),
    siteUrl: payload.content_source_url,
    paths: payload.paths,
    generatedAt: new Date().toISOString(),
  });
  return payload;
}

async function generate() {
  await ensureConfig();
  const { days, config, manifest } = await loadState();
  const date = normalizeDate(argValue("--date"));
  const selected = hasFlag("--all")
    ? days
    : days.filter((day) => normalizeDate(day.date) === date);
  if (!selected.length) {
    throw new Error(date ? `No day found for ${date}` : "Use --all or --date YYYY-MM-DD.");
  }
  for (const day of selected) {
    const payload = await generateForDay(day, config, manifest);
    console.log(`Generated ${payload.paths.markdown}`);
    console.log(`Generated ${payload.paths.html}`);
  }
  await writeManifest(manifest, config);
  console.log(`Updated ${path.relative(root, manifestPath)}`);
  console.log(`Updated ${path.relative(root, publicWechatPath)}`);
}

async function list() {
  const { manifest } = await loadState();
  for (const article of manifest.articles || []) {
    const status = article.articleUrl ? "published" : (article.status || "draft");
    console.log(`${article.date}  ${status.padEnd(9)}  ${article.title}`);
  }
}

async function setUrl() {
  const date = normalizeDate(process.argv[3] || argValue("--date"));
  const url = process.argv[4] || argValue("--url");
  if (!date || !url) throw new Error("Usage: node scripts/wechat-articles.mjs set-url YYYY-MM-DD <url>");
  const { config, manifest } = await loadState();
  const target = (manifest.articles || []).find((article) => article.date === date);
  if (!target) throw new Error(`No article found for ${date}. Generate it first.`);
  target.articleUrl = url;
  target.status = "published";
  target.publishedAt = new Date().toISOString();
  await writeManifest(manifest, config);
  console.log(`Recorded WeChat URL for ${date}`);
}

async function main() {
  const command = process.argv[2] || "help";
  if (command === "generate") return generate();
  if (command === "list") return list();
  if (command === "set-url") return setUrl();
  console.log([
    "Usage:",
    "  node scripts/wechat-articles.mjs generate --all",
    "  node scripts/wechat-articles.mjs generate --date YYYY-MM-DD",
    "  node scripts/wechat-articles.mjs list",
    "  node scripts/wechat-articles.mjs set-url YYYY-MM-DD <wechat-article-url>",
  ].join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

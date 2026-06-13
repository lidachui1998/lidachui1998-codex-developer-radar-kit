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
  appId: "",
  appSecret: "",
  thumbMediaId: "",
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

function displayDate(day) {
  return day.displayDate || normalizeDate(day.date).replaceAll("-", ".");
}

function compactUrl(url = "") {
  return String(url)
    .replace(/[?&](region|mid|u_code|did|iid|with_sec_did|video_share_track_ver|titleType|share_sign|share_version|ts|from_aid|from_ssr|share_track_info)=[^&]*/g, "")
    .replace(/[?&]$/, "");
}

function siteDayUrl(config, date) {
  const base = String(config.siteUrl || defaultConfig.siteUrl).replace(/\/+$/, "");
  return `${base}/?date=${date}#archive`;
}

function topicNames(day, count = 3) {
  return (day.topics || []).slice(0, count).map((topic) => topic.title).filter(Boolean);
}

function articleTitle(day) {
  const lead = topicNames(day, 3).join("、") || "项目清单";
  return `${displayDate(day)} 开发者热点：${lead}`;
}

function articleDigest(day) {
  const names = topicNames(day, 4).join("、") || "热门项目";
  return `今日整理 ${day.topics?.length || 0} 个开发者热点：${names}。`;
}

function introText(day) {
  const names = topicNames(day, 3);
  if (!names.length) {
    return "今天这期帮你快速筛出值得收藏的开发者项目，适合先扫一遍，再按自己的场景深入研究。";
  }
  return `今天这期不是简单堆链接，而是从热点里筛出几个值得先看的方向：${names.join("、")}。适合先收藏，再按自己的工作场景深入研究。`;
}

function takeawayText(day) {
  const categories = [...new Set((day.topics || []).map((topic) => topic.category || topic.source).filter(Boolean))].slice(0, 4);
  if (!categories.length) {
    return "今天的重点是快速识别项目价值：能不能直接用、适合什么场景、后续是否值得跟进。";
  }
  return `今天的重点方向：${categories.join("、")}。如果你做开发工具、自动化、个人效率或自建服务，这期会比较有参考价值。`;
}

function metricText(topic) {
  if (!topic.metric) return "";
  const primary = `${topic.metricLabel || "热度"} ${topic.metric}`;
  const secondary = topic.secondaryMetric ? `${topic.secondaryLabel || "补充"} ${topic.secondaryMetric}` : "";
  return [primary, secondary].filter(Boolean).join(" · ");
}

function usefulFor(topic) {
  const category = topic.category || "";
  const title = topic.title || "这个项目";
  if (/Agent|纠错|观测|协作/.test(category)) return "适合正在引入 AI Agent、改造研发流程，或想把团队经验沉淀成可执行规则的人。";
  if (/LLM|推理|代码模型/.test(category)) return "适合关注模型服务、推理成本、代码生成质量和长上下文工程化的开发者。";
  if (/数据|采集/.test(category)) return "适合需要把公开网页、业务页面或非结构化内容转成数据流的团队。";
  if (/项目|管理|协作/.test(category)) return "适合正在优化需求流转、任务拆解和人机协同的产品与工程团队。";
  return `适合想快速判断 ${title} 是否值得跟进的人先扫一遍。`;
}

function renderMarkdown(day, config) {
  const date = normalizeDate(day.date);
  const siteUrl = siteDayUrl(config, date);
  const douyinUrl = compactUrl(day.douyinUrl || "");
  const lines = [
    `# ${articleTitle(day)}`,
    "",
    `> ${articleDigest(day)}`,
    "",
    introText(day),
    "",
    "## 先说结论",
    "",
    takeawayText(day),
    "",
    `- 项目数量：${day.topics?.length || 0} 个`,
    `- 视频回看：${douyinUrl || "发布后补充"}`,
    `- 完整归档：${siteUrl}`,
    "",
    "## 今日项目清单",
    "",
  ];

  for (const topic of day.topics || []) {
    const metric = metricText(topic);
    lines.push(
      `### ${String(topic.rank || "").padStart(2, "0")}｜${topic.title}`,
      "",
      `**一句话看点：** ${topic.angle || `${topic.title} 是今天值得跟进的开发者项目。`}`,
      "",
      `**适合谁：** ${usefulFor(topic)}`,
      "",
      `**项目来源：** ${[topic.source, topic.category].filter(Boolean).join(" / ") || "Developer Radar"}`,
      topic.repo ? `**仓库/项目：** ${topic.repo}` : "",
      metric ? `**热度信息：** ${metric}` : "",
      topic.url ? `**项目链接：** ${topic.url}` : "",
      "",
      "---",
      "",
    );
  }

  lines.push(
    "## 怎么拿资料",
    "",
    `项目链接、生成脚本、提示词和自动化流程会整理到网站：${siteUrl}`,
    "",
    `公众号可回复「${config.replyKeyword}」获取脚本、提示词和自动化流程。`,
    "",
    config.articleFooter,
    "",
  );

  return lines.filter((line) => line !== "").join("\n\n") + "\n";
}

function tag(label, color = "#0f766e", bg = "#ccfbf1") {
  return `<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 8px;border-radius:999px;background:${bg};color:${color};font-size:12px;font-weight:700;">${escapeHtml(label)}</span>`;
}

function topicHtml(topic) {
  const metric = metricText(topic);
  const rank = String(topic.rank || "").padStart(2, "0");
  const title = escapeHtml(topic.title || "未命名项目");
  const source = [topic.source, topic.category].filter(Boolean).join(" / ") || "Developer Radar";
  return `
    <section style="margin:22px 0;padding:0;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;overflow:hidden;">
      <section style="padding:14px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0;color:#0f766e;font-size:13px;font-weight:800;letter-spacing:.4px;">PROJECT ${rank}</p>
        <h2 style="margin:6px 0 0;color:#111827;font-size:22px;line-height:1.35;">${rank}｜${title}</h2>
      </section>
      <section style="padding:16px;">
        <p style="margin:0 0 12px;">${tag(source)}${topic.secondaryMetric ? tag(topic.secondaryMetric, "#92400e", "#fef3c7") : ""}${metric ? tag(metric, "#1d4ed8", "#dbeafe") : ""}</p>
        <p style="margin:0;color:#111827;font-size:16px;line-height:1.8;"><strong>为什么值得看：</strong>${escapeHtml(topic.angle || `${topic.title} 是今天值得跟进的开发者项目。`)}</p>
        <p style="margin:12px 0 0;color:#374151;font-size:15px;line-height:1.8;"><strong>适合谁：</strong>${escapeHtml(usefulFor(topic))}</p>
        ${topic.repo ? `<p style="margin:12px 0 0;color:#6b7280;font-size:14px;line-height:1.7;">仓库/项目：${escapeHtml(topic.repo)}</p>` : ""}
        ${topic.url ? `<p style="margin:14px 0 0;"><a href="${escapeHtml(topic.url)}" style="display:inline-block;padding:8px 12px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">打开项目 / 原文</a></p>` : ""}
      </section>
    </section>`;
}

function renderArticleBodyHtml(day, config) {
  const date = normalizeDate(day.date);
  const siteUrl = siteDayUrl(config, date);
  const douyinUrl = compactUrl(day.douyinUrl || "");
  const names = topicNames(day, 7);
  return `
<section style="max-width:720px;margin:0 auto;padding:8px 0 32px;color:#111827;font-family:Arial,'Microsoft YaHei',sans-serif;">
  <section style="margin:0 0 18px;padding:20px 18px;border-radius:14px;background:#111827;">
    <p style="margin:0 0 10px;color:#5eead4;font-size:13px;font-weight:800;">${escapeHtml(config.accountName)} · Developer Radar</p>
    <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.35;">${escapeHtml(articleTitle(day))}</h1>
    <p style="margin:14px 0 0;color:#d1d5db;font-size:16px;line-height:1.8;">${escapeHtml(introText(day))}</p>
  </section>

  <section style="margin:18px 0;padding:16px;border-left:5px solid #10b981;border-radius:10px;background:#ecfdf5;">
    <p style="margin:0 0 8px;color:#065f46;font-size:15px;font-weight:800;">先说结论</p>
    <p style="margin:0;color:#064e3b;font-size:15px;line-height:1.8;">${escapeHtml(takeawayText(day))}</p>
  </section>

  <section style="margin:18px 0;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;">
    <p style="margin:0 0 10px;color:#111827;font-size:15px;font-weight:800;">今日清单</p>
    <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.9;">${escapeHtml(names.map((name, index) => `${index + 1}. ${name}`).join("  /  "))}</p>
    <p style="margin:12px 0 0;color:#4b5563;font-size:14px;line-height:1.8;">视频回看：${douyinUrl ? `<a href="${escapeHtml(douyinUrl)}" style="color:#047857;">打开抖音视频</a>` : "发布后补充"}</p>
    <p style="margin:6px 0 0;color:#4b5563;font-size:14px;line-height:1.8;">完整归档：<a href="${escapeHtml(siteUrl)}" style="color:#047857;">${escapeHtml(siteUrl)}</a></p>
  </section>

  ${(day.topics || []).map(topicHtml).join("\n")}

  <section style="margin:24px 0 0;padding:18px;border-radius:12px;background:#0f172a;">
    <p style="margin:0;color:#ffffff;font-size:18px;font-weight:800;">资料怎么拿？</p>
    <p style="margin:10px 0 0;color:#d1d5db;font-size:15px;line-height:1.8;">公众号回复「${escapeHtml(config.replyKeyword)}」获取项目链接、脚本、提示词和自动化流程。</p>
    <p style="margin:10px 0 0;color:#d1d5db;font-size:15px;line-height:1.8;">完整历史清单：<a href="${escapeHtml(siteUrl)}" style="color:#5eead4;">${escapeHtml(siteUrl)}</a></p>
  </section>

  <p style="margin:18px 0 0;color:#6b7280;font-size:13px;line-height:1.8;">${escapeHtml(config.articleFooter)}</p>
</section>`;
}

function renderHtml(day, config) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(articleTitle(day))}</title>
  </head>
  <body style="margin:0;background:#f3f4f6;padding:18px;color:#111827;">
    ${renderArticleBodyHtml(day, config)}
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
    thumb_media_id: config.thumbMediaId || "",
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
  existing.set(record.date, {
    ...prev,
    ...record,
    articleUrl: prev.articleUrl || record.articleUrl || "",
    wechatMediaId: prev.wechatMediaId || "",
    publishId: prev.publishId || "",
  });
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
    displayDate: displayDate(day),
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
    console.log(`${article.date}  ${status.padEnd(14)}  ${article.title}`);
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

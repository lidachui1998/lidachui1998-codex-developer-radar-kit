import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "wechat", "config.json");
const manifestPath = path.join(root, "wechat", "articles.json");
const publicWechatPath = path.join(root, "site", "public", "data", "wechat.json");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeDate(value = "") {
  return String(value).slice(0, 10).replaceAll(".", "-").replaceAll("/", "-");
}

function stripHtmlDocument(html) {
  const main = html.match(/<section style="max-width:720px[\s\S]*<\/section>\s*<\/body>/);
  if (main) return main[0].replace(/\s*<\/body>$/, "").trim();
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (body ? body[1] : html).trim();
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`WeChat API returned non-JSON response: ${text.slice(0, 240)}`);
  }
  if (!response.ok || (payload.errcode && payload.errcode !== 0)) {
    throw new Error(`WeChat API error ${payload.errcode || response.status}: ${payload.errmsg || text}`);
  }
  return payload;
}

async function accessToken(config) {
  const appId = process.env.WECHAT_APP_ID || config.appId;
  const appSecret = process.env.WECHAT_APP_SECRET || config.appSecret;
  if (!appId || !appSecret) {
    throw new Error("缺少 WECHAT_APP_ID / WECHAT_APP_SECRET，或在 wechat/config.json 填写 appId/appSecret。");
  }
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);
  const payload = await requestJson(url);
  if (!payload.access_token) throw new Error("WeChat API did not return access_token.");
  return payload.access_token;
}

function findArticle(manifest, date) {
  const article = (manifest.articles || []).find((item) => item.date === date);
  if (!article) throw new Error(`No generated article found for ${date}. Run npm run wechat:generate -- ${date}`);
  return article;
}

async function addDraft(token, article, config) {
  const thumbMediaId = process.env.WECHAT_THUMB_MEDIA_ID || config.thumbMediaId || article.thumbMediaId;
  if (!thumbMediaId) {
    throw new Error("缺少封面素材 thumb_media_id。请先在公众号素材库上传封面，并设置 WECHAT_THUMB_MEDIA_ID 或 wechat/config.json 的 thumbMediaId。");
  }
  const htmlPath = path.join(root, article.paths.html);
  const content = stripHtmlDocument(await readFile(htmlPath, "utf8"));
  return requestJson(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      articles: [
        {
          title: article.title,
          author: config.author || "Codex Developer Radar",
          digest: article.digest || "",
          content,
          content_source_url: article.siteUrl || config.siteUrl || "",
          thumb_media_id: thumbMediaId,
          need_open_comment: 0,
          only_fans_can_comment: 0,
        },
      ],
    }),
  });
}

async function submitPublish(token, mediaId) {
  return requestJson(`https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ media_id: mediaId }),
  });
}

async function writePublicWechatData(manifest, config) {
  const payload = {
    updatedAt: new Date().toISOString(),
    accountName: config.accountName || "待填写公众号名称",
    replyKeyword: config.replyKeyword || "Codex",
    siteUrl: config.siteUrl || "https://radar.bjca.xyz/",
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
  await writeFile(publicWechatPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function saveManifest(manifest, config) {
  manifest.updatedAt = new Date().toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writePublicWechatData(manifest, config);
}

async function main() {
  const date = normalizeDate(argValue("--date", process.argv[2] || ""));
  const mode = argValue("--mode", "draft");
  if (!date) throw new Error("Usage: node scripts/wechat-publish.mjs --date YYYY-MM-DD --mode draft|publish");
  if (!["draft", "publish"].includes(mode)) throw new Error("--mode must be draft or publish");

  const config = await readJson(configPath, {});
  const manifest = await readJson(manifestPath, { version: 1, articles: [] });
  const article = findArticle(manifest, date);
  const token = await accessToken(config);
  const draft = await addDraft(token, article, config);
  article.wechatMediaId = draft.media_id;
  article.status = "wechat_draft";
  article.draftCreatedAt = new Date().toISOString();
  console.log(`Created WeChat draft media_id=${draft.media_id}`);

  if (mode === "publish") {
    const publish = await submitPublish(token, draft.media_id);
    article.publishId = publish.publish_id;
    article.status = "publish_submitted";
    article.publishSubmittedAt = new Date().toISOString();
    console.log(`Submitted WeChat publish publish_id=${publish.publish_id}`);
  }

  await saveManifest(manifest, config);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

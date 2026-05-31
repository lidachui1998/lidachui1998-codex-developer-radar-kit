import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const port = Number(process.env.PORT || process.argv[2] || 4189);
const manifestPath = path.join(root, "wechat", "articles.json");
const configPath = path.join(root, "wechat", "config.json");
const publicWechatPath = path.join(root, "site", "public", "data", "wechat.json");

async function readText(file, fallback = "") {
  try {
    return await readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function send(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
  });
  response.end(body);
}

function json(response, status, body) {
  send(response, status, JSON.stringify(body, null, 2), "application/json; charset=utf-8");
}

function requestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function spawnNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      shell: false,
      env: process.env,
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("exit", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output || `command exited ${code}`));
    });
  });
}

async function updateArticleUrl(date, articleUrl) {
  const config = await readJson(configPath, {});
  const manifest = await readJson(manifestPath, { version: 1, articles: [] });
  const target = (manifest.articles || []).find((article) => article.date === date);
  if (!target) throw new Error(`No article found for ${date}`);
  target.articleUrl = articleUrl;
  target.status = articleUrl ? "published" : "draft";
  target.publishedAt = articleUrl ? new Date().toISOString() : "";
  manifest.updatedAt = new Date().toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writePublicWechatData(manifest, config);
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

function managerHtml(config) {
  const apiHint = config.appId || process.env.WECHAT_APP_ID
    ? "已检测到 AppID 配置，可尝试 API 创建草稿。"
    : "未检测到 AppID/AppSecret。可以先复制富文本到公众号后台；要 API 发布，需要在环境变量或 config 中配置凭证和封面 thumb_media_id。";
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>公众号发布管理</title>
    <style>
      :root { color-scheme: light; --bg:#f3f4f6; --panel:#ffffff; --ink:#111827; --muted:#64748b; --line:#e5e7eb; --mint:#10b981; --blue:#2563eb; --amber:#b45309; --dark:#0f172a; }
      * { box-sizing: border-box; }
      body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"Microsoft YaHei",sans-serif; }
      main { width:min(1180px, calc(100% - 32px)); margin:0 auto; padding:34px 0 60px; }
      header { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; margin-bottom:18px; }
      h1 { margin:0; font-size:38px; line-height:1.1; letter-spacing:0; }
      p { margin:0; color:var(--muted); line-height:1.65; }
      button, input, a.action { min-height:38px; border:1px solid var(--line); border-radius:8px; color:var(--ink); background:#fff; padding:0 12px; font:inherit; font-weight:800; text-decoration:none; display:inline-flex; align-items:center; cursor:pointer; }
      button.primary { color:#fff; background:var(--dark); border-color:var(--dark); }
      button.green { color:#052e1b; background:#bbf7d0; border-color:#86efac; }
      button.blue { color:#fff; background:var(--blue); border-color:var(--blue); }
      button.warn { color:#fff; background:#c2410c; border-color:#c2410c; }
      .notice { margin:0 0 18px; padding:14px 16px; border:1px solid var(--line); border-radius:10px; background:#fff; display:flex; justify-content:space-between; gap:16px; align-items:center; }
      .grid { display:grid; gap:14px; }
      .card { border:1px solid var(--line); border-radius:10px; background:var(--panel); padding:16px; display:grid; grid-template-columns:170px minmax(0,1fr); gap:16px; box-shadow:0 8px 24px rgba(15,23,42,.04); }
      .date { color:var(--mint); font-weight:900; }
      .status { margin-top:8px; color:var(--amber); font-weight:900; font-size:14px; }
      .title { margin:2px 0 8px; font-size:22px; line-height:1.35; font-weight:900; }
      .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
      .url-row { display:flex; gap:8px; margin-top:12px; }
      .url-row input { flex:1; font-weight:400; color:var(--ink); }
      .toast { position:fixed; right:18px; bottom:18px; max-width:min(520px, calc(100% - 36px)); padding:12px 14px; border-radius:8px; background:#111827; color:#fff; font-weight:900; opacity:0; transform:translateY(10px); transition:160ms ease; white-space:pre-wrap; }
      .toast.show { opacity:1; transform:translateY(0); }
      @media (max-width:760px){ header,.notice,.card{grid-template-columns:1fr; flex-direction:column;} .url-row{flex-direction:column;} }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>公众号发布管理</h1>
          <p>公众号：${config.accountName || "待填写"} · 回复关键词：${config.replyKeyword || "Codex"}</p>
          <p>优先使用“复制富文本”，粘贴到微信公众平台编辑器后会尽量保留图文样式。</p>
        </div>
        <div class="actions">
          <a class="action" href="https://mp.weixin.qq.com/" target="_blank" rel="noreferrer">打开公众号后台</a>
          <button class="primary" id="generate">重新生成全部文章</button>
        </div>
      </header>
      <section class="notice">
        <p>${apiHint}</p>
        <p>API 路径：创建草稿 → 可选提交发布。没有接口权限时，微信会返回明确错误。</p>
      </section>
      <section id="list" class="grid"></section>
    </main>
    <div id="toast" class="toast">已复制</div>
    <script>
      const list = document.querySelector("#list");
      const toast = document.querySelector("#toast");
      function showToast(text) {
        toast.textContent = text;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 2600);
      }
      function statusText(article) {
        if (article.articleUrl) return "已发布";
        if (article.status === "publish_submitted") return "已提交发布";
        if (article.status === "wechat_draft") return "已创建草稿";
        return "草稿待发";
      }
      async function fetchText(url) {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(await response.text());
        return response.text();
      }
      async function copyPlain(url, label) {
        const text = await fetchText(url);
        await navigator.clipboard.writeText(text);
        showToast(label || "已复制");
      }
      async function copyRich(date) {
        const html = await fetchText("/article/" + date + ".html");
        const doc = new DOMParser().parseFromString(html, "text/html");
        const article = doc.body.querySelector("section") || doc.body;
        const rich = article.outerHTML || article.innerHTML;
        const plain = article.innerText || doc.body.innerText || "";
        if (window.ClipboardItem && navigator.clipboard.write) {
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([rich], { type: "text/html" }),
              "text/plain": new Blob([plain], { type: "text/plain" }),
            }),
          ]);
          showToast("富文本已复制。现在打开公众号后台，粘贴到图文编辑器正文区域。");
          return;
        }
        await navigator.clipboard.writeText(rich);
        showToast("浏览器不支持富文本剪贴板，已复制 HTML。");
      }
      async function publishApi(date, mode) {
        const response = await fetch("/api/articles/" + date + "/publish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "发布失败");
        showToast(payload.output || "已提交");
        await load();
      }
      async function load() {
        const response = await fetch("/api/articles", { cache: "no-store" });
        const payload = await response.json();
        list.replaceChildren();
        payload.articles.forEach((article) => {
          const card = document.createElement("article");
          card.className = "card";
          card.innerHTML = \`
            <div>
              <div class="date">\${article.displayDate || article.date}</div>
              <div class="status">\${statusText(article)}</div>
            </div>
            <div>
              <div class="title">\${article.title}</div>
              <p>\${article.digest || ""}</p>
              <div class="actions">
                <button data-copy-title>复制标题</button>
                <button class="green" data-copy-rich>复制富文本</button>
                <button data-copy-md>复制 Markdown</button>
                <button data-copy-html>复制 HTML</button>
                <button class="blue" data-api-draft>API 创建草稿</button>
                <button class="warn" data-api-publish>API 提交发布</button>
                <a class="action" href="/article/\${article.date}.html" target="_blank">预览</a>
                \${article.douyinUrl ? \`<a class="action" href="\${article.douyinUrl}" target="_blank">抖音</a>\` : ""}
                <a class="action" href="\${article.siteUrl}" target="_blank">网站归档</a>
              </div>
              <div class="url-row">
                <input value="\${article.articleUrl || ""}" placeholder="公众号文章发布后，把链接粘贴到这里" />
                <button data-save-url>保存链接</button>
              </div>
            </div>\`;
          card.querySelector("[data-copy-title]").addEventListener("click", async () => {
            await navigator.clipboard.writeText(article.title);
            showToast("标题已复制");
          });
          card.querySelector("[data-copy-rich]").addEventListener("click", () => copyRich(article.date).catch((error) => showToast(error.message)));
          card.querySelector("[data-copy-md]").addEventListener("click", () => copyPlain("/article/" + article.date + ".md", "Markdown 已复制").catch((error) => showToast(error.message)));
          card.querySelector("[data-copy-html]").addEventListener("click", () => copyPlain("/article/" + article.date + ".html", "HTML 已复制").catch((error) => showToast(error.message)));
          card.querySelector("[data-api-draft]").addEventListener("click", () => publishApi(article.date, "draft").catch((error) => showToast(error.message)));
          card.querySelector("[data-api-publish]").addEventListener("click", () => {
            if (confirm("确认要通过公众号 API 提交发布？这会尝试把文章进入发布流程。")) publishApi(article.date, "publish").catch((error) => showToast(error.message));
          });
          card.querySelector("[data-save-url]").addEventListener("click", async () => {
            const articleUrl = card.querySelector("input").value.trim();
            await fetch("/api/articles/" + article.date + "/url", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ articleUrl }),
            });
            showToast("链接已保存");
            await load();
          });
          list.append(card);
        });
      }
      document.querySelector("#generate").addEventListener("click", async () => {
        await fetch("/api/generate", { method: "POST" });
        showToast("已重新生成");
        await load();
      });
      load().catch((error) => {
        list.textContent = error.message;
      });
    </script>
  </body>
</html>`;
}

async function handle(request, response) {
  try {
    const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    if (request.method === "GET" && url.pathname === "/") {
      const config = await readJson(configPath, {});
      send(response, 200, managerHtml(config), "text/html; charset=utf-8");
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/articles") {
      json(response, 200, await readJson(manifestPath, { version: 1, articles: [] }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/generate") {
      const output = await spawnNode(["scripts/wechat-articles.mjs", "generate", "--all"]);
      json(response, 200, { ok: true, output });
      return;
    }
    const articleMatch = url.pathname.match(/^\/article\/(\d{4}-\d{2}-\d{2})\.(html|md)$/);
    if (request.method === "GET" && articleMatch) {
      const [, date, ext] = articleMatch;
      const file = path.join(root, "wechat", "articles", `${date}.${ext}`);
      send(response, 200, await readText(file, "Not generated"), ext === "html" ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8");
      return;
    }
    const publishMatch = url.pathname.match(/^\/api\/articles\/(\d{4}-\d{2}-\d{2})\/publish$/);
    if (request.method === "POST" && publishMatch) {
      const body = JSON.parse(await requestBody(request) || "{}");
      const mode = body.mode === "publish" ? "publish" : "draft";
      const output = await spawnNode(["scripts/wechat-publish.mjs", "--date", publishMatch[1], "--mode", mode]);
      json(response, 200, { ok: true, output });
      return;
    }
    const urlMatch = url.pathname.match(/^\/api\/articles\/(\d{4}-\d{2}-\d{2})\/url$/);
    if (request.method === "POST" && urlMatch) {
      const body = JSON.parse(await requestBody(request) || "{}");
      await updateArticleUrl(urlMatch[1], body.articleUrl || "");
      json(response, 200, { ok: true });
      return;
    }
    send(response, 404, "Not found");
  } catch (error) {
    json(response, 500, { error: error.message });
  }
}

http.createServer(handle).listen(port, "127.0.0.1", () => {
  console.log(`WeChat manager: http://127.0.0.1:${port}`);
});

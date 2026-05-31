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

function runGenerateAll() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/wechat-articles.mjs", "generate", "--all"], {
      cwd: root,
      shell: false,
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("exit", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output || `generate exited ${code}`));
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
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>公众号发布管理</title>
    <style>
      :root { color-scheme: dark; --bg:#07100f; --panel:#101a18; --text:#f7f4e8; --muted:#9fb0aa; --line:rgba(247,244,232,.14); --mint:#5ce1a5; --amber:#ffcc33; }
      * { box-sizing: border-box; }
      body { margin:0; background:var(--bg); color:var(--text); font-family:Arial,"Microsoft YaHei",sans-serif; }
      main { width:min(1120px, calc(100% - 32px)); margin:0 auto; padding:34px 0 60px; }
      header { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; margin-bottom:24px; }
      h1 { margin:0; font-size:42px; line-height:1.1; }
      p { margin:0; color:var(--muted); line-height:1.6; }
      button, input, a.action { min-height:38px; border:1px solid var(--line); border-radius:8px; color:var(--text); background:rgba(247,244,232,.08); padding:0 12px; font:inherit; font-weight:800; text-decoration:none; display:inline-flex; align-items:center; }
      button.primary { color:#06100f; background:var(--mint); border-color:var(--mint); }
      .grid { display:grid; gap:14px; }
      .card { border:1px solid var(--line); border-radius:8px; background:var(--panel); padding:16px; display:grid; grid-template-columns:170px minmax(0,1fr); gap:16px; }
      .date { color:var(--mint); font-weight:900; }
      .title { margin:4px 0 8px; font-size:22px; font-weight:900; }
      .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
      .url-row { display:flex; gap:8px; margin-top:12px; }
      .url-row input { flex:1; font-weight:400; color:var(--text); }
      .status { color:var(--amber); font-weight:900; }
      .toast { position:fixed; right:18px; bottom:18px; padding:12px 14px; border-radius:8px; background:var(--mint); color:#06100f; font-weight:900; opacity:0; transform:translateY(10px); transition:160ms ease; }
      .toast.show { opacity:1; transform:translateY(0); }
      @media (max-width:760px){ header,.card{grid-template-columns:1fr; flex-direction:column;} .url-row{flex-direction:column;} }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>公众号发布管理</h1>
          <p>公众号：${config.accountName || "待填写"} · 回复关键词：${config.replyKeyword || "Codex"}</p>
          <p>流程：生成文章 → 复制到公众号后台 → 发布后录入文章链接 → 网站同步展示。</p>
        </div>
        <button class="primary" id="generate">重新生成全部文章</button>
      </header>
      <section id="list" class="grid"></section>
    </main>
    <div id="toast" class="toast">已复制</div>
    <script>
      const list = document.querySelector("#list");
      const toast = document.querySelector("#toast");
      function showToast(text) {
        toast.textContent = text;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 1300);
      }
      async function copyText(url) {
        const response = await fetch(url, { cache: "no-store" });
        const text = await response.text();
        await navigator.clipboard.writeText(text);
        showToast("已复制");
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
              <div class="status">\${article.articleUrl ? "已发布" : "草稿待发"}</div>
            </div>
            <div>
              <div class="title">\${article.title}</div>
              <p>\${article.digest || ""}</p>
              <div class="actions">
                <button data-copy-title>复制标题</button>
                <button data-copy-md>复制 Markdown</button>
                <button data-copy-html>复制 HTML</button>
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
          card.querySelector("[data-copy-md]").addEventListener("click", () => copyText("/article/" + article.date + ".md"));
          card.querySelector("[data-copy-html]").addEventListener("click", () => copyText("/article/" + article.date + ".html"));
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
      const output = await runGenerateAll();
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

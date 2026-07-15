const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
let metadataCache;

function rawArgValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function loadMetadata() {
  if (metadataCache !== undefined) return metadataCache;
  const metadataPath = rawArgValue("--metadata", "");
  metadataCache = readJson(metadataPath, {});
  return metadataCache;
}

function metadataArgValue(name) {
  const keyMap = {
    "--date": ["date"],
    "--video": ["video", "videoPath"],
    "--title": ["title"],
    "--desc": ["desc", "description"],
    "--profile": ["profile"],
    "--duration": ["duration"],
    "--proxy": ["proxy"],
    "--manual-timeout-ms": ["manualTimeoutMs"],
  };
  const keys = keyMap[name];
  if (!keys) return undefined;
  const value = metadataValue(loadMetadata(), keys, undefined);
  return value === undefined ? undefined : String(value);
}

function argValue(name, fallback = "") {
  if (name === "--metadata") return rawArgValue(name, fallback);
  const metadataValue = metadataArgValue(name);
  if (metadataValue !== undefined) return metadataValue;
  return rawArgValue(name, fallback);
}

function readJson(file, fallback = {}) {
  if (!file) return fallback;
  const jsonPath = path.isAbsolute(file) ? file : path.resolve(root, file);
  try {
    return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read JSON metadata ${jsonPath}: ${error.message}`);
  }
}

function textLooksCorrupt(text) {
  const value = String(text || "");
  const compact = value.replace(/\s/g, "");
  const questionMarks = (compact.match(/\?/g) || []).length;
  return /�/.test(value) || /\?{2,}/.test(value) || (compact.length > 0 && questionMarks >= 3 && questionMarks / compact.length > 0.2);
}

function validatePublishText(label, value) {
  if (!String(value || "").trim()) {
    throw new Error(`${label} is required.`);
  }
  if (textLooksCorrupt(value)) {
    throw new Error(`${label} looks corrupt; write Chinese publish copy to UTF-8 JSON and pass it with --metadata.`);
  }
}

function metadataValue(metadata, keys, fallback) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(metadata, key) && metadata[key] !== undefined && metadata[key] !== null && metadata[key] !== "") {
      return metadata[key];
    }
  }
  return fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requirePlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    "D:/software_lhj/nodejs/node_cache/_npx/9f5b418b1954b0a5/node_modules/playwright",
    "D:/software_lhj/nodejs/node_cache/_npx/e41f203b7505f1fb/node_modules/playwright",
    "D:/software_lhj/nodejs/node_cache/_npx/31e32ef8478fbf80/node_modules/playwright",
    "playwright",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {}
  }
  throw new Error("Playwright module not found. Run npx --yes playwright first or set PLAYWRIGHT_MODULE.");
}

async function clickText(page, pattern, options = {}) {
  const locator = page.getByText(pattern).first();
  await locator.waitFor({ state: "visible", timeout: options.timeout || 30000 });
  await locator.click({ timeout: options.timeout || 30000 });
}

async function waitForAnyText(page, patterns, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const body = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    for (const pattern of patterns) {
      if (typeof pattern === "string" ? body.includes(pattern) : pattern.test(body)) {
        return { pattern, body };
      }
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for any text: ${patterns.map(String).join(", ")}`);
}

function isLoginGate(body = "") {
  return /扫码登录|登录抖音|验证码登录|密码登录|登录\/注册/.test(body) && !/上传视频|发布视频/.test(body);
}

async function waitThroughLoginGate(page, manualTimeoutMs) {
  const readyTexts = ["发布视频", "上传视频", "高清发布", "作品管理"];
  const gateTexts = [...readyTexts, "扫码登录", "登录抖音", "验证码登录", "密码登录", "登录/注册"];
  const first = await waitForAnyText(page, gateTexts, 120000);
  if (!isLoginGate(first.body)) return first.body;

  console.log("[manual] Douyin login is required in the visible browser window.");
  console.log("[manual] Please scan the QR code or finish verification; this script will continue automatically.");
  const afterLogin = await waitForAnyText(page, readyTexts, manualTimeoutMs);
  return afterLogin.body;
}

async function fillContentEditable(page, text) {
  const editable = page.locator('[contenteditable="true"]').first();
  await editable.waitFor({ state: "visible", timeout: 60000 });
  await editable.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type(text, { delay: 5 });
}

async function fillTitle(page, title) {
  const textbox = page.getByRole("textbox").first();
  await textbox.waitFor({ state: "visible", timeout: 60000 });
  await textbox.fill(title);
}

async function uploadVideo(page, videoPath) {
  const input = page.locator('input[type="file"]').first();
  await input.waitFor({ state: "attached", timeout: 60000 });
  await input.setInputFiles(videoPath);
}

async function waitForUploadReady(page) {
  const start = Date.now();
  while (Date.now() - start < 12 * 60 * 1000) {
    const body = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    if (/重新上传|预览视频|发布设置|作品描述|标题|封面/.test(body)) {
      return body;
    }
    if (/登录|扫码登录/.test(body) && !/发布视频|上传视频/.test(body)) {
      throw new Error("Douyin login appears to be expired.");
    }
    await sleep(3000);
  }
  throw new Error("Timed out waiting for upload processing to finish.");
}

async function waitForUploadedPreview(page) {
  try {
    await page.getByText(/重新上传|预览视频|发布设置|作品描述|标题|封面/).first().waitFor({
      state: "visible",
      timeout: 12 * 60 * 1000,
    });
  } catch {
    await waitForUploadReady(page);
  }
}

async function saveEvidence(page, date, suffix) {
  const body = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
  const bodyPath = path.join(root, "data", `douyin-${suffix}-${date}-body.txt`);
  const screenPath = path.join(root, "data", `douyin-${suffix}-${date}-screen.png`);
  fs.mkdirSync(path.dirname(bodyPath), { recursive: true });
  fs.writeFileSync(bodyPath, body, "utf8");
  await page.screenshot({ path: screenPath, fullPage: true }).catch(() => {});
  return { body, bodyPath, screenPath };
}

async function findPublishedWork(page, title, durationText, date) {
  await page.goto("https://creator.douyin.com/creator-micro/content/manage?enter_from=publish", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await waitForAnyText(page, ["作品管理", "已发布", "审核中", title.slice(0, 8), durationText], 120000);

  const titlePrefix = title.slice(0, 8);
  const deadline = Date.now() + 120000;
  let body = "";
  while (Date.now() < deadline) {
    body = await page.locator("body").innerText({ timeout: 10000 }).catch(() => body);
    const loaded = !body.includes("加载中");
    const matched = body.includes(titlePrefix) || (durationText && body.includes(durationText));
    if (loaded && matched) break;
    await sleep(3000);
  }

  if (!body.includes(titlePrefix)) {
    await page.getByText("全部作品").first().click().catch(() => {});
    const search = page.getByPlaceholder("搜索作品").first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill(title);
      await page.keyboard.press("Enter");
      await sleep(8000);
    }
  }

  const evidence = await saveEvidence(page, date, "manage-after-publish");
  body = evidence.body;
  const matchIndex = body.indexOf(titlePrefix);
  const matchedRow = matchIndex >= 0 ? body.slice(matchIndex, matchIndex + 600) : body;
  const publicUrlMatch = body.match(/https?:\/\/(?:www\.)?douyin\.com\/video\/\d+/);
  return {
    published: matchIndex >= 0 || (durationText && body.includes(durationText)),
    review: matchedRow.includes("审核中") && !matchedRow.includes("已发布"),
    status: matchedRow.includes("已发布") ? "已发布" : matchedRow.includes("审核中") ? "审核中" : "未确认",
    publicUrl: publicUrlMatch?.[0] || "",
    evidence,
  };
}

async function main() {
  const date = argValue("--date", new Date().toISOString().slice(0, 10));
  const videoPath = path.resolve(root, argValue("--video", "renders/developer-radar-2026-06-13-voiceover-final.mp4"));
  const title = argValue("--title", "今日AI开发者热点：superpowers、agentsview、LMCache");
  const desc = argValue(
    "--desc",
    "七个方向：Agent技能、会话分析、KV缓存、AI协作、网页数据、代码模型、纠错规则。#AI编程 #开发者 #开源项目 #Agent"
  );
  const profile = path.resolve(root, argValue("--profile", ".playwright-douyin-profile"));
  const publishedDuration = argValue("--duration", "00:58");
  const proxyServer = argValue("--proxy", process.env.DOUYIN_PROXY || "");
  const manualTimeoutMs = Number(argValue("--manual-timeout-ms", String(15 * 60 * 1000)));
  const dryRun = process.argv.includes("--dry-run") || loadMetadata().dryRun === true;

  validatePublishText("title", title);
  validatePublishText("description", desc);

  if (process.argv.includes("--validate-only")) {
    console.log(JSON.stringify({ date, videoPath, title, desc, duration: publishedDuration, profile, proxy: proxyServer }, null, 2));
    return;
  }

  if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);
  const { chromium } = requirePlaywright();

  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(60000);

  page.on("dialog", async (dialog) => {
    console.log(`[dialog] ${dialog.message()}`);
    await dialog.accept().catch(() => {});
  });

  try {
    console.log(`[open] profile=${profile}`);
    console.log(`[open] video=${videoPath}`);
    await page.goto("https://creator.douyin.com/creator-micro/content/upload", {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    let body = await waitThroughLoginGate(page, manualTimeoutMs);

    if (!/上传视频|点击上传|发布视频/.test(body)) {
      await clickText(page, /高清发布|发布视频/);
      await sleep(1500);
      body = await page.locator("body").innerText({ timeout: 10000 }).catch(() => body);
    }

    console.log("[upload] selecting video");
    await uploadVideo(page, videoPath);
    await waitForUploadedPreview(page);
    await sleep(3000);

    console.log("[form] filling title and description");
    await fillTitle(page, title);
    await fillContentEditable(page, desc);

    if (dryRun) {
      console.log("[dry-run] form filled; not clicking publish");
      await saveEvidence(page, date, "upload-dry-run");
      return;
    }

    console.log("[publish] clicking publish");
    await page.getByRole("button", { name: /^发布$/ }).last().click({ timeout: 60000 });
    await sleep(5000);
    const publishState = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
    if (/短信验证码|验证码|接收短信/.test(publishState)) {
      console.log("[blocked] SMS verification is required in the visible browser window.");
      console.log("[manual] Please complete the verification; this script will keep waiting.");
      await waitForAnyText(page, ["作品管理", "已发布", "审核中", "发布成功"], manualTimeoutMs);
    }

    await waitForAnyText(page, ["作品管理", "已发布", "审核中", "发布成功"], 5 * 60 * 1000).catch(() => {});
    const result = await findPublishedWork(page, title, publishedDuration, date);
    console.log(JSON.stringify({ ...result, title, duration: publishedDuration, url: page.url() }, null, 2));
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

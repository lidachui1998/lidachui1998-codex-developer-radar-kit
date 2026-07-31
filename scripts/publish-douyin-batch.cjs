const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const HOME_URL = "https://creator.douyin.com/creator-micro/home";
const UPLOAD_URL = "https://creator.douyin.com/creator-micro/content/upload";
const MANAGE_URL = "https://creator.douyin.com/creator-micro/content/manage?enter_from=publish";
const WORK_LIST_URL = "https://creator.douyin.com/janus/douyin/creator/pc/work_list";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function argValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && index + 1 < process.argv.length) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
}

function argValue(name, fallback = "") {
  return argValues(name)[0] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readJson(file) {
  const fullPath = path.isAbsolute(file) ? file : path.resolve(root, file);
  try {
    return { fullPath, value: JSON.parse(fs.readFileSync(fullPath, "utf8")) };
  } catch (error) {
    throw new Error(`Failed to read JSON metadata ${fullPath}: ${error.message}`);
  }
}

function textLooksCorrupt(text) {
  const value = String(text || "");
  const compact = value.replace(/\s/g, "");
  const questionMarks = (compact.match(/\?/g) || []).length;
  return /�/.test(value) || /\?{2,}/.test(value) ||
    (compact.length > 0 && questionMarks >= 3 && questionMarks / compact.length > 0.2);
}

function validatePublishText(label, value) {
  if (!String(value || "").trim()) throw new Error(`${label} is required.`);
  if (textLooksCorrupt(value)) {
    throw new Error(`${label} looks corrupt; keep Chinese publish copy in UTF-8 JSON metadata.`);
  }
}

function normalizeMetadata(metadataPath) {
  const { fullPath, value } = readJson(metadataPath);
  const date = String(value.date || path.basename(fullPath).match(/\d{4}-\d{2}-\d{2}/)?.[0] || "");
  const video = value.video || value.videoPath;
  const title = String(value.title || "");
  const description = String(value.description || value.desc || "");
  const duration = String(value.duration || "");
  const profile = path.resolve(root, value.profile || ".playwright-douyin-profile");
  const videoPath = path.resolve(root, video || "");
  const manualTimeoutMs = Number(value.manualTimeoutMs || 15 * 60 * 1000);

  if (!date) throw new Error(`date is required in ${fullPath}`);
  if (!video) throw new Error(`video is required in ${fullPath}`);
  validatePublishText("title", title);
  validatePublishText("description", description);

  return {
    metadataPath: fullPath,
    date,
    videoPath,
    title,
    description,
    duration,
    profile,
    metadataProxy: String(value.proxy || ""),
    manualTimeoutMs,
  };
}

function npxPlaywrightCandidates() {
  const caches = [process.env.npm_config_cache, process.env.NPM_CONFIG_CACHE];
  try {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    caches.push(execFileSync(npmCommand, ["config", "get", "cache"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim());
  } catch {}

  const candidates = [];
  for (const cache of new Set(caches.filter(Boolean))) {
    const npxDir = path.join(cache, "_npx");
    let entries = [];
    try {
      entries = fs.readdirSync(npxDir, { withFileTypes: true });
    } catch {}
    for (const entry of entries) {
      if (entry.isDirectory()) {
        candidates.push(path.join(npxDir, entry.name, "node_modules", "playwright"));
      }
    }
  }
  return candidates;
}

function requirePlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, "playwright", ...npxPlaywrightCandidates()].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {}
  }
  throw new Error("Playwright module not found. Run npx --yes playwright first or set PLAYWRIGHT_MODULE.");
}

async function waitForAnyText(page, patterns, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let body = "";
  while (Date.now() < deadline) {
    body = await page.locator("body").innerText({ timeout: 10000 }).catch(() => body);
    if (patterns.some((pattern) => typeof pattern === "string" ? body.includes(pattern) : pattern.test(body))) {
      return body;
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for: ${patterns.map(String).join(", ")}`);
}

function isLoginGate(body = "") {
  return /扫码登录|登录抖音|验证码登录|密码登录|登录\/注册/.test(body) &&
    !/上传视频|发布视频|作品管理/.test(body);
}

async function ensureAuthenticated(page, manualTimeoutMs) {
  await page.goto(UPLOAD_URL, { waitUntil: "commit", timeout: 60000 });
  const attachTimeoutMs = Number(process.env.DOUYIN_UPLOAD_ATTACH_TIMEOUT_MS || 120000);
  const fastDeadline = Date.now() + (Number.isFinite(attachTimeoutMs) && attachTimeoutMs > 0 ? attachTimeoutMs : 120000);
  let body = "";
  while (Date.now() < fastDeadline) {
    const input = page.locator('input[type="file"]').first();
    if (await input.count().catch(() => 0)) {
      await input.waitFor({ state: "attached", timeout: 5000 });
      console.log("[ready] upload input attached without waiting for the home micro-frontend");
      return;
    }
    body = await page.locator("body").innerText({ timeout: 3000 }).catch(() => body);
    if (isLoginGate(body)) break;
    await sleep(1000);
  }

  if (!isLoginGate(body)) {
    throw new Error("Upload input did not attach within 45 seconds on the direct upload page.");
  }

  console.log("[manual] Douyin login is required in the visible browser window.");
  console.log("[manual] Complete login once; the script waits only for the upload input, not the full home page.");
  const deadline = Date.now() + manualTimeoutMs;
  while (Date.now() < deadline) {
    if (!page.url().includes("/content/upload")) {
      await page.goto(UPLOAD_URL, { waitUntil: "commit", timeout: 60000 }).catch(() => {});
    }
    const input = page.locator('input[type="file"]').first();
    if (await input.count().catch(() => 0)) {
      await input.waitFor({ state: "attached", timeout: 5000 });
      console.log("[ready] login restored and upload input attached");
      return;
    }
    await sleep(1000);
  }
  throw new Error("Timed out waiting for the upload input after login.");
}

function itemText(item = {}) {
  return [item.item_title, item.desc].filter(Boolean).join("\n");
}

function statusFromWork(item = {}) {
  const status = item.status || {};
  if (status.is_prohibited) return "未通过";
  if (status.in_reviewing) return "审核中";
  return item.aweme_id ? "已发布" : "未确认";
}

function summarizeWork(item, metadata) {
  if (!item) return null;
  const awemeId = String(item.aweme_id || item.status?.aweme_id || "");
  return {
    date: metadata.date,
    title: metadata.title,
    duration: metadata.duration,
    found: true,
    status: statusFromWork(item),
    awemeId,
    publicUrl: String(item.share_url || (awemeId ? `https://www.douyin.com/video/${awemeId}` : "")),
    createTime: item.create_time || null,
  };
}

async function requestWorkPage(page, context, cursor = 0) {
  const browserInfo = page
    ? await page.evaluate(() => ({
        language: navigator.language || "zh-CN",
        platform: navigator.platform || "Win32",
        userAgent: navigator.userAgent || "Mozilla/5.0",
        online: navigator.onLine !== false,
        screenWidth: screen.width || 1440,
        screenHeight: screen.height || 1000,
      }))
    : {
        language: "zh-CN",
        platform: "Win32",
        userAgent: "Mozilla/5.0",
        online: true,
        screenWidth: 1440,
        screenHeight: 1000,
      };
  const url = new URL(WORK_LIST_URL);
  url.searchParams.set("status", "0");
  url.searchParams.set("count", "12");
  url.searchParams.set("max_cursor", String(cursor || 0));
  url.searchParams.set("scene", "star_atlas");
  url.searchParams.set("device_platform", "android");
  url.searchParams.set("cookie_enabled", "true");
  url.searchParams.set("screen_width", String(browserInfo.screenWidth));
  url.searchParams.set("screen_height", String(browserInfo.screenHeight));
  url.searchParams.set("browser_language", browserInfo.language);
  url.searchParams.set("browser_platform", browserInfo.platform);
  url.searchParams.set("browser_name", "Mozilla");
  url.searchParams.set("browser_version", browserInfo.userAgent.replace(/^Mozilla\//, ""));
  url.searchParams.set("browser_online", String(browserInfo.online));
  url.searchParams.set("timezone_name", "Asia/Shanghai");
  url.searchParams.set("aid", "1128");
  url.searchParams.set("support_h265", "1");

  let status;
  let text;
  if (page) {
    const result = await page.evaluate(async (requestUrl) => {
      const response = await fetch(requestUrl, { credentials: "include" });
      return { status: response.status, text: await response.text() };
    }, url.toString());
    status = result.status;
    text = result.text;
  } else {
    const response = await context.request.get(url.toString(), {
      headers: { Referer: MANAGE_URL },
      timeout: 60000,
    });
    status = response.status();
    text = await response.text();
  }
  if (status < 200 || status >= 300) {
    throw new Error(`work_list HTTP ${status}: ${text.slice(0, 240)}`);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error(`work_list returned non-JSON: ${text.slice(0, 240)}`);
  }
  if (payload.status_code && payload.status_code !== 0) {
    throw new Error(`work_list status_code=${payload.status_code}: ${payload.status_msg || "unknown"}`);
  }
  return payload;
}

async function findWorkViaApi(page, context, metadata, maxPages = 5) {
  let cursor = 0;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const payload = await requestWorkPage(page, context, cursor);
    const items = Array.isArray(payload.aweme_list) ? payload.aweme_list : [];
    const match = items.find((item) => itemText(item).includes(metadata.title));
    if (match) return summarizeWork(match, metadata);
    const nextCursor = Number(payload.max_cursor || payload.cursor || 0);
    if (!payload.has_more || !Number.isFinite(nextCursor) || nextCursor === cursor) break;
    cursor = nextCursor;
  }
  return {
    date: metadata.date,
    title: metadata.title,
    duration: metadata.duration,
    found: false,
    status: "不存在",
    awemeId: "",
    publicUrl: "",
    createTime: null,
  };
}

function evidencePath(metadata) {
  return path.join(root, "data", `douyin-api-status-${metadata.date}.json`);
}

function saveStatusEvidence(result) {
  fs.writeFileSync(evidencePath(result), `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

async function waitForUploadReady(page) {
  return waitForAnyText(page, [/重新上传|预览视频|发布设置|作品描述|标题|封面/], 12 * 60 * 1000);
}

async function fillDescription(page, description) {
  const editable = page.locator('[contenteditable="true"]').first();
  await editable.waitFor({ state: "visible", timeout: 60000 });
  await editable.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type(description, { delay: 3 });
}

async function fillTitle(page, title) {
  const textboxes = page.getByRole("textbox");
  const count = await textboxes.count();
  for (let index = 0; index < count; index += 1) {
    const textbox = textboxes.nth(index);
    if (await textbox.isVisible().catch(() => false)) {
      await textbox.fill(title);
      return;
    }
  }
  throw new Error("Visible title textbox not found.");
}

async function clickPublish(page) {
  const buttons = page.getByRole("button", { name: "发布", exact: true });
  const count = await buttons.count();
  const visible = [];
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (await button.isVisible().catch(() => false)) visible.push(button);
  }
  if (visible.length !== 1) throw new Error(`Expected one visible publish button, found ${visible.length}.`);
  await visible[0].click({ timeout: 60000 });
}

async function savePageEvidence(page, metadata, suffix) {
  const bodyPath = path.join(root, "data", `douyin-${suffix}-${metadata.date}-body.txt`);
  const screenPath = path.join(root, "data", `douyin-${suffix}-${metadata.date}-screen.png`);
  const body = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
  fs.writeFileSync(bodyPath, body, "utf8");
  await page.screenshot({ path: screenPath, fullPage: true }).catch(() => {});
  return { bodyPath, screenPath };
}

async function publishOne(page, context, metadata, options) {
  const existing = await findWorkViaApi(page, context, metadata).catch((error) => ({
    date: metadata.date,
    title: metadata.title,
    found: false,
    status: "API检查失败",
    error: error.message,
  }));
  saveStatusEvidence(existing);
  if (existing.found) {
    console.log(`[skip] ${metadata.date} already exists with status ${existing.status}.`);
    return { action: "skipped_existing", ...existing };
  }
  if (options.statusOnly) {
    return { action: existing.error ? "status_failed" : "status_only", ...existing };
  }
  if (!fs.existsSync(metadata.videoPath)) throw new Error(`Video not found: ${metadata.videoPath}`);

  console.log(`[upload] ${metadata.date} ${metadata.videoPath}`);
  if (!page.url().includes("/content/upload")) {
    await page.goto(UPLOAD_URL, { waitUntil: "commit", timeout: 60000 });
  }
  const input = page.locator('input[type="file"]').first();
  await input.waitFor({ state: "attached", timeout: 45000 });
  await input.setInputFiles(metadata.videoPath);
  await waitForUploadReady(page);

  console.log(`[form] ${metadata.date} filling validated UTF-8 title and description`);
  await fillTitle(page, metadata.title);
  await fillDescription(page, metadata.description);

  if (options.dryRun) {
    const evidence = await savePageEvidence(page, metadata, "batch-dry-run");
    return { action: "dry_run", date: metadata.date, title: metadata.title, evidence };
  }

  console.log(`[publish] ${metadata.date} clicking publish`);
  await clickPublish(page);
  await waitForAnyText(page, ["发布成功", "作品管理", "审核中", "已发布", "验证码"], 30000).catch(() => "");

  const deadline = Date.now() + 2 * 60 * 1000;
  let verified = null;
  let apiError = "";
  while (Date.now() < deadline) {
    try {
      const result = await findWorkViaApi(page, context, metadata);
      if (result.found) {
        verified = result;
        break;
      }
    } catch (error) {
      apiError = error.message;
    }
    await sleep(5000);
  }

  const evidence = await savePageEvidence(page, metadata, "batch-after-publish");
  if (!verified) {
    const result = {
      action: "publish_clicked_status_unconfirmed",
      date: metadata.date,
      title: metadata.title,
      status: "未确认",
      publicUrl: "",
      apiError,
      evidence,
    };
    saveStatusEvidence(result);
    return result;
  }

  const result = { action: "published", ...verified, evidence };
  saveStatusEvidence(result);
  return result;
}

async function main() {
  const metadataPaths = argValues("--metadata");
  if (!metadataPaths.length) {
    throw new Error("Pass one or more --metadata <UTF-8 JSON> arguments.");
  }
  const metadataItems = metadataPaths.map(normalizeMetadata);
  const profiles = new Set(metadataItems.map((item) => item.profile.toLowerCase()));
  if (profiles.size !== 1) throw new Error("All metadata files must use the same persistent profile.");

  const explicitProxy = argValue("--proxy", "");
  const useMetadataProxy = hasFlag("--use-metadata-proxy");
  const proxy = explicitProxy || (useMetadataProxy ? metadataItems[0].metadataProxy : "");
  const options = {
    dryRun: hasFlag("--dry-run"),
    statusOnly: hasFlag("--status-only"),
    headless: hasFlag("--headless"),
  };

  const validation = {
    mode: "direct-batch",
    proxyMode: proxy ? "explicit" : "direct",
    proxy,
    profile: metadataItems[0].profile,
    items: metadataItems.map((item) => ({
      date: item.date,
      metadataPath: item.metadataPath,
      videoPath: item.videoPath,
      videoExists: fs.existsSync(item.videoPath),
      title: item.title,
      description: item.description,
      duration: item.duration,
    })),
  };
  if (hasFlag("--validate-only")) {
    console.log(JSON.stringify(validation, null, 2));
    return;
  }

  const { chromium } = requirePlaywright();
  const context = await chromium.launchPersistentContext(metadataItems[0].profile, {
    headless: options.headless,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    ...(proxy ? { proxy: { server: proxy } } : {}),
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(60000);
  const manualTimeoutOverride = Number(argValue("--manual-timeout-ms", ""));
  const manualTimeoutMs = Number.isFinite(manualTimeoutOverride) && manualTimeoutOverride > 0
    ? manualTimeoutOverride
    : Math.max(...metadataItems.map((item) => item.manualTimeoutMs));
  const results = [];

  try {
    console.log(`[open] one persistent browser, ${proxy ? `proxy=${proxy}` : "direct connection"}`);
    if (options.statusOnly) {
      await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    } else {
      await ensureAuthenticated(page, manualTimeoutMs);
    }
    for (const metadata of metadataItems) {
      try {
        results.push(await publishOne(page, context, metadata, options));
      } catch (error) {
        results.push({ action: "failed", date: metadata.date, title: metadata.title, error: error.message });
      }
    }
  } finally {
    await context.close().catch(() => {});
  }

  console.log(JSON.stringify({ ...validation, results }, null, 2));
  if (results.some((result) => result.action === "failed" || result.action === "status_failed")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

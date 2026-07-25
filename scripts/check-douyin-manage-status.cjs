const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

function npxPlaywrightCandidates() {
  const caches = [
    process.env.npm_config_cache,
    process.env.NPM_CONFIG_CACHE,
  ];
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
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    "playwright",
    ...npxPlaywrightCandidates(),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {}
  }
  throw new Error("Playwright module not found.");
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function findWorkRow(body, titleText) {
  return String(body || "")
    .split(/(?=^\d{2}:\d{2}\r?$)/m)
    .find((row) => row.includes(titleText)) || "";
}

(async () => {
  const metadataPath = path.resolve(root, argValue("--metadata", "data/douyin-publish-2026-07-15.json"));
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const date = metadata.date || path.basename(metadataPath).match(/\d{4}-\d{2}-\d{2}/)?.[0] || "latest";
  const title = metadata.title;
  const duration = metadata.duration || "";
  const profile = path.resolve(root, metadata.profile || ".playwright-douyin-profile");
  const proxy = metadata.proxy || process.env.DOUYIN_PROXY || "";
  const { chromium } = requirePlaywright();
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    ...(proxy ? { proxy: { server: proxy } } : {}),
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(60000);
  await page.goto("https://creator.douyin.com/creator-micro/content/manage?enter_from=publish", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });

  let body = "";
  const loadDeadline = Date.now() + 120000;
  while (Date.now() < loadDeadline) {
    body = await page.locator("body").innerText().catch(() => body);
    if (!body.includes("加载中") && /共\s*\d+\s*个作品/.test(body)) break;
    await sleep(3000);
  }

  await page.getByText("全部作品").first().click().catch(() => {});
  const search = page.getByPlaceholder("搜索作品").first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill(title);
    await page.keyboard.press("Enter");
    await sleep(8000);
  }

  body = await page.locator("body").innerText().catch(() => body);
  const matchedRow = findWorkRow(body, title);
  const titleFound = Boolean(matchedRow);
  const durationFound = duration ? matchedRow.includes(duration) : false;
  const publicUrl = matchedRow.match(/https?:\/\/(?:www\.)?douyin\.com\/video\/\d+/)?.[0] || "";
  const status = matchedRow.includes("已发布")
    ? "已发布"
    : matchedRow.includes("审核中")
      ? "审核中"
      : matchedRow.includes("未通过")
        ? "未通过"
        : "未确认";
  const result = {
    title,
    duration,
    titleFound,
    durationFound,
    status,
    reviewVisible: status === "审核中",
    publishedVisible: status === "已发布",
    rejectedVisible: status === "未通过",
    publicUrl,
    matchedRow,
  };
  fs.writeFileSync(path.join(root, "data", `douyin-manage-recheck-${date}-body.txt`), body, "utf8");
  await page.screenshot({ path: path.join(root, "data", `douyin-manage-recheck-${date}-screen.png`), fullPage: true });
  console.log(JSON.stringify(result, null, 2));
  await context.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

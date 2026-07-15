const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

function requirePlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    "D:/software_lhj/nodejs/node_cache/_npx/9f5b418b1954b0a5/node_modules/playwright",
    "playwright",
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

(async () => {
  const metadataPath = path.resolve(root, argValue("--metadata", "data/douyin-publish-2026-07-15.json"));
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
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
  const titlePrefix = title.slice(0, 10);
  const titleFound = body.includes(titlePrefix);
  const durationFound = duration ? body.includes(duration) : false;
  const publicUrl = body.match(/https?:\/\/(?:www\.)?douyin\.com\/video\/\d+/)?.[0] || "";
  const result = {
    title,
    duration,
    titleFound,
    durationFound,
    reviewVisible: body.includes("审核中"),
    publishedVisible: body.includes("已发布"),
    rejectedVisible: body.includes("未通过"),
    publicUrl,
    bodyPreview: body.slice(0, 2200),
  };
  fs.writeFileSync(path.join(root, "data", "douyin-manage-recheck-2026-07-15-body.txt"), body, "utf8");
  await page.screenshot({ path: path.join(root, "data", "douyin-manage-recheck-2026-07-15-screen.png"), fullPage: true });
  console.log(JSON.stringify(result, null, 2));
  await context.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

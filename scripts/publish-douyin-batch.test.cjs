const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "scripts", "publish-douyin-batch.cjs");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-batch-meta-"));

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
}

try {
  const first = path.join(tmpDir, "first.json");
  const second = path.join(tmpDir, "second.json");
  fs.writeFileSync(first, JSON.stringify({
    date: "2026-07-28",
    video: "renders/first.mp4",
    title: "今日AI开发者热点：开放权重与Agent工具链",
    description: "七个方向，适合开发者快速复盘。#人工智能 #Agent",
    duration: "01:11",
    proxy: "http://127.0.0.1:17890",
  }), "utf8");
  fs.writeFileSync(second, JSON.stringify({
    date: "2026-07-29",
    video: "renders/second.mp4",
    title: "今日AI开发者热点：代码安全与Agent记忆",
    description: "七个方向，适合开发者快速复盘。#代码安全 #程序员",
    duration: "01:05",
    proxy: "http://127.0.0.1:17890",
  }), "utf8");

  const direct = run(["--metadata", first, "--metadata", second, "--validate-only"]);
  assert.strictEqual(direct.status, 0, direct.stderr || direct.stdout);
  const directJson = JSON.parse(direct.stdout);
  assert.strictEqual(directJson.proxyMode, "direct");
  assert.strictEqual(directJson.proxy, "");
  assert.strictEqual(directJson.items.length, 2);

  const proxied = run(["--metadata", first, "--use-metadata-proxy", "--validate-only"]);
  assert.strictEqual(proxied.status, 0, proxied.stderr || proxied.stdout);
  assert.strictEqual(JSON.parse(proxied.stdout).proxy, "http://127.0.0.1:17890");

  const corrupt = path.join(tmpDir, "corrupt.json");
  fs.writeFileSync(corrupt, JSON.stringify({
    date: "2026-07-29",
    video: "renders/corrupt.mp4",
    title: "????AI????",
    description: "??????",
  }), "utf8");
  const bad = run(["--metadata", corrupt, "--validate-only"]);
  assert.notStrictEqual(bad.status, 0);
  assert.match(bad.stderr, /corrupt/i);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

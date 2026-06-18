const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "scripts", "publish-douyin-video.cjs");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-publish-meta-"));

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

try {
  const metadataPath = path.join(tmpDir, "metadata.json");
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        date: "2026-06-18",
        video: "renders/developer-radar-2026-06-18-voiceover-final.mp4",
        title: "今日 AI 开发者热点：Claude Code、Gemini CLI",
        description: "七个开发者热点，适合今天收藏复盘。#AI编程 #开源项目",
        duration: "00:58",
      },
      null,
      2
    ),
    "utf8"
  );

  const ok = run(["--metadata", metadataPath, "--video", "__missing__.mp4", "--validate-only"]);
  assert.strictEqual(ok.status, 0, ok.stderr || ok.stdout);
  const parsed = JSON.parse(ok.stdout);
  assert.strictEqual(parsed.title, "今日 AI 开发者热点：Claude Code、Gemini CLI");
  assert.strictEqual(parsed.desc, "七个开发者热点，适合今天收藏复盘。#AI编程 #开源项目");

  const corruptedPath = path.join(tmpDir, "corrupted.json");
  fs.writeFileSync(
    corruptedPath,
    JSON.stringify(
      {
        title: "????AI????",
        description: "??????",
      },
      null,
      2
    ),
    "utf8"
  );

  const bad = run(["--metadata", corruptedPath, "--video", "__missing__.mp4", "--validate-only"]);
  assert.notStrictEqual(bad.status, 0, "corrupted metadata should fail validation");
  assert.match(bad.stderr, /corrupt/i);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

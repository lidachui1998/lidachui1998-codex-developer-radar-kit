import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const secretPath = path.join(os.homedir(), ".codex", "secrets", "cloudflare.env");

async function loadCloudflareToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return;
  let text = "";
  try {
    text = await readFile(secretPath, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^CLOUDFLARE_API_TOKEN=(.*)$/);
    if (match?.[1]) {
      process.env.CLOUDFLARE_API_TOKEN = match[1].trim();
      return;
    }
  }
}

function run(commandLine) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "cmd.exe" : "sh";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", commandLine] : ["-c", commandLine];
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${commandLine} failed with exit code ${code}`));
    });
  });
}

await loadCloudflareToken();
await run("npm --prefix site run deploy");

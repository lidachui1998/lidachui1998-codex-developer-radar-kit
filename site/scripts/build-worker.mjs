import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const siteRoot = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(siteRoot, "public");
const outputPath = path.join(siteRoot, "dist", "worker.mjs");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
]);

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolute)));
      continue;
    }
    files.push(absolute);
  }
  return files;
}

function publicPath(file) {
  return `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
}

function contentType(file) {
  return contentTypes.get(path.extname(file).toLowerCase()) || "application/octet-stream";
}

async function shouldSkipFile(file) {
  const relative = publicPath(file);
  return relative.startsWith("/assets/thumbnails/");
}

const files = {};
for (const file of await collectFiles(publicRoot)) {
  if (await shouldSkipFile(file)) continue;
  files[publicPath(file)] = {
    contentType: contentType(file),
    base64: (await readFile(file)).toString("base64"),
  };
}

files["/favicon.ico"] = {
  contentType: "image/svg+xml; charset=utf-8",
  base64: Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#5ce1a5"/><text x="32" y="41" text-anchor="middle" font-family="Arial" font-size="24" font-weight="900" fill="#06100f">CR</text></svg>',
  ).toString("base64"),
};

const worker = `const FILES = ${JSON.stringify(files)};

const THUMBNAIL_PLACEHOLDER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1600"><rect width="900" height="1600" fill="#06100f"/><path d="M0 0h900v1600H0z" fill="#06100f"/><path d="M80 180h740" stroke="#5ce1a5" stroke-width="8"/><path d="M80 320h520" stroke="#ffcc33" stroke-width="18"/><path d="M80 390h680" stroke="#f7f4e8" stroke-width="34"/><path d="M80 470h610" stroke="#f7f4e8" stroke-width="34"/><path d="M80 620h740v420H80z" fill="#101a18" stroke="#5ce1a5" stroke-width="5"/><path d="M120 700h460" stroke="#f7f4e8" stroke-width="30"/><path d="M120 780h360" stroke="#9fb0aa" stroke-width="18"/><path d="M120 880h620" stroke="#ffcc33" stroke-width="16"/><text x="120" y="1280" fill="#5ce1a5" font-family="Arial,sans-serif" font-size="72" font-weight="900">Codex</text><text x="120" y="1370" fill="#f7f4e8" font-family="Arial,sans-serif" font-size="72" font-weight="900">Developer Radar</text></svg>';

function bytesFromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function headersFor(file) {
  const cacheControl = file.contentType.startsWith("text/html") || file.contentType.includes("json")
    ? "no-store"
    : "public, max-age=300";
  return {
    "content-type": file.contentType,
    "cache-control": cacheControl,
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    if (pathname.startsWith("/assets/thumbnails/")) {
      return new Response(THUMBNAIL_PLACEHOLDER, {
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
          "cache-control": "public, max-age=300",
        },
      });
    }
    const file = FILES[pathname] || FILES["/index.html"];
    return new Response(bytesFromBase64(file.base64), { headers: headersFor(file) });
  },
};
`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, worker, "utf8");
console.log(`Wrote ${outputPath}`);

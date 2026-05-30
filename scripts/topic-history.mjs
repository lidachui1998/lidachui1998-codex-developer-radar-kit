import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataPath = path.join(root, "data", "hot-topics.json");
const historyPath = path.join(root, "data", "topic-history.json");

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function normalizeDate(value = "") {
  return String(value).slice(0, 10).replaceAll(".", "-").replaceAll("/", "-");
}

function dateFromData(data) {
  return normalizeDate(data.dateLabel || data.generatedAt || new Date().toISOString());
}

function normalizeUrl(value = "") {
  return String(value).trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}

function repoFromUrl(value = "") {
  const match = normalizeUrl(value).match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)$/i);
  return match?.[1]?.toLowerCase() || null;
}

function repoFromSubtitle(value = "") {
  const match = String(value).trim().match(/^([^/\s]+)\/([^/\s]+)$/);
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}

function itemKey(item) {
  return (
    repoFromUrl(item.url) ||
    repoFromSubtitle(item.subtitle) ||
    normalizeUrl(item.url) ||
    `${item.source || "unknown"}:${item.title || ""}`.toLowerCase()
  );
}

async function readJson(file, fallback) {
  try {
    const text = await readFile(file, "utf8");
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function cutoffDate(date, days) {
  const cutoff = new Date(`${date}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff.toISOString().slice(0, 10);
}

function currentEntries(data, videoPath = "") {
  const date = dateFromData(data);
  return data.items.slice(0, 7).map((item) => ({
    date,
    key: itemKey(item),
    title: item.title,
    source: item.source,
    url: item.url,
    video: videoPath,
  }));
}

function recentDuplicates(entries, history, days) {
  const date = entries[0]?.date || new Date().toISOString().slice(0, 10);
  const cutoff = cutoffDate(date, days);
  const recent = new Map();

  for (const item of history.items || []) {
    const itemDate = normalizeDate(item.date);
    if (!item.key || itemDate >= date || itemDate < cutoff) continue;
    if (!recent.has(item.key)) recent.set(item.key, []);
    recent.get(item.key).push(item);
  }

  return entries
    .filter((entry) => recent.has(entry.key))
    .map((entry) => ({ entry, previous: recent.get(entry.key) }));
}

async function check(days) {
  const data = await readJson(dataPath, null);
  if (!data?.items?.length) throw new Error("data/hot-topics.json has no items.");
  const history = await readJson(historyPath, { version: 1, items: [] });
  const duplicates = recentDuplicates(currentEntries(data), history, days);

  if (duplicates.length) {
    console.error(`Found ${duplicates.length} repeated topic(s) in the last ${days} day(s):`);
    for (const duplicate of duplicates) {
      const prev = duplicate.previous.map((item) => `${item.date} ${item.title}`).join("; ");
      console.error(`- ${duplicate.entry.title} (${duplicate.entry.key}) already used: ${prev}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Topic history check passed: no repeats in the last ${days} day(s).`);
}

async function record(videoPath) {
  const data = await readJson(dataPath, null);
  if (!data?.items?.length) throw new Error("data/hot-topics.json has no items.");
  const history = await readJson(historyPath, { version: 1, items: [] });
  const entries = currentEntries(data, videoPath);

  const byDateAndKey = new Map();
  for (const item of history.items || []) {
    byDateAndKey.set(`${normalizeDate(item.date)}|${item.key}`, item);
  }
  for (const entry of entries) {
    byDateAndKey.set(`${entry.date}|${entry.key}`, entry);
  }

  history.version = 1;
  history.items = [...byDateAndKey.values()].sort((a, b) => (
    `${a.date}|${a.key}`.localeCompare(`${b.date}|${b.key}`)
  ));

  await mkdir(path.dirname(historyPath), { recursive: true });
  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
  console.log(`Recorded ${entries.length} topic(s) in ${historyPath}`);
}

const command = process.argv[2];
const days = Number(argValue("--days", "7"));
const videoPath = argValue("--video", "");

if (command === "check") {
  await check(days);
} else if (command === "record") {
  await record(videoPath);
} else {
  console.error("Usage: node scripts/topic-history.mjs <check|record> [--days 7] [--video path]");
  process.exitCode = 2;
}

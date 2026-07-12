import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataPath = path.join(root, "data", "hot-topics.json");
const timingsPath = path.join(root, "data", "timings.json");
const outputPath = path.join(root, "index.html");

const accents = [
  { main: "#5ce1a5", deep: "#102d24", soft: "rgba(92, 225, 165, 0.18)", ink: "#07100f" },
  { main: "#ffcc33", deep: "#332711", soft: "rgba(255, 204, 51, 0.18)", ink: "#07100f" },
  { main: "#ff5c7a", deep: "#35141b", soft: "rgba(255, 92, 122, 0.18)", ink: "#07100f" },
  { main: "#6aa7ff", deep: "#101f37", soft: "rgba(106, 167, 255, 0.18)", ink: "#07100f" },
  { main: "#d0ff6a", deep: "#243113", soft: "rgba(208, 255, 106, 0.16)", ink: "#07100f" },
  { main: "#f7f4e8", deep: "#24231d", soft: "rgba(247, 244, 232, 0.14)", ink: "#07100f" },
  { main: "#7ef2d2", deep: "#12352f", soft: "rgba(126, 242, 210, 0.16)", ink: "#07100f" },
];

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function metricNumber(value = "0") {
  return Number(String(value).replace(/[^\d]/g, "")) || 0;
}

function textLength(value = "") {
  return Array.from(String(value)).length;
}

function lengthClass(value = "") {
  const length = textLength(value);
  if (length > 28) return " is-xl";
  if (length > 18) return " is-long";
  return "";
}

function fallbackTimings(count) {
  const items = Array.from({ length: count }, (_, index) => ({
    rank: index + 1,
    start: 5 + index * 8,
    duration: 7.95,
  }));
  return {
    audio: "assets/narration.mp3",
    totalDuration: 70,
    hook: { start: 0, duration: 5 },
    items,
    outro: { start: 61, duration: 9 },
  };
}

function normalizeTimings(rawTimings, count) {
  const fallback = fallbackTimings(count);
  const timings = rawTimings || fallback;
  return {
    ...fallback,
    ...timings,
    hook: { ...fallback.hook, ...(timings.hook || {}) },
    outro: { ...fallback.outro, ...(timings.outro || {}) },
    items: Array.from({ length: count }, (_, index) => ({
      ...fallback.items[index],
      ...((timings.items || [])[index] || {}),
    })),
  };
}

function videoItemCount(data) {
  const configured = Number(data.videoItemCount || data.itemCount || 7);
  return Math.max(1, Math.min(data.items?.length || configured, configured));
}

function sceneTrack(index) {
  return index % 2 === 0 ? 3 : 1;
}

function sourceShort(source = "") {
  const value = String(source);
  if (/Hacker News/i.test(value)) return "HN";
  if (/Product Hunt/i.test(value)) return "PH";
  if (/Hugging Face/i.test(value)) return "HF";
  if (/GitHub Blog/i.test(value)) return "GH Blog";
  if (/GitHub/i.test(value)) return "GitHub";
  if (/arXiv/i.test(value)) return "arXiv";
  return value.slice(0, 12) || "Source";
}

function sourceLine(sources = []) {
  const names = sources.map((source) => sourceShort(source.name || source.source)).filter(Boolean);
  return [...new Set(names)].slice(0, 6).join(" / ");
}

function isGenericHook(value = "") {
  const text = String(value).trim();
  if (/[：:]/.test(text) || /落地|信号|避坑|少踩|提效|成本|安全|值得投入/.test(text)) {
    return false;
  }
  return /^(今日|今天).*(热点|热门|项目)$|^开发者热点$|^AI 开发者热点$|^今日 AI 开发者热点$/i.test(text);
}

function defaultHookTitle(items) {
  const agentCount = items.filter((item) => /agent|代理/i.test(`${item.category} ${item.title} ${item.angle}`)).length;
  if (agentCount >= Math.ceil(items.length / 2)) {
    return `今天这 ${items.length} 个，帮你少踩 Agent 的坑`;
  }
  return `今天这 ${items.length} 个，先看哪个真有用`;
}

function defaultHookSubtitle(items) {
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].slice(0, 4);
  const theme = categories.length ? categories.join("、") : "工具、安全、研究和产品";
  return `${theme}，每个热点只讲一个真实问题。`;
}

function field(item, keys, fallback = "") {
  for (const key of keys) {
    const value = item?.[key];
    if (String(value || "").trim()) return value;
  }
  return fallback;
}

function itemProblem(item) {
  return field(item, ["problem", "question", "viewerHook", "pain"], item.angle || item.description || item.title);
}

function itemPayoff(item) {
  return field(item, ["payoff", "change", "whyCare", "takeaway"], item.angle || item.description || item.voiceover);
}

function itemAudience(item) {
  return field(item, ["audience", "whoShouldCare", "forWhom"], item.category || "开发者");
}

function itemEvidence(item) {
  const source = sourceShort(item.source);
  return field(item, ["evidence"], `${item.subtitle || item.title} · ${source}`);
}

function hookChips(data, items) {
  const explicit = data.themeChips || data.hookChips;
  if (Array.isArray(explicit) && explicit.length) return explicit.slice(0, 4);
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].slice(0, 4);
  return categories.length ? categories : ["能提效", "避风险", "看趋势"];
}

function sceneForItem(item, index, maxMetric, itemTiming) {
  const start = Number(itemTiming.start || 0);
  const duration = Number(itemTiming.duration || 7.5);
  const metric = metricNumber(item.metric);
  const barWidth = Math.max(14, Math.round((metric / maxMetric) * 100));
  const accent = accents[index % accents.length];
  const problem = itemProblem(item);
  const payoff = itemPayoff(item);
  const audience = itemAudience(item);
  const evidence = itemEvidence(item);
  const problemClass = `impact-line${lengthClass(problem)}`;
  const titleClass = `topic-title${lengthClass(item.title)}`;
  const source = sourceShort(item.source);

  return `
      <section id="topic-${item.rank}" class="clip scene topic-scene" data-start="${start.toFixed(3)}" data-duration="${duration.toFixed(3)}" data-track-index="${sceneTrack(index)}" style="--accent: ${accent.main}; --accent-deep: ${accent.deep}; --accent-soft: ${accent.soft}; --accent-ink: ${accent.ink}; --bar: ${barWidth}%;">
        <div class="topic-band" data-layout-ignore></div>
        <div class="topic-watermark" data-layout-ignore>${String(item.rank).padStart(2, "0")}</div>
        <div class="scene-content topic-layout">
          <div class="topic-topline">
            <span class="rank-chip">#${item.rank}</span>
            <span class="source-chip">${escapeHtml(source)} / ${escapeHtml(item.category)}</span>
          </div>
          <div class="topic-question">
            <p class="problem-label">这一条为什么值得停下</p>
            <h2 class="${problemClass}">${escapeHtml(problem)}</h2>
          </div>
          <div class="evidence-panel">
            <div>
              <p class="evidence-label">项目 / 信号</p>
              <h3 class="${titleClass}">${escapeHtml(item.title)}</h3>
              <p class="repo-path">${escapeHtml(evidence)}</p>
            </div>
            <div class="audience-pill">
              <span>适合谁</span>
              <strong>${escapeHtml(audience)}</strong>
            </div>
          </div>
          <p class="angle">${escapeHtml(payoff)}</p>
          <div class="signal-row">
            <div class="signal-box">
              <span>${escapeHtml(item.metricLabel)}</span>
              <strong>${escapeHtml(item.metric)}</strong>
            </div>
            <div class="signal-box">
              <span>${escapeHtml(item.secondaryLabel)}</span>
              <strong>${escapeHtml(item.secondaryMetric)}</strong>
            </div>
          </div>
          <div class="velocity">
            <span></span>
          </div>
          <p class="caption">${escapeHtml(item.voiceover)}</p>
        </div>
      </section>`;
}

function recapItem(item) {
  return `
            <li>
              <span>#${item.rank}</span>
              <strong>${escapeHtml(item.title)}</strong>
              <em>${escapeHtml(sourceShort(item.source))}</em>
            </li>`;
}

function buildHtml(data) {
  const items = data.items.slice(0, videoItemCount(data));
  const timings = normalizeTimings(data.timings, items.length);
  const maxMetric = Math.max(...items.map((item) => metricNumber(item.metric)), 1);
  const topicScenes = items
    .map((item, index) => sceneForItem(item, index, maxMetric, timings.items[index]))
    .join("\n");
  const recap = items.map(recapItem).join("\n");
  const lead = items[0];
  const totalDuration = Number(timings.totalDuration || 70);
  const audioSrc = timings.audio || "assets/narration.mp3";
  const rawHookTitle = data.viewerHook || data.hookTitle || data.title || "";
  const hookTitle = rawHookTitle && !isGenericHook(rawHookTitle) ? rawHookTitle : defaultHookTitle(items);
  const rawHookSubtitle = data.viewerPromise || data.hookSubtitle || data.subtitle || "";
  const hookSubtitle = rawHookSubtitle && !/快速扫一遍|项目、产品和研究方向/.test(rawHookSubtitle)
    ? rawHookSubtitle
    : defaultHookSubtitle(items);
  const leadLabel = data.leadLabel || "先看最值得点开的一个";
  const rawCodexLine = String(data.codexLine || "").trim();
  const codexLine = rawCodexLine && !/(自动|默认来源|工作流|后台|去重|topic pool)/i.test(rawCodexLine)
    ? rawCodexLine
    : "七个方向 · 开发者视角 · 今日速览";
  const sources = sourceLine(data.sources || []);
  const chips = hookChips(data, items);
  const leadProblem = itemProblem(lead);
  const leadPayoff = itemPayoff(lead);
  const hookTitleClass = `hero-title${lengthClass(hookTitle)}`;
  const leadTitleClass = `lead-title${lengthClass(leadProblem)}`;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script>
      (() => {
        function elements(target) {
          if (typeof target === "string") return Array.from(document.querySelectorAll(target));
          if (target instanceof Element) return [target];
          return Array.from(target || []);
        }

        function clamp(value, min, max) {
          return Math.max(min, Math.min(max, value));
        }

        function tweenVars(vars = {}) {
          const copy = { ...vars };
          delete copy.duration;
          delete copy.ease;
          delete copy.stagger;
          delete copy.repeat;
          return copy;
        }

        function applyVars(target, vars = {}) {
          elements(target).forEach((element) => {
            if ("opacity" in vars) element.style.opacity = String(vars.opacity);
            if ("transformOrigin" in vars) element.style.transformOrigin = String(vars.transformOrigin);
            const transforms = [];
            if ("x" in vars) transforms.push("translateX(" + Number(vars.x || 0).toFixed(2) + "px)");
            if ("y" in vars) transforms.push("translateY(" + Number(vars.y || 0).toFixed(2) + "px)");
            if ("scale" in vars) transforms.push("scale(" + Number(vars.scale || 1).toFixed(4) + ")");
            if ("scaleX" in vars) transforms.push("scaleX(" + Number(vars.scaleX || 1).toFixed(4) + ")");
            if (transforms.length) element.style.transform = transforms.join(" ");
          });
        }

        function resetAnimated(tweens) {
          const seen = new Set();
          tweens.forEach((tween) => {
            elements(tween.target).forEach((element) => {
              if (seen.has(element)) return;
              seen.add(element);
              element.style.opacity = "";
              element.style.transform = "";
              element.style.transformOrigin = "";
            });
          });
        }

        function interpolate(vars, progress, type) {
          const state = {};
          for (const [key, raw] of Object.entries(vars)) {
            if (key === "transformOrigin") {
              state.transformOrigin = raw;
              continue;
            }
            const value = Number(raw);
            if (!Number.isFinite(value)) continue;
            const neutral = key === "opacity" || key === "scale" || key === "scaleX" ? 1 : 0;
            state[key] = type === "from"
              ? value + (neutral - value) * progress
              : neutral + (value - neutral) * progress;
          }
          return state;
        }

        function renderScenes(time) {
          const scenes = Array.from(document.querySelectorAll(".scene"));
          const boundaries = [];
          scenes.forEach((scene) => {
            const start = Number(scene.dataset.start) || 0;
            const duration = Number(scene.dataset.duration) || 0;
            const visible = time >= start && time < start + duration;
            scene.style.opacity = visible ? "1" : "0";
            scene.style.pointerEvents = visible ? "auto" : "none";
            if (start > 0) boundaries.push(start);
          });

          const wipe = document.querySelector(".transition-wipe");
          if (wipe) {
            let pulse = 0;
            boundaries.forEach((start) => {
              const distance = Math.abs(time - start);
              if (distance < 0.34) pulse = Math.max(pulse, 1 - distance / 0.34);
            });
            wipe.style.opacity = String(Math.min(0.92, pulse));
            wipe.style.transform = "translateY(" + ((1 - pulse) * -160).toFixed(2) + "px) skewY(-8deg)";
          }
        }

        function renderTweens(time, tweens) {
          resetAnimated(tweens);
          tweens.forEach((tween) => {
            const targets = elements(tween.target);
            targets.forEach((element, index) => {
              const start = tween.start + index * tween.stagger;
              const duration = Math.max(0.001, tween.duration);
              if (tween.type === "to" && time < start) return;
              let local = time - start;
              if (tween.repeat > 0 && local >= 0) local = local % duration;
              const progress = clamp(local / duration, 0, 1);
              if (tween.type === "from" || time <= start + duration || tween.repeat > 0) {
                applyVars(element, interpolate(tween.vars, progress, tween.type));
              }
            });
          });
        }

        function renderTimeline(time, tweens) {
          renderScenes(time);
          renderTweens(time, tweens);
        }

        function createTimeline() {
          const tweens = [];
          return {
            from(target, vars = {}, position = 0) {
              tweens.push({
                type: "from",
                target,
                vars: tweenVars(vars),
                start: Number(position) || 0,
                duration: Number(vars.duration) || 0.4,
                stagger: Number(vars.stagger) || 0,
                repeat: 0,
              });
              return this;
            },
            to(target, vars = {}, position = 0) {
              tweens.push({
                type: "to",
                target,
                vars: tweenVars(vars),
                start: Number(position) || 0,
                duration: Number(vars.duration) || 0.4,
                stagger: Number(vars.stagger) || 0,
                repeat: Number(vars.repeat) || 0,
              });
              return this;
            },
            set(target, vars = {}, position = 0) {
              tweens.push({
                type: "to",
                target,
                vars: tweenVars({ ...vars, duration: 0.001 }),
                start: Number(position) || 0,
                duration: 0.001,
                stagger: 0,
                repeat: 0,
              });
              return this;
            },
            seek(time) {
              renderTimeline(Number(time) || 0, tweens);
              return this;
            },
            pause() {
              return this;
            },
            play() {
              return this;
            },
            kill() {
              return this;
            },
          };
        }

        window.gsap = window.gsap || {
          set: applyVars,
          timeline: createTimeline,
        };
        window.gsap.version = window.gsap.version || "deterministic-shim";
      })();
    </script>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      html,
      body {
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        background: #07100f;
        color: #f7f4e8;
        font-family: Arial, system-ui, sans-serif;
      }

      #root {
        position: relative;
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        isolation: isolate;
        background:
          linear-gradient(128deg, #07100f 0%, #07100f 38%, #0d1917 38%, #0d1917 56%, #111018 56%, #111018 100%);
      }

      .stage-stripes {
        position: absolute;
        inset: 0;
        opacity: 0.22;
        background-image:
          repeating-linear-gradient(115deg, rgba(247, 244, 232, 0.08) 0 2px, rgba(247, 244, 232, 0) 2px 34px),
          linear-gradient(90deg, rgba(92, 225, 165, 0.16), rgba(255, 92, 122, 0) 38%, rgba(106, 167, 255, 0.15));
      }

      .stage-rail {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 42px;
        width: 3px;
        background: linear-gradient(180deg, #5ce1a5, #ffcc33 42%, #ff5c7a 74%, #6aa7ff);
      }

      .stage-rail::before,
      .stage-rail::after {
        content: "";
        position: absolute;
        left: -10px;
        width: 23px;
        height: 23px;
        border: 3px solid #f7f4e8;
        background: #07100f;
      }

      .stage-rail::before {
        top: 96px;
      }

      .stage-rail::after {
        bottom: 96px;
      }

      .top-ruler {
        position: absolute;
        top: 42px;
        left: 82px;
        right: 82px;
        height: 2px;
        background: linear-gradient(90deg, #f7f4e8, rgba(247, 244, 232, 0));
        opacity: 0.58;
      }

      .transition-wipe {
        position: absolute;
        z-index: 40;
        left: -8%;
        right: -8%;
        top: 42%;
        height: 270px;
        pointer-events: none;
        background:
          linear-gradient(90deg, rgba(7, 16, 15, 0.94), rgba(92, 225, 165, 0.82) 38%, rgba(255, 204, 51, 0.74) 62%, rgba(7, 16, 15, 0.94));
        opacity: 0;
      }

      .transition-wipe::after {
        content: "";
        position: absolute;
        inset: 22px 0;
        background: repeating-linear-gradient(90deg, rgba(7, 16, 15, 0.45) 0 18px, rgba(7, 16, 15, 0) 18px 42px);
      }

      .scene {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }

      .scene-content {
        width: 100%;
        height: 100%;
        padding: 108px 78px 86px;
        display: flex;
        flex-direction: column;
        gap: 28px;
      }

      .kicker {
        color: #5ce1a5;
        font-size: 30px;
        line-height: 1.2;
        font-weight: 900;
        font-family: monospace;
        font-variant-numeric: tabular-nums;
      }

      .hook .scene-content {
        justify-content: space-between;
      }

      .hero-stack {
        padding-top: 116px;
      }

      .hero-title {
        max-width: 930px;
        margin-top: 28px;
        font-size: 104px;
        line-height: 1.02;
        font-weight: 900;
      }

      .hero-title.is-long {
        font-size: 90px;
      }

      .hero-title.is-xl {
        font-size: 78px;
      }

      .hero-subtitle {
        max-width: 880px;
        margin-top: 28px;
        color: #d7e3dc;
        font-size: 42px;
        line-height: 1.42;
        font-weight: 800;
      }

      .promise-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        margin-top: 34px;
      }

      .promise-strip span,
      .source-footnote,
      .source-chip,
      .rank-chip,
      .audience-pill {
        border-radius: 8px;
      }

      .promise-strip span {
        padding: 14px 18px;
        color: #07100f;
        background: #f7f4e8;
        font-size: 30px;
        font-weight: 900;
      }

      .promise-strip span:nth-child(2) {
        background: #ffcc33;
      }

      .promise-strip span:nth-child(3) {
        background: #5ce1a5;
      }

      .promise-strip span:nth-child(4) {
        background: #ff5c7a;
      }

      .lead-module {
        display: grid;
        grid-template-columns: 1fr 190px;
        gap: 24px;
        min-height: 350px;
        padding: 32px;
        border: 3px solid rgba(92, 225, 165, 0.52);
        background:
          linear-gradient(135deg, rgba(16, 26, 24, 0.96), rgba(16, 26, 24, 0.72)),
          linear-gradient(90deg, rgba(92, 225, 165, 0.24), rgba(255, 204, 51, 0.16));
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.34);
      }

      .lead-label {
        color: #ffcc33;
        font-size: 31px;
        font-weight: 900;
      }

      .lead-title {
        margin-top: 14px;
        font-size: 64px;
        line-height: 1.08;
        font-weight: 900;
        overflow-wrap: anywhere;
      }

      .lead-title.is-long {
        font-size: 54px;
      }

      .lead-title.is-xl {
        font-size: 46px;
      }

      .lead-meta {
        margin-top: 20px;
        color: #d7e3dc;
        font-size: 30px;
        line-height: 1.35;
        font-weight: 800;
      }

      .lead-index {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #07100f;
        background: #5ce1a5;
        font-family: monospace;
        font-size: 86px;
        font-weight: 900;
        font-variant-numeric: tabular-nums;
      }

      .source-footnote {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding-top: 20px;
        border-top: 2px solid rgba(247, 244, 232, 0.18);
        color: #9fb0aa;
        font-size: 24px;
        line-height: 1.3;
        font-weight: 800;
      }

      .source-footnote em {
        max-width: 450px;
        color: #f7f4e8;
        font-style: normal;
        text-align: right;
        overflow-wrap: anywhere;
      }

      .topic-band {
        position: absolute;
        inset: 0;
        background:
          linear-gradient(90deg, var(--accent-soft), rgba(7, 16, 15, 0) 42%),
          linear-gradient(135deg, rgba(247, 244, 232, 0) 0 55%, var(--accent-soft) 55% 66%, rgba(247, 244, 232, 0) 66%);
      }

      .topic-watermark {
        position: absolute;
        right: -34px;
        bottom: 46px;
        color: rgba(247, 244, 232, 0.055);
        font-family: monospace;
        font-size: 360px;
        line-height: 1;
        font-weight: 900;
        font-variant-numeric: tabular-nums;
      }

      .topic-layout {
        justify-content: flex-start;
        gap: 24px;
      }

      .topic-topline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        min-height: 74px;
      }

      .rank-chip {
        padding: 12px 18px;
        color: var(--accent-ink);
        background: var(--accent);
        font-family: monospace;
        font-size: 44px;
        line-height: 1;
        font-weight: 900;
        font-variant-numeric: tabular-nums;
      }

      .source-chip {
        max-width: 650px;
        padding: 14px 18px;
        color: #f7f4e8;
        background: rgba(7, 16, 15, 0.72);
        border: 2px solid var(--accent);
        font-size: 28px;
        line-height: 1.2;
        font-weight: 900;
        text-align: right;
        overflow-wrap: anywhere;
      }

      .topic-question {
        min-height: 332px;
        padding: 30px 0 38px;
        border-top: 2px solid rgba(247, 244, 232, 0.16);
        border-bottom: 2px solid rgba(247, 244, 232, 0.16);
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .problem-label,
      .evidence-label {
        color: var(--accent);
        font-family: monospace;
        font-size: 26px;
        line-height: 1.2;
        font-weight: 900;
        font-variant-numeric: tabular-nums;
      }

      .impact-line {
        max-width: 925px;
        margin-top: 18px;
        color: #f7f4e8;
        font-size: 78px;
        line-height: 1.08;
        font-weight: 900;
        overflow-wrap: anywhere;
      }

      .impact-line.is-long {
        font-size: 68px;
      }

      .impact-line.is-xl {
        font-size: 58px;
      }

      .evidence-panel {
        display: grid;
        grid-template-columns: 1fr 212px;
        gap: 20px;
        min-height: 196px;
        padding: 24px;
        border: 2px solid rgba(247, 244, 232, 0.14);
        background:
          linear-gradient(180deg, rgba(16, 26, 24, 0.95), rgba(7, 16, 15, 0.84)),
          var(--accent-soft);
      }

      .repo-path {
        color: #9fb0aa;
        font-family: monospace;
        font-size: 27px;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }

      .topic-title {
        margin-top: 14px;
        color: #f7f4e8;
        font-size: 52px;
        line-height: 1.06;
        font-weight: 900;
        overflow-wrap: anywhere;
      }

      .topic-title.is-long {
        font-size: 46px;
      }

      .topic-title.is-xl {
        font-size: 40px;
      }

      .audience-pill {
        min-height: 148px;
        padding: 20px 14px;
        color: var(--accent-ink);
        background: var(--accent);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
      }

      .audience-pill span {
        font-size: 23px;
        line-height: 1.1;
        font-weight: 900;
      }

      .audience-pill strong {
        margin-top: 12px;
        font-size: 32px;
        line-height: 1.12;
        font-weight: 900;
        overflow-wrap: anywhere;
      }

      .angle {
        min-height: 136px;
        color: #f7f4e8;
        font-size: 38px;
        line-height: 1.34;
        font-weight: 800;
      }

      .signal-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
      }

      .signal-box {
        min-height: 124px;
        padding: 20px;
        border: 2px solid rgba(247, 244, 232, 0.13);
        background:
          linear-gradient(180deg, rgba(16, 26, 24, 0.95), rgba(7, 16, 15, 0.86)),
          var(--accent-soft);
      }

      .signal-box span {
        display: block;
        color: #9fb0aa;
        font-size: 27px;
        line-height: 1.22;
      }

      .signal-box strong {
        display: block;
        margin-top: 10px;
        color: var(--accent);
        font-family: monospace;
        font-size: 42px;
        line-height: 1.05;
        font-weight: 900;
        font-variant-numeric: tabular-nums;
        overflow-wrap: anywhere;
      }

      .velocity {
        height: 28px;
        border: 2px solid rgba(247, 244, 232, 0.15);
        background: rgba(7, 16, 15, 0.68);
        overflow: hidden;
      }

      .velocity span {
        display: block;
        width: var(--bar);
        height: 100%;
        background:
          linear-gradient(90deg, var(--accent), #f7f4e8),
          repeating-linear-gradient(90deg, rgba(7, 16, 15, 0.3) 0 8px, rgba(7, 16, 15, 0) 8px 18px);
      }

      .caption {
        margin-top: auto;
        min-height: 118px;
        padding: 22px 24px 22px 30px;
        color: #f7f4e8;
        background: rgba(7, 16, 15, 0.86);
        border-left: 8px solid var(--accent);
        font-size: 31px;
        line-height: 1.35;
        font-weight: 800;
      }

      .recap .scene-content {
        justify-content: flex-start;
        padding-top: 118px;
      }

      .recap h2 {
        margin-top: 16px;
        max-width: 850px;
        font-size: 82px;
        line-height: 1.08;
        font-weight: 900;
      }

      .recap-list {
        margin-top: 22px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        list-style: none;
      }

      .recap-list li {
        display: grid;
        grid-template-columns: 76px 1fr 122px;
        align-items: center;
        gap: 16px;
        min-height: 86px;
        padding: 14px 18px;
        border: 2px solid rgba(247, 244, 232, 0.13);
        background: rgba(16, 26, 24, 0.9);
      }

      .recap-list li span {
        color: #5ce1a5;
        font-family: monospace;
        font-size: 34px;
        font-weight: 900;
        font-variant-numeric: tabular-nums;
      }

      .recap-list li strong {
        font-size: 34px;
        line-height: 1.16;
        font-weight: 900;
        overflow-wrap: anywhere;
      }

      .recap-list li em {
        color: #ffcc33;
        font-size: 25px;
        line-height: 1.1;
        font-style: normal;
        font-weight: 900;
        text-align: right;
      }

      .cta {
        margin-top: auto;
        padding-top: 28px;
        color: #d7e3dc;
        border-top: 2px solid rgba(247, 244, 232, 0.18);
        font-size: 34px;
        line-height: 1.42;
        font-weight: 800;
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${totalDuration}"
      data-width="1080"
      data-height="1920"
    >
      <audio id="narration" data-start="0" data-duration="${totalDuration}" data-track-index="2" src="${escapeHtml(audioSrc)}" data-volume="1"></audio>
      <div class="stage-stripes" data-layout-ignore></div>
      <div class="stage-rail" data-layout-ignore></div>
      <div class="top-ruler" data-layout-ignore></div>
      <div class="transition-wipe" data-layout-ignore></div>

      <section id="hook" class="clip scene hook" data-start="${timings.hook.start.toFixed(3)}" data-duration="${timings.hook.duration.toFixed(3)}" data-track-index="1">
        <div class="scene-content">
          <div class="hero-stack">
            <div class="kicker">${escapeHtml(data.dateLabel)} · 今日开发者雷达</div>
            <h1 class="${hookTitleClass}">${escapeHtml(hookTitle)}</h1>
            <p class="hero-subtitle">${escapeHtml(hookSubtitle)}</p>
            <div class="promise-strip">
              ${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}
            </div>
          </div>
          <div class="lead-module">
            <div>
              <p class="lead-label">${escapeHtml(leadLabel)}</p>
              <h2 class="${leadTitleClass}">${escapeHtml(leadProblem)}</h2>
              <p class="lead-meta">${escapeHtml(lead.title)} · ${escapeHtml(leadPayoff)}</p>
            </div>
            <div class="lead-index">01</div>
          </div>
          <div class="source-footnote">
            <span>${escapeHtml(codexLine)}</span>
            <em>${escapeHtml(sources || "GitHub / HN / PH / HF / arXiv")}</em>
          </div>
        </div>
      </section>
${topicScenes}

      <section id="recap" class="clip scene recap" data-start="${timings.outro.start.toFixed(3)}" data-duration="${timings.outro.duration.toFixed(3)}" data-track-index="1">
        <div class="scene-content">
          <div class="kicker">RECAP · ${escapeHtml(data.dateLabel)}</div>
          <h2>七个方向按需收藏</h2>
          <ul class="recap-list">
${recap}
          </ul>
          <p class="cta">${escapeHtml(data.cta || "今天先到这里，七个方向按需收藏，明天继续。")}</p>
        </div>
      </section>
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      tl.from("#hook .kicker", { opacity: 0, y: 34, duration: 0.42, ease: "power3.out" }, 0.14);
      tl.from("#hook h1", { opacity: 0, y: 66, duration: 0.58, ease: "power3.out" }, 0.28);
      tl.from("#hook .hero-subtitle", { opacity: 0, y: 42, duration: 0.46, ease: "power2.out" }, 0.62);
      tl.from("#hook .promise-strip span", { opacity: 0, y: 22, stagger: 0.045, duration: 0.26, ease: "power2.out" }, 0.86);
      tl.from("#hook .lead-module", { opacity: 0, y: 42, scale: 0.965, duration: 0.5, ease: "power2.out" }, 1.12);
      tl.from("#hook .source-footnote", { opacity: 0, y: 28, duration: 0.36, ease: "power2.out" }, 1.42);

      const sceneTimings = ${JSON.stringify(timings.items.map((item) => ({ start: item.start, duration: item.duration })))};
      sceneTimings.forEach(({ start }, index) => {
        const id = "#topic-" + (index + 1);
        tl.from(id + " .rank-chip", { opacity: 0, x: -42, duration: 0.34, ease: "power3.out" }, start + 0.12);
        tl.from(id + " .source-chip", { opacity: 0, x: 42, duration: 0.34, ease: "power2.out" }, start + 0.18);
        tl.from(id + " .problem-label", { opacity: 0, y: 24, duration: 0.3, ease: "power2.out" }, start + 0.32);
        tl.from(id + " .impact-line", { opacity: 0, y: 58, duration: 0.52, ease: "power3.out" }, start + 0.44);
        tl.from(id + " .evidence-panel", { opacity: 0, y: 34, scale: 0.975, duration: 0.38, ease: "power2.out" }, start + 0.92);
        tl.from(id + " .angle", { opacity: 0, y: 38, duration: 0.38, ease: "power2.out" }, start + 1.18);
        tl.from(id + " .signal-box", { opacity: 0, y: 30, stagger: 0.07, duration: 0.3, ease: "power2.out" }, start + 1.42);
        tl.from(id + " .velocity span", { scaleX: 0, transformOrigin: "left center", duration: 0.5, ease: "power2.out" }, start + 1.62);
        tl.from(id + " .caption", { opacity: 0, y: 26, duration: 0.34, ease: "power2.out" }, start + 1.78);
      });

      const outroStart = ${timings.outro.start.toFixed(3)};
      tl.from("#recap .kicker", { opacity: 0, y: 28, duration: 0.32, ease: "power2.out" }, outroStart + 0.12);
      tl.from("#recap h2", { opacity: 0, y: 48, duration: 0.44, ease: "power3.out" }, outroStart + 0.25);
      tl.from("#recap .recap-list li", { opacity: 0, x: -36, stagger: 0.07, duration: 0.28, ease: "power2.out" }, outroStart + 0.66);
      tl.from("#recap .cta", { opacity: 0, y: 28, duration: 0.36, ease: "power2.out" }, outroStart + 1.72);
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}

async function main() {
  const data = JSON.parse(await readFile(dataPath, "utf8"));
  try {
    data.timings = JSON.parse(await readFile(timingsPath, "utf8"));
  } catch {
    data.timings = null;
  }
  if (!Array.isArray(data.items) || data.items.length < 5) {
    throw new Error("data/hot-topics.json must contain at least five items.");
  }

  await writeFile(outputPath, buildHtml(data), "utf8");
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

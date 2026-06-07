import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataPath = path.join(root, "data", "hot-topics.json");
const timingsPath = path.join(root, "data", "timings.json");
const outputPath = path.join(root, "index.html");

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

function videoItemCount(data) {
  const configured = Number(data.videoItemCount || data.itemCount || 7);
  return Math.max(1, Math.min(data.items?.length || configured, configured));
}

function sceneTrack(index) {
  return index % 2 === 0 ? 3 : 1;
}

function sceneForItem(item, index, maxMetric, itemTiming) {
  const start = itemTiming.start;
  const duration = itemTiming.duration;
  const metric = metricNumber(item.metric);
  const barWidth = Math.max(12, Math.round((metric / maxMetric) * 100));
  const accent = ["#5ce1a5", "#ffcc33", "#ff5c7a", "#6aa7ff", "#d0ff6a"][index % 5];

  return `
      <section id="topic-${item.rank}" class="clip scene topic-scene" data-start="${start.toFixed(3)}" data-duration="${duration.toFixed(3)}" data-track-index="${sceneTrack(index)}" style="--accent: ${accent}; --bar: ${barWidth}%;">
        <div class="scene-content">
          <div class="rank-line">
            <span class="rank">#${item.rank}</span>
            <span class="lang">${escapeHtml(item.source)} / ${escapeHtml(item.category)}</span>
          </div>
          <div class="topic-name">
            <span>${escapeHtml(item.subtitle)}</span>
            <strong>${escapeHtml(item.title)}</strong>
          </div>
          <p class="angle">${escapeHtml(item.angle || item.description)}</p>
          <div class="metric-row">
            <div>
              <span class="metric-label">${escapeHtml(item.metricLabel)}</span>
              <strong>${escapeHtml(item.metric)}</strong>
            </div>
            <div>
              <span class="metric-label">${escapeHtml(item.secondaryLabel)}</span>
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
              <em>${escapeHtml(item.source)}</em>
            </li>`;
}

function buildHtml(data) {
  const items = data.items.slice(0, videoItemCount(data));
  const timings = data.timings || fallbackTimings(items.length);
  const maxMetric = Math.max(...items.map((item) => metricNumber(item.metric)), 1);
  const topicScenes = items
    .map((item, index) => sceneForItem(item, index, maxMetric, timings.items[index]))
    .join("\n");
  const recap = items.map(recapItem).join("\n");
  const lead = items[0];
  const sourceLine = data.sources.map((source) => source.name.replace(" Trending", "")).join(" / ");
  const totalDuration = timings.totalDuration;
  const audioSrc = timings.audio || "assets/narration.mp3";
  const hookTitle = data.hookTitle || data.title;
  const hookSubtitle = data.hookSubtitle || data.subtitle;
  const leadLabel = data.leadLabel || "先看首个热点";
  const codexLine = data.codexLine || "本条视频由 Codex 自动抓热点、写口播并渲染";

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

        function applyVars(target, vars = {}) {
          elements(target).forEach((element) => {
            if ("opacity" in vars) element.style.opacity = String(vars.opacity);
            const transforms = [];
            if ("x" in vars) transforms.push("translateX(" + vars.x + "px)");
            if ("y" in vars) transforms.push("translateY(" + vars.y + "px)");
            if ("scale" in vars) transforms.push("scale(" + vars.scale + ")");
            if ("scaleX" in vars) transforms.push("scaleX(" + vars.scaleX + ")");
            if (transforms.length) element.style.transform = transforms.join(" ");
          });
        }

        function createTimeline() {
          return {
            from() {
              return this;
            },
            to() {
              return this;
            },
            set() {
              return this;
            },
            seek(time) {
              const t = Number(time) || 0;
              document.querySelectorAll(".scene").forEach((scene) => {
                const start = Number(scene.dataset.start) || 0;
                const duration = Number(scene.dataset.duration) || 0;
                const visible = t >= start && t < start + duration;
                scene.style.opacity = visible ? "1" : "0";
                scene.style.transform = "translateY(0)";
              });
              const scan = document.querySelector(".scan");
              if (scan) {
                const y = ((t % 4.5) / 4.5) * 1920;
                scan.style.transform = "translateY(" + y.toFixed(2) + "px)";
              }
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
        window.gsap.version = window.gsap.version || "offline-shim";
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
        font-family: Arial, sans-serif;
      }

      #root {
        position: relative;
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        background:
          linear-gradient(180deg, rgba(92, 225, 165, 0.12), rgba(7, 16, 15, 0) 34%),
          radial-gradient(circle at 18% 18%, rgba(255, 204, 51, 0.18), transparent 24%),
          radial-gradient(circle at 88% 66%, rgba(106, 167, 255, 0.14), transparent 28%),
          #07100f;
      }

      .grid {
        position: absolute;
        inset: 0;
        opacity: 0.18;
        background-image:
          linear-gradient(rgba(247, 244, 232, 0.12) 1px, transparent 1px),
          linear-gradient(90deg, rgba(247, 244, 232, 0.12) 1px, transparent 1px);
        background-size: 72px 72px;
      }

      .scan {
        position: absolute;
        left: -10%;
        right: -10%;
        top: 0;
        height: 220px;
        background: linear-gradient(180deg, transparent, rgba(92, 225, 165, 0.18), transparent);
        opacity: 0.75;
      }

      .corner {
        position: absolute;
        width: 220px;
        height: 220px;
        border-color: rgba(92, 225, 165, 0.55);
        border-style: solid;
        opacity: 0.55;
      }

      .corner.tl {
        left: 48px;
        top: 48px;
        border-width: 3px 0 0 3px;
      }

      .corner.br {
        right: 48px;
        bottom: 48px;
        border-width: 0 3px 3px 0;
      }

      .scene {
        position: absolute;
        inset: 0;
      }

      .scene-content {
        width: 100%;
        height: 100%;
        padding: 112px 82px 88px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 28px;
      }

      .eyebrow {
        color: #5ce1a5;
        font-size: 34px;
        font-weight: 700;
      }

      .hook h1 {
        max-width: 900px;
        font-size: 108px;
        line-height: 1.05;
        font-weight: 900;
      }

      .hook .lead {
        color: #9fb0aa;
        font-size: 40px;
        line-height: 1.45;
      }

      .codex-badge {
        width: fit-content;
        max-width: 900px;
        padding: 14px 22px;
        color: #07100f;
        background: #5ce1a5;
        border-radius: 999px;
        font-size: 30px;
        line-height: 1.25;
        font-weight: 900;
      }

      .lead-card {
        margin-top: 28px;
        padding: 30px 34px;
        border: 2px solid rgba(247, 244, 232, 0.16);
        background: rgba(16, 26, 24, 0.86);
        border-radius: 8px;
      }

      .lead-card span {
        display: block;
        color: #ffcc33;
        font-size: 36px;
        font-weight: 700;
      }

      .lead-card strong {
        display: block;
        margin-top: 8px;
        font-size: 66px;
        line-height: 1.08;
      }

      .rank-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
      }

      .rank {
        color: var(--accent);
        font-size: 94px;
        font-weight: 900;
      }

      .lang {
        padding: 14px 22px;
        color: #07100f;
        background: var(--accent);
        border-radius: 999px;
        font-size: 30px;
        font-weight: 900;
        text-align: right;
      }

      .topic-name {
        padding-bottom: 28px;
        border-bottom: 2px solid rgba(247, 244, 232, 0.18);
      }

      .topic-name span,
      .metric-label {
        display: block;
        color: #9fb0aa;
        font-size: 32px;
      }

      .topic-name strong {
        display: block;
        margin-top: 10px;
        font-size: 74px;
        line-height: 1.04;
        overflow-wrap: anywhere;
      }

      .angle {
        min-height: 188px;
        color: #f7f4e8;
        font-size: 46px;
        line-height: 1.32;
        font-weight: 800;
      }

      .metric-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 22px;
      }

      .metric-row div {
        min-height: 150px;
        padding: 22px;
        border-radius: 8px;
        background: rgba(16, 26, 24, 0.92);
        border: 2px solid rgba(247, 244, 232, 0.12);
      }

      .metric-row strong {
        display: block;
        margin-top: 10px;
        color: var(--accent);
        font-size: 52px;
        overflow-wrap: anywhere;
      }

      .velocity {
        height: 24px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(247, 244, 232, 0.1);
      }

      .velocity span {
        display: block;
        width: var(--bar);
        height: 100%;
        background: linear-gradient(90deg, var(--accent), #f7f4e8);
      }

      .caption {
        margin-top: auto;
        padding: 22px 24px;
        min-height: 126px;
        color: #f7f4e8;
        background: rgba(7, 16, 15, 0.82);
        border-left: 6px solid var(--accent);
        font-size: 31px;
        line-height: 1.35;
      }

      .recap .scene-content {
        justify-content: flex-start;
        padding-top: 122px;
      }

      .recap h2 {
        font-size: 84px;
        line-height: 1.08;
      }

      .recap ul {
        margin-top: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        list-style: none;
      }

      .recap li {
        display: grid;
        grid-template-columns: 78px 1fr 190px;
        align-items: center;
        gap: 18px;
        padding: 22px 24px;
        border-radius: 8px;
        background: rgba(16, 26, 24, 0.92);
        border: 2px solid rgba(247, 244, 232, 0.12);
      }

      .recap li span {
        color: #5ce1a5;
        font-size: 36px;
        font-weight: 900;
      }

      .recap li strong {
        font-size: 36px;
        overflow-wrap: anywhere;
      }

      .recap li em {
        color: #ffcc33;
        font-size: 28px;
        font-style: normal;
        text-align: right;
      }

      .cta {
        margin-top: auto;
        padding-top: 30px;
        color: #9fb0aa;
        border-top: 2px solid rgba(247, 244, 232, 0.18);
        font-size: 34px;
        line-height: 1.45;
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
      <div class="grid" data-layout-ignore></div>
      <div class="scan" data-layout-ignore></div>
      <div class="corner tl" data-layout-ignore></div>
      <div class="corner br" data-layout-ignore></div>

      <section id="hook" class="clip scene hook" data-start="${timings.hook.start.toFixed(3)}" data-duration="${timings.hook.duration.toFixed(3)}" data-track-index="1">
        <div class="scene-content">
          <div class="eyebrow">${escapeHtml(data.dateLabel)} / ${escapeHtml(sourceLine)}</div>
          <h1>${escapeHtml(hookTitle)}</h1>
          <p class="lead">${escapeHtml(hookSubtitle)}</p>
          <div class="codex-badge">${escapeHtml(codexLine)}</div>
          <div class="lead-card">
            <span>${escapeHtml(leadLabel)}</span>
            <strong>${escapeHtml(lead.title)} · ${escapeHtml(lead.source)}</strong>
          </div>
        </div>
      </section>
${topicScenes}

      <section id="recap" class="clip scene recap" data-start="${timings.outro.start.toFixed(3)}" data-duration="${timings.outro.duration.toFixed(3)}" data-track-index="1">
        <div class="scene-content">
          <div class="eyebrow">资料已经整理好</div>
          <h2>项目链接和脚本放在公众号</h2>
          <p class="cta">${escapeHtml(data.cta || "资料在公众号，回复 Codex 获取项目链接、脚本和自动化流程。")}</p>
        </div>
      </section>
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      gsap.set(".scene", { opacity: 0 });
      gsap.set("#hook", { opacity: 1 });
      tl.from("#hook .eyebrow", { opacity: 0, y: 34, duration: 0.45, ease: "power3.out" }, 0);
      tl.from("#hook h1", { opacity: 0, y: 56, duration: 0.55, ease: "power3.out" }, 0.18);
      tl.from("#hook .lead", { opacity: 0, y: 36, duration: 0.45, ease: "power2.out" }, 0.44);
      tl.from("#hook .codex-badge", { opacity: 0, y: 24, duration: 0.38, ease: "power2.out" }, 0.66);
      tl.from("#hook .lead-card", { opacity: 0, scale: 0.94, duration: 0.5, ease: "power2.out" }, 0.92);
      tl.to("#hook", { opacity: 0, y: -36, duration: 0.35, ease: "power2.in" }, ${Math.max(0, timings.hook.start + timings.hook.duration - 0.38).toFixed(3)});
      tl.set("#hook", { opacity: 0 }, ${(timings.hook.start + timings.hook.duration).toFixed(3)});

      const sceneTimings = ${JSON.stringify(timings.items.map((item) => ({ start: item.start, duration: item.duration })))};
      sceneTimings.forEach(({ start, duration }, index) => {
        const id = "#topic-" + (index + 1);
        tl.set(id, { opacity: 1, y: 0 }, start);
        tl.from(id + " .rank", { opacity: 0, x: -48, duration: 0.36, ease: "power3.out" }, start + 0.04);
        tl.from(id + " .lang", { opacity: 0, x: 36, duration: 0.36, ease: "power3.out" }, start + 0.1);
        tl.from(id + " .topic-name", { opacity: 0, y: 46, duration: 0.42, ease: "power2.out" }, start + 0.22);
        tl.from(id + " .angle", { opacity: 0, y: 40, duration: 0.42, ease: "power2.out" }, start + 0.52);
        tl.from(id + " .metric-row div", { opacity: 0, y: 32, stagger: 0.08, duration: 0.34, ease: "power2.out" }, start + 0.9);
        tl.from(id + " .velocity span", { scaleX: 0, transformOrigin: "left center", duration: 0.62, ease: "power2.out" }, start + 1.18);
        tl.from(id + " .caption", { opacity: 0, y: 30, duration: 0.38, ease: "power2.out" }, start + 1.45);
        tl.to(id, { opacity: 0, y: -34, duration: 0.3, ease: "power2.in" }, start + Math.max(0, duration - 0.34));
      });

      const outroStart = ${timings.outro.start.toFixed(3)};
      tl.set("#recap", { opacity: 1, y: 0 }, outroStart);
      tl.from("#recap .eyebrow", { opacity: 0, y: 34, duration: 0.34, ease: "power2.out" }, outroStart + 0.05);
      tl.from("#recap h2", { opacity: 0, y: 52, duration: 0.46, ease: "power3.out" }, outroStart + 0.18);
      tl.from("#recap .cta", { opacity: 0, y: 30, duration: 0.42, ease: "power2.out" }, outroStart + 1.1);
      tl.to(".scan", { y: 1920, duration: 4.5, repeat: ${Math.ceil(totalDuration / 4.5)}, ease: "none" }, 0);
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

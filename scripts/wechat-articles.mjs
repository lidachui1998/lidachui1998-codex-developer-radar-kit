import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const siteDaysPath = path.join(root, "site", "public", "data", "days.json");
const wechatRoot = path.join(root, "wechat");
const articlesDir = path.join(wechatRoot, "articles");
const configPath = path.join(wechatRoot, "config.json");
const manifestPath = path.join(wechatRoot, "articles.json");
const publicWechatPath = path.join(root, "site", "public", "data", "wechat.json");

const defaultConfig = {
  accountName: "李大锤锤",
  author: "开发者雷达",
  replyKeyword: "Codex",
  siteUrl: "https://radar.bjca.xyz/",
  articleFooter: "真正值得收藏的不是项目名字，而是它能否减少你的返工。先选一个最接近当前工作的方向，做一次小范围验证。",
  appId: "",
  appSecret: "",
  thumbMediaId: "",
};

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeDate(value = "") {
  return String(value).slice(0, 10).replaceAll(".", "-").replaceAll("/", "-");
}

function displayDate(day) {
  return day.displayDate || normalizeDate(day.date).replaceAll("-", ".");
}

function compactUrl(url = "") {
  return String(url)
    .replace(/[?&](region|mid|u_code|did|iid|with_sec_did|video_share_track_ver|titleType|share_sign|share_version|ts|from_aid|from_ssr|share_track_info)=[^&]*/g, "")
    .replace(/[?&]$/, "");
}

function siteDayUrl(config, date) {
  const base = String(config.siteUrl || defaultConfig.siteUrl).replace(/\/+$/, "");
  return `${base}/?date=${date}#archive`;
}

function topicNames(day, count = 3) {
  return (day.topics || []).slice(0, count).map((topic) => topic.title).filter(Boolean);
}

function themeNames(day, count = 3) {
  const themes = (day.topics || []).map((topic) => {
    const category = topic.category || topic.source || "开发工具";
    if (/三维|视觉|空间/.test(category)) return "三维与视觉";
    if (/界面|前端|设计/.test(category)) return "AI 界面";
    if (/Agent|智能体|代理/.test(category)) return "Agent";
    if (/低显存|推理|算力|GPU|基础设施/.test(category)) return "低显存推理";
    if (/提示|评测|模型/.test(category)) return "模型工程";
    if (/研究/.test(category)) return "研究工作流";
    if (/交易|量化/.test(category)) return "交易 Agent";
    return category;
  });
  return [...new Set(themes)].slice(0, count);
}

function articleTitle(day) {
  const topicCount = day.topics?.length || 0;
  const names = topicNames(day, 2);
  if (!names.length) return `今天这 ${topicCount} 个项目，哪些值得开发者真正上手？`;
  return `今天这 ${topicCount} 个项目，${names.join("、")} 为什么值得看？`;
}

function articleDigest(day) {
  const names = topicNames(day, 2).join("、") || "热门项目";
  return `不只报项目名：拆解 ${names} 等 ${day.topics?.length || 0} 个热点到底解决什么、怎么用，以及哪些边界最容易踩坑。`;
}

function introText(day) {
  const themes = themeNames(day, 4);
  if (!themes.length) return "真正浪费时间的，不是没看到新项目，而是收藏了一堆，却不知道哪个值得用。";
  return `真正浪费时间的，不是没看到新项目，而是收藏了一堆，却不知道哪个值得用。今天这期围绕 ${themes.join("、")} 这几个方向展开，不只列链接，直接讲清楚每个项目解决什么问题、能怎么用，以及落地前要注意什么。`;
}

function takeawayText(day) {
  const topics = day.topics || [];
  if (!topics.length) return "先判断它是否解决你眼前的问题，再决定要不要投入时间。";
  const practical = topics.filter((topic) => topic.source === "GitHub" && !/交易/.test(topic.category || "")).slice(0, 2);
  const engineering = topics.filter((topic) => /调试|评测|算力/.test(topic.category || "")).slice(0, 3);
  const parts = [];
  if (practical.length) parts.push(`想马上试用，先看 ${practical.map((topic) => topic.title).join("、")}`);
  if (engineering.length) parts.push(`想补工程风险，重点看 ${engineering.map((topic) => topic.title).join("、")}`);
  return `${parts.join("；")}。剩下的方向更适合做技术储备，而不是立刻押注。`;
}

function metricText(topic) {
  if (!topic.metric) return "";
  const primary = `${topic.metricLabel || "热度"} ${topic.metric}`;
  const secondary = topic.secondaryMetric ? `${topic.secondaryLabel || "补充"} ${topic.secondaryMetric}` : "";
  return [primary, secondary].filter(Boolean).join(" · ");
}

function usefulFor(topic) {
  const explicit = String(topic.audience || "").trim();
  if (explicit) return /[。！？.!?]$/.test(explicit) ? explicit : `${explicit}。`;
  const category = topic.category || "";
  const title = topic.title || "这个项目";
  if (/Agent|纠错|观测|协作/.test(category)) return "适合正在引入 AI Agent、改造研发流程，或想把团队经验沉淀成可执行规则的人。";
  if (/LLM|推理|代码模型/.test(category)) return "适合关注模型服务、推理成本、代码生成质量和长上下文工程化的开发者。";
  if (/数据|采集/.test(category)) return "适合需要把公开网页、业务页面或非结构化内容转成数据流的团队。";
  if (/项目|管理|协作/.test(category)) return "适合正在优化需求流转、任务拆解和人机协同的产品与工程团队。";
  return `适合想快速判断 ${title} 是否值得跟进的人先扫一遍。`;
}

const editorialDetails = {
  hallmark: {
    verdict: "它不是又一个 UI 模板库，而是一套给 Claude Code、Cursor 和 Codex 使用的设计质量门禁。",
    useCases: [
      "从零生成页面时，先选择更匹配业务的宏观结构和主题，再做反模板味检查。",
      "用 audit 模式扫描现有页面，只输出问题清单，不直接改代码，适合接入代码评审。",
      "用 redesign 重做结构，或用 study 从截图、网址中提取设计 DNA，生成可复用的 design.md。",
    ],
    highlights: [
      "提供默认构建、audit、redesign、study 四种工作模式，不只是“一键美化”。",
      "内置 20 套主题、57 道 slop-test 检查和输出前自检，重点压制大模型常见的渐变、卡片堆叠和同质化结构。",
    ],
    caution: "它能提高生成界面的设计下限，但不能替代真实用户研究、品牌规范、无障碍检查和前端性能验收。",
  },
  "awesome-llm-apps": {
    verdict: "它最适合“不想从空白开始”的团队：先跑通一个真实 Agent，再决定架构怎么改。",
    useCases: [
      "快速克隆单文件 Starter Agent，验证模型、工具调用和交互链路。",
      "比较 RAG、单 Agent、多 Agent、语音 Agent 和持续运行 Agent 的代码组织方式。",
      "从研究、数据分析、销售、内容、浏览器自动化等案例里挑一个最接近业务的原型。",
    ],
    highlights: [
      "收录 100 多个端到端可运行项目，覆盖 Claude、Gemini、GPT、DeepSeek、Llama、Qwen 等模型。",
      "既有入门级单文件示例，也有带工具、记忆、多步推理和多代理协作的生产风格案例。",
    ],
    caution: "示例能帮你验证思路，但不能直接等同于生产方案。上线前仍要检查密钥管理、数据权限、成本、评测和高风险领域合规。",
  },
  "codex 子代理可观测性": {
    verdict: "这不是一个新功能介绍，而是多代理系统必须面对的治理问题：加密传递不能顺手抹掉本地审计线索。",
    useCases: [
      "排查 spawn_agent 到底给子代理下发了什么任务，避免只看到一个无法解释的子线程。",
      "回溯 send_message、followup_task 的消息内容，定位代理协作为什么偏航。",
      "在事故复盘、合规审计和会话恢复时，保留可读的任务链路。",
    ],
    highlights: [
      "问题来自 MultiAgentV2 的加密消息：接收方能拿到密文，但父级历史和追踪记录也只剩密文。",
      "提议的修复不是取消加密，而是分离“加密交付内容”和“本地明文审计副本”，兼顾隐私与可调试性。",
    ],
    caution: "该问题仍处于开放状态，适合作为 Agent 平台设计参考，不能把讨论中的修复方案当成已经发布的 Codex 行为。",
  },
  "cuda 替代路线": {
    verdict: "它代表的是降低 GPU 生态锁定的信号，而不是一套已经成熟、可以无成本替换 CUDA 的答案。",
    useCases: [
      "在新一轮 GPU 采购前，用真实模型和内核做非英伟达硬件的兼容性 PoC。",
      "为训练与推理平台增加抽象层，减少业务代码与单一厂商工具链的硬绑定。",
      "评估迁移时同时比较硬件价格、开发成本、运维能力和长期生态风险。",
    ],
    highlights: [
      "所谓 CUDA 兼容不能只看能否编译，还要看算子覆盖、性能损失、调试工具、驱动稳定性和第三方库支持。",
      "真正的价值在于给算力采购和部署增加议价空间，而不是追求表面上的 API 一致。",
    ],
    caution: "这类路线必须用自己的工作负载做基准测试。没有真实吞吐、延迟、显存和维护成本数据时，不要把兼容演示当成可直接迁移。",
  },
  "format sensitivity index": {
    verdict: "它提醒我们：排行榜测到的可能不只是模型能力，还混进了提示包装和格式遵循能力。",
    useCases: [
      "为同一任务准备多种等价 Prompt Wrapper，测模型输出是否因格式变化而大幅波动。",
      "在 JSON、Schema 或固定答案格式场景中，把可解析率纳入模型选型与回归测试。",
      "给评测报告增加 Wrapper 方差，避免因为一个模板碰巧更适配某模型而得出错误结论。",
    ],
    highlights: [
      "论文提出 FSI 衡量准确率随包装变化的范围，PSI 衡量答案可解析率的变化范围。",
      "实验覆盖约 14 万次生成、7 个问答任务、5 类包装和 4 个 7B 到 72B 的指令模型，模型间平均 FSI 相差超过 30 倍。",
    ],
    caution: "论文目前是首版研究。落地时应使用自己的模型、Schema 和业务 Prompt 复现，而不是直接照搬论文中的绝对数值。",
  },
  sourclip: {
    verdict: "它的吸引力不在于再做一个 NotebookLM，而在于把研究结果继续推向整理、协作和交付。",
    useCases: [
      "把多个来源的研究素材、笔记和结论组织成可继续编辑的专题工作区。",
      "为内容选题、竞品分析、行业研究或知识库建设减少跨工具复制粘贴。",
      "把研究过程沉淀为可复用流程，而不是每次从浏览器标签页重新开始。",
    ],
    highlights: [
      "产品定位是把 NotebookLM 从单点问答工具扩展成完整研究工作流。",
      "真正值得观察的是它如何连接来源管理、结论整理和最终输出，而不只是生成一段摘要。",
    ],
    caution: "目前公开信息有限，正式使用前要重点核对支持的数据源、导出能力、协作方式、定价和敏感资料的隐私边界。",
  },
  "vibe-trading": {
    verdict: "它不应该被理解成“自动赚钱机器人”，更准确的定位是自然语言驱动的量化研究与回测工作台。",
    useCases: [
      "把自然语言交易问题转成数据分析、策略代码、回测指标和可归档报告。",
      "上传交易日志，分析持仓、回撤、追涨、过度交易等行为，再生成规则化的 Shadow Account 对照。",
      "让投资、量化、加密和风险代理分工研究，并保留过程报告与研究记忆。",
    ],
    highlights: [
      "覆盖股票、加密、期货和外汇等多市场数据与回测，并能导出 Pine Script、MT5 等成果。",
      "支持多代理研究团队和持久化工作流；真实交易仅在用户主动授权的经纪商边界内执行，并提供停止控制。",
    ],
    caution: "回测不等于未来收益。使用时必须检查数据质量、前视偏差、手续费、滑点、风控和经纪商权限，不能把演示结果当投资承诺。",
  },
};

function editorialFor(topic) {
  const key = String(topic.title || "").trim().toLowerCase();
  const detail = editorialDetails[key] || {};
  const audience = usefulFor(topic).replace(/[。！？.!?]+$/, "");
  return {
    verdict: detail.verdict || topic.angle || topic.payoff || `${topic.title} 值得先用一个小场景验证。`,
    problem: topic.problem || `现有流程在 ${topic.category || "这个方向"} 上仍有明显的效率或质量缺口。`,
    value: topic.payoff || topic.angle || `帮助 ${audience} 更快判断方案是否值得投入。`,
    useCases: detail.useCases || [
      topic.payoff || `把 ${topic.title} 放进一个真实的小场景，验证它能否减少重复工作。`,
      `由 ${audience} 先做低成本试用，再决定是否进入正式工作流。`,
    ],
    highlights: detail.highlights || [
      topic.angle || `${topic.title} 的核心价值需要结合真实流程判断。`,
      `热度来自 ${topic.source || "开发者社区"}，更适合作为筛选信号，而不是采用结论。`,
    ],
    caution: detail.caution || "先做最小可行验证，并同时检查数据权限、维护成本、依赖稳定性和实际产出质量。",
  };
}

function decisionGuide(day) {
  const topics = day.topics || [];
  const ready = topics.filter((topic) => topic.source === "GitHub" && !/交易/.test(topic.category || "")).slice(0, 2);
  const risk = topics.filter((topic) => /调试|评测|算力/.test(topic.category || "")).slice(0, 3);
  const explore = topics.filter((topic) => !ready.includes(topic) && !risk.includes(topic)).slice(0, 3);
  return [
    ready.length ? `想立刻上手：${ready.map((topic) => topic.title).join("、")}` : "",
    risk.length ? `想补工程风险：${risk.map((topic) => topic.title).join("、")}` : "",
    explore.length ? `想做技术储备：${explore.map((topic) => topic.title).join("、")}` : "",
  ].filter(Boolean);
}

function renderMarkdown(day, config) {
  const date = normalizeDate(day.date);
  const siteUrl = siteDayUrl(config, date);
  const douyinUrl = compactUrl(day.douyinUrl || "");
  const lines = [
    `# ${articleTitle(day)}`,
    "",
    `> ${articleDigest(day)}`,
    "",
    introText(day),
    "",
    "## 先说结论",
    "",
    takeawayText(day),
    "",
    ...decisionGuide(day).map((line) => `- ${line}`),
    "",
    "## 逐个拆解：它们到底有什么用？",
    "",
  ];

  for (const topic of day.topics || []) {
    const metric = metricText(topic);
    const detail = editorialFor(topic);
    lines.push(
      `### ${String(topic.rank || "").padStart(2, "0")}｜${topic.title}`,
      "",
      `**一句话判断：** ${detail.verdict}`,
      "",
      `**它在解决什么：** ${detail.problem}`,
      "",
      `**核心作用：** ${detail.value}`,
      "",
      "**你可以怎么用：**",
      ...detail.useCases.map((item) => `- ${item}`),
      "",
      "**值得关注的细节：**",
      ...detail.highlights.map((item) => `- ${item}`),
      "",
      `**适合谁：** ${usefulFor(topic)}`,
      "",
      `**上手建议与边界：** ${detail.caution}`,
      "",
      `**项目来源：** ${[topic.source, topic.category].filter(Boolean).join(" / ") || "Developer Radar"}`,
      topic.repo ? `**仓库/项目：** ${topic.repo}` : "",
      metric ? `**热度信息：** ${metric}` : "",
      topic.url ? `**项目链接：** ${topic.url}` : "",
      "",
      "---",
      "",
    );
  }

  lines.push(
    "## 最后怎么选",
    "",
    ...decisionGuide(day).map((line) => `- ${line}`),
    "",
    "不要一次装七个项目。选一个最接近当前工作的方向，用真实任务做 30 分钟验证：能否减少返工、输出是否稳定、维护成本是否可接受。答案比 Star 数更重要。",
    "",
    "## 怎么拿资料",
    "",
    `项目链接、生成脚本、提示词和自动化流程会整理到网站：${siteUrl}`,
    "",
    `公众号可回复「${config.replyKeyword}」获取脚本、提示词和自动化流程。`,
    "",
    config.articleFooter,
    "",
  );

  return lines.filter((line) => line !== "").join("\n\n") + "\n";
}

function tag(label, color = "#0f766e", bg = "#ccfbf1") {
  return `<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 8px;border-radius:999px;background:${bg};color:${color};font-size:12px;font-weight:700;">${escapeHtml(label)}</span>`;
}

function topicHtml(topic) {
  const metric = metricText(topic);
  const detail = editorialFor(topic);
  const rank = String(topic.rank || "").padStart(2, "0");
  const title = escapeHtml(topic.title || "未命名项目");
  const source = [topic.source, topic.category].filter(Boolean).join(" / ") || "Developer Radar";
  return `
    <section style="margin:22px 0;padding:0;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;overflow:hidden;">
      <section style="padding:14px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0;color:#0f766e;font-size:13px;font-weight:800;letter-spacing:.4px;">今日项目 ${rank}</p>
        <h2 style="margin:6px 0 0;color:#111827;font-size:22px;line-height:1.35;">${rank}｜${title}</h2>
      </section>
      <section style="padding:16px;">
        <p style="margin:0 0 12px;">${tag(source)}${topic.secondaryMetric ? tag(topic.secondaryMetric, "#92400e", "#fef3c7") : ""}${metric ? tag(metric, "#1d4ed8", "#dbeafe") : ""}</p>
        <p style="margin:0;color:#111827;font-size:17px;line-height:1.8;"><strong>一句话判断：</strong>${escapeHtml(detail.verdict)}</p>
        <section style="margin:14px 0 0;padding:13px 14px;border-left:4px solid #f59e0b;background:#fffbeb;">
          <p style="margin:0;color:#92400e;font-size:14px;font-weight:800;">它在解决什么？</p>
          <p style="margin:7px 0 0;color:#78350f;font-size:15px;line-height:1.8;">${escapeHtml(detail.problem)}</p>
        </section>
        <p style="margin:14px 0 0;color:#111827;font-size:15px;line-height:1.8;"><strong>核心作用：</strong>${escapeHtml(detail.value)}</p>
        <p style="margin:16px 0 7px;color:#0f766e;font-size:15px;font-weight:800;">你可以怎么用</p>
        <ul style="margin:0;padding-left:22px;color:#374151;font-size:15px;line-height:1.85;">${detail.useCases.map((item) => `<li style="margin:5px 0;">${escapeHtml(item)}</li>`).join("")}</ul>
        <p style="margin:16px 0 7px;color:#1d4ed8;font-size:15px;font-weight:800;">值得关注的细节</p>
        <ul style="margin:0;padding-left:22px;color:#374151;font-size:15px;line-height:1.85;">${detail.highlights.map((item) => `<li style="margin:5px 0;">${escapeHtml(item)}</li>`).join("")}</ul>
        <p style="margin:14px 0 0;color:#374151;font-size:15px;line-height:1.8;"><strong>适合谁：</strong>${escapeHtml(usefulFor(topic))}</p>
        <p style="margin:12px 0 0;padding:12px 14px;border-radius:8px;background:#fef2f2;color:#991b1b;font-size:14px;line-height:1.8;"><strong>上手建议与边界：</strong>${escapeHtml(detail.caution)}</p>
        ${topic.repo ? `<p style="margin:14px 0 0;color:#6b7280;font-size:14px;line-height:1.7;">仓库/项目：${escapeHtml(topic.repo)}</p>` : ""}
        ${topic.url ? `<p style="margin:14px 0 0;"><a href="${escapeHtml(topic.url)}" style="display:inline-block;padding:9px 13px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">查看项目与原始资料</a></p>` : ""}
      </section>
    </section>`;
}

function renderArticleBodyHtml(day, config) {
  const date = normalizeDate(day.date);
  const siteUrl = siteDayUrl(config, date);
  const douyinUrl = compactUrl(day.douyinUrl || "");
  const names = topicNames(day, 7);
  return `
<section style="max-width:720px;margin:0 auto;padding:8px 0 32px;color:#111827;font-family:Arial,'Microsoft YaHei',sans-serif;">
  <section style="margin:0 0 18px;padding:20px 18px;border-radius:14px;background:#111827;">
    <p style="margin:0 0 10px;color:#5eead4;font-size:13px;font-weight:800;">${escapeHtml(config.accountName)} · ${escapeHtml(displayDate(day))} · Developer Radar</p>
    <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.35;">${escapeHtml(articleTitle(day))}</h1>
    <p style="margin:14px 0 0;color:#d1d5db;font-size:16px;line-height:1.8;">${escapeHtml(introText(day))}</p>
  </section>

  <section style="margin:18px 0;padding:16px;border-left:5px solid #10b981;border-radius:10px;background:#ecfdf5;">
    <p style="margin:0 0 8px;color:#065f46;font-size:15px;font-weight:800;">先按你的需求选</p>
    <p style="margin:0;color:#064e3b;font-size:15px;line-height:1.8;">${escapeHtml(takeawayText(day))}</p>
    ${decisionGuide(day).map((line) => `<p style="margin:8px 0 0;color:#065f46;font-size:14px;line-height:1.7;">• ${escapeHtml(line)}</p>`).join("")}
  </section>

  <section style="margin:18px 0;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;">
    <p style="margin:0 0 10px;color:#111827;font-size:15px;font-weight:800;">今天会拆解什么</p>
    <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.9;">${escapeHtml(names.map((name, index) => `${index + 1}. ${name}`).join("  /  "))}</p>
${douyinUrl ? `    <p style="margin:12px 0 0;color:#4b5563;font-size:14px;line-height:1.8;">视频回看：<a href="${escapeHtml(douyinUrl)}" style="color:#047857;">打开抖音视频</a></p>` : ""}
    <p style="margin:6px 0 0;color:#4b5563;font-size:14px;line-height:1.8;">完整归档：<a href="${escapeHtml(siteUrl)}" style="color:#047857;">${escapeHtml(siteUrl)}</a></p>
  </section>

${(day.topics || []).map(topicHtml).join("\n")}

  <section style="margin:24px 0 0;padding:18px;border-radius:12px;background:#ecfeff;border:1px solid #a5f3fc;">
    <p style="margin:0;color:#155e75;font-size:18px;font-weight:800;">最后怎么选？</p>
    ${decisionGuide(day).map((line) => `<p style="margin:10px 0 0;color:#164e63;font-size:15px;line-height:1.75;">• ${escapeHtml(line)}</p>`).join("")}
    <p style="margin:12px 0 0;color:#164e63;font-size:15px;line-height:1.8;">不要一次装七个项目。选一个最接近当前工作的方向，用真实任务做 30 分钟验证：能否减少返工、输出是否稳定、维护成本是否可接受。答案比 Star 数更重要。</p>
  </section>

  <section style="margin:24px 0 0;padding:18px;border-radius:12px;background:#0f172a;">
    <p style="margin:0;color:#ffffff;font-size:18px;font-weight:800;">资料怎么拿？</p>
    <p style="margin:10px 0 0;color:#d1d5db;font-size:15px;line-height:1.8;">公众号回复「${escapeHtml(config.replyKeyword)}」获取项目链接、脚本、提示词和自动化流程。</p>
    <p style="margin:10px 0 0;color:#d1d5db;font-size:15px;line-height:1.8;">完整历史清单：<a href="${escapeHtml(siteUrl)}" style="color:#5eead4;">${escapeHtml(siteUrl)}</a></p>
  </section>

  <p style="margin:18px 0 0;color:#6b7280;font-size:13px;line-height:1.8;">${escapeHtml(config.articleFooter)}</p>
</section>`;
}

function renderHtml(day, config) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(articleTitle(day))}</title>
  </head>
  <body style="margin:0;background:#f3f4f6;padding:18px;color:#111827;">
${renderArticleBodyHtml(day, config).trimStart()}
  </body>
</html>
`;
}

function renderPayload(day, config, paths) {
  const date = normalizeDate(day.date);
  return {
    date,
    title: articleTitle(day),
    author: config.author,
    digest: articleDigest(day),
    content_source_url: siteDayUrl(config, date),
    thumb_media_id: config.thumbMediaId || "",
    need_open_comment: 0,
    only_fans_can_comment: 0,
    paths,
  };
}

async function loadState() {
  const daysData = await readJson(siteDaysPath, { days: [] });
  const config = { ...defaultConfig, ...(await readJson(configPath, {})) };
  const manifest = await readJson(manifestPath, { version: 1, updatedAt: "", articles: [] });
  return { days: daysData.days || [], config, manifest };
}

function upsertArticle(manifest, record) {
  const existing = new Map((manifest.articles || []).map((article) => [article.date, article]));
  const prev = existing.get(record.date) || {};
  existing.set(record.date, {
    ...prev,
    ...record,
    articleUrl: prev.articleUrl || record.articleUrl || "",
    wechatMediaId: prev.wechatMediaId || "",
    publishId: prev.publishId || "",
  });
  manifest.version = 1;
  manifest.updatedAt = new Date().toISOString();
  manifest.articles = [...existing.values()].sort((a, b) => b.date.localeCompare(a.date));
}

async function writeManifest(manifest, config) {
  await mkdir(wechatRoot, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writePublicWechatData(manifest, config);
}

async function writePublicWechatData(manifest, config) {
  const payload = {
    updatedAt: new Date().toISOString(),
    accountName: config.accountName,
    replyKeyword: config.replyKeyword,
    siteUrl: config.siteUrl,
    articles: (manifest.articles || []).map((article) => ({
      date: article.date,
      displayDate: article.displayDate,
      title: article.title,
      digest: article.digest,
      status: article.status || "draft",
      articleUrl: article.articleUrl || "",
      douyinUrl: article.douyinUrl || "",
      siteUrl: article.siteUrl || "",
    })),
  };
  await mkdir(path.dirname(publicWechatPath), { recursive: true });
  await writeFile(publicWechatPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function ensureConfig() {
  await mkdir(wechatRoot, { recursive: true });
  try {
    await readFile(configPath, "utf8");
  } catch {
    await writeFile(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`, "utf8");
  }
}

async function generateForDay(day, config, manifest) {
  const date = normalizeDate(day.date);
  const base = path.join(articlesDir, date);
  const mdPath = `${base}.md`;
  const htmlPath = `${base}.html`;
  const payloadPath = `${base}.payload.json`;
  await mkdir(articlesDir, { recursive: true });
  await writeFile(mdPath, renderMarkdown(day, config), "utf8");
  await writeFile(htmlPath, renderHtml(day, config), "utf8");
  const payload = renderPayload(day, config, {
    markdown: path.relative(root, mdPath).split(path.sep).join("/"),
    html: path.relative(root, htmlPath).split(path.sep).join("/"),
    payload: path.relative(root, payloadPath).split(path.sep).join("/"),
  });
  await writeFile(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  upsertArticle(manifest, {
    date,
    displayDate: displayDate(day),
    title: payload.title,
    digest: payload.digest,
    status: "draft",
    articleUrl: "",
    douyinUrl: compactUrl(day.douyinUrl || ""),
    siteUrl: payload.content_source_url,
    paths: payload.paths,
    generatedAt: new Date().toISOString(),
  });
  return payload;
}

async function generate() {
  await ensureConfig();
  const { days, config, manifest } = await loadState();
  const date = normalizeDate(argValue("--date"));
  const selected = hasFlag("--all")
    ? days
    : days.filter((day) => normalizeDate(day.date) === date);
  if (!selected.length) {
    throw new Error(date ? `No day found for ${date}` : "Use --all or --date YYYY-MM-DD.");
  }
  for (const day of selected) {
    const payload = await generateForDay(day, config, manifest);
    console.log(`Generated ${payload.paths.markdown}`);
    console.log(`Generated ${payload.paths.html}`);
  }
  await writeManifest(manifest, config);
  console.log(`Updated ${path.relative(root, manifestPath)}`);
  console.log(`Updated ${path.relative(root, publicWechatPath)}`);
}

async function list() {
  const { manifest } = await loadState();
  for (const article of manifest.articles || []) {
    const status = article.articleUrl ? "published" : (article.status || "draft");
    console.log(`${article.date}  ${status.padEnd(14)}  ${article.title}`);
  }
}

async function setUrl() {
  const date = normalizeDate(process.argv[3] || argValue("--date"));
  const url = process.argv[4] || argValue("--url");
  if (!date || !url) throw new Error("Usage: node scripts/wechat-articles.mjs set-url YYYY-MM-DD <url>");
  const { config, manifest } = await loadState();
  const target = (manifest.articles || []).find((article) => article.date === date);
  if (!target) throw new Error(`No article found for ${date}. Generate it first.`);
  target.articleUrl = url;
  target.status = "published";
  target.publishedAt = new Date().toISOString();
  await writeManifest(manifest, config);
  console.log(`Recorded WeChat URL for ${date}`);
}

async function main() {
  const command = process.argv[2] || "help";
  if (command === "generate") return generate();
  if (command === "list") return list();
  if (command === "set-url") return setUrl();
  console.log([
    "Usage:",
    "  node scripts/wechat-articles.mjs generate --all",
    "  node scripts/wechat-articles.mjs generate --date YYYY-MM-DD",
    "  node scripts/wechat-articles.mjs list",
    "  node scripts/wechat-articles.mjs set-url YYYY-MM-DD <wechat-article-url>",
  ].join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

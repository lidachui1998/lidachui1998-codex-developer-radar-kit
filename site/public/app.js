const dataUrl = "./data/days.json";
const wechatUrl = "./data/wechat.json";

function text(value, fallback = "") {
  return value == null || value === "" ? fallback : String(value);
}

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

function videoButton(day) {
  if (day.douyinUrl) {
    const a = el("a", "video-link", "打开抖音视频");
    a.href = day.douyinUrl;
    a.target = "_blank";
    a.rel = "noreferrer";
    return a;
  }
  return el("span", "video-link pending", "抖音链接待补");
}

function articleButton(article) {
  if (article.articleUrl) {
    const a = el("a", "video-link wechat-link", "打开公众号文章");
    a.href = article.articleUrl;
    a.target = "_blank";
    a.rel = "noreferrer";
    return a;
  }
  return el("span", "video-link pending", "公众号链接待补");
}

function openTopic(topic) {
  if (!topic.url) return;
  window.open(topic.url, "_blank", "noreferrer");
}

function topicCard(topic) {
  const card = el("article", "topic-card");
  if (topic.url) {
    card.dataset.href = topic.url;
    card.tabIndex = 0;
    card.role = "link";
    card.title = "打开项目页面";
    card.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      openTopic(topic);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openTopic(topic);
    });
  }
  card.append(el("div", "rank", `#${topic.rank}`));

  const main = el("div", "topic-main");
  const title = el("strong");
  const link = el("a");
  link.href = topic.url || "#";
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = topic.title;
  title.append(link);
  main.append(title);
  main.append(el("span", "repo", text(topic.repo, topic.source)));
  main.append(el("p", "angle", text(topic.angle, topic.category)));
  card.append(main);

  const metrics = el("div", "metrics");
  metrics.append(el("span", "", text(topic.metric, topic.category)));
  metrics.append(el("span", "", text(topic.secondaryMetric, topic.language)));
  card.append(metrics);
  return card;
}

function renderToday(day) {
  const root = document.querySelector("#today");
  root.replaceChildren();

  const summary = el("aside", "day-summary");
  summary.append(el("div", "date", day.displayDate));
  summary.append(el("h3", "", day.title));
  summary.append(el("p", "summary-text", day.subtitle));
  summary.append(videoButton(day));
  root.append(summary);

  const list = el("div", "topic-list");
  day.topics.forEach((topic) => list.append(topicCard(topic)));
  root.append(list);
}

function renderArchive(days) {
  const root = document.querySelector("#archive-list");
  root.replaceChildren();

  days.forEach((day) => {
    const item = el("article", "archive-day");
    const header = el("div", "archive-summary");
    header.append(el("div", "date", day.displayDate));

    const body = el("div");
    body.append(el("strong", "", day.title));
    body.append(el("p", "", `${day.topics.length} 个项目 · ${day.subtitle || day.source}`));
    header.append(body);

    const toggle = el("button", "archive-toggle", "查看项目");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    header.append(toggle);
    header.append(videoButton(day));
    item.append(header);

    const details = el("div", "archive-topics");
    details.hidden = true;
    day.topics.forEach((topic) => details.append(topicCard(topic)));
    item.append(details);

    toggle.addEventListener("click", () => {
      const expanded = !details.hidden;
      details.hidden = expanded;
      toggle.textContent = expanded ? "查看项目" : "收起项目";
      toggle.setAttribute("aria-expanded", String(!expanded));
    });

    root.append(item);
  });
}

function renderWechat(payload) {
  const account = document.querySelector("#wechat-account");
  const reply = document.querySelector("#wechat-reply");
  const site = document.querySelector("#wechat-site-link");
  const list = document.querySelector("#wechat-list");
  if (!payload?.articles?.length) {
    list.textContent = "公众号文章待生成";
    return;
  }
  account.textContent = `公众号：${payload.accountName || "待填写"}`;
  reply.textContent = `公众号回复「${payload.replyKeyword || "Codex"}」获取脚本和项目链接`;
  if (payload.siteUrl) site.href = payload.siteUrl;
  list.replaceChildren();
  payload.articles.forEach((article) => {
    const card = el("article", "wechat-card");
    const meta = el("div", "wechat-meta");
    meta.append(el("span", "date", article.displayDate || article.date));
    meta.append(el("span", article.articleUrl ? "wechat-status published" : "wechat-status", article.articleUrl ? "已发布" : "待发布"));
    card.append(meta);

    const body = el("div", "wechat-body");
    body.append(el("strong", "", article.title));
    body.append(el("p", "", article.digest || ""));
    const actions = el("div", "wechat-actions");
    actions.append(articleButton(article));
    if (article.douyinUrl) {
      const douyin = el("a", "resource-link", "抖音视频");
      douyin.href = article.douyinUrl;
      douyin.target = "_blank";
      douyin.rel = "noreferrer";
      actions.append(douyin);
    }
    if (article.siteUrl) {
      const siteLink = el("a", "resource-link", "项目归档");
      siteLink.href = article.siteUrl;
      siteLink.target = "_blank";
      siteLink.rel = "noreferrer";
      actions.append(siteLink);
    }
    body.append(actions);
    card.append(body);
    list.append(card);
  });
}

function renderHero(day) {
  document.querySelector("#latest-date").textContent = day.displayDate;
  const poster = document.querySelector("#latest-poster");
  const fallback = document.querySelector("#poster-fallback");
  if (day.thumbnail) {
    poster.src = day.thumbnail;
    poster.alt = `${day.displayDate} ${day.title} 视频封面`;
    poster.hidden = false;
    fallback.hidden = true;
  } else {
    poster.hidden = true;
    fallback.hidden = false;
  }
}

async function main() {
  const response = await fetch(dataUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${dataUrl}`);
  const data = await response.json();
  const days = data.days || [];
  if (!days.length) return;

  renderHero(days[0]);
  renderToday(days[0]);
  renderArchive(days);
  fetch(wechatUrl, { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then(renderWechat)
    .catch(() => renderWechat(null));
  document.querySelector("#updated-at").textContent = `Updated ${new Date(data.updatedAt).toLocaleString("zh-CN")}`;
}

main().catch((error) => {
  console.error(error);
  document.querySelector("#today").textContent = "数据加载失败";
});

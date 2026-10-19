import type { Option, Problem, Review, ReviewStats } from "./mygo";
import { causeOptions, platformLabel, tierLabel, tierOptions } from "./data";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const fmt = (n: number) => n.toLocaleString("en-US");

const isHttp = (u: string) => /^https?:\/\//i.test(u);

const chev =
  '<svg class="chev" viewBox="0 0 10 10" width="8" height="8"><path d="M2.5 3.8 5 6.3l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ---- shared bits ---- */

function stat(figure: string, label: string, unit = ""): string {
  return `<div class="kpi"><b>${figure}${unit ? `<span class="u">${unit}</span>` : ""}</b><span>${label}</span></div>`;
}

export function skeletonRows(n = 5): string {
  return Array.from(
    { length: n },
    () => `<div class="row"><span class="skeleton" style="height:13px;width:${35 + Math.floor(Math.random() * 30)}%"></span></div>`,
  ).join("");
}

export function skeletonStats(cols = 4): string {
  return `<div class="stats" style="grid-template-columns: repeat(${cols}, 1fr)">` +
    Array.from({ length: cols }, () => `<div class="kpi"><b><span class="skeleton" style="height:20px;width:64px"></span></b><span>&nbsp;</span></div>`).join("") +
    `</div>`;
}

export function emptyBlock(title: string, desc = "", extra = ""): string {
  return `<div class="empty"><div class="t">${esc(title)}</div>${desc ? `<div class="d">${esc(desc)}</div>` : ""}${extra}</div>`;
}

/* ---- problem rows ---- */

export function problemRow(p: Problem, opts: { check?: boolean } = {}): string {
  const meta = [p.key, p.contest, p.year || ""].filter(Boolean).join(" · ");
  const title = isHttp(p.url)
    ? `<a class="plink" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>`
    : esc(p.title);
  const tags = [
    ...p.main.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`),
    ...p.extra.slice(0, Math.max(0, 4 - p.main.length)).map((t) => `<span class="tag aux">${esc(t)}</span>`),
  ].join("");
  const est = p.ratingEst !== null && !p.native.endsWith(String(Math.round(p.ratingEst)))
    ? `<span class="est">≈${Math.round(p.ratingEst)}</span>`
    : "";
  return `<div class="row prow">
    ${opts.check ? '<input type="checkbox" class="cbx" />' : ""}
    <div class="who">
      <div class="name">${title}</div>
      <div class="sub">${esc(meta)}</div>
    </div>
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    <span class="badge plain" title="难度分层">${esc(tierLabel[p.tier] ?? p.tier)}</span>
    <span class="rating" title="${p.ratingEst !== null ? `估算 ≈CF ${Math.round(p.ratingEst)}` : "未评级"}"><span class="nat">${esc(p.native || "—")}</span>${est}</span>
  </div>`;
}

export function problemListRows(items: Problem[]): string {
  if (items.length === 0) {
    return emptyBlock("没有匹配的题目", "换个筛选条件或搜索词试试。");
  }
  return items.map((p) => problemRow(p)).join("");
}

/* ---- 今日训练 ---- */

export function trainPage(dateLabel: string): string {
  return `<div class="view-in">
    <div class="row-head"><span class="label">今日</span><span class="note">${esc(dateLabel)}</span></div>
    <div class="stats" style="grid-template-columns: repeat(2, 1fr)">
      ${stat('<span id="queue-total">—</span>', "计划题数", "题")}
      ${stat('<span id="done-count">0</span>', "已完成", "题")}
    </div>

    <div class="row-head"><span class="label">训练队列</span><span class="note">每次启动从省选/NOI 段抽 3 题</span><span class="gap"></span><button class="btn" id="queue-reshuffle" disabled>换一批</button></div>
    <div class="card" id="queue">${skeletonRows(3)}</div>
  </div>`;
}

export function queueRows(items: Problem[]): string {
  if (items.length === 0) {
    return emptyBlock("题库还在导入", "导入完成后，这里会出现今天的训练队列。");
  }
  return items.map((p) => problemRow(p, { check: true })).join("");
}

/* ---- Hard Problems ---- */

export interface ProblemState {
  search: string;
  platform: string;
  tier: string;
  kp: string;
  tech: string;
  page: number;
}

export function fieldLabel(id: string, fallback: string, labels?: Record<string, string>): string {
  if (!id) return fallback;
  return labels?.[id] ?? id;
}

export function problemsPage(state: ProblemState): string {
  return `<div class="view-in">
    <div class="row-head"><span class="label">Hard Problems</span><span class="note" id="import-note"></span></div>
    <div id="problem-stats">${skeletonStats(4)}</div>
    <div class="tools-line">
      <div class="segs" id="tier-filter">
        ${tierOptions.map((t) => `<button class="opt${state.tier === t.id ? " on" : ""}" data-tier="${t.id}">${t.label}</button>`).join("")}
        <span class="thumb"></span>
      </div>
      <button class="field${state.platform ? " set" : ""}" id="f-platform"><span class="k">平台</span><span class="v">${esc(fieldLabel(state.platform, "全部", platformLabel))}</span>${chev}</button>
      <button class="field${state.kp ? " set" : ""}" id="f-kp"><span class="k">知识点</span><span class="v">${esc(fieldLabel(state.kp, "全部"))}</span>${chev}</button>
      <button class="field${state.tech ? " set" : ""}" id="f-tech"><span class="k">技巧</span><span class="v">${esc(fieldLabel(state.tech, "全部"))}</span>${chev}</button>
      <span class="gap"></span>
      <span class="count" id="list-count"></span>
    </div>
    <div class="card" id="problem-list">${skeletonRows(8)}</div>
    <div class="pager" id="pager"></div>
  </div>`;
}

export function problemStatsHTML(total: number, tiers: Option[]): string {
  const byTier = Object.fromEntries(tiers.map((t) => [t.id, t.count]));
  const rated2300 = ["t3", "prov", "noi", "noi_plus"].reduce((s, t) => s + (byTier[t] ?? 0), 0);
  return `<div class="stats" style="grid-template-columns: repeat(4, 1fr)">
    ${stat(fmt(total), "收录题目")}
    ${stat(fmt(rated2300), "评级 ≥2300")}
    ${stat(fmt(byTier.noi_plus ?? 0), "NOI+ · ≥3200")}
    ${stat(fmt(byTier.hard_unrated ?? 0), "未评级")}
  </div>`;
}

export function pagerHTML(page: number, pages: number): string {
  if (pages <= 1) return "";
  return `<button class="btn" id="pg-prev"${page <= 0 ? " disabled" : ""}>‹ 上一页</button>
    <span class="count">${page + 1} / ${fmt(pages)}</span>
    <button class="btn" id="pg-next"${page >= pages - 1 ? " disabled" : ""}>下一页 ›</button>`;
}

/* ---- 复盘 ---- */

export function reviewPage(): string {
  return `<div class="view-in">
    <div class="row-head"><span class="label">复盘</span><span class="note">错题回顾与阶段总结</span><span class="gap"></span><button class="btn" id="new-review">＋ 新建复盘</button></div>
    <div class="card" id="review-list">${skeletonRows(3)}</div>

    <div class="row-head"><span class="label">复盘维度</span></div>
    <div class="card" id="review-stats">
      <div class="row mrow"><div class="who"><div class="name">错因分布</div><div class="sub">所有复盘中最常出现的错因</div></div><span class="v" id="cause-dist">—</span></div>
    </div>
  </div>`;
}

export function reviewRows(rs: Review[]): string {
  if (rs.length === 0) {
    return emptyBlock("还没有复盘记录", "完成一次训练后，在这里记录错因、耗时与重做结果。");
  }
  return rs
    .map((r) => {
      const date = new Date(r.created * 1000);
      const when = date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
      const chips = r.causes.slice(0, 3).map((c) => `<span class="tag">${esc(c)}</span>`).join("");
      return `<div class="row prow" data-id="${r.id}">
        <div class="who">
          <div class="name">${esc(r.title)}</div>
          <div class="sub">${when}${r.note ? " · " + esc(r.note) : ""}</div>
        </div>
        ${chips ? `<div class="tags">${chips}</div>` : ""}
        <button class="icon-btn del" title="删除复盘" data-del="${r.id}"><svg viewBox="0 0 12 12" width="11" height="11"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button>
      </div>`;
    })
    .join("");
}

export function reviewStatsHTML(s: ReviewStats): string {
  const dist = s.topCauses.map((c) => `${esc(c.id)} ×${c.count}`).join(" · ") || "—";
  return `<div class="row mrow"><div class="who"><div class="name">错因分布</div><div class="sub">${fmt(s.total)} 次复盘中最常出现的错因</div></div><span class="v">${dist}</span></div>`;
}

export function reviewDialog(): string {
  return `<div class="modal" id="modal">
    <div class="dialog" role="dialog" aria-label="新建复盘">
      <div class="d-head"><b>新建复盘</b></div>
      <div class="d-body">
        <div class="row-head" style="margin-top:0"><span class="label">标题</span></div>
        <input class="input" id="rv-title" placeholder="例如：CF2268D 订正" maxlength="120" />
        <div class="row-head"><span class="label">错因</span><span class="note">可多选</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px" id="cause-chips">
          ${causeOptions.map((c) => `<span class="chip" data-cause="${esc(c)}">${esc(c)}</span>`).join("")}
        </div>
        <div class="row-head"><span class="label">笔记</span></div>
        <textarea class="input" id="rv-note" rows="3" placeholder="这次卡在哪、下次先想什么…"></textarea>
      </div>
      <div class="d-foot">
        <button class="btn" id="modal-cancel">取消</button>
        <button class="btn action primary" id="modal-save">保存</button>
      </div>
    </div>
  </div>`;
}

import { catalogStats, sampleProblems, tierLabel, todayQueue, type Problem } from "./data";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmt = (n: number) => n.toLocaleString("en-US");

function problemRow(p: Problem, opts: { check?: boolean } = {}): string {
  const meta = [p.key, p.contest, p.year].filter(Boolean).join(" · ");
  const tags = p.tags
    .slice(0, 3)
    .map((t) => `<span class="tag">${esc(t)}</span>`)
    .join("");
  return `<div class="row prow">
    ${opts.check ? '<input type="checkbox" class="cbx" />' : ""}
    <div class="who">
      <div class="name">${esc(p.title)}</div>
      <div class="sub">${esc(meta)}</div>
    </div>
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    <span class="badge plain" title="难度分层">${esc(tierLabel[p.tier] ?? p.tier)}</span>
    <span class="rating" title="难度分（≈CF）">${p.rating ?? "—"}</span>
  </div>`;
}

function stat(figure: string, label: string, unit = ""): string {
  return `<div class="kpi"><b>${figure}${unit ? `<span class="u">${unit}</span>` : ""}</b><span>${label}</span></div>`;
}

/* ---- 今日训练 ---- */

export function trainPage(dateLabel: string): string {
  return `<div class="view-in">
    <div class="row-head"><span class="label">今日</span><span class="note">${esc(dateLabel)}</span></div>
    <div class="stats" style="grid-template-columns: repeat(4, 1fr)">
      ${stat(String(todayQueue.length), "计划题数", "题")}
      ${stat('<span id="done-count">0</span>', "已完成", "题")}
      ${stat("0:00", "用时")}
      ${stat("—", "连续天数")}
    </div>

    <div class="row-head"><span class="label">训练队列</span></div>
    <div class="card" id="queue">
      ${todayQueue.map((p) => problemRow(p, { check: true })).join("")}
    </div>
  </div>`;
}

/* ---- Hard Problems ---- */

export function problemsPage(): string {
  return `<div class="view-in">
    <div class="row-head"><span class="label">Hard Problems</span></div>
    <div class="stats" style="grid-template-columns: repeat(4, 1fr)">
      ${stat(fmt(catalogStats.total), "收录题目")}
      ${stat(fmt(catalogStats.rated2300), "评级 ≥2300")}
      ${stat(fmt(catalogStats.rated3000), "评级 ≥3000")}
      ${stat(fmt(catalogStats.unrated), "未评级")}
    </div>

    <div class="tools-line">
      <div class="segs" id="tier-filter">
        <button class="opt on" data-min="0">全部</button>
        <button class="opt" data-min="2300">≥2300</button>
        <button class="opt" data-min="3000">≥3000</button>
        <button class="opt" data-min="-1">未评级</button>
        <span class="thumb"></span>
      </div>
      <span class="gap"></span>
      <span class="count" id="list-count"></span>
    </div>
    <div class="card" id="problem-list"></div>
  </div>`;
}

export function problemListRows(minRating: number, query: string): string {
  const q = query.trim().toLowerCase();
  const rows = sampleProblems.filter((p) => {
    if (minRating === -1 && p.rating !== null) return false;
    if (minRating > 0 && (p.rating ?? -1) < minRating) return false;
    if (!q) return true;
    return `${p.key} ${p.title} ${p.contest ?? ""}`.toLowerCase().includes(q);
  });
  if (rows.length === 0) {
    return `<div class="empty"><div class="t">没有匹配的题目</div><div class="d">换个筛选条件或搜索词试试。</div></div>`;
  }
  return rows.map((p) => problemRow(p)).join("");
}

/* ---- 复盘 ---- */

export function reviewPage(): string {
  return `<div class="view-in">
    <div class="row-head"><span class="label">复盘</span><span class="note">错题回顾与阶段总结</span></div>
    <div class="card">
      <div class="empty">
        <div class="t">还没有复盘记录</div>
        <div class="d">完成一次训练后，在这里记录错因、耗时与重做结果。</div>
        <button class="btn action" id="new-review">新建复盘</button>
      </div>
    </div>

    <div class="row-head"><span class="label">复盘维度</span></div>
    <div class="card">
      <div class="row mrow"><div class="who"><div class="name">错因分布</div><div class="sub">读题 / 思路 / 实现 / 细节</div></div><span class="v">—</span></div>
      <div class="row mrow"><div class="who"><div class="name">重做正确率</div><div class="sub">错题二次提交通过比例</div></div><span class="v">—</span></div>
      <div class="row mrow"><div class="who"><div class="name">平均订正耗时</div><div class="sub">从提交失败到通过的时间</div></div><span class="v">—</span></div>
    </div>
  </div>`;
}

export function reviewDialog(): string {
  return `<div class="modal" id="modal">
    <div class="dialog" role="dialog" aria-label="新建复盘">
      <div class="d-head"><b>新建复盘</b></div>
      <div class="d-body">
        <div class="row-head" style="margin-top:0"><span class="label">标题</span></div>
        <input class="input" placeholder="例如：CF2268D 订正" />
        <div class="row-head"><span class="label">错因</span><span class="note">可多选</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px" id="cause-chips">
          <span class="chip">读题偏差</span><span class="chip">思路卡壳</span><span class="chip">实现错误</span><span class="chip">边界细节</span><span class="chip">复杂度误判</span>
        </div>
        <div class="row-head"><span class="label">笔记</span></div>
        <textarea class="input" rows="3" placeholder="这次卡在哪、下次先想什么…"></textarea>
      </div>
      <div class="d-foot">
        <button class="btn" id="modal-cancel">取消</button>
        <button class="btn action primary" id="modal-save">保存</button>
      </div>
    </div>
  </div>`;
}

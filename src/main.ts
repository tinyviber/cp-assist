import { Catalog, type Filters, type Option, type Status } from "./mygo";
import { domainLabel, domainOf, domainOrder, platformLabel } from "./data";
import {
  emptyBlock, esc, fmt, pagerHTML, problemListRows, problemStatsHTML, problemsPage,
  queueRows, reviewDialog, reviewPage, reviewRows, reviewStatsHTML, trainPage,
  type ProblemState,
} from "./pages";

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const $$ = <T extends HTMLElement>(s: string) => [...document.querySelectorAll<T>(s)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---- theme: auto → light → dark ---- */

const themeIcons = {
  auto: '<path d="M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 4v8a4 4 0 0 1 0-8z" fill="currentColor"/>',
  light:
    '<path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M3.8 12.2l1-1M11.2 4.8l1-1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  dark: '<path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
};
type Theme = keyof typeof themeIcons;
const themeOrder: Theme[] = ["auto", "light", "dark"];
const themeNames: Record<Theme, string> = { auto: "跟随系统", light: "浅色", dark: "深色" };

function applyTheme(t: Theme) {
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const btn = $("#theme-btn");
  btn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14">${themeIcons[t]}</svg>`;
  btn.title = `主题：${themeNames[t]}`;
}
let theme = (localStorage.getItem("theme") as Theme) || "auto";
if (!themeOrder.includes(theme)) theme = "auto";
// ?dark / ?light pin the theme for previews and screenshots.
if (location.search.includes("dark")) theme = "dark";
if (location.search.includes("light")) theme = "light";
applyTheme(theme);
$("#theme-btn").addEventListener("click", () => {
  theme = themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length]!;
  localStorage.setItem("theme", theme);
  applyTheme(theme);
});

/* ---- toast ---- */

let toastTimer = 0;
function toast(text: string) {
  clearTimeout(toastTimer);
  $("#toast").innerHTML = `<span class="toast-pill"><span class="dot ok"></span>${esc(text)}</span>`;
  toastTimer = window.setTimeout(() => ($("#toast").innerHTML = ""), 2400);
}

/* ---- segs thumb (Magpie pattern) ---- */

function placeThumb(seg: HTMLElement) {
  const on = seg.querySelector<HTMLElement>(".opt.on");
  const thumb = seg.querySelector<HTMLElement>(".thumb");
  if (!on || !thumb) return;
  thumb.style.left = on.offsetLeft + "px";
  thumb.style.width = on.offsetWidth + "px";
}

/* ---- popover menus ---- */

let popClose: (() => void) | null = null;

function openPop(anchor: HTMLElement, build: (pop: HTMLElement) => void) {
  popClose?.();
  const pop = document.createElement("div");
  pop.className = "pop";
  build(pop);
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth;
  pop.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + "px";
  pop.style.top = r.bottom + 6 + "px";
  anchor.classList.add("open");
  const onDown = (e: Event) => {
    if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
  function close() {
    pop.remove();
    anchor.classList.remove("open");
    removeEventListener("mousedown", onDown, true);
    removeEventListener("keydown", onKey);
    if (popClose === close) popClose = null;
  }
  setTimeout(() => {
    addEventListener("mousedown", onDown, true);
    addEventListener("keydown", onKey);
  });
  popClose = close;
}

interface MenuItem {
  id: string;
  label: string;
  count?: number;
  header?: boolean;
}

function menuPop(
  anchor: HTMLElement,
  items: MenuItem[],
  opts: { current: string; searchable?: boolean; onPick: (id: string) => void },
) {
  openPop(anchor, (pop) => {
    const list = document.createElement("div");
    const renderItems = (q: string) => {
      const shown = items
        .filter((it) => it.header || !q || it.label.toLowerCase().includes(q) || it.id.toLowerCase().includes(q))
        .slice(0, 140);
      list.innerHTML =
        shown
          .map((it) =>
            it.header
              ? `<div class="group">${esc(it.label)}</div>`
              : `<button class="mi${it.id === opts.current ? " sel" : ""}" data-id="${esc(it.id)}">${esc(it.label)}${it.count != null ? `<span class="k">${fmt(it.count)}</span>` : ""}</button>`,
          )
          .join("") || `<button class="mi" disabled>无匹配</button>`;
      list.querySelectorAll<HTMLButtonElement>(".mi[data-id]").forEach(
        (b) => (b.onclick = () => (opts.onPick(b.dataset.id!), popClose?.())),
      );
    };
    if (opts.searchable) {
      const inp = document.createElement("input");
      inp.className = "input";
      inp.placeholder = "搜索";
      inp.style.cssText = "margin:2px 2px 6px;width:calc(100% - 4px)";
      inp.addEventListener("input", () => renderItems(inp.value.trim().toLowerCase()));
      inp.addEventListener("mousedown", (e) => e.stopPropagation());
      pop.append(inp, list);
      setTimeout(() => inp.focus());
    } else {
      pop.append(list);
    }
    renderItems("");
  });
}

// 知识点列表按领域分组（KP.md 的域顺序），组头不可选。
function kpMenuItems(kp: Option[]): MenuItem[] {
  const out: MenuItem[] = [{ id: "", label: "全部" }];
  const byDomain = new Map<string, Option[]>();
  for (const o of kp) {
    const d = domainOf(o.id);
    let list = byDomain.get(d);
    if (!list) byDomain.set(d, (list = []));
    list.push(o);
  }
  for (const d of domainOrder) {
    const list = byDomain.get(d);
    if (!list?.length) continue;
    out.push({ id: "", label: domainLabel[d] ?? d, header: true });
    list.forEach((o) => out.push({ id: o.id, label: o.id, count: o.count }));
  }
  return out;
}

/* ---- filter state: the single source of truth ---------------------------
 * Controls are rendered from `state` (segs .on, field labels) and every
 * mutation goes through it, then re-queries the backend — the controls can
 * never show one thing while the list filters another.
 */

const state: ProblemState = { search: "", platform: "", tier: "", kp: "", tech: "", page: 0 };

let filters: Filters | null = null;
let listReq = 0;
let epoch = 0;

function syncFields() {
  const set = (id: string, val: string, labels?: Record<string, string>) => {
    const el = $(id);
    el.classList.toggle("set", !!val);
    el.querySelector<HTMLElement>(".v")!.textContent = val ? (labels?.[val] ?? val) : "全部";
  };
  set("#f-platform", state.platform, platformLabel);
  set("#f-kp", state.kp);
  set("#f-tech", state.tech);
}

function setNote(text: string) {
  const el = document.querySelector("#import-note");
  if (el) el.textContent = text;
}

function updateNavCount(s: Status) {
  const el = document.querySelector("#nav-count");
  if (el) el.textContent = s.ready ? `${(s.total / 1000).toFixed(1)}K` : "";
}

async function refreshList() {
  const req = ++listReq;
  try {
    const res = await Catalog.search({ ...state });
    if (req !== listReq) return;
    const list = $("#problem-list");
    if (!list) return;
    list.innerHTML = problemListRows(res.items);
    $("#list-count").textContent = `${fmt(res.total)} 题`;
    state.page = res.page;
    $("#pager").innerHTML = pagerHTML(res.page, res.pages);
  } catch (e) {
    if (req !== listReq) return;
    const list = $("#problem-list");
    if (list) list.innerHTML = emptyBlock("查询失败", String(e));
  }
}

// Wait for the one-time catalog import to finish, then load stats + list.
async function loadProblems(e: number) {
  let s: Status;
  for (;;) {
    try {
      s = await Catalog.status();
    } catch (err) {
      s = { ready: false, importing: false, total: 0, error: String(err) };
    }
    updateNavCount(s);
    if (e !== epoch || currentRoute() !== "problems") return;
    if (s.error) {
      setNote("");
      $("#problem-stats").innerHTML = "";
      $("#problem-list").innerHTML = emptyBlock("题库不可用", s.error);
      return;
    }
    if (s.ready) break;
    setNote(`正在导入题库 · ${fmt(s.total)}`);
    await sleep(400);
  }
  setNote("");
  if (!filters) filters = await Catalog.filters().catch(() => null);
  if (e !== epoch || currentRoute() !== "problems") return;
  if (filters) {
    $("#problem-stats").innerHTML = problemStatsHTML(s.total, filters.tiers);
  }
  refreshList();
}

/* ---- router ---- */

type Route = "train" | "problems" | "review";
const routeTitles: Record<Route, string> = { train: "今日训练", problems: "Hard Problems", review: "复盘" };

function currentRoute(): Route {
  const r = location.hash.replace(/^#\/?/, "").split("?")[0];
  return r === "problems" || r === "review" ? r : "train";
}

function render() {
  const e = ++epoch;
  const route = currentRoute();
  $("#crumb-page").textContent = routeTitles[route];
  $$<HTMLButtonElement>(".rail nav button").forEach((b) => b.classList.toggle("on", b.dataset.route === route));
  const page = $("#page");
  if (route === "problems") {
    page.innerHTML = problemsPage(state);
    wireProblems(e);
  } else if (route === "review") {
    page.innerHTML = reviewPage();
    wireReview(e);
  } else {
    const date = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
    page.innerHTML = trainPage(date);
    wireTrain(e);
  }
  requestAnimationFrame(() => $$(".segs").forEach((s) => placeThumb(s as HTMLElement)));
  page.scrollTop = 0;
}

/* ---- page wiring ---- */

function pick(
  fieldId: string,
  items: () => MenuItem[],
  searchable: boolean,
  get: () => string,
  apply: (id: string) => void,
) {
  $(fieldId).addEventListener("click", (ev) => {
    const anchor = ev.currentTarget as HTMLElement;
    menuPop(anchor, items(), {
      current: get(),
      searchable,
      onPick: (id) => {
        apply(id);
        state.page = 0;
        syncFields();
        refreshList();
      },
    });
  });
}

function wireProblems(e: number) {
  $("#tier-filter").querySelectorAll<HTMLElement>(".opt").forEach((o) =>
    o.addEventListener("click", () => {
      state.tier = o.dataset.tier ?? "";
      state.page = 0;
      $("#tier-filter").querySelectorAll(".opt").forEach((x) => x.classList.toggle("on", x === o));
      placeThumb($("#tier-filter"));
      refreshList();
    }),
  );
  if (!filters) filters = null; // loaded in loadProblems
  const platformItems = () => [
    { id: "", label: "全部" },
    ...(filters?.platforms ?? []).map((o) => ({ id: o.id, label: platformLabel[o.id] ?? o.id, count: o.count })),
  ];
  const kpItems = () => kpMenuItems(filters?.kp ?? []);
  const techItems = () => [
    { id: "", label: "全部" },
    ...(filters?.tech ?? []).map((o) => ({ id: o.id, label: o.id, count: o.count })),
  ];
  pick("#f-platform", platformItems, false, () => state.platform, (id) => (state.platform = id));
  pick("#f-kp", kpItems, true, () => state.kp, (id) => (state.kp = id));
  pick("#f-tech", techItems, false, () => state.tech, (id) => (state.tech = id));
  $("#pager").addEventListener("click", (ev) => {
    const id = (ev.target as HTMLElement).closest("button")?.id;
    if (id === "pg-prev") state.page--;
    else if (id === "pg-next") state.page++;
    else return;
    refreshList();
    $("#page").scrollTop = 0;
  });
  loadProblems(e);
}

function wireTrain(e: number) {
  const load = async () => {
    const btn = $<HTMLButtonElement>("#queue-reshuffle");
    btn.disabled = true;
    try {
      let items = null;
      for (let i = 0; i < 20 && e === epoch; i++) {
        try {
          items = await Catalog.today();
          break;
        } catch {
          await sleep(500);
        }
      }
      if (!items || e !== epoch) return;
      $("#queue").innerHTML = queueRows(items);
      $("#queue-total").textContent = String(items.length);
      $("#done-count").textContent = "0";
      $$<HTMLInputElement>("#queue .cbx").forEach((cb) =>
        cb.addEventListener("change", () => {
          $("#done-count").textContent = String($$("#queue .cbx:checked").length);
        }),
      );
    } catch (err) {
      if (e === epoch) $("#queue").innerHTML = emptyBlock("队列加载失败", String(err));
    } finally {
      btn.disabled = false;
    }
  };
  $("#queue-reshuffle").addEventListener("click", load);
  load();
}

function wireReview(e: number) {
  const load = async () => {
    try {
      const [rs, st] = await Promise.all([Catalog.reviews(), Catalog.reviewStats()]);
      if (e !== epoch) return;
      $("#review-list").innerHTML = reviewRows(rs);
      $("#review-stats").innerHTML = reviewStatsHTML(st);
    } catch (err) {
      if (e === epoch) $("#review-list").innerHTML = emptyBlock("复盘加载失败", String(err));
    }
  };
  $("#review-list").addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-del]");
    if (b) {
      Catalog.deleteReview(Number(b.dataset.del)).then(load, () => toast("删除失败"));
    }
  });
  $("#new-review")?.addEventListener("click", () => openReview(load));
  if (location.search.includes("modal") || location.hash.includes("modal")) openReview(load);
  load();
}

function openReview(onSaved: () => void) {
  const overlay = $("#overlay");
  overlay.innerHTML = reviewDialog();
  const close = () => (overlay.innerHTML = "");
  $("#modal-cancel").addEventListener("click", close);
  $("#modal").addEventListener("mousedown", (e) => e.target === e.currentTarget && close());
  $$("#cause-chips .chip").forEach((c) => c.addEventListener("click", () => c.classList.toggle("on")));
  $("#modal-save").addEventListener("click", async () => {
    const title = $<HTMLInputElement>("#rv-title").value.trim();
    if (!title) {
      toast("先写个标题");
      $("#rv-title").focus();
      return;
    }
    const causes = $$("#cause-chips .chip.on").map((c) => c.dataset.cause ?? "");
    const note = $<HTMLTextAreaElement>("#rv-note").value;
    try {
      await Catalog.addReview({ id: 0, title, causes, note, created: 0 });
    } catch (err) {
      toast(String(err));
      return;
    }
    close();
    toast("已保存");
    onSaved();
  });
  overlay.querySelector<HTMLInputElement>(".input")?.focus();
}

/* ---- boot ---- */

$$<HTMLButtonElement>(".rail nav button").forEach((b) =>
  b.addEventListener("click", () => (location.hash = "/" + b.dataset.route)),
);
addEventListener("hashchange", render);
addEventListener("resize", () => $$(".segs").forEach((s) => placeThumb(s as HTMLElement)));
if (!location.hash) history.replaceState(null, "", "#/train");
render();

/* ---- global search field ---- */

const searchInput = $<HTMLInputElement>("#search-input");
let searchTimer = 0;
addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (currentRoute() !== "problems") location.hash = "/problems";
    searchInput.focus();
    searchInput.select();
  }
  if (e.key === "Escape") {
    if ($("#modal")) $("#overlay").innerHTML = "";
    else popClose?.();
  }
});
searchInput.addEventListener("input", () => {
  state.search = searchInput.value;
  state.page = 0;
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    if (currentRoute() === "problems") refreshList();
  }, 250);
});

import { catalogStats } from "./data";
import { problemListRows, problemsPage, reviewDialog, reviewPage, trainPage } from "./pages";

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const $$ = <T extends HTMLElement>(s: string) => [...document.querySelectorAll<T>(s)];

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
  $("#toast").innerHTML = `<span class="toast-pill"><span class="dot ok"></span>${text}</span>`;
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

/* ---- router ---- */

type Route = "train" | "problems" | "review";
const routeTitles: Record<Route, string> = { train: "今日训练", problems: "Hard Problems", review: "复盘" };
const state = { minRating: 0, query: "" };

function currentRoute(): Route {
  const r = location.hash.replace(/^#\/?/, "");
  return r === "problems" || r === "review" ? r : "train";
}

function render() {
  const route = currentRoute();
  $("#crumb-page").textContent = routeTitles[route];
  $$<HTMLButtonElement>(".rail nav button").forEach((b) => b.classList.toggle("on", b.dataset.route === route));
  const page = $("#page");
  if (route === "problems") {
    page.innerHTML = problemsPage();
    renderProblemList();
  } else if (route === "review") {
    page.innerHTML = reviewPage();
  } else {
    const date = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
    page.innerHTML = trainPage(date);
  }
  wire(route);
  page.scrollTop = 0;
}

function renderProblemList() {
  const list = $("#problem-list");
  list.innerHTML = problemListRows(state.minRating, state.query);
  const n = list.querySelectorAll(".prow").length;
  $("#list-count").textContent = `${n} / ${catalogStats.total.toLocaleString("en-US")}`;
}

function wire(route: Route) {
  // segmented controls
  $$(".segs").forEach((seg) => {
    seg.querySelectorAll<HTMLElement>(".opt").forEach((o) => {
      o.addEventListener("click", () => {
        seg.querySelectorAll(".opt").forEach((x) => x.classList.remove("on"));
        o.classList.add("on");
        placeThumb(seg as HTMLElement);
        if (seg.id === "tier-filter") {
          state.minRating = Number(o.dataset.min ?? 0);
          renderProblemList();
        }
      });
    });
    requestAnimationFrame(() => placeThumb(seg as HTMLElement));
  });

  if (route === "train") {
    $$<HTMLInputElement>("#queue .cbx").forEach((cb) =>
      cb.addEventListener("change", () => {
        const done = $$<HTMLInputElement>("#queue .cbx:checked").length;
        $("#done-count").textContent = String(done);
      }),
    );
  }

  if (route === "review") {
    $("#new-review")?.addEventListener("click", openReview);
    if (location.search.includes("modal")) openReview();
  }
}

function openReview() {
  const overlay = $("#overlay");
  overlay.innerHTML = reviewDialog();
  const close = () => (overlay.innerHTML = "");
  $("#modal-cancel").addEventListener("click", close);
  $("#modal").addEventListener("mousedown", (e) => e.target === e.currentTarget && close());
  $$("#cause-chips .chip").forEach((c) => c.addEventListener("click", () => c.classList.toggle("on")));
  $("#modal-save").addEventListener("click", () => {
    close();
    toast("已保存");
  });
  overlay.querySelector<HTMLInputElement>(".input")?.focus();
}

$$<HTMLButtonElement>(".rail nav button").forEach((b) =>
  b.addEventListener("click", () => (location.hash = "/" + b.dataset.route)),
);
addEventListener("hashchange", render);
addEventListener("resize", () => $$(".segs").forEach((s) => placeThumb(s as HTMLElement)));
if (!location.hash) history.replaceState(null, "", "#/train");
render();

/* ---- global search field ---- */

const searchInput = $<HTMLInputElement>("#search-input");
addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (currentRoute() !== "problems") location.hash = "/problems";
    searchInput.focus();
    searchInput.select();
  }
  if (e.key === "Escape" && $("#modal")) $("#overlay").innerHTML = "";
});
searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  if (currentRoute() === "problems") renderProblemList();
});



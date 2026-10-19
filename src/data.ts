// Display labels for catalog codes. All data comes from the Go backend
// (src/mygo.ts); this file only maps ids to readable names.

export const tierLabel: Record<string, string> = {
  noi_plus: "NOI+",
  noi: "NOI",
  prov: "省选",
  t3: "T3",
  hard_unrated: "未评级",
  below: "边界",
};

// Segmented difficulty filter, in catalog tier order.
export const tierOptions: { id: string; label: string }[] = [
  { id: "", label: "全部" },
  { id: "t3", label: "T3" },
  { id: "prov", label: "省选" },
  { id: "noi", label: "NOI" },
  { id: "noi_plus", label: "NOI+" },
  { id: "hard_unrated", label: "未评级" },
];

export const platformLabel: Record<string, string> = {
  codeforces: "Codeforces",
  atcoder: "AtCoder",
  luogu: "洛谷",
  qoj: "QOJ",
  libreoj: "LibreOJ",
  ojuz: "OJUZ",
  dmoj: "DMOJ",
  uoj: "UOJ",
  kattis: "Kattis",
};

// Chinese names for the knowledge-point domains (KP.md taxonomy).
export const domainLabel: Record<string, string> = {
  dp: "动态规划",
  graph: "图论",
  ds: "数据结构",
  str: "字符串",
  math: "数学",
  tech: "思维技巧",
  other: "其他",
};

export const domainOrder = ["dp", "graph", "ds", "str", "math", "other"];

export function domainOf(code: string): string {
  return code.split(".")[0] ?? "other";
}

export const causeOptions = ["读题偏差", "思路卡壳", "实现错误", "边界细节", "复杂度误判"];

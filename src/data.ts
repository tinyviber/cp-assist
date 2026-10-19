// Sample rows of cptrain/research/hard-problems-catalog/catalog.jsonl,
// kept for layout until the catalog is actually imported.

export interface Problem {
  key: string;
  platform: string;
  title: string;
  contest: string | null;
  year: number | null;
  rating: number | null; // catalog rating_est, ≈CF
  tier: string;
  tags: string[];
}

export const catalogStats = {
  total: 31884,
  rated2300: 12995,
  rated3000: 3861,
  unrated: 18701,
  platforms: 9,
};

export const tierLabel: Record<string, string> = {
  noi_plus: "NOI+",
  noi: "NOI",
  prov: "省选",
  t3: "T3",
  hard_unrated: "未评级",
  below: "边界",
};

export const sampleProblems: Problem[] = [
  { key: "at:agc045_f", platform: "atcoder", title: "Division into Multiples", contest: "AtCoder Grand Contest 045", year: 2020, rating: 3744, tier: "noi_plus", tags: [] },
  { key: "at:agc018_e", platform: "atcoder", title: "Sightseeing Plan", contest: "AtCoder Grand Contest 018", year: 2017, rating: 3576, tier: "noi_plus", tags: [] },
  { key: "cf:1994H", platform: "codeforces", title: "Fortnite", contest: "Codeforces Round 959 (Div. 1 + Div. 2)", year: 2024, rating: 3500, tier: "noi_plus", tags: ["combinatorics", "games", "interactive", "math"] },
  { key: "at:arc115_f", platform: "atcoder", title: "Migration", contest: "AtCoder Regular Contest 115", year: 2021, rating: 3202, tier: "noi_plus", tags: [] },
  { key: "luogu:P5668", platform: "luogu", title: "【模板】N 次剩余", contest: null, year: null, rating: 3050, tier: "noi", tags: [] },
  { key: "cf:980F", platform: "codeforces", title: "Cactus to Tree", contest: "Codeforces Round 480 (Div. 2)", year: 2018, rating: 2900, tier: "noi", tags: ["dp", "graphs", "trees"] },
  { key: "luogu:P7409", platform: "luogu", title: "SvT", contest: null, year: null, rating: 2650, tier: "prov", tags: [] },
  { key: "cf:2066D1", platform: "codeforces", title: "Club of Young Aircraft Builders (Easy Version)", contest: "Codeforces Round 1004 (Div. 1)", year: 2025, rating: 2400, tier: "t3", tags: ["combinatorics", "dp", "math"] },
  { key: "luogu:P6840", platform: "luogu", title: "[BalkanOI 2009] year2012 - A New Beginning", contest: null, year: 2012, rating: null, tier: "hard_unrated", tags: [] },
  { key: "qoj:17547", platform: "qoj", title: "OKVIRI", contest: "COCI 2006/2007 Contest #1", year: 2007, rating: null, tier: "hard_unrated", tags: ["COCI"] },
];

// Today's queue — three catalog entries as a stand-in training set.
export const todayQueue: Problem[] = [
  { key: "cf:2268D", platform: "codeforces", title: "AghaBalaSar and Hamed", contest: "Codeforces Round 1124 (Div. 1)", year: 2026, rating: 2600, tier: "prov", tags: ["data structures", "dp", "trees"] },
  { key: "cf:2268E", platform: "codeforces", title: "Kia Kio and Tree of Life", contest: "Codeforces Round 1124 (Div. 1)", year: 2026, rating: 2700, tier: "prov", tags: ["data structures", "fft", "math"] },
  { key: "cf:2268F", platform: "codeforces", title: "Deglado", contest: "Codeforces Round 1124 (Div. 1)", year: 2026, rating: 3500, tier: "noi_plus", tags: ["constructive algorithms"] },
];

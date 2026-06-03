// Codeforces public API client with sessionStorage caching.
// The API is CORS-friendly for GET requests, so this runs entirely in the
// browser — no server required.

export const CF_HANDLE = "PriyanshuIITGHY2006";
const API = "https://codeforces.com/api";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — CF data changes slowly

export interface CFUser {
  handle: string;
  firstName?: string;
  lastName?: string;
  rating?: number;
  maxRating?: number;
  rank?: string;
  maxRank?: string;
  contribution?: number;
  titlePhoto?: string;
  avatar?: string;
  organization?: string;
  city?: string;
  country?: string;
  registrationTimeSeconds?: number;
}

export interface CFRatingChange {
  contestId: number;
  contestName: string;
  handle: string;
  rank: number;
  ratingUpdateTimeSeconds: number;
  oldRating: number;
  newRating: number;
}

export interface CFSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  problem: {
    contestId?: number;
    index: string;
    name: string;
    rating?: number;
    tags: string[];
  };
  verdict?: string;
  programmingLanguage: string;
}

export interface CFData {
  user: CFUser;
  ratings: CFRatingChange[];
  stats: {
    solvedCount: number;
    contests: number;
    tagCounts: Record<string, number>;
    ratingBuckets: Record<string, number>;
    hardestSolved: { name: string; rating: number; contestId?: number; index: string } | null;
    languages: Record<string, number>;
    totalSubmissions: number;
    acceptedSubmissions: number;
    // Codeforces profile-style activity stats
    solvedLastYear: number;
    solvedLastMonth: number;
    maxStreak: number;
    streakLastYear: number;
    streakLastMonth: number;
  };
  /** date "YYYY-MM-DD" → number of submissions that day (for the heatmap). */
  activity: Record<string, number>;
}

async function fetchJSON<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API}/${endpoint}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { status: string; result?: T; comment?: string };
  if (json.status !== "OK") throw new Error(json.comment ?? "Codeforces API error");
  return json.result as T;
}

function cacheKey(name: string): string {
  return `cf:${name}:${CF_HANDLE}`;
}

async function cached<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    const raw = sessionStorage.getItem(cacheKey(name));
    if (raw) {
      const { ts, data } = JSON.parse(raw) as { ts: number; data: T };
      if (Date.now() - ts < CACHE_TTL_MS) return data;
    }
  } catch {
    /* ignore corrupted cache */
  }
  const data = await fn();
  try {
    sessionStorage.setItem(cacheKey(name), JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* storage full or unavailable */
  }
  return data;
}

export async function loadCodeforces(): Promise<CFData> {
  const [users, ratings, submissions] = await Promise.all([
    cached("user", () => fetchJSON<CFUser[]>(`user.info?handles=${CF_HANDLE}`)),
    cached("rating", () => fetchJSON<CFRatingChange[]>(`user.rating?handle=${CF_HANDLE}`)),
    cached("status", () => fetchJSON<CFSubmission[]>(`user.status?handle=${CF_HANDLE}`)),
  ]);
  const user = users[0];

  // Roll up submissions into stats. A "solved" problem is a unique
  // (contestId, index) with at least one OK verdict.
  const solvedKeys = new Set<string>();
  const tagCounts: Record<string, number> = {};
  const ratingBuckets: Record<string, number> = {};
  const languages: Record<string, number> = {};
  const activity: Record<string, number> = {};
  const acDays = new Set<string>(); // distinct days with ≥1 accepted submission
  let acceptedSubmissions = 0;
  let hardestSolved: CFData["stats"]["hardestSolved"] = null;

  const now = Date.now();
  const YEAR = 365 * 24 * 3600 * 1000;
  const MONTH = 30 * 24 * 3600 * 1000;
  const solvedYearKeys = new Set<string>();
  const solvedMonthKeys = new Set<string>();

  for (const s of submissions) {
    const ms = s.creationTimeSeconds * 1000;
    const day = isoDay(ms);
    activity[day] = (activity[day] ?? 0) + 1;

    if (s.verdict === "OK") {
      acceptedSubmissions++;
      acDays.add(day);
      const key = `${s.problem.contestId ?? "G"}-${s.problem.index}`;
      if (now - ms <= YEAR) solvedYearKeys.add(key);
      if (now - ms <= MONTH) solvedMonthKeys.add(key);
      if (!solvedKeys.has(key)) {
        solvedKeys.add(key);
        for (const t of s.problem.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
        if (s.problem.rating) {
          const bucket = String(Math.floor(s.problem.rating / 100) * 100);
          ratingBuckets[bucket] = (ratingBuckets[bucket] ?? 0) + 1;
          if (!hardestSolved || s.problem.rating > hardestSolved.rating) {
            hardestSolved = {
              name: s.problem.name,
              rating: s.problem.rating,
              contestId: s.problem.contestId,
              index: s.problem.index,
            };
          }
        }
      }
    }
    languages[s.programmingLanguage] = (languages[s.programmingLanguage] ?? 0) + 1;
  }

  return {
    user,
    ratings,
    activity,
    stats: {
      solvedCount: solvedKeys.size,
      solvedLastYear: solvedYearKeys.size,
      solvedLastMonth: solvedMonthKeys.size,
      maxStreak: longestStreak(acDays),
      streakLastYear: longestStreak(acDays, now - YEAR),
      streakLastMonth: longestStreak(acDays, now - MONTH),
      contests: ratings.length,
      tagCounts,
      ratingBuckets,
      hardestSolved,
      languages,
      totalSubmissions: submissions.length,
      acceptedSubmissions,
    },
  };
}

// Local-time ISO day key ("YYYY-MM-DD").
function isoDay(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Longest run of consecutive calendar days present in `days`, optionally
// only counting days at or after `sinceMs`.
function longestStreak(days: Set<string>, sinceMs = 0): number {
  const sinceDay = sinceMs ? isoDay(sinceMs) : "";
  const sorted = [...days].filter((d) => !sinceDay || d >= sinceDay).sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of sorted) {
    const t = Date.parse(d + "T00:00:00");
    if (prev !== null && t - prev === 86400000) {
      run += 1;
    } else {
      run = 1;
    }
    prev = t;
    if (run > best) best = run;
  }
  return best;
}

// Codeforces' official rank colour palette.
export function rankColor(rating?: number): string {
  if (!rating || rating < 1200) return "#808080"; // Newbie  — gray
  if (rating < 1400) return "#008000";              // Pupil   — green
  if (rating < 1600) return "#03A89E";              // Specialist — cyan
  if (rating < 1900) return "#0000FF";              // Expert  — blue
  if (rating < 2100) return "#AA00AA";              // Candidate Master — purple
  if (rating < 2300) return "#FF8C00";              // Master  — orange
  if (rating < 2400) return "#FF8C00";              // Int. Master — orange
  return "#FF0000";                                  // Grandmaster+ — red
}

export function rankName(rating?: number): string {
  if (!rating) return "Unrated";
  if (rating < 1200) return "Newbie";
  if (rating < 1400) return "Pupil";
  if (rating < 1600) return "Specialist";
  if (rating < 1900) return "Expert";
  if (rating < 2100) return "Candidate Master";
  if (rating < 2300) return "Master";
  if (rating < 2400) return "International Master";
  if (rating < 2600) return "Grandmaster";
  if (rating < 3000) return "International Grandmaster";
  return "Legendary Grandmaster";
}

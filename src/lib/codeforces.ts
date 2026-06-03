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
  };
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
  let acceptedSubmissions = 0;
  let hardestSolved: CFData["stats"]["hardestSolved"] = null;

  for (const s of submissions) {
    if (s.verdict === "OK") {
      acceptedSubmissions++;
      const key = `${s.problem.contestId ?? "G"}-${s.problem.index}`;
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
    stats: {
      solvedCount: solvedKeys.size,
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

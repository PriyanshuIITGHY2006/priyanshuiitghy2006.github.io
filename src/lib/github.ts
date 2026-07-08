// GitHub public API client with sessionStorage caching, mirroring
// src/lib/codeforces.ts's approach: unauthenticated GET requests are
// CORS-friendly, so this runs entirely in the browser.

export const GH_USERNAME = "PriyanshuIITGHY2006";
const API = "https://api.github.com";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

export interface GHUser {
  login: string;
  name?: string;
  avatar_url: string;
  bio?: string;
  company?: string;
  location?: string;
  blog?: string;
  public_repos: number;
  followers: number;
  following: number;
  html_url: string;
  created_at: string;
}

export interface GHCommit {
  repo: string;
  sha: string;
  message: string;
  url: string;
  date: string;
}

export interface GHRepo {
  name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  pushed_at: string;
}

interface GHEvent {
  type: string;
  created_at: string;
  repo: { name: string };
  payload: { commits?: { sha: string; message: string }[] };
}

export interface GithubData {
  user: GHUser;
  commits: GHCommit[];
  /**
   * Only populated when `commits` comes back empty. The public events feed
   * (used for commits) only covers push activity on PUBLIC repos within a
   * ~90-day retention window — it silently omits private-repo pushes
   * entirely, so an account that's actually active can still show zero
   * events. Repos sorted by push date are a much harder signal to fake
   * empty, so they're the fallback rather than just showing nothing.
   */
  recentRepos: GHRepo[];
  /**
   * date "YYYY-MM-DD" → number of commits pushed that day, for the
   * heatmap. Derived from the same events feed as `commits`, so it shares
   * its ~90-day coverage window rather than a full year like Codeforces.
   */
  activity: Record<string, number>;
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function cacheKey(name: string): string {
  return `gh:${name}:${GH_USERNAME}`;
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

// Local-time ISO day key ("YYYY-MM-DD"), matching lib/codeforces.ts's helper.
function isoDay(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function loadGithub(): Promise<GithubData> {
  const [user, events] = await Promise.all([
    cached("user", () => fetchJSON<GHUser>(`/users/${GH_USERNAME}`)),
    cached("events", () => fetchJSON<GHEvent[]>(`/users/${GH_USERNAME}/events/public?per_page=100`)),
  ]);

  // The events feed already comes newest-first; flatten each push event's
  // commit list (GitHub doesn't expose a plain "recent commits across all
  // repos" endpoint, so this is the standard way to build one). The
  // heatmap counts every pushed commit, not just the ones kept in the
  // trimmed `commits` list shown below.
  const commits: GHCommit[] = [];
  const activity: Record<string, number> = {};
  for (const e of events) {
    if (e.type !== "PushEvent" || !e.payload.commits) continue;
    const day = isoDay(Date.parse(e.created_at));
    activity[day] = (activity[day] ?? 0) + e.payload.commits.length;
    for (const c of e.payload.commits) {
      commits.push({
        repo: e.repo.name,
        sha: c.sha,
        message: c.message.split("\n")[0],
        url: `https://github.com/${e.repo.name}/commit/${c.sha}`,
        date: e.created_at,
      });
    }
  }

  const trimmed = commits.slice(0, 15);
  if (trimmed.length > 0) {
    return { user, commits: trimmed, recentRepos: [], activity };
  }

  const recentRepos = await cached("repos", () =>
    fetchJSON<GHRepo[]>(`/users/${GH_USERNAME}/repos?sort=pushed&direction=desc&per_page=6`),
  );
  return { user, commits: trimmed, recentRepos, activity };
}

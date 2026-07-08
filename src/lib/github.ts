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

interface GHEvent {
  type: string;
  created_at: string;
  repo: { name: string };
  payload: { commits?: { sha: string; message: string }[] };
}

export interface GithubData {
  user: GHUser;
  commits: GHCommit[];
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

export async function loadGithub(): Promise<GithubData> {
  const [user, events] = await Promise.all([
    cached("user", () => fetchJSON<GHUser>(`/users/${GH_USERNAME}`)),
    cached("events", () => fetchJSON<GHEvent[]>(`/users/${GH_USERNAME}/events/public?per_page=30`)),
  ]);

  // The events feed already comes newest-first; flatten each push event's
  // commit list (GitHub doesn't expose a plain "recent commits across all
  // repos" endpoint, so this is the standard way to build one).
  const commits: GHCommit[] = [];
  for (const e of events) {
    if (e.type !== "PushEvent" || !e.payload.commits) continue;
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

  return { user, commits: commits.slice(0, 15) };
}

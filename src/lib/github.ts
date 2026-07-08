// GitHub public API client with sessionStorage caching, mirroring
// src/lib/codeforces.ts's approach: unauthenticated GET requests are
// CORS-friendly, so this runs entirely in the browser.
//
// Commits and the activity heatmap are built from each repo's actual
// commit history (`/repos/{owner}/{repo}/commits`), not the public events
// feed (`/users/{username}/events/public`). The events feed is documented
// by GitHub as eventually-consistent, and in practice it can lag or miss
// activity entirely for accounts with heavy push volume — the profile
// page's own "Contribution activity" timeline pulls from a more complete
// internal source that the public REST events endpoint doesn't expose.
// Commit history has no such gap: it's the source of truth.

export const GH_USERNAME = "PriyanshuIITGHY2006";
const API = "https://api.github.com";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const REPOS_TO_SCAN = 5;
const COMMITS_PER_REPO = 100; // GitHub's max page size — one request per repo either way

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

interface GHRepoBasic {
  name: string;
  fork: boolean;
}

interface GHRawCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { date: string } };
}

export interface GithubData {
  user: GHUser;
  commits: GHCommit[];
  /** date "YYYY-MM-DD" → number of commits that day, for the heatmap. */
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
  const [user, repos] = await Promise.all([
    cached("user", () => fetchJSON<GHUser>(`/users/${GH_USERNAME}`)),
    cached("repos", () => fetchJSON<GHRepoBasic[]>(`/users/${GH_USERNAME}/repos?sort=pushed&direction=desc&per_page=${REPOS_TO_SCAN}`)),
  ]);

  // Own repos only — a fork's commit history is mostly someone else's work.
  const ownRepos = repos.filter((r) => !r.fork);

  const perRepo = await Promise.all(
    ownRepos.map((r) =>
      cached(`commits:${r.name}`, () =>
        fetchJSON<GHRawCommit[]>(`/repos/${GH_USERNAME}/${r.name}/commits?per_page=${COMMITS_PER_REPO}`),
      ).catch(() => [] as GHRawCommit[]),
    ),
  );

  const commits: GHCommit[] = [];
  const activity: Record<string, number> = {};
  ownRepos.forEach((r, i) => {
    for (const c of perRepo[i]) {
      const date = c.commit.author.date;
      commits.push({
        repo: `${GH_USERNAME}/${r.name}`,
        sha: c.sha,
        message: c.commit.message.split("\n")[0],
        url: c.html_url,
        date,
      });
      const day = isoDay(Date.parse(date));
      activity[day] = (activity[day] ?? 0) + 1;
    }
  });

  commits.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  return { user, commits: commits.slice(0, 15), activity };
}

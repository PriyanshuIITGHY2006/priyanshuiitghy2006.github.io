import "../styles/github.css";
import { resume } from "../data/resume";
import { loadGithub, GH_USERNAME, type GHUser, type GHCommit } from "../lib/github";
import { renderActivityHeatmap } from "../lib/heatmap";

const PROFILE_URL = `https://github.com/${GH_USERNAME}`;

export async function mountGithub(container: HTMLElement): Promise<void> {
  container.innerHTML = skeleton();
  try {
    const data = await loadGithub();
    container.innerHTML = render(data.user, data.commits, data.activity);
    initInteractions(container);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load";
    container.innerHTML = renderError(msg);
  }
}

function esc(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function pageShell(inner: string): string {
  return `
    <article class="page section-page gh-page">
      <nav class="section-nav">
        <a class="section-back" href="#/">← back</a>
        <span class="section-crumb">${esc(resume.name)} · GitHub</span>
      </nav>
      <div class="section-body">
        <h2 class="section">GitHub</h2>
        <div class="gh-toprow">
          <p class="edu-note">Public profile and recent commit activity.</p>
          <a class="gh-external" href="${PROFILE_URL}" target="_blank" rel="noopener">github.com/${esc(GH_USERNAME)} ↗</a>
        </div>
        <div class="chart-tip" id="gh-tip"></div>
        ${inner}
      </div>
    </article>`;
}

function skeleton(): string {
  return pageShell(`<div class="gh-block gh-msg">Loading from GitHub…</div>`);
}

function renderError(msg: string): string {
  return pageShell(`
    <div class="gh-block gh-msg">
      <b>Couldn't reach GitHub.</b><br/>${esc(msg)}<br/>
      <a href="${PROFILE_URL}" target="_blank" rel="noopener">Open the profile on github.com →</a>
    </div>`);
}

function render(user: GHUser, commits: GHCommit[], activity: Record<string, number>): string {
  return pageShell(`${renderProfile(user)}${renderHeatmap(activity)}${renderCommits(commits)}`);
}

// Built from real commit history across every repo (see lib/github.ts), a
// full year like the Codeforces page's heatmap.
function renderHeatmap(activity: Record<string, number>): string {
  return `
    <div class="gh-block">
      <p class="gh-block-title">Activity</p>
      ${renderActivityHeatmap(activity, { weeks: 52, ariaLabel: "GitHub commit activity" })}
    </div>`;
}

function renderProfile(user: GHUser): string {
  const meta: string[] = [];
  if (user.company) meta.push(esc(user.company));
  if (user.location) meta.push(esc(user.location));
  const joined = relTime(Date.parse(user.created_at) / 1000);

  return `
    <div class="gh-block gh-profile">
      <img class="gh-avatar" src="${esc(user.avatar_url)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"/>
      <div>
        <div class="gh-name">${githubMark()}${esc(user.name || user.login)}</div>
        <div class="gh-login"><a href="${PROFILE_URL}" target="_blank" rel="noopener">@${esc(user.login)}</a></div>
        ${user.bio ? `<p class="gh-bio">${esc(user.bio)}</p>` : ""}
        ${meta.length ? `<div class="gh-metarow">${meta.join(" · ")}</div>` : ""}
        <div class="gh-stats">
          <span><b>${user.public_repos}</b> repos</span>
          <span><b>${user.followers}</b> followers</span>
          <span><b>${user.following}</b> following</span>
          <span>joined <b>${joined}</b></span>
        </div>
      </div>
    </div>`;
}

function renderCommits(commits: GHCommit[]): string {
  if (!commits.length) {
    return `<div class="gh-block"><p class="gh-block-title">Recent Commits</p><p class="gh-empty">No public activity in the last 90 days.</p></div>`;
  }

  const rows = commits.map((c) => `
    <div class="gh-commit-row">
      ${commitIcon()}
      <div class="gh-commit-info">
        <a class="gh-commit-msg" href="${c.url}" target="_blank" rel="noopener">${esc(c.message)}</a>
        <div class="gh-commit-meta">
          <span class="gh-commit-repo">${esc(c.repo.split("/")[1] ?? c.repo)}</span> · ${relTime(Date.parse(c.date) / 1000)}
        </div>
      </div>
    </div>`).join("");

  return `
    <div class="gh-block">
      <p class="gh-block-title">Recent Commits</p>
      <div class="gh-commit-list">${rows}</div>
    </div>`;
}

// ── Actual git/GitHub iconography ────────────────────────────────────────
// The official GitHub "Octicon" mark — single path, themes automatically
// via currentColor.
function githubMark(): string {
  return `<svg class="gh-mark" viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
  </svg>`;
}

// A commit node on a line — the standard way git tooling represents a
// single commit in a history graph.
function commitIcon(): string {
  return `<svg class="gh-commit-ico" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
    <line x1="0.5" y1="8" x2="5" y2="8"/>
    <circle cx="8" cy="8" r="3"/>
    <line x1="11" y1="8" x2="15.5" y2="8"/>
  </svg>`;
}

// ── Chart interactivity (heatmap hover) ──────────────────────────────────
function initInteractions(root: HTMLElement): void {
  const tipEl = root.querySelector<HTMLElement>("#gh-tip");
  if (!tipEl) return;
  const tip: HTMLElement = tipEl;

  function moveTip(e: MouseEvent): void {
    const x = e.clientX + 14;
    const y = e.clientY - 10;
    tip.style.left = `${Math.min(x, window.innerWidth - 170)}px`;
    tip.style.top = `${y}px`;
  }

  root.querySelectorAll<SVGRectElement>(".heat-cell").forEach((cell) => {
    const date = cell.dataset.date ?? "";
    const count = cell.dataset.count ?? "0";
    const label = count === "0"
      ? `${date}: no activity`
      : `${date}: <b>${count}</b> commit${count === "1" ? "" : "s"}`;
    cell.addEventListener("mouseover", (e) => {
      tip.innerHTML = label;
      tip.classList.add("chart-tip-visible");
      moveTip(e as MouseEvent);
    });
    cell.addEventListener("mousemove", (e) => moveTip(e as MouseEvent));
    cell.addEventListener("mouseout", () => tip.classList.remove("chart-tip-visible"));
  });
}

// "10 months ago", "2 years ago"
function relTime(seconds: number): string {
  const diff = Date.now() / 1000 - seconds;
  const months = Math.floor(diff / (30 * 24 * 3600));
  if (months < 1) {
    const days = Math.max(1, Math.floor(diff / (24 * 3600)));
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

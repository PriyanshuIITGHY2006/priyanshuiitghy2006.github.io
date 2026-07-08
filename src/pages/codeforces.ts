import { resume } from "../data/resume";
import {
  loadCodeforces,
  rankColor,
  rankName,
  CF_HANDLE,
  type CFData,
  type CFUser,
  type CFSubmission,
} from "../lib/codeforces";
import { renderActivityHeatmap } from "../lib/heatmap";

const PROFILE_URL = `https://codeforces.com/profile/${CF_HANDLE}`;

export async function mountCodeforces(container: HTMLElement): Promise<void> {
  container.innerHTML = skeleton();
  try {
    const data = await loadCodeforces();
    container.innerHTML = render(data);
    wireTabs(container);
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
    <article class="page section-page cf-page">
      <nav class="section-nav">
        <a class="section-back" href="#/">← back to résumé</a>
        <span class="section-crumb">${esc(resume.name)} · Codeforces</span>
      </nav>
      <div class="section-body">
        <h2 class="section">Codeforces</h2>
        <div class="cf-toprow">
          <p class="edu-note">Live competitive programming profile — rating, activity, and problem-solving breakdown.</p>
          <a class="cf-external" href="${PROFILE_URL}" target="_blank" rel="noopener">codeforces.com/profile/${esc(CF_HANDLE)} ↗</a>
        </div>
        ${inner}
      </div>
    </article>`;
}

// ── Loading / error ─────────────────────────────────────────────────────
function skeleton(): string {
  return pageShell(`<div class="cf-block cf-msg">Loading from Codeforces…</div>`);
}

function renderError(msg: string): string {
  return pageShell(`
    <div class="cf-block cf-msg">
      <b>Couldn't reach Codeforces.</b><br/>${esc(msg)}<br/>
      <a href="${PROFILE_URL}" target="_blank" rel="noopener">Open the profile on codeforces.com →</a>
    </div>`);
}

// Three tabs instead of stacking every chart and list on one page: the
// overview (profile + recent activity) is what you actually want at a
// glance, the breakdown charts and full activity heatmap are one click
// away rather than always-on visual weight.
function render(data: CFData): string {
  return pageShell(`
    <div class="chart-tip" id="cf-tip"></div>
    <div class="cf-tabbar" role="tablist">
      <button type="button" class="cf-tab-btn active" data-tab="overview">Overview</button>
      <button type="button" class="cf-tab-btn" data-tab="problems">Problems</button>
      <button type="button" class="cf-tab-btn" data-tab="activity">Activity</button>
    </div>
    <div class="cf-tabpanel" data-tab-panel="overview">
      ${renderProfile(data.user)}
      ${renderRecentSubmissions(data.recentSubmissions)}
    </div>
    <div class="cf-tabpanel" data-tab-panel="problems" hidden>
      ${renderProblemRatings(data.stats.ratingBuckets)}
      ${renderTags(data.stats.tagCounts)}
    </div>
    <div class="cf-tabpanel" data-tab-panel="activity" hidden>
      ${renderActivity(data)}
    </div>`);
}

function wireTabs(root: HTMLElement): void {
  const btns = Array.from(root.querySelectorAll<HTMLButtonElement>(".cf-tab-btn"));
  const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-tab-panel]"));
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => b.classList.toggle("active", b === btn));
      panels.forEach((p) => { p.hidden = p.dataset.tabPanel !== btn.dataset.tab; });
    });
  });
}

// ── Overview tab: latest submissions, capped short ───────────────────────
function renderRecentSubmissions(submissions: CFSubmission[]): string {
  if (!submissions || submissions.length === 0) {
    return `<div class="cf-block"><p class="cf-block-title">Latest Submissions</p><p class="cf-empty">No submissions yet.</p></div>`;
  }

  const rows = submissions.slice(0, 6).map((s) => {
    const verdict = s.verdict ?? "UNKNOWN";
    const isOk = verdict === "OK";
    const verdictClass = isOk ? "cf-verdict-ok" : "cf-verdict-fail";
    const verdictLabel = isOk ? "AC" : shortVerdict(verdict);
    const problemUrl = s.problem.contestId
      ? `https://codeforces.com/contest/${s.problem.contestId}/problem/${s.problem.index}`
      : `${PROFILE_URL}/submissions`;
    const lang = shortLang(s.programmingLanguage);
    const when = relTime(s.creationTimeSeconds);
    const ratingBadge = s.problem.rating ? `<span class="cf-sub-rating">${s.problem.rating}</span>` : "";
    return `
      <div class="cf-subrow">
        <span class="cf-verdict ${verdictClass}">${verdictLabel}</span>
        <div class="cf-subinfo">
          <a class="cf-subproblem" href="${problemUrl}" target="_blank" rel="noopener">${esc(s.problem.name)}</a>
          <div class="cf-submeta">${esc(lang)} ${ratingBadge}· <span class="cf-subtime">${when}</span></div>
        </div>
      </div>`;
  }).join("");

  return `
    <div class="cf-block">
      <p class="cf-block-title">Latest Submissions</p>
      <div class="cf-sublist">${rows}</div>
      <div class="cf-sidebar-more"><a href="${PROFILE_URL}" target="_blank" rel="noopener">All submissions →</a></div>
    </div>`;
}

function shortVerdict(v: string): string {
  const map: Record<string, string> = {
    WRONG_ANSWER: "WA",
    TIME_LIMIT_EXCEEDED: "TLE",
    MEMORY_LIMIT_EXCEEDED: "MLE",
    RUNTIME_ERROR: "RE",
    COMPILATION_ERROR: "CE",
    PRESENTATION_ERROR: "PE",
    IDLENESS_LIMIT_EXCEEDED: "ILE",
    SKIPPED: "SK",
    REJECTED: "REJ",
    FAILED: "FAIL",
  };
  return map[v] ?? v.slice(0, 4);
}

function shortLang(lang: string): string {
  if (lang.includes("C++")) {
    if (lang.includes("20")) return "C++20";
    if (lang.includes("17")) return "C++17";
    if (lang.includes("14")) return "C++14";
    return "C++";
  }
  if (lang.includes("Python")) return lang.includes("3") ? "Python 3" : "Python";
  if (lang.includes("Java")) return "Java";
  return lang.slice(0, 10);
}

// ── Profile roundbox (info + photo) ─────────────────────────────────────
function renderProfile(user: CFUser): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const color = rankColor(user.maxRating);
  const rank = rankName(user.maxRating);
  const curColor = rankColor(user.rating);
  const photo = user.titlePhoto || user.avatar || "";

  const place: string[] = [];
  if (fullName) place.push(`<span class="cf-realname">${esc(fullName)}</span>`);
  if (user.city) place.push(`<a class="cf-link" href="${PROFILE_URL}">${esc(user.city)}</a>`);
  if (user.country) place.push(`<a class="cf-link" href="${PROFILE_URL}">${esc(user.country)}</a>`);

  const registered = user.registrationTimeSeconds ? relTime(user.registrationTimeSeconds) : null;

  return `
    <div class="cf-block cf-profile">
      <div class="cf-profile-info">
        <div class="cf-rank-title" style="color:${color}">${esc(rank)}</div>
        <h1 class="cf-username" style="color:${color}">${esc(user.handle)}</h1>
        <div class="cf-profile-cflink"><a href="${PROFILE_URL}" target="_blank" rel="noopener">codeforces.com/profile/${esc(user.handle)}</a></div>
        ${place.length ? `<div class="cf-place">${place.join(", ")}</div>` : ""}
        ${user.organization ? `<div class="cf-place">From <a class="cf-link" href="${PROFILE_URL}">${esc(user.organization)}</a></div>` : ""}

        <ul class="cf-props">
          <li>${icon("rating")}<span>Contest rating: <b style="color:${curColor}">${user.rating ?? "—"}</b>
            <span class="cf-muted">(max. <b style="color:${color}">${esc(rank.toLowerCase())}</b>, <b style="color:${color}">${user.maxRating ?? "—"}</b>)</span></span></li>
          <li>${icon("star")}<span>Contribution: <b>${user.contribution ?? 0}</b></span></li>
          ${user.rank ? `<li>${icon("badge")}<span>Current rank: <b style="color:${curColor}">${esc(user.rank)}</b></span></li>` : ""}
          ${registered ? `<li>${icon("clock")}<span>Registered: <b>${esc(registered)}</b></span></li>` : ""}
        </ul>
      </div>
      ${photo ? `<div class="cf-photo"><img src="${esc(photo)}" alt="" onerror="this.parentElement.style.display='none'"/></div>` : ""}
    </div>`;
}

// Trimmed to the three numbers that actually answer "how active is this
// account right now" — the full year/month breakdown of all six was mostly
// near-duplicate noise (see PR discussion: crowded page feedback).
function renderActivity(data: CFData): string {
  const { activity, stats, recentSubmissions } = data;
  const heat = renderActivityHeatmap(activity, { weeks: 52, ariaLabel: "Submission activity" });
  const lastActive = recentSubmissions.length ? relTime(recentSubmissions[0].creationTimeSeconds) : "—";

  return `
    <div class="cf-block cf-activity">
      <p class="cf-block-title">Activity</p>
      ${heat}
      <div class="cf-actstats">
        <div class="cf-actcol">
          <div class="cf-bignum">${stats.solvedCount}</div>
          <div class="cf-actsub">problems solved</div>
        </div>
        <div class="cf-actcol">
          <div class="cf-bignum">${stats.maxStreak}</div>
          <div class="cf-actsub">day streak, best</div>
        </div>
        <div class="cf-actcol">
          <div class="cf-bignum">${lastActive}</div>
          <div class="cf-actsub">last active</div>
        </div>
      </div>
    </div>`;
}

// ── Problem Ratings bar chart ───────────────────────────────────────────
function renderProblemRatings(buckets: Record<string, number>): string {
  const entries = Object.entries(buckets)
    .map(([k, v]) => [parseInt(k, 10), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  if (entries.length === 0) {
    return `<div class="cf-block"><p class="cf-block-title">Problem Ratings</p><p class="cf-empty">No rated problems solved yet.</p></div>`;
  }

  const min = entries[0][0];
  const max = entries[entries.length - 1][0];
  const full: [number, number][] = [];
  for (let r = min; r <= max; r += 100) full.push([r, buckets[String(r)] ?? 0]);

  const W = 920;
  const H = 360;
  const P = { top: 20, right: 16, bottom: 34, left: 38 };
  const cw = W - P.left - P.right;
  const ch = H - P.top - P.bottom;
  const maxCount = Math.max(...full.map(([, c]) => c));
  const yMax = Math.ceil(maxCount / 10) * 10 || 10;
  const barW = (cw / full.length) * 0.72;
  const slot = cw / full.length;

  const yTicks = 6;
  const grid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = Math.round((yMax * i) / yTicks);
    const y = P.top + ch - (ch * i) / yTicks;
    return `<line x1="${P.left}" x2="${W - P.right}" y1="${y}" y2="${y}" class="cf-grid"/>
            <text x="${P.left - 8}" y="${y + 4}" class="cf-axis" text-anchor="end">${v}</text>`;
  }).join("");

  const bars = full
    .map(([rating, count], i) => {
      const h = yMax ? (ch * count) / yMax : 0;
      const x = P.left + i * slot + (slot - barW) / 2;
      const y = P.top + ch - h;
      return `
        <rect class="cf-bar-rect"
              x="${x.toFixed(1)}" y="${y.toFixed(1)}"
              width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
              data-rating="${rating}" data-count="${count}"/>
        <text x="${(x + barW / 2).toFixed(1)}" y="${H - P.bottom + 16}" class="cf-axis" text-anchor="middle">${rating}</text>`;
    })
    .join("");

  return `
    <div class="cf-block">
      <p class="cf-block-title">Problem Ratings</p>
      <div class="cf-legend-top"><span class="cf-legend-swatch"></span>Problems Solved</div>
      <div class="cf-chartwrap">
        <svg class="cf-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Problems solved by rating">
          ${grid}
          ${bars}
        </svg>
      </div>
    </div>`;
}

// ── Tags Solved donut ───────────────────────────────────────────────────
function renderTags(tagCounts: Record<string, number>): string {
  const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  if (tags.length === 0) {
    return `<div class="cf-block"><p class="cf-block-title">Tags Solved</p><p class="cf-empty">No tagged problems solved yet.</p></div>`;
  }

  const total = tags.reduce((s, [, c]) => s + c, 0);
  const cx = 120;
  const cy = 120;
  const rO = 110;
  const rI = 62;

  let angle = -Math.PI / 2;
  const slices: string[] = [];
  const legend: string[] = [];

  tags.forEach(([tag, count], i) => {
    const frac = count / total;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    const color = TAG_PALETTE[i % TAG_PALETTE.length];
    slices.push(
      `<path class="cf-donut-slice"
            d="${donutArc(cx, cy, rO, rI, a0, a1)}"
            fill="${color}" stroke-width="1.5"
            data-tag="${esc(tag)}" data-count="${count}"/>`,
    );
    legend.push(
      `<li><span class="cf-dot" style="background:${color}"></span><span class="cf-legend-name">${esc(tag)}</span><span class="cf-legend-count">: ${count}</span></li>`,
    );
  });

  return `
    <div class="cf-block">
      <p class="cf-block-title">Tags Solved</p>
      <div class="cf-tagsbody">
        <svg class="cf-donut" viewBox="0 0 240 240" role="img" aria-label="Problems solved by tag">${slices.join("")}</svg>
        <ul class="cf-taglegend">${legend.join("")}</ul>
      </div>
    </div>`;
}

function donutArc(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number): string {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    return (
      donutArc(cx, cy, rO, rI, a0, a0 + Math.PI) + " " + donutArc(cx, cy, rO, rI, a0 + Math.PI, a1)
    );
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const x0o = cx + rO * Math.cos(a0), y0o = cy + rO * Math.sin(a0);
  const x1o = cx + rO * Math.cos(a1), y1o = cy + rO * Math.sin(a1);
  const x0i = cx + rI * Math.cos(a1), y0i = cy + rI * Math.sin(a1);
  const x1i = cx + rI * Math.cos(a0), y1i = cy + rI * Math.sin(a0);
  return `M ${x0o.toFixed(2)} ${y0o.toFixed(2)} A ${rO} ${rO} 0 ${large} 1 ${x1o.toFixed(2)} ${y1o.toFixed(2)} L ${x0i.toFixed(2)} ${y0i.toFixed(2)} A ${rI} ${rI} 0 ${large} 0 ${x1i.toFixed(2)} ${y1i.toFixed(2)} Z`;
}

// ── Chart interactivity ──────────────────────────────────────────────────
function initInteractions(root: HTMLElement): void {
  const tipEl = root.querySelector<HTMLElement>("#cf-tip");
  if (!tipEl) return;
  const tip: HTMLElement = tipEl;

  function showTip(e: MouseEvent, html: string): void {
    tip.innerHTML = html;
    tip.classList.add("chart-tip-visible");
    moveTip(e);
  }

  function moveTip(e: MouseEvent): void {
    const x = e.clientX + 14;
    const y = e.clientY - 10;
    tip.style.left = `${Math.min(x, window.innerWidth - 170)}px`;
    tip.style.top = `${y}px`;
  }

  function hideTip(): void {
    tip.classList.remove("chart-tip-visible");
  }

  // Bar chart hover
  root.querySelectorAll<SVGRectElement>(".cf-bar-rect").forEach((rect) => {
    const rating = rect.dataset.rating ?? "";
    const count = rect.dataset.count ?? "0";
    rect.addEventListener("mouseover", (e) =>
      showTip(e as MouseEvent, `<b>${rating}</b><br/>Problems Solved: <b>${count}</b>`));
    rect.addEventListener("mousemove", (e) => moveTip(e as MouseEvent));
    rect.addEventListener("mouseout", hideTip);
  });

  // Donut slice hover
  root.querySelectorAll<SVGPathElement>(".cf-donut-slice").forEach((path) => {
    const tag = path.dataset.tag ?? "";
    const count = path.dataset.count ?? "0";
    path.addEventListener("mouseover", (e) =>
      showTip(e as MouseEvent, `<b>${tag}</b>: ${count}`));
    path.addEventListener("mousemove", (e) => moveTip(e as MouseEvent));
    path.addEventListener("mouseout", hideTip);
  });

  // Heatmap cell hover
  root.querySelectorAll<SVGRectElement>(".heat-cell").forEach((cell) => {
    const date = cell.dataset.date ?? "";
    const count = cell.dataset.count ?? "0";
    const label = count === "0"
      ? `${date}: no submissions`
      : `${date}: <b>${count}</b> submission${count === "1" ? "" : "s"}`;
    cell.addEventListener("mouseover", (e) => showTip(e as MouseEvent, label));
    cell.addEventListener("mousemove", (e) => moveTip(e as MouseEvent));
    cell.addEventListener("mouseout", hideTip);
  });
}

// ── Colours ─────────────────────────────────────────────────────────────
// A muted, low-saturation palette — enough hue variety to tell ~20 tags
// apart at a glance, without breaking the page's black-and-white tone.
const TAG_PALETTE = [
  "#8c8c8c", "#6f8faf", "#7fa88a", "#b0895f", "#9a89b5", "#5f9ea0",
  "#a3a35a", "#b58ea0", "#6f9a8c", "#8f8fbf", "#a5896f", "#7a9e6e",
  "#9e7a9e", "#7fa0b5", "#af8f6f", "#7a8f5f", "#a08f9e", "#5f8f8f",
  "#8f7a6f", "#8fa06f", "#9e6f7a", "#6f8f9e", "#a0925f", "#7a7aa0",
];

// ── Tiny inline icons ────────────────────────────────────────────────────
function icon(kind: string): string {
  const wrap = (inner: string) =>
    `<svg class="cf-ico" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">${inner}</svg>`;
  switch (kind) {
    case "rating":
      return wrap('<path fill="#7a7a7a" d="M1 13h14v1.5H1zM3 11l3-4 3 2 4-6 1.2.8-4.8 7.2-3-2-2.4 3z"/>');
    case "star":
      return wrap('<path fill="#7a7a7a" d="M8 1l2 4.4 4.8.5-3.6 3.2 1 4.7L8 11.6 3.8 13.8l1-4.7L1.2 5.9 6 5.4z"/>');
    case "badge":
      return wrap('<path fill="#7a7a7a" d="M8 1l2 1.6 2.5-.3.6 2.4 2 1.6-1.3 2.1.3 2.5-2.4.6L10 15l-2-1.4L6 15l-1.6-1.4-2.4-.6.3-2.5L1 8.3l2-1.6.6-2.4L6.1 2.6z"/>');
    case "clock":
      return wrap('<path fill="#7a7a7a" d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3zm-.8 2v3.4l2.8 1.7.8-1.3-2.1-1.3V5z"/>');
    default:
      return wrap("");
  }
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

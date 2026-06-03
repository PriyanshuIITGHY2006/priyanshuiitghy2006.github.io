import {
  loadCodeforces,
  rankColor,
  rankName,
  CF_HANDLE,
  type CFData,
  type CFUser,
  type CFSubmission,
} from "../lib/codeforces";

const PROFILE_URL = `https://codeforces.com/profile/${CF_HANDLE}`;

export async function mountCodeforces(container: HTMLElement): Promise<void> {
  container.innerHTML = skeleton();
  try {
    const data = await loadCodeforces();
    container.innerHTML = render(data);
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

// ── Loading / error ─────────────────────────────────────────────────────
function skeleton(): string {
  return `
    <div class="cf">
      <a class="cf-home" href="#/">← résumé</a>
      <div class="cf-roundbox cf-msg">Loading from Codeforces…</div>
    </div>`;
}

function renderError(msg: string): string {
  return `
    <div class="cf">
      <a class="cf-home" href="#/">← résumé</a>
      <div class="cf-roundbox cf-msg">
        <b>Couldn't reach Codeforces.</b><br/>${esc(msg)}<br/>
        <a href="${PROFILE_URL}" target="_blank" rel="noopener">Open the profile on codeforces.com →</a>
      </div>
    </div>`;
}

function render(data: CFData): string {
  return `
    <div class="cf">
      <div class="cf-tooltip" id="cf-tip"></div>
      <div class="cf-bar">
        <span class="cf-tab cf-tab-active">${esc(data.user.handle)}</span>
        <a class="cf-home" href="#/">← back to résumé</a>
      </div>
      <div class="cf-twocol">
        <div class="cf-main">
          ${renderProfile(data.user)}
          ${renderActivity(data)}
          ${renderProblemRatings(data.stats.ratingBuckets)}
          ${renderTags(data.stats.tagCounts)}
        </div>
        <aside class="cf-sidebar">
          ${renderSidebar(data.recentSubmissions)}
        </aside>
      </div>
    </div>`;
}

// ── Sidebar: Latest Submissions ─────────────────────────────────────────
function renderSidebar(submissions: CFSubmission[]): string {
  if (!submissions || submissions.length === 0) {
    return `<div class="cf-roundbox"><h2 class="cf-h2">Latest Submissions</h2><p class="cf-empty">No submissions yet.</p></div>`;
  }

  const rows = submissions.slice(0, 20).map((s) => {
    const verdict = s.verdict ?? "UNKNOWN";
    const isOk = verdict === "OK";
    const verdictClass = isOk ? "cf-verdict-ok" : "cf-verdict-fail";
    const verdictLabel = isOk ? "AC" : shortVerdict(verdict);
    const problemUrl = s.problem.contestId
      ? `https://codeforces.com/contest/${s.problem.contestId}/problem/${s.problem.index}`
      : `${PROFILE_URL}/submissions`;
    const lang = shortLang(s.programmingLanguage);
    const when = relTime(s.creationTimeSeconds);
    const ratingBadge = s.problem.rating
      ? `<span class="cf-sub-rating" style="color:${barColor(s.problem.rating)}">${s.problem.rating}</span>`
      : "";
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
    <div class="cf-roundbox">
      <h2 class="cf-h2">Latest Submissions</h2>
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
    <div class="cf-roundbox cf-profile">
      <div class="cf-profile-info">
        <div class="cf-rank-title" style="color:${color}">${esc(rank)}</div>
        <h1 class="cf-username" style="color:${color}">${esc(user.handle)}</h1>
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

// ── Activity heatmap + the 3-column problems/streak stats ───────────────
function renderActivity(data: CFData): string {
  const { activity, stats } = data;
  const heat = heatmap(activity);

  return `
    <div class="cf-roundbox cf-activity">
      ${heat}
      <div class="cf-actstats">
        <div class="cf-actcol">
          <div class="cf-bignum">${stats.solvedCount} problems</div>
          <div class="cf-actsub">solved for all time</div>
        </div>
        <div class="cf-actcol">
          <div class="cf-bignum">${stats.solvedLastYear} problems</div>
          <div class="cf-actsub">solved for the last year</div>
        </div>
        <div class="cf-actcol">
          <div class="cf-bignum">${stats.solvedLastMonth} problems</div>
          <div class="cf-actsub">solved for the last month</div>
        </div>
        <div class="cf-actcol">
          <div class="cf-bignum">${stats.maxStreak} days</div>
          <div class="cf-actsub">in a row max.</div>
        </div>
        <div class="cf-actcol">
          <div class="cf-bignum">${stats.streakLastYear} days</div>
          <div class="cf-actsub">in a row for the last year</div>
        </div>
        <div class="cf-actcol">
          <div class="cf-bignum">${stats.streakLastMonth} days</div>
          <div class="cf-actsub">in a row for the last month</div>
        </div>
      </div>
    </div>`;
}

// GitHub/Codeforces-style calendar heatmap of the trailing ~12 months.
function heatmap(activity: Record<string, number>): string {
  const CELL = 11;
  const GAP = 3;
  const STEP = CELL + GAP;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  const start = new Date(today);
  start.setDate(start.getDate() - 7 * 52);
  start.setDate(start.getDate() - start.getDay());

  const days: { date: Date; key: string; count: number }[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ date: new Date(d), key, count: activity[key] ?? 0 });
  }

  const weeks = Math.ceil(days.length / 7);
  const padLeft = 30;
  const padTop = 18;
  const W = padLeft + weeks * STEP;
  const H = padTop + 7 * STEP;

  const cells: string[] = [];
  const monthLabels: string[] = [];
  let lastMonth = -1;

  days.forEach((day, i) => {
    const col = Math.floor(i / 7);
    const row = i % 7;
    const x = padLeft + col * STEP;
    const y = padTop + row * STEP;
    cells.push(
      `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${heatColor(day.count)}" class="cf-heat-cell" data-date="${day.key}" data-count="${day.count}"/>`,
    );
    if (row === 0) {
      const m = day.date.getMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        monthLabels.push(
          `<text x="${x}" y="${padTop - 6}" class="cf-heat-label">${day.date.toLocaleString("en-US", { month: "short" })}</text>`,
        );
      }
    }
  });

  const dayLabels = [
    { row: 1, text: "Mon" },
    { row: 3, text: "Wed" },
    { row: 5, text: "Fri" },
  ]
    .map((d) => `<text x="0" y="${padTop + d.row * STEP + CELL - 2}" class="cf-heat-label">${d.text}</text>`)
    .join("");

  return `
    <div class="cf-heatwrap">
      <svg class="cf-heat" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Submission activity">
        ${monthLabels.join("")}
        ${dayLabels}
        ${cells.join("")}
      </svg>
    </div>`;
}

function heatColor(count: number): string {
  if (count <= 0) return "#ebedf0";
  if (count <= 2) return "#c6e6c6";
  if (count <= 5) return "#7bc96f";
  if (count <= 9) return "#42a83c";
  return "#1d6b1d";
}

// ── Problem Ratings bar chart ───────────────────────────────────────────
function renderProblemRatings(buckets: Record<string, number>): string {
  const entries = Object.entries(buckets)
    .map(([k, v]) => [parseInt(k, 10), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  if (entries.length === 0) {
    return `<div class="cf-roundbox"><h2 class="cf-h2">Problem Ratings</h2><p class="cf-empty">No rated problems solved yet.</p></div>`;
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
              fill="${barColor(rating)}" stroke="${barStroke(rating)}" stroke-width="1"
              data-rating="${rating}" data-count="${count}"/>
        <text x="${(x + barW / 2).toFixed(1)}" y="${H - P.bottom + 16}" class="cf-axis" text-anchor="middle">${rating}</text>`;
    })
    .join("");

  return `
    <div class="cf-roundbox">
      <h2 class="cf-h2">Problem Ratings</h2>
      <div class="cf-legend-top"><span class="cf-legend-swatch" style="background:#dddddd;border-color:#bbb"></span>Problems Solved</div>
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
    return `<div class="cf-roundbox"><h2 class="cf-h2">Tags Solved</h2><p class="cf-empty">No tagged problems solved yet.</p></div>`;
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
            fill="${color}" stroke="#fff" stroke-width="1.5"
            data-tag="${esc(tag)}" data-count="${count}"/>`,
    );
    legend.push(
      `<li><span class="cf-dot" style="background:${color}"></span><span class="cf-legend-name">${esc(tag)}</span><span class="cf-legend-count">: ${count}</span></li>`,
    );
  });

  return `
    <div class="cf-roundbox">
      <h2 class="cf-h2">Tags Solved</h2>
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
    tip.classList.add("cf-tip-visible");
    moveTip(e);
  }

  function moveTip(e: MouseEvent): void {
    const x = e.clientX + 14;
    const y = e.clientY - 10;
    tip.style.left = `${Math.min(x, window.innerWidth - 170)}px`;
    tip.style.top = `${y}px`;
  }

  function hideTip(): void {
    tip.classList.remove("cf-tip-visible");
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
  root.querySelectorAll<SVGRectElement>(".cf-heat-cell").forEach((cell) => {
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
function barColor(rating: number): string {
  if (rating < 1200) return "#cfcfcf";
  if (rating < 1400) return "#90ee90";
  if (rating < 1600) return "#86e3ce";
  if (rating < 1900) return "#a8a8ff";
  if (rating < 2100) return "#ff8cff";
  if (rating < 2400) return "#ffce8c";
  return "#ff8c8c";
}
function barStroke(rating: number): string {
  if (rating < 1200) return "#9e9e9e";
  if (rating < 1400) return "#3fbf3f";
  if (rating < 1600) return "#36b89e";
  if (rating < 1900) return "#6a6aff";
  if (rating < 2100) return "#c000c0";
  if (rating < 2400) return "#e6960a";
  return "#e23b3b";
}

const TAG_PALETTE = [
  "#ff6b6b", "#ff8fb1", "#d98fff", "#9b8cff", "#8c9bff", "#6ec8ff", "#5fd6e0",
  "#5fe0c0", "#5fe08a", "#9be05f", "#d6e05f", "#e0c25f", "#e0945f", "#ff9d6b",
  "#ffb3c1", "#e8a0ff", "#b0a0ff", "#a0b8ff", "#a0e0ff", "#a0ffe8", "#b8ffa0",
  "#ffe0a0", "#ffc0a0", "#ff9999",
];

// ── Tiny inline icons ────────────────────────────────────────────────────
function icon(kind: string): string {
  const wrap = (inner: string) =>
    `<svg class="cf-ico" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">${inner}</svg>`;
  switch (kind) {
    case "rating":
      return wrap('<path fill="#3b78c2" d="M1 13h14v1.5H1zM3 11l3-4 3 2 4-6 1.2.8-4.8 7.2-3-2-2.4 3z"/>');
    case "star":
      return wrap('<path fill="#e8b400" d="M8 1l2 4.4 4.8.5-3.6 3.2 1 4.7L8 11.6 3.8 13.8l1-4.7L1.2 5.9 6 5.4z"/>');
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

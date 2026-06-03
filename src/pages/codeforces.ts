import {
  loadCodeforces,
  rankColor,
  rankName,
  CF_HANDLE,
  type CFData,
  type CFRatingChange,
  type CFUser,
} from "../lib/codeforces";

const PROFILE_URL = `https://codeforces.com/profile/${CF_HANDLE}`;

export async function mountCodeforces(container: HTMLElement): Promise<void> {
  container.innerHTML = skeleton();
  try {
    const data = await loadCodeforces();
    container.innerHTML = render(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load";
    container.innerHTML = renderError(msg);
  }
}

function escape(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function skeleton(): string {
  return `
    <div class="cf-page">
      <a class="cf-back" href="#/">← Back to résumé</a>
      <div class="cf-loading">
        <div class="cf-spinner" aria-hidden="true"></div>
        <p>Loading from Codeforces…</p>
      </div>
    </div>`;
}

function renderError(msg: string): string {
  return `
    <div class="cf-page">
      <a class="cf-back" href="#/">← Back to résumé</a>
      <div class="cf-error">
        <h2>Couldn't reach Codeforces</h2>
        <p>${escape(msg)}</p>
        <p>You can still view the profile directly on
          <a href="${PROFILE_URL}" target="_blank" rel="noopener">codeforces.com</a>.
        </p>
      </div>
    </div>`;
}

function render(data: CFData): string {
  return `
    <div class="cf-page">
      <a class="cf-back" href="#/">← Back to résumé</a>
      ${renderHero(data.user)}
      ${renderStats(data)}
      ${renderRatingChart(data.ratings)}
      ${renderContests(data.ratings)}
      ${renderProblemDistribution(data.stats.ratingBuckets)}
      ${renderTags(data.stats.tagCounts)}
      ${renderFooter(data)}
    </div>`;
}

// ── Hero: avatar + name + rank badge ────────────────────────────────────
function renderHero(user: CFUser): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.handle;
  const subParts: string[] = [];
  if (user.organization) subParts.push(user.organization);
  if (user.city) subParts.push(user.city);
  if (user.country) subParts.push(user.country);
  const sub = subParts.join(" · ");
  const avatar = user.titlePhoto || user.avatar || "";
  const color = rankColor(user.maxRating);
  const rank = rankName(user.maxRating);

  return `
    <header class="cf-hero">
      <img class="cf-avatar" src="${escape(avatar)}" alt="" onerror="this.style.display='none'"/>
      <div class="cf-hero-text">
        <h1 class="cf-name" style="color:${color}">${escape(name)}</h1>
        <p class="cf-handle">
          <a href="${PROFILE_URL}" target="_blank" rel="noopener">@${escape(user.handle)}</a>
          ${sub ? ` · ${escape(sub)}` : ""}
        </p>
        <span class="cf-rank-badge" style="--rank:${color}">
          <span class="cf-rank-name">${escape(rank)}</span>
          <span class="cf-rank-sep">·</span>
          <span class="cf-rank-rating">${user.rating ?? "—"}</span>
          <span class="cf-rank-max">max ${user.maxRating ?? "—"}</span>
        </span>
      </div>
    </header>`;
}

// ── Stat grid ───────────────────────────────────────────────────────────
function renderStats(data: CFData): string {
  const { user, stats } = data;
  const ratedYears = data.ratings.length
    ? new Date(data.ratings[data.ratings.length - 1].ratingUpdateTimeSeconds * 1000).getFullYear() -
      new Date(data.ratings[0].ratingUpdateTimeSeconds * 1000).getFullYear() +
      1
    : 0;
  const accuracy =
    stats.totalSubmissions > 0 ? Math.round((stats.acceptedSubmissions / stats.totalSubmissions) * 100) : 0;

  const cards = [
    { label: "Current rating", value: String(user.rating ?? "—"), sub: rankName(user.rating), color: rankColor(user.rating) },
    { label: "Max rating", value: String(user.maxRating ?? "—"), sub: rankName(user.maxRating), color: rankColor(user.maxRating) },
    { label: "Problems solved", value: String(stats.solvedCount), sub: "Unique problems with an Accepted verdict" },
    { label: "Contests", value: String(stats.contests), sub: ratedYears ? `Over ${ratedYears} year${ratedYears === 1 ? "" : "s"} of rated play` : "Rated contests" },
    { label: "Acceptance", value: `${accuracy}%`, sub: `${stats.acceptedSubmissions} of ${stats.totalSubmissions} submissions` },
    {
      label: "Hardest solved",
      value: stats.hardestSolved ? String(stats.hardestSolved.rating) : "—",
      sub: stats.hardestSolved ? stats.hardestSolved.name : "No rated problem yet",
      color: stats.hardestSolved ? rankColor(stats.hardestSolved.rating) : undefined,
      href:
        stats.hardestSolved && stats.hardestSolved.contestId
          ? `https://codeforces.com/contest/${stats.hardestSolved.contestId}/problem/${stats.hardestSolved.index}`
          : undefined,
    },
  ];

  return `
    <section class="cf-stats">
      ${cards
        .map(
          (c) => `
        ${c.href ? `<a class="cf-card" href="${c.href}" target="_blank" rel="noopener">` : `<div class="cf-card">`}
          <div class="cf-card-label">${escape(c.label)}</div>
          <div class="cf-card-value" ${c.color ? `style="color:${c.color}"` : ""}>${escape(c.value)}</div>
          <div class="cf-card-sub">${escape(c.sub)}</div>
        ${c.href ? `</a>` : `</div>`}
      `,
        )
        .join("")}
    </section>`;
}

// ── Rating-history SVG chart ────────────────────────────────────────────
function renderRatingChart(ratings: CFRatingChange[]): string {
  if (ratings.length === 0) {
    return `
      <section class="cf-section">
        <h2 class="cf-section-title">Rating history</h2>
        <p class="cf-empty">No rated contests yet.</p>
      </section>`;
  }

  const W = 1000;
  const H = 260;
  const P = { top: 24, right: 16, bottom: 32, left: 44 };
  const cw = W - P.left - P.right;
  const ch = H - P.top - P.bottom;

  // Pad min/max to nice round numbers.
  const rs = ratings.map((r) => r.newRating);
  const minR = Math.floor((Math.min(...rs) - 60) / 100) * 100;
  const maxR = Math.ceil((Math.max(...rs) + 60) / 100) * 100;
  const minT = ratings[0].ratingUpdateTimeSeconds;
  const maxT = ratings[ratings.length - 1].ratingUpdateTimeSeconds;
  const spanT = maxT - minT || 1;

  const x = (t: number) => P.left + (cw * (t - minT)) / spanT;
  const y = (r: number) => P.top + ch - (ch * (r - minR)) / (maxR - minR);

  // Rank-tier shaded bands so the chart reads like the official CF graph.
  const bands = [
    { from: 0, to: 1200, color: "#80808014" },
    { from: 1200, to: 1400, color: "#00800014" },
    { from: 1400, to: 1600, color: "#03A89E14" },
    { from: 1600, to: 1900, color: "#0000FF12" },
    { from: 1900, to: 2100, color: "#AA00AA12" },
    { from: 2100, to: 2400, color: "#FF8C0014" },
    { from: 2400, to: 4000, color: "#FF000012" },
  ]
    .map((b) => {
      const top = y(Math.min(b.to, maxR));
      const bottom = y(Math.max(b.from, minR));
      if (top >= bottom) return "";
      return `<rect x="${P.left}" y="${top}" width="${cw}" height="${bottom - top}" fill="${b.color}"/>`;
    })
    .join("");

  const path =
    "M " +
    ratings
      .map((r) => `${x(r.ratingUpdateTimeSeconds).toFixed(1)} ${y(r.newRating).toFixed(1)}`)
      .join(" L ");

  const dots = ratings
    .map(
      (r) =>
        `<circle cx="${x(r.ratingUpdateTimeSeconds).toFixed(1)}" cy="${y(r.newRating).toFixed(1)}" r="3" fill="${rankColor(r.newRating)}" stroke="#fff" stroke-width="1"><title>${escape(
          r.contestName,
        )} — ${r.newRating} (${r.newRating - r.oldRating >= 0 ? "+" : ""}${r.newRating - r.oldRating})</title></circle>`,
    )
    .join("");

  const ticks = 4;
  const yLabels = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = Math.round(minR + ((maxR - minR) * i) / ticks);
    return `<text x="${P.left - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#888">${v}</text>
            <line x1="${P.left}" x2="${W - P.right}" y1="${y(v)}" y2="${y(v)}" stroke="#eee"/>`;
  }).join("");

  const firstDate = new Date(minT * 1000).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  const lastDate = new Date(maxT * 1000).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

  return `
    <section class="cf-section">
      <h2 class="cf-section-title">Rating history</h2>
      <div class="cf-chart-wrap">
        <svg class="cf-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Codeforces rating history">
          ${bands}
          ${yLabels}
          <path d="${path}" fill="none" stroke="#1a1a1a" stroke-width="1.4"/>
          ${dots}
          <text x="${P.left}" y="${H - 8}" font-size="11" fill="#888">${escape(firstDate)}</text>
          <text x="${W - P.right}" y="${H - 8}" text-anchor="end" font-size="11" fill="#888">${escape(lastDate)}</text>
        </svg>
      </div>
    </section>`;
}

// ── Recent contests ─────────────────────────────────────────────────────
function renderContests(ratings: CFRatingChange[]): string {
  if (ratings.length === 0) return "";
  const recent = [...ratings].reverse().slice(0, 20);
  return `
    <section class="cf-section">
      <h2 class="cf-section-title">Recent contests</h2>
      <div class="cf-contests">
        <div class="cf-contests-head">
          <span>Contest</span>
          <span>Rank</span>
          <span>Δ</span>
          <span>Rating</span>
        </div>
        ${recent
          .map((c) => {
            const delta = c.newRating - c.oldRating;
            const date = new Date(c.ratingUpdateTimeSeconds * 1000).toLocaleDateString("en-IN", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            return `
            <a class="cf-contest" href="https://codeforces.com/contest/${c.contestId}" target="_blank" rel="noopener">
              <span class="cf-contest-name">
                <span>${escape(c.contestName)}</span>
                <span class="cf-contest-date">${escape(date)}</span>
              </span>
              <span class="cf-contest-rank">#${c.rank}</span>
              <span class="cf-delta ${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "+" : ""}${delta}</span>
              <span class="cf-contest-rating" style="color:${rankColor(c.newRating)}">${c.newRating}</span>
            </a>`;
          })
          .join("")}
      </div>
    </section>`;
}

// ── Problems solved, bucketed by difficulty ─────────────────────────────
function renderProblemDistribution(buckets: Record<string, number>): string {
  const entries = Object.entries(buckets)
    .map(([k, v]) => [parseInt(k, 10), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return "";
  const max = Math.max(...entries.map(([, v]) => v));

  return `
    <section class="cf-section">
      <h2 class="cf-section-title">Solved by difficulty</h2>
      <div class="cf-dist">
        ${entries
          .map(
            ([bucket, count]) => `
          <div class="cf-dist-row">
            <span class="cf-dist-label" style="color:${rankColor(bucket)}">${bucket}</span>
            <div class="cf-dist-track">
              <div class="cf-dist-fill" style="width:${((count / max) * 100).toFixed(1)}%;background:${rankColor(bucket)}"></div>
            </div>
            <span class="cf-dist-count">${count}</span>
          </div>`,
          )
          .join("")}
      </div>
    </section>`;
}

// ── Tags (top 24) ───────────────────────────────────────────────────────
function renderTags(tagCounts: Record<string, number>): string {
  const tags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24);
  if (tags.length === 0) return "";
  return `
    <section class="cf-section">
      <h2 class="cf-section-title">Most-solved tags</h2>
      <div class="cf-tags">
        ${tags
          .map(
            ([tag, count]) => `
          <span class="cf-tag">
            <span>${escape(tag)}</span>
            <span class="cf-tag-count">${count}</span>
          </span>`,
          )
          .join("")}
      </div>
    </section>`;
}

// ── Footer ──────────────────────────────────────────────────────────────
function renderFooter(data: CFData): string {
  const registered = data.user.registrationTimeSeconds
    ? new Date(data.user.registrationTimeSeconds * 1000).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "long",
      })
    : null;
  return `
    <footer class="cf-footer">
      <a class="cf-profile-link" href="${PROFILE_URL}" target="_blank" rel="noopener">
        View full profile on Codeforces ↗
      </a>
      ${registered ? `<span class="cf-registered">Account since ${escape(registered)}</span>` : ""}
    </footer>`;
}

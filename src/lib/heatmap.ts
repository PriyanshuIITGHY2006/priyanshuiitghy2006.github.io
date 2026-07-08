// Shared GitHub-style calendar heatmap builder — used by both the
// Codeforces and GitHub pages so the same visual (cell size, greyscale
// intensity ramp, hover tooltips) renders identically regardless of which
// activity feed it's summarizing. Classes are theme-aware via CSS custom
// properties defined once in resume.css (.heat-0..4).

export interface HeatmapOptions {
  /** How many weeks back from today to render. Defaults to a full year. */
  weeks?: number;
  ariaLabel?: string;
}

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;

function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

export function renderActivityHeatmap(activity: Record<string, number>, opts: HeatmapOptions = {}): string {
  const weeksBack = opts.weeks ?? 52;
  const ariaLabel = opts.ariaLabel ?? "Activity";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  const start = new Date(today);
  start.setDate(start.getDate() - 7 * weeksBack);
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
      `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" class="heat-cell heat-${heatLevel(day.count)}" data-date="${day.key}" data-count="${day.count}"/>`,
    );
    if (row === 0) {
      const m = day.date.getMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        monthLabels.push(
          `<text x="${x}" y="${padTop - 6}" class="heat-label">${day.date.toLocaleString("en-US", { month: "short" })}</text>`,
        );
      }
    }
  });

  const dayLabels = [
    { row: 1, text: "Mon" },
    { row: 3, text: "Wed" },
    { row: 5, text: "Fri" },
  ]
    .map((d) => `<text x="0" y="${padTop + d.row * STEP + CELL - 2}" class="heat-label">${d.text}</text>`)
    .join("");

  return `
    <div class="heatwrap">
      <svg class="heatsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${ariaLabel}">
        ${monthLabels.join("")}
        ${dayLabels}
        ${cells.join("")}
      </svg>
    </div>`;
}

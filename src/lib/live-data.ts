// Shows a page's live (Supabase) data without first flashing the static copy
// bundled with the site, which is usually older than what the admin panel
// has since saved.
//
// - The last live copy is cached in localStorage and rendered immediately.
// - With no cache yet (first visit), it waits up to `waitMs` for the DB and
//   only then falls back to the bundled copy.
// - Fresh data re-renders the page only if it differs from what is shown.
// - Nothing renders once the user has navigated to another route.

export function showLive<T>(opts: {
  key: string;
  fallback: T;
  load: () => Promise<T>;
  render: (data: T) => void;
  /** Whether loaded data is worth showing (e.g. a non-empty list). */
  usable?: (data: T) => boolean;
  waitMs?: number;
}): void {
  const { key, fallback, load, render, usable = () => true, waitMs = 900 } = opts;
  const storageKey = `live:${key}:v1`;
  const route = location.pathname;
  let shown: string | null = null;

  const show = (data: T) => {
    if (location.pathname !== route) return;
    const json = JSON.stringify(data);
    if (json === shown) return;
    shown = json;
    render(data);
  };

  let cached: T | null = null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) cached = JSON.parse(raw) as T;
  } catch {
    cached = null;
  }

  let timer = 0;
  if (cached !== null && usable(cached)) show(cached);
  else timer = window.setTimeout(() => show(fallback), waitMs);

  load()
    .then((live) => {
      if (!usable(live)) throw new Error("no live data");
      clearTimeout(timer);
      try {
        localStorage.setItem(storageKey, JSON.stringify(live));
      } catch {
        // Storage full or blocked — still show it.
      }
      show(live);
    })
    .catch(() => {
      // DB unreachable: whatever is cached stays; otherwise the static copy.
      clearTimeout(timer);
      if (shown === null) show(fallback);
    });
}

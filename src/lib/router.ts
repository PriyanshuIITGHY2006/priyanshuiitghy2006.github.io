// Minimal hash router. Works on GitHub Pages without server-side rewrites.

type Handler = (params: URLSearchParams) => void | Promise<void>;

const routes = new Map<string, Handler>();
let fallback: Handler | null = null;

export function route(path: string, handler: Handler): void {
  routes.set(path, handler);
}

export function notFound(handler: Handler): void {
  fallback = handler;
}

function parse(): { path: string; params: URLSearchParams } {
  const raw = location.hash.slice(1) || "/";
  const [path, query = ""] = raw.split("?");
  return { path: path || "/", params: new URLSearchParams(query) };
}

export function start(): void {
  const dispatch = () => {
    const { path, params } = parse();
    const handler = routes.get(path) ?? fallback;
    // Reset scroll on every navigation so each "page" starts at the top.
    window.scrollTo(0, 0);
    handler?.(params);
  };
  window.addEventListener("hashchange", dispatch);
  dispatch();
}

export function navigate(path: string): void {
  if (location.hash === "#" + path) {
    // Re-dispatch even when the hash hasn't changed.
    const { params } = parse();
    routes.get(path)?.(params);
  } else {
    location.hash = "#" + path;
  }
}

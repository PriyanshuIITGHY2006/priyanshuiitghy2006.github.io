// Subtle, mouse-reactive force graph rendered as a full-viewport background
// behind the blog list — nodes are the real blog posts and their real tags
// (not decorative filler), edges are post↔tag membership, so posts sharing
// tags naturally cluster together.
//
// Self-terminating by design: since this canvas is appended to <body>
// directly (so it can sit fixed behind the page) rather than inside #app,
// the SPA's `app.innerHTML = ""` on route change never removes it — so the
// render loop checks the current hash route itself each frame and tears
// itself down the moment the visitor navigates away from #/blogs. No
// unmount wiring needed in main.ts.

import { BLOG_POSTS, getAllTags } from "./blog";

interface GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  kind: "post" | "tag";
}

interface GraphEdge {
  a: number;
  b: number;
}

const REPULSION = 26000;
const SPRING_LEN = 160;
const SPRING_K = 0.01;
const CENTER_K = 0.0004;
const DAMPING = 0.92;
const MOUSE_RADIUS = 160;
const MOUSE_FORCE = 40000;

function buildGraph(width: number, height: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const tags = getAllTags();
  const nodes: GraphNode[] = [];
  const tagIndex = new Map<string, number>();

  tags.forEach((tag) => {
    tagIndex.set(tag.toLowerCase(), nodes.length);
    nodes.push({ x: Math.random() * width, y: Math.random() * height, vx: 0, vy: 0, r: 4, kind: "tag" });
  });

  const edges: GraphEdge[] = [];
  BLOG_POSTS.forEach((post) => {
    const postIdx = nodes.length;
    nodes.push({ x: Math.random() * width, y: Math.random() * height, vx: 0, vy: 0, r: 6, kind: "post" });
    post.tags.forEach((t) => {
      const ti = tagIndex.get(t.toLowerCase());
      if (ti !== undefined) edges.push({ a: postIdx, b: ti });
    });
  });

  return { nodes, edges };
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(num)) return `rgba(136,136,136,${alpha})`;
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function readPalette(): { line: string; tag: string; post: string } {
  const style = getComputedStyle(document.documentElement);
  return {
    line: style.getPropertyValue("--border-strong") || "#999999",
    tag: style.getPropertyValue("--muted-2") || "#888888",
    post: style.getPropertyValue("--muted") || "#555555",
  };
}

function currentPath(): string {
  const raw = location.hash.slice(1) || "/";
  return raw.split("?")[0] || "/";
}

export function mountBlogGraph(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Enforce a single active instance even if mounted repeatedly in quick succession.
  document.querySelectorAll(".blog-graph-canvas").forEach((el) => el.remove());

  const canvas = document.createElement("canvas");
  canvas.className = "blog-graph-canvas";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = window.innerWidth;
  let height = Math.max(window.innerHeight, 600);

  function resize(): void {
    width = window.innerWidth;
    height = Math.max(window.innerHeight, 600);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  const { nodes, edges } = buildGraph(width, height);

  let palette = readPalette();
  const themeObserver = new MutationObserver(() => {
    palette = readPalette();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  let mouseX = -9999;
  let mouseY = -9999;
  const onMouseMove = (e: MouseEvent) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  };
  const onMouseLeave = () => {
    mouseX = -9999;
    mouseY = -9999;
  };
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseout", onMouseLeave);
  window.addEventListener("resize", resize);

  function step(): void {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const distSq = Math.max(dx * dx + dy * dy, 25);
        const force = REPULSION / distSq;
        const dist = Math.sqrt(distSq);
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }

    for (const e of edges) {
      const a = nodes[e.a], b = nodes[e.b];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const stretch = dist - SPRING_LEN;
      const fx = (dx / dist) * stretch * SPRING_K, fy = (dy / dist) * stretch * SPRING_K;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    for (const n of nodes) {
      n.vx += (width / 2 - n.x) * CENTER_K;
      n.vy += (height / 2 - n.y) * CENTER_K;

      const dx = n.x - mouseX, dy = n.y - mouseY;
      const distSq = dx * dx + dy * dy;
      if (distSq < MOUSE_RADIUS * MOUSE_RADIUS) {
        const dist = Math.max(Math.sqrt(distSq), 1);
        const force = MOUSE_FORCE / (distSq + 400);
        n.vx += (dx / dist) * force;
        n.vy += (dy / dist) * force;
      }

      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x = Math.max(10, Math.min(width - 10, n.x + n.vx));
      n.y = Math.max(10, Math.min(height - 10, n.y + n.vy));
    }
  }

  function draw(): void {
    ctx!.clearRect(0, 0, width, height);

    ctx!.strokeStyle = hexToRgba(palette.line, 0.4);
    ctx!.lineWidth = 1.2;
    for (const e of edges) {
      const a = nodes[e.a], b = nodes[e.b];
      ctx!.beginPath();
      ctx!.moveTo(a.x, a.y);
      ctx!.lineTo(b.x, b.y);
      ctx!.stroke();
    }

    for (const n of nodes) {
      ctx!.beginPath();
      ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx!.fillStyle = n.kind === "post" ? hexToRgba(palette.post, 0.8) : hexToRgba(palette.tag, 0.65);
      ctx!.fill();
    }
  }

  function loop(): void {
    if (!canvas.isConnected || currentPath() !== "/blogs") {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseout", onMouseLeave);
      window.removeEventListener("resize", resize);
      themeObserver.disconnect();
      canvas.remove();
      return;
    }
    step();
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

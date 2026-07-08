// Ambient particle-network background behind the blog list, in the style of
// libraries like particles.js: a dense field of small dots drifting slowly,
// connected by lines whenever two are close enough, with the whole field
// deflecting away from the cursor.
//
// Self-terminating by design: since this canvas is appended to <body>
// directly (so it can sit fixed behind the page) rather than inside #app,
// the SPA's `app.innerHTML = ""` on route change never removes it — so the
// render loop checks the current hash route itself each frame and tears
// itself down the moment the visitor navigates away from #/blogs. No
// unmount wiring needed in main.ts.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const AREA_PER_PARTICLE = 9000; // px^2 per particle — density knob
const MAX_PARTICLES = 110;
const MIN_PARTICLES = 40;
const DRIFT_SPEED = 0.18;
const LINK_DIST = 150;
const MOUSE_RADIUS = 150;
const MOUSE_FORCE = 3.2;
const PARTICLE_RADIUS = 2;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(num)) return `rgba(136,136,136,${alpha})`;
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function readPalette(): { line: string; dot: string } {
  const style = getComputedStyle(document.documentElement);
  return {
    line: style.getPropertyValue("--border-strong") || "#999999",
    dot: style.getPropertyValue("--muted") || "#555555",
  };
}

function currentPath(): string {
  const raw = location.hash.slice(1) || "/";
  return raw.split("?")[0] || "/";
}

function makeParticles(width: number, height: number): Particle[] {
  const count = Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, Math.round((width * height) / AREA_PER_PARTICLE)));
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * DRIFT_SPEED,
      vy: Math.sin(angle) * DRIFT_SPEED,
    });
  }
  return particles;
}

export function mountBlogGraph(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Enforce a single active instance even if mounted repeatedly in quick succession.
  document.querySelectorAll(".blog-graph-canvas").forEach((el) => el.remove());

  const canvas = document.createElement("canvas");
  canvas.className = "blog-graph-canvas";
  // Inserted as the *first* child of <body> (not appended, not negative
  // z-index) so it paints behind everything else purely by DOM order — a
  // negative z-index here got silently swallowed by some stacking context
  // elsewhere on the page and never painted at all.
  document.body.insertBefore(canvas, document.body.firstChild);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = window.innerWidth;
  let height = Math.max(window.innerHeight, 600);
  let particles: Particle[] = [];

  function resize(): void {
    width = window.innerWidth;
    height = Math.max(window.innerHeight, 600);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles = makeParticles(width, height);
  }
  resize();

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
    for (const p of particles) {
      const dx = p.x - mouseX, dy = p.y - mouseY;
      const distSq = dx * dx + dy * dy;
      if (distSq < MOUSE_RADIUS * MOUSE_RADIUS) {
        const dist = Math.max(Math.sqrt(distSq), 1);
        const push = (1 - dist / MOUSE_RADIUS) * MOUSE_FORCE;
        p.vx += (dx / dist) * push;
        p.vy += (dy / dist) * push;
      }

      p.x += p.vx;
      p.y += p.vy;

      // Bounce off the edges so the field stays full instead of thinning out.
      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;
      p.x = Math.max(0, Math.min(width, p.x));
      p.y = Math.max(0, Math.min(height, p.y));

      // Bleed off the mouse-kick energy so drift returns to a steady baseline speed.
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > DRIFT_SPEED) {
        const decay = 0.96;
        p.vx *= decay;
        p.vy *= decay;
      }
    }
  }

  function draw(): void {
    ctx!.clearRect(0, 0, width, height);

    ctx!.lineWidth = 1;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_DIST) {
          ctx!.strokeStyle = hexToRgba(palette.line, 0.5 * (1 - dist / LINK_DIST));
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.stroke();
        }
      }
    }

    ctx!.fillStyle = hexToRgba(palette.dot, 0.7);
    for (const p of particles) {
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, PARTICLE_RADIUS, 0, Math.PI * 2);
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

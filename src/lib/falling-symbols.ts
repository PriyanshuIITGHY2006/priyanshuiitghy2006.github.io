// Easter egg: type "matrix" anywhere on the page (nothing editable
// focused) and a handful of math symbols drop from the top of the screen,
// bounce off the bottom with real (decaying) physics, and settle in
// place — sitting there, on top of the real page, until the visitor
// scrolls, moves the mouse, clicks, or types, at which point they clear.
//
// No green screen, no full-viewport wash: this draws directly on a
// transparent canvas over the actual site, in the current theme's ink
// colour, so it reads as "a few things fell on the page" rather than
// "the site became The Matrix for a bit."

const TRIGGER = "matrix";
const GLYPHS = "∑∫∂√∞πΔ≠≤≥±×÷∇∈∀∃⊂∪∩→⇒≈θλμσΩαβγδφψζ".split("");
const SYMBOL_COUNT = 12;
const GRAVITY = 1800; // px/s^2
const RESTITUTION = 0.55; // energy kept per bounce
const WALL_RESTITUTION = 0.7;
const SETTLE_VELOCITY = 40; // px/s — below this on floor contact, stop bouncing

interface FallingSymbol {
  glyph: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  delayMs: number;
  fontSize: number;
  settled: boolean;
}

let typedBuffer = "";
let active = false;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function randomGlyph(): string {
  return GLYPHS[(Math.random() * GLYPHS.length) | 0];
}

function playFallingSymbols(): void {
  if (active) return;
  active = true;

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;z-index:99999;pointer-events:none;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  let width = window.innerWidth;
  let height = window.innerHeight;

  function resize(): void {
    width = window.innerWidth;
    height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  let ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#000";
  const fontFamily = getComputedStyle(document.documentElement).getPropertyValue("--cm").trim() || "serif";
  const themeObserver = new MutationObserver(() => {
    ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#000";
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const symbols: FallingSymbol[] = Array.from({ length: SYMBOL_COUNT }, () => ({
    glyph: randomGlyph(),
    x: 40 + Math.random() * Math.max(width - 80, 40),
    y: -40 - Math.random() * 220,
    vx: (Math.random() - 0.5) * 120,
    vy: 0,
    delayMs: Math.random() * 500,
    fontSize: 20 + Math.random() * 14,
    settled: false,
  }));

  let lastTime = performance.now();
  let elapsedMs = 0;
  let rafId = 0;

  function step(dt: number): boolean {
    elapsedMs += dt * 1000;
    let allSettled = true;
    for (const s of symbols) {
      if (elapsedMs < s.delayMs) { allSettled = false; continue; }
      if (s.settled) continue;
      allSettled = false;

      s.vy += GRAVITY * dt;
      s.y += s.vy * dt;
      s.x += s.vx * dt;

      const floor = height - s.fontSize * 0.3;
      if (s.y > floor) {
        s.y = floor;
        if (Math.abs(s.vy) < SETTLE_VELOCITY) {
          s.vy = 0;
          s.vx = 0;
          s.settled = true;
        } else {
          s.vy = -s.vy * RESTITUTION;
          s.vx *= 0.7;
        }
      }

      const margin = s.fontSize * 0.3;
      if (s.x < margin) { s.x = margin; s.vx = Math.abs(s.vx) * WALL_RESTITUTION; }
      if (s.x > width - margin) { s.x = width - margin; s.vx = -Math.abs(s.vx) * WALL_RESTITUTION; }
    }
    return allSettled;
  }

  function draw(): void {
    ctx.clearRect(0, 0, width, height);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ink;
    for (const s of symbols) {
      if (elapsedMs < s.delayMs) continue;
      ctx.font = `${s.fontSize}px ${fontFamily}`;
      ctx.fillText(s.glyph, s.x, s.y);
    }
  }

  function cleanup(): void {
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", resize);
    themeObserver.disconnect();
    canvas.remove();
    active = false;
  }

  function waitForInteractionThenClear(): void {
    const events: (keyof WindowEventMap)[] = ["scroll", "mousemove", "click", "keydown", "touchstart", "wheel"];
    const onInteract = () => {
      events.forEach((ev) => window.removeEventListener(ev, onInteract));
      canvas.style.transition = "opacity 0.35s ease";
      canvas.style.opacity = "0";
      setTimeout(cleanup, 350);
    };
    events.forEach((ev) => window.addEventListener(ev, onInteract, { passive: true }));
  }

  function frame(now: number): void {
    const dt = Math.min((now - lastTime) / 1000, 0.032);
    lastTime = now;
    const allSettled = step(dt);
    draw();
    if (!allSettled) {
      rafId = requestAnimationFrame(frame);
    } else {
      waitForInteractionThenClear();
    }
  }
  rafId = requestAnimationFrame(frame);
}

export function initFallingSymbolsEasterEgg(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (isEditableTarget(e.target)) return;
    if (e.key.length !== 1) return;

    typedBuffer = (typedBuffer + e.key.toLowerCase()).slice(-TRIGGER.length);
    if (typedBuffer === TRIGGER) {
      typedBuffer = "";
      playFallingSymbols();
    }
  });
}

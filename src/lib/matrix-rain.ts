// Easter egg: type "matrix" anywhere on the page (nothing editable
// focused) and the whole site briefly hacks into a Matrix-style digital
// rain — except the falling glyphs are math symbols set in the site's own
// Computer Modern serif, not the usual katakana, since this is a maths/CS
// site, not The Matrix.

const TRIGGER = "matrix";
const RAIN_DURATION_MS = 9000;
const FADE_MS = 700;

const GLYPHS = "∑∫∂√∞πΔ≠≤≥±×÷∇∈∀∃⊂∪∩→⇒≈θλμσΩαβγδφψζ".split("");

let typedBuffer = "";
let rainActive = false;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function randomGlyph(): string {
  return GLYPHS[(Math.random() * GLYPHS.length) | 0];
}

function playMatrixRain(): void {
  if (rainActive) return;
  rainActive = true;

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;z-index:99999;pointer-events:none;opacity:0;transition:opacity 0.5s ease;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  const fontFamily = getComputedStyle(document.documentElement).getPropertyValue("--cm").trim() || "serif";
  const fontSize = 20;
  const colWidth = fontSize;

  let width = window.innerWidth;
  let height = window.innerHeight;
  let columns = 0;
  let drops: number[] = [];

  function resize(): void {
    width = window.innerWidth;
    height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    columns = Math.ceil(width / colWidth);
    drops = Array.from({ length: columns }, () => -Math.floor(Math.random() * 40));
  }
  resize();
  window.addEventListener("resize", resize);

  // Opaque black backdrop so the rain fully takes over the screen, like
  // the site itself "hacked into" matrix mode rather than a translucent
  // overlay sitting on top of normal page content.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  requestAnimationFrame(() => { canvas.style.opacity = "1"; });

  const startTime = performance.now();
  let rafId = 0;

  function frame(now: number): void {
    const elapsed = now - startTime;

    ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
    ctx.fillRect(0, 0, width, height);

    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "top";

    for (let i = 0; i < columns; i++) {
      const x = i * colWidth;
      const y = drops[i] * fontSize;
      if (y >= 0 && y < height) {
        ctx.fillStyle = Math.random() > 0.94 ? "#cfffe0" : "#39ff6a";
        ctx.fillText(randomGlyph(), x, y);
      }
      drops[i]++;
      if (drops[i] * fontSize > height && Math.random() > 0.975) {
        drops[i] = -Math.floor(Math.random() * 20);
      }
    }

    if (elapsed < RAIN_DURATION_MS) {
      rafId = requestAnimationFrame(frame);
      return;
    }

    canvas.style.opacity = "0";
    setTimeout(() => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      canvas.remove();
      rainActive = false;
    }, FADE_MS);
  }
  rafId = requestAnimationFrame(frame);
}

export function initMatrixRainEasterEgg(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (isEditableTarget(e.target)) return;
    if (e.key.length !== 1) return;

    typedBuffer = (typedBuffer + e.key.toLowerCase()).slice(-TRIGGER.length);
    if (typedBuffer === TRIGGER) {
      typedBuffer = "";
      playMatrixRain();
    }
  });
}

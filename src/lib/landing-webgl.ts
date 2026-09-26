// Landing-page backdrop: a field of dots on a slowly rippling surface, seen
// in perspective like a horizon below the hero text. Raw WebGL (no library),
// drawn in the page's own --ink colour so it follows light/dark mode.
//
// The canvas lives inside #app, so the SPA's `app.innerHTML = ""` on route
// change removes it; the render loop notices (canvas.isConnected) and tears
// itself down. No WebGL → the canvas is just removed. Reduced motion → one
// still frame.

const VERT = `
attribute vec2 aGrid;          // (x, z) on the ground plane
uniform mat4 uViewProj;
uniform float uTime;
uniform float uPointScale;     // point size in px at distance 1
uniform float uMaxPoint;
uniform vec3 uFade;            // x half-width, near z, far z
varying float vAlpha;

float height(vec2 p, float t) {
  return 0.32 * sin(p.x * 0.50 + t * 0.55) * cos(p.y * 0.42 - t * 0.35)
       + 0.16 * sin((p.x + p.y) * 0.85 - t * 0.80)
       + 0.05 * sin(length(p - vec2(0.0, 10.0)) * 1.2 - t * 1.10);
}

void main() {
  vec3 world = vec3(aGrid.x, height(aGrid, uTime), aGrid.y);
  vec4 clip = uViewProj * vec4(world, 1.0);
  gl_Position = clip;
  gl_PointSize = clamp(uPointScale / clip.w, 1.0, uMaxPoint);
  float side = 1.0 - smoothstep(uFade.x * 0.45, uFade.x, abs(aGrid.x));
  float near = smoothstep(uFade.y, uFade.y + 1.5, aGrid.y);
  float far  = 1.0 - smoothstep(uFade.z * 0.18, uFade.z * 0.7, aGrid.y);
  vAlpha = side * near * far;
}`;

const FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float soft = 1.0 - smoothstep(0.3, 0.5, d);
  gl_FragColor = vec4(uColor, uOpacity * vAlpha * soft);
}`;

const HALF_WIDTH = 18;
const NEAR_Z = 1;
const FAR_Z = 30;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

function perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function lookAt(eye: number[], target: number[]): Float32Array {
  const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (v: number[]) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = norm(sub(eye, target));
  const x = norm(cross([0, 1, 0], z));
  const y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  return out;
}

/** Resolves any CSS colour (hex, rgb(), named) to 0–1 RGB via a 2D context. */
function cssColorToRgb(color: string): [number, number, number] {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return [0.1, 0.1, 0.1];
  ctx.fillStyle = "#1a1a1a";
  ctx.fillStyle = color.trim() || "#1a1a1a";
  const v = ctx.fillStyle;
  if (v.startsWith("#")) {
    const n = parseInt(v.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const m = v.match(/[\d.]+/g) ?? ["26", "26", "26"];
  return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255];
}

export function mountLandingWebgl(host: HTMLElement): void {
  const canvas = document.createElement("canvas");
  canvas.className = "landing-webgl";
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);

  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
  const vs = gl && compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = gl && compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const program = gl && vs && fs ? gl.createProgram() : null;
  if (!gl || !vs || !fs || !program) {
    canvas.remove();
    return;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    canvas.remove();
    return;
  }
  gl.useProgram(program);

  // Grid of (x, z) points; fewer on small screens.
  const small = window.innerWidth < 700;
  const cols = small ? 80 : 130;
  const rows = small ? 60 : 90;
  const grid = new Float32Array(cols * rows * 2);
  let i = 0;
  for (let r = 0; r < rows; r++) {
    // Rows packed more densely near the camera so spacing looks even on screen.
    const t = r / (rows - 1);
    const z = NEAR_Z + (FAR_Z - NEAR_Z) * t * t;
    for (let c = 0; c < cols; c++) {
      grid[i++] = -HALF_WIDTH + (2 * HALF_WIDTH * c) / (cols - 1);
      grid[i++] = z;
    }
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, grid, gl.STATIC_DRAW);
  const aGrid = gl.getAttribLocation(program, "aGrid");
  gl.enableVertexAttribArray(aGrid);
  gl.vertexAttribPointer(aGrid, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const uViewProj = u("uViewProj");
  const uTime = u("uTime");
  const uPointScale = u("uPointScale");
  const uMaxPoint = u("uMaxPoint");
  const uFade = u("uFade");
  const uColor = u("uColor");
  const uOpacity = u("uOpacity");
  gl.uniform3f(uFade, HALF_WIDTH, NEAR_Z, FAR_Z);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const applyTheme = () => {
    const style = getComputedStyle(document.documentElement);
    gl.uniform3fv(uColor, cssColorToRgb(style.getPropertyValue("--ink")));
    gl.uniform1f(uOpacity, document.documentElement.dataset.theme === "dark" ? 0.7 : 0.55);
  };
  applyTheme();
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform1f(uPointScale, 15 * dpr);
    gl.uniform1f(uMaxPoint, 3.6 * dpr);
  };
  resize();
  window.addEventListener("resize", resize);

  // Pointer parallax, eased so the view drifts rather than snaps.
  let targetX = 0, targetY = 0, mx = 0, my = 0;
  const onPointer = (e: PointerEvent) => {
    targetX = e.clientX / window.innerWidth - 0.5;
    targetY = e.clientY / window.innerHeight - 0.5;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = performance.now();
  let frame = 0;

  const draw = (now: number) => {
    mx += (targetX - mx) * 0.04;
    my += (targetY - my) * 0.04;
    const aspect = canvas.width / Math.max(canvas.height, 1);
    const proj = perspective((45 * Math.PI) / 180, aspect, 0.1, 100);
    const eye = [-mx * 1.2, 1.25 - my * 0.25, 0];
    const view = lookAt(eye, [mx * 2.0, 1.45, 12]);
    gl.uniformMatrix4fv(uViewProj, false, multiply(proj, view));
    gl.uniform1f(uTime, reduceMotion ? 0 : (now - start) / 1000);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, cols * rows);
  };

  const teardown = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onPointer);
    themeObserver.disconnect();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };

  const loop = (now: number) => {
    if (!canvas.isConnected) return teardown();
    draw(now);
    frame = requestAnimationFrame(loop);
  };

  if (reduceMotion) {
    draw(start);
    // Still redraw on resize/theme change; tear down with the page.
    const redraw = () => (canvas.isConnected ? draw(start) : teardown());
    window.addEventListener("resize", redraw);
    themeObserver.disconnect();
    new MutationObserver(() => {
      applyTheme();
      redraw();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  } else {
    frame = requestAnimationFrame(loop);
  }
  requestAnimationFrame(() => canvas.classList.add("is-visible"));
}

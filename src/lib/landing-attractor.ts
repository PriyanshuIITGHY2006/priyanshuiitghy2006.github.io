// Landing-page background: up to ~262k particles simulated on the GPU every
// frame (three.js GPUComputationRenderer). They open by streaming out of
// noise into a calligraphic "pd" monogram, then dissolve into four strange attractors
// (Lorenz, Aizawa, Thomas, Halvorsen, integrated with RK4) and come back to
// the monogram, continuously: at each change every particle flies straight
// from the old shape onto its own point of the new one (attractors are then
// released into their flow), so the screen is never empty. It sits full-screen
// behind the hero text, deliberately faint. Moving the cursor over the
// particles pushes them aside; they flow back once it moves on (no clicks).
//
// Monochrome by design: the page's --ink on --bg. Light mode draws with
// normal blending; dark mode adds light (additive) plus a soft bloom.
//
// Lives inside #app, so a route change removes the canvas; the render loop
// notices and disposes everything. If WebGL2 / float render targets aren't
// available, the caller falls back to the lightweight dot terrain.

import * as THREE from "three";
import { GPUComputationRenderer, type Variable } from "three/addons/misc/GPUComputationRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import monogramFontUrl from "@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff2?url";

interface Attractor {
  /** Attractor-space centre, scale into display space, y/z swap, step, speed normaliser. */
  center: [number, number, number];
  scale: number;
  swap: boolean;
  dt: number;
  speed: number;
}

// Centres/scales measured by integrating each system (RK4) and taking the
// bounding box of the settled trajectory (rounder shapes scaled down to fit
// the same space); speed = ~p90 of |dx/dt|; start = a point in the
// attractor's basin. Kinds 0-3 in the shader.
const ATTRACTORS: (Attractor & { start: [number, number, number] })[] = [
  { center: [0, 0, 24.6], scale: 0.0615, swap: true, dt: 0.0035, speed: 180, start: [1, 1, 20] }, // Lorenz
  { center: [0, 0, 0.74], scale: 0.8, swap: true, dt: 0.009, speed: 5, start: [0.1, 0, 0] }, // Aizawa
  { center: [0, 0, 0], scale: 0.34, swap: false, dt: 0.06, speed: 1.2, start: [0.1, 0.2, 0.3] }, // Thomas
  { center: [-2.9, -2.9, -2.9], scale: 0.12, swap: false, dt: 0.0035, speed: 80, start: [-1.48, -1.51, 2.04] }, // Halvorsen
];
const MONOGRAM = 4; // shader kind for the "P.D." stage
const STAGES = [MONOGRAM, 0, 1, 2, 3]; // cycle order
// Stage lengths, including the morph in. At each change the pull toward the
// new shape ramps up over PULL_MS; an attractor then hands its particles
// from the spring over to its own flow between GUIDE_MS[0] and GUIDE_MS[1].
const HOLD_MS = { monogram: 8000, attractor: 11000 };
const PULL_MS = 900;
const GUIDE_MS = [1500, 2600];
const INTRO_FADE_MS = 1800;
const SEED_SIZE = 256; // attractor morph targets: SEED_SIZE² points each

const SIM_SHADER = /* glsl */ `
uniform float uTime;
uniform int uKind;
uniform float uDt;
uniform vec3 uCenter;
uniform float uScale;
uniform float uSwap;
uniform float uSpeedNorm;
uniform float uRespawn;
uniform sampler2D uTargets;
uniform float uTargetScale;
uniform float uPull;
uniform float uGuide;
uniform float uJitter;
uniform vec3 uRayOrigin;
uniform vec3 uRayDir;
uniform float uMouse;
uniform float uMouseRadius;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec3 field(vec3 p) {
  if (uKind == 0) {
    return vec3(10.0 * (p.y - p.x), p.x * (28.0 - p.z) - p.y, p.x * p.y - (8.0 / 3.0) * p.z);
  } else if (uKind == 1) {
    float a = 0.95, b = 0.7, c = 0.6, d = 3.5, e = 0.25, f = 0.1;
    return vec3((p.z - b) * p.x - d * p.y,
                d * p.x + (p.z - b) * p.y,
                c + a * p.z - p.z * p.z * p.z / 3.0 - (p.x * p.x + p.y * p.y) * (1.0 + e * p.z) + f * p.z * p.x * p.x * p.x);
  } else if (uKind == 2) {
    float b = 0.208186;
    return vec3(sin(p.y) - b * p.x, sin(p.z) - b * p.y, sin(p.x) - b * p.z);
  }
  float a = 1.89;
  return vec3(-a * p.x - 4.0 * p.y - 4.0 * p.z - p.y * p.y,
              -a * p.y - 4.0 * p.z - 4.0 * p.x - p.z * p.z,
              -a * p.z - 4.0 * p.x - 4.0 * p.y - p.x * p.x);
}

// Cursor: push the particle away from the ray under the pointer, strongest
// at the ray and fading to nothing at uMouseRadius.
vec3 repel(vec3 p) {
  if (uMouse <= 0.0) return p;
  vec3 rel = p - uRayOrigin;
  vec3 closest = uRayOrigin + uRayDir * dot(rel, uRayDir);
  vec3 away = p - closest;
  float dist = length(away);
  float f = uMouse * (1.0 - smoothstep(0.0, uMouseRadius, dist));
  return p + (away / max(dist, 1e-4)) * f * 0.07;
}

vec3 swapYZ(vec3 v) { return uSwap > 0.5 ? v.xzy : v; }
vec3 toAttractor(vec3 d) { return swapYZ(d) / uScale + uCenter; }
vec3 toDisplay(vec3 a) { return swapYZ((a - uCenter) * uScale); }

vec3 rk4(vec3 p, float h) {
  vec3 k1 = field(p);
  vec3 k2 = field(p + 0.5 * h * k1);
  vec3 k3 = field(p + 0.5 * h * k2);
  vec3 k4 = field(p + h * k3);
  return p + h / 6.0 * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 cur = texture2D(texturePosition, uv);

  // Morph: each particle springs toward its own point on the current shape
  // (a glyph point, or a point sampled from the attractor), curving on a
  // swirl that dies out as it arrives. The pull ramps up at every stage
  // change, so one shape flows straight into the next.
  vec3 target = texture2D(uTargets, uv).xyz * uTargetScale
              + (vec3(hash(uv + 0.11), hash(uv + 0.23), hash(uv + 0.37)) - 0.5) * uJitter;
  vec3 delta = target - cur.xyz;
  float dist = length(delta);
  vec3 swirl = vec3(sin(cur.y * 2.3 + uTime), sin(cur.z * 2.1 + uTime * 1.3), sin(cur.x * 1.9 + uTime * 0.7));
  vec3 guided = cur.xyz + delta * (0.045 * (0.1 + 0.9 * uPull)) + swirl * min(dist, 0.5) * 0.02;
  float guidedW = 0.3 + clamp(dist * 1.5, 0.0, 0.7);

  // Monogram: stay on the glyphs, with a faint shimmer so they stay alive.
  if (uKind == ${MONOGRAM}) {
    vec3 shimmer = vec3(sin(target.y * 6.0 + uTime * 1.7),
                        sin(target.x * 5.0 + uTime * 1.3 + 1.7),
                        sin(target.x * 4.0 + target.y * 3.0 + uTime * 1.1)) * 0.0009;
    gl_FragColor = vec4(repel(guided + shimmer), guidedW);
    return;
  }
  if (uGuide >= 1.0) {
    gl_FragColor = vec4(repel(guided), guidedW);
    return;
  }

  vec3 a = toAttractor(cur.xyz);
  a = rk4(a, uDt);
  a = rk4(a, uDt);
  vec3 d = toDisplay(a);
  float speed = clamp(length(field(a)) / uSpeedNorm, 0.0, 1.0);
  bool bad = !(length(d) < 4.0);

  // Handing over from the spring to the flow (nothing respawns yet).
  if (uGuide > 0.0) {
    d = bad ? guided : mix(d, guided, uGuide);
    speed = bad ? guidedW : mix(speed, guidedW, uGuide);
    gl_FragColor = vec4(repel(d), speed);
    return;
  }

  // Escaped / NaN, stalled on a fixed point (e.g. pushed out of the basin
  // by the cursor), or picked at random this frame: respawn on top of
  // another (random) particle plus a tiny offset. Re-seeding from particles
  // already on the attractor keeps the shape crisp (no stray haze) while the
  // copies drift apart along the flow and keep the density even.
  if (bad || speed < 0.004 || hash(uv + fract(uTime * 0.137)) < uRespawn) {
    vec2 other = vec2(hash(uv * 1.3 + uTime), hash(uv * 2.7 - uTime));
    vec3 src = texture2D(texturePosition, other).xyz;
    vec3 jitter = (vec3(hash(uv + 0.31), hash(uv + 0.57), hash(uv + 0.83)) - 0.5) * 0.02;
    d = (length(src) < 4.0 ? src : vec3(0.0)) + jitter;
    speed = 0.0;
  }
  gl_FragColor = vec4(repel(d), speed);
}
`;

const POINT_VERT = /* glsl */ `
uniform sampler2D uPositions;
uniform float uSize;
attribute vec2 ref;
varying float vSpeed;
void main() {
  vec4 p = texture2D(uPositions, ref);
  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize / -mv.z;
  vSpeed = p.w;
}
`;

const POINT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uFade;
varying float vSpeed;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float soft = 1.0 - smoothstep(0.1, 0.5, d);
  float a = uAlpha * uFade * soft * (0.35 + 0.65 * vSpeed);
  gl_FragColor = vec4(uColor, a);
}
`;

function cssColor(name: string, fallback: string): THREE.Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  try {
    return new THREE.Color(v || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

/** A cubic Bézier stroked in short segments whose width tapers w0 → w1. */
function taperedCurve(
  ctx: CanvasRenderingContext2D,
  p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number],
  w0: number, w1: number,
): void {
  const N = 90;
  let prev = p0;
  for (let i = 1; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    ctx.lineWidth = w0 + (w1 - w0) * t;
    ctx.beginPath();
    ctx.moveTo(prev[0], prev[1]);
    ctx.lineTo(x, y);
    ctx.stroke();
    prev = [x, y];
  }
}

/**
 * Draws the "pd" monogram: lowercase "pd" in Great Vibes (SIL OFL) with two
 * swashes of our own — a hairline wave leading into the p from the left and
 * a long sweep out of the d's foot that curls up at the tip. 1400×520 canvas.
 */
function drawMonogram(ctx: CanvasRenderingContext2D, family: string): void {
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineCap = "round";
  ctx.font = `400 360px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("pd", 700, 330);
  taperedCurve(ctx, [250, 262], [340, 200], [430, 300], [598, 232], 2, 9);
  taperedCurve(ctx, [812, 318], [900, 300], [1000, 250], [1080, 262], 9, 6);
  taperedCurve(ctx, [1080, 262], [1140, 270], [1180, 250], [1170, 222], 6, 2);
}

/**
 * Samples the monogram into one target point per particle, in units where
 * the mark is 1 wide and centred on the origin (z = a thin slab for depth).
 */
function sampleMonogram(family: string, count: number, out: Float32Array): void {
  const W = 1400, H = 520;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  drawMonogram(ctx, family);
  const px = ctx.getImageData(0, 0, W, H).data;

  const filled: number[] = [];
  let minX = W, maxX = 0, minY = H, maxY = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (px[(y * W + x) * 4 + 3] > 128) {
        filled.push(x, y);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  const n = filled.length / 2;
  const width = Math.max(1, maxX - minX);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  for (let i = 0; i < count; i++) {
    const k = n ? Math.floor(Math.random() * n) : 0;
    const x = n ? filled[k * 2] + Math.random() : cx;
    const y = n ? filled[k * 2 + 1] + Math.random() : cy;
    out[i * 4] = (x - cx) / width;
    out[i * 4 + 1] = -(y - cy) / width;
    out[i * 4 + 2] = (Math.random() - 0.5) * 0.015;
    out[i * 4 + 3] = 1;
  }
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** The attractor vector fields — the same systems and constants as field() in the shader. */
function attractorField(kind: number, x: number, y: number, z: number, out: number[]): void {
  if (kind === 0) {
    out[0] = 10 * (y - x);
    out[1] = x * (28 - z) - y;
    out[2] = x * y - (8 / 3) * z;
  } else if (kind === 1) {
    const a = 0.95, b = 0.7, c = 0.6, d = 3.5, e = 0.25, f = 0.1;
    out[0] = (z - b) * x - d * y;
    out[1] = d * x + (z - b) * y;
    out[2] = c + a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + e * z) + f * z * x * x * x;
  } else if (kind === 2) {
    const b = 0.208186;
    out[0] = Math.sin(y) - b * x;
    out[1] = Math.sin(z) - b * y;
    out[2] = Math.sin(x) - b * z;
  } else {
    const a = 1.89;
    out[0] = -a * x - 4 * y - 4 * z - y * y;
    out[1] = -a * y - 4 * z - 4 * x - z * z;
    out[2] = -a * z - 4 * x - 4 * y - x * x;
  }
}

/**
 * Morph targets for an attractor, in display space: one long RK4 trajectory
 * (after a transient) sampled every few steps, so the points follow the
 * attractor's own density. Particles fly onto these and are then released
 * into the flow, which also means they always start inside its basin.
 */
function sampleAttractor(kind: number, count: number): Float32Array {
  const { center, scale, swap, dt, start } = ATTRACTORS[kind];
  const out = new Float32Array(count * 4);
  const p = [...start];
  const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0];
  const step = () => {
    attractorField(kind, p[0], p[1], p[2], k1);
    attractorField(kind, p[0] + 0.5 * dt * k1[0], p[1] + 0.5 * dt * k1[1], p[2] + 0.5 * dt * k1[2], k2);
    attractorField(kind, p[0] + 0.5 * dt * k2[0], p[1] + 0.5 * dt * k2[1], p[2] + 0.5 * dt * k2[2], k3);
    attractorField(kind, p[0] + dt * k3[0], p[1] + dt * k3[1], p[2] + dt * k3[2], k4);
    for (let j = 0; j < 3; j++) p[j] += (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
  };
  for (let i = 0; i < 4000; i++) step();
  for (let i = 0; i < count; i++) {
    for (let s = 0; s < 4; s++) step();
    const x = (p[0] - center[0]) * scale, y = (p[1] - center[1]) * scale, z = (p[2] - center[2]) * scale;
    out[i * 4] = x;
    out[i * 4 + 1] = swap ? z : y;
    out[i * 4 + 2] = swap ? y : z;
    out[i * 4 + 3] = 1;
  }
  return out;
}

/** Mounts the particle background. Returns false if the GPU can't run it. */
export function mountLandingAttractor(host: HTMLElement): boolean {
  const canvas = document.createElement("canvas");
  canvas.className = "landing-attractor";
  canvas.setAttribute("aria-hidden", "true");

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  } catch {
    return false;
  }
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    return false;
  }

  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const SIZE = small ? 256 : 512; // particles = SIZE²
  const COUNT = SIZE * SIZE;
  const gpu = new GPUComputationRenderer(SIZE, SIZE, renderer);
  if (/iP(hone|ad|od)/.test(navigator.userAgent)) gpu.setDataType(THREE.HalfFloatType);

  const initial = gpu.createTexture();
  const data = initial.image.data as Float32Array;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (Math.random() - 0.5) * 7;
    data[i + 1] = (Math.random() - 0.5) * 4.4;
    data[i + 2] = (Math.random() - 0.5) * 3.5;
    data[i + 3] = 0;
  }
  const posVar: Variable = gpu.addVariable("texturePosition", SIM_SHADER, initial);
  gpu.setVariableDependencies(posVar, [posVar]);

  // Monogram targets: one point on the drawn strokes per particle. Sampled
  // with a fallback script face first, then again once the bundled Great
  // Vibes has loaded (it's same-origin and small, so normally near-instant;
  // the particles just re-flow).
  const targetData = new Float32Array(COUNT * 4);
  const targets = new THREE.DataTexture(targetData, SIZE, SIZE, THREE.RGBAFormat, THREE.FloatType);
  sampleMonogram(`"Brush Script MT", cursive`, COUNT, targetData);
  targets.needsUpdate = true;
  const face = new FontFace("PD Monogram", `url(${monogramFontUrl})`);
  const fontReady = face.load().then((loaded) => {
    document.fonts.add(loaded);
    sampleMonogram(`"PD Monogram"`, COUNT, targetData);
    targets.needsUpdate = true;
  });
  fontReady.catch(() => {
    // Keep the fallback face.
  });

  const simU = posVar.material.uniforms;
  simU.uTime = { value: 0 };
  simU.uKind = { value: MONOGRAM };
  simU.uDt = { value: 0 };
  simU.uCenter = { value: new THREE.Vector3() };
  simU.uScale = { value: 1 };
  simU.uSwap = { value: 0 };
  simU.uSpeedNorm = { value: 1 };
  simU.uRespawn = { value: 0.002 };
  simU.uTargets = { value: targets };
  simU.uTargetScale = { value: 4 };
  simU.uPull = { value: 0 };
  simU.uGuide = { value: 1 };
  simU.uJitter = { value: 0 };
  simU.uRayOrigin = { value: new THREE.Vector3() };
  simU.uRayDir = { value: new THREE.Vector3(0, 0, -1) };
  simU.uMouse = { value: 0 };
  simU.uMouseRadius = { value: 0.45 };
  if (gpu.init() !== null) {
    renderer.dispose();
    targets.dispose();
    return false;
  }

  host.prepend(canvas);

  // Scene: one Points object whose vertices look up their position texel.
  const refs = new Float32Array(COUNT * 2);
  for (let y = 0, i = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      refs[i++] = (x + 0.5) / SIZE;
      refs[i++] = (y + 0.5) / SIZE;
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  geometry.setAttribute("ref", new THREE.BufferAttribute(refs, 2));
  const material = new THREE.ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    uniforms: {
      uPositions: { value: null },
      uSize: { value: 1 },
      uColor: { value: new THREE.Color() },
      uAlpha: { value: 0.1 },
      uFade: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(points);

  const CAM_DIST = 8.4;
  const HALF_FOV_TAN = Math.tan((32 / 2) * (Math.PI / 180));
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.4, 0.1);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Faint on purpose: this sits behind the hero text.
  const applyTheme = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    scene.background = cssColor("--bg", dark ? "#0c0c0e" : "#ffffff");
    material.uniforms.uColor.value = cssColor("--ink", dark ? "#eeeeee" : "#111111");
    material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true;
    const perPoint = SIZE === 512 ? 1 : 1.6; // fewer particles → each a bit stronger
    material.uniforms.uAlpha.value = (dark ? 0.055 : 0.1) * perPoint;
    bloom.enabled = dark && !small;
  };

  let stage = 0;
  let monogramScale = 1;
  let disposed = false;
  const layout = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 2 : 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    material.uniforms.uSize.value = (small ? 9 : 7) * dpr;
    // Monogram spans ~60% of the visible width, capped by the visible
    // height so it never overflows, measured at the camera's distance.
    const visibleHeight = 2 * CAM_DIST * HALF_FOV_TAN;
    const visibleWidth = visibleHeight * camera.aspect;
    monogramScale = Math.min(visibleWidth * 0.6, visibleHeight * 1.05);
    if (STAGES[stage] === MONOGRAM) simU.uTargetScale.value = monogramScale;
    applyTheme();
  };

  // Attractor morph targets, built on first use and cached; the next
  // stage's set is prepared while the browser is idle, ahead of time.
  const seeds: THREE.DataTexture[] = [];
  const seedsFor = (kind: number) => {
    if (!seeds[kind]) {
      const n = Math.min(SEED_SIZE, SIZE);
      seeds[kind] = new THREE.DataTexture(sampleAttractor(kind, n * n), n, n, THREE.RGBAFormat, THREE.FloatType);
      seeds[kind].needsUpdate = true;
    }
    return seeds[kind];
  };
  const whenIdle = (fn: () => void) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout: 4000 });
    else setTimeout(fn, 1500);
  };

  const select = (i: number) => {
    stage = (i + STAGES.length) % STAGES.length;
    const kind = STAGES[stage];
    simU.uKind.value = kind;
    const nextKind = STAGES[(stage + 1) % STAGES.length];
    if (nextKind !== MONOGRAM) whenIdle(() => void (disposed || seedsFor(nextKind)));
    if (kind === MONOGRAM) {
      simU.uTargets.value = targets;
      simU.uTargetScale.value = monogramScale;
      simU.uJitter.value = 0;
      return;
    }
    simU.uTargets.value = seedsFor(kind);
    simU.uTargetScale.value = 1;
    simU.uJitter.value = SIZE > SEED_SIZE ? 0.012 : 0;
    const a = ATTRACTORS[kind];
    simU.uDt.value = a.dt;
    simU.uCenter.value.set(...a.center);
    simU.uScale.value = a.scale;
    simU.uSwap.value = a.swap ? 1 : 0;
    simU.uSpeedNorm.value = a.speed;
  };
  select(0);
  layout();
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("resize", layout);

  // Cursor: its ray through the scene pushes particles aside (see repel()
  // in the shader). The view also leans slightly toward the pointer.
  // Hover only — no click or drag handlers, and the canvas ignores pointer
  // events so the page underneath works as normal.
  let yaw = 0, pitch = 0;
  let px = 0, py = 0, smx = 0, smy = 0;
  let mouseTarget = 0;
  const pointerNdc = new THREE.Vector2(10, 10);
  const raycaster = new THREE.Raycaster();
  let stageStart = performance.now();
  const onMove = (e: PointerEvent) => {
    px = e.clientX / window.innerWidth - 0.5;
    py = e.clientY / window.innerHeight - 0.5;
    pointerNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    mouseTarget = e.pointerType === "touch" ? 0.7 : 1;
  };
  const onLeave = () => {
    mouseTarget = 0;
  };
  window.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  window.addEventListener("blur", onLeave);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const step = (time: number) => {
    simU.uTime.value = time;
    gpu.compute();
  };
  const updateCamera = () => {
    smx += (px - smx) * 0.03;
    smy += (py - smy) * 0.03;
    const y = yaw + smx * 0.22;
    const p = pitch + smy * 0.14;
    camera.position.set(CAM_DIST * Math.cos(p) * Math.sin(y), CAM_DIST * Math.sin(p), CAM_DIST * Math.cos(p) * Math.cos(y));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointerNdc, camera);
    simU.uRayOrigin.value.copy(raycaster.ray.origin);
    simU.uRayDir.value.copy(raycaster.ray.direction);
    simU.uMouse.value += (mouseTarget - simU.uMouse.value) * 0.08;
  };
  const render = () => {
    material.uniforms.uPositions.value = gpu.getCurrentRenderTarget(posVar).texture;
    if (bloom.enabled) composer.render();
    else renderer.render(scene, camera);
  };

  let frame = 0;
  const teardown = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", layout);
    window.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("blur", onLeave);
    themeObserver.disconnect();
    gpu.dispose();
    targets.dispose();
    for (const t of seeds) t?.dispose();
    geometry.dispose();
    material.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  if (reduceMotion) {
    // One settled still frame of the monogram; no motion, no cursor effect.
    material.uniforms.uFade.value = 1;
    simU.uPull.value = 1;
    const settle = () => {
      if (!canvas.isConnected) return teardown();
      for (let i = 0; i < 300; i++) step(i * 0.016);
      updateCamera();
      render();
    };
    settle();
    void fontReady.then(settle, () => undefined);
    window.addEventListener("resize", () => (canvas.isConnected ? render() : teardown()));
    new MutationObserver(() => (canvas.isConnected ? render() : teardown())).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  } else {
    const start = performance.now();
    const loop = (now: number) => {
      if (!canvas.isConnected) return teardown();
      const t = (now - start) / 1000;
      const onMonogram = STAGES[stage] === MONOGRAM;
      if (onMonogram) {
        // Face the letters: ease back to the front view with a slow sway.
        const turns = Math.round(yaw / (2 * Math.PI)) * 2 * Math.PI;
        yaw += (turns + Math.sin(t * 0.4) * 0.16 - yaw) * 0.04;
        pitch += (Math.sin(t * 0.3) * 0.05 - pitch) * 0.04;
      } else {
        yaw += 0.0012;
        pitch += (0.12 - pitch) * 0.01;
      }
      // Hold, then switch: the new shape starts pulling the particles in
      // right away (no gap); attractors then take over with their flow.
      let e = now - stageStart;
      if (e >= (onMonogram ? HOLD_MS.monogram : HOLD_MS.attractor)) {
        select(stage + 1);
        stageStart = now;
        e = 0;
      }
      simU.uPull.value = smooth(e / PULL_MS);
      simU.uGuide.value = STAGES[stage] === MONOGRAM ? 1 : 1 - smooth((e - GUIDE_MS[0]) / (GUIDE_MS[1] - GUIDE_MS[0]));
      material.uniforms.uFade.value = smooth((now - start) / INTRO_FADE_MS);
      updateCamera();
      step(t);
      render();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
  }
  requestAnimationFrame(() => canvas.classList.add("is-visible"));
  return true;
}

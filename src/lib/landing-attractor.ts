// Landing-page background: up to ~262k particles simulated on the GPU every
// frame (three.js GPUComputationRenderer). They open by streaming out of
// noise into a hand-drawn "PD" monogram, then dissolve into four strange attractors
// (Lorenz, Aizawa, Thomas, Halvorsen, integrated with RK4) and come back to
// the monogram. It sits full-screen behind the hero text, deliberately faint.
// Click an empty area to skip ahead; drag to rotate.
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
// the same space); speed = ~p90 of |dx/dt|. Kinds 0-3 in the shader.
const ATTRACTORS: Attractor[] = [
  { center: [0, 0, 24.6], scale: 0.0615, swap: true, dt: 0.0035, speed: 180 }, // Lorenz
  { center: [0, 0, 0.74], scale: 0.8, swap: true, dt: 0.009, speed: 5 }, // Aizawa
  { center: [0, 0, 0], scale: 0.34, swap: false, dt: 0.06, speed: 1.2 }, // Thomas
  { center: [-2.9, -2.9, -2.9], scale: 0.12, swap: false, dt: 0.0035, speed: 80 }, // Halvorsen
];
const MONOGRAM = 4; // shader kind for the "P.D." stage
const STAGES = [MONOGRAM, 0, 1, 2, 3]; // cycle order
const HOLD_MS = { monogram: 12000, attractor: 16000 };

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

  // Monogram: each particle springs toward its own point on the glyphs,
  // with a faint shimmer so the letters stay alive.
  if (uKind == ${MONOGRAM}) {
    vec3 target = texture2D(uTargets, uv).xyz * uTargetScale;
    vec3 delta = target - cur.xyz;
    vec3 shimmer = vec3(sin(target.y * 6.0 + uTime * 1.7),
                        sin(target.x * 5.0 + uTime * 1.3 + 1.7),
                        sin(target.x * 4.0 + target.y * 3.0 + uTime * 1.1)) * 0.0009;
    gl_FragColor = vec4(cur.xyz + delta * 0.06 + shimmer, 0.3 + clamp(length(delta) * 1.5, 0.0, 0.7));
    return;
  }

  vec3 a = toAttractor(cur.xyz);
  a = rk4(a, uDt);
  a = rk4(a, uDt);
  vec3 d = toDisplay(a);
  float speed = clamp(length(field(a)) / uSpeedNorm, 0.0, 1.0);

  // Escaped / NaN, or picked at random this frame: respawn on top of
  // another (random) particle plus a tiny offset. Re-seeding from particles
  // already on the attractor keeps the shape crisp (no stray haze) while the
  // copies drift apart along the flow and keep the density even.
  bool bad = !(length(d) < 4.0);
  if (bad || hash(uv + fract(uTime * 0.137)) < uRespawn) {
    vec2 other = vec2(hash(uv * 1.3 + uTime), hash(uv * 2.7 - uTime));
    vec3 src = texture2D(texturePosition, other).xyz;
    vec3 jitter = (vec3(hash(uv + 0.31), hash(uv + 0.57), hash(uv + 0.83)) - 0.5) * 0.02;
    d = (length(src) < 4.0 ? src : vec3(0.0)) + jitter;
    speed = 0.0;
  }
  gl_FragColor = vec4(d, speed);
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
varying float vSpeed;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float soft = 1.0 - smoothstep(0.1, 0.5, d);
  float a = uAlpha * soft * (0.35 + 0.65 * vSpeed);
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

/**
 * Draws the "PD" monogram: an original hand-drawn mark, monoline with round
 * caps. The P's bowl enters with a lead-in stroke from the left of its stem;
 * the D's stem starts inside the P's bowl. Coordinates on a 1400×520 canvas.
 */
function drawMonogram(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 32;
  ctx.strokeStyle = "#000";
  ctx.translate(700, 260);
  ctx.transform(1, 0, -0.08, 1, 0, 0); // slight hand slant
  ctx.translate(-700, -260);
  const stroke = (path: () => void) => {
    ctx.beginPath();
    path();
    ctx.stroke();
  };
  // P stem
  stroke(() => {
    ctx.moveTo(512, 452);
    ctx.bezierCurveTo(508, 360, 514, 220, 524, 118);
  });
  // P bowl, entering from the left of the stem
  stroke(() => {
    ctx.moveTo(430, 152);
    ctx.bezierCurveTo(520, 92, 660, 84, 706, 132);
    ctx.bezierCurveTo(748, 176, 700, 250, 600, 262);
    ctx.bezierCurveTo(572, 265, 545, 262, 524, 256);
  });
  // D stem, starting inside the P's bowl
  stroke(() => {
    ctx.moveTo(662, 180);
    ctx.bezierCurveTo(660, 280, 664, 380, 672, 446);
  });
  // D bowl: from the top of its stem, round and back to its foot
  stroke(() => {
    ctx.moveTo(640, 150);
    ctx.bezierCurveTo(760, 64, 948, 110, 962, 262);
    ctx.bezierCurveTo(976, 410, 820, 470, 688, 446);
  });
}

/**
 * Samples the monogram into one target point per particle, in units where
 * the mark is 1 wide and centred on the origin (z = a thin slab for depth).
 */
function sampleMonogram(count: number, out: Float32Array): void {
  const W = 1400, H = 520;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  drawMonogram(ctx);
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
    data[i] = (Math.random() - 0.5) * 6;
    data[i + 1] = (Math.random() - 0.5) * 3.6;
    data[i + 2] = (Math.random() - 0.5) * 3;
    data[i + 3] = 0;
  }
  const posVar: Variable = gpu.addVariable("texturePosition", SIM_SHADER, initial);
  gpu.setVariableDependencies(posVar, [posVar]);

  // Monogram targets: one point on the drawn strokes per particle.
  const targetData = new Float32Array(COUNT * 4);
  const targets = new THREE.DataTexture(targetData, SIZE, SIZE, THREE.RGBAFormat, THREE.FloatType);
  sampleMonogram(COUNT, targetData);
  targets.needsUpdate = true;

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
    simU.uTargetScale.value = Math.min(visibleWidth * 0.6, visibleHeight * 1.05);
    applyTheme();
  };

  let stage = 0;
  const select = (i: number) => {
    stage = (i + STAGES.length) % STAGES.length;
    const kind = STAGES[stage];
    simU.uKind.value = kind;
    if (kind === MONOGRAM) return;
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

  // Interaction on the empty background: drag rotates (with inertia), a
  // click skips to the next stage; the view also leans toward the pointer.
  let yaw = 0, pitch = 0, yawVel = 0, pitchVel = 0;
  let px = 0, py = 0, smx = 0, smy = 0;
  let dragging = false, moved = 0, lastX = 0, lastY = 0;
  let stageStart = performance.now();
  const onDown = (e: PointerEvent) => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("is-dragging");
  };
  const onMove = (e: PointerEvent) => {
    px = e.clientX / window.innerWidth - 0.5;
    py = e.clientY / window.innerHeight - 0.5;
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    yawVel = dx * 0.005;
    pitchVel = dy * 0.004;
    yaw += yawVel;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + pitchVel));
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove("is-dragging");
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (moved < 6) {
      select(stage + 1);
      stageStart = performance.now();
    }
  };
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const step = (time: number) => {
    simU.uTime.value = time;
    gpu.compute();
  };
  const render = () => {
    smx += (px - smx) * 0.03;
    smy += (py - smy) * 0.03;
    const y = yaw + smx * 0.3;
    const p = pitch + smy * 0.18;
    camera.position.set(CAM_DIST * Math.cos(p) * Math.sin(y), CAM_DIST * Math.sin(p), CAM_DIST * Math.cos(p) * Math.cos(y));
    camera.lookAt(0, 0, 0);
    material.uniforms.uPositions.value = gpu.getCurrentRenderTarget(posVar).texture;
    if (bloom.enabled) composer.render();
    else renderer.render(scene, camera);
  };

  let frame = 0;
  let disposed = false;
  const teardown = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", layout);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    themeObserver.disconnect();
    gpu.dispose();
    targets.dispose();
    geometry.dispose();
    material.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  if (reduceMotion) {
    // One settled still frame of the monogram; a click re-settles the next stage.
    const settle = () => {
      if (!canvas.isConnected) return teardown();
      for (let i = 0; i < 300; i++) step(i * 0.016);
      render();
    };
    settle();
    canvas.addEventListener("pointerup", settle);
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
      if (!dragging) {
        if (onMonogram) {
          // Face the letters: ease back to the front view with a slow sway.
          const turns = Math.round(yaw / (2 * Math.PI)) * 2 * Math.PI;
          yaw += (turns + Math.sin(t * 0.4) * 0.18 - yaw) * 0.04;
          pitch += (Math.sin(t * 0.3) * 0.06 - pitch) * 0.04;
        } else {
          yaw += 0.0012 + yawVel;
        }
        yawVel *= 0.95;
        pitchVel *= 0.9;
      }
      if (now - stageStart > (onMonogram ? HOLD_MS.monogram : HOLD_MS.attractor)) {
        select(stage + 1);
        stageStart = now;
      }
      step(t);
      render();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
  }
  requestAnimationFrame(() => canvas.classList.add("is-visible"));
  return true;
}

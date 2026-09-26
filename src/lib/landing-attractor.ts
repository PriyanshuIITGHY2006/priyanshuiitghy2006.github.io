// Landing-page hero: a strange attractor made of up to ~262k particles,
// integrated on the GPU every frame (three.js GPUComputationRenderer, RK4).
// Particles start as noise and fall into the attractor; clicking switches
// to the next system and they flow into the new shape. Drag rotates.
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
import katex from "katex";
import "katex/dist/katex.min.css";

interface Attractor {
  name: string;
  tex: string;
  /** Attractor-space centre, scale into display space, y/z swap, step, speed normaliser. */
  center: [number, number, number];
  scale: number;
  swap: boolean;
  dt: number;
  speed: number;
}

// Centres/scales measured by integrating each system (RK4) and taking the
// bounding box of the settled trajectory (rounder shapes scaled down to fit
// the same space); speed = ~p90 of |dx/dt|.
const ATTRACTORS: Attractor[] = [
  {
    name: "Lorenz",
    tex: String.raw`\begin{aligned}\dot x&=\sigma(y-x)\\ \dot y&=x(\rho-z)-y\\ \dot z&=xy-\beta z\end{aligned}`,
    center: [0, 0, 24.6],
    scale: 0.0615,
    swap: true,
    dt: 0.0035,
    speed: 180,
  },
  {
    name: "Aizawa",
    tex: String.raw`\begin{aligned}\dot x&=(z-b)x-dy\\ \dot y&=dx+(z-b)y\\ \dot z&=c+az-\tfrac{z^3}{3}-(x^2+y^2)(1+ez)+fzx^3\end{aligned}`,
    center: [0, 0, 0.74],
    scale: 0.8,
    swap: true,
    dt: 0.009,
    speed: 5,
  },
  {
    name: "Thomas",
    tex: String.raw`\begin{aligned}\dot x&=\sin y-bx\\ \dot y&=\sin z-by\\ \dot z&=\sin x-bz\end{aligned}`,
    center: [0, 0, 0],
    scale: 0.34,
    swap: false,
    dt: 0.06,
    speed: 1.2,
  },
  {
    name: "Halvorsen",
    tex: String.raw`\begin{aligned}\dot x&=-ax-4y-4z-y^2\\ \dot y&=-ay-4z-4x-z^2\\ \dot z&=-az-4x-4y-x^2\end{aligned}`,
    center: [-2.9, -2.9, -2.9],
    scale: 0.12,
    swap: false,
    dt: 0.0035,
    speed: 80,
  },
];

const SIM_SHADER = /* glsl */ `
uniform float uTime;
uniform int uKind;
uniform float uDt;
uniform vec3 uCenter;
uniform float uScale;
uniform float uSwap;
uniform float uSpeedNorm;
uniform float uRespawn;

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

function captionHtml(a: Attractor, index: number): string {
  const eq = katex.renderToString(a.tex, { displayMode: true, throwOnError: false });
  return `
    <p class="attractor-name">${a.name} attractor <span>${index + 1}/${ATTRACTORS.length}</span></p>
    <div class="attractor-eq">${eq}</div>
    <p class="attractor-actions">
      <button type="button" class="attractor-next">next attractor →</button>
      <span class="attractor-hint">drag to rotate</span>
    </p>`;
}

/** Mounts the attractor hero. Returns false if the GPU can't run it. */
export function mountLandingAttractor(host: HTMLElement, hero: HTMLElement): boolean {
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
  const gpu = new GPUComputationRenderer(SIZE, SIZE, renderer);
  if (/iP(hone|ad|od)/.test(navigator.userAgent)) gpu.setDataType(THREE.HalfFloatType);

  const initial = gpu.createTexture();
  const data = initial.image.data as Float32Array;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (Math.random() - 0.5) * 3.2;
    data[i + 1] = (Math.random() - 0.5) * 3.2;
    data[i + 2] = (Math.random() - 0.5) * 3.2;
    data[i + 3] = 0;
  }
  const posVar: Variable = gpu.addVariable("texturePosition", SIM_SHADER, initial);
  gpu.setVariableDependencies(posVar, [posVar]);
  const simU = posVar.material.uniforms;
  simU.uTime = { value: 0 };
  simU.uKind = { value: 0 };
  simU.uDt = { value: 0 };
  simU.uCenter = { value: new THREE.Vector3() };
  simU.uScale = { value: 1 };
  simU.uSwap = { value: 0 };
  simU.uSpeedNorm = { value: 1 };
  simU.uRespawn = { value: 0.002 };
  if (gpu.init() !== null) {
    renderer.dispose();
    return false;
  }

  host.prepend(canvas);
  const caption = document.createElement("div");
  caption.className = "attractor-caption";
  host.appendChild(caption);

  // Scene: one Points object whose vertices look up their position texel.
  const refs = new Float32Array(SIZE * SIZE * 2);
  for (let y = 0, i = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      refs[i++] = (x + 0.5) / SIZE;
      refs[i++] = (y + 0.5) / SIZE;
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SIZE * SIZE * 3), 3));
  geometry.setAttribute("ref", new THREE.BufferAttribute(refs, 2));
  const material = new THREE.ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    uniforms: {
      uPositions: { value: null },
      uSize: { value: 1 },
      uColor: { value: new THREE.Color() },
      uAlpha: { value: 0.2 },
    },
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(points);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.4, 0.08);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let dark = false;
  let sizeFactor = 1;
  const applyTheme = () => {
    dark = document.documentElement.dataset.theme === "dark";
    scene.background = cssColor("--bg", dark ? "#0e0e10" : "#ffffff");
    material.uniforms.uColor.value = cssColor("--ink", dark ? "#eeeeee" : "#111111");
    material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true;
    const perPoint = SIZE === 512 ? 1 : 1.6; // fewer particles → each a bit stronger
    material.uniforms.uAlpha.value = (dark ? 0.1 : 0.16) * perPoint * sizeFactor;
    bloom.enabled = dark && !small;
  };

  // Where the attractor sits: the free space right of the text on wide
  // screens; on narrow ones, as an emblem in the empty space above the text
  // (scrolling with the page); failing that, faintly behind the text.
  let wide = false;
  let camDist = 8.4;
  let centerX = 0, centerY = 0;
  const HALF_FOV_TAN = Math.tan((32 / 2) * (Math.PI / 180));
  const layout = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 2 : 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    const rect = hero.getBoundingClientRect();
    // The hero box fills the viewport and centres its content, so the free
    // space is above its first line of text, not above the box.
    const firstLine = (hero.firstElementChild as HTMLElement | null)?.getBoundingClientRect().top ?? rect.top;
    const spaceAbove = firstLine + window.scrollY;
    wide = w - rect.right > Math.min(560, w * 0.36);
    if (wide) {
      centerX = (rect.right + w) / 2;
      centerY = h / 2;
      camDist = 8.4;
      sizeFactor = 1;
    } else if (spaceAbove > 140) {
      // Fit a ~1.6-unit shape into ~40% of the space above the text.
      centerX = w / 2;
      centerY = spaceAbove / 2;
      camDist = Math.min(40, Math.max(8.4, (1.6 * (h / 2)) / (0.4 * spaceAbove * HALF_FOV_TAN)));
      sizeFactor = 1;
    } else {
      centerX = w / 2;
      centerY = h / 2;
      camDist = 9.6;
      sizeFactor = 0.45;
    }
    material.uniforms.uSize.value = (small ? 9 : 7) * dpr * (camDist / 8.4);
    canvas.dataset.layout = wide ? "wide" : sizeFactor === 1 ? "emblem" : "behind";
    caption.hidden = !wide;
    canvas.style.pointerEvents = wide ? "auto" : "none";
    applyTheme();
  };

  let current = 0;
  const select = (i: number) => {
    current = (i + ATTRACTORS.length) % ATTRACTORS.length;
    const a = ATTRACTORS[current];
    simU.uKind.value = current;
    simU.uDt.value = a.dt;
    simU.uCenter.value.set(...a.center);
    simU.uScale.value = a.scale;
    simU.uSwap.value = a.swap ? 1 : 0;
    simU.uSpeedNorm.value = a.speed;
    caption.innerHTML = captionHtml(a, current);
  };
  select(0);
  layout();
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("resize", layout);

  // Interaction: drag to rotate (with inertia), click/tap to switch, pointer parallax.
  let yaw = 0.6, pitch = 0.28, yawVel = 0, pitchVel = 0;
  let px = 0, py = 0, smx = 0, smy = 0;
  let dragging = false, moved = 0, lastX = 0, lastY = 0;
  let lastInteraction = performance.now();
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
    if (moved < 6) select(current + 1);
    lastInteraction = performance.now();
  };
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp);
  caption.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".attractor-next")) {
      select(current + 1);
      lastInteraction = performance.now();
    }
  });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const step = (time: number) => {
    simU.uTime.value = time;
    gpu.compute();
  };
  const render = () => {
    smx += (px - smx) * 0.03;
    smy += (py - smy) * 0.03;
    const w = window.innerWidth, h = window.innerHeight;
    const emblem = !wide && sizeFactor === 1;
    const cy = emblem ? centerY - window.scrollY : centerY;
    camera.setViewOffset(w, h, w / 2 - centerX, h / 2 - cy, w, h);
    camera.updateProjectionMatrix();
    const r = camDist;
    const y = yaw + smx * 0.35;
    const p = pitch + smy * 0.2;
    camera.position.set(r * Math.cos(p) * Math.sin(y), r * Math.sin(p), r * Math.cos(p) * Math.cos(y));
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
    geometry.dispose();
    material.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  if (reduceMotion) {
    // One settled still frame; switching re-settles and redraws.
    const settle = () => {
      for (let i = 0; i < 400; i++) step(i * 0.016);
      render();
    };
    settle();
    caption.addEventListener("click", () => settle());
    canvas.addEventListener("pointerup", () => settle());
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
      if (!dragging) {
        yaw += 0.0012 + yawVel;
        yawVel *= 0.95;
        pitchVel *= 0.9;
      }
      // Idle visitors see the next system every 25 s.
      if (now - lastInteraction > 25000) {
        select(current + 1);
        lastInteraction = now;
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

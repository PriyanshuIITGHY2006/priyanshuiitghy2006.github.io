// Projects page: a stack of portrait 3D cards (three.js).
//
// Scroll progress p (0 … n-1) drives the pile: cards with index ≤ p lie on
// the stack, each with its own small resting twist so it reads as a real
// pile; the card at p < i < p+1 is being dealt — it rises from below the
// stage, curled and tilted, and settles on top. Each card is a finely
// subdivided plane textured with the card face drawn on a 2D canvas in the
// site's fonts and colours; a soft shadow quad sits under each one. The top
// card tilts toward the pointer with a moving sheen, and clicking it opens
// the full write-up. The canvas lives inside #app, so a route change removes
// it and the loop disposes everything. Returns null without WebGL2 (the
// page keeps its DOM stack).

import * as THREE from "three";
import type { DetailedProject } from "../data/projects";

export interface ProjectStack {
  /** Stack progress 0 … n-1 (from scroll); `instant` skips the easing. */
  setProgress(p: number, instant?: boolean): void;
}

const CARD_W = 2.2;
const CARD_H = 3.1;
const TEX_W = 880;
const TEX_H = 1240;

const VERT = /* glsl */ `
uniform float uBend;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  // Curl along the card's length while it is being dealt.
  float ny = p.y / ${(CARD_H / 2).toFixed(2)};
  float nx = p.x / ${(CARD_W / 2).toFixed(2)};
  p.z += uBend * (ny * ny * 0.55 + nx * nx * 0.12 - 0.22);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uBg;
uniform float uDim;
uniform vec2 uSheen;
uniform float uSheenAmt;
varying vec2 vUv;
float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(${CARD_W.toFixed(2)}, ${CARD_H.toFixed(2)});
  if (roundedBox(p, vec2(${(CARD_W / 2).toFixed(2)}, ${(CARD_H / 2).toFixed(2)}), 0.09) > 0.0) discard;
  vec3 c = texture2D(uTex, vUv).rgb;
  float band = exp(-pow(dot(vUv - uSheen, normalize(vec2(1.0, 0.7))) * 4.5, 2.0));
  c += uSheenAmt * band * 0.08;
  c = mix(uBg, c, uDim);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Word-wraps `text` into at most `maxLines` lines of `width`, with an ellipsis if cut. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  let used = 0;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= width || !line) {
      line = next;
      used++;
      continue;
    }
    lines.push(line);
    if (lines.length === maxLines) break;
    line = w;
    used++;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (used < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(`${last}…`).width > width) last = last.replace(/\s*\S+$/, "");
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

/** Draws one card face: number and date, the title large, tagline, stack. */
function drawCard(canvas: HTMLCanvasElement, p: DetailedProject, index: number, total: number): void {
  const ctx = canvas.getContext("2d")!;
  const serif = cssVar("--cm", "Georgia, serif");
  const sans = cssVar("--cm-sans", "Arial, sans-serif");
  const ink = cssVar("--ink", "#e9e9eb");
  const soft = cssVar("--ink-soft", "#d3d3d6");
  const muted = cssVar("--muted-2", "#86868c");
  const rule = cssVar("--border", "#333338");
  const accent = cssVar("--link-hover", "#7fd9a0");

  ctx.fillStyle = cssVar("--bg-card", "#17171a");
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.strokeStyle = cssVar("--border-strong", "#5a5a62");
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(1.5, 1.5, TEX_W - 3, TEX_H - 3, 36);
  ctx.stroke();

  const L = 74, R = TEX_W - 74, W = R - L;
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 28px ${sans}`;
  ctx.fillStyle = muted;
  ctx.fillText(`${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, L, 112);
  ctx.textAlign = "right";
  ctx.fillText(p.date.toUpperCase(), R, 112);
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.fillRect(L, 142, 46, 3);

  // Title: the name large, the descriptor after the dash smaller.
  const dash = p.title.indexOf(" — ");
  const name = dash > 0 ? p.title.slice(0, dash) : p.title;
  const descriptor = dash > 0 ? p.title.slice(dash + 3) : "";
  let y = 262;
  ctx.font = `700 76px ${serif}`;
  ctx.fillStyle = ink;
  for (const line of wrap(ctx, name, W, 3)) {
    ctx.fillText(line, L, y);
    y += 84;
  }
  if (descriptor) {
    y += 2;
    ctx.font = `400 40px ${serif}`;
    ctx.fillStyle = soft;
    for (const line of wrap(ctx, descriptor, W, 3)) {
      ctx.fillText(line, L, y);
      y += 50;
    }
  }

  y += 28;
  ctx.font = `italic 33px ${sans}`;
  ctx.fillStyle = soft;
  const room = Math.max(1, Math.floor((TEX_H - 250 - y) / 46));
  for (const line of wrap(ctx, p.tagline, W, Math.min(6, room))) {
    ctx.fillText(line, L, y);
    y += 46;
  }

  const base = TEX_H - 150;
  ctx.strokeStyle = rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L, base - 44);
  ctx.lineTo(R, base - 44);
  ctx.stroke();
  ctx.font = `27px ${sans}`;
  ctx.fillStyle = muted;
  const stackLines = wrap(ctx, p.stack.join("  ·  "), W, 2);
  stackLines.forEach((line, k) => ctx.fillText(line, L, base + k * 38));
}

/** Soft rounded shadow texture (drawn once). */
function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 340;
  const g = c.getContext("2d")!;
  g.shadowColor = "rgba(0,0,0,0.85)";
  g.shadowBlur = 28;
  g.fillStyle = "rgba(0,0,0,0.85)";
  g.beginPath();
  g.roundRect(40, 40, 176, 260, 14);
  g.fill();
  return new THREE.CanvasTexture(c);
}

export function mountProjectStack(
  host: HTMLElement,
  projects: DetailedProject[],
  opts: { onOpen(): void },
): ProjectStack | null {
  const canvas = document.createElement("canvas");
  canvas.className = "ps-canvas";
  canvas.setAttribute("aria-hidden", "true");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    return null;
  }
  host.append(canvas);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
  const geometry = new THREE.PlaneGeometry(CARD_W, CARD_H, 20, 40);
  const shadowGeo = new THREE.PlaneGeometry(CARD_W * 1.42, CARD_H * 1.3);
  const shadowTex = shadowTexture();
  const bg = new THREE.Color();
  const total = projects.length;

  const cards = projects.map((p, i) => {
    const art = document.createElement("canvas");
    art.width = TEX_W;
    art.height = TEX_H;
    const tex = new THREE.CanvasTexture(art);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTex: { value: tex },
        uBg: { value: bg },
        uDim: { value: 1 },
        uBend: { value: 0 },
        uSheen: { value: new THREE.Vector2(0.5, 0.5) },
        uSheenAmt: { value: 0 },
      },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.index = i;
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    scene.add(shadow, mesh);
    // Each card's resting place on the pile: a small, fixed twist and offset.
    const rest = { rz: (((i * 37) % 9) - 4) * 0.014, x: (((i * 53) % 7) - 3) * 0.022, y: (((i * 29) % 5) - 2) * 0.015 };
    return { p, art, tex, material, mesh, shadow, shadowMat, rest };
  });

  const paint = () => {
    bg.set(cssVar("--bg", "#0c0c0e"));
    const dark = document.documentElement.dataset.theme === "dark";
    cards.forEach((c, i) => {
      drawCard(c.art, c.p, i, total);
      c.tex.needsUpdate = true;
      c.shadowMat.opacity = dark ? 0.75 : 0.22;
    });
  };
  paint();
  void document.fonts.ready.then(() => canvas.isConnected && paint());
  const themeObserver = new MutationObserver(paint);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const layout = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const byHeight = CARD_H / (Math.min(0.66, 640 / h) * 2 * tan);
    const byWidth = CARD_W / (0.8 * 2 * tan * camera.aspect);
    camera.position.set(0, 0, Math.max(byHeight, byWidth));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };
  layout();
  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(host);

  // Pointer: tilt + sheen on the top card; click it to open the write-up.
  const pointer = new THREE.Vector2(0, 0);
  const tilt = new THREE.Vector2(0, 0);
  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  let top = 0;
  const hitTop = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(cards.filter((c) => c.mesh.visible).map((c) => c.mesh))[0];
    return !!hit && hit.object.userData.index === top;
  };
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    canvas.classList.toggle("is-over", hitTop(e));
  };
  const onLeave = () => {
    pointer.set(0, 0);
    canvas.classList.remove("is-over");
  };
  const onClick = (e: PointerEvent) => {
    if (hitTop(e)) opts.onOpen();
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClick as EventListener);

  // q eases toward the scroll target so jumps still deal smoothly.
  let target = 0, q = 0, qv = 0;
  let frame = 0;
  let prev = performance.now();
  const start = prev;

  const teardown = () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    themeObserver.disconnect();
    for (const c of cards) {
      c.tex.dispose();
      c.material.dispose();
      c.shadowMat.dispose();
    }
    shadowTex.dispose();
    geometry.dispose();
    shadowGeo.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  const loop = (now: number) => {
    if (!canvas.isConnected) return teardown();
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const t = (now - start) / 1000;
    const k = 90, c = 2 * Math.sqrt(k);
    qv += (k * (target - q) - c * qv) * dt;
    q += qv * dt;
    top = Math.max(0, Math.min(total - 1, Math.floor(q + 0.02)));
    tilt.lerp(pointer, 0.07);

    cards.forEach((card, i) => {
      const s = i - q;
      const { rest } = card;
      const u = card.material.uniforms;
      const m = card.mesh;
      const sh = card.shadow;
      if (s >= 1) {
        m.visible = sh.visible = false;
        return;
      }
      m.visible = sh.visible = true;
      if (s <= 0) {
        // On the pile: older cards sink a little and dim.
        const depth = Math.max(s, -6);
        const isTop = i === top;
        const breathe = isTop ? Math.sin(t * 1.2) * 0.012 : 0;
        m.position.set(rest.x, rest.y + depth * 0.03 + breathe, depth * 0.03);
        m.rotation.set(-tilt.y * 0.12 * (isTop ? 1 : 0), tilt.x * 0.16 * (isTop ? 1 : 0), rest.rz);
        u.uBend.value = 0;
        u.uDim.value = Math.max(0.3, 1 + depth * 0.16);
        u.uSheen.value.set(0.5 + tilt.x * 0.55, 0.5 + tilt.y * 0.55);
        u.uSheenAmt.value = isTop ? Math.min(1, tilt.length() * 1.5 + 0.12) : 0;
        sh.position.set(rest.x + 0.05, rest.y + depth * 0.03 - 0.1, depth * 0.03 - 0.012);
        sh.rotation.set(0, 0, rest.rz);
        sh.scale.setScalar(1);
      } else {
        // Being dealt: rises from below, curled and tilted, lands on top.
        const e = s * s * (3 - 2 * s);
        const fly = Math.pow(s, 1.25);
        m.position.set(rest.x + e * 0.35, rest.y - fly * (CARD_H * 1.75), 0.05 + Math.sin(s * Math.PI) * 0.9);
        m.rotation.set(0.75 * e, -0.25 * e, rest.rz + 0.32 * e);
        u.uBend.value = Math.sin(s * Math.PI) * 0.55;
        u.uDim.value = 1;
        u.uSheenAmt.value = Math.sin(s * Math.PI) * 0.5;
        u.uSheen.value.set(0.5 - s * 0.4, 0.3 + s * 0.6);
        // Shadow grows and softens with height above the pile.
        sh.position.set(m.position.x + 0.1 + e * 0.12, m.position.y - 0.18 - e * 0.25, 0.01);
        sh.rotation.set(0, 0, m.rotation.z);
        sh.scale.setScalar(1 + Math.sin(s * Math.PI) * 0.12);
      }
    });

    renderer.render(scene, camera);
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
  requestAnimationFrame(() => canvas.classList.add("is-visible"));

  return {
    setProgress(p: number, instant = false) {
      target = p;
      if (instant) {
        q = p;
        qv = 0;
      }
    },
  };
}

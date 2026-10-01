// Projects page: the project cards as real 3D cards (three.js).
//
// Each card is a finely subdivided plane textured with the card drawn on a
// 2D canvas in the site's own fonts and colours. Cards sit on an arc: the
// focused one faces the camera, the rest fan back in perspective and dim
// toward the page background. On load they deal out of a stacked deck;
// while moving they bend like paper in proportion to the speed; the focused
// card tilts toward the pointer with a soft moving sheen.
//
// Drag / swipe (with inertia and snapping), arrow keys, or click a side
// card to move; click the focused card to open its write-up. The canvas
// lives inside #app, so a route change removes it and the loop disposes
// everything. Returns null when WebGL2 isn't available (the HTML deck stays).

import * as THREE from "three";
import type { DetailedProject } from "../data/projects";

export interface ProjectDeck {
  go(i: number): void;
}

const CARD_W = 3.2;
const CARD_H = 2.0;
const TEX_W = 1280;
const TEX_H = 800;

const VERT = /* glsl */ `
uniform float uBend;
uniform float uLift;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  // Paper bend: curve along x by the motion, a little ripple on top.
  float nx = p.x / ${(CARD_W / 2).toFixed(2)};
  p.z += uBend * (nx * nx - 0.33) * 0.55 + uBend * sin(nx * 3.1) * 0.05;
  p.z += uLift * (1.0 - nx * nx) * 0.06;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uBg;
uniform float uDim;
uniform vec2 uSheen;
uniform float uSheenAmt;
uniform float uRadius;
varying vec2 vUv;
float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(${CARD_W.toFixed(2)}, ${CARD_H.toFixed(2)});
  float d = roundedBox(p, vec2(${(CARD_W / 2).toFixed(2)}, ${(CARD_H / 2).toFixed(2)}), uRadius);
  if (d > 0.0) discard;
  vec3 c = texture2D(uTex, vUv).rgb;
  // Sheen: a soft diagonal band that follows the pointer across the card.
  float band = exp(-pow(dot(vUv - uSheen, normalize(vec2(1.0, 0.6))) * 5.0, 2.0));
  c += uSheenAmt * band * 0.07;
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
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  const used = lines.join(" ").split(/\s+/).length;
  if (used < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(`${last}…`).width > width) last = last.replace(/\s*\S+$/, "");
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

/** Draws one project card (same content as the HTML card) onto a canvas. */
function drawCard(canvas: HTMLCanvasElement, p: DetailedProject, index: number, total: number): void {
  const ctx = canvas.getContext("2d")!;
  const serif = cssVar("--cm", "Georgia, serif");
  const sans = cssVar("--cm-sans", "Arial, sans-serif");
  const bg = cssVar("--bg-card", "#17171a");
  const ink = cssVar("--ink", "#e9e9eb");
  const soft = cssVar("--ink-soft", "#d3d3d6");
  const muted = cssVar("--muted-2", "#86868c");
  const border = cssVar("--border-strong", "#5a5a62");
  const rule = cssVar("--border", "#333338");
  const accent = cssVar("--link-hover", "#7fd9a0");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.strokeStyle = border;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(1.5, 1.5, TEX_W - 3, TEX_H - 3, 22);
  ctx.stroke();

  const L = 80, R = TEX_W - 80, Wd = R - L;
  let y = 96;
  ctx.textBaseline = "alphabetic";

  ctx.font = `500 25px ${sans}`;
  ctx.fillStyle = muted;
  ctx.fillText(p.date.toUpperCase().split("").join(String.fromCharCode(8202)), L, y);
  ctx.textAlign = "right";
  ctx.fillText(`${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, R, y);
  ctx.textAlign = "left";

  y += 70;
  ctx.font = `700 50px ${serif}`;
  ctx.fillStyle = ink;
  for (const line of wrap(ctx, p.title, Wd, 2)) {
    ctx.fillText(line, L, y);
    y += 60;
  }

  y += 4;
  ctx.font = `italic 29px ${sans}`;
  ctx.fillStyle = soft;
  for (const line of wrap(ctx, p.tagline, Wd, 3)) {
    ctx.fillText(line, L, y);
    y += 41;
  }

  y += 14;
  ctx.font = `25px ${sans}`;
  ctx.fillStyle = muted;
  for (const line of wrap(ctx, p.stack.join("  ·  "), Wd, 1)) {
    ctx.fillText(line, L, y);
    y += 36;
  }

  y += 4;
  ctx.strokeStyle = rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L, y);
  ctx.lineTo(R, y);
  ctx.stroke();
  y += 50;

  ctx.font = `27px ${sans}`;
  for (const h of p.highlights) {
    const lines = wrap(ctx, h, Wd - 34, 2);
    if (y + (lines.length - 1) * 37 > TEX_H - 110) break;
    ctx.fillStyle = accent;
    ctx.fillRect(L, y - 9, 16, 2.5);
    ctx.fillStyle = ink;
    for (const line of lines) {
      ctx.fillText(line, L + 34, y);
      y += 37;
    }
    y += 8;
  }

  ctx.font = `600 26px ${sans}`;
  ctx.fillStyle = ink;
  ctx.fillText("Read more", L, TEX_H - 64);
}

/** Card pose for a signed distance `d` from the focused slot. */
function pose(d: number) {
  const a = Math.abs(d), s = Math.sign(d);
  const x = s * (a <= 1 ? a * 2.55 : 2.55 + (a - 1) * 1.25);
  return {
    x,
    y: 0,
    z: -Math.min(a, 3.2) * 1.15,
    rotY: -s * Math.min(a, 1) * 0.62 - s * Math.max(0, Math.min(a - 1, 2)) * 0.06,
    rotX: 0,
    dim: Math.max(0.18, 1 - a * 0.42),
  };
}

export function mountProjectDeck(
  host: HTMLElement,
  projects: DetailedProject[],
  opts: { onFocus(i: number): void; onOpen(i: number): void },
): ProjectDeck | null {
  const canvas = document.createElement("canvas");
  canvas.className = "pd-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Projects — drag, swipe or use the arrow keys");
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
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  const geometry = new THREE.PlaneGeometry(CARD_W, CARD_H, 48, 4);
  const shadowGeo = new THREE.PlaneGeometry(CARD_W * 1.25, 0.9);
  const shadowTex = (() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(128, 32, 4, 128, 32, 128);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.setTransform(1, 0, 0, 0.25, 0, 24);
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();

  const bg = new THREE.Color();
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
        uLift: { value: 0 },
        uSheen: { value: new THREE.Vector2(0.5, 0.5) },
        uSheenAmt: { value: 0 },
        uRadius: { value: 0.06 },
      },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.index = i;
    const shadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = -1;
    scene.add(mesh, shadow);
    return { p, art, tex, material, mesh, shadow };
  });

  const paint = () => {
    bg.set(cssVar("--bg", "#0c0c0e"));
    const dark = document.documentElement.dataset.theme === "dark";
    cards.forEach((c, i) => {
      drawCard(c.art, c.p, i, cards.length);
      c.tex.needsUpdate = true;
      (c.shadow.material as THREE.MeshBasicMaterial).opacity = dark ? 0.9 : 0.35;
    });
  };
  paint();
  void document.fonts.ready.then(() => canvas.isConnected && paint());
  const themeObserver = new MutationObserver(paint);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const layout = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    // Distance so the focused card fills a sensible share of the stage.
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const frac = camera.aspect > 1.3 ? 0.44 : 0.84;
    const byWidth = CARD_W / (frac * 2 * tan * camera.aspect);
    const byHeight = CARD_H / (0.78 * 2 * tan);
    camera.position.set(0, 0.18, Math.max(byWidth, byHeight));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };
  layout();
  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(host);

  // Focus is continuous: `pos` springs toward `target`; drag moves target.
  const last = cards.length - 1;
  let pos = 0, vel = 0, target = 0, active = -1;
  const clampT = (v: number) => Math.max(-0.35, Math.min(last + 0.35, v));
  const go = (i: number) => {
    target = Math.max(0, Math.min(last, Math.round(i)));
  };

  // Pointer: drag/swipe horizontally; a short press is a click.
  let dragging = false, downX = 0, downT = 0, moved = 0, lastX = 0, lastTime = 0, flick = 0;
  const pointer = new THREE.Vector2(0, 0); // -1..1 over the stage, for tilt/sheen
  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const perPx = () => 1 / Math.max(260, host.clientWidth * (camera.aspect > 1.3 ? 0.28 : 0.6));
  const onDown = (e: PointerEvent) => {
    dragging = true;
    moved = 0;
    downX = lastX = e.clientX;
    downT = target;
    lastTime = performance.now();
    flick = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("is-dragging");
  };
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    if (!dragging) return;
    moved = Math.max(moved, Math.abs(e.clientX - downX));
    target = clampT(downT - (e.clientX - downX) * perPx());
    const now = performance.now();
    flick = (-(e.clientX - lastX) * perPx()) / Math.max(1, now - lastTime);
    lastX = e.clientX;
    lastTime = now;
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove("is-dragging");
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (moved < 6) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(cards.map((c) => c.mesh))[0];
      const i = hit ? (hit.object.userData.index as number) : -1;
      if (i === active) opts.onOpen(i);
      else go(i >= 0 ? i : target);
      return;
    }
    go(target + flick * 260); // inertia: a quick flick carries further
  };
  const onLeave = () => pointer.set(0, 0);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") (e.preventDefault(), go(active + 1));
    else if (e.key === "ArrowLeft") (e.preventDefault(), go(active - 1));
    else if (e.key === "Enter") opts.onOpen(active);
  };
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical wheel scrolls the page
    e.preventDefault();
    target = clampT(target + e.deltaX * 0.004);
    clearTimeout(wheelSnap);
    wheelSnap = window.setTimeout(() => go(target), 140);
  };
  let wheelSnap = 0;
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("keydown", onKey);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  // Intro: cards start stacked low and flat, then deal out one by one.
  const start = performance.now();
  const tilt = new THREE.Vector2(0, 0);
  let frame = 0;
  let prev = start;

  const teardown = () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    themeObserver.disconnect();
    for (const c of cards) {
      c.tex.dispose();
      c.material.dispose();
      (c.shadow.material as THREE.Material).dispose();
    }
    shadowTex.dispose();
    geometry.dispose();
    shadowGeo.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  const loop = (now: number) => {
    if (!canvas.isConnected) return teardown();
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const t = (now - start) / 1000;

    // Critically damped spring toward the target slot.
    const k = dragging ? 260 : 70, c = 2 * Math.sqrt(k);
    vel += (k * (target - pos) - c * vel) * dt;
    pos += vel * dt;
    const nearest = Math.max(0, Math.min(last, Math.round(pos)));
    if (nearest !== active) {
      active = nearest;
      opts.onFocus(active);
    }
    tilt.lerp(pointer, 0.06);
    const bend = THREE.MathUtils.clamp(vel * 0.16, -0.5, 0.5);

    cards.forEach((card, i) => {
      const d = i - pos;
      const tp = pose(d);
      // Deal-in: stagger from the centre outwards.
      const intro = ease((t - 0.15 - Math.abs(i - target) * 0.11) / 0.9);
      const stackY = -1.6 + i * 0.012, stackZ = -2.2 - i * 0.02;
      const x = THREE.MathUtils.lerp(0, tp.x, intro);
      const y = THREE.MathUtils.lerp(stackY, tp.y, intro);
      const z = THREE.MathUtils.lerp(stackZ, tp.z, intro);
      const focus = Math.max(0, 1 - Math.abs(d));
      const float = Math.sin(t * 1.1 + i) * 0.025 * focus;
      card.mesh.position.set(x, y + float, z);
      card.mesh.rotation.set(
        THREE.MathUtils.lerp(-1.35, tp.rotX, intro) - tilt.y * 0.12 * focus,
        THREE.MathUtils.lerp(0, tp.rotY, intro) + tilt.x * 0.16 * focus,
        THREE.MathUtils.lerp(0.08 * (i % 2 ? 1 : -1), 0, intro),
      );
      const u = card.material.uniforms;
      u.uDim.value = THREE.MathUtils.lerp(0.25, tp.dim, intro);
      u.uBend.value = bend * (0.6 + 0.4 * focus) * intro;
      u.uLift.value = focus * (0.5 + 0.5 * Math.sin(t * 1.3));
      u.uSheen.value.set(0.5 + tilt.x * 0.6, 0.5 + tilt.y * 0.6);
      u.uSheenAmt.value = focus * Math.min(1, tilt.length() * 1.6 + 0.15);
      card.mesh.visible = Math.abs(d) < 4;
      card.shadow.visible = card.mesh.visible;
      card.shadow.position.set(x, -CARD_H / 2 - 0.32, z + 0.1);
      card.shadow.scale.setScalar(0.85 + 0.15 * focus);
    });

    renderer.render(scene, camera);
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
  requestAnimationFrame(() => canvas.classList.add("is-visible"));

  return { go };
}

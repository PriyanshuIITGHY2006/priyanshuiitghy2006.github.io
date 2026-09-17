// Builds and animates the SVG scene for a :::binviz block. Runs entirely
// client-side after mount — the markdown renderer only emits a placeholder
// container (see blog.ts); nothing here touches the DOMPurify-sanitized
// HTML string, so there's no sanitizer allowlist concern with raw SVG.

import type { BinVizConfig } from "./blog";

const NS = "http://www.w3.org/2000/svg";

const BIN_WIDTH = 64;
const BIN_GAP = 22;
const MAX_BIN_HEIGHT = 190;
const LABEL_HEIGHT = 20;
const TOP_PAD = 14;
const SIDE_PAD = 16;

export interface BinVizController {
  readonly totalSteps: number;
  isDone(): boolean;
  stepForward(): boolean;
  reset(): void;
  describeStep(): string;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export function mountBinPackingViz(canvas: HTMLElement, config: BinVizConfig): BinVizController {
  const { capacity, result } = config;
  const scale = Math.min(16, MAX_BIN_HEIGHT / capacity);
  const binHeight = capacity * scale;
  const svgWidth = SIDE_PAD * 2 + result.binCount * BIN_WIDTH + Math.max(0, result.binCount - 1) * BIN_GAP;
  const svgHeight = TOP_PAD + binHeight + LABEL_HEIGHT + 10;

  const svg = el("svg", { viewBox: `0 0 ${svgWidth} ${svgHeight}`, class: "blog-binviz-svg" });
  canvas.innerHTML = "";
  canvas.appendChild(svg);

  const binGroups: SVGGElement[] = [];
  const binFillHeights: number[] = [];

  const binX = (i: number) => SIDE_PAD + i * (BIN_WIDTH + BIN_GAP);

  function ensureBin(i: number): SVGGElement {
    if (binGroups[i]) return binGroups[i];
    const g = el("g", { class: "blog-binviz-bin", opacity: "0" });
    g.appendChild(
      el("rect", { x: binX(i), y: TOP_PAD, width: BIN_WIDTH, height: binHeight, class: "blog-binviz-bin-outline" }),
    );
    const label = el("text", {
      x: binX(i) + BIN_WIDTH / 2,
      y: TOP_PAD + binHeight + LABEL_HEIGHT - 4,
      class: "blog-binviz-bin-label",
      "text-anchor": "middle",
    });
    label.textContent = `bin ${i + 1}`;
    g.appendChild(label);
    svg.appendChild(g);
    binGroups[i] = g;
    binFillHeights[i] = 0;
    requestAnimationFrame(() => g.setAttribute("opacity", "1"));
    return g;
  }

  function placeItem(step: (typeof result.steps)[number]) {
    const g = ensureBin(step.binIndex);
    const itemHeight = step.itemSize * scale;
    const restY = TOP_PAD + binHeight - binFillHeights[step.binIndex] - itemHeight;
    const startY = -itemHeight - 6; // drop in from above the figure
    binFillHeights[step.binIndex] += itemHeight;

    const rect = el("rect", {
      x: binX(step.binIndex) + 3,
      y: startY,
      width: BIN_WIDTH - 6,
      height: itemHeight,
      class: "blog-binviz-item",
    });
    rect.style.transition = "y 0.35s ease";

    const text = el("text", {
      x: binX(step.binIndex) + BIN_WIDTH / 2,
      y: startY + itemHeight / 2 + 4,
      class: "blog-binviz-item-label",
      "text-anchor": "middle",
    });
    text.style.transition = "y 0.35s ease";
    text.textContent = String(step.itemSize);

    g.appendChild(rect);
    g.appendChild(text);

    requestAnimationFrame(() => {
      rect.setAttribute("y", String(restY));
      text.setAttribute("y", String(restY + itemHeight / 2 + 4));
    });
  }

  let stepIndex = 0;

  return {
    get totalSteps() {
      return result.steps.length;
    },
    isDone() {
      return stepIndex >= result.steps.length;
    },
    stepForward() {
      if (stepIndex >= result.steps.length) return false;
      placeItem(result.steps[stepIndex]);
      stepIndex += 1;
      return true;
    },
    reset() {
      stepIndex = 0;
      binGroups.length = 0;
      binFillHeights.length = 0;
      svg.innerHTML = "";
    },
    describeStep() {
      if (stepIndex === 0) {
        return `Ready — ${result.steps.length} items, bin capacity ${capacity}.`;
      }
      const s = result.steps[stepIndex - 1];
      const where = s.isNewBin ? `new bin ${s.binIndex + 1}` : `bin ${s.binIndex + 1}`;
      const done = stepIndex >= result.steps.length;
      const tail = done
        ? ` — done, used ${result.binCount} bin${result.binCount === 1 ? "" : "s"}.`
        : "";
      return `Step ${stepIndex}/${result.steps.length} — item ${s.itemIndex + 1} (size ${s.itemSize}) → ${where}.${tail}`;
    },
  };
}

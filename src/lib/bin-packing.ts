// Pure bin-packing heuristics, shared between the blog's :::binviz
// visualizations and (implicitly) the worked examples in the post's prose.
// No DOM here on purpose — this is just the algorithm + a step trace.

export interface BinVizStep {
  itemIndex: number;
  itemSize: number;
  binIndex: number;
  isNewBin: boolean;
}

export interface BinVizResult {
  steps: BinVizStep[];
  binCount: number;
}

function simulate(
  items: number[],
  capacity: number,
  chooseBin: (item: number, remaining: number[]) => number | null,
): BinVizResult {
  const remaining: number[] = [];
  const steps: BinVizStep[] = [];
  items.forEach((item, itemIndex) => {
    let binIndex = chooseBin(item, remaining);
    let isNewBin = false;
    if (binIndex === null) {
      binIndex = remaining.length;
      remaining.push(capacity);
      isNewBin = true;
    }
    remaining[binIndex] -= item;
    steps.push({ itemIndex, itemSize: item, binIndex, isNewBin });
  });
  return { steps, binCount: remaining.length };
}

/** Only ever checks the single most-recently-opened bin. */
export function nextFit(items: number[], capacity: number): BinVizResult {
  return simulate(items, capacity, (item, remaining) => {
    const last = remaining.length - 1;
    return last >= 0 && remaining[last] >= item ? last : null;
  });
}

/** Scans open bins left to right, places in the first one that fits. */
export function firstFit(items: number[], capacity: number): BinVizResult {
  return simulate(items, capacity, (item, remaining) => {
    for (let i = 0; i < remaining.length; i++) if (remaining[i] >= item) return i;
    return null;
  });
}

/** Places in whichever open bin leaves the least leftover space. */
export function bestFit(items: number[], capacity: number): BinVizResult {
  return simulate(items, capacity, (item, remaining) => {
    let best = -1;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] >= item && (best === -1 || remaining[i] < remaining[best])) best = i;
    }
    return best === -1 ? null : best;
  });
}

/** Sorts largest-first, then runs First Fit. */
export function firstFitDecreasing(items: number[], capacity: number): BinVizResult {
  const order = items
    .map((size, originalIndex) => ({ size, originalIndex }))
    .sort((a, b) => b.size - a.size);
  const result = simulate(
    order.map((x) => x.size),
    capacity,
    (item, remaining) => {
      for (let i = 0; i < remaining.length; i++) if (remaining[i] >= item) return i;
      return null;
    },
  );
  // Steps were computed in decreasing order; relabel each step with the
  // item's position in the original input so the visualization can still
  // say "item 5" and mean the 5th item as the reader sees it listed.
  const steps = result.steps.map((s, i) => ({ ...s, itemIndex: order[i].originalIndex }));
  return { steps, binCount: result.binCount };
}

export const BIN_PACKING_ALGORITHMS: Record<string, (items: number[], capacity: number) => BinVizResult> = {
  "next-fit": nextFit,
  "first-fit": firstFit,
  "best-fit": bestFit,
  "first-fit-decreasing": firstFitDecreasing,
};

export const BIN_PACKING_ALGORITHM_LABELS: Record<string, string> = {
  "next-fit": "Next Fit",
  "first-fit": "First Fit",
  "best-fit": "Best Fit",
  "first-fit-decreasing": "First Fit Decreasing",
};

// Port of the bin-packing heuristics and step visualizer from the Vite site
// (src/lib/bin-packing.ts, src/lib/bin-packing-viz.ts), as plain DOM code.
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var BIN_WIDTH = 64, BIN_GAP = 22, MAX_BIN_HEIGHT = 190, LABEL_HEIGHT = 20, TOP_PAD = 14, SIDE_PAD = 16;

  function simulate(items, capacity, chooseBin) {
    var remaining = [], steps = [];
    items.forEach(function (item, itemIndex) {
      var binIndex = chooseBin(item, remaining), isNewBin = false;
      if (binIndex === null) {
        binIndex = remaining.length;
        remaining.push(capacity);
        isNewBin = true;
      }
      remaining[binIndex] -= item;
      steps.push({ itemIndex: itemIndex, itemSize: item, binIndex: binIndex, isNewBin: isNewBin });
    });
    return { steps: steps, binCount: remaining.length };
  }

  function firstFitChoice(item, remaining) {
    for (var i = 0; i < remaining.length; i++) if (remaining[i] >= item) return i;
    return null;
  }

  var ALGORITHMS = {
    "next-fit": function (items, c) {
      return simulate(items, c, function (item, remaining) {
        var last = remaining.length - 1;
        return last >= 0 && remaining[last] >= item ? last : null;
      });
    },
    "first-fit": function (items, c) { return simulate(items, c, firstFitChoice); },
    "best-fit": function (items, c) {
      return simulate(items, c, function (item, remaining) {
        var best = -1;
        for (var i = 0; i < remaining.length; i++) {
          if (remaining[i] >= item && (best === -1 || remaining[i] < remaining[best])) best = i;
        }
        return best === -1 ? null : best;
      });
    },
    "first-fit-decreasing": function (items, c) {
      var order = items
        .map(function (size, originalIndex) { return { size: size, originalIndex: originalIndex }; })
        .sort(function (a, b) { return b.size - a.size; });
      var result = simulate(order.map(function (x) { return x.size; }), c, firstFitChoice);
      result.steps = result.steps.map(function (s, i) {
        return { itemIndex: order[i].originalIndex, itemSize: s.itemSize, binIndex: s.binIndex, isNewBin: s.isNewBin };
      });
      return result;
    }
  };

  function el(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    for (var k in attrs) node.setAttribute(k, String(attrs[k]));
    return node;
  }

  function mount(fig) {
    var algo = ALGORITHMS[fig.dataset.algorithm];
    var capacity = Number(fig.dataset.capacity);
    var items = (fig.dataset.items || "").split(",").map(Number).filter(function (n) { return n > 0; });
    var canvas = fig.querySelector(".binviz-canvas");
    var status = fig.querySelector(".binviz-status");
    var btnStep = fig.querySelector('[data-act="step"]');
    var btnPlay = fig.querySelector('[data-act="play"]');
    var btnReset = fig.querySelector('[data-act="reset"]');
    if (!algo || !capacity || !items.length) { status.textContent = "Visualization unavailable."; return; }

    var result = algo(items, capacity);
    var scale = Math.min(16, MAX_BIN_HEIGHT / capacity);
    var binHeight = capacity * scale;
    var width = SIDE_PAD * 2 + result.binCount * BIN_WIDTH + Math.max(0, result.binCount - 1) * BIN_GAP;
    var height = TOP_PAD + binHeight + LABEL_HEIGHT + 10;
    var svg, groups, fills, stepIndex, timer = null;

    function binX(i) { return SIDE_PAD + i * (BIN_WIDTH + BIN_GAP); }

    function ensureBin(i) {
      if (groups[i]) return groups[i];
      var g = el("g", {});
      g.appendChild(el("rect", { x: binX(i), y: TOP_PAD, width: BIN_WIDTH, height: binHeight, "class": "bv-outline" }));
      var label = el("text", { x: binX(i) + BIN_WIDTH / 2, y: TOP_PAD + binHeight + LABEL_HEIGHT - 4, "class": "bv-bin-label", "text-anchor": "middle" });
      label.textContent = "bin " + (i + 1);
      g.appendChild(label);
      svg.appendChild(g);
      groups[i] = g;
      fills[i] = 0;
      return g;
    }

    function place(step) {
      var g = ensureBin(step.binIndex);
      var h = step.itemSize * scale;
      var y = TOP_PAD + binHeight - fills[step.binIndex] - h;
      fills[step.binIndex] += h;
      g.appendChild(el("rect", { x: binX(step.binIndex) + 3, y: y, width: BIN_WIDTH - 6, height: h, "class": "bv-item" }));
      var t = el("text", { x: binX(step.binIndex) + BIN_WIDTH / 2, y: y + h / 2 + 4, "class": "bv-item-label", "text-anchor": "middle" });
      t.textContent = String(step.itemSize);
      g.appendChild(t);
    }

    function describe() {
      if (stepIndex === 0) return "Ready: " + result.steps.length + " items, bin capacity " + capacity + ".";
      var s = result.steps[stepIndex - 1];
      var where = (s.isNewBin ? "new bin " : "bin ") + (s.binIndex + 1);
      var done = stepIndex >= result.steps.length;
      return "Step " + stepIndex + "/" + result.steps.length + ": item " + (s.itemIndex + 1) + " (size " + s.itemSize + ") into " + where + "." +
        (done ? " Done, used " + result.binCount + " bin" + (result.binCount === 1 ? "" : "s") + "." : "");
    }

    function refresh() {
      status.textContent = describe();
      var done = stepIndex >= result.steps.length;
      btnStep.disabled = done;
      btnPlay.disabled = done && !timer;
    }

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      btnPlay.textContent = "Play";
    }

    function step() {
      if (stepIndex >= result.steps.length) { stop(); refresh(); return; }
      place(result.steps[stepIndex]);
      stepIndex += 1;
      if (stepIndex >= result.steps.length) stop();
      refresh();
    }

    function reset() {
      stop();
      canvas.innerHTML = "";
      svg = el("svg", { viewBox: "0 0 " + width + " " + height, role: "img", "aria-label": "Bin packing trace" });
      canvas.appendChild(svg);
      groups = [];
      fills = [];
      stepIndex = 0;
      refresh();
    }

    btnStep.addEventListener("click", function () { stop(); step(); });
    btnPlay.addEventListener("click", function () {
      if (timer) { stop(); refresh(); return; }
      if (stepIndex >= result.steps.length) reset();
      btnPlay.textContent = "Pause";
      timer = setInterval(step, 600);
    });
    btnReset.addEventListener("click", reset);
    reset();
  }

  function init() {
    var figs = document.querySelectorAll(".binviz");
    for (var i = 0; i < figs.length; i++) mount(figs[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

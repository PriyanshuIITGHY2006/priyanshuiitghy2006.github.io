// Certificate gallery: card grid, full-screen viewer, ?img=<id> deep links.
// PDFs are drawn with PDF.js so no browser PDF toolbar appears. If Supabase
// is reachable the list is refreshed from the site_images table, otherwise the
// list built into the page is used.
(function () {
  "use strict";
  var root = document.getElementById("gl-root");
  if (!root) return;

  var grid = document.getElementById("gl-grid");
  var lb = document.getElementById("gl-lb");
  var media = document.getElementById("gl-lb-media");
  var titleEl = document.getElementById("gl-lb-title");
  var descEl = document.getElementById("gl-lb-desc");
  var openLink = document.getElementById("gl-lb-open");
  var copyBtn = document.getElementById("gl-lb-copy");

  var base = root.dataset.base || "/";
  var items = JSON.parse(document.getElementById("gl-data").textContent || "[]");
  var current = -1;
  var token = 0;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fileUrl(src) {
    return /^(https?:)?\/\//i.test(src) || src.charAt(0) === "/" ? src : base + src;
  }
  function isPdf(src) {
    return /\.pdf(\?|#|$)/i.test(src);
  }
  function pdfjs() {
    var lib = window.pdfjsLib;
    if (lib && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = root.dataset.worker;
    return lib;
  }

  // ── Grid ───────────────────────────────────────────────────────────────
  var observer = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            observer.unobserve(e.target);
            drawThumb(e.target);
          }
        });
      }, { rootMargin: "200px" })
    : null;

  function drawThumb(box) {
    var lib = pdfjs();
    if (!lib) return;
    lib.getDocument({ url: box.dataset.pdf }).promise
      .then(function (pdf) { return pdf.getPage(1); })
      .then(function (page) {
        var one = page.getViewport({ scale: 1 });
        var width = box.clientWidth || 240;
        var vp = page.getViewport({ scale: (width / one.width) * Math.min(window.devicePixelRatio || 1, 2) });
        var canvas = document.createElement("canvas");
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        return page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise.then(function () {
          box.textContent = "";
          box.appendChild(canvas);
        });
      })
      .catch(function () {});
  }

  function renderGrid() {
    if (!items.length) {
      grid.innerHTML = '<p class="gl-empty">No files yet.</p>';
      return;
    }
    grid.innerHTML = items.map(function (it, i) {
      var src = fileUrl(it.src);
      var thumb = isPdf(it.src)
        ? '<span class="gl-thumb" data-pdf="' + esc(src) + '"><span class="gl-badge">PDF</span></span>'
        : '<span class="gl-thumb"><img src="' + esc(src) + '" alt="" loading="lazy"></span>';
      return '<button type="button" class="gl-card" data-i="' + i + '">' + thumb +
        '<span class="gl-meta"><span class="gl-name">' + esc(it.title) + "</span>" +
        (it.date ? '<span class="gl-date">' + esc(it.date) + "</span>" : "") + "</span></button>";
    }).join("");
    grid.querySelectorAll("[data-pdf]").forEach(function (box) {
      if (observer) observer.observe(box); else drawThumb(box);
    });
  }

  // ── Viewer ─────────────────────────────────────────────────────────────
  function showPdf(src, tok) {
    var lib = pdfjs();
    media.innerHTML = '<p class="gl-loading">Loading...</p>';
    if (!lib) { media.innerHTML = '<p class="gl-loading">Preview unavailable. Use Open original.</p>'; return; }
    lib.getDocument({ url: src }).promise.then(function (pdf) {
      if (tok !== token) return;
      media.textContent = "";
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var chain = Promise.resolve();
      for (var n = 1; n <= pdf.numPages; n++) {
        (function (pageNumber) {
          chain = chain.then(function () {
            if (tok !== token) return;
            return pdf.getPage(pageNumber).then(function (page) {
              var one = page.getViewport({ scale: 1 });
              var vp = page.getViewport({ scale: ((media.clientWidth - 32) / one.width) * dpr });
              var canvas = document.createElement("canvas");
              canvas.width = Math.floor(vp.width);
              canvas.height = Math.floor(vp.height);
              return page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise.then(function () {
                if (tok === token) media.appendChild(canvas);
              });
            });
          });
        })(n);
      }
      return chain;
    }).catch(function () {
      if (tok === token) media.innerHTML = '<p class="gl-loading">Preview unavailable. Use Open original.</p>';
    });
  }

  function setQuery(id) {
    try {
      history.replaceState(null, "", id ? location.pathname + "?img=" + encodeURIComponent(id) : location.pathname);
    } catch (e) {}
  }

  function open(index) {
    var it = items[index];
    if (!it) return;
    current = index;
    token += 1;
    var src = fileUrl(it.src);
    titleEl.textContent = it.title;
    descEl.textContent = it.description || "";
    descEl.hidden = !it.description;
    openLink.href = src;
    media.scrollTop = 0;
    if (isPdf(it.src)) showPdf(src, token);
    else media.innerHTML = '<img src="' + esc(src) + '" alt="' + esc(it.title) + '">';
    lb.hidden = false;
    document.body.style.overflow = "hidden";
    setQuery(it.id);
  }

  function close() {
    token += 1;
    lb.hidden = true;
    media.textContent = "";
    document.body.style.overflow = "";
    current = -1;
    setQuery(null);
  }

  function step(delta) {
    if (current < 0 || !items.length) return;
    open((current + delta + items.length) % items.length);
  }

  function indexOf(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return i;
    return -1;
  }

  grid.addEventListener("click", function (e) {
    var card = e.target.closest(".gl-card[data-i]");
    if (card) open(Number(card.dataset.i));
  });
  lb.addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest("[data-close]")) close();
    else if (t.closest("[data-prev]")) step(-1);
    else if (t.closest("[data-next]")) step(1);
  });
  document.addEventListener("keydown", function (e) {
    if (lb.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });
  copyBtn.addEventListener("click", function () {
    var it = items[current];
    if (!it) return;
    var url = location.origin + location.pathname + "?img=" + encodeURIComponent(it.id);
    var done = function (text) {
      copyBtn.textContent = text;
      setTimeout(function () { copyBtn.textContent = "Copy link"; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done("Copied"); }, function () { done(url); });
    } else {
      done(url);
    }
  });

  // ── Start ──────────────────────────────────────────────────────────────
  // The grid is hidden (data-pending) until we know which list to show, so the
  // built-in copy never flashes before the live one. A copy saved from the last
  // visit is used straight away; otherwise the live copy is awaited for up to
  // 0.9s before falling back to the built-in list.
  var KEY = "gl-live-v1";
  var wanted = new URLSearchParams(location.search).get("img");
  var shown = false;

  function openWanted() {
    if (!wanted || current >= 0) return;
    var i = indexOf(wanted);
    if (i >= 0) open(i);
  }

  function signature(list) {
    return list.map(function (x) { return [x.id, x.title, x.src, x.date, x.description].join("|"); }).join("\n");
  }

  function show(list) {
    var currentId = current >= 0 ? items[current].id : null;
    var changed = signature(list) !== signature(items);
    items = list;
    if (changed || !shown) renderGrid();
    grid.removeAttribute("data-pending");
    shown = true;
    if (currentId) {
      var i = indexOf(currentId);
      if (i >= 0) current = i; else close();
    }
    openWanted();
  }

  var url = root.dataset.url, key = root.dataset.key;
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}

  if (!url || !key) { show(items); return; }

  if (cached && cached.length) show(cached);
  else setTimeout(function () { if (!shown) show(items); }, 900);

  fetch(url + "/rest/v1/site_images?select=*&kind=eq.gallery&order=sort_order", {
    headers: { apikey: key, Authorization: "Bearer " + key }
  })
    .then(function (res) {
      if (!res.ok) throw new Error("bad status");
      return res.json();
    })
    .then(function (rows) {
      var live = rows
        .filter(function (r) { return r.id && r.title && r.src; })
        .map(function (r) { return { id: r.id, title: r.title, src: r.src, date: r.date || "", description: r.description || "" }; });
      if (live.length) {
        try { localStorage.setItem(KEY, JSON.stringify(live)); } catch (e) {}
        show(live);
      } else if (!shown) {
        show(items);
      }
    })
    .catch(function () { if (!shown) show(items); });
})();

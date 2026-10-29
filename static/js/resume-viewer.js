// Draws the CV PDF onto canvases with PDF.js so no browser PDF toolbar appears.
(function () {
  "use strict";
  var box = document.querySelector(".resume-viewer");
  if (!box || !window.pdfjsLib) return;
  var status = box.querySelector(".resume-loading");

  function fail() {
    if (status) status.textContent = "Preview unavailable. Use the Download button.";
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc = box.dataset.worker;

  window.pdfjsLib.getDocument({ url: box.dataset.src }).promise.then(function (pdf) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var chain = Promise.resolve();
    for (var n = 1; n <= pdf.numPages; n++) {
      (function (pageNumber) {
        chain = chain.then(function () {
          return pdf.getPage(pageNumber).then(function (page) {
            var cssWidth = box.clientWidth - 32;
            var base = page.getViewport({ scale: 1 });
            var viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
            var canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            canvas.setAttribute("aria-label", "Resume page " + pageNumber);
            return page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise.then(function () {
              if (status) { status.remove(); status = null; }
              box.appendChild(canvas);
            });
          });
        });
      })(n);
    }
    return chain;
  }).catch(fail);
})();

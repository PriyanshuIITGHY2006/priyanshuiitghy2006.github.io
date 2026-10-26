// Replaces the built-in achievements list with the rows currently in the
// Supabase `achievements` table, so edits made in the admin show up without
// a rebuild. If the request fails, the list rendered at build time stays.
(function () {
  "use strict";
  var list = document.getElementById("ach-list");
  if (!list || !list.dataset.url || !list.dataset.key) return;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  // Blurbs may carry <b> and <i>; everything else is escaped.
  function rich(s) {
    return esc(s).replace(/&lt;(\/?)(b|i)&gt;/g, "<$1$2>");
  }
  function safeHref(h) {
    return /^(https?:\/\/|#|\/)/i.test(h) ? h : "";
  }

  function render(a) {
    var tags = (a.tags || "").split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    var links = "";
    if (a.verify) {
      links += '<a class="ach-link" href="/gallery?img=' + encodeURIComponent(a.verify) + '">Show credential</a>';
    }
    var href = a.link_label && a.link_href ? safeHref(a.link_href) : "";
    if (href) {
      var ext = href.charAt(0) === "#" ? "" : ' target="_blank" rel="noopener"';
      links += '<a class="ach-link" href="' + esc(href) + '"' + ext + ">" + esc(a.link_label) + "</a>";
    }
    return (
      '<li class="ach-item"><h2 class="ach-title">' + esc(a.title) + "</h2>" +
      '<div class="ach-meta"><span class="ach-date">' + esc(a.date) + "</span>" +
      tags.map(function (t) { return '<span class="ach-tag">' + esc(t) + "</span>"; }).join("") +
      '</div><p class="ach-blurb">' + rich(a.blurb) + "</p>" +
      (links ? '<div class="ach-links">' + links + "</div>" : "") + "</li>"
    );
  }

  fetch(list.dataset.url + "/rest/v1/achievements?select=*&order=sort_order", {
    headers: { apikey: list.dataset.key, Authorization: "Bearer " + list.dataset.key }
  })
    .then(function (res) {
      if (!res.ok) throw new Error("bad status");
      return res.json();
    })
    .then(function (rows) {
      var items = rows.filter(function (a) { return a.title && a.blurb; });
      if (!items.length) return;
      var next = document.createElement("ol");
      next.innerHTML = items.map(render).join("");
      var clean = function (el) { return el.textContent.replace(/\s+/g, " ").trim(); };
      if (clean(next) === clean(list)) return;
      list.innerHTML = next.innerHTML;
    })
    .catch(function () {});
})();

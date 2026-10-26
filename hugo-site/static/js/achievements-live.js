// Shows the achievements in the Supabase `achievements` table (managed in the
// admin). A copy saved from the last visit is shown straight away while the
// fresh one loads, so repeat visits don't flicker.
(function () {
  "use strict";
  var list = document.getElementById("ach-list");
  if (!list) return;

  var KEY = "ach-live-v2";
  var url = list.dataset.url, key = list.dataset.key;

  function status(message) {
    list.innerHTML = '<li class="ach-status">' + esc(message) + "</li>";
  }
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

  var shown = null;
  function show(items) {
    var html = items.length ? items.map(render).join("") : '<li class="ach-status">No achievements yet.</li>';
    if (html !== shown) list.innerHTML = html;
    shown = html;
  }

  if (!url || !key) { status("The achievements are unavailable right now."); return; }

  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  if (cached && cached.length) show(cached);

  fetch(url + "/rest/v1/achievements?select=*&order=sort_order", {
    headers: { apikey: key, Authorization: "Bearer " + key }
  })
    .then(function (res) {
      if (!res.ok) throw new Error("bad status");
      return res.json();
    })
    .then(function (rows) {
      // Rows that haven't been given a title and description yet are skipped.
      var items = rows.filter(function (a) { return a.title && a.blurb; });
      try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
      show(items);
    })
    .catch(function () {
      if (shown === null) status("Couldn't load the achievements. Please try again later.");
    });
})();

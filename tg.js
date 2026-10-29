// tg.js — the stated-target card ("The job you named") and the ladder
// strips on match cards (Matchmaker 2.0 core B, 28.10.2026).
// Extracted into its own file because mentor.html is at the Vercel
// per-file upload ceiling; the page only carries the <script> tag.
//
// Presentation only, the sh.js pattern: everything rendered here was
// decided by the deterministic engine (result.target_evaluation and
// each candidate's ladder / floor_path, api/_lib/engine/targets.mjs +
// ladders.mjs). This file never re-scores, never matches a name and
// never fetches: it reads window.lastResult / window.live (the page's
// bridge) and paints what the result already contains.
//
// The page renders the verdict into #verdictBody in one innerHTML
// write (renderResult) and appends the letter afterwards; a
// MutationObserver on #verdictBody re-runs the (idempotent) enhance
// pass after every such write, so the target card and the ladder
// strips land in the DOM the page actually shows — in verdict modes
// and in insufficient_data mode alike (the engine evaluates a named
// goal in every mode: the evaluation is not a match and owes no
// verdict).
(function () {
  var css = document.createElement("style");
  css.id = "tgCardCss";
  css.textContent =
    ".tg-card{margin-top:14px;background:#EFEAF9;border:2px solid #3A2340;box-shadow:none}" +
    ".tg-inner{border:1.5px dashed #B79CE0;border-radius:18px;padding:14px 16px}" +
    ".tg-pill{display:inline-block;background:#1C1A1F;color:#fff;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.09em;text-transform:uppercase;padding:5px 11px;border-radius:999px}" +
    ".tg-name{display:block;font-family:Outfit,sans-serif;font-size:19px;margin-top:8px}" +
    ".tg-line{margin-top:6px;font-size:14.5px;line-height:1.55;color:#4c4457}" +
    ".tg-blocked{margin:8px 0 2px;padding-left:20px;display:grid;gap:5px;font-size:15px;line-height:1.5}" +
    ".tg-path{margin-top:10px;background:#fff;border:1.5px dashed #E9A8C6;border-radius:14px;padding:10px 12px}" +
    ".tg-path-h{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#7a1042}" +
    ".tg-chain{margin-top:6px;font-size:15px;line-height:1.55}" +
    ".tg-ladder{margin-top:10px;border-top:1.5px dashed #E9A8C6;padding-top:8px;font-size:14px;line-height:1.55;color:#4c4457}";
  if (!document.getElementById("tgCardCss")) document.head.appendChild(css);
})();

function tgEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function tgFitWord(c) { return { A: "Top fit", B: "Good fit", C: "Weak fit", D: "Not a fit" }[c] || ""; }
function tgMoney(k) { return (typeof k === "number" && isFinite(k)) ? "$" + (Math.round(k * 10) / 10) + "K" : null; }
function tgDur(m) {
  if (typeof m !== "number" || !isFinite(m)) return null;
  if (m < 12) { var v = Math.round(m * 2) / 2; return (v <= 1 ? "about 1 month" : "about " + v + " months"); }
  var y = Math.round((m / 12) * 10) / 10;
  return "about " + y + (y === 1 ? " year" : " years");
}
function tgYears(y) {
  if (typeof y !== "number" || !isFinite(y)) return null;
  var v = Math.round(y * 10) / 10;
  return "about " + v + (v === 1 ? " year" : " years");
}
function tgBand(b) {
  if (!b || typeof b.lo !== "number" || typeof b.hi !== "number") return null;
  return Math.round(b.lo * 100) + "–" + Math.round(b.hi * 100) + "%";
}

var TG_FIELD_LABELS = {
  health: "healthcare", trades: "the trades, construction and engineering",
  tech: "tech and IT", creative: "creative and media work",
  business: "business and finance", education: "education, teaching and coaching",
  transport: "logistics and transport", food: "hospitality and food",
  beauty: "beauty and personal care", public_service: "public service and safety",
};

// The printed floor path (floor_path.steps are rungs of the job's own
// ladder, rung zero = the job itself): "CNA (~$42K) → LPN (~$64K) → …".
function tgPathHtml(fp, floorK) {
  if (!fp || !fp.reaches_floor) return "";
  var steps = Array.isArray(fp.steps) ? fp.steps : [];
  var chain = steps.map(function (s) {
    return tgEsc(s.name) + (tgMoney(s.pay_k) ? " (~" + tgMoney(s.pay_k) + ")" : "");
  }).join(" → ");
  var h = '<div class="tg-path">';
  h += '<div class="tg-path-h">🪜 The path over your floor</div>';
  if (chain) h += '<div class="tg-chain">' + chain + "</div>";
  var tail = "";
  if (fp.via_name && tgMoney(fp.via_pay_k)) tail = "Reaches " + tgEsc(fp.via_name) + " at ~" + tgMoney(fp.via_pay_k);
  if (tgYears(fp.years_to_floor)) tail += (tail ? " in " : "") + tgYears(fp.years_to_floor) + " of steps";
  if (floorK != null && tgMoney(floorK)) tail += " — over the " + tgMoney(floorK) + " minimum you named";
  if (tail) h += '<p class="tg-line">' + tail + ". The ladder is the pay story here — printed, not hidden.</p>";
  h += "</div>";
  return h;
}

// The compact ladder strip for a match card: the pay path when the
// floor is cleared by ladder (mandatory — the status claims a path,
// so the path is shown), else the first rung in and the rungs up.
function tgLadderHtml(c, floorK) {
  if (!c) return "";
  if (c.floor_status === "clears_via_ladder" && c.floor_path && c.floor_path.reaches_floor) {
    return '<div class="tg-ladder">' + tgPathHtml(c.floor_path, floorK) + "</div>";
  }
  var lad = c.ladder || {};
  var entry = Array.isArray(lad.entry_steps) ? lad.entry_steps : [];
  var next = Array.isArray(lad.next_steps) ? lad.next_steps : [];
  if (!entry.length && !next.length) return "";
  var parts = [];
  if (entry.length) {
    var s = entry[0];
    var line = "🪜 Ladder in: " + tgEsc(s.name) + " first";
    var bits = [];
    if (tgDur(s.training_months)) bits.push(tgDur(s.training_months));
    if (tgMoney(s.cost_k)) bits.push("~" + tgMoney(s.cost_k) + " to enter");
    if (bits.length) line += " (" + bits.join(", ") + ")";
    line += " → then this job";
    parts.push(line);
  }
  if (next.length) {
    parts.push("Grows to: " + next.map(function (n) { return tgEsc(n.name); }).join(" → "));
  }
  return '<div class="tg-ladder">' + parts.join("<br>") + "</div>";
}

// One stated-target evaluation card. NOT a match card: its own frame
// (solid plum border, dashed inner frame, black pill) says so — the
// same deliberate distinction the side-hustle card makes, in the
// lavender of the stats tile instead of the side hustle's blush.
function tgTargetCardHtml(card, r) {
  var h = '<div class="card tg-card"><div class="tg-inner">';
  h += '<span class="tg-pill">🎯 The job you named</span>';
  if (!card.matched) {
    h += '<b class="tg-name">“' + tgEsc(card.requested) + '”</b>';
    if (card.note) h += '<p class="tg-line">' + tgEsc(card.note) + "</p>";
    if (card.nearest_field && TG_FIELD_LABELS[card.nearest_field]) {
      h += '<p class="tg-line">Closest field in the checked base: ' + tgEsc(TG_FIELD_LABELS[card.nearest_field]) + ".</p>";
    }
    h += "</div></div>";
    return h;
  }
  h += '<b class="tg-name">' + tgEsc(card.name) + "</b>";
  var badges = "";
  if (tgFitWord(card.category)) badges += ' <span class="badge">' + tgEsc(tgFitWord(card.category)) + "</span>";
  if (card.verdict) badges += ' <span class="badge ' + (card.verdict === "YES" ? "yes" : "no") + '">' + tgEsc(card.verdict) + "</span>";
  if (card.floor_status === "below_floor") badges += ' <span class="badge floor">Below your floor</span>';
  if (badges) h += "<div>" + badges + "</div>";
  if (card.requested && card.name && card.requested !== card.name) {
    h += '<p class="tg-line">You named it: “' + tgEsc(card.requested) + '”.</p>';
  }
  var chem = tgBand(card.love), pot = tgBand(card.potential);
  if (chem || pot) {
    var sc = [];
    if (chem) sc.push("Chemistry " + chem);
    if (pot) sc.push("Long-term potential " + pot);
    h += '<p class="tg-line">' + sc.join(" · ") + " — your own answers, same measure as the matches.</p>";
  }
  var facts = [];
  if (tgMoney(card.pay_k)) facts.push("Typical pay ~" + tgMoney(card.pay_k));
  if (tgDur(card.training_months)) facts.push("entry training " + tgDur(card.training_months));
  if (facts.length) h += '<p class="tg-line">' + facts.join(" · ") + ".</p>";

  var floorK = (r && typeof r.income_floor_k === "number") ? r.income_floor_k : null;
  var blocks = Array.isArray(card.ruled_out_by) ? card.ruled_out_by : [];
  if (card.in_top3) {
    h += '<p class="tg-line">✅ It stands in your three above — at its honest grade, not a promoted one.</p>';
  } else if (card.seatable) {
    h += '<p class="tg-line">It passed every line you set — nothing you named rules it out. It did not take one of the three seats; the three above graded stronger for you.</p>';
  } else if (blocks.length) {
    h += '<p class="tg-line">🚫 For you, this door is shut — by lines you set yourself:</p>';
    h += '<ul class="tg-blocked">';
    blocks.forEach(function (b) {
      h += "<li>" + tgEsc(b.detail || b.name || b.filter) + "</li>";
    });
    h += "</ul>";
  }
  // The floor story: the printed path when the ladder is what clears
  // it (Marina's RN is exactly this case — blocked AND pathed), else
  // one plain sentence naming which leg held or failed.
  if (card.floor_path && card.floor_path.reaches_floor) {
    h += tgPathHtml(card.floor_path, floorK);
  } else if (floorK != null && tgMoney(card.pay_k)) {
    if (card.floor_status === "clears") {
      h += '<p class="tg-line">Typical pay is at or over the ' + tgMoney(floorK) + " minimum you named.</p>";
    } else if (card.floor_status === "top_tier_only") {
      h += '<p class="tg-line">Typical pay starts under your ' + tgMoney(floorK) + " minimum — this job clears it only at the top-earner tier.</p>";
    } else if (card.floor_status === "top_decile_only") {
      h += '<p class="tg-line">Typical pay starts under your ' + tgMoney(floorK) + " minimum — only roughly the top tenth of earners clear it.</p>";
    } else if (card.floor_status === "below_floor") {
      h += '<p class="tg-line">Typical pay is under your ' + tgMoney(floorK) + " minimum — and no checked ladder or top-earner figure clears it.</p>";
    }
  }
  // The ladder in and up, when the profession carries one.
  var lad = card.ladder || {};
  var entry = card.entry_step || (Array.isArray(lad.entry_steps) && lad.entry_steps.length ? lad.entry_steps[0] : null);
  var next = Array.isArray(lad.next_steps) ? lad.next_steps : [];
  var ladLines = [];
  if (entry) {
    var line = "🪜 The road in starts lower and faster: " + tgEsc(entry.name) + " first";
    var bits = [];
    if (tgDur(entry.training_months)) bits.push(tgDur(entry.training_months));
    if (tgMoney(entry.cost_k)) bits.push("~" + tgMoney(entry.cost_k) + " to enter");
    if (bits.length) line += " (" + bits.join(", ") + ")";
    line += " — a real rung under you while the longer road runs.";
    ladLines.push(line);
  }
  if (next.length) {
    ladLines.push("From " + tgEsc(card.name) + " the ladder grows: " + next.map(function (n) { return tgEsc(n.name); }).join(" → ") + ".");
  }
  var prereqs = Array.isArray(lad.prerequisites) ? lad.prerequisites : [];
  if (prereqs.length) {
    ladLines.push("What must be true first: " + prereqs.map(function (p) {
      var w = tgEsc(p.what || p);
      return /[.!?]$/.test(w) ? w : w + ".";
    }).join(" "));
  }
  if (ladLines.length) h += '<p class="tg-line">' + ladLines.join("<br>") + "</p>";
  h += "</div></div>";
  return h;
}

function tgResult() {
  try {
    var l = window.live;
    if (l && l.session && l.session.result) return l.session.result;
  } catch (e) { /* bridge not ready — fall through */ }
  return window.lastResult || null;
}

var tgTimer = null;
function tgEnhance() {
  var body = document.getElementById("verdictBody");
  if (!body) return;
  var r = tgResult();
  if (!r) return;
  var floorK = (typeof r.income_floor_k === "number") ? r.income_floor_k : null;

  // Ladder strips on the top-3 match cards (never on anti cards).
  var anti = document.getElementById("antiBlock");
  (r.top3 || []).forEach(function (c) {
    var strip = tgLadderHtml(c, floorK);
    if (!strip || !c.slug) return;
    var els = body.querySelectorAll('.card[data-cardslug="' + c.slug + '"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (anti && anti.contains(el)) continue;
      if (el.getAttribute("data-tg-ladder")) continue;
      el.setAttribute("data-tg-ladder", "1");
      var div = document.createElement("div");
      div.innerHTML = strip;
      el.appendChild(div.firstChild);
    }
  });

  // The stated-target section: right after the last top-3 card; in
  // insufficient_data mode (no top-3 exists) before the anti block /
  // letter, else at the end of the verdict body.
  var evals = Array.isArray(r.target_evaluation) ? r.target_evaluation : [];
  if (evals.length && !document.getElementById("tgTargetBlock")) {
    var block = document.createElement("div");
    block.id = "tgTargetBlock";
    block.innerHTML = evals.map(function (card) { return tgTargetCardHtml(card, r); }).join("");
    var topEls = [];
    body.querySelectorAll(".card[data-cardslug]").forEach(function (el) {
      if (anti && anti.contains(el)) return;
      topEls.push(el);
    });
    var last = topEls.length ? topEls[topEls.length - 1] : null;
    var letter = body.querySelector(".letter-card");
    if (last && last.parentNode === body) body.insertBefore(block, last.nextSibling);
    else if (anti && anti.parentNode === body) body.insertBefore(block, anti);
    else if (letter && letter.parentNode === body) body.insertBefore(block, letter);
    else body.appendChild(block);
  }
}
function tgSchedule() {
  if (tgTimer) return;
  tgTimer = setTimeout(function () { tgTimer = null; tgEnhance(); }, 30);
}
window.tgEnhance = tgEnhance;

(function tgBoot() {
  var body = document.getElementById("verdictBody");
  if (body && window.MutationObserver) {
    new MutationObserver(tgSchedule).observe(body, { childList: true });
  }
  // Belt and braces for any render path that predates the observer.
  var n = 0;
  var iv = setInterval(function () { tgEnhance(); if (++n >= 10) clearInterval(iv); }, 800);
})();

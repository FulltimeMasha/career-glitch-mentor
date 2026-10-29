// x2.js — Matchmaker 2.0 extension surfaces (brief 28.10 §5.4-5.6, 5.8):
// state pay lines (BLS OEWS May 2024), real programs for a ladder's first
// step, the foreign-degree bridge card, and the "Save my plan" block.
// Extracted into its own file because mentor.html is at the Vercel
// per-file upload ceiling; the page only carries the <script> tag.
//
// Presentation only, the tg.js pattern: everything painted here was
// decided server-side by the deterministic engine (result.state_pay,
// card.pay_state / pay_state_k, ladder step programs, bridge_evaluation).
// This file never re-scores, never estimates a figure and never invents
// a program: what the result does not carry is simply not shown.
(function () {
  var css = document.createElement("style");
  css.id = "x2Css";
  css.textContent =
    ".x2-statepay{margin-top:8px;font-size:14px;line-height:1.5;color:#7a1042}" +
    ".x2-prog{margin-top:10px;background:#FFEEF5;border:1.5px dashed #E9A8C6;border-radius:14px;padding:10px 12px}" +
    ".x2-prog-h{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#7a1042}" +
    ".x2-prog-item{margin-top:8px;font-size:14.5px;line-height:1.5}" +
    ".x2-prog-note{margin-top:2px;font-size:13px;line-height:1.45;color:#4c4457}" +
    ".x2-bridge{margin-top:14px;background:#F0E6CF;border:2px solid #3A2340}" +
    ".x2-bridge-in{border:1.5px dashed #B79CE0;border-radius:18px;padding:14px 16px}" +
    ".x2-pill{display:inline-block;background:#1C1A1F;color:#fff;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.09em;text-transform:uppercase;padding:5px 11px;border-radius:999px}" +
    ".x2-name{display:block;font-family:Outfit,sans-serif;font-size:19px;margin-top:8px}" +
    ".x2-line{margin-top:6px;font-size:14.5px;line-height:1.55;color:#4c4457}" +
    ".x2-steps{margin:10px 0 2px;padding-left:20px;display:grid;gap:8px;font-size:14.5px;line-height:1.5}" +
    ".x2-plan{margin-top:16px;background:#fff;border:2px solid #3A2340;border-radius:18px;padding:16px}" +
    ".x2-plan h3{font-family:Outfit,sans-serif;font-size:19px;margin:0 0 6px}" +
    ".x2-plan-inp{width:100%;box-sizing:border-box;margin-top:10px;padding:11px 13px;border:1.5px solid rgba(28,26,31,.25);border-radius:12px;font-size:15.5px;background:#FAF5EC}" +
    ".x2-plan-consent{display:flex;gap:9px;align-items:flex-start;margin-top:11px;font-size:14px;line-height:1.45;color:#4c4457;cursor:pointer}" +
    ".x2-plan-consent input{margin-top:2px;width:17px;height:17px;accent-color:#DE7CA8}" +
    ".x2-plan-btn{margin-top:12px}" +
    ".x2-plan-msg{margin-top:10px;font-size:14.5px;line-height:1.5}" +
    ".x2-plan-err{color:#9E2A3A}" +
    ".x2-plan-ok{color:#1d6b3c}";
  if (!document.getElementById("x2Css")) document.head.appendChild(css);
})();

function x2Esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function x2Money(k) { return (typeof k === "number" && isFinite(k)) ? "$" + (Math.round(k * 10) / 10) + "K" : null; }
function x2Dollars(k) {
  if (typeof k !== "number" || !isFinite(k)) return null;
  return "$" + Math.round(k * 1000).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function x2Dur(m) {
  if (typeof m !== "number" || !isFinite(m)) return null;
  if (m < 12) { var v = Math.round(m * 2) / 2; return (v <= 1 ? "about 1 month" : "about " + v + " months"); }
  var y = Math.round((m / 12) * 10) / 10;
  return "about " + y + (y === 1 ? " year" : " years");
}
function x2Result() {
  try {
    var l = window.live;
    if (l && l.session && l.session.result) return l.session.result;
  } catch (e) { /* bridge not ready — fall through */ }
  return window.lastResult || null;
}

function x2StateLine(card) {
  var sp = card && card.pay_state;
  if (!sp || typeof sp.median_k !== "number") return "";
  var s = "📍 In " + x2Esc(sp.name || sp.state) + ": median about " + x2Money(sp.median_k);
  if (sp.top_coded) s += " or more";
  s += " (BLS OEWS, May 2024)";
  var nat = (typeof card.payK === "number") ? card.payK : (typeof card.pay_k === "number" ? card.pay_k : null);
  if (nat != null && x2Money(nat)) s += " — against " + x2Money(nat) + " nationally";
  return s + ".";
}

function x2ProgramsHtml(programs) {
  if (!Array.isArray(programs) || !programs.length) return "";
  var h = '<div class="x2-prog"><div class="x2-prog-h">🎓 Real programs for this step, near you</div>';
  programs.forEach(function (p) {
    h += '<div class="x2-prog-item"><b>' + x2Esc(p.school) + "</b> — " + x2Esc(p.program);
    var bits = [];
    if (x2Dollars(p.cost_k)) bits.push("~" + x2Dollars(p.cost_k));
    if (x2Dur(p.months)) bits.push(x2Dur(p.months));
    if (p.city) bits.push(x2Esc(p.city));
    if (bits.length) h += " · " + bits.join(" · ");
    h += "</div>";
    if (p.cost_note) h += '<p class="x2-prog-note">' + x2Esc(p.cost_note) + "</p>";
  });
  h += '<p class="x2-prog-note">From the schools\' own published figures — check the current price with the school before you enroll.</p></div>';
  return h;
}

function x2FirstStepPrograms(card) {
  var lad = (card && card.ladder) || {};
  var entry = Array.isArray(lad.entry_steps) ? lad.entry_steps : [];
  if (card && card.entry_step && Array.isArray(card.entry_step.programs)) return card.entry_step.programs;
  return entry.length && Array.isArray(entry[0].programs) ? entry[0].programs : null;
}

function x2BridgeHtml(be) {
  var d = be.degree || {};
  var title = (d.level_label ? d.level_label + " in " : "Degree in ") + (d.field_label || "your field");
  var h = '<div class="card x2-bridge"><div class="x2-bridge-in">';
  h += '<span class="x2-pill">🌍 Your degree — the bridge</span>';
  h += '<b class="x2-name">' + x2Esc(title) + "</b>";
  var meta = [];
  if (d.country) meta.push("earned in " + x2Esc(d.country));
  if (typeof d.years_in_field === "number") meta.push(d.years_in_field + (d.years_in_field === 1 ? " year" : " years") + " working in the field");
  if (meta.length) h += '<p class="x2-line">' + meta.join(" · ") + ".</p>";
  h += '<p class="x2-line">A foreign degree is not a dead end here — it has its own route. The steps are fixed, in this order:</p>';
  h += '<ol class="x2-steps">';
  (be.steps || []).forEach(function (s) {
    h += "<li><b>" + x2Esc(s.title) + "</b><br>" + x2Esc(s.text) + "</li>";
  });
  h += "</ol>";
  if (be.evaluator_note) h += '<p class="x2-line">' + x2Esc(be.evaluator_note) + "</p>";
  if (be.credit && be.credit.note) h += '<p class="x2-line">' + x2Esc(be.credit.note) + "</p>";
  h += "</div></div>";
  return h;
}

function x2PlanHtml() {
  var lead = null;
  try { lead = typeof window.cgLead === "function" ? window.cgLead() : null; } catch (e) {}
  var email = lead && lead.email ? lead.email : "";
  var h = '<div class="x2-plan" id="x2Plan">';
  h += "<h3>💾 Save my plan</h3>";
  h += '<p class="x2-line">Your full plan — the matches, the job you named, the ladders and the real programs — saved under your email, so it is yours to come back to. Free. No card. No phone number. Your email is never sold and never shared.</p>';
  h += '<input class="x2-plan-inp" id="x2PlanEmail" type="email" autocomplete="email" inputmode="email" placeholder="you@email.com" value="' + x2Esc(email) + '">';
  h += '<label class="x2-plan-consent"><input type="checkbox" id="x2PlanConsent"><span>Yes — save my plan under this email.</span></label>';
  h += '<button type="button" class="btn x2-plan-btn" id="x2PlanGo">Save my plan</button>';
  h += '<p class="x2-plan-msg" id="x2PlanMsg" hidden></p>';
  h += "</div>";
  return h;
}

async function x2PlanSubmit() {
  var msg = document.getElementById("x2PlanMsg");
  var btn = document.getElementById("x2PlanGo");
  var email = (document.getElementById("x2PlanEmail").value || "").trim();
  var consent = document.getElementById("x2PlanConsent").checked;
  function show(text, ok) {
    msg.hidden = false;
    msg.className = "x2-plan-msg " + (ok ? "x2-plan-ok" : "x2-plan-err");
    msg.textContent = text;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { show("That email doesn't look right — check it and try again.", false); return; }
  if (!consent) { show("Tick the consent box first — your plan is saved only with your OK.", false); return; }
  var live = null;
  try { live = window.live; } catch (e) {}
  if (!live || !live.session || typeof window.api !== "function") { show("The plan isn't ready to save yet — finish the interview first.", false); return; }
  var lead = null;
  try { lead = typeof window.cgLead === "function" ? window.cgLead() : null; } catch (e) {}
  btn.disabled = true;
  var orig = btn.textContent;
  btn.textContent = "Saving…";
  try {
    var res = await window.api({
      action: "plan_save",
      email: email,
      consent: true,
      lead_id: lead && lead.id ? lead.id : undefined,
      session_id: live.session_id,
      session: live.session,
    });
    if (res && res.json && res.json.ok && res.json.saved) {
      show("Saved. Your full plan is stored under " + email + " — exactly as it stands on this screen.", true);
      btn.textContent = "✓ Saved";
      return;
    }
    var err = res && res.json && res.json.error ? res.json.error : "That did not save — try again in a moment.";
    if (res && res.status === 503) err = "Saving plans isn't switched on yet — your plan is on this screen; keep this tab or screenshot it.";
    show(err, false);
    btn.disabled = false;
    btn.textContent = orig;
  } catch (e) {
    show("That did not save — your plan is still on this screen; try again in a moment.", false);
    btn.disabled = false;
    btn.textContent = orig;
  }
}

var x2Timer = null;
function x2Enhance() {
  var body = document.getElementById("verdictBody");
  if (!body) return;
  var r = x2Result();
  if (!r) return;
  var anti = document.getElementById("antiBlock");

  // State pay + programs on the top-3 match cards.
  (r.top3 || []).forEach(function (c) {
    if (!c || !c.slug) return;
    var line = x2StateLine(c);
    var progs = x2FirstStepPrograms(c);
    if (!line && !progs) return;
    var els = body.querySelectorAll('.card[data-cardslug="' + c.slug + '"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (anti && anti.contains(el)) continue;
      if (line && !el.getAttribute("data-x2-sp")) {
        el.setAttribute("data-x2-sp", "1");
        var p = document.createElement("p");
        p.className = "x2-statepay";
        p.textContent = line;
        el.appendChild(p);
      }
      if (progs && !el.getAttribute("data-x2-prog")) {
        el.setAttribute("data-x2-prog", "1");
        var d = document.createElement("div");
        d.innerHTML = x2ProgramsHtml(progs);
        el.appendChild(d.firstChild);
      }
    }
  });

  // Inside the stated-target block: the target's state pay, the state
  // version of its floor path, and the first step's real programs.
  var tb = document.getElementById("tgTargetBlock");
  if (tb && !tb.getAttribute("data-x2-tg")) {
    var evals = Array.isArray(r.target_evaluation) ? r.target_evaluation : [];
    var card = null;
    for (var j = 0; j < evals.length; j++) { if (evals[j] && evals[j].matched) { card = evals[j]; break; } }
    if (card) {
      var bits = "";
      var tLine = x2StateLine(card);
      if (tLine) bits += '<p class="x2-statepay">' + x2Esc(tLine) + "</p>";
      var steps = (card.floor_path && Array.isArray(card.floor_path.steps)) ? card.floor_path.steps : [];
      var withPay = steps.filter(function (s) { return typeof s.pay_state_k === "number"; });
      if (withPay.length >= 2 && r.state_pay && r.state_pay.name) {
        var chain = withPay.map(function (s) { return x2Esc(s.name) + " ~" + x2Money(s.pay_state_k); }).join(" → ");
        bits += '<p class="x2-statepay">📍 In ' + x2Esc(r.state_pay.name) + " the same path pays: " + chain + ".</p>";
      }
      var tProgs = x2FirstStepPrograms(card);
      if (tProgs) bits += x2ProgramsHtml(tProgs);
      if (bits) {
        tb.setAttribute("data-x2-tg", "1");
        var holder = document.createElement("div");
        holder.innerHTML = bits;
        while (holder.firstChild) tb.appendChild(holder.firstChild);
      }
    }
  }

  // The bridge card for a foreign degree.
  if (r.bridge_evaluation && !document.getElementById("x2Bridge")) {
    var b = document.createElement("div");
    b.id = "x2Bridge";
    b.innerHTML = x2BridgeHtml(r.bridge_evaluation);
    var letter = body.querySelector(".letter-card");
    if (tb && tb.parentNode === body) body.insertBefore(b, tb.nextSibling);
    else if (anti && anti.parentNode === body) body.insertBefore(b, anti);
    else if (letter && letter.parentNode === body) body.insertBefore(b, letter);
    else body.appendChild(b);
  }

  // Save-my-plan block at the end of the verdict.
  if (!document.getElementById("x2Plan")) {
    var pb = document.createElement("div");
    pb.innerHTML = x2PlanHtml();
    body.appendChild(pb.firstChild);
    document.getElementById("x2PlanGo").addEventListener("click", x2PlanSubmit);
  }
}
function x2Schedule() {
  if (x2Timer) return;
  x2Timer = setTimeout(function () { x2Timer = null; x2Enhance(); }, 40);
}
window.x2Enhance = x2Enhance;

(function x2Boot() {
  var body = document.getElementById("verdictBody");
  if (body && window.MutationObserver) {
    new MutationObserver(x2Schedule).observe(body, { childList: true });
  }
  var n = 0;
  var iv = setInterval(function () { x2Enhance(); if (++n >= 10) clearInterval(iv); }, 900);
})();

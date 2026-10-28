// lead.js — Matchmaker lead gate + verdict reaction (founder TZ, 28.10.2026).
// Loaded after pg.js. Everything lives in this file because mentor.html is
// at the per-file upload ceiling; the page only carries the <script> tag.
//
// What it does:
//   * Before the interview can start (first tap on any door), it shows the
//     gate: name + email + one optional line — "your job now, or the job
//     you want" — with the free note up front. The lead is written by the
//     SERVER (action 'lead'); no interview answers are ever sent with it.
//   * If the save fails, the person is never trapped: "Try again" or
//     "Continue without saving" — the interview proceeds either way.
//   * After the verdict, it asks the server to attach the recommendation
//     snapshot to the same lead (action 'lead_verdict' — the server
//     recomputes the top-3 from the session itself) and renders the
//     three reaction circles under the matchmaker's letter; a tap sends
//     action 'lead_reaction' and can be changed by tapping another one.
//
// State is memory-only, like the rest of the page: a reload restarts
// everything, the lead id included. Nothing is written to localStorage.
(function () {
  "use strict";

  var css = document.createElement("style");
  css.id = "leadCss";
  css.textContent =
    ".lead-ovl{position:fixed;inset:0;z-index:1000;background:rgba(58,35,64,.48);display:flex;align-items:center;justify-content:center;padding:16px}" +
    ".lead-ovl[hidden]{display:none}" +
    ".lead-card{background:#fff;border-radius:26px;box-shadow:0 24px 60px rgba(28,26,31,.25);padding:26px 24px;max-width:430px;width:100%;max-height:92vh;overflow:auto}" +
    ".lead-card h3{font-family:Outfit,sans-serif;font-weight:700;font-size:23px;margin:0 0 6px;color:var(--ink)}" +
    ".lead-sub{font-size:15px;line-height:1.5;color:#4c4457;margin:0 0 16px}" +
    ".lead-lab{display:block;font-family:Outfit,sans-serif;font-weight:600;font-size:14.5px;margin:0 0 12px;color:var(--ink)}" +
    ".lead-lab .lead-opt{font-weight:400;color:#8a8194;font-size:13px}" +
    ".lead-inp{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:13px 14px;font:inherit;font-size:16px;color:var(--ink);background:#fff;border:1.5px solid rgba(28,26,31,.18);border-radius:13px}" +
    ".lead-inp:focus{outline:none;border-color:#DE7CA8;box-shadow:0 0 0 3px #FFE9F3}" +
    ".lead-free{display:inline-block;background:#FFE9F3;color:#7a1042;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.06em;text-transform:uppercase;padding:6px 12px;border-radius:99px;margin:2px 0 14px}" +
    ".lead-go{width:100%;margin-top:2px}" +
    ".lead-err{background:#FDECEC;border:1px solid #d64545;color:#7c1d1d;border-radius:13px;padding:11px 14px;font-size:14.5px;line-height:1.45;margin-top:14px}" +
    ".lead-fail{background:#FFF6E9;border:1.5px dashed rgba(233,168,198,.9);border-radius:13px;padding:13px 14px;margin-top:14px}" +
    ".lead-fail p{margin:0 0 10px;font-size:14.5px;line-height:1.45}" +
    ".lead-fail .row{display:flex;gap:8px;flex-wrap:wrap}" +
    ".lead-mini{flex:1;font:inherit;font-weight:600;font-size:14.5px;padding:11px 10px;border-radius:12px;border:1.5px solid rgba(28,26,31,.18);background:#fff;color:var(--ink);cursor:pointer}" +
    ".lead-mini.rose{background:#DE7CA8;border-color:#DE7CA8;color:#fff}" +
    ".lead-react{margin-top:18px;background:#fff;border:2px solid var(--line);border-radius:26px;padding:20px;text-align:center}" +
    ".lead-react-q{font-family:Outfit,sans-serif;font-weight:700;font-size:18px;margin-bottom:12px}" +
    ".lead-react-row{display:flex;gap:14px;justify-content:center}" +
    ".lead-dot{width:64px;height:64px;border-radius:50%;border:2px solid rgba(28,26,31,.12);background:#FAF5EC;font-size:30px;line-height:1;cursor:pointer;padding:0;transition:transform .12s,border-color .12s,background .12s}" +
    ".lead-dot:hover{border-color:#E9A8C6}" +
    ".lead-dot.sel{border-color:#DE7CA8;background:#FFE9F3;transform:scale(1.07)}" +
    ".lead-react-done{margin-top:12px;font-size:14.5px;color:#4c4457}";
  if (!document.getElementById("leadCss")) document.head.appendChild(css);

  var S = {
    id: null,          // lead id from the server (null when unsaved)
    done: false,       // gate passed (saved OR continued without saving)
    pendingBtn: null,  // the door button whose tap opened the gate
    saving: false,
    snapshot: false,   // verdict snapshot attach attempted-ok
    reactAttached: false,
    verdictAt: 0,
    reaction: null,
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function callApi(body) {
    if (typeof window.api === "function") return window.api(body);
    return fetch("/api/mentor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, json: j }; }, function () { return { status: r.status, json: null }; });
    });
  }
  function coarseUa() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return "mobile";
    } catch (e) {}
    return window.innerWidth && window.innerWidth < 720 ? "mobile" : "desktop";
  }

  // ---------------------------------------------------------------- gate
  var ovl = null;
  function buildGate() {
    ovl = document.createElement("div");
    ovl.className = "lead-ovl";
    ovl.id = "leadOvl";
    ovl.hidden = true;
    ovl.innerHTML =
      '<div class="lead-card" role="dialog" aria-modal="true" aria-labelledby="leadTitle">' +
      '<h3 id="leadTitle">First — who am I matching?</h3>' +
      '<p class="lead-sub">Your name and email, so your letter from the Matchmaker and your 90-day plan have somewhere to land. The interview itself runs right here — about 10 minutes.</p>' +
      '<span class="lead-free">Free — no card, ever.</span>' +
      '<label class="lead-lab">Your name<input class="lead-inp" id="leadName" type="text" autocomplete="name" placeholder="e.g. Jenna"></label>' +
      '<label class="lead-lab">Email<input class="lead-inp" id="leadEmail" type="email" autocomplete="email" inputmode="email" placeholder="you@email.com"></label>' +
      '<label class="lead-lab">Your job now — or the job you want <span class="lead-opt">(optional)</span><input class="lead-inp" id="leadRole" type="text" placeholder="e.g. support team lead — or: nurse, one day"></label>' +
      '<button type="button" class="btn lead-go" id="leadGo">Start the interview &rarr;</button>' +
      '<div class="lead-err" id="leadErr" hidden></div>' +
      '<div class="lead-fail" id="leadFail" hidden><p>That didn&rsquo;t save on my side — nothing about you is lost, and the match itself does not depend on it.</p>' +
      '<div class="row"><button type="button" class="lead-mini rose" id="leadRetry">Try again</button>' +
      '<button type="button" class="lead-mini" id="leadSkip">Continue without saving</button></div></div>' +
      "</div>";
    document.body.appendChild(ovl);
    $("leadGo").addEventListener("click", submitGate);
    $("leadRetry").addEventListener("click", submitGate);
    $("leadSkip").addEventListener("click", function () {
      S.done = true; // continued unsaved on purpose — never re-ask this visit
      closeGate();
      proceed();
    });
    ovl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target && e.target.classList && e.target.classList.contains("lead-inp")) {
        e.preventDefault();
        submitGate();
      }
    });
  }
  function openGate(btn) {
    if (!ovl) buildGate();
    S.pendingBtn = btn;
    $("leadErr").hidden = true;
    $("leadFail").hidden = true;
    ovl.hidden = false;
    var n = $("leadName");
    if (n) setTimeout(function () { try { n.focus(); } catch (e) {} }, 60);
  }
  function closeGate() { if (ovl) ovl.hidden = true; }
  function proceed() {
    var b = S.pendingBtn;
    S.pendingBtn = null;
    if (b) b.click(); // gate is done — this tap now reaches the door's own handler
  }
  function gateError(msg) {
    var e = $("leadErr");
    e.textContent = msg;
    e.hidden = false;
  }
  async function submitGate() {
    if (S.saving) return;
    var name = $("leadName").value.trim();
    var email = $("leadEmail").value.trim();
    var role = $("leadRole").value.trim();
    $("leadErr").hidden = true;
    $("leadFail").hidden = true;
    if (!name) { gateError("I need a name to match you — a first name is fine."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { gateError("That email doesn’t look right — one typo can lose your letter. Check it and tap again."); return; }
    S.saving = true;
    var go = $("leadGo");
    var orig = go.textContent;
    go.disabled = true;
    go.textContent = "One second…";
    try {
      var res = await callApi({ action: "lead", name: name, email: email, self_role: role, ua: coarseUa() });
      if (!res || !res.json || !res.json.ok || !res.json.lead_id) throw new Error("lead save failed");
      S.id = res.json.lead_id;
      S.done = true;
      closeGate();
      proceed();
    } catch (e) {
      $("leadFail").hidden = false; // try again, or continue without saving
    } finally {
      S.saving = false;
      go.disabled = false;
      go.textContent = orig;
    }
  }

  // Intercept the FIRST door tap (capture phase: runs before the door's
  // own handler in both the live and the guided flow, and survives the
  // health probe replacing the buttons with clones).
  document.addEventListener("click", function (e) {
    if (S.done) return;
    var t = e.target;
    var door = t && t.closest ? t.closest(".door") : null;
    if (!door) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    openGate(door);
  }, true);

  // ------------------------------------------------------- verdict hooks
  async function sendSnapshot() {
    var lv = null;
    try { lv = window.live; } catch (e) {}
    if (!lv || !lv.session) throw new Error("no live session");
    var res = await callApi({ action: "lead_verdict", lead_id: S.id, session_id: lv.session_id, session: lv.session });
    if (!res || !res.json || !res.json.ok) throw new Error("snapshot failed");
  }

  function attachReaction(body, letter) {
    S.reactAttached = true;
    if (!S.id) return; // continued without saving — nothing to attach to
    var host = document.createElement("div");
    host.className = "lead-react";
    host.id = "leadReact";
    host.innerHTML =
      '<div class="lead-react-q">How does this match feel?</div>' +
      '<div class="lead-react-row">' +
      '<button type="button" class="lead-dot" data-r="love" aria-label="Love it">😍</button>' +
      '<button type="button" class="lead-dot" data-r="meh" aria-label="Partly">😐</button>' +
      '<button type="button" class="lead-dot" data-r="nope" aria-label="Not for me">😤</button>' +
      "</div>" +
      '<div class="lead-react-done" id="leadReactDone" hidden>Got it — thank you.</div>';
    if (letter && letter.parentNode === body) body.insertBefore(host, letter.nextSibling);
    else body.appendChild(host);
    host.querySelectorAll(".lead-dot").forEach(function (b) {
      b.addEventListener("click", async function () {
        var r = b.getAttribute("data-r");
        if (S.reaction === r) return;
        host.querySelectorAll(".lead-dot").forEach(function (x) { x.classList.toggle("sel", x === b); });
        try {
          var res = await callApi({ action: "lead_reaction", lead_id: S.id, reaction: r });
          if (!res || !res.json || !res.json.ok) throw new Error("reaction failed");
          S.reaction = r;
          $("leadReactDone").hidden = false;
        } catch (e) {
          host.querySelectorAll(".lead-dot").forEach(function (x) { x.classList.remove("sel"); });
        }
      });
    });
  }

  setInterval(function () {
    var lr = null;
    try { lr = window.lastResult; } catch (e) {}
    if (!lr || !lr.top3 || !lr.top3.length) return;
    if (!S.verdictAt) S.verdictAt = Date.now();
    if (S.id && !S.snapshot) {
      S.snapshot = true; // set before send so the poller never duplicates; reset on failure
      sendSnapshot().catch(function () { S.snapshot = false; });
    }
    if (!S.reactAttached) {
      var body = document.getElementById("verdictBody");
      if (!body) return;
      var letter = body.querySelector(".letter-card");
      if (letter || Date.now() - S.verdictAt > 8000) attachReaction(body, letter);
    }
  }, 800);
})();

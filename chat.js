// chat.js — Conversational intake client (founder brief 28.10.2026 §6).
// Loaded last (after pg/lead/sh/tg/x2). Everything lives in this file
// because mentor.html is at the per-file upload ceiling; the page only
// carries the <script> tag and one bridge binding (window.cgRoute).
//
// What it does:
//   * After the lead gate (lead.js owns the first door tap, exactly as
//     before), a door tap starts the CHAT instead of the card flow:
//     one question at a time, answers by typing, by tapping chips with
//     the bank's exact anchors, or both. Extracted facts are shown
//     back on a confirm card with units — nothing is used before the
//     person taps "That's right" (or fixes the card).
//   * The session is the page's own session (window.live): when the
//     chat reaches the real-Tuesday check or the verdict, the flow
//     hands the response to the page's own renderer (window.cgRoute),
//     so the verdict, letter, playground, target cards, side hustle
//     and Save-my-plan all render exactly as in the classic flow.
//   * The classic form stays one tap away at all times: a link on the
//     start screen ("Use the classic form"), a link in the chat
//     header, the 25-message cap, and any chat failure all route to
//     it — mid-chat switches keep the same session, so every
//     confirmed answer carries over.
//   * If the live API is unreachable, this file stays out of the way
//     entirely and the page behaves exactly as before.
(function () {
  "use strict";

  var css = document.createElement("style");
  css.id = "chatCss";
  css.textContent =
    ".chat-panel{margin-top:4px}" +
    ".chat-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px}" +
    ".chat-title{font-family:Outfit,sans-serif;font-weight:700;font-size:19px;color:var(--ink)}" +
    ".chat-meta{font-family:'DM Mono',monospace;font-size:12px;color:#8a8194}" +
    ".chat-classic{font-size:13.5px;color:#7a1042;text-decoration:underline;cursor:pointer;background:none;border:none;font:inherit;padding:0}" +
    ".chat-thread{display:grid;gap:10px;margin:10px 0}" +
    ".chat-cardbox{background:#fff;border:2px solid var(--line);border-radius:20px;padding:16px;margin:10px 0}" +
    ".chat-cardbox.confirm{border-color:#DE7CA8;background:#FFF9FB}" +
    ".chat-cardbox h3{font-family:Outfit,sans-serif;margin:0 0 8px;font-size:17px}" +
    ".chat-line{font-size:15px;line-height:1.45;padding:6px 0;border-bottom:1px dashed rgba(28,26,31,.12)}" +
    ".chat-line:last-of-type{border-bottom:none}" +
    ".chat-line .drop{float:right;color:#b03a6b;cursor:pointer;font-size:13px;background:none;border:none;font:inherit}" +
    ".chat-line.struck{opacity:.45;text-decoration:line-through}" +
    ".chat-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}" +
    ".chat-note{font-size:13.5px;color:#5c5566;margin-top:8px;line-height:1.45}" +
    ".chat-widgets{display:grid;gap:14px;margin:12px 0}" +
    ".chat-widgets label{font-weight:600;font-size:14.5px;display:block;margin-bottom:6px}" +
    ".chat-send{width:100%}" +
    ".chat-startlink{display:block;margin:10px auto 0;font-size:14px;color:#7a1042;background:none;border:none;font:inherit;text-decoration:underline;cursor:pointer;text-align:center;width:100%}" +
    ".chat-err{background:#FDECEC;border:1px solid #d64545;color:#7c1d1d;border-radius:13px;padding:11px 14px;font-size:14.5px;line-height:1.45;margin:10px 0}";
  if (!document.getElementById("chatCss")) document.head.appendChild(css);

  var S = {
    healthy: false,
    classic: false,
    started: false,
    busy: false,
    door: null,
    answers: {},       // widget state for the current packet
    touched: {},       // fields the person actually set on this packet
    rankTouched: {},
    ratings: {},
    fixAnswers: null,  // confirm-card edit state
    mirrorShown: false,
    lastJson: null,
  };
  try {
    if (new URLSearchParams(location.search).get("classic") === "1") S.classic = true;
    if (sessionStorage.getItem("cg_chat") === "off") S.classic = true;
  } catch (e) {}

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
  function live() { try { return window.live; } catch (e) { return null; } }
  function adopt(json) {
    try { window.live = { session_id: json.session_id, session: json.session }; } catch (e) {}
    try { window.store(); } catch (e) {}
    S.lastJson = json;
    renderChecklist(json);
  }
  function renderChecklist(json) {
    var host = $("mmChecklist"); if (!host) return;
    var items = json && json.checklist;
    if (!items || !items.length) { host.classList.add("hidden"); host.innerHTML = ""; return; }
    var icons = { done: "✓", current: "●", todo: "○" };
    var html = '<div class="mm-head">What your matchmaker checks</div><ul>';
    items.forEach(function (it) {
      html += '<li class="' + esc(it.state) + '"><span class="mm-ic">' + (icons[it.state] || "○") + '</span><span>' + esc(it.label) + "</span></li>";
    });
    host.innerHTML = html + "</ul>";
    host.classList.remove("hidden");
  }

  // ------------------------------------------------------------ panel DOM
  var panel = null, threadEl = null, cardEl = null, widgetsEl = null, composerEl = null, metaEl = null;
  function buildPanel() {
    panel = document.createElement("div");
    panel.className = "chat-panel";
    panel.id = "chatPanel";
    panel.innerHTML =
      '<div class="chat-head"><span class="chat-title">💬 Chat with the Matchmaker</span>' +
      '<span class="chat-meta" id="chatMeta"></span>' +
      '<button type="button" class="chat-classic" id="chatClassic">Use the classic form instead →</button></div>' +
      '<div class="chat-thread" id="chatThread"></div>' +
      '<div id="chatCard"></div>' +
      '<div class="chat-widgets" id="chatWidgets"></div>' +
      '<div id="chatComposer">' +
      '<label for="chatText">Your answer — type it, tap the answers above, or mix both</label>' +
      '<textarea id="chatText" placeholder="Be specific. Facts beat self-descriptions."></textarea>' +
      '<button type="button" class="btn chat-send" id="chatSend">Send</button>' +
      '<p class="chat-note">Scored answers (rankings, the 0–4 job pictures, red lines) are taps only — the matchmaker never guesses them from your words. Facts you type are shown back to you before they count.</p>' +
      "</div>";
    var interview = $("interview");
    var stageCard = $("stageCard");
    interview.insertBefore(panel, stageCard);
    threadEl = $("chatThread"); cardEl = $("chatCard"); widgetsEl = $("chatWidgets");
    composerEl = $("chatComposer"); metaEl = $("chatMeta");
    $("chatSend").addEventListener("click", onSend);
    $("chatText").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
    });
    $("chatClassic").addEventListener("click", function () { switchToClassic(); });
  }
  function bubble(who, text) {
    var d = document.createElement("div");
    d.className = "msg " + (who === "mentor" ? "mentor" : "user");
    d.innerHTML = '<div class="who">' + (who === "mentor" ? "Matchmaker" : "You") + "</div><div>" + esc(text) + "</div>";
    threadEl.appendChild(d);
    d.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function errorLine(msg) {
    var d = document.createElement("div");
    d.className = "chat-err";
    d.textContent = msg;
    cardEl.appendChild(d);
    d.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ------------------------------------------------------------ widgets
  function optVal(o) { return (o && typeof o === "object") ? o.value : o; }
  function optLab(o) { return (o && typeof o === "object") ? o.label : String(o); }

  function widget(item, state, onSet) {
    var key = item.field || item.id;
    var wrap = document.createElement("div");
    var lab = document.createElement("label"); lab.textContent = item.label || key; wrap.appendChild(lab);
    if (item.kind === "number") {
      var inp = document.createElement("input"); inp.type = "number";
      if (item.min != null) inp.min = item.min; if (item.max != null) inp.max = item.max;
      if (state[key] != null) inp.value = state[key];
      inp.addEventListener("input", function () { onSet(key, inp.value === "" ? null : Number(inp.value)); });
      wrap.appendChild(inp);
    } else if (item.kind === "text_short") {
      var ti = document.createElement("input"); ti.type = "text";
      if (state[key] != null) ti.value = state[key];
      ti.addEventListener("input", function () { onSet(key, ti.value.trim()); });
      wrap.appendChild(ti);
    } else if (item.kind === "choice") {
      var box = document.createElement("div"); box.className = "choice";
      (item.options || []).forEach(function (o) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = optLab(o);
        if (state[key] === optVal(o)) b.classList.add("sel");
        b.addEventListener("click", function () {
          box.querySelectorAll("button").forEach(function (x) { x.classList.remove("sel"); });
          b.classList.add("sel"); onSet(key, optVal(o));
        });
        box.appendChild(b);
      });
      wrap.appendChild(box);
    } else if (item.kind === "multichoice") {
      var checks = document.createElement("div"); checks.className = "checks";
      if (!Array.isArray(state[key])) state[key] = [];
      var boxes = [];
      (item.options || []).forEach(function (o) {
        var l = document.createElement("label");
        var c = document.createElement("input"); c.type = "checkbox";
        var rec = { c: c, v: optVal(o), ex: !!(o && (o.exclusive === true || optVal(o) === "none" || /^none_/.test(optVal(o) || ""))) };
        boxes.push(rec);
        if (state[key].indexOf(rec.v) >= 0) c.checked = true;
        c.addEventListener("change", function () {
          var arr = state[key] || []; var v = rec.v;
          if (c.checked) {
            if (rec.ex) { boxes.forEach(function (r) { if (r !== rec) r.c.checked = false; }); arr = [v]; }
            else {
              boxes.forEach(function (r) { if (r.ex && r.c.checked) { r.c.checked = false; arr = arr.filter(function (x) { return x !== r.v; }); } });
              if (arr.indexOf(v) < 0) arr.push(v);
            }
          } else arr = arr.filter(function (x) { return x !== v; });
          onSet(key, arr);
        });
        l.appendChild(c); var sp = document.createElement("span"); sp.textContent = optLab(o); l.appendChild(sp);
        checks.appendChild(l);
      });
      wrap.appendChild(checks);
    } else if (item.kind === "scale") {
      var seg = document.createElement("div"); seg.className = "seg";
      for (var v = item.min; v <= item.max; v++) { (function (v) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = String(v);
        if (state[key] === v) b.classList.add("sel");
        b.addEventListener("click", function () {
          seg.querySelectorAll("button").forEach(function (x) { x.classList.remove("sel"); });
          b.classList.add("sel"); onSet(key, v);
        });
        seg.appendChild(b);
      })(v); }
      wrap.appendChild(seg);
      if (item.anchors) {
        var a = document.createElement("div"); a.className = "anchors";
        a.innerHTML = "<span>" + esc(item.anchors[String(item.min)] || item.min) + "</span><span>" + esc(item.anchors[String(item.max)] || item.max) + "</span>";
        wrap.appendChild(a);
      }
    } else if (item.kind === "rank6") {
      var labels = item.value_labels || {};
      var order = Array.isArray(state[key]) && state[key].length ? state[key].slice() : (item.values || []).slice();
      state[key] = order;
      var ul = document.createElement("ul"); ul.className = "ranklist";
      function draw() {
        ul.innerHTML = "";
        order.forEach(function (k, i) {
          var li = document.createElement("li");
          li.innerHTML = '<span class="n">' + (i + 1) + "</span><span>" + esc(labels[k] || k) + "</span>";
          if (i > 0) {
            var up = document.createElement("button"); up.type = "button"; up.className = "up"; up.textContent = "↑ Move up";
            up.addEventListener("click", function () {
              var t = order[i - 1]; order[i - 1] = order[i]; order[i] = t;
              onSet(key, order.slice(), true);
              draw();
            });
            li.appendChild(up);
          }
          ul.appendChild(li);
        });
      }
      draw(); wrap.appendChild(ul);
      var okBtn = document.createElement("button"); okBtn.type = "button"; okBtn.textContent = "This order is fine ✓";
      okBtn.style.cssText = "display:block;margin-top:10px;background:#fff;color:var(--ink);border:2px solid var(--line);border-radius:14px;padding:10px 14px;font-family:'Outfit',sans-serif;font-weight:700;font-size:14.5px;cursor:pointer";
      okBtn.addEventListener("click", function () { onSet(key, order.slice(), true); okBtn.textContent = "Order confirmed ✓"; });
      wrap.appendChild(okBtn);
    }
    return wrap;
  }

  // ------------------------------------------------------------ packets
  function fallbackQuestion(packet) {
    var def = packet.def || {};
    var t = def.title || "Next question";
    var miss = (packet.missing || []).map(function (m) { return m.label; });
    return t + (miss.length ? " — I still need: " + miss.join("; ") + "." : "") + " Answer in your own words, tap the answers below, or mix both.";
  }

  function renderWidgets(packet) {
    widgetsEl.innerHTML = "";
    S.answers = {}; S.touched = {}; S.rankTouched = {};
    var staged = packet.staged_values || {};
    Object.keys(staged).forEach(function (k) { S.answers[k] = staged[k]; S.touched[k] = true; if (k === "values_rank") S.rankTouched[k] = true; });
    var def = packet.def || {};
    (def.tail || []).forEach(function (item) {
      if (item.kind === "derived" || item.kind === "perceived_fit") return;
      var key = item.field || item.id; if (!key) return;
      widgetsEl.appendChild(widget(item, S.answers, function (k, v, isRank) {
        S.answers[k] = v; S.touched[k] = true; if (isRank) S.rankTouched[k] = true;
      }));
    });
  }

  function renderConfirmCard(packet) {
    var conf = packet.confirm;
    S.fixAnswers = {};
    Object.keys(conf.values).forEach(function (k) { S.fixAnswers[k] = conf.values[k]; });
    var def = packet.def || {};
    var byField = {};
    (def.tail || []).forEach(function (it) { byField[it.field || it.id] = it; });
    var box = document.createElement("div");
    box.className = "chat-cardbox confirm";
    box.innerHTML = "<h3>" + (conf.revise ? "✏️ Corrections I heard — check them" : "👂 Here is what I heard — check it") + "</h3>";
    var list = document.createElement("div");
    conf.lines.forEach(function (line, i) {
      var field = Object.keys(conf.values)[i];
      var row = document.createElement("div");
      row.className = "chat-line";
      row.innerHTML = "<span>" + esc(line) + "</span>";
      var drop = document.createElement("button");
      drop.type = "button"; drop.className = "drop"; drop.textContent = "remove ✕";
      drop.addEventListener("click", function () {
        if (field in S.fixAnswers) { delete S.fixAnswers[field]; row.classList.add("struck"); drop.textContent = "removed"; }
      });
      row.appendChild(drop);
      list.appendChild(row);
      // Editable where the item definition is on this packet (or the
      // value is a plain number / short text for earlier-stage fixes).
      var item = byField[field];
      var val = conf.values[field];
      if (item && (item.kind === "number" || item.kind === "text_short")) {
        list.appendChild(widget(item, S.fixAnswers, function (k, v) { S.fixAnswers[k] = v; }));
      } else if (!item && (typeof val === "number" || typeof val === "string")) {
        var pseudo = { field: field, kind: typeof val === "number" ? "number" : "text_short", label: "Fix: " + field.replace(/_/g, " ") };
        list.appendChild(widget(pseudo, S.fixAnswers, function (k, v) { S.fixAnswers[k] = v; }));
      }
    });
    box.appendChild(list);
    var row = document.createElement("div"); row.className = "chat-row";
    var yes = document.createElement("button"); yes.type = "button"; yes.className = "btn"; yes.textContent = "✓ That's right";
    yes.addEventListener("click", function () { send({ confirm: true }); });
    var fix = document.createElement("button"); fix.type = "button"; fix.className = "btn ghost"; fix.textContent = "Use my fixes";
    fix.addEventListener("click", function () { send({ fix_values: S.fixAnswers }); });
    row.appendChild(yes); row.appendChild(fix);
    box.appendChild(row);
    var note = document.createElement("p"); note.className = "chat-note";
    note.textContent = "Only what stands on this card — after your OK or your fixes — is used for your match. Remove a line and it never counts.";
    box.appendChild(note);
    cardEl.appendChild(box);
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderFitCard(packet) {
    var box = document.createElement("div");
    box.className = "chat-cardbox";
    box.innerHTML = "<h3>The real-Tuesday check</h3><p class='chat-note'>Picture one real Tuesday in each job — the boring parts too. “Mine” nudges a job up; “Not mine” removes it and the slot goes to the next job.</p>";
    S.ratings = {};
    (packet.candidates || []).forEach(function (c) {
      var item = { field: c.slug, kind: "choice", label: c.name + " — one real Tuesday in this job feels…",
        options: [{ value: "mine", label: "Mine" }, { value: "tolerable", label: "Tolerable" }, { value: "not_mine", label: "Not mine" }] };
      box.appendChild(widget(item, S.ratings, function (k, v) { S.ratings[k] = v; }));
    });
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "btn chat-send"; btn.textContent = "Apply my ratings — finish";
    btn.addEventListener("click", submitFit);
    box.appendChild(btn);
    cardEl.appendChild(box);
  }

  function renderCapCard() {
    var box = document.createElement("div");
    box.className = "chat-cardbox";
    box.innerHTML = "<h3>Let's switch to the form</h3><p class='chat-note'>The chat has a 25-message limit so it never drags. Everything you confirmed carries over — the classic form picks up at exactly your next unanswered question.</p>";
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "btn"; btn.textContent = "Continue in the classic form →";
    btn.addEventListener("click", function () { switchToClassic(); });
    box.appendChild(btn);
    cardEl.appendChild(box);
  }

  var VALUE_LABELS = { achievement: "Achievement", independence: "Independence", recognition: "Recognition", relationships: "Relationships", support: "Support", working_conditions: "Working conditions" };
  var EXIT_PHRASES = { money: "the money ran out or never showed up", energy: "the work drained you dry", boss: "the people in charge", market: "the market moved", boredom: "it went flat and routine", mixed: "a mix — no single killer" };
  function showMirror(json) {
    var s = (json.session || {}); var st = s.structured || {};
    var lines = "";
    if (typeof st.income_floor_k === "number" && typeof st.cushion_months === "number" && typeof st.hours_per_day === "number") {
      lines += '<p class="wow-line">Your floor is $' + esc(st.income_floor_k) + "K a year, you have " + esc(st.cushion_months) + (st.cushion_months === 1 ? " month" : " months") + " of cushion and " + esc(st.hours_per_day) + " real hours a day. That's not a wish list — that's a spec sheet. I match against it, not against a dream.</p>";
    }
    if (typeof st.attempts_started === "number" && st.attempts_started > 0) {
      var l2 = "You've started " + st.attempts_started + " serious attempts";
      if (typeof st.attempts_finished === "number") l2 += " and finished " + st.attempts_finished;
      l2 += ".";
      if (EXIT_PHRASES[st.exit_pattern]) l2 += " And your exits have a signature: " + EXIT_PHRASES[st.exit_pattern] + ". Every job I show you gets checked against that signature.";
      lines += '<p class="wow-line">' + esc(l2) + "</p>";
    } else {
      lines += '<p class="wow-line">No exits behind you yet — so we go by your values, not your scars.</p>';
    }
    var vr = st.values_rank;
    var keys = null;
    if (Array.isArray(vr)) keys = vr.filter(function (k) { return VALUE_LABELS[k]; });
    else if (vr && typeof vr === "object") keys = Object.keys(vr).filter(function (k) { return VALUE_LABELS[k] && typeof vr[k] === "number"; }).sort(function (a, b) { return vr[a] - vr[b]; });
    if (keys && keys.length >= 2) lines += '<p class="wow-line">You ranked ' + esc(VALUE_LABELS[keys[0]]) + " first — above " + esc(VALUE_LABELS[keys[keys.length - 1]]) + ". That's the order I'll defend when the money argues back.</p>";
    var ov = document.createElement("div");
    ov.className = "wow-overlay"; ov.id = "chatMirror";
    ov.innerHTML = '<div class="wow-card"><h2>Hold on. Here\'s what I\'m hearing.</h2>' + lines +
      '<p class="wow-close">None of this is a guess — you told me all of it. Now the part most people skip: the shadows.</p>' +
      '<button type="button" class="btn" id="chatMirrorBtn">I\'m listening — continue →</button></div>';
    document.body.appendChild(ov);
    $("chatMirrorBtn").addEventListener("click", function () { ov.remove(); });
  }

  function renderPacket(json) {
    var packet = json.chat || {};
    metaEl.textContent = "Message " + (packet.turns || 0) + " of " + (packet.cap || 25);
    if (json.mentor_message) bubble("mentor", json.mentor_message);
    cardEl.innerHTML = ""; widgetsEl.innerHTML = "";
    if (packet.instruction_flag) {
      var n = document.createElement("p"); n.className = "chat-note";
      n.textContent = "I match from your answers, not from instructions — tell me the facts and they're what counts.";
      cardEl.appendChild(n);
    }
    var sess = json.session || {};
    if (sess.phase === "stages" && sess.stage_index === 3 && !S.mirrorShown) {
      S.mirrorShown = true;
      showMirror(json);
    }
    composerEl.style.display = "";
    if (packet.kind === "done") { handoff(json); return; }
    if (packet.confirm) { renderConfirmCard(packet); composerEl.style.display = "none"; return; }
    if (packet.kind === "fit") { renderFitCard(packet); composerEl.style.display = "none"; return; }
    if (packet.kind === "cap") { renderCapCard(); composerEl.style.display = "none"; return; }
    if (!json.mentor_message) bubble("mentor", fallbackQuestion(packet));
    renderWidgets(packet);
  }

  // ------------------------------------------------------------ sending
  async function send(extra) {
    if (S.busy) return;
    var lv = live(); if (!lv || !lv.session) return;
    S.busy = true;
    var sendBtn = $("chatSend"); if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "One second…"; }
    try {
      var res = await callApi(Object.assign({ action: "chat", session_id: lv.session_id, session: lv.session }, extra || {}));
      if (!res.json || !res.json.ok) {
        errorLine((res.json && res.json.error) || "That didn't go through — your answers are still here; try again.");
        return;
      }
      adopt(res.json);
      renderPacket(res.json);
    } catch (e) {
      errorLine("Connection to the matchmaker failed — your answers are still here; press Send again.");
    } finally {
      S.busy = false;
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send"; }
    }
  }

  function chipSummary(chips, packet) {
    var def = (packet && packet.def) || {};
    var byField = {};
    (def.tail || []).forEach(function (it) { byField[it.field || it.id] = it; });
    var parts = [];
    Object.keys(chips).forEach(function (k) {
      var it = byField[k]; if (!it) return;
      var v = chips[k];
      if (it.kind === "choice") { var o = (it.options || []).find(function (x) { return optVal(x) === v; }); parts.push((it.label || k) + ": " + (o ? optLab(o) : v)); }
      else if (it.kind === "multichoice") parts.push((it.label || k) + ": " + (Array.isArray(v) ? v.length : 0) + " picked");
      else if (it.kind === "rank6") parts.push("Ranked my values");
      else if (it.kind === "scale" || it.kind === "number") parts.push((it.label || k) + ": " + v);
    });
    return parts.join(" · ").slice(0, 220);
  }

  function onSend() {
    var text = $("chatText").value.trim();
    var chips = {};
    Object.keys(S.answers).forEach(function (k) {
      if (!S.touched[k]) return;
      if (k === "values_rank" && !S.rankTouched[k]) return; // U2: an untouched ranking is not an answer
      var v = S.answers[k];
      if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) return;
      chips[k] = v;
    });
    if (!text && !Object.keys(chips).length) {
      errorLine("Type an answer, tap the answers above, or mix both — then Send.");
      return;
    }
    if (text) bubble("user", text);
    else { var sum = chipSummary(chips, S.lastJson && S.lastJson.chat); if (sum) bubble("user", sum); }
    $("chatText").value = "";
    send({ text: text || undefined, chips: Object.keys(chips).length ? chips : undefined });
  }

  async function submitFit() {
    if (S.busy) return;
    if (!Object.keys(S.ratings).length) { errorLine("Give at least one of these jobs your verdict — mine, tolerable or not mine. That vote is the whole point of this card."); return; }
    var lv = live(); if (!lv || !lv.session) return;
    S.busy = true;
    try {
      var res = await callApi({ action: "fit", session_id: lv.session_id, session: lv.session, ratings: S.ratings });
      if (!res.json || !res.json.ok) { errorLine((res.json && res.json.error) || "That didn't go through — try again."); return; }
      handoff(res.json);
    } catch (e) {
      errorLine("Connection to the matchmaker failed — press the button again.");
    } finally { S.busy = false; }
  }

  // ------------------------------------------------------------ handoffs
  function teardown() {
    if (panel) panel.style.display = "none";
    var sc = $("stageCard"); if (sc) sc.classList.remove("hidden");
    var th = $("thread"); if (th) th.classList.remove("hidden");
    var pl = $("progressLabel"); if (pl) pl.classList.remove("hidden");
    var bar = document.querySelector("#interview .bar"); if (bar) bar.classList.remove("hidden");
  }
  function handoff(json) {
    adopt(json);
    teardown();
    if (typeof window.cgRoute === "function") window.cgRoute({ status: 200, json: json });
  }
  async function switchToClassic() {
    S.classic = true;
    try { sessionStorage.setItem("cg_chat", "off"); } catch (e) {}
    var lv = live();
    if (!S.started || !lv || !lv.session) return; // start-screen link: flag is enough
    try {
      var res = await callApi({ action: "current", session_id: lv.session_id, session: lv.session });
      if (res.json && res.json.ok) { handoff(res.json); return; }
    } catch (e) {}
    teardown();
  }

  // ------------------------------------------------------------ start
  function showChatChrome() {
    $("startScreen").classList.add("hidden");
    $("interview").classList.remove("hidden");
    $("verdict").classList.add("hidden");
    $("stageCard").classList.add("hidden");
    var th = $("thread"); if (th) th.classList.add("hidden");
    var pl = $("progressLabel"); if (pl) pl.classList.add("hidden");
    var bar = document.querySelector("#interview .bar"); if (bar) bar.classList.add("hidden");
    panel.style.display = "";
    panel.scrollIntoView({ behavior: "smooth" });
  }
  async function startChat(door, btn) {
    if (!panel) buildPanel();
    S.started = true; S.door = door;
    showChatChrome();
    try {
      var res = await callApi({ action: "chat_start", door: door });
      if (!res.json || !res.json.ok) throw new Error("chat start failed");
      adopt(res.json);
      renderPacket(res.json);
    } catch (e) {
      // The chat could not open: hand this tap back to the classic
      // flow rather than trapping the person on a dead panel.
      S.started = false; S.classic = true;
      panel.style.display = "none";
      $("startScreen").classList.remove("hidden");
      $("interview").classList.add("hidden");
      if (btn) btn.click();
    }
  }

  // The lead gate owns the first door tap (its capture listener was
  // registered before this file's): while the gate is open or has
  // never been passed, door taps are left alone. Once the gate has
  // been shown and closed (saved or skipped), taps start the chat.
  function gatePassed() {
    var ovl = $("leadOvl");
    return !!(ovl && ovl.dataset.cgSeen === "1" && ovl.hidden);
  }
  if (window.MutationObserver) {
    new MutationObserver(function () {
      var o = $("leadOvl");
      if (o && !o.hidden) o.dataset.cgSeen = "1";
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  }
  document.addEventListener("click", function (e) {
    if (!S.healthy || S.classic || S.started) return;
    var t = e.target;
    var door = t && t.closest ? t.closest(".door") : null;
    if (!door) return;
    if (!gatePassed()) return; // lead.js handles this tap
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    startChat(door.getAttribute("data-door"), door);
  }, true);

  // Start-screen escape hatch to the classic form (visible, one tap).
  function addClassicLink() {
    var doors = document.querySelector(".doors");
    if (!doors || $("chatClassicLink")) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "chat-startlink"; b.id = "chatClassicLink";
    b.textContent = S.classic ? "Classic form is on — tap your door above ↑" : "Rather tap through a form? Use the classic form →";
    b.addEventListener("click", function () {
      S.classic = true;
      try { sessionStorage.setItem("cg_chat", "off"); } catch (e) {}
      b.textContent = "Classic form is on — tap your door above ↑";
    });
    doors.parentNode.insertBefore(b, doors.nextSibling);
  }

  // Only a live API gets the chat; otherwise the page is untouched.
  fetch("/api/mentor?action=health").then(function (r) { return r.json(); }).then(function (h) {
    if (!h || !h.ok) return;
    S.healthy = true;
    if (!S.classic) addClassicLink();
  }).catch(function () {});
})();

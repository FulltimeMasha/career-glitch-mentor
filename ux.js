// ux.js — presentation-layer fixes for /mentor (UI smalls batch,
// 29.10.2026). Loaded LAST (after chat.js) because mentor.html is at
// the per-file upload ceiling. Everything here enhances the DOM the
// page itself renders — it never touches answers, scoring or session
// state:
//   1. A beforeunload guard that arms ONLY while an interview is
//      actually in progress — the live session before its verdict,
//      the open chat panel, or the guided card flow on screen. It
//      never arms on the landing state, disarms on the verdict
//      screen, and is suppressed for the page's own Start-over
//      reloads (answers are never persisted, so a stray refresh
//      mid-interview otherwise loses everything silently).
//   2. Money echoes on $K number fields (classic widgets, chat
//      widgets, chat fix editors): the fields are denominated in
//      thousands, so the echo renders the typed value as full
//      dollars — 36000 in a $K field visibly reads "= $36,000,000".
//      A placeholder example states the denomination before typing.
//   3. rank6 lists gain a "↓ Move down" button. It clicks the next
//      row's own "↑ Move up", i.e. it reuses the page's exact swap
//      logic (answer write + touched flag + redraw) instead of
//      reimplementing it. Move up/down buttons get item-specific
//      aria-labels.
//   4. Toggle buttons inside .choice/.seg containers mirror their
//      .sel state into aria-pressed. Widget <label>s are associated
//      with their control (htmlFor ↔ id) or, for grouped widgets
//      (choice/seg/checks/ranklist), via role="group" +
//      aria-labelledby. The save-plan email input, which has no
//      visible label element, gains an aria-label.
(function () {
  "use strict";

  var css = document.createElement("style");
  css.id = "uxCss";
  css.textContent =
    ".ux-echo{font-size:13px;color:#5c5566;margin-top:4px;min-height:15px}" +
    ".ranklist button.down{margin-left:auto;padding:10px 14px;font-size:13px;position:relative;z-index:1;touch-action:manipulation}" +
    ".ranklist button.up + button.down{margin-left:8px}";
  if (!document.getElementById("uxCss")) document.head.appendChild(css);

  function $(id) { return document.getElementById(id); }
  function all(root, sel) {
    var out = [];
    if (root.nodeType === 1 && root.matches && root.matches(sel)) out.push(root);
    if (root.querySelectorAll) {
      var nl = root.querySelectorAll(sel);
      for (var i = 0; i < nl.length; i++) out.push(nl[i]);
    }
    return out;
  }
  function inScope(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.id === "interview" || node.id === "verdict" || node.id === "leadOvl") return true;
    return !!(node.closest && node.closest("#interview, #verdict, #leadOvl"));
  }

  // ---------------------------------------------------------- 1. guard
  var suppressUntil = 0;
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.closest && t.closest("#restartBtn, #verdictRestart")) {
      // The page's own Start-over buttons reset state and reload on
      // purpose — that reload must not be "guarded".
      suppressUntil = Date.now() + 2000;
    }
  }, true);

  function shown(el) {
    // Every show/hide transition on this page is a .hidden class or
    // an inline display style — no layout queries needed.
    return !!el && !el.classList.contains("hidden") && el.style.display !== "none";
  }
  function interviewInProgress() {
    if (Date.now() < suppressUntil) return false;
    if (shown($("verdict"))) return false; // verdict on screen: safe to leave
    var lv = null;
    try { lv = window.live; } catch (e) {}
    if (lv && lv.session) return lv.session.phase !== "done";
    if (!shown($("interview"))) return false; // landing state: never armed
    if (shown($("chatPanel"))) return true;
    if (shown($("stageCard"))) return true; // guided (legacy) card flow
    return false;
  }
  window.addEventListener("beforeunload", function (e) {
    if (!interviewInProgress()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // ---------------------------------------------------------- 4. labels
  var seq = 0;
  function processLabels(root) {
    all(root, "label").forEach(function (lab) {
      if (lab.dataset.uxLab) return;
      lab.dataset.uxLab = "1";
      if (lab.htmlFor) return; // already associated (freeText, chatText)
      if (lab.querySelector("input, select, textarea")) return; // wraps its control (lead gate, checkboxes)
      var parent = lab.parentElement;
      if (!parent) return;
      var controls = parent.querySelectorAll(":scope > input, :scope > select, :scope > textarea");
      if (controls.length === 1) {
        var c = controls[0];
        if (!c.id) c.id = "uxf-" + (++seq);
        lab.htmlFor = c.id;
        return;
      }
      var group = parent.querySelector(":scope > .choice, :scope > .seg, :scope > .checks, :scope > ul.ranklist");
      if (group && !group.getAttribute("role")) {
        if (!lab.id) lab.id = "uxlab-" + (++seq);
        group.setAttribute("role", "group");
        group.setAttribute("aria-labelledby", lab.id);
      }
    });
    var em = $("x2PlanEmail");
    if (em && !em.getAttribute("aria-label")) {
      em.setAttribute("aria-label", "Email address for your saved plan");
    }
  }

  // ---------------------------------------------------------- 2. money
  function moneyContext(inp) {
    // Returns { suffix, hint } when this number input is a $-thousands
    // field, else null. Primary signal: the widget label says "$K".
    // Chat fix editors for banked cross-stage facts carry a pseudo
    // label ("Fix: income floor k") — there the confirm line directly
    // above the fix box carries the "$K" wording instead.
    var wrap = inp.parentElement;
    var lab = wrap ? wrap.querySelector(":scope > label") : null;
    var text = lab ? lab.textContent : "";
    if (!/\$K/.test(text)) {
      var box = inp.closest ? inp.closest(".chat-fixbox") : null;
      var row = box && box.previousElementSibling;
      text = row ? row.textContent : "";
      if (!/\$K/.test(text)) return null;
    }
    if (/per year/i.test(text)) return { suffix: " a year", hint: "85 = $85,000" };
    if (/total/i.test(text)) return { suffix: " total", hint: "5 = $5,000" };
    return { suffix: "", hint: "85 = $85,000" };
  }
  function processMoney(root) {
    all(root, 'input[type="number"]').forEach(function (inp) {
      if (inp.dataset.uxMoney) return;
      inp.dataset.uxMoney = "1";
      var ctx = moneyContext(inp);
      if (!ctx) return;
      if (!inp.placeholder) inp.placeholder = ctx.hint;
      var echo = document.createElement("div");
      echo.className = "ux-echo";
      echo.setAttribute("aria-live", "polite");
      inp.parentElement.insertBefore(echo, inp.nextSibling);
      function update() {
        var v = parseFloat(inp.value);
        if (inp.value === "" || isNaN(v)) { echo.textContent = ""; return; }
        echo.textContent = "= $" + Math.round(v * 1000).toLocaleString("en-US") + ctx.suffix;
      }
      inp.addEventListener("input", update);
      update(); // chat fix editors open pre-filled — echo immediately
    });
  }

  // ---------------------------------------------------------- 3. ranking
  function rowName(li) {
    var spans = li.querySelectorAll("span");
    return spans.length > 1 ? spans[1].textContent : "";
  }
  function processRanks(root) {
    var uls = all(root, "ul.ranklist");
    if (root.nodeType === 1 && root.closest) {
      var host = root.closest("ul.ranklist");
      if (host && uls.indexOf(host) < 0) uls.push(host);
    }
    uls.forEach(function (ul) {
      var lis = ul.children;
      for (var i = 0; i < lis.length; i++) {
        var li = lis[i];
        var name = rowName(li);
        var up = li.querySelector(":scope > button.up");
        if (up && name) up.setAttribute("aria-label", "Move " + name + " up");
        if (i >= lis.length - 1) continue;
        var nextUp = lis[i + 1].querySelector(":scope > button.up");
        if (!nextUp) continue;
        var down = li.querySelector(":scope > button.down");
        if (!down) {
          down = document.createElement("button");
          down.type = "button";
          down.className = "down";
          down.textContent = "↓ Move down";
          down.addEventListener("click", function () {
            // Re-resolve at click time: redraws rebuild the rows, so
            // the sibling's current Move-up button is the live one.
            var liNow = this.parentElement;
            var ulNow = liNow && liNow.parentElement;
            if (!ulNow) return;
            var idx = Array.prototype.indexOf.call(ulNow.children, liNow);
            var sib = ulNow.children[idx + 1];
            var upNow = sib && sib.querySelector(":scope > button.up");
            if (upNow) upNow.click();
          });
          li.appendChild(down);
        }
        if (name) down.setAttribute("aria-label", "Move " + name + " down");
      }
    });
  }

  // ---------------------------------------------------------- 4b. toggles
  function syncToggle(btn) {
    var p = btn.parentElement;
    if (!p || (!p.classList.contains("choice") && !p.classList.contains("seg"))) return;
    var want = btn.classList.contains("sel") ? "true" : "false";
    if (btn.getAttribute("aria-pressed") !== want) btn.setAttribute("aria-pressed", want);
  }
  function processToggles(root) {
    all(root, ".choice > button, .seg > button").forEach(syncToggle);
  }

  // ---------------------------------------------------------- driver
  function processTree(node) {
    if (!inScope(node)) return;
    processLabels(node);
    processMoney(node);
    processRanks(node);
    processToggles(node);
  }
  ["interview", "verdict"].forEach(function (id) {
    var el = $(id);
    if (el) processTree(el);
  });

  if (window.MutationObserver) {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "attributes") {
          if (m.target && m.target.tagName === "BUTTON") syncToggle(m.target);
          continue;
        }
        for (var j = 0; j < m.addedNodes.length; j++) {
          processTree(m.addedNodes[j]);
        }
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  }
})();

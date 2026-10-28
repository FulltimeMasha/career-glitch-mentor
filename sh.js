// sh.js — the side-hustle idea card ("one more thing").
// Extracted into its own file because mentor.html is at the Vercel
// per-file upload ceiling; renderResult() in the page calls
// window.shCardHtml(result.side_hustle_pick) right after the cushion
// block, the same way it calls pg.js globals for the playground.
// Presentation only: the pick is final when it arrives (deterministic
// engine, api/_lib/engine/scoring.mjs) and this file never re-scores,
// never fetches and never offers a playground day for the idea.
//
// The card is DELIBERATELY not a match card (founder's rule,
// 28.10.2026): no fit badges, no LOVE/POTENTIAL meters, no "marry it"
// button — a dashed outline and a plain frame line say what it is:
// an extra-money idea next to a real income, not a career.
(function () {
  var css = document.createElement("style");
  css.id = "shCardCss";
  css.textContent =
    ".sh-card{margin-top:14px;background:#FFEEF5;border:1.5px dashed #E9A8C6;box-shadow:none}" +
    ".sh-kicker{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#7a1042}" +
    ".sh-name{display:block;font-family:Outfit,sans-serif;font-size:19px;margin-top:6px}" +
    ".sh-frame{margin-top:6px;font-size:14.5px;line-height:1.5;color:#4c4457}" +
    ".sh-why{margin:10px 0 2px;padding-left:20px;display:grid;gap:5px;font-size:15px;line-height:1.5}";
  if (!document.getElementById("shCardCss")) document.head.appendChild(css);
})();

function shCardHtml(pick) {
  if (!pick || !pick.name) return "";
  var escFn = (typeof esc === "function") ? esc : function (s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };
  var html = '<div class="card sh-card">';
  html += '<div class="sh-kicker">💡 One more thing — a side-hustle idea</div>';
  html += '<b class="sh-name">' + escFn(pick.name) + "</b>";
  html += '<p class="sh-frame">Not a match, and not a job anyone hires you into — extra money, built on the side, next to a real income.</p>';
  var why = Array.isArray(pick.why_side) ? pick.why_side : [];
  if (why.length) {
    html += '<ul class="sh-why">';
    why.forEach(function (line) { html += "<li>" + escFn(line) + "</li>"; });
    html += "</ul>";
  }
  html += "</div>";
  return html;
}
window.shCardHtml = shCardHtml;

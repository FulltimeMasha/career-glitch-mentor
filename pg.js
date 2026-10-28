// pg.js — Jobs Playground client ("a date before the plan").
// Extracted from mentor.html (2026-10-27 game layer): the pg code lives in
// its own file because mentor.html is at the Vercel per-file upload ceiling.
// Classic script loaded AFTER the main inline scripts: it uses the page
// globals $, esc, api, store (function declarations), live and lastResult
// (top-level vars) — all window/global bindings by then. Everything here is
// presentation only: a day never touches the matchmaker's scores.
(function(){
var css = document.createElement("style");
css.id = "pgGameCss";
css.textContent =
".pg-clock{display:flex;align-items:baseline;gap:8px;margin:2px 0 10px}" +
".pg-clock-t{font-family:'DM Mono',monospace;font-size:21px;font-weight:700;color:var(--ink)}" +
".pg-clock-p{color:#5c5566;font-size:14px}" +
".pg-chat{display:flex;flex-direction:column;gap:6px;margin:10px 0 4px}" +
".pg-bname{font-family:'DM Mono',monospace;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:#a04a78;margin-top:6px}" +
".pg-bub{background:#fff;border:1px solid rgba(28,26,31,.08);border-radius:16px 16px 16px 5px;padding:9px 13px;font-size:15.5px;line-height:1.45;max-width:88%;align-self:flex-start;box-shadow:0 3px 10px rgba(58,35,64,.06)}" +
".pg-taskbox{background:#FFF6E9;border:1.5px dashed rgba(233,168,198,.9);border-radius:16px;padding:14px 15px;margin-top:14px}" +
".pg-taskbox h4{font-family:Outfit,sans-serif;font-size:16.5px;margin:0 0 4px}" +
".pg-opt{display:block;width:100%;text-align:left;background:#fff;border:1.5px solid rgba(28,26,31,.16);border-radius:13px;padding:11px 14px;margin-top:8px;font-size:15.5px;line-height:1.4;cursor:pointer;font-family:inherit;color:var(--ink)}" +
".pg-opt:hover{border-color:#E9A8C6}" +
".pg-opt.right{border-color:#2e9e5b;background:#EAF7EE}" +
".pg-opt.wrong{border-color:#d64545;background:#FDECEC}" +
".pg-opt:disabled{cursor:default;opacity:.92}" +
".pg-opt .pg-pos{display:inline-block;min-width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:var(--ink);color:#fff;font-size:12.5px;font-weight:700;margin-right:8px;vertical-align:1px}" +
".pg-explain{margin-top:10px;font-size:14.5px;line-height:1.5;color:#4c4457}" +
".pg-says{font-size:16px;line-height:1.5;font-style:italic;margin-top:2px}" +
".pg-scene{font-size:15px;line-height:1.5;color:#4c4457;margin-top:2px}" +
".pg-choicebox{background:#F3EEFB;border-radius:16px;padding:14px 15px;margin-top:14px}" +
".pg-choicebox h4{font-family:Outfit,sans-serif;font-size:16.5px;margin:0 0 4px}" +
".pg-outcome{background:#fff;border-left:4px solid var(--pink);border-radius:10px;padding:11px 14px;margin-top:10px;font-size:15.5px;line-height:1.5}" +
".pg-outcome .pg-picked{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#c2185b;display:block;margin-bottom:4px}" +
".pg-nums{background:#fff;border:1px solid rgba(28,26,31,.09);border-radius:16px;padding:14px 16px;margin-top:14px}" +
".pg-nums h4{font-family:Outfit,sans-serif;font-size:17px;margin:0 0 6px}" +
".pg-numline{font-size:15.5px;line-height:1.5;margin:7px 0}" +
".pg-ebar{height:10px;border-radius:99px;background:rgba(28,26,31,.1);overflow:hidden;margin:4px 0 8px}" +
".pg-ebar span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#FFB8D9,#F92A82)}" +
".pg-ready{font-family:Outfit,sans-serif;font-weight:700;font-size:17px;margin:16px 0 2px}" +
".pg-ol{margin:8px 0 2px;padding-left:22px;font-size:15.5px;line-height:1.55}";
if(!document.getElementById("pgGameCss")) document.head.appendChild(css);
})();

var PG_KIND_LABELS = { core: "The core work", routine: "The routine block", people: "People", craft: "Hands on", crisis: "It goes wrong", paperwork: "Paperwork" };
var PG_CHAT_NAMES = { boss: "Your boss", client: "A client", colleague: "A colleague", patient: "A patient", customer: "A customer" };
var PG_DAY_PART = ["your day is just starting", "your day is about a sixth in", "your day is about a third in", "your day is halfway in", "your day is about two thirds in", "the last stretch of your day"];
var pgBusy = false;
var pgVibKey = "";
var pgOrderSel = null; // transient { key, sel:[itemIdx...], attempts:n } — only the finished result is persisted

function pgVibrate(pattern){
try{ if(navigator && typeof navigator.vibrate === "function") navigator.vibrate(pattern); }catch(e){}
}
function pgNormDay(day){
if(!day.choices || typeof day.choices !== "object") day.choices = {};
if(!day.trials || typeof day.trials !== "object") day.trials = {};
return day;
}
function pgValidChoice(c){
if(!c || typeof c !== "object") return false;
if(typeof c.prompt !== "string" || !c.prompt.trim()) return false;
if(!Array.isArray(c.options) || c.options.length < 2 || c.options.length > 3) return false;
return c.options.every(function(o){ return o && typeof o.label === "string" && o.label.trim() && typeof o.outcome === "string" && o.outcome.trim(); });
}
function pgValidTrial(t){
if(!t || typeof t !== "object") return false;
if(typeof t.title !== "string" || !t.title.trim()) return false;
if(typeof t.explain !== "string" || !t.explain.trim()) return false;
if(t.type === "order"){
return Array.isArray(t.items) && t.items.length === 4 && t.items.every(function(s){ return typeof s === "string" && s.trim(); }) &&
Array.isArray(t.correct) && t.correct.length === 4 && t.correct.slice().sort().join(",") === "0,1,2,3";
}
if(t.type === "spot"){
return typeof t.scenario === "string" && !!t.scenario.trim() && Array.isArray(t.options) && t.options.length === 3 &&
t.options.every(function(s){ return typeof s === "string" && s.trim(); }) && Number.isInteger(t.correct) && t.correct >= 0 && t.correct <= 2;
}
if(t.type === "phrase"){
return typeof t.says === "string" && !!t.says.trim() && Array.isArray(t.options) && t.options.length === 3 &&
t.options.every(function(s){ return typeof s === "string" && s.trim(); }) && Number.isInteger(t.correct) && t.correct >= 0 && t.correct <= 2;
}
return false;
}
function pgValidChat(chat){
if(!Array.isArray(chat) || chat.length < 2 || chat.length > 4) return false;
return chat.every(function(b){ return b && typeof b.text === "string" && b.text.trim() && Object.prototype.hasOwnProperty.call(PG_CHAT_NAMES, b.from); });
}

function pgState(){
if(!live) return null;
if(!live.pg || typeof live.pg !== "object") live.pg = { days: {}, pick: null };
if(!live.pg.days || typeof live.pg.days !== "object") live.pg.days = {};
return live.pg;
}
function pgDay(slug){ var st = live && live.pg; return (st && st.days && st.days[slug]) || null; }
function pgPick(){ return (live && live.pg && live.pg.pick) || null; }
function pgName(slug){
var day = pgDay(slug); if(day && day.name) return day.name;
if(lastResult){ var f = (lastResult.top3 || []).filter(function(c){ return c.slug === slug; })[0]; if(f) return f.name; }
return slug;
}
function pgFeelCounts(day){
var n = { loved: 0, fine: 0, drained: 0 };
(day.feels || []).forEach(function(f){ if(Object.prototype.hasOwnProperty.call(n, f)) n[f] += 1; });
return n;
}
function pgDayLine(day){
var n = pgFeelCounts(day);
return "Your day, in your taps: loved " + n.loved + " · fine " + n.fine + " · drained " + n.drained + ".";
}
function pgShow(){ var v = $("pgView"); if(v) v.classList.remove("hidden"); }
function pgHide(){ var v = $("pgView"); if(v) v.classList.add("hidden"); }
function pgScroll(){ var v = $("pgView"); if(v) v.scrollIntoView({ behavior: "smooth", block: "start" }); }
function pgSkip(){
pgHide();
var letter = document.querySelector("#verdictBody .letter-card");
if(letter) letter.scrollIntoView({ behavior: "smooth", block: "start" });
else $("verdict").scrollIntoView({ behavior: "smooth" });
}
function pgRefreshBtn(slug){
var day = pgDay(slug); if(!day || !day.done) return;
var b = document.querySelector('#verdictBody [data-pg="' + slug + '"]');
if(b) b.textContent = "↻ Live the day again";
var card = document.querySelector('#verdictBody [data-cardslug="' + slug + '"]');
if(card && b && !card.querySelector(".pg-dayline")){
var p = document.createElement("p");
p.className = "pg-dayline"; p.textContent = pgDayLine(day);
b.parentNode.insertBefore(p, b.nextSibling);
}
}

function pgRenderError(slug){
$("pgBody").innerHTML = '<div class="mwho">▶ One real day</div>' +
'<p style="font-weight:600">The day didn\'t load — nothing was changed and nothing was scored. Give it another tap.</p>' +
'<button type="button" class="btn ghost" id="pgRetry">Try again</button>' +
'<button type="button" class="pg-skip" id="pgErrSkip">Skip — straight to my plan</button>';
var rt = $("pgRetry"); if(rt) rt.addEventListener("click", function(){ openPlayground(slug); });
var sk = $("pgErrSkip"); if(sk) sk.addEventListener("click", pgSkip);
}

// Day header image: bespoke /pg/<slug>.webp wins; if it is missing and the
// profession has a workplace, fall back to /pg/w-<workplace>.webp; if that
// is missing too (or there is no workplace), hide the header as before.
var PG_WORKPLACE = {"aba-therapist-kids":"hospital","accountant":"office","actuary":"office","administrative-assistant":"office","airbnb-co-host-str-manager":"remote","aircraft-mechanic-a-p":"workshop","amazon-fba-seller":"remote","animator":"studio","appliance-repair-tech":"clients-home","arborist-tree-pro":"outdoors","athletic-trainer":"gym","audiologist":"hospital","auto-mechanic":"workshop","b2b-sales-rep":"office","baker":"restaurant","bakery-caf-owner":"business","barber":"salon","barista-craft-coffee":"restaurant","beauty-salon-owner":"salon","biomedical-equipment-technician-bmet":"hospital","boat-captain":"marine","boat-mechanic-marine-tech":"workshop","boat-restoration-flipping":"marine","body-piercing-artist":"studio","boilermaker":"construction","bookkeeper-advisory":"office","brand-strategist":"office","brewer-brewmaster":"factory","brick-mason":"construction","bus-driver":"transport","business-consultant":"office","butcher":"retail","cabinet-maker":"workshop","cardiovascular-perfusionist":"hospital","cardiovascular-technologist":"hospital","carpenter":"construction","cdl-truck-driver":"transport","certified-anesthesiologist-assistant":"hospital","chef":"restaurant","chiropractor":"hospital","clinical-research-coordinator":"hospital","commercial-diver":"marine","commercial-industrial-designer":"studio","commercial-insurance-producer":"office","commercial-pilot":"transport","community-health-worker":"hospital","compliance-officer":"office","computer-and-information-research-scientist":"office","computer-systems-analyst":"office","concrete-finisher":"construction","construction-estimator":"construction","content-strategist":"office","copywriter":"office","corporate-trainer":"office","cosmetologist-hair-stylist":"salon","crane-operator":"construction","customer-success-manager":"office","cybersecurity-analyst":"office","dance-instructor":"studio","data-analyst":"office","data-engineer":"office","data-scientist-ml-engineer":"office","database-administrator-architect":"office","delivery-driver-light-truck":"transport","dental-assistant":"hospital","dental-hygienist":"hospital","dialysis-technician":"hospital","diesel-mechanic":"workshop","digital-forensics-analyst":"lab","dispatcher-trucking":"office","dog-trainer":"clients-home","doula":"hospital","driving-instructor":"school","drone-pilot-commercial":"outdoors","drywall-finisher":"construction","e-commerce-manager":"office","electrician":"clients-home","elevator-mechanic":"workshop","emt-paramedic":"hospital","enrolled-agent-tax-pro":"office","esthetician":"salon","etsy-digital-products-seller":"remote","executive-assistant":"office","farm-equipment-mechanic":"workshop","farm-ranch-manager":"outdoors","farmers-market-producer":"outdoors","fashion-designer":"office","film-stage-lighting-technician":"studio","financial-analyst":"office","firefighter":"government","fitness-trainer":"gym","flight-attendant":"transport","florist":"retail","food-scientist-technologist":"lab","food-truck-owner":"restaurant","franchise-owner-home-services":"business","game-designer":"office","garage-door-tech":"clients-home","general-contractor":"construction","genetic-counselor":"hospital","grant-writer":"office","graphic-designer":"office","gym-fitness-studio-owner":"gym","handyman-company-owner":"clients-home","handyman-solo-pro":"clients-home","harbor-pilot":"marine","health-informatics-specialist":"office","helicopter-pilot":"transport","histotechnologist":"hospital","home-health-aide":"clients-home","hvac-technician":"clients-home","instructional-designer":"office","insurance-agent":"office","insurance-claims-adjuster":"office","insurance-underwriter":"office","interior-designer":"office","it-support-specialist":"office","landscape-architect":"office","landscaper-lawn-pro":"clients-home","lash-brow-artist":"salon","librarian":"school","life-coach":"office","loan-officer":"office","locksmith":"clients-home","luxury-real-estate-agent":"office","makeup-artist":"studio","market-researcher":"office","marriage-and-family-therapist":"office","massage-therapist":"salon","medical-assistant":"hospital","medical-coder":"office","medical-courier-owner-route":"transport","medical-dosimetrist":"hospital","millwright":"factory","mobile-app-developer":"office","mobile-mechanic-owner":"workshop","mortgage-broker":"office","motion-designer-3d-artist":"studio","mri-technologist":"hospital","music-instructor":"school","nanny-family-assistant-pro":"clients-home","network-and-computer-systems-administrator":"office","no-code-developer":"office","nuclear-medicine-technologist":"hospital","nuclear-reactor-operator":"factory","nurse-practitioner":"hospital","nutrition-coach-dietitian":"office","occupational-therapist":"hospital","online-course-creator":"remote","online-tutor":"remote","operations-manager":"office","optometrist":"hospital","owner-operator-trucking":"transport","paralegal":"office","permanent-makeup-artist":"salon","personal-fashion-stylist":"salon","personal-financial-advisor":"office","pest-control-tech":"clients-home","pet-grooming-salon-owner":"salon","pharmacist":"hospital","pharmacy-technician":"hospital","phlebotomist":"hospital","photographer":"studio","physical-therapist":"hospital","physician":"hospital","physician-assistant":"hospital","plasterer-and-stucco-mason":"construction","plumber":"clients-home","podcast-producer":"studio","police-officer":"government","pool-technician":"clients-home","preschool-teacher":"school","print-on-demand-seller":"remote","private-chef":"restaurant","private-tutor-in-person":"school","probation-officer":"government","product-manager":"office","project-manager":"office","property-manager":"office","psychologist-therapist":"hospital","pt-assistant":"hospital","radiation-therapist":"hospital","radiology-tech":"hospital","real-estate-agent":"office","recreational-therapist":"hospital","recruiter":"office","registered-nurse":"hospital","registered-nurse-2":"hospital","rehabilitation-counselor":"office","respiratory-therapist":"hospital","restaurant-manager":"restaurant","roofer":"construction","salesforce-administrator":"office","school-counselor":"school","school-teacher":"school","semiconductor-technician":"factory","set-production-designer":"studio","ship-engineer-merchant-marine":"marine","sleep-technologist":"hospital","smm-manager":"office","software-developer":"office","solar-installer":"outdoors","sommelier":"restaurant","sonographer-ultrasound":"hospital","special-education-teacher":"school","speech-public-speaking-coach":"office","speech-therapist":"hospital","sports-coach":"gym","streamer-content-creator":"remote","structural-ironworker":"construction","substance-abuse-counselor":"office","surgical-technologist":"hospital","swim-instructor":"gym","tattoo-artist":"studio","technical-writer":"office","tow-truck-operator":"transport","train-conductor":"transport","translator-interpreter":"office","transportation-inspector":"transport","tutoring-center-owner":"school","ux-researcher":"office","ux-ui-designer":"office","veterinarian":"hospital","veterinary-assistant":"hospital","video-editor":"studio","videographer":"studio","virtual-assistant":"remote","voice-actor":"studio","web-designer":"office","wedding-photographer":"studio","wedding-planner":"hotel","welder":"workshop","wellness-coach":"office","yacht-broker":"marine","yoga-pilates-instructor":"gym","ai-automation-specialist":"office","air-traffic-controller":"transport","aircraft-dispatcher-faa":"office","art-director":"studio","auto-detailing-mobile-owner":"street","car-flipping":"workshop","car-wash-owner":"street","caterer":"restaurant","childcare-center-owner":"school","chocolatier-candy-maker":"factory","choreographer":"studio","civil-engineer":"office","cleaning-company-owner":"clients-home","cloud-architect":"office","coffee-roaster":"factory","computer-hardware-engineer":"office","computer-network-architect":"office","crm-email-marketer":"office","dentist":"hospital","devops-engineer":"office","dj-event-host":"studio","ekg-technician":"hospital","elder-care-companion-pro":"clients-home","electrologist":"salon","emergency-management-director":"government","epidemiologist":"office","ev-charging-technician":"clients-home","event-planner":"hotel","fiber-optic-technician":"outdoors","flooring-installer":"clients-home","food-safety-inspector":"government","furniture-restorer":"workshop","gis-specialist-cartographer":"office","glazier-glass":"construction","hair-replacement-wig-specialist":"salon","hazardous-materials-removal-worker":"construction","heavy-equipment-operator":"construction","home-inspector":"clients-home","home-organizer-pro":"clients-home","home-stager":"clients-home","house-painter":"clients-home","hr-specialist":"office","illustrator":"studio","jewelry-maker":"workshop","junk-removal-owner":"clients-home","lab-technician":"lab","land-surveyor":"outdoors","laser-hair-removal-technician":"salon","laundromat-owner":"business","lawn-care-company-owner":"outdoors","lineworker-power-lines":"outdoors","locomotive-engineer":"transport","logistics-coordinator":"warehouse","lpn-lvn":"hospital","meal-prep-business-owner":"restaurant","mediator-arbitrator":"office","mobile-pet-groomer":"clients-home","moving-company-owner":"transport","nail-technician":"salon","orthotist-prosthetist":"hospital","painting-company-owner":"clients-home","penetration-tester":"office","pet-boarding-daycare-owner":"salon","photo-booth-event-rentals-owner":"business","pipefitter":"construction","podiatrist":"hospital","ppc-paid-ads-specialist":"office","pr-specialist":"office","pressure-washing-owner":"street","private-investigator":"street","psychiatrist":"hospital","qa-engineer":"office","real-estate-appraiser":"clients-home","real-estate-investor-flips":"clients-home","real-estate-investor-rentals":"office","reflexologist":"salon","reinforcing-iron-and-rebar-worker":"construction","resale-flipping-business":"remote","robotics-engineer":"lab","robotics-technician":"factory","security-and-fire-alarm-systems-installer":"clients-home","self-storage-owner":"warehouse","senior-home-care-agency-owner":"clients-home","seo-specialist":"office","septic-system-installer":"outdoors","sheet-metal-worker":"workshop","site-reliability-engineer":"office","social-worker":"office","sound-engineering-technician":"studio","spa-owner":"salon","sterile-processing-tech":"hospital","tile-setter":"clients-home","tower-climber-telecom":"outdoors","ugc-creator":"remote","urban-and-regional-planner":"government","vending-atm-route-owner":"transport","vet-technician":"hospital","water-wastewater-treatment-operator":"factory","water-well-driller":"outdoors","wind-turbine-technician":"outdoors","window-cleaning-owner":"clients-home","winemaker-enologist":"factory"};
function pgSetHero(hero, slug){
var wp = PG_WORKPLACE[slug];
var triedWp = false;
hero.onerror = function(){
if(wp && !triedWp){ triedWp = true; hero.src = "/pg/w-" + wp + ".webp"; }
else hero.classList.add("hidden");
};
hero.src = "/pg/" + slug + ".webp";
hero.classList.remove("hidden");
}

async function openPlayground(slug){
if(pgBusy || !live) return;
var st = pgState(); if(!st) return;
pgShow();
var hero = $("pgHero");
if(hero) pgSetHero(hero, slug);
var day = st.days[slug];
if(day && day.episodes && day.episodes.length === 6){ pgNormDay(day); pgRenderDay(slug); pgScroll(); return; }
pgBusy = true;
$("pgBody").innerHTML = '<div class="mwho">▶ One real day</div><p style="font-weight:600">Building your day as a ' + esc(pgName(slug)) + ' from the job\'s real task list…</p>';
pgScroll();
try{
var res = await api({ action: "playground", session_id: live.session_id, session: live.session, slug: slug });
pgBusy = false;
if(res.json && res.json.ok && res.json.playground && res.json.playground.episodes && res.json.playground.episodes.length === 6){
st.days[slug] = { name: res.json.playground.name, episodes: res.json.playground.episodes, feels: [], done: false,
pay_k: (typeof res.json.playground.pay_k === "number" && res.json.playground.pay_k > 0) ? res.json.playground.pay_k : null,
choices: {}, trials: {} };
store();
pgRenderDay(slug);
} else pgRenderError(slug);
}catch(e){
pgBusy = false;
pgRenderError(slug);
}
}

function pgTrialHtml(ep, idx, day){
var t = ep.trial;
var doneRec = day.trials[idx];
var html = '<div class="pg-taskbox"><h4>🎯 Your turn — ' + esc(t.title) + '</h4>';
if(doneRec && doneRec.done){
if(t.type === "order"){
html += '<p style="font-size:15px;margin:2px 0">The real order:</p><ol class="pg-ol">' +
t.correct.map(function(ci){ return '<li>' + esc(t.items[ci]) + '</li>'; }).join("") + '</ol>';
} else {
html += '<p class="pg-explain" style="margin-top:2px">The professional move: <b>' + esc(t.options[t.correct]) + '</b></p>';
}
html += '<p class="pg-explain">' + (doneRec.nailed ? "You nailed it. " : "Not this time — it happens on real days too. ") + esc(t.explain) + '</p>';
html += '</div>';
return html;
}
if(t.type === "order"){
html += '<p style="font-size:15px;margin:2px 0">Tap the steps in the order they really happen.</p>';
t.items.forEach(function(item, ii){
html += '<button type="button" class="pg-opt" data-order="' + ii + '">' + esc(item) + '</button>';
});
html += '<p class="pg-explain hidden" data-ordermsg></p>';
} else if(t.type === "spot"){
html += '<p class="pg-scene">' + esc(t.scenario) + '</p>';
t.options.forEach(function(o, ii){
html += '<button type="button" class="pg-opt" data-pick="' + ii + '">' + esc(o) + '</button>';
});
html += '<p class="pg-explain hidden" data-pickmsg></p>';
} else { // phrase
html += '<p class="pg-says">“' + esc(t.says) + '”</p>';
html += '<p style="font-size:15px;margin:2px 0">What do you say back?</p>';
t.options.forEach(function(o, ii){
html += '<button type="button" class="pg-opt" data-pick="' + ii + '">' + esc(o) + '</button>';
});
html += '<p class="pg-explain hidden" data-pickmsg></p>';
}
html += '</div>';
return html;
}

function pgWireTrial(slug, day, idx){
var body = $("pgBody"); if(!body) return;
var ep = day.episodes[idx];
var t = ep.trial;
var key = slug + ":" + idx;
body.querySelectorAll("[data-pick]").forEach(function(b){
b.addEventListener("click", function(){
var pick = parseInt(b.getAttribute("data-pick"), 10);
var nailed = pick === t.correct;
day.trials[idx] = { done: true, nailed: nailed };
store();
if(!nailed) pgVibrate([40, 60, 40]);
body.querySelectorAll("[data-pick]").forEach(function(x){
var xi = parseInt(x.getAttribute("data-pick"), 10);
x.disabled = true;
if(xi === t.correct) x.classList.add("right");
else if(xi === pick) x.classList.add("wrong");
});
var msg = body.querySelector("[data-pickmsg]");
if(msg){ msg.classList.remove("hidden"); msg.innerHTML = (nailed ? "Nailed it. " : "Not that one. ") + esc(t.explain); }
setTimeout(function(){ pgRenderDay(slug); }, 1400);
});
});
var orderBtns = body.querySelectorAll("[data-order]");
if(orderBtns.length){
/* Audit U4 (28.10.2026): wiring an order trial ALWAYS starts from a
   fresh selection. The old reuse-by-key kept the finished selection
   alive, so after "Live the day again" (same slug:trial key) every
   order click hit the already-selected guard and the day hung.
   Re-wiring only ever happens on a fresh render of an unfinished
   trial — mid-trial clicks mutate the DOM in place and the manual
   retry path resets sel itself — so a fresh object here is safe. */
pgOrderSel = { key: key, sel: [], attempts: 0 };
orderBtns.forEach(function(b){
b.addEventListener("click", function(){
var ii = parseInt(b.getAttribute("data-order"), 10);
if(pgOrderSel.sel.indexOf(ii) >= 0) return;
pgOrderSel.sel.push(ii);
b.disabled = true;
b.innerHTML = '<span class="pg-pos">' + pgOrderSel.sel.length + '</span>' + esc(t.items[ii]);
if(pgOrderSel.sel.length < 4) return;
var nailed = pgOrderSel.sel.join(",") === t.correct.join(",");
if(nailed){
day.trials[idx] = { done: true, nailed: true }; store(); pgOrderSel = null;
var msg = body.querySelector("[data-ordermsg]");
if(msg){ msg.classList.remove("hidden"); textContentSafe(msg, "In the right order. " + t.explain); }
setTimeout(function(){ pgRenderDay(slug); }, 1300);
} else {
pgOrderSel.attempts += 1;
pgVibrate([40, 60, 40]);
if(pgOrderSel.attempts >= 2){
day.trials[idx] = { done: true, nailed: false }; store(); pgOrderSel = null;
setTimeout(function(){ pgRenderDay(slug); }, 500);
} else {
var msg2 = body.querySelector("[data-ordermsg]");
if(msg2){ msg2.classList.remove("hidden"); msg2.textContent = "Not the real order — one more try."; }
pgOrderSel.sel = [];
orderBtns.forEach(function(x){ x.disabled = false; x.textContent = t.items[parseInt(x.getAttribute("data-order"), 10)]; });
}
}
});
});
}
}
function textContentSafe(el, s){ el.textContent = s; }

function pgRenderDay(slug){
var st = pgState(); var day = st && st.days[slug]; if(!day || !day.episodes) return;
pgNormDay(day);
if(!Array.isArray(day.feels)) day.feels = [];
var idx = day.feels.length;
if(idx >= day.episodes.length){ day.done = true; store(); pgRenderEnd(slug); return; }
var ep = day.episodes[idx];
var trial = pgValidTrial(ep.trial) ? ep.trial : null;
var choice = pgValidChoice(ep.choice) ? ep.choice : null;
var chat = (ep.kind === "people" || ep.kind === "crisis") && pgValidChat(ep.chat) ? ep.chat : null;
var dots = "";
day.episodes.forEach(function(e, i){ dots += '<span class="pg-dot' + (i < idx ? " done" : (i === idx ? " on" : "")) + '"></span>'; });
var html = '<div class="mwho">▶ One real day as a ' + esc(day.name || pgName(slug)) + '</div>';
html += '<div class="pg-dots">' + dots + '</div>';
html += '<div class="pg-clock">🕘 <span class="pg-clock-t">' + esc(ep.time) + '</span><span class="pg-clock-p">· ' + (PG_DAY_PART[idx] || "") + '</span></div>';
html += '<div><span class="pg-kind" style="margin-left:0">' + esc(PG_KIND_LABELS[ep.kind] || ep.kind) + '</span></div>';
html += '<h3 style="font-family:Outfit,sans-serif;font-size:20px;margin:10px 0 6px">' + esc(ep.title) + '</h3>';
if(chat){
if(ep.text) html += '<p class="pg-scene">' + esc(ep.text) + '</p>';
html += '<div class="pg-chat">';
var lastFrom = null;
chat.forEach(function(b){
if(b.from !== lastFrom){ html += '<div class="pg-bname">' + esc(PG_CHAT_NAMES[b.from]) + '</div>'; lastFrom = b.from; }
html += '<div class="pg-bub">' + esc(b.text) + '</div>';
});
html += '</div>';
} else {
html += '<p style="font-size:16px;line-height:1.55">' + esc(ep.text) + '</p>';
}
if(trial) html += pgTrialHtml(ep, idx, day);
var trialDone = !trial || (day.trials[idx] && day.trials[idx].done);
if(trialDone && choice){
var picked = day.choices[idx];
html += '<div class="pg-choicebox"><h4>Your call</h4><p style="font-size:15.5px;line-height:1.5;margin:2px 0">' + esc(choice.prompt) + '</p>';
if(typeof picked === "number"){
html += '<div class="pg-outcome"><span class="pg-picked">You chose: ' + esc(choice.options[picked].label) + '</span>' + esc(choice.options[picked].outcome) + '</div>';
} else {
choice.options.forEach(function(o, oi){
html += '<button type="button" class="pg-opt" data-choice="' + oi + '">' + esc(o.label) + '</button>';
});
}
html += '</div>';
}
var choiceDone = !choice || typeof day.choices[idx] === "number";
if(trialDone && choiceDone){
html += '<p style="margin-top:14px;font-weight:600">How did that feel?</p>';
html += '<div class="choice" style="margin-top:8px">' +
'<button type="button" data-feel="loved">Loved it</button>' +
'<button type="button" data-feel="fine">Fine</button>' +
'<button type="button" data-feel="drained">Drained</button></div>';
}
html += '<button type="button" class="pg-skip" id="pgSkipBtn">Skip — straight to my plan</button>';
$("pgBody").innerHTML = html;
if(ep.kind === "crisis" && pgVibKey !== slug + ":" + idx){ pgVibKey = slug + ":" + idx; pgVibrate(60); }
if(trial && !(day.trials[idx] && day.trials[idx].done)) pgWireTrial(slug, day, idx);
$("pgBody").querySelectorAll("[data-choice]").forEach(function(b){
b.addEventListener("click", function(){
day.choices[idx] = parseInt(b.getAttribute("data-choice"), 10);
store();
pgRenderDay(slug);
});
});
$("pgBody").querySelectorAll("[data-feel]").forEach(function(b){
b.addEventListener("click", function(){
day.feels[idx] = b.getAttribute("data-feel");
if(day.feels.length >= day.episodes.length){ day.done = true; store(); pgRenderEnd(slug); }
else { store(); pgRenderDay(slug); }
});
});
var sk = $("pgSkipBtn"); if(sk) sk.addEventListener("click", pgSkip);
}

function pgRenderEnd(slug){
var st = pgState(); var day = st && st.days[slug]; if(!day || !day.episodes) return;
pgNormDay(day);
day.done = true; store();
var loved = [], drained = [];
day.episodes.forEach(function(ep, i){
if(day.feels[i] === "loved") loved.push(ep);
if(day.feels[i] === "drained") drained.push(ep);
});
var rIdx = -1;
day.episodes.forEach(function(e, i){ if(e.kind === "routine") rIdx = i; });
var rFeel = rIdx >= 0 ? day.feels[rIdx] : null;
var n = pgFeelCounts(day);
var html = '<div class="mwho">▶ Your day as a ' + esc(day.name || pgName(slug)) + ' — lived</div>';
html += '<div class="pg-dots">' + day.episodes.map(function(){ return '<span class="pg-dot done"></span>'; }).join("") + '</div>';
html += '<h3 style="font-family:Outfit,sans-serif;font-size:20px;margin:6px 0 4px">The day, in your own taps</h3>';
if(loved.length) html += '<p class="wow-line">You lit up on: ' + loved.map(function(e){ return esc(e.title); }).join(" · ") + '.</p>';
else html += '<p class="wow-line">Nothing today lit you up. That\'s data too — and it\'s yours, not a score.</p>';
var drainedOther = drained;
if(drainedOther.length) html += '<p class="wow-line">What drained you: ' + drainedOther.map(function(e){ return esc(e.title); }).join(" · ") + '.</p>';
if(rFeel === "drained") html += '<p class="wow-line">The routine block drained you — and it\'s the part of this job that repeats every single day, not once.</p>';
else if(rFeel === "fine") html += '<p class="wow-line">The routine block was just fine for you — neither fuel nor drain.</p>';
else if(rFeel === "loved") html += '<p class="wow-line">Even the routine block felt good. The daily grind of this job doesn\'t scare you — that\'s rare.</p>';
html += '<p style="margin-top:10px;color:#5c5566;font-size:14.5px">Loved ' + n.loved + ' · fine ' + n.fine + ' · drained ' + n.drained + ' — out of 6. This changes nothing in your matchmaker\'s scores. It changes what you know before you commit.</p>';
var energy = 100 - n.loved * 5 - n.fine * 10 - n.drained * 25;
if(energy < 5) energy = 5; if(energy > 100) energy = 100;
html += '<div class="pg-nums"><h4>Your day in numbers</h4>';
if(typeof day.pay_k === "number" && day.pay_k > 0){
var dayPay = Math.round(day.pay_k * 1000 / 260 / 5) * 5;
html += '<p class="pg-numline">💵 A day like this pays about <b>$' + dayPay + '</b>. A week of them — about <b>$' + (dayPay * 5) + '</b>.</p>';
}
html += '<p class="pg-numline">🔋 Energy left at the end of the day: <b>' + energy + '%</b></p>';
html += '<div class="pg-ebar"><span style="width:' + energy + '%"></span></div>';
var tIdx = -1;
day.episodes.forEach(function(ep, i){ if(pgValidTrial(ep.trial) && day.trials[i] && day.trials[i].done) tIdx = i; });
if(tIdx >= 0){
var tr = day.episodes[tIdx].trial;
html += '<p class="pg-numline">🎯 Your trial: <b>' + (day.trials[tIdx].nailed ? "nailed it" : "missed it this time") + '</b>. ' + esc(tr.explain) + '</p>';
}
html += '</div>';
html += '<p class="pg-ready">This day, five days a week. Ready?</p>';
html += '<button type="button" class="btn" id="pgMarry">💍 Marry it</button>';
var order = ((lastResult && lastResult.top3) || []).map(function(c){ return c.slug; });
var oi = order.indexOf(slug);
var hasNext = oi >= 0 && oi < order.length - 1;
html += '<button type="button" class="btn ghost" id="pgPass">' + (hasNext ? "Pass — next match" : "Pass — back to my matches") + '</button>';
html += '<button type="button" class="pg-skip" id="pgAgain">↻ Live the day again</button>';
$("pgBody").innerHTML = html;
pgShow();
pgRefreshBtn(slug);
$("pgMarry").addEventListener("click", function(){ pgMarry(slug); });
$("pgPass").addEventListener("click", function(){ pgPass(slug); });
$("pgAgain").addEventListener("click", function(){ day.feels = []; day.choices = {}; day.trials = {}; day.done = false; pgOrderSel = null; store(); pgRenderDay(slug); });
}

function pgMarry(slug){
var st = pgState(); if(!st) return;
st.pick = slug; store();
pgHide();
document.querySelectorAll("#verdictBody [data-cardslug]").forEach(function(card){
var rib = card.querySelector(".pg-pick-ribbon"); if(rib) rib.remove();
if(card.getAttribute("data-cardslug") === slug){
var b = document.createElement("span");
b.className = "pg-pick-ribbon"; b.textContent = "💍 Your pick";
card.insertBefore(b, card.firstChild);
}
});
var card = document.querySelector('#verdictBody [data-cardslug="' + slug + '"]');
var top1 = lastResult && lastResult.top3 && lastResult.top3[0];
if(top1 && top1.slug === slug){
setTimeout(function(){
var letter = document.querySelector("#verdictBody .letter-card");
if(letter) letter.scrollIntoView({ behavior: "smooth", block: "start" });
else if(card) card.scrollIntoView({ behavior: "smooth", block: "center" });
}, 400);
} else if(card){
card.scrollIntoView({ behavior: "smooth", block: "center" });
}
}

function pgPass(slug){
pgHide();
var order = ((lastResult && lastResult.top3) || []).map(function(c){ return c.slug; });
var i = order.indexOf(slug);
var next = i >= 0 ? order[i + 1] : null;
if(!next) return;
var card = document.querySelector('#verdictBody [data-cardslug="' + next + '"]');
if(!card) return;
card.scrollIntoView({ behavior: "smooth", block: "center" });
card.classList.remove("pg-pulse");
void card.offsetWidth;
card.classList.add("pg-pulse");
}

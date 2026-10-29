// tests/ux.test.mjs
// UI smalls batch (29.10.2026): ux.js DOM enhancements — beforeunload
// guard arming, $K money echoes, rank6 Move-down + aria, label
// association. Runs against the real mentor.html shell in jsdom with
// widget DOM replicated from the page's own renderers (liveWidget in
// mentor.html / widget in chat.js). Skips cleanly where jsdom is not
// installed (it lives outside the repo in this workspace).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let JSDOM = null;
for (const cand of [process.env.JSDOM_PATH, '/home/hatch/workspace/cg-scratch/node_modules/jsdom']) {
  if (!cand) continue;
  try { JSDOM = require(cand).JSDOM; if (JSDOM) break; } catch (e) {}
}
const SKIP = !JSDOM;

function setup() {
  const html = readFileSync(join(ROOT, 'mentor.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://careerglitch.com/mentor', pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  win.eval(readFileSync(join(ROOT, 'ux.js'), 'utf8'));
  return { dom, win, doc: win.document };
}
const tick = () => new Promise((r) => setTimeout(r, 10));

// Widget DOM replicated from liveWidget (mentor.html): wrap div whose
// first child is a bare <label>, then the control.
function numWrap(doc, labelText) {
  const wrap = doc.createElement('div');
  const lab = doc.createElement('label'); lab.textContent = labelText; wrap.appendChild(lab);
  const inp = doc.createElement('input'); inp.type = 'number'; wrap.appendChild(inp);
  return { wrap, inp, lab };
}
function choiceWrap(doc, labelText, options) {
  const wrap = doc.createElement('div');
  const lab = doc.createElement('label'); lab.textContent = labelText; wrap.appendChild(lab);
  const box = doc.createElement('div'); box.className = 'choice';
  options.forEach((o) => {
    const b = doc.createElement('button'); b.type = 'button'; b.textContent = o;
    b.addEventListener('click', () => {
      box.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
    });
    box.appendChild(b);
  });
  wrap.appendChild(box);
  return { wrap, box, lab };
}
function rankWidget(doc, values, labels) {
  let order = values.slice();
  const ul = doc.createElement('ul'); ul.className = 'ranklist';
  function draw() {
    ul.innerHTML = '';
    order.forEach((k, i) => {
      const li = doc.createElement('li');
      li.innerHTML = '<span class="n">' + (i + 1) + '</span><span>' + labels[k] + '</span>';
      if (i > 0) {
        const up = doc.createElement('button'); up.type = 'button'; up.className = 'up'; up.textContent = '↑ Move up';
        up.addEventListener('click', () => { const t = order[i - 1]; order[i - 1] = order[i]; order[i] = t; draw(); });
        li.appendChild(up);
      }
      ul.appendChild(li);
    });
  }
  draw();
  return { ul, getOrder: () => order.slice() };
}

// ---------------------------------------------------------------- money
test('money echo: $K fields gain placeholder + full-dollar echo; plain numbers untouched', { skip: SKIP }, async () => {
  const { win, doc } = setup();
  const host = doc.getElementById('tailWidgets');
  const floor = numWrap(doc, 'Income floor, $K per year — below this, life does not work');
  const budget = numWrap(doc, 'Budget for entering a new profession, $K total');
  const age = numWrap(doc, 'Age in years');
  host.append(floor.wrap, budget.wrap, age.wrap);
  await tick();

  assert.equal(floor.inp.placeholder, '85 = $85,000');
  assert.equal(budget.inp.placeholder, '5 = $5,000');
  assert.equal(age.inp.placeholder, '', 'non-money number field must not gain a placeholder');
  assert.equal(age.wrap.querySelector('.ux-echo'), null, 'non-money field must not gain an echo');

  const floorEcho = floor.wrap.querySelector('.ux-echo');
  assert.ok(floorEcho, 'money field gains an echo element');
  floor.inp.value = '36000';
  floor.inp.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal(floorEcho.textContent, '= $36,000,000 a year');
  floor.inp.value = '85';
  floor.inp.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal(floorEcho.textContent, '= $85,000 a year');
  floor.inp.value = '';
  floor.inp.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal(floorEcho.textContent, '');

  const budgetEcho = budget.wrap.querySelector('.ux-echo');
  budget.inp.value = '5';
  budget.inp.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal(budgetEcho.textContent, '= $5,000 total');
});

test('money echo: chat fix editor with a pseudo label reads $K from the confirm line above', { skip: SKIP }, async () => {
  const { win, doc } = setup();
  const interview = doc.getElementById('interview');
  const list = doc.createElement('div');
  const row = doc.createElement('div'); row.className = 'chat-line';
  row.textContent = 'Income floor, $K per year: $100K';
  const fixBox = doc.createElement('div'); fixBox.className = 'chat-fixbox';
  const ed = numWrap(doc, 'Fix: income floor k');
  ed.inp.value = '100';
  fixBox.appendChild(ed.wrap);
  list.append(row, fixBox);
  interview.appendChild(list);
  await tick();
  const echo = ed.wrap.querySelector('.ux-echo');
  assert.ok(echo, 'cross-stage money fix input gains an echo');
  assert.equal(echo.textContent, '= $100,000 a year', 'pre-filled value echoes immediately');
});

// ---------------------------------------------------------------- labels + toggles
test('labels: control gets htmlFor/id; grouped widget gets role=group + aria-labelledby', { skip: SKIP }, async () => {
  const { doc } = setup();
  const host = doc.getElementById('tailWidgets');
  const num = numWrap(doc, 'Current income, $K per year');
  const ch = choiceWrap(doc, 'Work / licensing documents status', ['yes', 'no']);
  host.append(num.wrap, ch.wrap);
  await tick();
  assert.ok(num.inp.id, 'number input gains an id');
  assert.equal(num.lab.htmlFor, num.inp.id);
  assert.ok(ch.lab.id, 'group label gains an id');
  assert.equal(ch.box.getAttribute('role'), 'group');
  assert.equal(ch.box.getAttribute('aria-labelledby'), ch.lab.id);
});

test('toggles: choice buttons mirror .sel into aria-pressed', { skip: SKIP }, async () => {
  const { doc } = setup();
  const host = doc.getElementById('tailWidgets');
  const ch = choiceWrap(doc, 'Pick one', ['a', 'b']);
  host.appendChild(ch.wrap);
  await tick();
  const [b1, b2] = ch.box.querySelectorAll('button');
  assert.equal(b1.getAttribute('aria-pressed'), 'false');
  assert.equal(b2.getAttribute('aria-pressed'), 'false');
  b2.click();
  await tick();
  assert.equal(b2.getAttribute('aria-pressed'), 'true');
  assert.equal(b1.getAttribute('aria-pressed'), 'false');
});

// ---------------------------------------------------------------- ranking
test('rank6: every row but the last gains Move down (reusing Move up), with aria-labels', { skip: SKIP }, async () => {
  const { doc } = setup();
  const host = doc.getElementById('tailWidgets');
  const labels = { achievement: 'Achievement', independence: 'Independence', recognition: 'Recognition' };
  const rk = rankWidget(doc, ['achievement', 'independence', 'recognition'], labels);
  const wrap = doc.createElement('div');
  const lab = doc.createElement('label'); lab.textContent = 'Rank the 6 work values'; wrap.appendChild(lab);
  wrap.appendChild(rk.ul);
  host.appendChild(wrap);
  await tick();

  let lis = rk.ul.children;
  assert.equal(lis.length, 3);
  assert.ok(lis[0].querySelector('button.down'), 'first row gains Move down');
  assert.ok(lis[1].querySelector('button.down'), 'middle row gains Move down');
  assert.equal(lis[2].querySelector('button.down'), null, 'last row has no Move down');
  assert.equal(lis[0].querySelector('button.down').getAttribute('aria-label'), 'Move Achievement down');
  assert.equal(lis[1].querySelector('button.up').getAttribute('aria-label'), 'Move Independence up');

  // Move down on row 1 must swap rows 1/2 via row 2's own Move up.
  lis[0].querySelector('button.down').click();
  assert.deepEqual(rk.getOrder(), ['independence', 'achievement', 'recognition']);
  await tick();
  lis = rk.ul.children;
  assert.ok(lis[0].querySelector('button.down'), 'redrawn list is re-enhanced');
  assert.equal(lis[0].querySelector('button.down').getAttribute('aria-label'), 'Move Independence down');
});

// ---------------------------------------------------------------- guard
function unloadPrevented(win) {
  const ev = new win.Event('beforeunload', { cancelable: true });
  win.dispatchEvent(ev);
  return ev.defaultPrevented;
}

test('beforeunload: never armed on landing; armed mid-interview; disarmed at verdict', { skip: SKIP }, async () => {
  const { win, doc } = setup();
  assert.equal(unloadPrevented(win), false, 'landing state must not trap the visitor');

  const iv = doc.getElementById('interview');
  iv.classList.remove('hidden');
  win.live = { session_id: 'x', session: { phase: 'stages', stage_index: 0 } };
  assert.equal(unloadPrevented(win), true, 'live session before verdict arms the guard');

  win.live.session.phase = 'done';
  assert.equal(unloadPrevented(win), false, 'done session disarms the guard');

  win.live.session.phase = 'stages';
  doc.getElementById('verdict').classList.remove('hidden');
  assert.equal(unloadPrevented(win), false, 'verdict on screen disarms even with a stale phase');
  doc.getElementById('verdict').classList.add('hidden');

  win.live = null;
  const panel = doc.createElement('div');
  panel.id = 'chatPanel';
  iv.appendChild(panel);
  assert.equal(unloadPrevented(win), true, 'open chat panel arms the guard');
  panel.style.display = 'none';
  doc.getElementById('stageCard').classList.add('hidden');
  assert.equal(unloadPrevented(win), false, 'nothing in progress: guard off');
});

test('beforeunload: the page\'s own Start-over reload is not guarded', { skip: SKIP }, async () => {
  const { win, doc } = setup();
  const iv = doc.getElementById('interview');
  iv.classList.remove('hidden');
  win.live = { session_id: 'x', session: { phase: 'stages', stage_index: 2 } };
  assert.equal(unloadPrevented(win), true);
  doc.getElementById('restartBtn').click();
  assert.equal(unloadPrevented(win), false, 'restart click suppresses the guard for its own reload');
});

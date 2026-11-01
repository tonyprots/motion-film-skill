// Paper (lib/paper.js), reveal (lib/reveal.js) and handwriting (lib/hand.js), in node with a stub page.
//   node tests/test_paper_hand.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Motion = require(path.join(skill, 'engine/lib/motion.js'));

function mulberry32(a) {   // same as engine/core.js
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// a canvas whose 2D context records what was drawn, so two paints of the same t can be compared
function canvas() {
  const log = [];
  const ctx = new Proxy({ log }, { get: (o, k) => (k in o ? o[k] : (...a) => {
    if (k === 'createImageData') { const [w, h] = a; return { data: new Uint8ClampedArray(w * h * 4), w, h }; }
    if (k === 'putImageData') { o.last = Array.from(a[0].data); return; }
    if (k === 'measureText') { log.push([k, a[0]]); return { width: a[0].length * 20, actualBoundingBoxAscent: 40, actualBoundingBoxDescent: 12 }; }
    if (k === 'createLinearGradient') { log.push([k, ...a.map((v) => +v.toFixed(3))]); return { addColorStop() {} }; }
    log.push([k, ...a.map((v) => (typeof v === 'number' ? +v.toFixed(3) : typeof v))]);
  }), set: (o, k, v) => { log.push([k, v]); return true; } });
  return { getContext: () => ctx, setAttribute() {}, style: {}, ctx, width: 0, height: 0 };
}
function page() {
  const marks = { a: 1, b: 3 }, before = [];
  const C = {
    W: 1920, H: 1080, bt: (m) => (typeof m === 'number' ? m : marks[m]), mulberry32, pending: [], gates: [],
    clamp: (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), hooks: { before },
    ease: { inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2), out: (x) => 1 - Math.pow(1 - x, 3) },
  };
  const made = [];
  const doc = { createElement: (tag) => (tag === 'canvas' ? (made.push(canvas()), made.at(-1)) : { style: {}, setAttribute() {} }), fonts: { load: async () => [] } };
  const ctx = { window: {}, C, Motion, document: doc, console };
  ctx.window.C = C; ctx.window.Motion = Motion;
  vm.createContext(ctx);
  for (const f of ['engine/lib/paper.js', 'engine/lib/reveal.js', 'engine/lib/hand-glyphs.js', 'engine/lib/hand.js'])
    vm.runInContext(fs.readFileSync(path.join(skill, f), 'utf8'), ctx, { filename: f });
  ctx.window.HAND_GLYPHS ??= ctx.HAND_GLYPHS;
  return { ...ctx.window, C, made, paint: (t) => before.forEach((h) => h(t)) };
}
const results = [], queue = [];
const check = (name, fn) => queue.push([name, fn]);

check('PAPER.drop: held up, falls faster, lands on its mark with the shadow tight, then sits still', () => {
  const { PAPER } = page();
  const at = (t) => PAPER.drop(t, 1, { from: 'bottom' });
  assert.equal(at(1.1).h, 1);                                        // first 45 %: still in the air
  assert.ok(at(1.5).h > at(1.6).h && at(1.5).h - at(1.6).h < at(1.6).h - at(1.68).h + 0.2, 'fall speeds up');
  assert.ok(at(1.7).h < 0.08 && at(1.7).h >= 0, `landed h ${at(1.7).h}`);
  const late = at(3);
  assert.ok(Math.abs(late.y) < 0.01 && Math.abs(late.r) < 0.05 && late.s === 1, JSON.stringify(late));
  assert.match(late.css.filter, /^drop-shadow\(0px 1px 1\.0px/);   // contact shadow tight under the edge
  assert.equal(at(0.9).hide, true);
});
check('PAPER.tape: 135 % above the lens down to 100 %, squash rings out', () => {
  const { PAPER } = page();
  assert.ok(Math.abs(PAPER.tape(1, 1).s - 1.35) < 1e-9);
  const hit = PAPER.tape(1.2001, 1); assert.ok(Math.abs(hit.s - 1) < 1e-3 && hit.sx > 1.07, JSON.stringify(hit));
  const rest = PAPER.tape(2, 1); assert.ok(Math.abs(rest.sx - 1) < 1e-6 && Math.abs(rest.sy - 1) < 1e-6);
});
check('REVEAL: the front starts at the chosen edge, p runs 0 → 1 and slows down', () => {
  const { REVEAL } = page();
  const R = REVEAL.field(400, 200, { from: 'left', seed: 2 });
  const col = (i) => { let s = 0; for (let j = 0; j < R.fh; j++) s += R.v[j * R.fw + i]; return s / R.fh; };
  assert.ok(col(2) < col(R.fw - 3) - 0.3, `left ${col(2)} right ${col(R.fw - 3)}`);
  assert.ok(Math.min(...R.v) === 0 && Math.max(...R.v) === 1);
  assert.equal(REVEAL.p(0.9, 1, 1), 0); assert.equal(REVEAL.p(2.5, 1, 1), 1);
  assert.ok(REVEAL.p(1.25, 1, 1) - REVEAL.p(1, 1, 1) > REVEAL.p(2, 1, 1) - REVEAL.p(1.75, 1, 1));
});
check('REVEAL.draw: the same p paints the same mask, whatever came before', () => {
  const { REVEAL } = page();
  const R = REVEAL.field(120, 80, { from: 'center', seed: 4 }), out = canvas(), src = canvas();
  const mask = (p) => { REVEAL.draw(out.ctx, src, R, p, { tide: '#123' }); return R.ctx.last.join(); };
  const a = mask(0.4); mask(0.9); mask(0.1); const b = mask(0.4);
  assert.equal(a, b);
});
check('HAND: dots and accents come at the end of their word; letters run at ~cps', () => {
  const { HAND, C } = page();
  const H = HAND.write({ append() {} }, 'ёж йод', 1, { cps: 8 });
  // the canvas log for a t long after the end holds every stroke; the order of first appearance is the pen order
  assert.ok(H.end > 1 + 5 / 8 * 0.6 && H.end < 1 + 5 / 8 * 2.2, `end ${H.end}`);
  const p0 = H.pen(1), pE = H.pen(H.end + 1);
  assert.equal(p0.down, true); assert.equal(pE.down, false);
  // ё's dots (high above the x-height, over ё) are written only after the pen has been over ж
  const size = 48, base = size * 1.15, ew = HAND.measure('ё', {}).w;
  const ts = Array.from({ length: 2000 }, (_, i) => 1 + (H.end - 1) * i / 1999);
  const tZh = ts.find((t) => H.pen(t).x > ew + 4), tDots = ts.find((t) => { const q = H.pen(t); return q.down && q.x < ew && q.y < base - 0.8 * size; });
  assert.ok(tZh && tDots && tDots > tZh, `ж at ${tZh}, ё dots at ${tDots}`);
  C.hooks.before.length = 0;
});
check('HAND: a frame is painted whole from t, whatever was painted before', () => {
  const { HAND, paint } = page();
  const box = { append(c) { box.c = c; } };
  HAND.write(box, 'Hello мир', 1, {});
  const at = (t) => { box.c.ctx.log.length = 0; paint(t); return JSON.stringify(box.c.ctx.log); };
  const cold = at(1.7); at(3.5); at(1.2); assert.equal(at(1.7), cold);
  const ops = JSON.parse(cold).map((x) => x[0]);
  assert.ok(ops.indexOf('clearRect') >= 0 && ops.indexOf('clearRect') < ops.indexOf('stroke'), 'the canvas is cleared before the strokes');
  assert.ok(cold.includes('lineTo') && at(0.5).split('lineTo').length === 1, 'nothing before the start');
});
check('HAND glyph data: every Cyrillic letter, Latin and digits are present in their faces', () => {
  const { HAND_GLYPHS: G } = page();
  for (const ch of 'абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ0123456789') assert.ok(G.cyr[ch]?.s.length, ch);
  for (const ch of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') assert.ok(G.script[ch]?.s.length && G.sans[ch]?.s.length, ch);
});

check('HAND font mode: timing from the letter count, nothing before the start, the pen sweeps each letter and lifts on spaces', async () => {
  const { HAND, C } = page();
  const box = { append(c) { box.c = c; } };
  const H = HAND.write(box, 'Мир да', 1, { font: 'Caveat', cps: 10 });
  assert.ok(Math.abs(H.end - (1 + 5 / 10 + 0.3 / 10 + 0.05)) < 1e-9, `end ${H.end}`);   // 5 letters + one space
  await Promise.all(C.gates);
  assert.equal(H.size.w, 6 * 20);                                                        // stub: 20 px a char
  const xs = Array.from({ length: 200 }, (_, i) => H.pen(1 + (H.end - 1) * i / 199).x);
  assert.ok(xs.every((x, i) => !i || x >= xs[i - 1] - 1e-9), 'the pen never goes back on one line');
  assert.equal(H.pen(1.05).down, true); assert.equal(H.pen(1 + 0.3 + 0.01).down, false);   // in «М», in the space
  assert.ok(Math.abs(H.pen(1.05).x - 10) < 1e-6, 'half way through the first letter');
});
check('HAND font mode: a frame is painted whole from t; the front only reaches what the pen has written', async () => {
  const { HAND, C, paint, made } = page();
  const box = { append(c) { box.c = c; } };
  HAND.write(box, 'Привет мир', 1, { font: 'Caveat', cps: 8 });
  await Promise.all(C.gates);
  const at = (t) => { box.c.ctx.log.length = 0; paint(t); return JSON.stringify(box.c.ctx.log); };
  const cold = at(1.5); at(3); at(1.1); assert.equal(at(1.5), cold);
  assert.ok(!at(0.5).includes('drawImage'), 'nothing before the start');
  // half way through letter 5 (index 4): front at 80 + 10 px (stub: 20 px a letter), soft edge 0.3 × 48 px behind it
  const mask = made.at(-1).ctx; mask.log.length = 0; paint(1 + 4.5 / 8);
  const g = mask.log.find((x) => x[0] === 'createLinearGradient');
  assert.deepEqual(g, ['createLinearGradient', 75.6, 0, 90, 0]);
  mask.log.length = 0; paint(9);
  assert.ok(!mask.log.some((x) => x[0] === 'createLinearGradient'), 'after the end the line is shown whole, no front');
});
check('HAND font mode: wrapping at o.width puts words on new lines, the pen starts each line at its left edge', async () => {
  const { HAND, C } = page();
  const box = { append(c) { box.c = c; } };
  const H = HAND.write(box, 'аа бб вв', 1, { font: 'Caveat', cps: 10, width: 70 });
  await Promise.all(C.gates);
  assert.equal(H.size.w, 40);                                   // longest line «аа»
  const tB = 1 + 2 / 10 + 0.3 / 10 + 0.05 + 0.01;               // inside «б» of the second line
  const p = H.pen(tB);
  assert.ok(p.x < 20 && p.y > H.pen(1.01).y + 40, JSON.stringify(p));
});

for (const [name, fn] of queue) { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); } }
console.log(JSON.stringify({ passed: results.filter((x) => x.ok).length, total: results.length, results }, null, 2));
if (results.some((x) => !x.ok)) process.exitCode = 1;

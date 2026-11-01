// Theme motion grammar (lib/themes.js) and the log-space camera zoom (lib/camera.js), in node with a stub page.
//   node tests/test_themes.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Motion = require(path.join(skill, 'engine/lib/motion.js'));

function page(tlMotion, theme) {
  const marks = { a: 1, b: 3 };
  const TL = { motion: tlMotion };
  const C = {
    TL, FPS: 60, W: 1920, H: 1080, bt: (m) => (typeof m === 'number' ? m : marks[m]),
    clamp: (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp: (a, b, u) => a + (b - a) * u,
    ease: { inOut: (x) => x }, noise1: () => () => 0, el: () => ({}), reg: () => {},
    put: (e, p) => { e.p = p; },
  };
  C.sp = (t, beat, preset = 'default') => Motion.step(t - C.bt(beat), preset);
  C.trkObj = (t, keys, preset = 'default') => {
    const out = {};
    for (const k of Object.keys(keys[0][1])) out[k] = Motion.track(t, keys.map(([b, v, p]) => [C.bt(b), v[k] ?? keys[0][1][k], p]), preset);
    return out;
  };
  const css = [], props = {};
  const doc = { head: { appendChild: (e) => css.push(e.textContent) }, createElement: () => ({}), documentElement: { style: { setProperty: (k, v) => { props[k] = v; } } } };
  const handCalls = [];
  const ctx = { window: {}, C, Motion, document: doc, getComputedStyle: () => ({ overflow: 'visible' }), console, HAND: { write: (...a) => handCalls.push(a) } };
  ctx.window.C = C; ctx.window.Motion = Motion; ctx.window.TL = theme ? { theme } : {};
  vm.createContext(ctx);
  for (const f of ['engine/lib/themes.js', 'engine/lib/camera.js']) vm.runInContext(fs.readFileSync(path.join(skill, f), 'utf8'), ctx, { filename: f });
  return { THEMES: ctx.window.THEMES, CAM: ctx.window.CAM, C, handCalls, css, props };
}
const range = (a, b, dt = 1 / 240) => { const r = []; for (let t = a; t <= b + 1e-9; t += dt) r.push(t); return r; };
const results = [];
const check = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); } };

check('riso: the print layer runs on twos (12 drawings a second)', () => {
  const { THEMES } = page();
  const T = THEMES.use('riso');
  assert.equal(T.q(1.0 + 0.5 / 12), 1.0);
  assert.equal(T.drawing(1.0 + 1 / 12 + 1e-4) - T.drawing(1.0), 1);
});
check('riso stamp: lands at ~114 %, undershoots ~9 %, settles at 100 % with no tilt', () => {
  const T = page().THEMES.use('riso');
  const s = range(1, 2).map((t) => T.enter(t, 'a').s);
  assert.ok(Math.abs(s[0] - 1.14) < 1e-6, `first ${s[0]}`);
  const min = Math.min(...s);
  assert.ok(min > 0.88 && min < 0.94, `undershoot to ${min.toFixed(3)}`);
  const end = T.enter(2, 'a');
  assert.ok(Math.abs(end.s - 1) < 0.01 && Math.abs(end.r) < 0.1, `end s ${end.s} r ${end.r}`);
  assert.equal(T.enter(0.9, 'a').hide, true);
});
check('feed snap: pushed out of the margin with ~8 % overshoot, then locks', () => {
  const T = page().THEMES.use('feed');
  const x = range(1, 2.5).map((t) => T.enter(t, 'a').x);
  const over = Math.max(...x) / 80;
  assert.ok(over > 0.05 && over < 0.11, `overshoot ${(over * 100).toFixed(1)} %`);
  assert.ok(Math.abs(T.enter(2.5, 'a').x) < 0.5);
});
check('studio rise: the theme\'s enter role overshoots ~10 %', () => {
  const T = page().THEMES.use('studio');
  const y = range(1, 2.5).map((t) => T.enter(t, 'a', { d: 100 }).y);
  const over = -Math.min(...y) / 100;
  assert.ok(over > 0.07 && over < 0.13, `overshoot ${(over * 100).toFixed(1)} %`);
});
check('blueprint draw: a stroke grows 0 → 1 over its duration', () => {
  const T = page().THEMES.use('blueprint');
  assert.equal(T.enter(1, 'a').css.strokeDashoffset, '1');
  assert.equal(T.enter(1.6, 'a').css.strokeDashoffset, '0');
});
check('riso slip: plates kick apart, spring back past register, lock', () => {
  const T = page().THEMES.use('riso');
  const d = range(1, 2.5).map((t) => T.slip(t, 'a'));
  assert.ok(Math.max(...d) > 20, `kick ${Math.max(...d).toFixed(1)} px`);
  assert.ok(Math.min(...d) < -1, `past register ${Math.min(...d).toFixed(1)} px`);
  assert.ok(Math.abs(T.slip(2.5, 'a')) < 0.5);
});
check('timeline.json motion wins over the theme, key by key', () => {
  const { THEMES, C } = page({ roles: { enter: 'heavy' }, stagger: 0.03 });
  const T = THEMES.use('studio');
  const y = range(1, 2.5).map((t) => T.enter(t, 'a', { d: 100 }).y);
  assert.ok(Math.min(...y) > -0.5, 'heavy (critical) has no overshoot');
  assert.equal(C.TL.motion.stagger, 0.03);
  const { THEMES: T2, C: C2 } = page();
  T2.use('riso');
  assert.equal(C2.TL.motion.stagger, 0.17);
});
check('reference theme has no motion grammar and changes nothing', () => {
  const T = page().THEMES.use('reference');
  assert.equal(T.motion, null);
  assert.equal(T.q(1.234), 1.234);
});
check('CAM.rig zooms in log space: halfway through 1× → 3× is √3, not 2', () => {
  const { CAM } = page();
  const mk = () => ({ offsetLeft: 0, offsetTop: 0, offsetWidth: 1920, parentElement: null, dataset: {} });
  const keys = [['a', { x: 960, y: 540, z: 1 }], ['b', { x: 960, y: 540, z: 3 }]];
  const pre = { response: 1, damping: 1 };
  // find the time the spring is half way, then compare
  let th = 3; while (Motion.step(th - 3, pre) < 0.5) th += 0.0005;
  const zl = CAM.rig(th - 0.4, mk(), keys, { keep: false, preset: pre }).z;
  const zn = CAM.rig(th - 0.4, mk(), keys, { keep: false, preset: pre, zoom: 'linear' }).z;
  assert.ok(Math.abs(zl - Math.sqrt(3)) < 0.01, `log ${zl}`);
  assert.ok(Math.abs(zn - 2) < 0.01, `linear ${zn}`);
  const end = CAM.rig(9, mk(), keys, { keep: false }).z;
  assert.ok(Math.abs(end - 3) < 1e-3, `end ${end}`);
});

check('every theme names a hand, and fonts.sh fetches each of its faces', () => {
  const { THEMES } = page();
  const sh = fs.readFileSync(path.join(skill, 'scripts/fonts.sh'), 'utf8');
  const ids = Object.fromEntries(Object.values(THEMES.fonts).map(([fam, id]) => [fam, id]));
  for (const n of THEMES.names) {
    const T = THEMES.use(n), line = (sh.match(new RegExp(`^\\s*${n}\\)\\s*set -- ([^;]+);`, 'm')) || [])[1];
    assert.ok(T.H && T.hand && T.hw, `${n}: hand fields`);
    assert.ok(line, `${n}: no case in fonts.sh`);
    for (const fam of new Set([T.D, T.U, T.N, T.H])) {
      if (n === 'reference' && ['Display', 'UI'].includes(fam)) continue;
      assert.ok(ids[fam], `${n}: ${fam} is not in THEMES.fonts`);
      assert.ok(line.split(/\s+/).includes(ids[fam]), `${n}: fonts.sh does not fetch ${ids[fam]} (${line})`);
    }
  }
});
check('T.write hands the theme\'s hand to HAND.write, own options win', () => {
  const { THEMES, handCalls } = page();
  THEMES.use('school').write('p', 'Классная работа', 'a', { cps: 6, color: '#c41e3a' });
  assert.deepEqual(handCalls[0].slice(0, 3), ['p', 'Классная работа', 'a']);
  assert.deepEqual({ ...handCalls[0][3] }, { font: 'Marck', weight: 400, color: '#c41e3a', cps: 6 });
});

check('THEMES.auto: no theme in timeline.json → null, nothing applied', () => {
  const { THEMES, css, props } = page();
  assert.equal(THEMES.auto(), null);
  assert.equal(css.length, 0); assert.equal(Object.keys(props).length, 0);
});
check('THEMES.auto: the picked theme sets palette, faces and the starter classes', () => {
  const { THEMES, css, props } = page(undefined, { name: 'school', why: 'test' });
  const T = THEMES.auto();
  assert.equal(T.name, 'school'); assert.equal(props['--bg'], '#fbfdff');
  assert.ok(css.some((c) => c.includes("font-family:'Marck'")), 'hand @font-face');
  assert.ok(css.some((c) => c.includes(".display{font-family:'Commissioner'")), 'display class');
});
check('THEMES.auto: only "hand" keeps the brand palette and loads the hand face alone', () => {
  const { THEMES, css, props, handCalls } = page(undefined, { name: 'card', only: 'hand' });
  const T = THEMES.auto();
  assert.equal(T.only, 'hand'); assert.equal(Object.keys(props).length, 0);
  assert.equal(css.length, 1); assert.ok(css[0].includes("'GreatVibes'") && !css[0].includes("'Literata'"));
  T.write({}, 'x', 'a', { size: 40 });
  assert.equal(handCalls[0][3].font, 'GreatVibes');
});

console.log(JSON.stringify({ passed: results.filter((x) => x.ok).length, total: results.length, results }, null, 2));
if (results.some((x) => !x.ok)) process.exitCode = 1;

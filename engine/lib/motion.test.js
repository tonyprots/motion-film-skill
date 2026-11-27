// node lib/motion.test.js
const M = require('./motion.js');
let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
const peak = (p) => { let m = 0; for (let t = 0; t < 3; t += 1e-4) m = Math.max(m, M.step(t, p)); return m; };

for (const p of Object.keys(M.PRESETS)) {
  console.log(`  ${p.padEnd(8)} overshoot ${((peak(p) - 1) * 100).toFixed(2)}%  settle(1%) ${M.settle(p).toFixed(3)}s`);
}
ok(M.step(0) === 0 && M.step(-1) === 0, 'step is 0 at and before release');
ok(peak('heavy') <= 1 + 1e-12, 'heavy never overshoots');
ok(peak('snappy') - 1 < 0.02 && peak('default') - 1 < 0.01, 'UI presets overshoot < 2%');
ok(peak('playful') - 1 > 0.1, 'playful overshoot is visible');

const keys = [[0, 0], [0.1, 100], [0.2, -50]];
const f = (t) => M.track(t, keys);
const v = (t) => (f(t + 1e-5) - f(t - 1e-5)) / 2e-5;
ok(Math.abs(f(0.2 - 1e-6) - f(0.2 + 1e-6)) < 1e-2, 'track is continuous across a new key');
ok(Math.abs(v(0.2 + 1e-5) - v(0.2 - 1e-5)) < 5, 'track keeps velocity through a new key (no restart)');
ok(Math.abs(f(5) + 50) < 1e-6, 'track settles on last target');

for (const [name, st] of [['right', [[0, 0, 100], [0.1, 500, 600]]], ['left', [[0, 500, 600], [0.1, 0, 100]]]]) {
  let maxS = 0;
  for (let t = 0.1; t < 1; t += 0.001) maxS = Math.max(maxS, M.indicator(t, st).size);
  ok(maxS > 150, `indicator stretches moving ${name} (peak ${maxS.toFixed(0)} vs 100)`);
  ok(Math.abs(M.indicator(5, st).size - 100) < 1e-6, `indicator settles back after moving ${name}`);
}

ok(M.swapAlpha(1.0, 1, 2) === 0 && M.swapAlpha(1.05, 1, 2) === 0, 'swapAlpha waits past morph start');
ok(M.swapAlpha(1.5, 1, 2) > 0.99, 'swapAlpha fully in mid-hold');
ok(M.swapAlpha(2, 1, 2) < 0.005, 'swapAlpha gone by next morph');
ok(M.loopT(4, 4) === 0 && M.loopT(4 - 1 / 120, 4, 60) === 0 && M.loopT(-1, 4) === 3 && M.loopT(1, 4) === 1,
  'loopT pins last frame to first');

// soft start: same end state, no acceleration jump at release, continuous, never past 1 for a critical spring
{
  const hardP = { response: 0.5, damping: 1 }, softP = { ...hardP, soft: 0.12 };
  const acc = (p, t, h = 1e-4) => (M.step(t + h, p) - 2 * M.step(t, p) + M.step(t - h, p)) / (h * h);
  ok(Math.abs(M.step(5, softP) - 1) < 1e-9, 'soft spring settles on target');
  ok(Math.abs(acc(softP, 0.002)) < 0.2 * Math.abs(acc(hardP, 0.002)), `soft start: accel right after release ${acc(softP, 0.002).toFixed(1)} vs hard ${acc(hardP, 0.002).toFixed(1)}`);
  let jump = 0;
  for (let t = 0; t < 2; t += 1e-3) jump = Math.max(jump, Math.abs(M.step(t + 1e-3, softP) - M.step(t, softP)));
  ok(jump < 0.02, 'soft spring is continuous');
  ok(peak(softP) <= 1 + 1e-9, 'soft critical spring never overshoots');
  const zs = [{ response: 0.4, damping: 0.6 }, { response: 0.4, damping: 1.4 }];
  for (const p of zs) {
    // closed-form gap matches numeric integration
    const T = 0.1, tau = 0.37; let num = 0; const n = 20000;
    for (let i = 0; i < n; i++) num += M.step(tau - T + ((i + 0.5) / n) * T, p) / n;
    ok(Math.abs(M.step(tau, { ...p, soft: T }) - num) < 1e-6, `soft closed form = numeric mean (ζ ${p.damping})`);
  }
  ok(M.step(0.3, 'camera') < M.step(0.3, 'heavy'), 'camera role starts soft');
}

// sim: a stateful fixed-step system that is still a function of t
{
  // a ball bouncing on the floor with a seeded kick per bounce: integration, state, events and randomness all at once
  const ball = () => M.sim({
    init: () => ({ y: 2, v: 0, seed: 11, hits: 0, trail: new Float32Array(3) }),
    tick: (s, dt, t, emit) => {
      s.v -= 9.81 * dt; s.y += s.v * dt;
      if (s.y < 0) { s.y = -s.y; s.v = -s.v * (0.7 + 0.1 * M.rand(s)); s.hits++; emit('hit', { n: s.hits, speed: s.v }); }
      s.trail[s.hits % 3] = s.y;
    },
  });
  const ts = Array.from({ length: 241 }, (_, i) => i / 60);                 // 4 s at 60 fps
  const fwd = ball(), back = ball(), shuffled = ball();
  const A = ts.map((t) => fwd.at(t).y);
  const B = ts.slice().reverse().map((t) => back.at(t).y).reverse();
  const r = M.rand({ seed: 5 });
  const order = ts.map((t, i) => [i, Math.sin(i * 12.9898) * 43758.5453 % 1]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  const S = new Array(ts.length); for (const i of order) S[i] = shuffled.at(ts[i]).y;
  ok(A.every((y, i) => y === B[i]), 'sim: forward and backward frame orders give identical states');
  ok(A.every((y, i) => y === S[i]), 'sim: shuffled frame order gives identical states');
  ok(r >= 0 && r < 1, 'rand is in [0, 1)');
  const w1 = ball(), w2 = ball();                                           // two "workers": one starts mid-film
  ok(w1.at(3.2).y === (w2.at(0.5), w2.at(3.2).y), 'sim: a worker starting mid-film matches one that rendered from 0');
  const ev = ball().events(4);
  ok(ev.length >= 2 && ev.every((e, i) => e.name === 'hit' && e.n === i + 1 && (i === 0 || e.t > ev[i - 1].t)), `sim: events logged once each, in order (${ev.length} hits)`);
  const again = fwd.events(4);
  ok(JSON.stringify(again) === JSON.stringify(ev), 'sim: events match across instances and repeated runs');
  const t0 = ev[0].t;
  ok(fwd.raw(t0 - 1e-3).hits === 0 && fwd.raw(t0 + 1e-3).hits === 1, `sim: the first hit at ${t0.toFixed(3)} s shows in the state`);
  const mid = fwd.at(0.5 + 1 / 480), lo = fwd.raw(0.5), hi = fwd.raw(0.5 + 1 / 240);
  ok(mid.y > Math.min(lo.y, hi.y) - 1e-12 && mid.y < Math.max(lo.y, hi.y) + 1e-12, 'sim: at() between two steps blends them');
  ok(mid.trail instanceof Float32Array, 'sim: typed arrays survive cloning and blending');
  const leak = fwd.at(1); leak.y = 999;
  ok(fwd.at(1).y !== 999, 'sim: at() hands out a copy, not the internal state');
  let threw = false; try { M.sim({ init: () => ({ m: new Map() }), tick() {} }); } catch { threw = true; }
  ok(threw, 'sim: a Map in the state is refused');
  ok(M.sim({ init: () => ({ x: 1 }), tick: (s) => { s.x += 1; }, from: 2 }).at(1).x === 1, 'sim: before from → the initial state');
}

// path: smooth camera through timed keys
{
  const keys = [[0, 0], [1, 10], [2, 10], [3, 4]];
  const p = (t) => M.path(t, keys), dv = (t) => (p(t + 1e-5) - p(t - 1e-5)) / 2e-5;
  ok(keys.every(([t, v]) => Math.abs(p(t) - v) < 1e-12), 'path passes through every key');
  ok(Math.abs(dv(1e-4)) < 0.05 && Math.abs(dv(3 - 1e-4)) < 0.05, 'path starts and lands at rest');
  let max = -Infinity; for (let t = 0; t <= 3; t += 1e-3) max = Math.max(max, p(t));
  ok(max <= 10 + 1e-9, `path never overshoots a key (peak ${max.toFixed(4)})`);
  let jump = 0; for (let t = 0.01; t < 2.99; t += 1e-3) jump = Math.max(jump, Math.abs(dv(t + 1e-3) - dv(t)));
  ok(jump < 0.2, 'path velocity is continuous');
  const o = M.path(0.5, [[0, { x: 0, z: 9 }], [1, { x: 4 }]]);
  ok(o.z === 9 && o.x > 0 && o.x < 4, 'path: an object field missing from a key holds its value');
  const fr = M.path(1e-3, [[0, 0], [1, 1]], { ends: 'free' });
  ok(Math.abs(fr - 1e-3) < 1e-9, 'path ends:free keeps the end slope');
  let bad = false; try { M.path(0, [[1, 0], [1, 2]]); } catch { bad = true; }
  ok(bad, 'path refuses keys out of time order');
}

process.exitCode = failed ? 1 : 0;

// motion tokens: roles resolve to presets, configure() retunes them
{
  const M = require('./motion.js');
  const eq = (a, b, m) => { if (Math.abs(a - b) > 1e-12) throw new Error(m + `: ${a} vs ${b}`); };
  eq(M.step(0.3, 'text'), M.step(0.3, 'heavy'), 'role text = heavy');
  eq(M.step(0.3, 'enter'), M.step(0.3, 'default'), 'role enter = default');
  M.configure({ roles: { enter: 'snappy' } });
  eq(M.step(0.3, 'enter'), M.step(0.3, 'snappy'), 'configure retargets a role');
  M.configure({ roles: { enter: 'default' } });
  let threw = false; try { M.step(0.3, 'nope'); } catch { threw = true; }
  if (!threw) throw new Error('unknown role must throw');
  console.log('motion tokens ok');
}

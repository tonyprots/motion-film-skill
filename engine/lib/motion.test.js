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

process.exitCode = failed ? 1 : 0;

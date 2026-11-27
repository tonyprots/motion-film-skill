// World sounds in sfx.mjs, measured without ears: beds (timeline "beds" → audio/sfx_bed.wav) and material sounds
// (sfx type "material"). Builds tiny projects in a temp folder, runs sync.mjs + sfx.mjs twice each and checks: the same
// input gives the same bytes; no NaN; peaks in range; a bed at level 0 is digital silence; the main moment of every
// material sound sits on its fraction of "dur" (slab impact 0.285 ± 15 ms, tear snap 0.55 ± 20 ms, fold creases ± 15 ms),
// also when "dur" changes; the slab falls without a sound; a bed taken out of the timeline leaves no stale stem.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MATERIAL, BEDS } from '../scripts/sfx_world.mjs';

const SKILL = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-sfx-bed-'));
const env = { ...process.env, MOTION_FILM_HOME: path.join(ROOT, 'no-library') };   // synth only, whatever the machine has
const run = (dir, script) => execFileSync('node', [path.join(SKILL, 'scripts', script)], { cwd: dir, env, stdio: 'pipe' }).toString();
function readWav(file) {   // 32-bit float stereo, as sfx.mjs writes it
  const b = fs.readFileSync(file), n = b.readUInt32LE(40) / 8, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = b.readFloatLE(44 + i * 8); R[i] = b.readFloatLE(48 + i * 8); }
  return { L, R, n };
}
const SR = 48000, dB = (v) => 20 * Math.log10(v + 1e-12);
const peak = (w, a = 0, b = w.n) => { let m = 0; for (let i = Math.max(0, a); i < Math.min(w.n, b); i++) m = Math.max(m, Math.abs(w.L[i]), Math.abs(w.R[i])); return m; };
const rms = (w, a, b) => { let e = 0; for (let i = a; i < b; i++) e += w.L[i] * w.L[i] + w.R[i] * w.R[i]; return Math.sqrt(e / (2 * (b - a))); };
const finite = (w) => w.L.every(Number.isFinite) && w.R.every(Number.isFinite);
// envelope: RMS of the mono sum in 5 ms windows, 1 ms hop → [time of each window centre (s), value]
function envelope(w, t0, t1) {
  const out = [], win = 240, hop = 48;
  for (let a = Math.round(t0 * SR); a + win <= Math.min(w.n, Math.round(t1 * SR)); a += hop) {
    let e = 0; for (let i = a; i < a + win; i++) { const m = 0.5 * (w.L[i] + w.R[i]); e += m * m; }
    out.push([(a + win / 2) / SR, Math.sqrt(e / win)]);
  }
  return out;
}
const argmax = (env, t0 = -Infinity, t1 = Infinity) => env.filter(([t]) => t >= t0 && t <= t1).reduce((m, x) => (x[1] > m[1] ? x : m), [NaN, -1]);

const checks = [], measured = {};
const check = (name, fn) => { try { fn(); checks.push({ name, ok: true }); } catch (e) { checks.push({ name, ok: false, why: e.message }); } };

// 120 bpm: one beat = 0.5 s. Material sounds well apart; the bed rises 1 → 3 s, holds, steps to 0 at 12 s.
const marks = { s1a: 2, 's1a.end': 6, sc2: 10, s3a: 18, 's3a.end': 24, sc4: 26, done: 44 };
const MATS = [
  { at: 's1a', type: 'material', kind: 'tear', gain: 0.8, what: 'the frame tears' },
  { at: 'sc2', type: 'material', kind: 'fold', gain: 0.8, what: 'the frame folds' },
  { at: 's3a', type: 'material', kind: 'slab', gain: 0.8, what: 'a slab falls' },
  { at: 'sc4', type: 'material', kind: 'slab', dur: 3.2, gain: 0.8, what: 'a slower slab: same fractions' },
];
const timeline = (beds, sfx = []) => ({ duration: 22, fps: 60, bpm: 120, sfx_source: 'synth', marks, sfx, beds });
const bedOf = (kind) => [{ kind, keys: [[0, 0], [2, 0], ['s1a.end', 1], ['s3a.end', 1], ['s3a.end', 0]], what: `${kind} test` }];

for (const kind of BEDS) {
  const dir = path.join(ROOT, kind); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline(bedOf(kind), kind === 'wind' ? MATS : [])));
  run(dir, 'sync.mjs'); run(dir, 'sfx.mjs');
  const first = ['sfx.wav', 'sfx_bed.wav'].map((f) => fs.readFileSync(path.join(dir, 'audio', f)));
  run(dir, 'sfx.mjs');
  const second = ['sfx.wav', 'sfx_bed.wav'].map((f) => fs.readFileSync(path.join(dir, 'audio', f)));
  const bed = readWav(path.join(dir, 'audio/sfx_bed.wav'));
  check(`${kind}: the same input gives the same sfx.wav and sfx_bed.wav, byte for byte`, () => {
    assert.ok(first[0].equals(second[0]), 'sfx.wav differs between two runs');
    assert.ok(first[1].equals(second[1]), 'sfx_bed.wav differs between two runs');
  });
  check(`${kind}: cues.json carries the bed keys in seconds`, () => {
    const cues = JSON.parse(fs.readFileSync(path.join(dir, 'cues.json'), 'utf8'));
    assert.deepEqual(cues.beds[0].keys, [[0, 0], [1, 0], [3, 1], [12, 1], [12, 0]]);
    assert.ok(cues.cues.every((c) => c.type === 'material'), 'a bed must not turn into a cue');
  });
  check(`${kind}: no NaN, peak in range`, () => {
    assert.ok(finite(bed), 'NaN or Infinity in the bed');
    assert.ok(peak(bed) > 10 ** (-60 / 20) && peak(bed) < 10 ** (-20 / 20), `bed peak ${dB(peak(bed)).toFixed(1)} dBFS outside −60..−20`);
  });
  check(`${kind}: level 0 is silence (before the rise, and 2.2 s after the step to 0)`, () => {
    assert.equal(peak(bed, 0, Math.round(1.0 * SR)), 0, `${dB(peak(bed, 0, SR)).toFixed(1)} dBFS before the first rise`);
    assert.equal(peak(bed, Math.round(14.2 * SR)), 0, `${dB(peak(bed, Math.round(14.2 * SR))).toFixed(1)} dBFS after the step to 0`);
    assert.ok(peak(bed, Math.round(13.5 * SR), Math.round(14.2 * SR)) < 10 ** (-90 / 20), 'the glide to 0 is not under −90 dBFS within 1.5 s');
  });
  measured[kind] = { level1_rms_dBFS: +dB(rms(bed, 4 * SR, 11 * SR)).toFixed(1), peak_dBFS: +dB(peak(bed)).toFixed(1), level0_dBFS: dB(peak(bed, Math.round(14.2 * SR))) < -200 ? '-inf' : +dB(peak(bed, Math.round(14.2 * SR))).toFixed(1) };
  check(`${kind}: level 1 is a quiet texture (RMS −56..−40 dBFS in the stem)`, () => {
    const r = measured[kind].level1_rms_dBFS; assert.ok(r > -56 && r < -40, `${r} dBFS`);
  });
  if (kind !== 'wind') continue;

  // ---- material sounds (in the wind project's sfx.wav, each alone in its own stretch)
  const fx = readWav(path.join(dir, 'audio/sfx.wav')), cues = JSON.parse(fs.readFileSync(path.join(dir, 'cues.json'), 'utf8')).cues;
  check('material: no NaN, peak in range', () => {
    assert.ok(finite(fx), 'NaN or Infinity in sfx.wav');
    assert.ok(peak(fx) > 0.1 && peak(fx) < 0.98, `sfx.wav peak ${dB(peak(fx)).toFixed(1)} dBFS`);
  });
  for (const c of cues) {
    const M = MATERIAL[c.kind], D = c.dur, env_ = envelope(fx, c.t, c.t + D + 0.3), [tp, vp] = argmax(env_);
    const key = `${c.kind}${D !== M.dur ? ` (dur ${D})` : ''}`;
    measured[key] = { start_s: c.t, dur_s: D, peak_at_fraction: +((tp - c.t) / D).toFixed(4), peak_dBFS: +dB(peak(fx, Math.round(c.t * SR), Math.round((c.t + D + 0.3) * SR))).toFixed(1),
      ...(c.kind !== 'fold' && { peak_off_ms: +((tp - c.t - M.hit * D) * 1000).toFixed(1) }) };
    check(`${key}: cues.json hit = start + ${M.hit} × dur`, () => assert.ok(Math.abs(c.hit - (c.t + M.hit * D)) < 1e-4, `hit ${c.hit}`));
    if (c.kind === 'slab') {
      check(`${key}: envelope peak at ${M.hit} × dur ± 15 ms`, () => assert.ok(Math.abs(tp - c.hit) <= 0.015, `peak at ${tp.toFixed(4)}s, impact at ${c.hit}s`));
      check(`${key}: the fall makes no sound (zero until 1 ms before the impact)`, () => assert.equal(peak(fx, Math.round(c.t * SR), Math.round((c.hit - 0.001) * SR)), 0));
    }
    if (c.kind === 'tear') {
      check(`${key}: snap peak at ${M.hit} × dur ± 20 ms`, () => assert.ok(Math.abs(tp - c.hit) <= 0.02, `peak at ${tp.toFixed(4)}s, snap at ${c.hit}s`));
      check(`${key}: the tension (0–${M.tension}) stays ≥ 20 dB under the snap`, () => {
        const [, vt] = argmax(env_, c.t, c.t + M.tension * D); assert.ok(dB(vt) < dB(vp) - 20, `tension ${dB(vt).toFixed(1)} vs snap ${dB(vp).toFixed(1)} dB`);
      });
      check(`${key}: the rip grows louder toward the snap`, () => {
        const early = rms(fx, Math.round((c.t + 0.1 * D) * SR), Math.round((c.t + 0.2 * D) * SR)), late = rms(fx, Math.round((c.t + 0.44 * D) * SR), Math.round((c.t + 0.54 * D) * SR));
        assert.ok(dB(late) > dB(early) + 6, `early ${dB(early).toFixed(1)}, late ${dB(late).toFixed(1)} dBFS`);
      });
    }
    if (c.kind === 'fold') {
      const between = env_.filter(([t]) => t > c.t + 0.2 * D && t < c.t + 0.28 * D).map((x) => x[1]).sort((a, b) => a - b), floor = between[between.length >> 1];
      M.creases.forEach((f) => check(`${key}: a crease stands out at ${f} × dur ± 15 ms`, () => {
        const [tc, vc] = argmax(env_, c.t + f * D - 0.015, c.t + f * D + 0.015), [, near] = argmax(env_, c.t + f * D - 0.06, c.t + f * D + 0.06);
        assert.ok(vc >= near * 0.999 && dB(vc) > dB(floor) + 12, `crease at ${tc.toFixed(3)}s: ${dB(vc).toFixed(1)} dB, friction ${dB(floor).toFixed(1)} dB`);
      }));
      measured[key].creases_off_ms = M.creases.map((f) => +((argmax(env_, c.t + f * D - 0.015, c.t + f * D + 0.015)[0] - c.t - f * D) * 1000).toFixed(1));
    }
  }
  // a bed taken out of the timeline: sfx.mjs removes its own stem, so mix.py does not mix a stale one
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline([], MATS)));
  run(dir, 'sync.mjs'); run(dir, 'sfx.mjs');
  check('no beds → no audio/sfx_bed.wav', () => assert.ok(!fs.existsSync(path.join(dir, 'audio/sfx_bed.wav'))));
}
// bad input stops sync.mjs with a message, not a silent wrong sound
for (const [name, beds, sfx] of [
  ['bed level outside 0..1', [{ kind: 'wind', keys: [[0, 1.5]] }], []],
  ['unknown bed kind', [{ kind: 'rain', keys: [[0, 1]] }], []],
  ['bed keys out of order', [{ kind: 'air', keys: [['sc2', 1], ['s1a', 0]] }], []],
  ['unknown material kind', [], [{ at: 's1a', type: 'material', kind: 'glass' }]],
]) {
  const dir = path.join(ROOT, name.replace(/\W+/g, '-')); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline(beds, sfx)));
  check(`sync.mjs refuses: ${name}`, () => assert.throws(() => run(dir, 'sync.mjs')));
}
fs.rmSync(ROOT, { recursive: true, force: true });
const failed = checks.filter((c) => !c.ok);
if (process.argv.includes('--json')) console.log(JSON.stringify({ passed: checks.length - failed.length, total: checks.length, measured, failed }, null, 1));
else {
  console.log(`test_sfx_bed: ${checks.length - failed.length}/${checks.length} · level 1 RMS ${BEDS.map((k) => `${k} ${measured[k]?.level1_rms_dBFS}`).join(', ')} dBFS · `
    + `peaks off their fraction: ${Object.entries(measured).filter(([k]) => /^(tear|slab)/.test(k)).map(([k, v]) => `${k} ${v.peak_off_ms >= 0 ? '+' : ''}${v.peak_off_ms} ms`).join(', ')}`);
  for (const f of failed) console.log(`  FAIL ${f.name}: ${f.why}`);
}
if (failed.length) process.exitCode = 1;

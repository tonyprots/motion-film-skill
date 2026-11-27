// UI sounds from cues.json → audio/sfx.wav (48 kHz stereo, 32-bit float): real CC0 samples when scripts/sfx_fetch.py has
// built a library, otherwise synthesized here (no deps). Per cue: "src": "synth" forces the synth, "sample": <Freesound id>.
// Run from the project root after scripts/sync.mjs.
//   click    cursor press / button: 1 ms HP noise tick + 2.3 kHz blip + 520 Hz body
//   tick     typing key: quieter, shorter click
//   pop      something appears: sine glide 820 → 1720 Hz + soft tick
//   thump    logo / impact: 95 → 42 Hz sine drop + felt transient, ~0.5 s
//   shutter  hard cut / wipe: two band-passed noise clacks
// No whoosh and no riser: a noise sweep is the harshest sound in the mix and reads as a stock transition
// (removed in 1.3.0). A move or a cut gets no sound of its own, or a pop / thump where something lands.
// Cue fields: t (s), type, gain (0.8), pitch (1 = nominal; sync.mjs jitters ±6 %), pan (-1..1)
//   material (kind tear | fold | slab, dur s): one sound for a physical transition on screen, its inner events at
//            fractions of dur (scripts/sfx_world.mjs). Filtered noise with envelopes and decaying resonances, no sweeps.
// World beds (cues.json "beds", from timeline "beds" via sync.mjs) → audio/sfx_bed.wav, a stem of its own in mix.py
// ("mix": {"bed": dB}): wind | water | hum | air, loudness and brightness led by a smoothed level 0..1. Not a hit.
import fs from 'node:fs';
import { MATERIAL, BEDS } from './sfx_world.mjs';

const { sr: SR, duration, cues, beds = [] } = JSON.parse(fs.readFileSync('cues.json', 'utf8'));
const N = Math.round(SR * duration);
const L = new Float32Array(N), R = new Float32Array(N);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const TAU = Math.PI * 2;

// one-pole high-pass / low-pass on a Float32Array, in place
const hp = (x, fc) => { const a = Math.exp(-TAU * fc / SR); let yp = 0, xp = 0; for (let i = 0; i < x.length; i++) { const y = a * (yp + x[i] - xp); xp = x[i]; yp = y; x[i] = y; } return x; };
const lp = (x, fc) => { const a = 1 - Math.exp(-TAU * fc / SR); let z = 0; for (let i = 0; i < x.length; i++) { z += a * (x[i] - z); x[i] = z; } return x; };
const noise = (n, seed) => { const r = mulberry32(seed); const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = r() * 2 - 1; return x; };
function click(p, seed, g = 1, len = 0.06) {
  const n = Math.round(len * SR), x = new Float32Array(n), nz = hp(hp(noise(n, seed), 3500), 3500);
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] = (nz[i] * Math.exp(-t * 2600) * 0.9 + Math.sin(TAU * 2300 * p * t) * Math.exp(-t * 190) * 0.45 + Math.sin(TAU * 520 * p * t) * Math.exp(-t * 110) * 0.55) * g; }
  return { x, lead: 0 };
}
const tick = (p, seed) => click(p * 1.25, seed, 0.55, 0.035);
function pop(p, seed) {
  const n = Math.round(0.1 * SR), x = new Float32Array(n), nz = hp(noise(n, seed), 5000); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR, f = (820 + 900 * (1 - Math.exp(-t * 60))) * p; ph += TAU * f / SR; x[i] = Math.sin(ph) * Math.exp(-t * 42) * Math.min(1, t / 0.002) * 0.8 + nz[i] * Math.exp(-t * 3000) * 0.35; }
  return { x, lead: 0 };
}
function thump(p, seed) {
  const n = Math.round(0.6 * SR), x = new Float32Array(n), nz = lp(noise(n, seed), 900); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR, f = (42 + 53 * Math.exp(-t * 22)) * p; ph += TAU * f / SR; x[i] = Math.tanh((Math.sin(ph) * Math.exp(-t * 7) + nz[i] * Math.exp(-t * 60) * 0.6) * 1.6); }
  return { x, lead: 0 };
}
function shutter(p, seed) {
  const n = Math.round(0.09 * SR), nz = hp(lp(noise(n, seed), 9000 * p), 2000 * p), x = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] = nz[i] * (Math.exp(-t * 90) + 0.8 * (t > 0.035 ? Math.exp(-(t - 0.035) * 110) : 0)) * 1.3; }
  return { x, lead: 0 };
}
const SYN = { click, tick, pop, thump, shutter };

// ---- the physical world: material sounds and beds (scripts/sfx_world.mjs holds the timing contract)
// TPT state-variable filter: stays stable while its cutoff moves. set(fc) once or per block, then run(x) per sample;
// lp / bp (unity gain at fc) / hp are all there after each run.
class SVF {
  constructor(q = 0.707, fc = 1000) { this.k = 1 / q; this.s1 = 0; this.s2 = 0; this.set(fc); }
  set(fc) { const g = Math.tan(Math.PI * Math.min(fc, 0.45 * SR) / SR); this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2; return this; }
  run(x) {
    const v3 = x - this.s2, v1 = this.a1 * this.s1 + this.a2 * v3, v2 = this.s2 + this.a2 * this.s1 + this.a3 * v3;
    this.s1 = 2 * v1 - this.s1; this.s2 = 2 * v2 - this.s2; this.lp = v2; this.bp = this.k * v1; this.hp = x - this.k * v1 - v2;
    return this;
  }
}
const filt = (x, fc, q, mode) => { const f = new SVF(q, fc), y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = f.run(x[i])[mode]; return y; };
const sec = (s) => Math.round(s * SR);
const norm = (x, peak) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m; return x; };
const addAt = (dst, src, at, g = 1) => { for (let i = 0; i < src.length; i++) { const j = at + i; if (j >= 0 && j < dst.length) dst[j] += src[i] * g; } };
// fibre crackle: sparse impulses at rate(i) per second, amplitude r³ (a few strong, many weak), each decaying in tau
function crackle(n, rnd, rate, tau) {
  const e = new Float32Array(n), d = Math.exp(-1 / (tau * SR)); let z = 0;
  for (let i = 0; i < n; i++) { z *= d; const r = rate(i); if (r > 0 && rnd() < r / SR) z += rnd() ** 3; e[i] = z; }
  return e;
}
// a light paper rustle from sample ia to ib: crinkle over a soft body through one wide band, a smooth swell
function rustle(n, rnd, seed, ia, ib, fc, rate) {
  const cr = crackle(n, rnd, (i) => (i >= ia && i < ib ? rate : 0), 0.006), wn = noise(n, seed), x = new Float32Array(n);
  for (let i = Math.max(0, ia); i < Math.min(n, ib); i++) x[i] = wn[i] * (0.25 + cr[i]) * Math.sin(Math.PI * (i - ia) / (ib - ia)) ** 1.5;
  return norm(filt(x, fc, 0.6, 'bp'), 1);
}
function tear(c, seed) {
  const M = MATERIAL.tear, D = c.dur, p = c.pitch ?? 1, rnd = mulberry32(seed), n = sec(D + 0.5);
  const i0 = sec(M.tension * D), iS = sec(M.hit * D), u = (i) => Math.min(1, Math.max(0, (i - i0) / (iS - i0)));
  // the rip: fibre crackle through a low and a high band, the weight moving up as it runs (brighter, no filter sweep),
  // over a thin tearing hiss; a whisper during the tension, louder toward the snap, gone 6 ms after it
  const wn = noise(n, seed + 1), fib = crackle(n, rnd, (i) => (i < i0 ? 30 : i < iS ? 600 + 2400 * u(i) : 0), 0.0012);
  const ex = wn.map((v, i) => v * fib[i]), lo = filt(ex, 1500 * p, 1.2, 'bp'), hi = filt(ex, 3800 * p, 1.2, 'bp');
  const hiss = filt(noise(n, seed + 2), 2600 * p, 0.7, 'bp'), rip = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = u(i), amp = i < i0 ? 0.06 : 0.18 + 0.82 * v ** 1.5, stop = i < iS ? 1 : Math.exp(-(i - iS) / (0.006 * SR));
    rip[i] = (lo[i] * (1 - v) + hi[i] * v + 0.35 * v * hiss[i]) * amp * stop;
  }
  // the snap of the last fibres: a bright 2.5 ms burst and three short resonances
  const sn = filt(noise(n - iS, seed + 3), 2500 * p, 0.7, 'hp'), snap = new Float32Array(n - iS);
  for (let i = 0; i < snap.length; i++) {
    const t = i / SR;
    snap[i] = sn[i] * Math.exp(-t / 0.0025) + 0.45 * Math.sin(TAU * 2300 * p * t) * Math.exp(-t / 0.012)
      + 0.3 * Math.sin(TAU * 3500 * p * t) * Math.exp(-t / 0.007) + 0.25 * Math.sin(TAU * 520 * p * t) * Math.exp(-t / 0.025);
  }
  const x = norm(rip, 0.42); addAt(x, norm(snap, 1), iS);
  addAt(x, rustle(n, rnd, seed + 4, iS, sec(D), 1800 * p, 70), 0, 0.2);   // the halves curl away
  for (let k = 0; k < 5; k++) {   // small scraps
    const a = sec((M.scraps[0] + (M.scraps[1] - M.scraps[0]) * rnd()) * D), len = sec(0.04 + 0.05 * rnd());
    addAt(x, rustle(n, rnd, seed + 10 + k, a, a + len, (2600 + 1200 * rnd()) * p, 160), 0, 0.08 + 0.06 * rnd());
  }
  return { x: norm(x, 0.8), lead: 0 };
}
function fold(c, seed) {
  const M = MATERIAL.fold, D = c.dur, p = c.pitch ?? 1, rnd = mulberry32(seed), n = sec(D + 0.4), x = new Float32Array(n);
  M.creases.forEach((f, j) => {   // a dry crunch per crease; every fold is thicker: a bit louder and lower
    const L = sec(0.08), cr = crackle(L, rnd, () => 5000, 0.0007), wn = noise(L, seed + 20 + j), ck = filt(noise(L, seed + 30 + j), 3000, 0.7, 'hp');
    const ex = wn.map((v, i) => v * cr[i] * Math.min(1, i / (0.0015 * SR)) * Math.exp(-i / (0.018 * SR)));
    const a = filt(ex, 3000 * p, 0.8, 'bp'), b = filt(ex, 1300 * p, 0.9, 'bp'), body = [260, 220, 185][j] * p, y = new Float32Array(L);
    for (let i = 0; i < L; i++) { const t = i / SR; y[i] = a[i] + 0.7 * b[i] + 0.6 * ck[i] * Math.exp(-t / 0.0012) + 0.35 * Math.sin(TAU * body * t) * Math.exp(-t / 0.028); }
    addAt(x, norm(y, [0.8, 0.9, 1][j]), sec(f * D));
  });
  for (let k = 0; k + 1 < M.creases.length; k++)   // paper friction while the sheet is pressed between creases
    addAt(x, rustle(n, rnd, seed + 40 + k, sec(M.creases[k] * D + 0.03), sec(M.creases[k + 1] * D - 0.01), 2200 * p, 140), 0, 0.09);
  addAt(x, rustle(n, rnd, seed + 50, sec(M.rustle * D - 0.12), sec(M.rustle * D + 0.12), 1700 * p, 90), 0, 0.16);   // flips, flies off
  return { x: norm(x, 0.7), lead: 0 };
}
function slab(c, seed) {
  const M = MATERIAL.slab, D = c.dur, p = c.pitch ?? 1, rnd = mulberry32(seed), n = sec(D + 0.8), iH = sec(M.hit * D), L = n - iH;
  const dry = new Float32Array(n);   // silent until the impact: the fall itself makes no sound
  const slap = filt(filt(noise(L, seed + 1), 1100 * p, 0.7, 'hp'), 9000, 0.7, 'lp'), thock = filt(noise(L, seed + 2), 320 * p, 1.2, 'bp');
  const modes = [[48, 1, 0.11], [74, 0.6, 0.08], [112, 0.35, 0.05], [165, 0.2, 0.035]];   // Hz, amplitude, decay s: dull, short
  const hit = new Float32Array(n);   // the slap and the knock of the body: what the room reflects
  for (let i = 0; i < L; i++) {
    const t = i / SR;
    let low = 0; for (const [f, a, d] of modes) low += a * Math.sin(TAU * f * p * t) * Math.exp(-t / d);
    hit[iH + i] = Math.tanh(1.4 * slap[i] * Math.exp(-t / 0.004) + 0.6 * thock[i] * Math.exp(-t / 0.03));
    dry[iH + i] = hit[iH + i] + 0.42 * Math.min(1, t / 0.001) * low;
  }
  // a short room: five early reflections of the dark slap and a diffuse tail (RT60 ~0.35 s), all after the impact
  const x = Float32Array.from(dry), dark = filt(hit, 2800, 0.7, 'lp'), tail = filt(noise(L, seed + 3), 1800, 0.7, 'lp');
  for (const [ms, g] of [[11, 0.3], [17, 0.24], [24, 0.19], [33, 0.14], [45, 0.1]]) addAt(x, dark, sec(ms / 1000), g);
  for (let i = sec(0.012); i < L; i++) x[iH + i] += 0.1 * tail[i] * Math.exp(-(i / SR - 0.012) / 0.05);
  // settling 0.285–0.6: small grit ticks thinning out, a low crumble under them; nothing after 0.6
  const iE = sec(M.settle * D), grit = filt(noise(L, seed + 4), 500, 0.7, 'lp');
  for (let i = iH + sec(0.03); i < iE; i++) {
    const u = (i - iH) / (iE - iH);
    x[i] += 0.05 * grit[i - iH] * Math.exp(-(i - iH) / (0.12 * SR)) * Math.cos(0.5 * Math.PI * u);
    if (rnd() < (70 * (1 - u) ** 2 + 4) / SR) {
      const f = (1800 + 3400 * rnd()) * p, tau = 0.003 + 0.006 * rnd(), a = (0.04 + 0.08 * rnd()) * (1 - u);
      for (let j = 0; j < sec(5 * tau) && i + j < iE; j++) x[i + j] += a * Math.sin(TAU * f * j / SR) * Math.exp(-j / (tau * SR));
    }
  }
  return { x: norm(x, 0.95), lead: 0 };
}
const MAT = { tear, fold, slab };
const GONE = { whoosh: 'a noise sweep', riser: 'a noise build' };   // removed 2026-10-17: see the header

// ---- real samples (scripts/sfx_fetch.py): used by default when a library exists, the synth above is the fallback.
// The project freezes its own copy in audio/sfx_lib/ on first use, so a later re-fetch never changes a finished film.
// timeline.json: "sfx_source": "synth" turns samples off; "sfx_pick": {"click": 171697} picks a Freesound id per type.
// One sample per UI type keeps the interface sounding like one product; thumps rotate through three.
const TL = fs.existsSync('timeline.json') ? JSON.parse(fs.readFileSync('timeline.json', 'utf8')) : {};
const ROTATE = { thump: 3 };
function library() {
  if (TL.sfx_source === 'synth') return null;
  const own = 'audio/sfx_lib', shared = `${process.env.MOTION_FILM_HOME || `${process.env.HOME}/.cache/motion-film`}/sfx`;
  if (!fs.existsSync(`${own}/index.json`)) {
    if (!fs.existsSync(`${shared}/index.json`)) return null;
    fs.cpSync(shared, own, { recursive: true });
    console.log(`froze the sample library into ${own}/ (from ${shared})`);
  }
  return { dir: own, index: JSON.parse(fs.readFileSync(`${own}/index.json`, 'utf8')) };
}
function readWav16(path) {   // mono 16-bit PCM, as sfx_fetch.py writes it
  const b = fs.readFileSync(path); let o = 12;
  while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
  const n = b.readUInt32LE(o + 4) / 2, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(o + 8 + i * 2) / 32768;
  return x;
}
const LIB = library(), seen = {}, cache = {}, used = {};
let fromLib = 0;
function sample(c) {
  const list = LIB?.index[c.type];
  if (!list?.length || c.src === 'synth') return null;
  const want = c.sample ?? TL.sfx_pick?.[c.type];
  const k = seen[c.type] = (seen[c.type] ?? -1) + 1;
  const s = (want && list.find((e) => e.id === want)) || list[k % Math.min(ROTATE[c.type] ?? 1, list.length)];
  const raw = cache[s.file] ??= readWav16(`${LIB.dir}/${s.file}`);
  const p = c.pitch ?? 1, n = Math.floor(raw.length / p), x = new Float32Array(n);   // pitch = playback rate
  for (let i = 0; i < n; i++) { const f = i * p, j = f | 0, u = f - j; x[i] = raw[j] * (1 - u) + (raw[j + 1] ?? 0) * u; }
  used[s.id] = s; fromLib++;
  return { x, lead: s.lead / p };
}

cues.forEach((c, k) => {
  if (GONE[c.type]) throw new Error(`sfx type "${c.type}" is gone (${GONE[c.type]} is the harshest sound in the mix): give the move no sound, or a pop / thump where something lands — cue at ${c.t}s "${c.what ?? ''}"`);
  if (c.type === 'material') {
    if (!MAT[c.kind] || !(c.dur > 0)) throw new Error(`material cue at ${c.t}s needs kind (${Object.keys(MAT).join(', ')}) and dur: run node scripts/sync.mjs`);
  } else if (!SYN[c.type]) throw new Error(`unknown sfx type "${c.type}" (have: ${Object.keys(SYN).join(', ')}, material)`);
  const { x, lead } = c.type === 'material' ? MAT[c.kind](c, 9001 + k * 131) : sample(c) || SYN[c.type](c.pitch ?? 1, 9001 + k * 131);
  const start = Math.round((c.t - lead) * SR), g = c.gain ?? 0.8;
  for (let i = 0; i < x.length; i++) {
    const j = start + i; if (j < 0 || j >= N) continue;
    const pan = c.pan ?? 0;
    L[j] += x[i] * g * Math.sqrt(0.5 * (1 - pan)) * 1.2;
    R[j] += x[i] * g * Math.sqrt(0.5 * (1 + pan)) * 1.2;
  }
});

// ---- world beds → audio/sfx_bed.wav. Level: straight lines between keys, held before the first and after the last,
// × 0.56 inside the voice spans ("duck", from sync.mjs: −10 dB and darker under speech), then a one-pole glide
// (tau 0.3 s); below 0.001 it is digital silence. Loudness follows level², the filter opens with the level. Slow
// deterministic movement per kind (wind gusts, water swells), L/R decorrelated (correlation ~0.3).
// BED_NORM sets level 1 of every kind to about -47 LUFS in the stem: a quiet texture, not a sound. Calibrated on the demo
// film: under its voice (−20 LUFS) a bed at level 1 costs at most 0.04 dB of speech over background in any phrase.
const BED_NORM = { wind: 0.0690, water: 0.0367, hum: 0.0263, air: 0.0301 }, BED_DUCK = 0.56;
function bedLevel(keys, duck = []) {
  const lv = new Float32Array(N), a = 1 - Math.exp(-1 / (0.3 * SR));
  let k = 0, d = 0, z = null;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    while (k < keys.length && keys[k][0] <= t) k++;   // keys[k - 1] is the last key at or before t
    while (d < duck.length && duck[d][1] <= t) d++;   // duck[d] is the first voice span not yet over
    const v = (k === 0 ? keys[0][1] : k === keys.length ? keys[k - 1][1]
      : keys[k - 1][1] + (keys[k][1] - keys[k - 1][1]) * (t - keys[k - 1][0]) / (keys[k][0] - keys[k - 1][0]))
      * (d < duck.length && duck[d][0] <= t ? BED_DUCK : 1);
    z = z === null ? v : z + a * (v - z);
    lv[i] = z < 1e-3 ? 0 : z;
  }
  return lv;
}
function pinkGen(rnd) {   // Paul Kellet's pink filter over uniform white noise
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => {
    const w = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    const y = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; return y;
  };
}
function brownGen(rnd) { let b = 0; return () => { b = (b + 0.02 * (rnd() * 2 - 1)) / 1.02; return b * 3.5; }; }
// a stereo source: one shared and two own noises per side, so the bed is wide but not two unrelated hisses
function stereo(gen, rnd) {
  const c = gen(rnd), l = gen(rnd), r = gen(rnd), o = new Float64Array(2);
  return () => { const m = 0.55 * c(); o[0] = m + 0.835 * l(); o[1] = m + 0.835 * r(); return o; };
}
function bedSynth(b, seed) {
  const lv = bedLevel(b.keys, b.duck), rnd = mulberry32(seed), ph = [0, 1, 2, 3].map(() => rnd() * TAU);
  const g = 10 ** ((b.gain ?? 0) / 20) * BED_NORM[b.kind], pan = b.pan ?? 0, gL = g * Math.sqrt(1 - pan), gR = g * Math.sqrt(1 + pan);
  const slow = (t, f) => Math.sin(TAU * f * t + ph[0]) + 0.7 * Math.sin(TAU * f * 1.77 * t + ph[1]) + 0.5 * Math.sin(TAU * f * 2.79 * t + ph[2]);   // −2.2..2.2
  // water: one swell per wave, 5.5–8.5 s each, fast rise (35 %) and long fall; the hiss of the wash comes after the crest
  const waves = []; for (let t = -rnd() * 6; t < duration + 9; ) { const P = 5.5 + 3 * rnd(); waves.push([t, P, 0.6 + 0.4 * rnd()]); t += P; }
  const swell = (t) => {
    let w = waves[0]; for (const x of waves) { if (x[0] > t) break; w = x; }
    const f = Math.min(1, Math.max(0, (t - w[0]) / w[1]));
    return w[2] * (f < 0.35 ? Math.sin(0.5 * Math.PI * f / 0.35) ** 2 : (1 - (f - 0.35) / 0.65) ** 2);
  };
  const A = stereo(b.kind === 'hum' || b.kind === 'water' ? brownGen : pinkGen, rnd), B = b.kind === 'hum' || b.kind === 'water' ? stereo(pinkGen, rnd) : null;
  const kind = BEDS.indexOf(b.kind);   // wind 0, water 1, hum 2, air 3
  const f1 = [new SVF(0.75), new SVF(0.75)], f2 = [new SVF(0.7), new SVF(0.7)], f3 = [new SVF(0.6), new SVF(0.6)];
  const sub = [new SVF(0.707, 45), new SVF(0.707, 45)];   // nothing under 45 Hz: a phone does not play it, the limiter would
  const out = [new Float32Array(N), new Float32Array(N)], fadeIn = sec(0.03), fadeOut = sec(0.3);
  let amp1 = 0, amp2 = 0;
  for (let i = 0; i < N; i++) {
    const l = lv[i], t = i / SR;
    if (i % 32 === 0) {   // filters and gains move slowly: set them every 32 samples (0.7 ms)
      if (b.kind === 'wind') {   // gusts: slow and soft, the band moves a little, the loudness more
        const gust = ((slow(t, 0.047) / 2.2 + 1) / 2) ** 1.6;
        f1.forEach((f) => f.set(300 * 2.4 ** l * (0.8 + 0.45 * gust))); f2.forEach((f) => f.set(200));
        amp1 = l * l * (0.4 + 0.6 * gust); amp2 = 0.5 * amp1;
      } else if (b.kind === 'water') {
        const s = swell(t), late = swell(t - 1.2);
        f1.forEach((f) => f.set(260 * 3.6 ** l * (0.7 + 0.6 * s))); f2.forEach((f) => f.set(1800)); f3.forEach((f) => f.set(6500));
        amp1 = l * l * (0.35 + 0.65 * s); amp2 = l * l * 0.3 * late;
      } else if (b.kind === 'hum') {   // a room: low body and a faint air-handling hiss, almost still
        const m = 1 + 0.06 * slow(t, 0.029) / 2.2;
        f1.forEach((f) => f.set(140 * 2 ** l)); f2.forEach((f) => f.set(450 * (1 + 0.3 * l)));
        amp1 = l * l * m; amp2 = 0.18 * amp1;
      } else {   // air: open sky, a soft wide hiss that brightens with the level
        const m = 0.85 + 0.15 * slow(t, 0.05) / 2.2;
        f1.forEach((f) => f.set(1600 * 3.2 ** l * (0.9 + 0.2 * m))); f2.forEach((f) => f.set(400));
        amp1 = l * l * m; amp2 = 0;
      }
    }
    const a = A(), bb = B && B(), env = Math.min(1, i / fadeIn, (N - i) / fadeOut);
    for (let ch = 0; ch < 2; ch++) {
      const av = sub[ch].run(a[ch]).hp;   // the sub cut on the source, so level 0 stays exact zero after the filters
      let y;
      if (kind === 0) y = f1[ch].run(av).bp * amp1 + f2[ch].run(av).lp * amp2;
      else if (kind === 1) y = f1[ch].run(av).lp * amp1 + f3[ch].run(f2[ch].run(bb[ch]).hp).lp * amp2;
      else if (kind === 2) y = f1[ch].run(av).lp * amp1 + f2[ch].run(bb[ch]).bp * amp2;
      else y = f1[ch].run(f2[ch].run(av).hp).lp * amp1;
      out[ch][i] += y * env * (ch ? gR : gL);
    }
  }
  return out;
}
const BL = new Float32Array(N), BR = new Float32Array(N);
beds.forEach((b, j) => {
  if (!BEDS.includes(b.kind)) throw new Error(`unknown bed kind "${b.kind}" (have: ${BEDS.join(', ')})`);
  const [l, r] = bedSynth(b, 4242 + j * 977);
  for (let i = 0; i < N; i++) { BL[i] += l[i]; BR[i] += r[i]; }
});

function wav(path, chans) {   // 32-bit float WAV
  const n = chans[0].length, nc = chans.length, data = Buffer.alloc(n * nc * 4), h = Buffer.alloc(44);
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) data.writeFloatLE(chans[c][i], (i * nc + c) * 4);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20); h.writeUInt16LE(nc, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * nc * 4, 28); h.writeUInt16LE(nc * 4, 32); h.writeUInt16LE(32, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40); fs.writeFileSync(path, Buffer.concat([h, data]));
}
fs.mkdirSync('audio', { recursive: true });
wav('audio/sfx.wav', [L, R]);
if (beds.length) wav('audio/sfx_bed.wav', [BL, BR]);
else if (fs.existsSync('audio/sfx_bed.wav')) fs.rmSync('audio/sfx_bed.wav');   // its own output: a bed taken out of the timeline must not stay in the mix
let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
const ids = Object.values(used);
if (ids.length) fs.writeFileSync('audio/sfx_credits.json', JSON.stringify(ids.map(({ id, name, author, url, licence }) => ({ id, name, author, url, licence })), null, 1));
console.log(`audio/sfx.wav  ${cues.length} cues  ${duration}s  peak ${(20 * Math.log10(pk + 1e-12)).toFixed(1)} dBFS  ·  `
  + (ids.length ? `${fromLib} from ${ids.length} CC0 samples (audio/sfx_credits.json), ${cues.length - fromLib} synth`
    : TL.sfx_source === 'synth' ? 'synth (timeline sfx_source)' : 'synth (no sample library: scripts/sfx_fetch.py)'));
if (beds.length) {
  let bp = 0, e = 0; for (let i = 0; i < N; i++) { bp = Math.max(bp, Math.abs(BL[i]), Math.abs(BR[i])); e += BL[i] * BL[i] + BR[i] * BR[i]; }
  console.log(`audio/sfx_bed.wav  ${beds.map((b) => b.kind).join(', ')}  peak ${(20 * Math.log10(bp + 1e-12)).toFixed(1)} dBFS  RMS over the film ${(10 * Math.log10(e / (2 * N) + 1e-24)).toFixed(1)} dBFS  ·  mixed as its own stem (timeline mix.bed)`);
}

// UI sounds from cues.json → audio/sfx.wav (48 kHz stereo, 32-bit float): real CC0 samples when scripts/sfx_fetch.py has
// built a library, otherwise synthesized here (no deps). Per cue: "src": "synth" forces the synth, "sample": <Freesound id>.
// Run from the project root after scripts/sync.mjs.
//   click    cursor press / button: 1 ms HP noise tick + 2.3 kHz blip + 520 Hz body
//   tick     typing key: quieter, shorter click
//   pop      something appears: sine glide 820 → 1720 Hz + soft tick
//   thump    logo / impact: 95 → 42 Hz sine drop + felt transient, ~0.5 s
//   whoosh   morph / whip / push-through: band-passed noise sweeping up, PEAKING at the cue time, panned L → R
//   riser    build into a drop: 2 s filtered noise + rising tone, PEAKING at the cue time (set the cue on the drop)
//   shutter  hard cut / wipe: two band-passed noise clacks
// Cue fields: t (s), type, gain (0.8), pitch (1 = nominal; sync.mjs jitters ±6 %), pan (-1..1)
import fs from 'node:fs';

const { sr: SR, duration, cues } = JSON.parse(fs.readFileSync('cues.json', 'utf8'));
const N = Math.round(SR * duration);
const L = new Float32Array(N), R = new Float32Array(N);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const TAU = Math.PI * 2;

// one-pole high-pass / low-pass on a Float32Array, in place
const hp = (x, fc) => { const a = Math.exp(-TAU * fc / SR); let yp = 0, xp = 0; for (let i = 0; i < x.length; i++) { const y = a * (yp + x[i] - xp); xp = x[i]; yp = y; x[i] = y; } return x; };
const lp = (x, fc) => { const a = 1 - Math.exp(-TAU * fc / SR); let z = 0; for (let i = 0; i < x.length; i++) { z += a * (x[i] - z); x[i] = z; } return x; };
const noise = (n, seed) => { const r = mulberry32(seed); const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = r() * 2 - 1; return x; };
// Chamberlin state-variable band-pass with a per-sample centre frequency
function sweepBP(nz, fcOf, q = 0.55) {
  const x = new Float32Array(nz.length); let lo = 0, band = 0;
  for (let i = 0; i < nz.length; i++) {
    const f = 2 * Math.sin(Math.PI * Math.min(fcOf(i / SR), SR / 6) / SR);
    lo += f * band; const hi = nz[i] - lo - q * band; band += f * hi; x[i] = band;
  }
  return x;
}

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
function whoosh(p, seed) {   // 0.30 s build, 0.14 s release; peaks exactly on the cue
  const pre = 0.30, post = 0.14, n = Math.round((pre + post) * SR);
  const bp = sweepBP(noise(n, seed), (t) => (350 + 6500 * Math.min(1, t / pre) ** 2) * p);
  for (let i = 0; i < n; i++) { const t = i / SR, u = Math.min(1, t / pre); bp[i] *= (t < pre ? Math.pow(u, 2.2) : Math.exp(-(t - pre) * 24)) * 0.62; }
  return { x: bp, lead: pre, stereo: true };
}
function riser(p, seed) {   // 2.0 s build; peaks on the cue, then cuts with a 30 ms tail
  const pre = 2.0, post = 0.03, n = Math.round((pre + post) * SR);
  const bp = sweepBP(noise(n, seed), (t) => (300 + 7000 * Math.min(1, t / pre) ** 2.4) * p, 0.8);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = Math.min(1, t / pre); ph += TAU * 220 * p * Math.pow(2, 2 * u) / SR;
    const env = t < pre ? Math.pow(u, 2.6) : Math.exp(-(t - pre) * 120);
    bp[i] = (bp[i] * 0.8 + Math.sin(ph) * 0.18) * env;
  }
  return { x: bp, lead: pre };
}
function shutter(p, seed) {
  const n = Math.round(0.09 * SR), nz = hp(lp(noise(n, seed), 9000 * p), 2000 * p), x = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] = nz[i] * (Math.exp(-t * 90) + 0.8 * (t > 0.035 ? Math.exp(-(t - 0.035) * 110) : 0)) * 1.3; }
  return { x, lead: 0 };
}
const SYN = { click, tick, pop, thump, whoosh, riser, shutter };

// ---- real samples (scripts/sfx_fetch.py): used by default when a library exists, the synth above is the fallback.
// The project freezes its own copy in audio/sfx_lib/ on first use, so a later re-fetch never changes a finished film.
// timeline.json: "sfx_source": "synth" turns samples off; "sfx_pick": {"click": 171697} picks a Freesound id per type.
// One sample per UI type keeps the interface sounding like one product; whooshes and thumps rotate through three.
const TL = fs.existsSync('timeline.json') ? JSON.parse(fs.readFileSync('timeline.json', 'utf8')) : {};
const ROTATE = { whoosh: 3, thump: 3 };
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
  return { x, lead: s.lead / p, stereo: c.type === 'whoosh' };
}

cues.forEach((c, k) => {
  if (!SYN[c.type]) throw new Error(`unknown sfx type "${c.type}" (have: ${Object.keys(SYN).join(', ')})`);
  const { x, lead, stereo } = sample(c) || SYN[c.type](c.pitch ?? 1, 9001 + k * 131);
  const start = Math.round((c.t - lead) * SR), g = c.gain ?? 0.8;
  for (let i = 0; i < x.length; i++) {
    const j = start + i; if (j < 0 || j >= N) continue;
    const pan = stereo ? -0.7 + 1.4 * (i / x.length) : (c.pan ?? 0);   // whoosh travels across the field
    L[j] += x[i] * g * Math.sqrt(0.5 * (1 - pan)) * 1.2;
    R[j] += x[i] * g * Math.sqrt(0.5 * (1 + pan)) * 1.2;
  }
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
let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
const ids = Object.values(used);
if (ids.length) fs.writeFileSync('audio/sfx_credits.json', JSON.stringify(ids.map(({ id, name, author, url, licence }) => ({ id, name, author, url, licence })), null, 1));
console.log(`audio/sfx.wav  ${cues.length} cues  ${duration}s  peak ${(20 * Math.log10(pk + 1e-12)).toFixed(1)} dBFS  ·  `
  + (ids.length ? `${fromLib} from ${ids.length} Freesound CC0 samples (audio/sfx_credits.json), ${cues.length - fromLib} synth`
    : TL.sfx_source === 'synth' ? 'synth (timeline sfx_source)' : 'synth (no sample library: scripts/sfx_fetch.py)'));

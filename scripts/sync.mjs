// timeline.json (+ beats.json, audio/vo_placed.json, captions.json, vo.json, assets/ui/*.json) → cues.json (seconds) + film/data.js
// (window.TL / BEATS / VO / CAPS / CAPW / UI / SVG_ASSETS / EXTRA_ASSETS / VOW / PUPPETS).
// CAPW (karaoke): for every captions.json entry, the word mark <id>.w<k> of each of its words — the caption's words
// matched in order to the line's words (vo.json "words", layout_vo.py); null where the line has no word marks.
// Run after ANY change to timeline.json, beats.json or the VO. Run from the project root.
//
// Beat → seconds uses the MEASURED grid (beats.json). Before the music exists it falls back to a nominal grid from
// timeline.bpm, so the film can be blocked out early. A cue lands on the nearest measured hit within ±40 ms of its
// beat time, otherwise on the beat itself. sfx events: { at: beat|mark, type, gain?, pitch?, pan?, what }
// Repeats: { at, to, every: beats, ... } expands to one cue per step (typing ticks, rolls).
import fs from 'node:fs';

const TL = JSON.parse(fs.readFileSync('timeline.json', 'utf8'));
const measured = fs.existsSync('beats.json');
const G = measured ? JSON.parse(fs.readFileSync('beats.json', 'utf8'))
  : { bpm: TL.bpm, beat: 60 / TL.bpm, offset: 0, beats: [], hits: [], nominal: true };
const P = G.beat || 60 / TL.bpm;
const B = G.beats || [];
const beatOf = (m) => {
  if (typeof m === 'number') return m;
  if (!(m in TL.marks)) throw new Error(`unknown mark "${m}"`);
  return TL.marks[m];
};
const beatTime = (x) => {
  if (!B.length) return (G.offset || 0) + x * P;
  if (x <= 0) return B[0] + x * P;
  const i = Math.floor(x), f = x - i;
  if (i >= B.length - 1) return B[B.length - 1] + (x - B.length + 1) * P;
  return B[i] + f * (B[i + 1] - B[i]);
};
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = mulberry32(2026);

const events = [];
for (const ev of TL.sfx || []) {
  if (ev.every) {
    for (let x = beatOf(ev.at); x < beatOf(ev.to) - 1e-9; x += ev.every) events.push({ ...ev, at: +x.toFixed(4), mark: null });
  } else events.push({ ...ev, mark: typeof ev.at === 'string' ? ev.at : null });
}
const cues = events.map((ev) => {
  const beat = beatOf(ev.at), target = beatTime(beat);
  let best = null;
  for (const h of G.hits || []) { const d = Math.abs(h.t - target); if (d <= 0.04 && (!best || d < Math.abs(best.t - target))) best = h; }
  const t = best ? best.t : target;
  return {
    t: +t.toFixed(5), type: ev.type, gain: ev.gain ?? 0.8,
    pitch: ev.pitch ?? +(0.94 + rnd() * 0.12).toFixed(3), pan: ev.pan ?? +((rnd() - 0.5) * 0.5).toFixed(3),
    beat, mark: ev.mark, snapped_to_hit: !!best, snap_ms: +((t - target) * 1000).toFixed(2), what: ev.what || '',
    ...(ev.src && { src: ev.src }), ...(ev.sample && { sample: ev.sample }),   // sfx.mjs reads both per cue
    ...(ev.visual && { visual: ev.visual }),   // review.py: what the picture does on this cue (cut | move | land | appear)
  };
}).filter((c) => c.t < TL.duration).sort((a, b) => a.t - b.t);
fs.writeFileSync('cues.json', JSON.stringify({ sr: 48000, duration: TL.duration, measured, cues }, null, 1));

const VO = fs.existsSync('audio/vo_placed.json') ? JSON.parse(fs.readFileSync('audio/vo_placed.json', 'utf8')) : [];
const CAPS = fs.existsSync('captions.json') ? JSON.parse(fs.readFileSync('captions.json', 'utf8')) : [];   // motion-film: burned-in captions
// words of a caption → word marks. Display words: the same rule as voice.py / layout_vo.py / lib/captions.js.
const tokens = (s) => {
  const out = []; let lead = '';
  for (const p of s.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)) {
    if (/[\p{L}\p{N}_]/u.test(p)) { out.push(lead + p); lead = ''; } else if (out.length) out[out.length - 1] += ' ' + p; else lead += p + ' ';
  }
  return out;
};
const wkey = (w) => w.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');
const LW = {};   // line id → its words, k = index + 1
if (fs.existsSync('vo.json')) for (const p of JSON.parse(fs.readFileSync('vo.json', 'utf8')).phrases || []) if (p.words && `${p.id}.w1` in TL.marks) LW[p.id] = p.words;
const byPos = [];
let prev = null, ptr = 0;
const CAPW = CAPS.map(([k, txt]) => {
  const id = String(k).split('.')[0], W = LW[id];
  if (!W || !txt.trim()) { prev = null; return null; }
  if (prev !== id) {   // first caption of this line: start at the word nearest its mark; later ones continue in order
    const at = k in TL.marks ? TL.marks[k] : TL.marks[`${id}.w1`];
    ptr = W.reduce((best, _, i) => (Math.abs(TL.marks[`${id}.w${i + 1}`] - at) < Math.abs(TL.marks[`${id}.w${best + 1}`] - at) ? i : best), 0);
  }
  prev = id;
  return tokens(txt).map((tok) => {
    const want = wkey(tok);
    let f = -1;
    for (let i = ptr; i < Math.min(W.length, ptr + 5) && f < 0; i++) { const w = wkey(W[i]); if (w === want || (want.length > 2 && w.length > 2 && (w.startsWith(want) || want.startsWith(w)))) f = i; }
    if (f < 0) { f = Math.min(ptr, W.length - 1); byPos.push(`${k} «${tok}»`); }   // screen spelling ("1 200" for "twelve hundred"): by position
    ptr = f + 1;
    return `${id}.w${f + 1}`;
  });
});
if (byPos.length) console.warn(`karaoke: ${byPos.length} caption word(s) differ from the line and take the next word's mark: ${byPos.slice(0, 8).join(', ')}${byPos.length > 8 ? ' …' : ''}`);
// live components from capture.mjs --components: { id: { w, h, html } }; a failed pixel check is loud, not fatal
const UI = {};
if (fs.existsSync('assets/ui')) for (const f of fs.readdirSync('assets/ui').filter((f) => f.endsWith('.json')).sort()) {
  const c = JSON.parse(fs.readFileSync(`assets/ui/${f}`, 'utf8'));
  if (!c.check?.ok) console.warn(`WARN live component ${f}: pixel check ${c.check ? c.check.diff_pct + ' % off' : 'missing'} — fix or show the screenshot instead`);
  UI[f.replace(/\.json$/, '')] = { w: c.w, h: c.h, html: c.html };
}
const { hits, ...grid } = G;
const SVG_ASSETS = {};
if (fs.existsSync('assets/icons')) for (const pack of fs.readdirSync('assets/icons', { withFileTypes: true }).filter((x) => x.isDirectory())) {
  for (const file of fs.readdirSync(`assets/icons/${pack.name}`).filter((x) => x.endsWith('.svg')).sort()) {
    const svg = fs.readFileSync(`assets/icons/${pack.name}/${file}`, 'utf8');
    if (/<(?:script|style|foreignObject|iframe)\b|\bon\w+\s*=|\b(?:href|src)\s*=|url\s*\(|@import/i.test(svg)) throw new Error(`active or external SVG: ${file}`);
    SVG_ASSETS[`${pack.name}:${file.slice(0, -4)}`] = svg;
  }
}
// EXTRA_ASSETS (ILLUSTRATIONS.extra): only the extras film code names literally ('noto:mobile-phone'), so a film carries
// a few kilobytes, not the whole 2.8 MB set. Local url(#…) is allowed (gradients); anything external is refused.
const EXTRA_ASSETS = {};
if (fs.existsSync('assets/extras')) {
  const code = fs.readdirSync('film').filter((f) => f.endsWith('.js') && f !== 'data.js').map((f) => fs.readFileSync(`film/${f}`, 'utf8')).join('\n');
  const packs = fs.readdirSync('assets/extras', { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name);
  const named = [...new Set([...code.matchAll(/['"`]([a-z0-9]+):([a-z0-9-]+)['"`]/g)].filter((m) => packs.includes(m[1])).map((m) => `${m[1]}:${m[2]}`))].sort();
  const missing = [];
  for (const id of named) {
    const [pack, name] = id.split(':'), file = `assets/extras/${pack}/${name}.svg`;
    if (!fs.existsSync(file)) { missing.push(id); continue; }
    const svg = fs.readFileSync(file, 'utf8');
    if (/<(?:script|style|foreignObject|iframe|image)\b|\bon\w+\s*=|\bsrc\s*=|href\s*=\s*["'](?!#)|url\s*\(\s*['"]?(?!#)|@import/i.test(svg)) throw new Error(`active or external extra SVG: ${file}`);
    EXTRA_ASSETS[id] = svg;
  }
  if (missing.length) console.warn(`WARN unknown extra id(s): ${missing.join(', ')} — search: node scripts/scenes.mjs search "<word>" --category extras`);
}
// VOW (mouth, lib/lipsync.js): every spoken word as [t0, t1, word] in film seconds. Starts: the word marks <id>.w<k>
// (the same as the karaoke); ends: audio/vo/<id>.words.json when it matches the line, else the next word or the
// phrase end, at most ~0.09 s per letter.
const VOW = [];
const placedEnd = Object.fromEntries(VO.map((p) => [p.id, p.t1]));
for (const [id, W] of Object.entries(LW)) {
  const f = `audio/vo/${id}.words.json`;
  let heard = null;
  if (fs.existsSync(f)) { const J = JSON.parse(fs.readFileSync(f, 'utf8')); if ((J.words || []).length === W.length) heard = J.words; }
  const starts = W.map((_, i) => beatTime(TL.marks[`${id}.w${i + 1}`]));
  const end = placedEnd[id] ?? starts[starts.length - 1] + 0.6;
  W.forEach((w, i) => {
    const next = i + 1 < W.length ? starts[i + 1] : end, letters = (w.match(/[\p{L}\p{N}]/gu) || []).length;
    const span = heard ? heard[i].end - heard[i].start : NaN, said = Number.isFinite(span) && span > 0 ? span : 0.09 * letters + 0.06;
    const t1 = Math.min(next, end, starts[i] + Math.max(0.06, said));
    if (t1 > starts[i]) VOW.push([+starts[i].toFixed(3), +t1.toFixed(3), w]);
  });
}
VOW.sort((a, b) => a[0] - b[0]);
// PUPPETS (lib/puppet.js): assets/puppets/<name>/puppet.json, checked here so a broken pack fails before the render
const PUPPETS = {};
if (fs.existsSync('assets/puppets')) for (const d of fs.readdirSync('assets/puppets', { withFileTypes: true }).filter((x) => x.isDirectory())) {
  const f = `assets/puppets/${d.name}/puppet.json`;
  if (!/^[\w-]+$/.test(d.name) || !fs.existsSync(f)) continue;
  const J = JSON.parse(fs.readFileSync(f, 'utf8'));
  const files = [...Object.values(J.poses || {}).flatMap((p) => [p.src, p.over?.src]), ...Object.values(J.faces || {}).map((x) => x.src),
    ...Object.values(J.mouths || {}).map((x) => x.src), J.blink?.src].filter((x) => x !== undefined);
  const bad = files.filter((x) => typeof x !== 'string' || !/^[\w-]+\.png$/.test(x) || !fs.existsSync(`assets/puppets/${d.name}/${x}`));
  if (bad.length) throw new Error(`puppet pack ${d.name}: missing or unsafe files ${bad.slice(0, 5).join(', ')}`);
  PUPPETS[d.name] = { ...J, base: `../assets/puppets/${d.name}/` };
}
fs.mkdirSync('film', { recursive: true });
fs.writeFileSync('film/data.js', `// GENERATED by scripts/sync.mjs — do not edit\nwindow.TL = ${JSON.stringify(TL)};\nwindow.BEATS = ${JSON.stringify(grid)};\nwindow.VO = ${JSON.stringify(VO)};\nwindow.CAPS = ${JSON.stringify(CAPS)};\nwindow.CAPW = ${JSON.stringify(CAPW)};\nwindow.UI = ${JSON.stringify(UI)};\nwindow.SVG_ASSETS = ${JSON.stringify(SVG_ASSETS)};\nwindow.EXTRA_ASSETS = ${JSON.stringify(EXTRA_ASSETS)};\nwindow.VOW = ${JSON.stringify(VOW)};\nwindow.PUPPETS = ${JSON.stringify(PUPPETS)};\n`);

console.log(`grid: ${measured ? `measured ${G.bpm} bpm, ${B.length} beats` : `NOMINAL ${TL.bpm} bpm (no beats.json yet)`}`);
console.log(`cues.json: ${cues.length} cues, ${cues.filter((c) => c.snapped_to_hit).length} on measured hits · film/data.js written${VO.length ? ` (${VO.length} VO phrases)` : ''}${Object.keys(UI).length ? ` (${Object.keys(UI).length} live components)` : ''}`);
for (const c of cues) console.log(`  ${c.t.toFixed(3)}s  b${String(c.beat).padEnd(6)} ${c.type.padEnd(7)} ${c.snapped_to_hit ? 'hit ' + (c.snap_ms >= 0 ? '+' : '') + c.snap_ms + 'ms' : 'grid'}  ${c.what}`);

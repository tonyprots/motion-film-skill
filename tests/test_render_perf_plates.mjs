// render.mjs --perf and --plates on a real scaffold, real Chromium, no GPU (≈ 30 s):
//   --plates writes assets/plates/<name>_<fmt>.png at full size from the frame at "at" (seconds, mark, mark±seconds);
//   a frame-rendering mode re-renders them before any worker starts (a parallel draft shows the fresh plate);
//   --no-plates leaves them alone; a bad entry stops the run;
//   --perf finds the moving scene heaviest, the still one at 2 sub-frames, writes review/perf_<fmt>.json, renders nothing.
//   node tests/test_render_perf_plates.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { decodePNG } = await import(path.join(skill, 'scripts/png.mjs'));
const base = fs.mkdtempSync(path.join(process.env.MF_TEST_OUTPUT || os.tmpdir(), 'mf-perf-plates-'));
const root = path.join(base, 'film-project');
function run(args, expected = 0, cmd = 'node') {
  const p = spawnSync(cmd, args, { cwd: fs.existsSync(root) ? root : skill, encoding: 'utf8', timeout: 180000, env: { ...process.env, MOTION_FILM_OFFLINE: '1' } });
  if (expected !== null) assert.equal(p.status, expected, `${cmd} ${args.join(' ')}\n${p.stdout}${p.stderr}`);
  return p.stdout + p.stderr;
}
const write = (f, s) => fs.writeFileSync(path.join(root, f), typeof s === 'string' ? s : JSON.stringify(s, null, 1));
const plate = (f) => path.join(root, 'assets/plates', f);
const near = (px, hex, what) => {
  const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  assert.ok(px.every((v, i) => Math.abs(v - want[i]) <= 6), `${what}: ${px} is not ${hex}`);
};
const pngAt = (file, x, y) => { const b = fs.readFileSync(file), w = b.readUInt32BE(16), im = decodePNG(b), q = (y * w + x) * 3; return [im[q], im[q + 1], im[q + 2]]; };

run([path.join(skill, 'scripts/init.sh'), root], 0, 'sh');
const timeline = {
  duration: 3.5, fps: 60, bpm: 120, formats: ['16x9', '9x16'], voiceover: null, sfx: [], styleframes: ['swing'],
  marks: { open: 0, swing: 2, show: 4.5, done: 7 },
  plates: [{ name: 'still-end', at: 'swing-0.05' }, { name: 'swing-mid', at: 1.6 }],
};
// still: a coloured card (the plate carries its colour) · swing: a fast bar (heavy blur) · show: the plate laid as a sheet,
// over the bar while the two overlap
const film = (card) => `(() => {
  const { W, H, put, reg, el, scene, seg, lerp } = C;
  scene({ name: 'still', from: 'open', to: 'swing', build(root) {
    root.style.background = '#f6f5f1';
    reg(el('div', { class: 'abs', style: 'left:160px;top:180px;width:' + (W - 320) + 'px;height:' + (H - 360) + 'px;border-radius:28px;background:${card}' }, root)); } });
  scene({ name: 'swing', from: 'swing', to: 'show', post: 0.5,
    build(root, S) { root.style.background = '#121212'; S.bar = reg(el('div', { class: 'abs', style: 'left:0;top:0;width:420px;height:' + H + 'px;background:#f0efe9' }, root)); },
    run(t, b, S) { put(S.bar, { x: (W - 420) * 0.5 * (1 + Math.sin((t - C.bt('swing')) * 9)) }); } });
  scene({ name: 'show', from: 'show', to: 'done', pre: 0.5,
    build(root, S) { S.sheet = reg(el('img', { class: 'abs', src: '/assets/plates/still-end_' + C.FMT + '.png', style: 'width:' + W + 'px;height:' + H + 'px' }, root)); },
    run(t, b, S) { put(S.sheet, { s: lerp(0.5, 0.52, seg(t, 4, 'done')), x: W * 0.25, y: H * 0.25 }); } });
  C.start();
})();`;
write('timeline.json', timeline);
write('film/film.js', film('#d23c28'));
run(['scripts/sync.mjs']);

// usage lists both modes
const help = run(['scripts/render.mjs', '--help']);
assert.match(help, /--perf \[--all\] \[--samples 5\]/);
assert.match(help, /--plates \[--fmt 16x9 \| --all\]/);

// --plates: every plate in every format, full size, the frame at its "at"
let out = run(['scripts/render.mjs', '--plates', '--all']);
assert.match(out, /plates: 2 × 16x9, 9x16 → assets\/plates\/ in \d+\.\d s/);
for (const [f, w, h] of [['still-end_16x9', 1920, 1080], ['still-end_9x16', 1080, 1920], ['swing-mid_16x9', 1920, 1080], ['swing-mid_9x16', 1080, 1920]]) {
  const b = fs.readFileSync(plate(f + '.png'));
  assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [w, h], f);
}
near(pngAt(plate('still-end_16x9.png'), 960, 540), '#d23c28', 'still-end = the card at swing − 0.05 s');
near(pngAt(plate('swing-mid_16x9.png'), 30, 1000), '#121212', 'swing-mid = the swing scene at 1.6 s');
assert.deepEqual(fs.readdirSync(path.join(root, 'assets/plates')).filter((f) => f.startsWith('.')), [], 'no temp files left');

// --perf: table + JSON; the moving scene is the heaviest, the still one needs no blur; nothing in renders/
out = run(['scripts/render.mjs', '--perf', '--fmt', '16x9', '--samples', '3', '--workers', '2', '--chunk', '1']);
assert.match(out, /^plates: /m, 'plates before --perf');
assert.match(out, /^\s+swing\s+1\.00–2\.50\s+\d+\s+[\d.]+ \(\d+–\d+\)\s+[\d.]+\s+← heaviest$/m);
assert.match(out, /^forecast 16x9: .* in one process · ≥ .* on 2 workers \(4 chunks of 1 s\) · heaviest: swing, \d+ %/m);
const P = JSON.parse(fs.readFileSync(path.join(root, 'review/perf_16x9.json'), 'utf8'));
assert.deepEqual(P.scenes.map((s) => s.name), ['still', 'swing', 'show']);
const [still, swing] = P.scenes;
assert.ok(swing.heaviest && !still.heaviest);
assert.deepEqual(still.sub_frames, [2, 2, 2], 'a still card: two probes, no extra sub-frames');
assert.ok(Math.min(...swing.sub_frames) > 2, `a fast bar needs sub-frames: ${swing.sub_frames}`);
assert.equal(P.frames, 210);
assert.equal(P.scenes.reduce((s, x) => s + x.frames, 0), 210 + 30, 'swing and show share 0.5 s (30 frames)');
const sum = P.scenes.reduce((s, x) => s + x.seconds, 0);
assert.ok(Math.abs(sum + P.page_load_s - P.forecast.one_process_s) < 0.2, 'scene seconds add up to the forecast');
assert.ok(P.forecast.parallel_min_s > 0 && P.forecast.parallel_min_s < P.forecast.one_process_s, JSON.stringify(P.forecast));
assert.deepEqual(fs.readdirSync(path.join(root, 'renders')), [], '--perf renders nothing');

// a parallel draft re-renders the plates first: its workers show the new colour
write('film/film.js', film('#2850d2'));
out = run(['scripts/render.mjs', '--draft', '--fmt', '16x9', '--fps', '12', '--chunk', '1', '--workers', '2']);
assert.ok(out.indexOf('plates: 2 × 16x9') >= 0 && out.indexOf('plates: 2 × 16x9') < out.indexOf('wrote renders/draft_16x9.mp4'), out);
near(pngAt(plate('still-end_16x9.png'), 960, 540), '#2850d2', 'plate refreshed before the draft');
const frame = spawnSync('ffmpeg', ['-v', 'error', '-ss', '3.0', '-i', path.join(root, 'renders/draft_16x9.mp4'), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 }).stdout;
const q = (540 * 1920 + 960) * 3;   // the sheet's middle: x = 480 + 0.5 × 960, y = 270 + 0.5 × 540
near([frame[q], frame[q + 1], frame[q + 2]], '#2850d2', 'the draft (2 workers) shows the fresh plate');

// --no-plates leaves them as they are; without it they follow the film
write('film/film.js', film('#28a050'));
const before = fs.readFileSync(plate('still-end_16x9.png'));
out = run(['scripts/render.mjs', '--at', '0.5', '--fmt', '16x9', '--no-plates']);
assert.doesNotMatch(out, /^plates: /m);
assert.deepEqual(fs.readFileSync(plate('still-end_16x9.png')), before, '--no-plates');
run(['scripts/render.mjs', '--at', '0.5', '--fmt', '16x9']);
near(pngAt(plate('still-end_16x9.png'), 960, 540), '#28a050', 'refreshed before --at');

// a bad entry stops the run instead of shooting the wrong frame
write('timeline.json', { ...timeline, plates: [{ name: 'lost', at: 'nosuch+0.2' }] });
assert.match(run(['scripts/render.mjs', '--plates', '--fmt', '16x9'], 1), /plate "lost": .*unknown mark "nosuch"/);
write('timeline.json', { ...timeline, plates: [{ name: '../x', at: 1 }] });
assert.match(run(['scripts/render.mjs', '--at', '1', '--fmt', '16x9'], 1), /"plates": name "\.\.\/x"/);
write('timeline.json', { ...timeline, plates: [] });
assert.match(run(['scripts/render.mjs', '--plates'], 1), /"plates" is empty/);

fs.rmSync(base, { recursive: true, force: true });
console.log('render --perf / --plates: plates full size and fresh before a parallel draft, --no-plates, bad entries stop; perf table, heaviest scene, forecast adds up');

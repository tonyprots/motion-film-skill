// Render the film: drives window.seek(t) in headless Chromium, pipes frames to ffmpeg. Run from the project root.
//
//   node scripts/render.mjs --sheet [--fmt 9x16] [--phase 0.25]  one frame per beat → review/sheets/sheet_<fmt>.jpg (+ _phone.jpg at 360 px)
//   node scripts/render.mjs --at 1.2,s2b [--fmt 1x1]              stills (seconds, marks, s2b+1.5) → review/stills/<fmt>/t<sec>.png
//   node scripts/render.mjs --frames [--all]                      styleframes: timeline "styleframes" (marks or {at, name}) in every format
//                                                                 → review/styleframes/board.jpg (one row per frame) — judge before animating
//   node scripts/render.mjs --animatic [--all]                    12 fps, short side 480, no blur → renders/animatic_<fmt>.mp4 (timing first)
//   node scripts/render.mjs --draft [--all]                       30 fps, no blur, CRF 22 → renders/draft_<fmt>.mp4 (for review rounds)
//   node scripts/render.mjs [--fmt 16x9 | --all]                  final: 60 fps, adaptive 180° motion blur, H.264 yuv420p CRF 16 → renders/<fmt>.mp4
//   node scripts/render.mjs --range 3,5 [--blur 0]                a clip of seconds 3–5 → renders/clip_<fmt>_3-5.mp4 (motion checks)
//   node scripts/render.mjs --mux [--all]                         re-mux the current audio/mix.wav into existing renders without re-rendering
//   node scripts/render.mjs --verify [--all]                      determinism check: 12 probes, cold vs after seeking elsewhere
//   node scripts/render.mjs --lint [--all] [--phase 0.6]          text in frame, once per beat: size, contrast, 9:16 zones, one phrase twice
//                                                                 → review/lint_<fmt>.json + text_<fmt>.json; exit 1 on a PROBLEM
//   node scripts/render.mjs --seams [--all]                       every hard cut: shared text/images keep place and size (12 px, 5 %),
//                                                                 no still-to-still cut, no empty first frame → review/seams_<fmt>.json
//   options: --fps N  --blur 0|1 (default 1 for finals)  --crf N  --audio path (default audio/mix.wav if present)
//   finish:  --deband [thr]  --lut grade.cube  --grain N (8-bit steps, ~1.5–2.5)  --master (+ HEVC 10-bit <fmt>_master.mp4)  --no-finish
//            defaults from timeline.json "finish": {deband, lut, grain, master}
//            --workers N|auto (video modes; default auto = up to 4 on 8+ cores)  --chunk SEC (default 4)
//
// Parallel render (motion-film): the frame range is cut into chunks of --chunk seconds; N worker processes, each with its
// own Chromium, pull chunks from a queue and encode each to renders/.parts/ with the same x264 settings. The chunks are
// joined losslessly (concat demuxer, -c copy) and the audio is muxed once. Frames are a pure function of t, so the
// output is identical to a single-process render apart from a keyframe at every chunk start.
// Run --verify once per project before a parallel final: a state leak would show as a jump at chunk boundaries.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decodePNG } from './png.mjs';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const require = createRequire(path.join(ROOT, 'package.json'));
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('playwright not found from this project. Run: npm i -D playwright && npx playwright install chromium'); process.exit(1);
}

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const has = (k) => argv.includes(`--${k}`);
const TL = JSON.parse(fs.readFileSync(path.join(ROOT, 'timeline.json'), 'utf8'));
const SIZES = { '16x9': [1920, 1080], '1x1': [1080, 1080], '4x5': [1080, 1350], '9x16': [1080, 1920] };
const FORMATS = has('all') || (has('frames') && !has('fmt')) ? TL.formats : [opt('fmt', TL.formats[0])];
const ANIMATIC = has('animatic');                      // timing check before polish: 12 fps, short side 480, no blur
const DRAFT = has('draft') || ANIMATIC;
const AUDIO = path.resolve(ROOT, opt('audio', 'audio/mix.wav'));
const hasAudio = fs.existsSync(AUDIO);
const mkdir = (d) => fs.mkdirSync(d, { recursive: true });
const run = (cmd, a) => { const r = spawnSync(cmd, a, { stdio: ['ignore', 'inherit', 'pipe'] }); if (r.status) throw new Error(`${cmd} failed: ${r.stderr}`); return r; };

// ------------------------------------------------------------------ --mux: new mix into existing renders, video untouched
if (has('mux')) {
  if (!hasAudio) { console.error('no audio at', AUDIO); process.exit(1); }
  for (const fmt of FORMATS) {
    const src = path.join(ROOT, `renders/${DRAFT ? "draft_" : ""}${fmt}.mp4`), tmp = src + '.tmp.mp4';
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-i', AUDIO, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', tmp]);
    fs.renameSync(tmp, src); console.log('muxed', src);
    const m = src.replace(/\.mp4$/, '_master.mp4');
    if (fs.existsSync(m)) {
      run('ffmpeg', ['-y', '-loglevel', 'error', '-i', m, '-i', AUDIO, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-tag:v', 'hvc1', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', m + '.tmp.mp4']);
      fs.renameSync(m + '.tmp.mp4', m); console.log('muxed', m);
    }
  }
  process.exit(0);
}

// ------------------------------------------------------------------ static server (film fetches nothing; data.js is generated)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wav': 'audio/wav', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
// WebGL films (timeline.json "webgl": true or --gpu) run Chromium on the GPU (ANGLE Metal on macOS): a three.js frame with
// post-processing costs ~95 ms there against ~1.4 s on the default software rasteriser (SwiftShader), and both are
// deterministic per t (lab 2026-10-06). The backend is fixed for the whole render: Metal and SwiftShader pixels differ.
const GPU = has('gpu') || TL.webgl === true;
const GPU_ARGS = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan'];
const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--disable-gpu-vsync', ...(GPU ? GPU_ARGS : [])] });

async function openFilm(fmt) {
  const [W, H] = SIZES[fmt];
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', (e) => { console.error('[pageerror]', e.message); process.exitCode = 1; });
  await page.goto(`http://127.0.0.1:${server.address().port}/film/index.html?fmt=${fmt}`);
  await page.waitForFunction(() => window.READY, null, { timeout: 120000 });
  await page.evaluate(() => window.READY);
  const cdp = await page.context().newCDPSession(page);
  const info = await page.evaluate(() => ({ DUR: window.DURATION, FPS: window.FPS, CUTS: window.CUTS || [], BEATS: window.BEATS || {} }));
  const png = async (t) => {
    await page.evaluate((t) => window.seek(t), t);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    return Buffer.from(data, 'base64');
  };
  return { page, png, W, H, ...info };
}

function ffmpeg(a) {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, bad) => p.on('close', (c) => (c ? bad(new Error(`ffmpeg exit ${c}`)) : ok())));
  return { p, done };
}
// wait for each frame to be flushed: on macOS a large buffer still queued when stdin.end() runs can reach ffmpeg cut short
const write = (s, buf) => new Promise((ok, bad) => s.write(buf, (e) => (e ? bad(e) : ok())));

// ------------------------------------------------------------------ video: frames → ffmpeg
const VIDEO = !['sheet', 'verify', 'at', 'lint', 'seams'].some(has);
const CRF = +opt('crf', DRAFT ? 22 : 16);   // --crf 0 = lossless (x264 needs its own profile for that: used to prove parallel == serial)
// Finish (timeline.json "finish", CLI flags override): frames reach ffmpeg as 16-bit RGB (the motion-blur average keeps its
// fractions), are optionally debanded and graded with a .cube LUT in 16 bits, and are dithered (error diffusion) only at the
// last step down to 8 bits. Grain is added in Node from the ABSOLUTE frame number, so serial and parallel renders match
// (ffmpeg's noise filter counts frames per process and would repeat its pattern at every chunk). --master also writes
// renders/<fmt>_master.mp4: HEVC 10-bit, hvc1, from the same frames. Measured 2026-10-06: deband in 16 bit + dither cures
// gradient banding at ~2× stream size; grain against banding costs 34–244× and does not cure it.
const FIN = { deband: true, lut: null, grain: 0, master: false, ...(TL.finish || {}) };
if (has('deband')) FIN.deband = opt('deband') === true ? true : +opt('deband');
if (has('lut')) FIN.lut = opt('lut');
if (has('grain')) FIN.grain = +opt('grain');
if (has('master')) FIN.master = true;
if (has('no-finish')) Object.assign(FIN, { deband: false, lut: null, grain: 0 });
const HI = !DRAFT;                                    // 16-bit pipe for finals and clips; drafts stay 8-bit and fast
if (FIN.lut) { FIN.lut = path.resolve(ROOT, FIN.lut); if (!fs.existsSync(FIN.lut)) { console.error('LUT not found:', FIN.lut); process.exit(1); } }
const TAGS = 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv';
const finishChain = () => {
  if (!HI) return TAGS;          // 8-bit draft: tag only (the matrix follows the tags)
  const f = ['format=gbrp16le'];
  if (FIN.deband) { const th = FIN.deband === true ? 0.02 : FIN.deband; f.push(`deband=1thr=${th}:2thr=${th}:3thr=${th}:range=16:blur=1`); }
  if (FIN.lut) f.push(`lut3d=file='${FIN.lut.replace(/'/g, "\\'")}':interp=tetrahedral`);
  return f.join(',');
};
const toYUV = (pix) => `scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int:sws_dither=ed,format=${pix},${TAGS}`;
const x264 = () => ['-c:v', 'libx264', '-preset', DRAFT ? 'veryfast' : 'slow', '-crf', String(CRF), '-pix_fmt', 'yuv420p', ...(CRF ? ['-profile:v', 'high'] : []),
  '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];
const x265 = () => ['-c:v', 'libx265', '-preset', 'slow', '-crf', String(CRF || 0), '-pix_fmt', 'yuv420p10le', '-tag:v', 'hvc1',
  '-x265-params', `colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited:log-level=error${CRF ? '' : ':lossless=1'}`];
const masterOf = (out) => out.replace(/\.mp4$/, '_master.mp4');
const videoParams = (F) => {
  const fps = +opt('fps', ANIMATIC ? 12 : DRAFT ? 30 : F.FPS);
  const blur = !DRAFT && String(opt('blur', '1')) !== '0';
  const [a, b] = has('range') ? String(opt('range')).split(',').map(Number) : [0, F.DUR];
  return { fps, blur, a, b, N: Math.round((b - a) * fps) };
};

// Adaptive 180° motion blur: each frame is probed at two shutter points; the mean pixel difference sets how many
// sub-frames to average (2 when static → 24 on the fastest moves). Sub-frames sit symmetrically around the frame
// time and never straddle a hard cut (window.CUTS), so a cut is never double-exposed.
// grain: monochrome, triangular noise from a hash of (absolute frame, pixel), weighted to the midtones (0 at black and white)
const hash = (x) => { x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); return (x ^ (x >>> 16)) >>> 0; };
function addGrain(px, W, H, frame, amp) {   // px: Uint16Array RGB, amp in 8-bit steps
  const A = amp * 257 / 0x100000000, seed = Math.imul(frame + 1, 0x9e3779b9);
  for (let p = 0, q = 0; p < W * H; p++, q += 3) {
    const l = (px[q] * 0.2126 + px[q + 1] * 0.7152 + px[q + 2] * 0.0722) / 65535, w = 4 * l * (1 - l);
    if (w < 0.02) continue;
    const h = hash(p ^ seed), n = ((h & 0xffff) + (h >>> 16) - 65535) * 65536 * A * w;   // triangular, sd ≈ 0.41 amp
    for (let c = 0; c < 3; c++) { const v = px[q + c] + n; px[q + c] = v < 0 ? 0 : v > 65535 ? 65535 : v; }
  }
}

// Adaptive 180° motion blur: each frame is probed at two shutter points; the mean pixel difference sets how many
// sub-frames to average (2 when static → 24 on the fastest moves). Sub-frames sit symmetrically around the frame
// time and never straddle a hard cut (window.CUTS), so a cut is never double-exposed.
async function renderFrames(F, { fps, blur, a }, i0, i1, sink, hist, tick) {
  const SHUTTER = 0.5, MIN_SUB = 2, MAX_SUB = 24;
  const clampCut = (tc, ts) => {
    for (const c of F.CUTS) {
      if (tc < c && ts >= c) return c - 1e-4;
      if (ts < c && tc >= c) return c;
    }
    return ts;
  };
  const at = (tc, u) => clampCut(tc, Math.max(0, Math.min(F.DUR - 1e-6, tc + (u - 0.5) * SHUTTER / fps)));
  const n = F.W * F.H * 3, acc = new Uint16Array(n), buf = Buffer.alloc(n);   // 24 × 255 fits in 16 bits
  const out16 = HI ? new Uint16Array(n) : null;
  const emit = async (frame) => {
    if (FIN.grain > 0) addGrain(out16, F.W, F.H, frame, FIN.grain);
    await write(sink, Buffer.from(out16.buffer.slice(0)));   // rgb48le: host is little-endian (x86-64, arm64)
  };
  for (let i = i0; i < i1; i++) {
    const tc = a + i / fps, frame = Math.round(tc * fps);
    if (!blur) {
      let im = decodePNG(await F.png(tc));
      for (let r = 0; im.length !== n && r < 3; r++) { console.error(`\n[frame ${i}] screenshot ${im.length} bytes, expected ${n}: reshooting`); im = decodePNG(await F.png(tc)); }
      if (im.length !== n) throw new Error(`frame ${i}: screenshot size mismatch`);
      if (!HI) { await write(sink, Buffer.from(im.buffer)); }
      else { for (let q = 0; q < n; q++) out16[q] = im[q] * 257; await emit(frame); }
    } else {
      const shot = async (u) => { let im = decodePNG(await F.png(at(tc, u))); for (let r = 0; im.length !== n && r < 3; r++) { console.error(`\n[frame ${i}] screenshot ${im.length} bytes, expected ${n}: reshooting`); im = decodePNG(await F.png(at(tc, u))); } if (im.length !== n) throw new Error(`frame ${i}: screenshot size mismatch`); return im; };
      const x = await shot(0.25), y = await shot(0.75);
      let d = 0; for (let q = 0; q < x.length; q += 97) d += Math.abs(x[q] - y[q]); d /= x.length / 97;
      const SUB = d < 0.35 ? MIN_SUB : Math.min(MAX_SUB, Math.max(4, Math.round(4 + d * 1.6)));
      hist[SUB] = (hist[SUB] || 0) + 1;
      if (SUB === 2) {
        if (HI) { for (let q = 0; q < n; q++) out16[q] = ((x[q] + y[q]) * 257 + 1) >> 1; }
        else { for (let q = 0; q < n; q++) buf[q] = (x[q] + y[q] + 1) >> 1; }   // = Math.round((x + y) / 2)
      } else {
        acc.fill(0);
        for (let k = 0; k < SUB; k++) { const im = await shot((k + 0.5) / SUB); for (let q = 0; q < n; q++) acc[q] += im[q]; }
        if (HI) { const m = 257 / SUB; for (let q = 0; q < n; q++) out16[q] = acc[q] * m + 0.5; }   // the average keeps its fractions
        else { const S2 = 2 * SUB; for (let q = 0; q < n; q++) buf[q] = ((acc[q] << 1) + SUB) / S2 | 0; }   // = Math.round(acc / SUB)
      }
      if (HI) await emit(frame); else await write(sink, buf);
    }
    tick(i);
  }
}

function encoder(F, fps, out, audio) {
  const input = ['-f', 'rawvideo', '-pix_fmt', HI ? 'rgb48le' : 'rgb24', '-s', `${F.W}x${F.H}`, '-framerate', String(fps), '-probesize', '100M', '-i', '-', ...(audio ? ['-i', audio] : [])];
  const aud = audio ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-shortest'] : [];
  const fc = FIN.master && HI
    ? `[0:v]${finishChain()},split=2[f1][f2];[f1]${toYUV('yuv420p')}[v8];[f2]${toYUV('yuv420p10le')}[v10]`
    : `[0:v]${HI ? finishChain() + ',' + toYUV('yuv420p') : (ANIMATIC ? `scale=${F.W >= F.H ? '-2:480' : '480:-2'}:flags=bilinear,` : '') + TAGS}[v8]`;
  return ffmpeg([...input, '-filter_complex', fc,
    '-map', '[v8]', ...aud, ...x264(), '-movflags', '+faststart', out,
    ...(FIN.master && HI ? ['-map', '[v10]', ...aud, ...x265(), '-movflags', '+faststart', masterOf(out)] : []),
  ]);
}

const WORKERS = (() => {
  const w = opt('workers', 'auto');
  if (w !== 'auto' && w !== true) return Math.max(1, +w | 0);
  return Math.max(1, Math.min(4, (os.availableParallelism?.() || os.cpus().length) - 4));
})();

async function renderVideo(F, fmt, t0) {
  const P = videoParams(F);
  const out = path.join(ROOT, 'renders', has('range') ? `clip_${fmt}_${P.a}-${P.b}.mp4` : `${ANIMATIC ? 'animatic_' : DRAFT ? 'draft_' : ''}${fmt}.mp4`);
  mkdir(path.dirname(out));
  const withAudio = hasAudio && !has('range');
  const hist = {};
  const chunk = Math.max(1, Math.round(+opt('chunk', 4) * P.fps));
  const chunks = [];
  for (let i = 0; i < P.N; i += chunk) chunks.push([i, Math.min(P.N, i + chunk)]);
  const K = Math.min(WORKERS, chunks.length);
  if (K <= 1) {
    const { p, done } = encoder(F, P.fps, out, withAudio ? AUDIO : null);
    await renderFrames(F, P, 0, P.N, p.stdin, hist, (i) => { if (i % 60 === 0) process.stdout.write(`\r${fmt} frame ${i}/${P.N}  ${((Date.now() - t0) / 1000).toFixed(0)}s   `); });
    p.stdin.end(); await done;
  } else {
    await F.page.close(); F.page = { close: async () => {} };          // the parent only coordinates
    const partsDir = path.join(ROOT, 'renders/.parts', `${path.basename(out, '.mp4')}-${process.pid}`); mkdir(partsDir);
    const parts = chunks.map((_, k) => path.join(partsDir, `p${String(k).padStart(4, '0')}.mp4`));
    let next = 0, framesDone = 0, failed = null, lastLog = 0;
    const self = fileURLToPath(import.meta.url);
    await new Promise((resolve, reject) => {
      let alive = K;
      for (let w = 0; w < K; w++) {
        const child = fork(self, argv, { env: { ...process.env, MF_WORKER: '1', MF_FMT: fmt }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
        const give = () => {
          if (failed || next >= chunks.length) return child.send({ quit: true });
          const k = next++; child.send({ k, i0: chunks[k][0], i1: chunks[k][1], out: parts[k] });
        };
        child.on('message', (m) => {
          if (m.ready || m.done !== undefined) {
            if (m.hist) for (const [s, c] of Object.entries(m.hist)) hist[s] = (hist[s] || 0) + c;
            give();
          }
          if (m.frames) {
            framesDone += m.frames;
            if (Date.now() - lastLog > 2000) { lastLog = Date.now(); process.stdout.write(`\r${fmt} frame ${framesDone}/${P.N}  ${K} workers  ${((Date.now() - t0) / 1000).toFixed(0)}s   `); }
          }
        });
        child.on('exit', (code) => {
          if (code && !failed) failed = new Error(`render worker exited with ${code}`);
          if (--alive === 0) (failed ? reject(failed) : resolve());
        });
      }
    });
    const list = path.join(partsDir, 'list.txt');
    fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
    const join = (lst, dst) => run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, ...(withAudio ? ['-i', AUDIO, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-shortest'] : []),
      '-c:v', 'copy', ...(dst === out ? [] : ['-tag:v', 'hvc1']), '-movflags', '+faststart', dst]);
    join(list, out);
    if (FIN.master && HI) {
      const listM = path.join(partsDir, 'list_master.txt');
      fs.writeFileSync(listM, parts.map((p) => `file '${masterOf(p).replace(/'/g, "'\\''")}'`).join('\n'));
      join(listM, masterOf(out));
    }
    fs.rmSync(partsDir, { recursive: true, force: true });
    try { fs.rmdirSync(path.join(ROOT, 'renders/.parts')); } catch {}
  }
  console.log(`\nwrote ${path.relative(ROOT, out)}  ${P.N} frames @ ${P.fps} fps${P.blur ? '  sub-frames ' + JSON.stringify(hist) : ''}${withAudio ? '  + ' + path.relative(ROOT, AUDIO) : '  (silent)'}  ${K > 1 ? K + ' workers  ' : ''}${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ------------------------------------------------------------------ worker process: renders the chunks it is given
if (process.env.MF_WORKER) {
  const F = await openFilm(process.env.MF_FMT);
  const P = videoParams(F);
  process.on('message', async (m) => {
    if (m.quit) { await F.page.close(); await browser.close(); server.close(); process.exit(0); }
    try {
      const hist = {}; let since = 0;
      const { p, done } = encoder(F, P.fps, m.out, null);
      await renderFrames(F, P, m.i0, m.i1, p.stdin, hist, () => { if (++since === 30) { process.send({ frames: since }); since = 0; } });
      p.stdin.end(); await done;
      if (since) process.send({ frames: since });
      process.send({ done: m.k, hist });
    } catch (e) { console.error('[worker]', e.message); process.exit(1); }
  });
  process.send({ ready: true });
} else {
// one time per beat, `phase` of a beat after it (0.25: the reaction is visible; 0.6: text has landed)
function beatTimes(F, phase) {
  const grid = F.BEATS.beats && F.BEATS.beats.length ? F.BEATS.beats : [];
  const period = F.BEATS.beat || 60 / TL.bpm;
  const beatT = (i) => grid[i] ?? (grid.length ? grid[grid.length - 1] + (i - grid.length + 1) * period : i * period);
  const times = [];
  for (let i = 0; beatT(i) < F.DUR - 0.5 / F.FPS; i++) times.push(Math.min(F.DUR - 1 / F.FPS, beatT(i) + phase * period));
  return times;
}

// --lint: every text element visible at each beat. Size = font-size × the live scale (camera included), at a 1080 px short side.
// Contrast = WCAG ratio of the text colour (composited by its opacity) against the median of the pixels in its box that are
// farthest from that colour (the background it actually sits on). Masked or clipped words (< 30 % of the box inside the
// clipping ancestors) and words under another layer (hit test at three points) are skipped.
const PAGE_TEXT = () => {
  const out = [], vw = innerWidth, vh = innerHeight;
  const groupOf = (el) => el.closest('.line, .cap') || el;
  // hit testing sees only what paints: transparent full-frame scene roots and canvases must not count as "on top"
  const paints = (el, s) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || /^(IMG|SVG|VIDEO)$/i.test(el.tagName)
    || s.backgroundImage !== 'none' || !/rgba\(.*,\s*0\)$|transparent/.test(s.backgroundColor);
  const saved = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    saved.push([el, el.style.pointerEvents]); el.style.pointerEvents = paints(el, s) ? 'auto' : 'none';
  }
  for (const el of document.querySelectorAll('body *')) {
    if (!el.checkVisibility || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (!own) continue;
    const cs = getComputedStyle(el), er = el.getBoundingClientRect();
    let r = null;   // the glyphs' own box (text nodes), not the element's: a caption box is wider than its words
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) {
      const rg = document.createRange(); rg.selectNodeContents(n); const q = rg.getBoundingClientRect();
      if (q.width && q.height) r = r ? { left: Math.min(r.left, q.left), top: Math.min(r.top, q.top), right: Math.max(r.right, q.right), bottom: Math.max(r.bottom, q.bottom) } : { left: q.left, top: q.top, right: q.right, bottom: q.bottom };
    }
    if (!r || r.right - r.left < 2 || r.bottom - r.top < 2) continue;
    let op = 1, vis = { l: Math.max(0, r.left), t: Math.max(0, r.top), r: Math.min(vw, r.right), b: Math.min(vh, r.bottom) }, unknownClip = false;
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a); op *= parseFloat(s.opacity);
      const clipped = s.clipPath !== 'none', over = a !== el && s.overflow !== 'visible';
      if (!clipped && !over) continue;
      const q = a.getBoundingClientRect(); let box = { l: q.left, t: q.top, r: q.right, b: q.bottom };
      if (clipped) {   // inset(top right bottom left [round …]) in px or %: shrink the box; any other shape → skip the item
        const m = s.clipPath.match(/^inset\(([^)]*?)(?:\s+round[^)]*)?\)$/);
        if (!m) { unknownClip = true; break; }
        const v = m[1].trim().split(/\s+/).map((x, i) => x.endsWith('%') ? parseFloat(x) / 100 * (i % 2 ? q.width : q.height) : parseFloat(x));
        const [it, ir, ib, il] = [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? v[1] ?? v[0]];
        const sx = a.offsetWidth ? q.width / a.offsetWidth : 1, sy = a.offsetHeight ? q.height / a.offsetHeight : 1;
        box = { l: q.left + il * sx, t: q.top + it * sy, r: q.right - ir * sx, b: q.bottom - ib * sy };
      }
      vis = { l: Math.max(vis.l, box.l), t: Math.max(vis.t, box.t), r: Math.min(vis.r, box.r), b: Math.min(vis.b, box.b) };
    }
    const area = Math.max(0, vis.r - vis.l) * Math.max(0, vis.b - vis.t);
    if (unknownClip || op < 0.5 || area < 0.3 * (r.right - r.left) * (r.bottom - r.top)) continue;
    const cy = (vis.t + vis.b) / 2, hit = [0.25, 0.5, 0.75].some((f) => { const h = document.elementFromPoint(vis.l + (vis.r - vis.l) * f, cy); return h && (h === el || el.contains(h)); });
    if (!hit) continue;   // another layer is on top of it here
    const scale = el.offsetWidth ? er.width / el.offsetWidth : 1;
    const g = groupOf(el);
    out.push({ text: own, group: g === el ? own : g.innerText.replace(/\s+/g, ' ').trim(), gid: [...document.querySelectorAll('*')].indexOf(g),
      cap: !!el.closest('.cap'), px: parseFloat(cs.fontSize) * scale, color: cs.color, op, box: vis, glyph: { l: r.left, t: r.top, r: r.right, b: r.bottom } });
  }
  for (const [el, v] of saved) el.style.pointerEvents = v;
  return out;
};
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// --seams: what the eye checks at a hard cut, measured: a cut reads
// clean when motion carries through it and a shared carrier (same text, same image) sits in the same place at the same size.
const PAGE_IMGS = () => [...document.images].filter((i) => i.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
  .map((i) => { const r = i.getBoundingClientRect(); return { key: 'img:' + i.getAttribute('src'), box: { l: r.left, t: r.top, r: r.right, b: r.bottom } }; })
  .filter((x) => x.box.r - x.box.l > 8 && x.box.b - x.box.t > 8 && x.box.r > 0 && x.box.b > 0 && x.box.l < innerWidth && x.box.t < innerHeight);
async function carriers(F) {   // visible words and images, keyed by content
  const m = new Map();
  for (const it of await F.page.evaluate(PAGE_TEXT)) {   // per word, glyph box unclipped: a word half out of its mask is still the same word
    const k = `text:${it.text} (in «${it.group.slice(0, 40)}»)`;
    if (!m.has(k)) m.set(k, it.glyph);
  }
  for (const it of await F.page.evaluate(PAGE_IMGS)) m.set(it.key, it.box);
  return m;
}
const meanDiff = (x, y) => { let d = 0; for (let q = 0; q < x.length; q += 37) d += Math.abs(x[q] - y[q]); return d / (x.length / 37); };

const cutsFile = path.join(ROOT, 'review/cuts.json');
for (const fmt of FORMATS) {
  const F = await openFilm(fmt);
  const t0 = Date.now();
  mkdir(path.dirname(cutsFile));   // hard cuts per format, for review.py (pops near a planned cut are not pops)
  fs.writeFileSync(cutsFile, JSON.stringify({ ...(fs.existsSync(cutsFile) ? JSON.parse(fs.readFileSync(cutsFile, 'utf8')) : {}), [fmt]: F.CUTS }));

  if (has('frames')) {
    // styleframes: the closing frame of each key scene, judged as a still before any motion is built (SKILL.md step 7)
    const SF = TL.styleframes || [];
    if (!SF.length) { console.error('timeline.json "styleframes" is empty: list 4–6 marks (or {"at": mark|seconds, "name": "…"}) — hook, UI, data, hero, end'); process.exit(1); }
    const dir = path.join(ROOT, 'review/styleframes', fmt); mkdir(dir);
    for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
    for (let i = 0; i < SF.length; i++) {
      const at = typeof SF[i] === 'object' ? SF[i].at : SF[i], t = typeof at === 'number' ? at : await F.page.evaluate((m) => C.bt(m), at);
      fs.writeFileSync(path.join(dir, `f${i}.png`), await F.png(t));
    }
    console.log(`styleframes ${fmt}: ${SF.length} → ${path.relative(ROOT, dir)}/`);
  } else if (has('sheet')) {
    // one frame per beat, a quarter-beat after the hit so the reaction is visible
    const times = beatTimes(F, +opt('phase', 0.25));
    const dir = path.join(ROOT, 'review/sheets', fmt); mkdir(dir);
    for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
    for (let i = 0; i < times.length; i++) fs.writeFileSync(path.join(dir, `b${String(i).padStart(3, '0')}.png`), await F.png(times[i]));
    fs.writeFileSync(path.join(dir, 'times.json'), JSON.stringify(times));
    const wide = F.W >= F.H, cols = wide ? 8 : 10, rows = Math.ceil(times.length / cols);
    for (const [tag, tw] of [['', wide ? 480 : 270], ['_phone', 360]]) {
      const th = Math.round(tw * F.H / F.W / 2) * 2, c = tag ? (wide ? 5 : 8) : cols, r = Math.ceil(times.length / c);
      const label = `drawtext=text='b%{frame_num}':x=6:y=6:fontsize=${tag ? 16 : 20}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4,`;
      const out = path.join(ROOT, `review/sheets/sheet_${fmt}${tag}.jpg`);
      const argsFor = (lab) => ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, 'b%03d.png'), '-vf', `scale=${tw}:${th}:flags=lanczos,${lab}tile=${c}x${r}:padding=6:color=0x202020`, '-frames:v', '1', '-q:v', '3', out];
      if (spawnSync('ffmpeg', argsFor(label)).status) run('ffmpeg', argsFor(''));   // ffmpeg without drawtext: unlabeled
      console.log('wrote', path.relative(ROOT, out), `(${times.length} beats, ${rows} rows)`);
    }
  } else if (has('lint')) {
    const k = 1080 / Math.min(F.W, F.H), times = beatTimes(F, +opt('phase', 0.6)), found = new Map();
    const note = (level, key, t, msg) => { const f = found.get(key); if (f) { f.n++; return; } found.set(key, { level, t: +t.toFixed(3), msg, n: 1 }); };
    let seen = 0; const onScreen = [];
    for (const t of times) {
      const img = decodePNG(await F.png(t)), items = await F.page.evaluate(PAGE_TEXT);
      seen += items.length;
      const byGroup = new Map(); for (const it of items) if (!byGroup.has(it.gid)) byGroup.set(it.gid, { text: it.group, where: it.cap ? 'caption' : 'in the scene' });
      onScreen.push({ t: +t.toFixed(3), text: [...byGroup.values()] });
      for (const it of items) {
        const m = it.color.match(/[\d.]+/g).map(Number), alpha = (m[3] ?? 1) * it.op;
        if (alpha < 0.05) continue;
        const x0 = Math.round(it.box.l), y0 = Math.round(it.box.t), x1 = Math.round(it.box.r), y1 = Math.round(it.box.b), px = [];
        for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const q = (y * F.W + x) * 3; px.push([img[q], img[q + 1], img[q + 2]]); }
        if (!px.length) continue;
        const d = (p) => (p[0] - m[0]) ** 2 + (p[1] - m[1]) ** 2 + (p[2] - m[2]) ** 2;
        px.sort((a, b) => d(b) - d(a));
        const far = px.slice(0, Math.max(1, px.length >> 1)), med = (c) => far.map((p) => p[c]).sort((a, b) => a - b)[far.length >> 1];
        const bg = [med(0), med(1), med(2)], fg = [0, 1, 2].map((c) => m[c] * alpha + bg[c] * (1 - alpha));
        const cr = ratio(fg, bg), size = it.px * k, word = it.text.slice(0, 40), where = `«${it.group.slice(0, 60)}»`;
        const minPx = it.cap ? 40 : 28;
        if (size < minPx * 0.97) note(size < minPx * 0.85 ? 'PROBLEM' : 'WARN', `size|${it.group}`, t, `${size.toFixed(0)} px < ${minPx} px${it.cap ? ' (caption)' : ''}: ${where}`);
        if (cr < 3) note('PROBLEM', `contrast|${it.group}`, t, `contrast ${cr.toFixed(2)}:1 < 3 (text ${fg.map(Math.round)} on ${bg}): ${where} «${word}»`);
        else if (cr < 4.5) note('WARN', `contrast|${it.group}`, t, `contrast ${cr.toFixed(2)}:1 < 4.5: ${where} «${word}»`);
        if (fmt === '9x16') {
          const zone = it.box.t < F.H * 0.14 ? 'top 14 %' : it.box.b > F.H * 0.80 ? 'bottom 20 %' : it.box.r > F.W * 0.88 ? 'right 12 %' : null;
          if (zone) note(it.cap ? 'PROBLEM' : 'WARN', `zone|${it.group}`, t, `in the platform UI zone (${zone})${it.cap ? ', caption' : ''}: ${where}`);
        }
      }
      const groups = new Map();   // one phrase in two places at once (headline + caption, frame in frame)
      for (const it of items) groups.set(it.gid, it.group);
      const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
      const G = [...groups.values()].map(norm).filter((s) => s.split(' ').length >= 3);
      for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++)
        if (G[i].includes(G[j]) || G[j].includes(G[i])) note('WARN', `twice|${G[i]}|${G[j]}`, t, `one phrase twice in the frame: «${G[i].slice(0, 50)}» / «${G[j].slice(0, 50)}»`);
    }
    const list = [...found.values()].sort((a, b) => (a.level > b.level ? 1 : -1) || a.t - b.t);
    mkdir(path.join(ROOT, 'review'));
    fs.writeFileSync(path.join(ROOT, `review/lint_${fmt}.json`), JSON.stringify({ fmt, beats: times.length, text_items: seen, issues: list }, null, 1));
    fs.writeFileSync(path.join(ROOT, `review/text_${fmt}.json`), JSON.stringify(onScreen));   // what a viewer can read, per beat (blindpack.py)
    for (const x of list) console.log(`${x.level.padEnd(7)} ${fmt} ${String(x.t).padStart(7)}s  ${x.msg}${x.n > 1 ? `  (×${x.n} beats)` : ''}`);
    const nP = list.filter((x) => x.level === 'PROBLEM').length;
    if (!seen) { console.log(`NOT CHECKED ${fmt}: no visible text found on ${times.length} beats (canvas-only film?)`); }
    console.log(`lint ${fmt}: ${times.length} beats, ${seen} text items checked · ${nP} PROBLEM, ${list.length - nP} WARN → review/lint_${fmt}.json`);
    if (nP) process.exitCode = 1;
  } else if (has('seams')) {
    const k = 1080 / Math.min(F.W, F.H), dt = 1 / F.FPS, out = [];
    for (const c of F.CUTS.filter((c) => c > dt && c < F.DUR - 2 * dt)) {
      const a2 = decodePNG(await F.png(c - 2 * dt)), A2 = await carriers(F), a1 = decodePNG(await F.png(c - dt)), A = await carriers(F);
      const b0 = decodePNG(await F.png(c)), B = await carriers(F), b1 = decodePNG(await F.png(c + dt)), B1 = await carriers(F);
      const eOut = meanDiff(a2, a1), eIn = meanDiff(b0, b1), issues = [];
      let mean = 0, sq = 0; for (let q = 0; q < b0.length; q += 37) { mean += b0[q]; sq += b0[q] * b0[q]; }
      const n = b0.length / 37, sd = Math.sqrt(Math.max(0, sq / n - (mean / n) ** 2));
      if (sd < 4) issues.push(['PROBLEM', `first frame after the cut is empty (σ ${sd.toFixed(1)})`]);
      if (eOut < 0.3 && eIn < 0.3) issues.push(['WARN', `still → still cut (motion ${eOut.toFixed(2)} → ${eIn.toFixed(2)}): reads as a slide change; carry a move through it`]);
      // a shared carrier may move through the cut (an exit that starts on it, a slow push): what must not happen is a step —
      // the move across the cut far larger than the frame-to-frame move on either side of it
      const ctr = (x) => [(x.l + x.r) / 2 * k, (x.t + x.b) / 2 * k], sz = (x) => [(x.r - x.l), (x.b - x.t)];
      const step = (p, q) => (p && q ? Math.hypot(ctr(q)[0] - ctr(p)[0], ctr(q)[1] - ctr(p)[1]) : 0);
      const grow = (p, q) => (p && q ? Math.max(Math.abs(sz(q)[0] / sz(p)[0] - 1), Math.abs(sz(q)[1] / sz(p)[1] - 1)) : 0);
      for (const [key, a] of A) {
        const b = B.get(key); if (!b) continue;
        if (!B1.has(key) || !A2.has(key)) {   // appears or vanishes right next to the cut: no neighbour to compare with
          if (step(a, b) > 12) issues.push(['WARN', `${key.slice(0, 70)} moves ${step(a, b).toFixed(0)} px on the cut and is gone a frame ${B1.has(key) ? 'before' : 'after'}: an exit this fast reads as a jump (exit ≈ 0.14 s)`]);
          continue;
        }
        const jump = step(a, b) - Math.max(step(A2.get(key), a), step(b, B1.get(key)));
        const scale = grow(a, b) - Math.max(grow(A2.get(key), a), grow(b, B1.get(key)));
        if (jump > 12 || scale > 0.05) issues.push(['PROBLEM', `shared ${key.slice(0, 70)} steps ${step(a, b).toFixed(0)} px / ${(grow(a, b) * 100).toFixed(0)} % across the cut (neighbouring frames move ${(step(a, b) - jump).toFixed(0)} px)`]);
      }
      out.push({ t: +c.toFixed(3), motion_out: +eOut.toFixed(2), motion_in: +eIn.toFixed(2), shared: [...A.keys()].filter((x) => B.has(x)).length, issues });
      for (const [lvl, msg] of issues) console.log(`${lvl.padEnd(7)} ${fmt} cut ${c.toFixed(3)}s  ${msg}`);
    }
    mkdir(path.join(ROOT, 'review'));
    fs.writeFileSync(path.join(ROOT, `review/seams_${fmt}.json`), JSON.stringify(out, null, 1));
    const nP = out.reduce((s, x) => s + x.issues.filter((i) => i[0] === 'PROBLEM').length, 0);
    console.log(out.length ? `seams ${fmt}: ${out.length} hard cuts, ${out.reduce((s, x) => s + x.shared, 0)} shared carriers compared · ${nP} PROBLEM → review/seams_${fmt}.json`
      : `NOT CHECKED ${fmt}: no hard cuts (scenes with pre > 0 are transitions, judged on strips)`);
    if (nP) process.exitCode = 1;
  } else if (has('verify')) {
    // determinism: every probe time must paint identical pixels cold and after seeking elsewhere (in any order)
    const probes = Array.from({ length: 12 }, (_, i) => +((i + 0.37) * F.DUR / 12).toFixed(3));
    const cold = [];
    for (const t of probes) cold.push(decodePNG(await F.png(t)));
    let bad = 0;
    for (let k = probes.length - 1; k >= 0; k--) {
      await F.png(probes[(k * 7 + 3) % probes.length]);                // disturb: seek somewhere else first
      const again = decodePNG(await F.png(probes[k]));
      let d = 0; for (let q = 0; q < again.length; q += 13) d = Math.max(d, Math.abs(again[q] - cold[k][q]));
      if (d > 2) { bad++; console.log(`NOT DETERMINISTIC at t=${probes[k]}s (max pixel diff ${d})`); }
    }
    console.log(bad ? `${bad}/${probes.length} probes differ — state is leaking between frames` : `deterministic: ${probes.length}/${probes.length} probes identical (${fmt})`);
    if (bad) process.exitCode = 1;
  } else if (has('at')) {
    const dir = path.join(ROOT, 'review/stills', fmt); mkdir(dir);
    for (const a of String(opt('at', '0')).split(',')) {
      const [, mk, off] = a.match(/^(.*?)([+-]\d*\.?\d+)?$/);                // seconds, a mark, or mark±seconds
      const t = isNaN(+a) ? await F.page.evaluate((m) => C.bt(m), mk) + +(off || 0) : +a;
      const f = path.join(dir, `t${t.toFixed(3)}.png`); fs.writeFileSync(f, await F.png(t)); console.log('wrote', path.relative(ROOT, f));
    }
  } else {
    await renderVideo(F, fmt, t0);
  }
  await F.page.close();
}
await browser.close(); server.close();
if (has('frames')) {
  // board: one row per styleframe, every format side by side at the same height, labelled
  const SF = TL.styleframes, RH = 540, rows = [];
  const tmp = path.join(ROOT, 'review/styleframes/.rows'); mkdir(tmp);
  for (let i = 0; i < SF.length; i++) {
    const ins = FORMATS.flatMap((f) => ['-i', path.join(ROOT, 'review/styleframes', f, `f${i}.png`)]);
    const name = String(typeof SF[i] === 'object' ? SF[i].name ?? SF[i].at : SF[i]).replace(/[':\\]/g, ' ');
    const pads = FORMATS.map((_, k) => `[${k}:v]scale=-2:${RH}:flags=lanczos,pad=iw+12:ih:0:0:color=0x202020[p${k}]`).join(';');
    const lab = `drawtext=text='${i + 1}. ${name}':x=10:y=10:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`;
    const out = path.join(tmp, `r${i}.png`);
    const graph = (l) => `${pads};${FORMATS.map((_, k) => `[p${k}]`).join('')}hstack=inputs=${FORMATS.length}${l ? ',' + l : ''}`;
    const args = (l) => ['-y', '-loglevel', 'error', ...ins, '-filter_complex', FORMATS.length > 1 ? graph(l) : `[0:v]scale=-2:${RH}${l ? ',' + l : ''}`, '-frames:v', '1', out];
    if (spawnSync('ffmpeg', args(lab)).status) run('ffmpeg', args(''));
    rows.push(out);
  }
  const board = path.join(ROOT, 'review/styleframes/board.jpg');
  run('ffmpeg', ['-y', '-loglevel', 'error', ...rows.flatMap((r) => ['-i', r]), '-filter_complex', rows.length > 1
    ? `${rows.map((_, k) => `[${k}:v]pad=iw:ih+12:0:0:color=0x202020[r${k}]`).join(';')};${rows.map((_, k) => `[r${k}]`).join('')}vstack=inputs=${rows.length}`
    : '[0:v]null', '-q:v', '3', board]);
  fs.rmSync(tmp, { recursive: true });
  fs.writeFileSync(board.replace(/\.jpg$/, '.txt'), SF.map((f, i) => `${i + 1}. ${typeof f === 'object' ? f.name ?? f.at : f}`).join('\n') + `\nformats left to right: ${FORMATS.join(', ')}\n`);
  console.log('wrote', path.relative(ROOT, board), `(${SF.length} styleframes × ${FORMATS.join(', ')}) — give it to a fresh critic: CRITIQUE.md, no motion`);
}
}

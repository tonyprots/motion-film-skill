// Review player: the film in a browser with a scene timeline, sound, click-to-note and live knobs. Run from the project root.
//
//   node scripts/player.mjs [--port 4173] [--fmt 9x16] [--open]     serve http://127.0.0.1:<port>/ until Ctrl+C
//   node scripts/player.mjs --selftest [--shot review/player.png]    headless check: open the player, click an element,
//                                                                    save a note, change the palette, screenshot, exit 0/1
//
// The page (film/player.html + film/lib/player.js, from engine/ if the project predates them) loads film/index.html in an
// iframe and drives window.seek(t). Paused, a click on the frame picks an element; the note keeps t, scene, the nearest
// mark and the element's address. Notes are appended to docs/notes.json in the notes.py format (n, t, text, open, at,
// plus el / scene / mark / fmt / vo / kind). Knobs (palette, faces, text) change the preview only and become notes.
// Localhost only: binds 127.0.0.1, refuses other Host headers and cross-origin POSTs. No dependencies beyond node;
// --selftest uses the project's Playwright (node_modules → the shared toolchain).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const has = (k) => argv.includes(`--${k}`);
const KNOWN = ['port', 'fmt', 'open', 'selftest', 'shot', 'help'];
const bad = argv.filter((a) => a.startsWith('--') && !KNOWN.includes(a.slice(2)));
if (bad.length || has('help')) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(0, 12).map((l) => l.slice(3)).join('\n'));
  process.exit(bad.length ? 1 : 0);
}
for (const f of ['timeline.json', 'film/index.html', 'film/data.js']) {
  if (!fs.existsSync(path.join(ROOT, f))) { console.error(`no ${f} here: run from the project root (after init.sh and node scripts/sync.mjs)`); process.exit(1); }
}
const TL = JSON.parse(fs.readFileSync(path.join(ROOT, 'timeline.json'), 'utf8'));

// The player files: the project's copy (init.sh puts them in film/), else the skill's engine/ (older projects).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const skillDirs = [path.join(HERE, '..', 'engine')];
const ptr = path.join(ROOT, 'scripts/providers/.skill');
if (fs.existsSync(ptr)) skillDirs.push(path.join(fs.readFileSync(ptr, 'utf8').trim(), 'engine'));
const PLAYER_FILES = { '/film/player.html': 'player.html', '/film/lib/player.js': 'lib/player.js' };
function playerFile(url) {
  const own = path.join(ROOT, url);
  if (fs.existsSync(own)) return own;
  for (const d of skillDirs) { const f = path.join(d, PLAYER_FILES[url]); if (fs.existsSync(f)) return f; }
  return null;
}

// ------------------------------------------------------------------ notes (same file and fields as scripts/notes.py)
const NOTES = path.join(ROOT, 'docs/notes.json');
const readNotes = () => (fs.existsSync(NOTES) ? JSON.parse(fs.readFileSync(NOTES, 'utf8')) : []);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function addNote(o) {
  const text = typeof o.text === 'string' ? o.text.trim() : '';
  const t = Number(o.t);
  if (!text || text.length > 4000) throw new Error('text: 1–4000 characters');
  if (!Number.isFinite(t) || t < 0 || t > 36000) throw new Error('t: seconds');
  const str = (v, n = 1000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
  const N = readNotes();
  const note = { n: N.length + 1, t: +t.toFixed(3), text, open: true, at: today() };
  for (const k of ['el', 'scene', 'mark', 'fmt', 'vo', 'kind']) { const v = str(o[k]); if (v) note[k] = v; }
  note.src = 'player';
  N.push(note);
  fs.mkdirSync(path.dirname(NOTES), { recursive: true });
  const tmp = NOTES + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(N, null, 1));
  fs.renameSync(tmp, NOTES);
  console.log(`note ${note.n} at ${t.toFixed(2)}s${note.el ? ` [${note.el}]` : ''}: ${text}`);
  return note;
}

// ------------------------------------------------------------------ server
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const AUDIO = ['audio/mix.wav', 'audio/vo.wav'].find((f) => fs.existsSync(path.join(ROOT, f))) || null;
let PORT = Number(opt('port', has('selftest') ? 0 : 4173));
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

function sendFile(req, res, f) {
  const size = fs.statSync(f).size, type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  // Range requests: <audio> can only seek (currentTime) in a file served with byte ranges
  if (m) {
    const a = m[1] ? +m[1] : size - +m[2], b = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (a > b || a >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    return fs.createReadStream(f, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}

const server = http.createServer((req, res) => {
  const port = server.address().port;
  const okHost = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!okHost.includes(req.headers.host)) { res.writeHead(403); return res.end('localhost only'); }   // DNS rebinding
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/' || url === '/player') { res.writeHead(302, { Location: `/film/player.html${opt('fmt') ? '?fmt=' + opt('fmt') : ''}` }); return res.end(); }
  if (url === '/api/info') return json(res, 200, { title: TL.title || '', formats: TL.formats || [], audio: AUDIO ? '/' + AUDIO : null, project: path.basename(ROOT) });
  if (url === '/api/notes' && req.method === 'GET') return json(res, 200, readNotes());
  if (url === '/api/notes' && req.method === 'POST') {
    const origin = req.headers.origin;
    if (origin && !okHost.map((h) => 'http://' + h).includes(origin)) return json(res, 403, { error: 'cross-origin' });
    if (!/^application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'application/json only' });
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 65536) req.destroy(); });
    req.on('end', () => { try { json(res, 200, addNote(JSON.parse(body))); } catch (e) { json(res, 400, { error: e.message }); } });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  const f = PLAYER_FILES[url] ? playerFile(url) : path.join(ROOT, url);
  if (!f || (!PLAYER_FILES[url] && !f.startsWith(ROOT + path.sep)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end();
  }
  sendFile(req, res, f);
});
await new Promise((r, j) => { server.once('error', j); server.listen(PORT, '127.0.0.1', r); }).catch((e) => {
  console.error(e.code === 'EADDRINUSE' ? `port ${PORT} is busy: pass --port <another>` : e.message); process.exit(1);
});
PORT = server.address().port;
const URL0 = `http://127.0.0.1:${PORT}/film/player.html${opt('fmt') ? '?fmt=' + opt('fmt') : ''}`;

if (!has('selftest')) {
  console.log(`player: ${URL0}\n  notes → ${path.relative(ROOT, NOTES)} · sound: ${AUDIO || 'none (no audio/mix.wav yet)'}\n  Ctrl+C to stop`);
  if (has('open')) spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [URL0], { stdio: 'ignore', detached: true }).unref();
} else {
  process.exitCode = await selftest();
  server.close(); process.exit(process.exitCode);
}

// ------------------------------------------------------------------ --selftest
async function selftest() {
  const require = createRequire(path.join(ROOT, 'package.json'));
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { console.error('selftest: playwright not found from this project (node_modules)'); return 1; }
  const shot = path.resolve(ROOT, opt('shot', 'review/player.png'));
  const before = fs.existsSync(NOTES) ? fs.readFileSync(NOTES) : null;
  const fails = [];
  const check = (ok, what, extra = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${what}${extra ? ' — ' + extra : ''}`); if (!ok) fails.push(what); };
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'ru-RU' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${PORT}` });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => check(false, 'page error', e.message));
    fs.mkdirSync(path.dirname(shot), { recursive: true });
    await page.goto(URL0);
    await page.waitForFunction(() => window.PLAYER && window.PLAYER.ready, null, { timeout: 60000 });
    const info = await page.evaluate(() => ({ dur: PLAYER.S.dur, scenes: PLAYER.S.scenes.length, marks: PLAYER.S.marks.length, server: PLAYER.S.server, fmt: PLAYER.S.fmt }));
    check(info.server, 'player talks to the server');
    check(info.scenes > 0 && info.marks > 0, 'timeline built', `${info.scenes} scenes, ${info.marks} marks, ${info.dur.toFixed(2)} s, ${info.fmt}`);

    // a frame with a visible text element, preferably one in the accent colour (the palette check needs it)
    const target = await page.evaluate(() => {
      const { S } = PLAYER, f = S.w, accent = f.getComputedStyle(S.doc.documentElement).getPropertyValue('--accent').trim();
      const probe = S.doc.createElement('i'); probe.style.color = accent; S.doc.body.append(probe);
      const acc = f.getComputedStyle(probe).color; probe.remove();
      let first = null;
      for (let t = 0.25; t < S.dur; t += 0.25) {
        PLAYER.seek(t);
        const els = [...S.doc.querySelectorAll('#stage *')].filter((e) => {
          if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || e.children.length) return false;
          const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8 || r.left < 0 || r.top < 0 || r.right > S.W || r.bottom > S.H) return false;
          const hit = PLAYER.pickAt(r.left + r.width / 2, r.top + r.height / 2);
          return hit === e;
        });
        const a = els.find((e) => f.getComputedStyle(e).color === acc);
        const pick = a || els[0];
        if (pick) {
          const r = pick.getBoundingClientRect();
          const c = { t, x: r.left + r.width / 2, y: r.top + r.height / 2, text: pick.textContent.trim(), accent: !!a };
          if (a) return c; first = first || c;
        }
      }
      return first;
    });
    check(!!target, 'found a text element in frame', target ? `«${target.text}» at t=${target.t}${target.accent ? ', accent colour' : ''}` : '');
    if (!target) return 1;

    // click it through the scaled iframe, like a person would
    await page.evaluate((t) => { PLAYER.pause(); PLAYER.seek(t); }, target.t);
    const box = await page.locator('#film').boundingBox();
    const k = await page.evaluate(() => PLAYER.S.k);
    await page.mouse.click(box.x + target.x * k, box.y + target.y * k);
    const sel = await page.evaluate(() => PLAYER.S.sel && { text: PLAYER.S.sel.text, addr: PLAYER.S.sel.addr, scene: PLAYER.S.sel.scene });
    check(!!sel && sel.text === target.text, 'click picks the element', sel ? sel.addr : 'nothing picked');

    const noteText = 'selftest: акцент слишком яркий на этом слове';
    await page.fill('#notetext', noteText);
    await page.click('#savenote');
    await page.waitForFunction(() => /\d/.test(document.querySelector('#saveinfo').textContent), null, { timeout: 5000 }).catch(() => {});
    const N = readNotes(), last = N[N.length - 1];
    check(!!last && last.text === noteText && Math.abs(last.t - target.t) < 0.01 && (last.el || '').includes(target.text) && !!last.scene && !!last.mark,
      'note written to docs/notes.json', last ? JSON.stringify(last) : 'none');

    // palette: --accent → a colour nobody uses; the picked element (or any element on --accent) must change colour
    const NEW = '#1f6feb';
    const colorOf = () => page.evaluate(() => {
      const { S } = PLAYER; return [...S.doc.querySelectorAll('#stage *')].map((e) => { const c = S.w.getComputedStyle(e); return c.color + '|' + c.backgroundColor; });
    });
    const c0 = await colorOf();
    const row = page.locator('.swatch[data-var="--accent"] input[type=text]');
    check(await row.count() === 1, 'palette lists --accent');
    await row.fill(NEW); await row.dispatchEvent('change');
    const c1 = await colorOf();
    const changed = c1.filter((c, i) => c !== c0[i]).length;
    const rootVar = await page.evaluate(() => PLAYER.S.w.getComputedStyle(PLAYER.S.doc.documentElement).getPropertyValue('--accent').trim());
    const selColor = await page.evaluate(() => PLAYER.S.sel && PLAYER.S.w.getComputedStyle(PLAYER.S.sel.el).color);
    check(rootVar === NEW && changed > 0, 'palette knob changes computed colours live', `--accent = ${rootVar}, ${changed} elements changed${target.accent ? `, picked element now ${selColor}` : ''}`);
    if (target.accent) check(selColor === 'rgb(31, 111, 235)', 'picked accent element repainted');

    // a text edit on the picked element, previewed, then every knob change written as a note
    const editable = await page.locator('#edittext').isEnabled();
    if (editable) { await page.fill('#edittext', target.text + '!'); await page.click('#applytext'); }
    const shown = await page.evaluate(() => PLAYER.S.sel && PLAYER.S.sel.el.textContent);
    check(!editable || shown === target.text + '!', 'text knob previews the edit', editable ? `«${shown}»` : 'element not editable');
    const n0 = readNotes().length;
    await page.click('#savetweaks');
    await page.waitForFunction((n) => PLAYER.S.notes.length > n, n0, { timeout: 5000 }).catch(() => {});
    const tw = readNotes().slice(n0);
    check(tw.some((x) => x.kind === 'tweak' && x.text.includes('--accent') && x.text.includes(NEW)), 'palette change written as a note', tw.map((x) => x.text).join(' | '));

    // scrub: a click on the middle of the timeline seeks there
    const tl = await page.locator('#tl').boundingBox();
    await page.mouse.click(tl.x + tl.width / 2, tl.y + tl.height / 2);
    const tm = await page.evaluate(() => PLAYER.S.t / PLAYER.S.dur);
    check(Math.abs(tm - 0.5) < 0.02, 'timeline click seeks', `at ${(tm * 100).toFixed(1)} %`);
    await page.evaluate((t) => PLAYER.seek(t), target.t);
    await page.mouse.click(box.x + target.x * k, box.y + target.y * k);   // pick again for the screenshot

    // "Copy for Claude"
    await page.click('#copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => document.querySelector('#clip').value));
    check(clip.includes(noteText) && clip.includes('t='), 'copy for Claude collects the notes', `${clip.split('\n').length} lines`);

    // 9:16 still loads
    const fmts = info.fmt && (TL.formats || []).filter((f) => f !== info.fmt);
    if (fmts && fmts.length) {
      await page.evaluate((f) => [...document.querySelectorAll('#fmts button')].find((b) => b.textContent === f.replace('x', ':')).click(), fmts[0]);
      await page.waitForFunction((f) => PLAYER.S.fmt === f && PLAYER.S.C && PLAYER.S.C.FMT === f, fmts[0], { timeout: 30000 }).catch(() => {});
      const alt = await page.evaluate(() => ({ fmt: PLAYER.S.fmt, accent: PLAYER.S.w.getComputedStyle(PLAYER.S.doc.documentElement).getPropertyValue('--accent').trim() }));
      check(alt.fmt === fmts[0] && alt.accent === NEW, `switches to ${fmts[0]} and keeps the knobs`, JSON.stringify(alt));
      const alt_shot = shot.replace(/(\.png)?$/, `_${fmts[0]}.png`);
      await page.waitForTimeout(200); await page.screenshot({ path: alt_shot }); console.log(`screenshot: ${alt_shot}`);
      await page.evaluate((f) => [...document.querySelectorAll('#fmts button')].find((b) => b.textContent === f.replace('x', ':')).click(), info.fmt);
      await page.waitForFunction((f) => PLAYER.S.C && PLAYER.S.C.FMT === f && PLAYER.S.ready, info.fmt, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(300);
      await page.evaluate((t) => PLAYER.seek(t), target.t);
      await page.mouse.click(box.x + target.x * k, box.y + target.y * k);
    }

    await page.screenshot({ path: shot });
    console.log(`screenshot: ${shot}`);
  } catch (e) {
    check(false, 'selftest crashed', e.stack || e.message);
  } finally {
    await browser.close();
    // the selftest's notes are not the user's: restore docs/notes.json as it was
    if (before) fs.writeFileSync(NOTES, before); else if (fs.existsSync(NOTES)) fs.rmSync(NOTES);
    console.log('docs/notes.json restored');
  }
  console.log(fails.length ? `PLAYER SELFTEST FAILED: ${fails.join('; ')}` : 'PLAYER SELFTEST OK');
  return fails.length ? 1 : 0;
}

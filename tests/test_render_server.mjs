// The local servers (render.mjs for headless Chromium, player.mjs for review) hand out the film and nothing else.
// Both take their file policy from scripts/static_files.mjs; this runs it on a throwaway project:
//   node tests/test_render_server.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const scripts = path.join(path.dirname(fileURLToPath(import.meta.url)), '../scripts');
const { filmFile, hostOk } = await import(path.join(scripts, 'static_files.mjs'));

// Both servers must route project files through the shared policy, not a check of their own.
for (const s of ['render.mjs', 'player.mjs']) {
  const src = fs.readFileSync(path.join(scripts, s), 'utf8');
  const must = (re, what) => assert.ok(re.test(src), `${s}: ${what}`);
  must(/from '\.\/static_files\.mjs'/, 'imports static_files.mjs');
  must(/filmFile\(ROOT, req\.url\)/, 'serves project files through filmFile');
  must(/hostOk\(req, /, 'checks the Host header');
  assert.ok(!/path\.join\(ROOT, (url|decodeURIComponent)/.test(src), `${s}: builds a file path from the URL by hand`);
}

const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mf-server-')));
const ROOT = path.join(base, 'film'), shared = path.join(base, 'cache-node_modules');
const put = (p, s = 'x') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
put(path.join(ROOT, 'film/index.html'), 'FILM');
put(path.join(ROOT, 'assets/fonts/display.woff2'));
put(path.join(ROOT, 'assets/data.json'), 'DATA');
put(path.join(ROOT, '.env'), 'SECRET');
put(path.join(ROOT, '.git/config'), 'SECRET');
put(path.join(ROOT, '.private/secret.json'), 'SECRET');
put(path.join(ROOT, 'notes.txt'), 'SECRET');
put(path.join(base, 'film-private/marker.html'), 'SECRET');
put(path.join(base, 'outside.js'), 'SECRET');
put(path.join(shared, 'three/build/three.module.js'), 'THREE');
put(path.join(shared, '.cache/x.js'), 'SECRET');
fs.symlinkSync(shared, path.join(ROOT, 'node_modules'));
fs.symlinkSync(path.join(base, 'outside.js'), path.join(ROOT, 'film/escape.js'));
fs.symlinkSync(path.join(ROOT, '.private/secret.json'), path.join(ROOT, 'film/alias.json'));   // inside, onto a hidden file
fs.symlinkSync(path.join(ROOT, 'assets/data.json'), path.join(ROOT, 'film/data-link.json'));   // inside, onto a plain file
fs.symlinkSync(path.join(shared, '.cache/x.js'), path.join(ROOT, 'film/cache.js'));

const read = (url) => { const f = filmFile(ROOT, url); return f && fs.readFileSync(f, 'utf8'); };
const served = [['/film/index.html', 'FILM'], ['/film/index.html?fmt=16x9', 'FILM'], ['/node_modules/three/build/three.module.js', 'THREE'],
  ['/assets/data.json', 'DATA'], ['/film/data-link.json', 'DATA'], ['/assets/fonts/display.woff2', 'x']];
for (const [url, body] of served) assert.equal(read(url), body, url);
const refused = ['/.env', '/.git/config', '/.private/secret.json', '/notes.txt', '/film', '/', '/film/escape.js', '/%E0%A4%A',
  '/film/alias.json', '/film/cache.js', '/node_modules/.cache/x.js', '/../film-private/marker.html',
  '/..%2Ffilm-private%2Fmarker.html', '/film/..%5C..%5Coutside.js', '/film/index.html%00.png'];
for (const url of refused) assert.equal(filmFile(ROOT, url), null, url);

const req = (host) => ({ headers: host === undefined ? {} : { host } });
assert.ok(hostOk(req('127.0.0.1:4321'), 4321) && hostOk(req('localhost:4321'), 4321));
for (const h of ['evil.example:4321', '127.0.0.1:80', undefined]) assert.ok(!hostOk(req(h), 4321), String(h));

fs.rmSync(base, { recursive: true, force: true });
console.log(`local servers: ${served.length} served, ${refused.length} refused, Host check, both servers on the shared policy`);

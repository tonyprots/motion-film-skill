// The render's static server hands Chromium the film and nothing else. Runs the real handler from render.mjs on a
// throwaway project: node tests/test_render_server.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Writable } from 'node:stream';

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../scripts/render.mjs'), 'utf8');
const start = src.indexOf('const MIME = {'), end = src.indexOf('\nawait new Promise', start);
assert.ok(start > 0 && end > start, 'server block not found in render.mjs');

const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mf-server-')));
const ROOT = path.join(base, 'film'), shared = path.join(base, 'cache-node_modules');
const put = (p, s = 'x') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
put(path.join(ROOT, 'film/index.html'), 'FILM');
put(path.join(ROOT, 'assets/fonts/display.woff2'));
put(path.join(ROOT, '.env'), 'SECRET');
put(path.join(ROOT, '.git/config'), 'SECRET');
put(path.join(ROOT, 'notes.txt'), 'SECRET');
put(path.join(base, 'film-private/marker.html'), 'SECRET');
put(path.join(base, 'outside.js'), 'SECRET');
put(path.join(shared, 'three/build/three.module.js'), 'THREE');
fs.symlinkSync(shared, path.join(ROOT, 'node_modules'));
fs.symlinkSync(path.join(base, 'outside.js'), path.join(ROOT, 'film/escape.js'));

const PORT = 4321;
const http = { createServer: (fn) => Object.assign(fn, { address: () => ({ port: PORT }) }) };
const server = new Function('http', 'fs', 'path', 'ROOT', src.slice(start, end) + '\nreturn server;')(http, fs, path, ROOT);
const get = (url, host = `127.0.0.1:${PORT}`, method = 'GET') => new Promise((resolve) => {
  let body = '', status;
  const res = new Writable({ write(c, _e, next) { body += c; next(); } });
  res.writeHead = (code) => { status = code; };
  res.on('finish', () => resolve({ status, body }));
  server({ url, method, headers: host === null ? {} : { host } }, res);
});

const ok = [['/film/index.html', 'FILM'], ['/film/index.html?fmt=16x9', 'FILM'], ['/node_modules/three/build/three.module.js', 'THREE']];
for (const [url, body] of ok) assert.deepEqual(await get(url), { status: 200, body }, url);
assert.equal((await get('/assets/fonts/display.woff2', `localhost:${PORT}`)).status, 200);
const denied = [
  ['/.env'], ['/.git/config'], ['/notes.txt'], ['/film'], ['/film/escape.js'], ['/%E0%A4%A'],
  ['/../film-private/marker.html'], ['/..%2Ffilm-private%2Fmarker.html'], ['/film/..%5C..%5Coutside.js'],
  ['/film/index.html', 'evil.example:4321'], ['/film/index.html', null], ['/film/index.html', `127.0.0.1:${PORT}`, 'POST'],
];
for (const [url, host, method] of denied) {
  const r = await get(url, host, method);
  assert.equal(r.status, 404, `${url} ${host ?? ''} ${method ?? ''}`);
  assert.ok(!r.body.includes('SECRET'), url);
}
fs.rmSync(base, { recursive: true, force: true });
console.log(`render server: ${ok.length + 1} served, ${denied.length} refused`);

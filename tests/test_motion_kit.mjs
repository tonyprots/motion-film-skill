// Motion-kit port in core.js and type.js: uneven cascade, curves by name, duration from distance, accelerating exits.
//   node tests/test_motion_kit.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-kit-port-')), root = path.join(out, 'project');
const init = spawnSync('sh', [path.join(skill, 'scripts/init.sh'), root, '--preset', 'blank'], { encoding: 'utf8', timeout: 120000 });
assert.equal(init.status, 0, init.stdout + init.stderr);
const data = (motion) => `window.TL={duration:4,fps:60,bpm:60,formats:['16x9'],marks:{a:0},motion:${JSON.stringify(motion)}};window.BEATS={};window.VO=[];window.UI={};window.SVG_ASSETS={};`;
fs.writeFileSync(path.join(root, 'film/film.js'), `C.start();`);
const require = createRequire(path.join(root, 'package.json')), { chromium } = require('playwright');
const server = http.createServer((req, res) => {
  const f = path.resolve(root, '.' + req.url.split('?')[0]);
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
};
async function open(motion) {
  fs.writeFileSync(path.join(root, 'film/data.js'), data(motion));
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/film/index.html?fmt=16x9`);
  await page.evaluate(() => window.READY);
  return page;
}
try {
  let page = await open({ stagger: 0.05 });
  await check('cascade: lead, then uneven reactions that grow (0, 0.8, 1.8, 3, 4.4, 6 steps)', async () => {
    const d = await page.evaluate(() => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => C.stagger(i)));
    const steps = d.slice(1).map((x, i) => x - d[i]);
    assert.equal(d[0], 0);
    assert.ok(Math.abs(d[5] - 0.3) < 1e-9, `6th element at ${d[5]}`);
    assert.ok(steps.slice(0, 5).every((s, i) => i === 0 || s > steps[i - 1]), `steps ${steps}`);
    assert.ok(d[7] <= 0.6 + 1e-9, `wave of 8 ends at ${d[7]} s, rule ≤ 0.6`);
  });
  await check('curves: endpoints, kit.leave accelerates, kit.land decelerates, unknown name throws', async () => {
    const r = await page.evaluate(() => {
      const L = C.curve('kit.leave'), D = C.curve('kit.land');
      let threw = false; try { C.curve('power3.out'); } catch { threw = true; }
      const mono = Array.from({ length: 101 }, (_, k) => L(k / 100)).every((v, k, a) => k === 0 || v >= a[k - 1] - 1e-9);
      return { l0: L(0), l1: L(1), lMid: L(0.5), dMid: D(0.5), threw, mono, same: C.ease.leave(0.3) === L(0.3) };
    });
    assert.equal(r.l0, 0); assert.equal(r.l1, 1);
    assert.ok(r.lMid < 0.25, `leave(0.5) = ${r.lMid}`);
    assert.ok(r.dMid > 0.85, `land(0.5) = ${r.dMid}`);
    assert.ok(r.threw && r.mono && r.same);
  });
  await check('bez matches CSS: ease (0.25, 0.1, 0.25, 1) at x = 0.5 ≈ 0.8024', async () => {
    const v = await page.evaluate(() => C.bez(0.25, 0.1, 0.25, 1)(0.5));
    assert.ok(Math.abs(v - 0.8024) < 1e-3, `${v}`);
  });
  await check('byDist: a full-frame move takes longer than a chip, heavy longer than light, damping kept', async () => {
    const r = await page.evaluate(() => {
      const chip = C.byDist(40, 'enter'), panel = C.byDist(1600, 'enter'), heavy = C.byDist(300, 'default', 1.35), light = C.byDist(300, 'default', 0.7);
      return { chip: Motion.settle(chip), panel: Motion.settle(panel), heavy: heavy.response, light: light.response,
        ref: C.byDist(300, 'default').response, base: Motion.resolve('default').response, z: panel.damping, zBase: Motion.resolve('enter').damping };
    });
    assert.ok(r.panel > 1.7 * r.chip, `panel ${r.panel} vs chip ${r.chip}`);
    assert.ok(r.heavy > r.light && Math.abs(r.ref - r.base) < 1e-9 && r.z === r.zBase);
  });
  await check('TYPE.rise: words cascade unevenly, exit accelerates and is gone by outAt + exit/2', async () => {
    const r = await page.evaluate(() => {
      const L = { size: 100, words: [0, 1, 2, 3].map((i) => ({ i })) }, ys = {}, put0 = C.put;
      C.put = (w, p) => { ys[w.i] = p.y; };
      const at = (t) => { TYPE.rise(t, L, 0, 2, { stagger: 0.1 }); return [0, 1, 2, 3].map((i) => ys[i]); };
      const firstMove = (i) => { for (let t = -0.3; t < 1; t += 1 / 600) if (at(t)[i] < 144.9) return t; return null; };
      const starts = [0, 1, 2, 3].map(firstMove);
      const exitA = at(2 - 0.14 + 0.07)[0], exitB = at(2 - 0.14 + 0.21)[0];   // a quarter and three quarters of word 0's exit
      const gone = at(2 + 0.14 + 0.15 + 1e-3);
      C.put = put0;
      return { starts, exitA, exitB, gone };
    });
    const gaps = r.starts.slice(1).map((x, i) => x - r.starts[i]);
    assert.ok(gaps[1] > gaps[0] + 0.01 && gaps[2] > gaps[1] + 0.01, `gaps ${gaps}`);
    assert.ok(r.exitA > -145 * 0.25, `slow at the start of the exit: ${r.exitA}`);
    assert.ok(r.exitB < -145 * 0.25 && r.exitB / r.exitA > 4, `accelerates: ${r.exitA} → ${r.exitB}`);
    assert.ok(r.gone.every((y) => y <= -145 + 1e-6), `all gone: ${r.gone}`);
  });
  await page.close();
  page = await open({ stagger: 0.05, cascade: 'even' });
  await check('"cascade": "even" restores the mechanical line', async () => {
    const d = await page.evaluate(() => [0, 1, 2, 3, 4].map((i) => C.stagger(i)));
    d.forEach((x, i) => assert.ok(Math.abs(x - 0.05 * i) < 1e-12, `${d}`));
  });
  await page.close();
} finally { await browser.close(); await new Promise((r) => server.close(r)); }
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ passed: results.filter((x) => x.ok).length, total: results.length, evidence: out, results }, null, 2));
if (results.some((x) => !x.ok)) process.exitCode = 1;

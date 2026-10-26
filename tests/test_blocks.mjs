// Integration contracts for the native block ports, local asset discovery and the real render engine.
// No provider calls. Every request outside the fixture's local HTTP server is intercepted and aborted.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decodePNG } from '../scripts/png.mjs';
import { reviewStory } from '../scripts/story_check.mjs';

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = process.env.MOTION_BLOCKS_ARTIFACTS || os.tmpdir();
fs.mkdirSync(artifacts, { recursive: true });
const work = fs.mkdtempSync(path.join(artifacts, 'motion-blocks-')), root = path.join(work, 'project');
const results = [], runtimeRequests = [], pageErrors = [];
function run(args, expected = 0, cwd = root, command = 'node') {
  const p = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 120000 });
  assert.equal(p.status, expected, p.stdout + p.stderr);
  return p.stdout;
}
run([path.join(skill, 'scripts/init.sh'), root], 0, skill, 'sh');
const write = (name, value) => fs.writeFileSync(path.join(root, name), typeof value === 'string' ? value : JSON.stringify(value));
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.error('FAIL', name, error.message); }
}
const local = JSON.parse(fs.readFileSync(path.join(root, 'docs/catalog.json'))).items;
const icon = local.find((item) => item.status === 'asset');
await test('scaffold copies helpers, catalog and licensed local SVGs', () => {
  for (const name of ['film/lib/blocks.js', 'film/lib/graphics.js', 'scripts/scenes.mjs', 'docs/catalog.json', icon.asset]) assert.ok(fs.existsSync(path.join(root, name)), name);
  const counts = JSON.parse(run(['scripts/scenes.mjs', 'counts']));
  assert.ok(counts.native >= 10 && counts.local_svg > 0);
  const found = JSON.parse(run(['scripts/scenes.mjs', 'search', 'иконки документ', '--status', 'asset', '--limit', '2000']));
  assert.ok(found.items.some((item) => item.id.includes('file')));
  assert.ok(found.items.every((item) => item.status === 'asset'));
  assert.equal(JSON.parse(run(['scripts/scenes.mjs', 'show', icon.id])).id, icon.id);
  const copied = 'assets/copied-icon.svg';
  run(['scripts/scenes.mjs', 'copy', icon.id, '--to', copied]);
  assert.deepEqual(fs.readFileSync(path.join(root, copied)), fs.readFileSync(path.join(root, icon.asset)));
  run(['scripts/scenes.mjs', 'copy', icon.id, '--to', copied], 1);
  run(['scripts/scenes.mjs', 'show', 'missing:id'], 1);
  run(['scripts/scenes.mjs', 'list', '--limit', '0'], 1);
});

write('timeline.json', { duration: 8, fps: 60, bpm: 120, formats: ['16x9', '9x16'], marks: { change: 2, done: 16 }, sfx: [] });
run(['scripts/sync.mjs']);
const require = createRequire(path.join(root, 'package.json')), { chromium } = require('playwright');
const server = http.createServer((req, res) => {
  const name = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!name.startsWith(root + path.sep) || !fs.existsSync(name) || !fs.statSync(name).isFile()) { res.writeHead(404); return res.end(); }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  res.writeHead(200, { 'Content-Type': types[path.extname(name)] || 'application/octet-stream' });
  fs.createReadStream(name).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'] });
const boxes = async (page) => page.evaluate(() => {
  const all = [...document.querySelectorAll('[data-card]')];
  return Object.fromEntries(all.map((node) => { const b = node.getBoundingClientRect(); return [node.dataset.card, { x: b.x, y: b.y }]; }));
});
async function fixture(fmt, kind, options, keys = [[0, 0], ['change', 1]], extra = '') {
  write('film/film.js', `(() => { C.fonts=['500 40px Arial'];
    C.scene({name:'active',from:0,to:12,build(root,S){S.b=BLOCKS.mount(root,${JSON.stringify(kind)},${JSON.stringify({ ...options, id: 'tested' })});${extra}},
      run(t,b,S){S.b.draw(t,${JSON.stringify(keys)});}});
    C.scene({name:'quiet',from:12,to:'done',build(root){C.el('div',{style:'position:absolute;left:120px;top:120px;font:64px Arial'},root,'Новая сцена');}});
    C.start();})();`);
  const [width, height] = fmt === '16x9' ? [1920, 1080] : [1080, 1920];
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin + '/')) return route.continue();
    runtimeRequests.push(url); return route.abort();
  });
  await page.goto(`${origin}/film/index.html?fmt=${fmt}`);
  await page.evaluate(() => window.READY);
  return page;
}
async function seek(page, t) { await page.evaluate((time) => window.seek(time), t); }
async function determinism(page, name) {
  const probes = [0.07, 0.43, 0.95, 1.18, 1.55, 2.25, 3.8], cold = [];
  for (const t of probes) { await seek(page, t); cold.push(decodePNG(await page.screenshot())); }
  let max = 0;
  for (let i = probes.length - 1; i >= 0; i--) {
    await seek(page, probes[(i * 3 + 2) % probes.length]);
    await seek(page, probes[i]);
    const png = await page.screenshot(), again = decodePNG(png);
    let diff = 0;
    for (let k = 0; k < again.length; k += 13) diff = Math.max(diff, Math.abs(again[k] - cold[i][k]));
    max = Math.max(max, diff);
    if (diff > 2) fs.writeFileSync(path.join(work, `${name}-${i}-again.png`), png);
  }
  assert.ok(max <= 2, `backward/random seek max pixel difference ${max}`);
}
async function hiddenScene(page) {
  await seek(page, 1.18); await seek(page, 7);
  const visible = await page.evaluate(() => [...document.querySelectorAll('[data-scene="active"] *')].filter((node) => {
    const r = node.getBoundingClientRect();
    return !node.children.length && node.textContent.trim() && r.width > 0 && r.height > 0 && getComputedStyle(node).visibility === 'visible';
  }).map((node) => node.textContent));
  assert.deepEqual(visible, [], 'children of a hidden scene must not become visible');
}
try {
  for (const fmt of ['16x9', '9x16']) {
    for (const [target, decimals, expected] of [[10.6, 0, '11'], [9.999, 2, '1000']]) await test(`${fmt}: counter rounding and drum digits ${target}`, async () => {
      const page = await fixture(fmt, 'rolling-number', { label: 'Обращения', from: 0, to: target, decimals, mode: 'drum', duration: 1.1 }, [[0, 0], ['change', target]]);
      try {
        await seek(page, 4);
        const number = await page.evaluate(() => [...document.querySelectorAll('[data-digit-window]')].filter((box) => getComputedStyle(box).visibility !== 'hidden').map((box) => {
          const strip = box.firstElementChild, cell = parseFloat(getComputedStyle(box).height), y = new DOMMatrixReadOnly(getComputedStyle(strip).transform).m42;
          const row = -y / cell;
          if (Math.abs(row - Math.round(row)) > 1e-4) throw new Error('drum did not settle on a whole digit');
          return Math.round(row) % 10;
        }).join(''));
        assert.equal(number, expected);
        await determinism(page, `counter-${fmt}-${decimals}`); await hiddenScene(page);
      } finally { await page.close(); }
    });
    const cards = [{ id: 'x', title: 'X', column: 1, to: 0, at: 1 }, { id: 'y', title: 'Y', column: 1, to: 0, at: 1 },
      { id: 'z', title: 'Z', column: 1, to: 0, at: 5 }, { id: 'a', title: 'A', column: 0, to: 1, at: 3 }];
    await test(`${fmt}: simultaneous departures and later arrival leave no kanban hole`, async () => {
      const page = await fixture(fmt, 'kanban-flow', { label: 'Заявки', columns: ['Очередь', 'В работе'], cards });
      try {
        await seek(page, 4);
        const positions = await boxes(page), header = await page.locator('[data-role="count-1"]').boundingBox();
        assert.equal(Math.round(positions.a.y - header.y), 58);
        const stride = fmt === '9x16' ? 84 : 116;
        assert.equal(Math.round(positions.y.y - positions.x.y), stride);
        assert.equal(Math.round(positions.z.y - positions.y.y), stride);
        assert.equal(await page.locator('[data-role="count-0"]').textContent(), '3');
        assert.equal(await page.locator('[data-role="count-1"]').textContent(), '1');
        await determinism(page, `board-${fmt}`); await hiddenScene(page);
      } finally { await page.close(); }
    });
    await test(`${fmt}: tied maxima and zero chart values remain finite`, async () => {
      const page = await fixture(fmt, 'data-chart', { label: 'Нагрузка', data: [{ label: 'A', value: 4 }, { label: 'B', value: 4 }, { label: 'C', value: 0 }], max: 4, summary: 'total', mode: 'together' });
      try {
        await seek(page, 4);
        assert.equal(await page.locator('[data-role="value"]').textContent(), '8');
        const observed = await page.evaluate(() => ({ nan: /NaN|Infinity/.test(document.querySelector('[data-block]').outerHTML),
          accent: [...document.querySelectorAll('[data-block] svg rect')].filter((node) => node.getAttribute('fill') === 'var(--accent)').length,
          heights: [...document.querySelectorAll('[data-block] svg rect')].map((node) => Number(node.getAttribute('height'))) }));
        assert.equal(observed.nan, false); assert.equal(observed.accent, 1); assert.deepEqual(observed.heights, [240, 240, 0]);
        await determinism(page, `chart-${fmt}`); await hiddenScene(page);
      } finally { await page.close(); }
    });
    await test(`${fmt}: text comparison cut has observable endpoint and deterministic frames`, async () => {
      const page = await fixture(fmt, 'before-after', { label: 'Процесс', before: 'Собрать три файла', after: 'Проверить сводку', beforeLabel: 'До', afterLabel: 'После', mode: 'cut' });
      try {
        await seek(page, 0.2); assert.equal(await page.locator('[data-role="value"]').textContent(), 'До');
        await seek(page, 4); assert.equal(await page.locator('[data-role="value"]').textContent(), 'После');
        await determinism(page, `wipe-${fmt}`); await hiddenScene(page);
      } finally { await page.close(); }
    });
    await test(`${fmt}: local image wipe has deterministic frames and changes the picture`, async () => {
      const assets = local.filter((item) => item.status === 'asset');
      const page = await fixture(fmt, 'before-after', { label: 'Изменение', beforeSrc: `../${assets[0].asset}`,
        afterSrc: `../${assets[1].asset}`, beforeLabel: 'До', afterLabel: 'После', mode: 'wipe' });
      try {
        await seek(page, 0.2); const before = await page.screenshot();
        await seek(page, 4); const after = await page.screenshot();
        assert.equal(await page.locator('[data-role="value"]').textContent(), 'После');
        assert.equal(before.equals(after), false);
        assert.ok(await page.evaluate(() => [...document.querySelectorAll('[data-block] img')].every((image) => image.complete && image.naturalWidth > 0)));
        await determinism(page, `media-wipe-${fmt}`); await hiddenScene(page);
      } finally { await page.close(); }
    });
    await test(`${fmt}: local icons render without external requests`, async () => {
      const page = await fixture(fmt, 'rolling-number', { from: 0, to: 1, mode: 'spring' }, [[0, 0], ['change', 1]],
        `GRAPHICS.icon(root,${JSON.stringify(icon.runtime_id)},{x:100,y:100,size:100});`);
      try {
        await seek(page, 2);
        assert.ok(await page.locator('[data-icon] svg').isVisible());
        assert.ok(await page.evaluate((id) => GRAPHICS.ids().includes(id), icon.runtime_id));
        await determinism(page, `icons-${fmt}`); await hiddenScene(page);
      } finally { await page.close(); }
    });
    for (const mode of ['good', 'hidden', 'fake']) await test(`${fmt}: rendered drum digit evidence ${mode}`, async () => {
      write('audio/vo_placed.json', [{ id: 's1a', t0: 0.5, t1: 3, text: 'Обращения добавляются в очередь' }]);
      run(['scripts/sync.mjs']);
      const extra = mode === 'hidden' ? `S.b.number.style.opacity='0';` : mode === 'fake' ?
        `const draw=S.b.draw;S.b.draw=(t)=>{draw(t,[[0,0]]);S.b.root.setAttribute('data-state',t<1?'0':'11');C.put(S.b.root,{x:100+Math.sin(t*10)*40});};` : '';
      const page = await fixture(fmt, 'rolling-number', { from: 0, to: 10.6, decimals: 0, mode: 'drum', duration: 1.1 }, [[0, 0], ['change', 10.6]], extra);
      try {
        const plan = { version: 1, events: [{ id: `digits-${mode}`, phrase: 's1a', at: 'change', property: 'digits',
          region: '[data-block="tested"]', selector: '[data-role="number"]', from: '0', to: '11', action: 'accumulate',
          meaning: 'Каждое обращение увеличивает очередь', window: [-0.1, 1.6] }] };
        write('visual-events.json', plan);
        const TL = { ...JSON.parse(fs.readFileSync(path.join(root, 'timeline.json'))), visual_format: 'image-per-phrase' };
        const [W, H] = fmt === '16x9' ? [1920, 1080] : [1080, 1920];
        const previousExit = process.exitCode;
        const report = await reviewStory({ ROOT: root, TL, fmt, F: { page, W, H, FPS: 60, DUR: 8,
          png: async (t) => { await seek(page, t); return page.screenshot(); } } });
        process.exitCode = previousExit;
        assert.equal(report.status, mode === 'good' ? 'EVIDENCE' : 'FAIL', JSON.stringify(report.events));
        assert.equal(report.coverage, mode === 'good' ? 1 : 0);
        if (mode === 'good') assert.deepEqual(report.events[0].observed.map((s) => s.value), ['0', '11']);
      } finally { await page.close(); }
    });
  }
  await test('invalid values fail before NaN enters rendered DOM', async () => {
    const page = await fixture('9x16', 'rolling-number', { from: 0, to: 1, mode: 'spring' });
    try {
      const errors = await page.evaluate(() => {
        const checks = [
          ['rolling-number', { id: 'zero-c', from: 0, to: 1, duration: 0 }],
          ['data-chart', { id: 'zero-d', data: [{ value: 0 }, { value: 0 }], max: 0 }],
          ['data-chart', { id: 'nan-d', data: [{ value: NaN }, { value: 1 }] }],
          ['kanban-flow', { id: 'bad-b', columns: ['A', 'B'], cards: [{ id: 'x', title: 'X', column: 2 }] }],
        ];
        return checks.map(([kind, o]) => { try { BLOCKS.mount(C.stage, kind, o); return null; } catch (e) { return e.message; } });
      });
      assert.ok(errors.every(Boolean), JSON.stringify(errors));
      const rejected = await page.evaluate(() => { try { const b = BLOCKS.mount(C.stage, 'rolling-number', { id: 'bad-key', from: 0, to: 1, mode: 'spring' }); b.draw(1, [[0, NaN], [2, 1]]); return false; } catch { return true; } });
      assert.equal(rejected, true, 'spring counter must reject NaN animation keys');
    } finally { await page.close(); }
  });
  await test('SVG bundling rejects active CSS before any network request', () => {
    // sync walks pack directories, so keep this fixture in an existing pack.
    const folder = path.dirname(path.join(root, icon.asset)), file = path.join(folder, 'unsafe-test.svg');
    fs.writeFileSync(file, '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url("https://example.invalid/blocked.css");</style><rect width="10" height="10"/></svg>');
    const p = spawnSync('node', ['scripts/sync.mjs'], { cwd: root, encoding: 'utf8', timeout: 30000 });
    fs.renameSync(file, file + '.disabled');
    run(['scripts/sync.mjs']);
    assert.notEqual(p.status, 0, 'sync accepted an SVG stylesheet that can request external data');
  });
  await test('SVG helper rejects active CSS even when asset map is supplied directly', async () => {
    const page = await fixture('9x16', 'rolling-number', { from: 0, to: 1 });
    try {
      const rejected = await page.evaluate(() => {
        SVG_ASSETS.unsafe = '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url("https://example.invalid/blocked.css");</style><rect width="10" height="10"/></svg>';
        try { GRAPHICS.icon(C.stage, 'unsafe'); return false; } catch { return true; }
      });
      await page.screenshot();
      assert.equal(rejected, true, 'GRAPHICS.icon accepted active stylesheet');
    } finally { await page.close(); }
  });
  await test('render complete local SVG gallery as a PNG', async () => {
    const page = await fixture('16x9', 'rolling-number', { from: 0, to: 1 });
    try {
      const count = await page.evaluate(() => GRAPHICS.ids().length), cols = 12, rows = Math.ceil(count / cols);
      await page.setViewportSize({ width: 1920, height: rows * 150 + 100 });
      await page.evaluate(({ cols, rows }) => {
        C.stage.replaceChildren(); C.stage.style.height = `${rows * 150 + 100}px`;
        C.stage.style.background = '#fff'; C.stage.style.color = '#111';
        const label = (x, y, text, size) => { const node = C.el('div', { style: `position:absolute;left:${x}px;top:${y}px;font:${size}px Arial;color:#111` }, C.stage); node.textContent = text; };
        label(32, 24, `Локальные SVG · ${GRAPHICS.ids().length}`, 28);
        GRAPHICS.ids().forEach((id, i) => {
          const x = 24 + (i % cols) * 156, y = 92 + Math.floor(i / cols) * 150;
          GRAPHICS.icon(C.stage, id, { x: x + 28, y, size: 72, color: '#111' });
          label(x, y + 88, id, 12);
        });
        window.seek(0);
      }, { cols, rows });
      await page.screenshot({ path: path.join(work, 'local-icons-gallery.png'), fullPage: true });
      assert.ok(count > 0);
    } finally { await page.close(); }
  });
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
await test('normal runtime made no external request and produced no page errors', () => {
  assert.deepEqual(pageErrors, []);
  // The unsafe test may attempt its own blocked request. It must never escape the route guard.
  const unexpected = runtimeRequests.filter((url) => !url.startsWith('https://example.invalid/blocked.css'));
  assert.deepEqual(unexpected, []);
});
fs.writeFileSync(path.join(work, 'results.json'), JSON.stringify({ results, runtimeRequests, pageErrors }, null, 2));
console.log(`BLOCKS: ${results.filter((r) => r.ok).length}/${results.length} passed; evidence: ${work}`);
if (results.some((r) => !r.ok)) process.exitCode = 1;

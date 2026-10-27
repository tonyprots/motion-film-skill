// Portable Chromium contracts for the editorial helpers. All inputs are generated fixtures; no provider calls.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { decodePNG } from '../scripts/png.mjs';
import zlib from 'node:zlib';
const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = process.env.MOTION_EDITORIAL_ARTIFACTS || os.tmpdir();
fs.mkdirSync(artifacts, { recursive: true });
const out = fs.mkdtempSync(path.join(artifacts, 'motion-editorial-')), fixture = path.join(out, 'project');
const init = spawnSync('sh', [path.join(skill, 'scripts/init.sh'), fixture, '--preset', 'blank'],
  { cwd: skill, encoding: 'utf8', timeout: 120000 });
assert.equal(init.status, 0, init.stdout + init.stderr);
const modules = ['actor', 'actor-hands', 'causal', 'illustrations', 'morph', 'lipsync', 'puppet'];
const hashes = Object.fromEntries(modules.map((name) => [name, createHash('sha256')
  .update(fs.readFileSync(path.join(fixture, `film/lib/${name}.js`))).digest('hex')]));
// Puppet fixture: a generated pack of flat colour layers (the real packs are private and absent from published copies).
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(w, h, [r, g, b, a]) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([r, g, b, a], y * (w * 4 + 1) + 1 + x * 4);
  const chunk = (type, data) => { const len = Buffer.alloc(4), sum = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const packDir = path.join(fixture, 'assets/puppets/fixture'); fs.mkdirSync(packDir, { recursive: true });
const layer = (name, w, h, colour, at) => { fs.writeFileSync(path.join(packDir, name + '.png'), png(w, h, colour)); return at ? { src: name + '.png', at } : { src: name + '.png' }; };
const PACK = { format: 'motion-film-puppet/1', size: [200, 240], foot: [100, 240], alias: { chin: 'point' },
  poses: { rest: { ...layer('pose-rest', 200, 240, [40, 60, 90, 255]), head: [0, 0] }, explain: { ...layer('pose-explain', 200, 240, [60, 90, 40, 255]), head: [2, -1] },
    point: { ...layer('pose-point', 200, 240, [90, 40, 60, 255]), head: [0, 1] }, hush: { ...layer('pose-hush', 200, 240, [90, 90, 40, 255]), head: [-1, 0], over: layer('over-hush', 30, 40, [250, 200, 160, 255], [85, 70]) } },
  faces: { neutral: layer('face-neutral', 80, 90, [240, 210, 180, 255], [60, 20]), happy: layer('face-happy', 80, 90, [250, 230, 120, 255], [60, 20]) },
  mouths: Object.fromEntries(['x', 'b', 'c', 'd', 'e', 'f'].map((m, i) => [m, layer('mouth-' + m, 30, 16, [120 + i * 20, 30, 40, 255], [85, 80])])),
  blink: layer('eyes-closed', 50, 12, [30, 30, 30, 255], [75, 45]) };
fs.writeFileSync(path.join(packDir, 'puppet.json'), JSON.stringify(PACK));
const PUPPETS = { fixture: { ...PACK, base: '../assets/puppets/fixture/' } };
// Full packs installed beside the fixture (none in the public copy) get the full-pack test below.
const packsDir = path.join(fixture, 'assets/puppets');
const fullPacks = fs.readdirSync(packsDir).filter((n) => n !== 'fixture' && fs.existsSync(path.join(packsDir, n, 'puppet.json')));
for (const n of fullPacks) PUPPETS[n] = { ...JSON.parse(fs.readFileSync(path.join(packsDir, n, 'puppet.json'), 'utf8')), base: `../assets/puppets/${n}/` };
const VOW = [[0.4, 0.9, 'мама'], [1.0, 1.6, 'объясняю'], [2.2, 2.7, 'да'], [3.1, 3.9, 'посмотрите']];
// sync.mjs bundles only the extras film code names literally, and warns about an unknown id.
fs.writeFileSync(path.join(fixture, 'film/extras-probe.js'), `const a = 'noto:pill', b = "noto:money-bag", c = 'noto:no-such-thing', d = 'lucide:check';\n`);
const synced = spawnSync(process.execPath, [path.join(fixture, 'scripts/sync.mjs')], { cwd: fixture, encoding: 'utf8', timeout: 120000 });
assert.equal(synced.status, 0, synced.stderr);
const bundled = JSON.parse(fs.readFileSync(path.join(fixture, 'film/data.js'), 'utf8').match(/window\.EXTRA_ASSETS = (.*);\n/)[1]);
assert.deepEqual(Object.keys(bundled).sort(), ['noto:money-bag', 'noto:pill'], 'sync must bundle only the named extras');
assert.match(synced.stderr + synced.stdout, /WARN unknown extra id\(s\): noto:no-such-thing/);
fs.rmSync(path.join(fixture, 'film/extras-probe.js'));
// Extras: real shipped SVGs (gradients, clips, Illustrator leftovers) plus two that must be refused.
const EXTRA_SAMPLE = ['mobile-phone', 'money-bag', 'laptop', 'pill', 'package', 'magnifying-glass-tilted-left', 'briefcase', 'trophy'];
const EXTRAS = Object.fromEntries(EXTRA_SAMPLE.map((n) => [`noto:${n}`, fs.readFileSync(path.join(fixture, `assets/extras/noto/${n}.svg`), 'utf8')]));
EXTRAS['noto:evil'] = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" onclick="alert(1)"/></svg>';
EXTRAS['noto:external'] = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="url(https://example.com/x)"/></svg>';
fs.writeFileSync(path.join(fixture, 'film/data.js'), `window.TL={duration:8,fps:30,bpm:60,formats:['9x16','16x9'],marks:{done:8}};window.BEATS={};window.VO=[];window.CAPS=[];window.CAPW=[];window.UI={};window.SVG_ASSETS={};window.EXTRA_ASSETS=${JSON.stringify(EXTRAS)};window.VOW=${JSON.stringify(VOW)};window.PUPPETS=${JSON.stringify(PUPPETS)};`);
const results = [], requests = [], pageErrors = [], deterministicRuns = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.error('FAIL', name, error.message); } }
const require = createRequire(path.join(fixture, 'package.json')), { chromium } = require('playwright');
const server = http.createServer((req, res) => {
  const file = path.resolve(out, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(out + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : file.endsWith('.png') ? 'image/png' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'] });
async function open(fmt, source = 'project') {
  const [width, height] = fmt === '9x16' ? [1080, 1920] : [1920, 1080];
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => pageErrors.push({ source, fmt, message: error.message }));
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin + '/')) return route.continue();
    requests.push(url); return route.abort();
  });
  await page.goto(`${origin}/${source}/film/index.html?fmt=${fmt}`);
  await page.evaluate(() => window.READY);
  return page;
}
function setFilm(build, run) {
  fs.writeFileSync(path.join(fixture, 'film/film.js'), `(() => {C.fonts=['500 40px Arial'];
    C.scene({name:'active',from:0,to:6,build(root,S){${build}},run(t,b,S){${run}}});
    C.scene({name:'quiet',from:6,to:'done',build(root){C.el('div',{style:'position:absolute;left:100px;top:100px;font:60px Arial'},root,'Тихая сцена');}});
    C.start();})();`);
}
async function seek(page, t) { await page.evaluate((at) => window.seek(at), t); }
async function det(page, name, times = [0.07, 0.22, 0.51, 0.73, 0.98, 1.24, 1.55, 1.91, 2.33, 2.97, 3.44, 4.03]) {
  const cold = [], states = [];
  const state = () => page.evaluate(() => [...document.querySelectorAll('[data-actor],[data-puppet],[data-illustration],[data-connector],[data-morph]')].filter((node) => {
    const css = getComputedStyle(node); return css.visibility !== 'hidden' && css.display !== 'none' && Number(css.opacity) > 0.01;
  }).map((n) => n.innerHTML).join('\n'));
  for (const t of times) { await seek(page, t); cold.push(await page.screenshot()); states.push(await state()); }
  let maxDiff = 0, changedDOM = false, bad = 0;
  for (let i = times.length - 1; i >= 0; i--) {
    await seek(page, times[(i * 7 + 3) % times.length]); await seek(page, times[i]);
    const again = await page.screenshot(), a = decodePNG(cold[i]), b = decodePNG(again);
    let diff = 0; for (let k = 0; k < b.length; k += 13) diff = Math.max(diff, Math.abs(a[k] - b[k]));
    maxDiff = Math.max(maxDiff, diff); changedDOM ||= states[i] !== await state();
    if (diff > 2) { bad++; if (bad === 1) { fs.writeFileSync(path.join(out, name + '-cold.png'), cold[i]); fs.writeFileSync(path.join(out, name + '-again.png'), again); } }
  }
  deterministicRuns.push({ name, probes: times.length, bad, maxDiff, changedVisibleDOM: changedDOM });
  assert.equal(changedDOM, false, 'same time produces different visible module DOM');
  assert.ok(maxDiff <= 2, `${bad}/${times.length} probes differ; max pixel delta ${maxDiff}`);
}
async function hidden(page) {
  await seek(page, 1.55); await seek(page, 7);
  const leaks = await page.evaluate(() => [...document.querySelectorAll('[data-scene="active"] *')].filter((node) => {
    const css = getComputedStyle(node), r = node.getBoundingClientRect();
    return !node.children.length && r.width > 0 && r.height > 0 && css.visibility === 'visible' && css.display !== 'none';
  }).map((n) => n.outerHTML.slice(0, 100)));
  assert.deepEqual(leaks, [], 'children escaped a hidden scene');
}
try {
  for (const fmt of ['9x16', '16x9']) {
    setFilm(`S.actor=ACTOR.mount(root,{id:'test-actor',x:100,y:100,w:440});`, `const poses=ACTOR.poses,i=Math.min(poses.length-1,Math.floor(t/.6));S.actor.draw(t,{pose:poses[i],previous:poses[(i+poses.length-1)%poses.length],at:i*.6,duration:.45,mouth:(Math.sin(t*7)+1)/2,look:Math.sin(t*2)});`);
    await test(`${fmt}: all actor poses are deterministic and respect hidden scenes`, async () => {
      const page = await open(fmt);
      try {
        const poses = await page.evaluate(() => ACTOR.poses);
        for(const name of ['rest','explain','point','listen','shrug','worry','welcome'])assert.ok(poses.includes(name));
        await det(page, 'actor-' + fmt, poses.flatMap((_,i)=>[i*.6+.11,i*.6+.4])); await hidden(page);
      } finally { await page.close(); }
    });
    await test(`${fmt}: presenter points toward the target and changes expression without moving the arms`,async()=>{
      setFilm(`S.actor=ACTOR.mount(root,{id:'aim',x:100,y:200,w:600});`, `S.actor.draw(t,{pose:'point',previous:'rest',target:[480,-180],duration:.3});`);
      const page=await open(fmt);
      try{
        await seek(page,2);
        const result=await page.evaluate(()=>{
          const root=document.querySelector('[data-actor="aim"]'),svg=root.querySelector('svg'),hand=root.querySelector('[data-part="right-hand"]'),finger=hand.querySelector('[data-hand="point"]');
          const wrist=new DOMPoint(0,0).matrixTransform(hand.getCTM()),tip=new DOMPoint(-10.266372227065947,-73.93799190776967).matrixTransform(finger.getCTM()),target=new DOMPoint(480,-180).matrixTransform(svg.getCTM());
          const u=[tip.x-wrist.x,tip.y-wrist.y],v=[target.x-wrist.x,target.y-wrist.y],cross=(u[0]*v[1]-u[1]*v[0])/(Math.hypot(...u)*Math.hypot(...v));
          const actor=C.SCENES.find(s=>s.name==='active').actor,read=()=>[root.querySelector('[data-part="brows"]').getAttribute('d'),root.querySelector('[data-part="mouth"]').getAttribute('d')],arm=hand.getAttribute('transform');
          actor.draw(2,{pose:'point',target:[480,-180],expression:'worried',duration:.3});const worried=read();
          actor.draw(2,{pose:'point',target:[480,-180],expression:'happy',duration:.3});const happy=read();
          return{cross,dot:u[0]*v[0]+u[1]*v[1],visible:getComputedStyle(finger).visibility,gesture:hand.dataset.gesture,armSame:arm===hand.getAttribute('transform'),worried,happy};
        });
        assert.ok(Math.abs(result.cross)<1e-6);assert.ok(result.dot>0);assert.equal(result.visible,'visible');assert.equal(result.gesture,'point');assert.equal(result.armSame,true);assert.notDeepEqual(result.worried,result.happy);
        await det(page,'actor-aim-'+fmt);await hidden(page);
      }finally{await page.close();}
    });
    for (const kind of ['envelope', 'keyboard', 'document', 'bill']) {
      setFilm(`S.object=ILLUSTRATIONS.object(root,${JSON.stringify(kind)},{x:150,y:250,w:600,title:'База',amount:'19',label:'База',payload:'Нет'});`, `S.object.draw({title:'Счёт '+Math.floor(t*2),amount:Math.floor(t*4)*10,label:'Бит '+Math.floor(t*2),payload:'Клавиша '+Math.floor(t*3),enabled:(Math.sin(t*2)+1)/2,open:(Math.sin(t*2)+1)/2,key:Math.floor(t*9)%30,checked:Math.floor(t*2)%5});`);
      await test(`${fmt}: changing ${kind} data and controls remains deterministic`, async () => {
        const page = await open(fmt);
        try {
          await det(page, kind + '-' + fmt);
          const fields = await page.evaluate(() => {
            const root = document.querySelector('[data-illustration]');
            const S = C.SCENES.find((s) => s.name === 'active');
            S.object.draw({ title: 'Новый <заголовок>', amount: 0, label: 'Новая подпись', payload: 'Новые данные', checked: 3, enabled: 1, open: 1, key: 4 });
            return Object.fromEntries([...root.querySelectorAll('[data-field]')].map((node) => [node.dataset.field, node.textContent]));
          });
          for (const [key, value] of Object.entries(fields)) assert.equal(value, ({ title: 'Новый <заголовок>', amount: '0', label: 'Новая подпись', payload: 'Новые данные' })[key]);
          await hidden(page);
        } finally { await page.close(); }
      });
    }
    setFilm(`S.kit=ILLUSTRATIONS.kinds.slice(11).map((k,i)=>ILLUSTRATIONS.object(root,k,{x:(i%4)*260,y:150+Math.floor(i/4)*170,w:250,skin:ILLUSTRATIONS.skins[i%4]}));`,
      `const st={phone:{cut:(Math.sin(t*2)+1)/2,ring:(t*.7)%1,tag:'§ '+Math.floor(t*3)},calendar:{day:Math.floor(t*5)%35,marks:Math.floor(t*2)%6},card:{chip:(Math.sin(t*3)+1)/2,declined:t>3?1:0,amount:'−$'+Math.floor(t*9)},coins:{count:Math.floor(t*2)%9,amount:'$'+Math.floor(t*100)},chat:{shown:Math.floor(t)%4,typing:(t*.8)%1,caret:Math.floor(t*2)%2,input:'abc'.slice(0,Math.floor(t)%4)},form:{filled:Math.floor(t)%4,missing:Math.floor(t)%4-1,sent:t>3?1:0,v0:'A'},stamp:{press:(t%2)/2},decision:{signed:(t/3)%1,sealed:(t-1.5)*2},lock:{open:(Math.sin(t)+1)/2},scales:{tilt:Math.sin(t*1.7)},recordings:{count:Math.floor(t*3)%13,rec:Math.floor(t*2)%2},camera:{pan:Math.sin(t),view:(Math.cos(t)+1)/2,rec:Math.floor(t)%2},agent:{work:t*.6,sleep:t<1?1-t:0,done:t>4?(t-4)*2:0,status:t>4?'DONE':'WORKING'},tokens:{level:(t*.4)%1.5,chips:Math.floor(t)%4,amount:''+Math.floor(t*300)},steps:{active:Math.min(2,t*.6-1),l0:'A',l1:'B',l2:'C'},slides:{count:Math.floor(t)%4,cursors:Math.floor(t*1.5)%4},funnel:{flow:t*.7,top:'5 000',bottom:''+Math.floor(t)},team:{count:Math.floor(t*1.2)%6,lead:Math.floor(t)%5,helmet:t>2?1:0},chip:{pick:(Math.sin(t)+1),model:'AI'}};S.kit.forEach((o,i)=>o.draw(st[ILLUSTRATIONS.kinds[11+i]]));`);
    await test(`${fmt}: stateful objects in every skin have deterministic seek and respect hidden scenes`, async () => {
      const page = await open(fmt);
      try { await det(page, 'objects-' + fmt); await hidden(page); }
      finally { await page.close(); }
    });
    setFilm(`S.wire=CAUSAL.connector(root,{id:'test-wire',from:t=>({x:150+30*Math.sin(t),y:200}),to:t=>({x:700,y:450+50*Math.cos(t)}),bend:70,label:'Поток',packets:4});`, `S.wire.draw(t,{at:.3,duration:2.2,active:t<4.8});`);
    await test(`${fmt}: causal endpoints, packets and active state have deterministic seek`, async () => {
      const page = await open(fmt);
      try { await det(page, 'connector-' + fmt); await hidden(page); }
      finally { await page.close(); }
    });
    for (const kind of ['circle-card','bill-box']) {
      const from=kind==='circle-card'?`MORPH.circle([220,290],24)`:`MORPH.rect(130,180,150,220)`;
      const to=kind==='circle-card'?`MORPH.rect(580,400,320,230,20)`:`MORPH.rect(590,420,280,180,8)`;
      setFilm(`S.target=${to};S.model=MORPH.handoff({from:${from},to:S.target,at:.3,duration:2.6,arc:100});S.morph=MORPH.mount(root,S.model,{fill:'#d8432e'});`, `S.morph.draw(t);`);
      await test(`${fmt}: ${kind} morph preserves landing and random/backward raster`,async()=>{
        const page=await open(fmt);
        try{await det(page,kind+'-'+fmt);await hidden(page);const end=await page.evaluate(()=>{const S=C.SCENES.find(s=>s.name==='active');return MORPH.check(S.model.at(S.model.end),S.target,0);});assert.equal(end,0);}
        finally{await page.close();}
      });
    }
  }
  setFilm('', '');
  await test('AI-market objects: agent, tokens, steps, slides, funnel, team and chip keep their state contracts', async () => {
    const page = await open('9x16');
    try {
      const r = await page.evaluate(() => {
        const mk = (k, st) => { const o = ILLUSTRATIONS.object(C.stage, k, { x:0, y:0 }); o.draw(st); return o; }, vis = (n) => n.getAttribute('visibility') !== 'hidden';
        const out = {};
        let o = mk('agent', { sleep:1 }); out.sleep = [vis(o.root.querySelector('[data-part="zz"]')), vis(o.root.querySelector('[data-part="ring"]')), vis(o.root.querySelector('[data-part="pill"]'))];
        o.draw({ work:.25, done:1, status:'DONE' }); out.work = [vis(o.root.querySelector('[data-part="ring"]')), vis(o.root.querySelector('[data-part="done"]')), o.root.querySelector('[data-field="status"]').textContent];
        o = mk('tokens', { level:1.5, chips:1 }); out.tokens = [+o.root.querySelector('[data-part="base"]').getAttribute('height'), +o.root.querySelector('[data-part="over"]').getAttribute('height'), o.root.querySelectorAll('[data-coin]:not([visibility="hidden"])').length];
        o.draw({ level:.5 }); out.under = [vis(o.root.querySelector('[data-part="over"]'))];
        o = mk('steps', { active:1.6 }); out.steps = [...o.root.querySelectorAll('[data-flag]')].map(vis);
        o = mk('slides', { count:2, cursors:3 }); out.slides = [[...o.root.querySelectorAll('[data-box]')].filter(vis).length, [...o.root.querySelectorAll('[data-tile]')].filter(vis).length];
        o = mk('team', { count:3, lead:2, helmet:1 }); out.team = [[...o.root.querySelectorAll('[data-tile]')].filter(vis).length, [...o.root.querySelectorAll('[data-mark]')].filter(vis).map((n) => n.dataset.mark)];
        o = mk('chip', { pick:2 }); out.chip = o.root.querySelector('[data-part="knob"]').getAttribute('transform');
        o = mk('funnel', { flow:.37 }); const a = o.root.innerHTML; o.draw({ flow:1.37 }); out.funnel = a === o.root.innerHTML;
        return out;
      });
      assert.deepEqual(r.sleep, [true, false, false]);
      assert.deepEqual(r.work, [true, true, 'DONE']);
      assert.ok(Math.abs(r.tokens[0] - 125.33) < .01 && Math.abs(r.tokens[1] - 62.67) < .01, 'tank: base fills 2/3, overage the rest'); assert.equal(r.tokens[2], 1);
      assert.deepEqual(r.under, [false]);
      assert.deepEqual(r.steps, [false, false, true], 'a fraction lights the nearest step');
      assert.deepEqual(r.slides, [2, 3]);
      assert.deepEqual(r.team, [3, ['2']]);
      assert.equal(r.chip, 'translate(287.00 204)');
      assert.ok(r.funnel, 'funnel flow must wrap every 1');
    } finally { await page.close(); }
  });
  await test('every illustration exists and resets omitted data to its own base', async () => {
    const page = await open('9x16');
    try {
      const items = await page.evaluate(() => ILLUSTRATIONS.kinds.map((kind, i) => {
        const obj = ILLUSTRATIONS.object(C.stage, kind, { x: 0, y: 0, title: 'База', amount: '19', label: 'База', payload: 'Нет' });
        const fields = () => Object.fromEntries([...obj.root.querySelectorAll('[data-field]')].map((n) => [n.dataset.field, n.textContent]));
        const before = fields(); obj.draw({ title: 'Смена', amount: 0, label: 'Смена', payload: 'Смена' }); const changed = fields(); obj.draw();
        return { kind, before, changed, reset: fields(), invalid: /NaN|undefined/.test(obj.root.innerHTML) };
      }));
      assert.ok(items.length >= 10);
      for (const item of items) { assert.deepEqual(item.reset, item.before, item.kind); assert.equal(item.invalid, false, item.kind); }
    } finally { await page.close(); }
  });
  await test('skins: line is the default, every skin paints every kind, mono keeps three inks, style() sets film defaults', async () => {
    setFilm('', '');
    const page = await open('9x16');
    try {
      const info = await page.evaluate(() => {
        const dark = { ink:'#f3f1e8', paper:'#171b18', accent:'#ff7958' }, out = { same:[], invalid:[], monoColours:new Set(), filters:[] };
        for (const kind of ILLUSTRATIONS.kinds) {
          const a = ILLUSTRATIONS.object(C.stage, kind), b = ILLUSTRATIONS.object(C.stage, kind, { skin:'line' });
          if (a.root.innerHTML !== b.root.innerHTML) out.same.push(kind); a.root.remove(); b.root.remove();
          for (const skin of ILLUSTRATIONS.skins) {
            const o = ILLUSTRATIONS.object(C.stage, kind, { skin, palette:skin === 'mono' ? dark : {} });
            if (/NaN|undefined|Infinity/.test(o.root.innerHTML)) out.invalid.push(kind + ':' + skin);
            if (skin === 'mono') o.root.querySelectorAll('path,rect,circle,ellipse').forEach((n) => ['fill', 'stroke'].forEach((k) => out.monoColours.add(n.getAttribute(k))));
            if (skin === 'sketch') out.filters.push(o.root.querySelector('filter')?.id);
            o.root.remove();
          }
        }
        ILLUSTRATIONS.style({ skin:'mono', palette:dark });
        const styled = ILLUSTRATIONS.object(C.stage, 'gift'), local = ILLUSTRATIONS.object(C.stage, 'gift', { skin:'line', palette:{} });
        out.styled = [styled.skin, styled.palette.ink, local.skin]; ILLUSTRATIONS.style({ skin:'line', palette:{} });
        out.reset = ILLUSTRATIONS.object(C.stage, 'gift').skin; styled.root.remove(); local.root.remove();
        out.monoColours = [...out.monoColours]; return out;
      });
      assert.deepEqual(info.same, [], 'default skin differs from line');
      assert.deepEqual(info.invalid, []);
      for (const colour of info.monoColours) assert.ok(['#f3f1e8', '#171b18', '#ff7958', '#202421', 'none', null].includes(colour), 'mono painted ' + colour);
      assert.equal(new Set(info.filters).size, info.filters.length, 'sketch filters need unique ids');
      assert.ok(info.filters.every(Boolean));
      assert.deepEqual(info.styled, ['mono', '#f3f1e8', 'line']); assert.equal(info.reset, 'line');
    } finally { await page.close(); }
  });
  await test('extras: shipped SVGs repaint in every skin, ids stay unique, mono keeps three inks, unsafe or unknown ids are refused, style({extras:false}) switches the layer off', async () => {
    setFilm('', '');
    const page = await open('9x16');
    try {
      const info = await page.evaluate((sample) => {
        const dark = { ink:'#f3f1e8', paper:'#171b18', accent:'#ff7958' }, strip = (s) => s.replace(/mf-extra-\d+/g, 'X');
        const out = { ids:ILLUSTRATIONS.extras(), invalid:[], empty:[], outline:{}, mono:new Set(), same:[], refused:[], dupIds:0 };
        for (const n of sample) {
          const id = 'noto:' + n, a = ILLUSTRATIONS.extra(C.stage, id), b = ILLUSTRATIONS.extra(C.stage, id, { skin:'line' });
          if (strip(a.root.innerHTML) !== strip(b.root.innerHTML)) out.same.push(n);
          const all = [...document.querySelectorAll('[id]')].map((x) => x.id); out.dupIds += all.length - new Set(all).size;
          a.root.remove(); b.root.remove();
          for (const skin of ILLUSTRATIONS.skins) {
            const o = ILLUSTRATIONS.extra(C.stage, id, { x:40, y:60, w:220, skin, palette:skin === 'mono' ? dark : {} }), r = o.root.getBoundingClientRect();
            if (/NaN|undefined|Infinity/.test(o.root.innerHTML)) out.invalid.push(n + ':' + skin);
            const box = o.root.querySelector('svg > g:last-child').getBBox(); if (!(box.width > 1 && box.height > 1 && r.width > 200)) out.empty.push(n + ':' + skin);
            out.outline[skin] = (out.outline[skin] || 0) + o.root.querySelectorAll('[stroke-linejoin="round"][stroke-width]').length;
            if (skin === 'mono') o.root.querySelectorAll('*').forEach((x) => ['fill', 'stroke', 'stop-color'].forEach((k) => { const v = x.getAttribute(k); if (v && !v.startsWith('url(')) out.mono.add(v); }));
            o.root.remove();
          }
        }
        for (const id of ['noto:evil', 'noto:external', 'noto:nope']) try { ILLUSTRATIONS.extra(C.stage, id); } catch (e) { out.refused.push(id); }
        try { ILLUSTRATIONS.extra(C.stage, 'noto:pill', { w:0 }); } catch (e) { out.refused.push('w0'); }
        ILLUSTRATIONS.style({ skin:'mono', palette:dark }); const s = ILLUSTRATIONS.extra(C.stage, 'noto:pill'); out.styled = [s.skin, s.palette.paper]; s.root.remove();
        ILLUSTRATIONS.style({ extras:false }); const off = ILLUSTRATIONS.extra(C.stage, 'noto:pill', { x:10, y:20 }); out.off = [off.off, off.root.innerHTML, off.root.dataset.extra, ILLUSTRATIONS.style().extras]; off.root.remove();
        try { ILLUSTRATIONS.style({ extras:'no' }); } catch (e) { out.refused.push('extras'); }
        ILLUSTRATIONS.style({ skin:'line', palette:{}, extras:true });
        out.mono = [...out.mono]; return out;
      }, EXTRA_SAMPLE);
      assert.ok(info.ids.includes('noto:mobile-phone'));
      assert.deepEqual(info.same, [], 'default extra skin differs from line');
      assert.equal(info.dupIds, 0, 'two copies of one extra share an id');
      assert.deepEqual(info.invalid, []); assert.deepEqual(info.empty, []);
      assert.equal(info.outline.flat, 0, 'flat must not outline'); for (const s of ['line', 'mono', 'sketch']) assert.ok(info.outline[s] > 0, s + ' needs the outline');
      for (const c of info.mono) assert.ok(['#f3f1e8', '#171b18', '#ff7958', 'none'].includes(c), 'mono extra painted ' + c);
      assert.deepEqual(info.refused, ['noto:evil', 'noto:external', 'noto:nope', 'w0', 'extras']);
      assert.deepEqual(info.off, [true, '', 'noto:pill', false], 'style({extras:false}) must leave an empty node');
      assert.deepEqual(info.styled, ['mono', '#171b18']);
    } finally { await page.close(); }
  });
  await test('presenter pool: every preset renders every pose deterministically; default stays classic', async () => {
    setFilm(`S.cast=ACTOR.characters.map((c,i)=>ACTOR.mount(root,{id:'pool-'+c,x:20+i*340,y:300,w:320,character:c}));`,
      `const poses=ACTOR.poses,i=Math.min(poses.length-1,Math.floor(t/.4));for(const a of S.cast)a.draw(t,{pose:poses[i],previous:poses[(i+poses.length-1)%poses.length],at:i*.4,duration:.3,mouth:(Math.sin(t*7)+1)/2,expression:ACTOR.expressions[i%ACTOR.expressions.length]});`);
    const page = await open('16x9');
    try {
      const info = await page.evaluate(() => {
        const plain = ACTOR.mount(C.stage, { id: 'plain' }), classic = ACTOR.mount(C.stage, { id: 'plain2', character: 'classic' });
        const strip = (n) => n.root.querySelector('svg').innerHTML.replace(/plain2?/g, '');
        const extra = ACTOR.characters.map((c) => ACTOR.mount(C.stage, { id: 'h' + c, character: c }));
        const result = { names: ACTOR.characters, same: strip(plain) === strip(classic), heights: extra.map((a) => a.character.height) };
        for (const a of [plain, classic, ...extra]) a.root.remove();
        return result;
      });
      for (const name of ['classic', 'casual', 'woman']) assert.ok(info.names.includes(name), name);
      assert.equal(info.same, true, 'default presenter must equal the classic preset');
      assert.ok(new Set(info.heights).size > 1, 'pool presets differ in height');
      await det(page, 'actor-pool', [0.13, 0.55, 1.02, 1.71, 2.3, 3.05, 3.9, 4.6, 5.3]);
    } finally { await page.close(); }
  });
  await test('unknown illustration kinds and actor poses are rejected', async () => {
    const page = await open('9x16');
    try {
      const rejected = await page.evaluate(() => {
        const failures = [];
        try { ILLUSTRATIONS.object(C.stage, 'missing'); failures.push('illustration'); } catch {}
        const actor = ACTOR.mount(C.stage, { id: 'bad-pose' });
        try { actor.draw(1, { pose: 'missing' }); failures.push('pose'); } catch {}
        try { actor.draw(1, { previous: 'missing' }); failures.push('previous pose'); } catch {}
        return failures;
      });
      assert.deepEqual(rejected, []);
    } finally { await page.close(); }
  });
  await test('lipsync: the mouth moves only inside words, closes on м/б/п and opens on vowels', async () => {
    setFilm('', '');
    const page = await open('16x9');
    try {
      const r = await page.evaluate(() => ({
        silent: [0.2, 0.95, 1.8, 5].map((t) => LIPSYNC.at(t)),
        mama: LIPSYNC.plan(0, 1, 'мама').map((x) => x[2]), da: LIPSYNC.plan(0, 1, 'да!').map((x) => x[2]), oo: LIPSYNC.plan(0, 1, 'ух').map((x) => x[2]),
        talking: Array.from({ length: 20 }, (_, i) => LIPSYNC.at(1.0 + i * 0.03)), empty: LIPSYNC.plan(0, 1, '—'),
        same: JSON.stringify(LIPSYNC.at(3.37)) === JSON.stringify(LIPSYNC.at(3.37)),
      }));
      for (const x of r.silent) assert.deepEqual([x.shape, x.speaking, x.open], ['x', false, 0]);
      assert.deepEqual(r.mama, ['x', 'd', 'x', 'd']); assert.deepEqual(r.da, ['b', 'd']); assert.deepEqual(r.oo, ['f', 'b']); assert.deepEqual(r.empty, []);
      assert.ok(r.talking.every((x) => x.speaking)); assert.ok(new Set(r.talking.map((x) => x.shape)).size >= 3, 'a word shows several mouth shapes');
      assert.equal(r.same, true);
    } finally { await page.close(); }
  });
  await test('puppet: all 14 poses resolve (picture, alias or nearest), mouth follows the words, seek is deterministic', async () => {
    setFilm(`S.p=PUPPET.mount(root,{id:'toon',pack:'fixture',x:200,y:300,w:400});`,
      `const poses=PUPPET.poses,i=Math.min(poses.length-1,Math.floor(t/.4));S.p.draw(t,{pose:poses[i],previous:poses[(i+poses.length-1)%poses.length],at:i*.4,duration:.3,viseme:LIPSYNC.at(t).shape,expression:i%3?'neutral':'happy',previousExpression:'neutral'});`);
    const page = await open('16x9');
    try {
      const r = await page.evaluate(() => {
        const S = C.SCENES.find((s) => s.name === 'active'), root = S.p.root, read = () => ({ ...root.dataset });
        const at = (t, o) => { S.p.draw(t, { pose: 'rest', previous: 'rest', ...o }); return read(); };
        return { poses: S.p.poses, fallback: S.p.fallback, packs: PUPPET.packs,
          silent: at(0.2, {}), talk: at(0.5, { viseme: LIPSYNC.at(0.5).shape }), byNumber: at(0.5, { mouth: 1 }), happyClosed: at(0.5, { viseme: 'x', expression: 'happy', previousExpression: 'happy' }),
          missingFace: at(0.5, { expression: 'shocked', previousExpression: 'shocked' }), chin: (S.p.draw(2, { pose: 'chin', previous: 'rest', at: 1 }), read()),
          cut: [0.99, 1.0].map((t) => (S.p.draw(t, { pose: 'hush', previous: 'rest', at: 1 }), [...root.querySelectorAll('img')].filter((n) => +n.style.opacity > 0 && /pose-|over-/.test(n.src)).map((n) => n.src.split('/').pop()))),
          blink: at(2.8, {}).face, blinkShown: +[...root.querySelectorAll('img')].find((i) => i.src.endsWith('/eyes-closed.png')).style.opacity };
      });
      assert.equal(Object.keys(r.poses).length, 14); assert.ok(r.packs.includes('fixture'));
      assert.equal(r.poses.chin, 'point', 'alias'); assert.equal(r.poses.rest, 'rest'); assert.ok(r.fallback.includes('cheer') && !r.fallback.includes('chin'));
      assert.equal(r.silent.mouth, 'x'); assert.notEqual(r.talk.mouth, 'x'); assert.equal(r.byNumber.mouth, 'd');
      assert.equal(r.happyClosed.mouth, 'none', 'a closed mouth on a non-neutral face keeps the face\'s own mouth');
      assert.equal(r.missingFace.face, 'neutral', 'shocked → surprised → neutral in a pack without both'); assert.equal(r.chin.pose, 'point');
      assert.deepEqual(r.cut, [['pose-rest.png'], ['pose-hush.png', 'over-hush.png']], 'one pose at a time, cut on at'); assert.equal(r.blink, 'neutral'); assert.equal(r.blinkShown, 1);
      await det(page, 'puppet-poses', [0.13, 0.55, 1.02, 1.71, 2.3, 2.85, 3.05, 3.5, 3.9, 4.6, 5.3, 5.7]);
      await hidden(page);
    } finally { await page.close(); }
  });
  await test('puppet: the rim appears on a dark background (parent or a layer behind) and not on a light one; outline can be forced', async () => {
    setFilm(`S.dark=C.el('div',{class:'abs',style:'left:0;top:0;width:900px;height:600px;background:#14171a'},root);S.light=C.el('div',{class:'abs',style:'left:900px;top:0;width:900px;height:600px;background:#f4f1ea'},root);
      S.a=PUPPET.mount(S.dark,{id:'on-dark',pack:'fixture',x:100,y:50,w:300});S.b=PUPPET.mount(S.light,{id:'on-light',pack:'fixture',x:100,y:50,w:300});S.c=PUPPET.mount(S.light,{id:'forced',pack:'fixture',x:500,y:50,w:300,outline:'#ff0000'});
      C.el('div',{class:'abs',style:'left:0;top:620px;width:900px;height:460px;background:#101418'},root);S.d=PUPPET.mount(root,{id:'sibling-dark',pack:'fixture',x:100,y:660,w:300});`,
      `for(const p of [S.a,S.b,S.c,S.d])p.draw(t,{pose:'explain',previous:'rest',at:1});`);
    const page = await open('16x9');
    try {
      await seek(page, 2);
      const r = await page.evaluate(() => ['on-dark', 'on-light', 'forced', 'sibling-dark'].map((id) => document.querySelector(`[data-puppet="${id}"]`).dataset.rim));
      assert.deepEqual(r, ['on', 'off', 'on', 'on'], 'a dark parent, a light parent, forced, a dark sibling layer behind');
      await det(page, 'puppet-rim', [0.5, 1.03, 1.2, 2.4]);
    } finally { await page.close(); }
  });
  for (const pack of fullPacks) await test(`pack ${pack}: every pose has its own picture, every expression and mouth shape exists`, async () => {
    setFilm(`S.p=PUPPET.mount(root,{id:'host',pack:${JSON.stringify(pack)},x:300,y:200,w:700});`,
      `const poses=PUPPET.poses,i=Math.min(poses.length-1,Math.floor(t/.4));S.p.draw(t,{pose:poses[i],previous:poses[(i+poses.length-1)%poses.length],at:i*.4,duration:.3,viseme:LIPSYNC.at(t).shape,expression:PUPPET.expressions[i%PUPPET.expressions.length]});`);
    const page = await open('16x9');
    try {
      const r = await page.evaluate((pk) => { const P = PUPPETS[pk], S = C.SCENES.find((s) => s.name === 'active');
        return { fallback: S.p.fallback, faces: Object.keys(P.faces), mouths: Object.keys(P.mouths), blink: !!P.blink, broken: [...document.images].filter((i) => !i.naturalWidth).length }; }, pack);
      assert.deepEqual(r.fallback, []); assert.equal(r.broken, 0); assert.ok(r.blink);
      for (const e of ['neutral', 'happy', 'worried', 'surprised', 'shocked', 'grimace', 'wink', 'sad']) assert.ok(r.faces.includes(e), e);
      assert.deepEqual(r.mouths.sort(), ['b', 'c', 'd', 'e', 'f', 'x']);
      await det(page, 'puppet-host', [0.13, 0.55, 1.02, 1.71, 2.3, 3.05, 3.9, 4.6, 5.3]);
    } finally { await page.close(); }
  });
  const invalid = [
    ['actor zero duration', `const a=ACTOR.mount(C.stage,{id:'invalid'});a.draw(1,{duration:0})`],
    ['actor NaN duration', `const a=ACTOR.mount(C.stage,{id:'invalid'});a.draw(1,{duration:NaN})`],
    ['actor NaN mouth', `const a=ACTOR.mount(C.stage,{id:'invalid'});a.draw(1,{mouth:NaN})`],
    ['actor NaN look', `const a=ACTOR.mount(C.stage,{id:'invalid'});a.draw(1,{look:NaN})`],
    ['actor invalid target', `const a=ACTOR.mount(C.stage,{id:'invalid'});a.draw(1,{target:[0,NaN]})`],
    ['actor unknown expression', `const a=ACTOR.mount(C.stage,{id:'invalid'});a.draw(1,{expression:'missing'})`],
    ['actor unknown character', `ACTOR.mount(C.stage,{id:'invalid',character:'missing'})`],
    ['actor unknown character field', `ACTOR.mount(C.stage,{id:'invalid',character:{base:'casual',cape:true}})`],
    ['actor invalid character style', `ACTOR.mount(C.stage,{id:'invalid',character:{hairStyle:'mohawk'}})`],
    ['actor markup in character color', `ACTOR.mount(C.stage,{id:'invalid',character:{skin:'red"/><script>'}})`],
    ['actor character height out of range', `ACTOR.mount(C.stage,{id:'invalid',character:{height:2}})`],
    ['puppet unknown pack', `PUPPET.mount(C.stage,{id:'invalid',pack:'missing'})`],
    ['puppet unknown pose', `PUPPET.mount(C.stage,{id:'invalid',pack:'fixture'}).draw(1,{pose:'missing'})`],
    ['puppet unknown viseme', `PUPPET.mount(C.stage,{id:'invalid',pack:'fixture'}).draw(1,{viseme:'q'})`],
    ['puppet unknown expression', `PUPPET.mount(C.stage,{id:'invalid',pack:'fixture'}).draw(1,{expression:'missing'})`],
    ['puppet NaN mouth', `PUPPET.mount(C.stage,{id:'invalid',pack:'fixture'}).draw(1,{mouth:NaN})`],
    ['puppet markup in outline', `PUPPET.mount(C.stage,{id:'invalid',pack:'fixture',outline:'red"/><script>'}).draw(1)`],
    ['puppet unsafe file in pack', `PUPPETS.bad={...PUPPETS.fixture,poses:{rest:{src:'../x.png'}}};PUPPET.mount(C.stage,{id:'invalid',pack:'bad'})`],
    ['lipsync NaN time', `LIPSYNC.at(NaN)`],
    ['wave zero duration', `CAUSAL.wave([{x:0,y:0}],{duration:0})(1)`],
    ['wave NaN duration', `CAUSAL.wave([{x:0,y:0}],{duration:NaN})(1)`],
    ['wave NaN coordinates', `CAUSAL.wave([{x:NaN,y:0}])(1)`],
    ['connector zero duration', `const c=CAUSAL.connector(C.stage,{id:'invalid',from:{x:0,y:0},to:{x:100,y:100}});c.draw(0,{duration:0})`],
    ['connector NaN progress', `const c=CAUSAL.connector(C.stage,{id:'invalid',from:{x:0,y:0},to:{x:100,y:100}});c.draw(1,{progress:NaN})`],
    ['connector NaN endpoint', `const c=CAUSAL.connector(C.stage,{id:'invalid',from:{x:NaN,y:0},to:{x:100,y:100}});c.draw(1)`],
    ['illustration NaN open', `ILLUSTRATIONS.object(C.stage,'envelope').draw({open:NaN})`],
    ['illustration NaN checked', `ILLUSTRATIONS.object(C.stage,'document').draw({checked:NaN})`],
    ['illustration NaN cut', `ILLUSTRATIONS.object(C.stage,'phone').draw({cut:NaN})`],
    ['illustration infinite tilt', `ILLUSTRATIONS.object(C.stage,'scales').draw({tilt:Infinity})`],
    ['illustration unknown skin', `ILLUSTRATIONS.object(C.stage,'lock',{skin:'neon'})`],
    ['illustration markup in palette', `ILLUSTRATIONS.object(C.stage,'lock',{palette:{accent:'red"/><script>'}})`],
    ['illustration unknown palette colour', `ILLUSTRATIONS.object(C.stage,'lock',{palette:{gold:'#ffcc00'}})`],
    ['calendar zero repeat', `ILLUSTRATIONS.object(C.stage,'calendar',{every:0})`],
    ['style unknown skin', `ILLUSTRATIONS.style({skin:'neon'})`],
  ];
  for (const [name, code] of invalid) await test(`${name} is rejected without invalid geometry`, async () => {
    const page = await open('9x16');
    try {
      const result = await page.evaluate((code) => {
        try { const value = new Function(code)(); return { rejected: false, bad: /NaN|Infinity/.test(C.stage.innerHTML), value: String(value) }; }
        catch (e) { return { rejected: true, message: e.message }; }
      }, code);
      assert.equal(result.rejected, true, JSON.stringify(result));
    } finally { await page.close(); }
  });
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
await test('local editorial runtime has no external requests or page errors', async () => { assert.deepEqual(requests, []); assert.deepEqual(pageErrors, []); });
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, sourceHashes: hashes, requests, pageErrors, deterministicRuns }, null, 2));
console.log(`EDITORIAL ${results.filter((x) => x.ok).length}/${results.length} passed; evidence: ${out}`);
if (results.some((x) => !x.ok)) process.exitCode = 1;


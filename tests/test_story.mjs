// Real Chromium + real engine. Six verbs × two stories × two formats; negative evidence must fail.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'motion-story-')), 'film-project');
function run(command, args, expected = 0) {
  const p = spawnSync(command, args, { cwd: fs.existsSync(root) ? root : skill, encoding: 'utf8', timeout: 120000 });
  assert.equal(p.status, expected, p.stdout + p.stderr);
  return p.stdout;
}
run('sh', [path.join(skill, 'scripts/init.sh'), root]);
const write = (file, data) => fs.writeFileSync(path.join(root, file), typeof data === 'string' ? data : JSON.stringify(data));
function fixture(kind, alternate = false, mode = 'good') {
  const max = ['connect', 'reveal', 'assemble'].includes(kind) ? 1 : kind === 'accumulate' ? 6 : 100;
  const result = alternate ? 'B' : 'A';
  write('timeline.json', { duration: 2.2, bpm: 120, fps: 60, formats: ['16x9', '9x16'], visual_format: 'image-per-phrase',
    marks: { start: 0, change: 0.8, done: 4.4 }, sfx: [] });
  write('audio/vo_placed.json', [{ id: 's1a', t0: 0.1, t1: 1.8, text: result }]);
  write('captions.json', [['s1a', result]]);
  const from = ['connect'].includes(kind) ? '0%' : ['reveal', 'assemble'].includes(kind) ? '?' : '0';
  const to = kind === 'connect' ? '100%' : ['reveal', 'assemble'].includes(kind) ? result : String(max);
  write('visual-events.json', { version: 1, events: [{ id: 'e1', phrase: 's1a', at: 'change',
    region: '[data-prop="p"]', selector: '[data-prop="p"] [data-role="value"]', property: 'text',
    from, to, action: kind === 'meter' ? 'fill' : kind, meaning: 'A changes B', window: [-0.1, 0.8] }] });
  write('film/film.js', `(() => {
    C.scene({ name:'prop', from:0, to:'done', build(root,S) {
      S.p=PROPS.mount(root,${JSON.stringify(kind)},{id:'p',max:${max},label:${JSON.stringify(alternate ? 'B → A' : 'A → B')},detail:${JSON.stringify(result)},result:${JSON.stringify(result)},initial:'?',parts:['A','B']});
      S.cap=C.reg(C.el('div',{class:'cap',style:'left:120px;top:100px;font:64px UI'},root));
    }, run(t,b,S) {
      S.p.draw(t,${mode === 'good' ? `[[0,0],['change',${max}]]` : '[[0,0]]'});
      C.put(S.cap,{text:t < 0.4?'A':'B'});
      ${mode === 'shake' ? 'C.put(S.p.root,{x:100+Math.sin(t*50)*20});' : ''}
      ${mode === 'camera' ? 'C.put(S.p.root,{s:1+t*.1});' : ''}
      ${mode === 'fake' ? "S.p.root.setAttribute('data-state',t<.4?'0':'6');" : ''}
    }}); C.start();
  })();`);
  run('node', ['scripts/sync.mjs']);
}
let checks = 0;
for (const kind of ['accumulate', 'meter', 'compare', 'connect', 'reveal', 'assemble']) {
  console.log(`checking ${kind}`);
  for (const alternate of [false, true]) {
    fixture(kind, alternate);
    run('node', ['scripts/render.mjs', '--story', '--all']);
    for (const fmt of ['16x9', '9x16']) {
      const report = JSON.parse(fs.readFileSync(path.join(root, `review/story_${fmt}.json`)));
      assert.equal(report.coverage, 1); assert.equal(report.status, 'EVIDENCE'); checks++;
    }
  }
  run('node', ['scripts/render.mjs', '--verify', '--all']);
}
for (const mode of ['static', 'shake', 'camera', 'fake']) {
  fixture('accumulate', false, mode);
  run('node', ['scripts/render.mjs', '--story', '--all'], 1);
  for (const fmt of ['16x9', '9x16']) {
    const report = JSON.parse(fs.readFileSync(path.join(root, `review/story_${fmt}.json`)));
    assert.equal(report.coverage, 0); checks++;
  }
}
fixture('accumulate');
const extra = Array.from({ length: 5 }, (_, i) => ({ id: `s${i + 1}a`, t0: 0.1, t1: 1.8, text: 'A' }));
write('audio/vo_placed.json', extra); run('node', ['scripts/sync.mjs']);
run('node', ['scripts/render.mjs', '--story', '--all'], 1); checks++;
fixture('accumulate');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'visual-events.json')));
plan.events[0].selector = '.cap'; plan.events[0].region = '.cap';
plan.events[0].from = 'A'; plan.events[0].to = 'B'; write('visual-events.json', plan);
run('node', ['scripts/render.mjs', '--story', '--all'], 1); checks++;
for (const mode of ['inert-attribute', 'transparent-text']) {
  fixture('accumulate');
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'visual-events.json')));
  let append;
  if (mode === 'inert-attribute') {
    plan.events[0].selector = '[data-role="inert"]'; plan.events[0].property = 'attr:width';
    plan.events[0].from = 0; plan.events[0].to = 100;
    append = `const r=document.querySelector('[data-prop="p"]');
      const n=C.el('div',{'data-role':'inert',style:'width:100px;height:80px;background:black'},r);
      C.hooks.after.push(t=>{n.setAttribute('width',t<.4?0:100);C.put(r,{x:100+t*50});});`;
  } else {
    append = `C.hooks.after.push(()=>document.querySelector('[data-role="value"]').setAttribute('fill','transparent'));`;
  }
  fs.appendFileSync(path.join(root, 'film/film.js'), `\n(()=>{${append}})();`);
  write('visual-events.json', plan);
  run('node', ['scripts/render.mjs', '--story', '--all'], 1); checks++;
}
fixture('accumulate');
fs.renameSync(path.join(root, 'visual-events.json'), path.join(root, 'unused-visual-events.json'));
run('node', ['scripts/render.mjs', '--story', '--all'], 1); checks++;
const optional = JSON.parse(fs.readFileSync(path.join(root, 'timeline.json')));
delete optional.visual_format; write('timeline.json', optional); run('node', ['scripts/sync.mjs']);
run('node', ['scripts/render.mjs', '--story', '--all']);
assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'review/story_9x16.json'))).status, 'NOT CHECKED'); checks++;
console.log(`STORY OK: ${checks} evidence checks + 12 determinism runs; fixture: ${root}`);

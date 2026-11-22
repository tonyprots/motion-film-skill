// Observable geometry, retained progress, word marks and backwards seeking.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const skill=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'motion-staging-')),root=path.join(out,'project');
let r=spawnSync(process.execPath,[path.join(skill,'scripts/pilot.mjs'),'task',root,'--lang','en'],{encoding:'utf8'});
assert.equal(r.status,0,r.stdout+r.stderr);
const require=createRequire(path.join(root,'package.json')),{chromium}=require('playwright');
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+req.url.split('?')[0]);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream');fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();let checks=0;
try{
 const tl=JSON.parse(fs.readFileSync(path.join(root,'timeline.json')));
 tl.marks={...tl.marks,...Object.fromEntries(Array.from({length:6},(_,i)=>['line.w'+(i+1),i]))};
 fs.writeFileSync(path.join(root,'timeline.json'),JSON.stringify(tl));
 fs.writeFileSync(path.join(root,'audio/vo/lines.json'),JSON.stringify([{id:'line',text:'Ёж,|сделал дело. Ёж сделал дело!'}]));
 r=spawnSync(process.execPath,['scripts/sync.mjs'],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 for(const kind of ['task','handoff','edit']){
  fs.writeFileSync(path.join(root,'film/film.js'),['common',kind].map(n=>fs.readFileSync(path.join(skill,`library/examples/${n}.js`),'utf8')).join('\n'));
  for(const fmt of ['16x9','9x16']){
   const page=await browser.newPage({viewport:fmt==='16x9'?{width:1920,height:1080}:{width:1080,height:1920}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/film/index.html?fmt=${fmt}`);await page.evaluate(()=>window.READY);
   assert.deepEqual(errors,[]);checks++;
   if(kind==='task'){
    if(fmt==='16x9'){
      await page.evaluate(()=>seek(3.45));
      const edges=await page.locator('[data-example=body]').evaluate(e=>{
        const {left,top,right,bottom}=e.getBoundingClientRect();
        return [left,top,right,bottom];
      });
      assert(edges.every(Number.isInteger),'worker body edges must land on device pixels in the landscape hold');
      checks++;
    }
    const sizes=[];
    for(const t of [4.1,5.5,6.8,7.8]){sizes.push(await page.evaluate(async t=>{await seek(t);return document.querySelector('[data-example="progress"]').getBoundingClientRect().width;},t));}
    assert.equal(sizes[0],sizes[1]);assert(sizes[2]>sizes[1]);assert(sizes[3]>sizes[2]);checks+=3;
    const documentStates=[];for(const t of [4.1,5.0,5.5,6.8,7.8])documentStates.push(await page.evaluate(async t=>{await seek(t);const worker=document.querySelector('[data-example=worker]').getBoundingClientRect();return {lines:[...document.querySelectorAll('[data-example^=completed-line]')].map(e=>e.getBoundingClientRect().width),workerRight:worker.right};},t));
    assert.deepEqual(documentStates[0].lines,documentStates[1].lines);assert.deepEqual(documentStates[1].lines,documentStates[2].lines);assert(documentStates[1].workerRight<0);assert(documentStates[3].lines[1]>documentStates[2].lines[1]);assert(documentStates[4].lines[2]>documentStates[3].lines[2]);checks+=5;
    for(const t of [2,4.5,6.8,9.5]){
     const cropped=await page.evaluate(async t=>{await seek(t);return [...document.querySelectorAll('[data-example]')].filter(e=>!e.children.length&&e.textContent.trim()&&getComputedStyle(e).visibility!=='hidden').map(e=>({text:e.textContent,r:e.getBoundingClientRect().toJSON()})).filter(o=>o.r.x<0||o.r.y<0||o.r.right>C.W||o.r.bottom>C.H);},t);
     assert.deepEqual(cropped,[],`visible text must fit at ${fmt}/${t}`);checks++;
    }
    const words=await page.evaluate(()=>[C.word('line','еж'),C.word('line','ЁЖ сделал',{occurrence:1,offset:.25})]);assert.deepEqual(words,[0,3.25]);checks++;
    for(const expression of [()=>C.word('missing','a'),()=>C.word('line','missing'),()=>C.word('line','еж',{occurrence:2}),()=>C.word('line','дело',{occurrence:-1})]){
     await assert.rejects(page.evaluate(expression));checks++;
    }
    await page.evaluate(()=>{delete TL.marks['line.w3'];});await assert.rejects(page.evaluate(()=>C.word('line','дело')));checks++;
    const geo=await page.evaluate(async()=>{await seek(5);const hand=document.querySelector('[data-example="clock-hand"]');return {origin:getComputedStyle(hand).transformOrigin,body:document.querySelector('[data-example="clock"]').getBoundingClientRect().toJSON()};});
    assert.equal(geo.origin,'4px 38px');checks++;
    const geo2=await page.evaluate(async()=>{await seek(7.8);return document.querySelector('[data-example="clock"]').getBoundingClientRect().toJSON();});assert.deepEqual(geo.body,geo2);checks++;
   }
   const before=await page.evaluate(async()=>{await seek(3.45);return document.querySelector('#stage').outerHTML;});await page.evaluate(async()=>{await seek(9);await seek(.1);await seek(3.45);});
   assert.equal(await page.locator('#stage').evaluate(e=>e.outerHTML),before);checks++;
   if(kind==='handoff'){
    assert.equal(await page.locator('[data-example="document-label"]').evaluate(e=>e.parentElement.dataset.example),'document');checks++;
    const states=[];for(const t of [.0,0,.59,1,8.8,9.1,9.5])states.push(await page.evaluate(async t=>{await seek(t);const e=document.querySelector('[data-example="world"]');return {t,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,visible:getComputedStyle(e).visibility};},t));
    assert.equal(await page.evaluate(()=>C.enterExit(-.1,document.querySelector('[data-example=world]'),{from:0}).phase),'before');assert.equal(states[1].visible,'visible');assert(states[1].y>(fmt==='16x9'?1080:1920));assert.equal(states[4].visible,'visible');assert(states[5].x>states[4].x&&states[5].visible==='visible');assert.equal(states[6].visible,'hidden');checks+=6;
   }
   await page.evaluate(async()=>{await seek(3.45);});
   const stable=await page.screenshot();await page.evaluate(async()=>{await seek(8);await seek(.1);await seek(3.45);});const again=await page.screenshot();if(!again.equals(stable)){fs.writeFileSync(path.join(out,`${kind}-${fmt}-before.png`),stable);fs.writeFileSync(path.join(out,`${kind}-${fmt}-after.png`),again);assert.fail(`pixel mismatch: ${kind}/${fmt}; evidence ${out}`);}checks++;
   await page.screenshot({path:path.join(out,`${kind}-${fmt}.png`)});await page.close();
  }
 }
 // Continuous helper: explicit finite exit marks and positive durations are enforced.
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/film/index.html`);await page.evaluate(()=>window.READY);
 const pivots=await page.evaluate(async()=>{
  const e=C.reg(C.el('div',{class:'abs',style:'width:200px;height:100px;background:red'},C.stage),{x:100,y:100});
  C.hooks.after.push(t=>C.rotate(e,t*90));
  await seek(0);const a=e.getBoundingClientRect();const first=[a.x+a.width/2,a.y+a.height/2];
  await seek(1);const z=e.getBoundingClientRect();return [first,[z.x+z.width/2,z.y+z.height/2]];
 });assert.deepEqual(pivots[0],pivots[1]);checks++;
 const presence=await page.evaluate(async()=>{
  const e=C.reg(C.el('div',{class:'abs',style:'width:100px;height:100px;background:red'},C.stage),{x:100,y:100});
  C.hooks.after.push(t=>C.enterExit(t,e,{from:2,to:6,enterDuration:.4,exitDuration:.5}));
  const result=[];for(const t of [0,1,1.4,3,3.2,3.6]){await seek(t);const r=e.getBoundingClientRect();result.push({x:r.x,y:r.y,visible:getComputedStyle(e).visibility});}return result;
 });assert.equal(presence[0].visible,'hidden');assert(presence[1].y>1080);assert.equal(presence[2].y,100);assert.equal(presence[3].visible,'visible');assert(presence[4].x>presence[3].x);assert.equal(presence[5].visible,'hidden');checks+=6;
 const refuses=spawnSync(process.execPath,[path.join(skill,'scripts/pilot.mjs'),'task',root],{encoding:'utf8'});assert.equal(refuses.status,2);checks++;
 await assert.rejects(page.evaluate(()=>C.enterExit(0,C.stage,{from:0,to:Infinity})));checks++;
 await assert.rejects(page.evaluate(()=>C.enterExit(0,C.stage,{from:0,enterDuration:0})));checks++;
}finally{await browser.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({checks,evidence:out}));

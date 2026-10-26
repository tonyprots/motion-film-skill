// A shutter sample must keep the output frame's discrete caption page. Ordinary seeks must reset that clock.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const skill=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'motion-frame-clock-')),root=path.join(out,'project');
const init=spawnSync('sh',[path.join(skill,'scripts/init.sh'),root,'--preset','blank'],{encoding:'utf8',timeout:120000});
assert.equal(init.status,0,init.stdout+init.stderr);
fs.writeFileSync(path.join(root,'film/data.js'),`window.TL={duration:3,fps:30,bpm:60,formats:['9x16','16x9'],marks:{a:0,b:1.004,'a.w1':0,'b.w1':1.004,'a.end':1.004,'b.end':3,done:3}};window.BEATS={};window.VO=[];window.CAPS=[['a','OLD'],['b','NEW']];window.CAPW=[['a.w1'],['b.w1']];window.UI={};window.SVG_ASSETS={};`);
fs.writeFileSync(path.join(root,'film/film.js'),`CAPTIONS.karaoke({x:100,y:100,w:700,size:80,font:'Arial',frames:1,rise:0,blur:0,exit:'cut'});C.start();`);
const require=createRequire(path.join(root,'package.json')),{chromium}=require('playwright');
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+req.url.split('?')[0]);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream');fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();const results=[];
try{for(const fmt of ['9x16','16x9']){
  const page=await browser.newPage({viewport:fmt==='9x16'?{width:1080,height:1920}:{width:1920,height:1080}});
  await page.goto(`http://127.0.0.1:${server.address().port}/film/index.html?fmt=${fmt}`);await page.evaluate(()=>window.READY);
  for(const [name,sample,frame,expected] of [
    ['shutter after a page cut keeps the old frame page',1.007,1,'OLD'],
    ['shutter before a page cut keeps the new frame page',1.001,1.007,'NEW'],
    ['ordinary seek resets a previous shutter frame',1.3,null,'NEW'],
    ['ordinary backward seek resets a previous shutter frame',.8,null,'OLD']
  ]){
    const actual=await page.evaluate(async({sample,frame})=>{await window.seek(sample,...(frame==null?[]:[frame]));return {clock:C.frameTime,visible:[...document.querySelectorAll('.cap')].filter(n=>getComputedStyle(n).visibility!=='hidden').map(n=>n.textContent).join('')};},{sample,frame});
    try{assert.equal(actual.clock,frame??sample);assert.equal(actual.visible,expected);results.push({fmt,name,ok:true,actual});}
    catch(error){results.push({fmt,name,ok:false,actual,error:error.message});}
  }
  await page.close();
}}finally{await browser.close();await new Promise(r=>server.close(r));}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({passed:results.filter(x=>x.ok).length,total:results.length,evidence:out,results},null,2));
if(results.some(x=>!x.ok))process.exitCode=1;

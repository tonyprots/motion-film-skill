// Create a NEW offline teaching project. Does not render, call providers or install dependencies.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
const pointer=path.join(here,'providers/.skill');
const skill=fs.existsSync(pointer)?fs.readFileSync(pointer,'utf8').trim():path.dirname(here);
const args=process.argv.slice(2),kind=args[0],dest=args[1];
const lang=args.includes('--lang')?args[args.indexOf('--lang')+1]:'en';
const postcard=['postcard-collage','postcard-riso'].includes(kind);
const product=kind==='product-cut';
if(!['task','handoff','edit'].includes(kind)&&!postcard&&!product||!dest||!['en','ru'].includes(lang)||args.slice(2).some((v,i)=>i%2===0?v!=='--lang':!['en','ru'].includes(v))){
  console.error('usage: node scripts/pilot.mjs task|handoff|edit|postcard-collage|postcard-riso|product-cut NEW_DIR [--lang en|ru]');process.exit(1);
}
const home=process.env.MOTION_FILM_HOME||path.join(os.homedir(),'.cache/motion-film');
if(!fs.existsSync(path.join(home,'venv/bin/python'))||['playwright','three','lottie-web'].some(n=>!fs.existsSync(path.join(home,'node_modules',n)))){
  console.error('Local runtime missing. First run init.sh for a project with network installation permitted. pilot never installs it.');process.exit(1);
}
const result=spawnSync('sh',[path.join(skill,'scripts/init.sh'),path.resolve(dest),'--preset','blank'],{stdio:'inherit',env:{...process.env,MOTION_FILM_OFFLINE:'1'}});
if(result.status!==0)process.exit(result.status||1);
const labels=lang==='ru'?{
 title:{task:'Пауза и продолжение',handoff:'Передача документа',edit:'Правка документа'}[kind],
 document:'Документ',ready:'Новая задача',working:'Идёт работа',paused:'Пауза · прогресс сохранён',done:'Готово · задача завершена',
 source:'Входящие',target:'Получено',illustration:'Учебный редактор',subject:'План встречи',old:'Обсудить всё',replacement:'Принять решение',saved:'✓ Правка сохранена'
}:{title:{task:'Pause. Resume. Complete.',handoff:'Passing a document',edit:'Edit the document'}[kind],document:'Document',ready:'New task',working:'Working',paused:'Paused · progress retained',done:'Complete · task finished',source:'Inbox',target:'Received',illustration:'Teaching editor',subject:'Meeting plan',old:'Discuss everything',replacement:'Make a decision',saved:'✓ Edit saved'};
const root=path.resolve(dest);
const duration=product ? 6.4 : postcard ? 6.6 : 10;
const marks={done:duration*2};
if (product) Object.assign(marks,{turn:4.8,replay:10.4});
const timeline={duration,fps:30,bpm:120,formats:['16x9','9x16'],marks,sfx:[],voiceover:null,
  music:{source:'none'},example:{kind,labels},styleframes:postcard?[1,4,7,10,12]:[2,9,16]};
if (product) {
  timeline.webgl=true;
  timeline.styleframes=[.5,3.2,4.8,7.4,11.4];
}
fs.writeFileSync(path.join(root,'timeline.json'),JSON.stringify(timeline,null,2)+'\n');
const examples=path.join(skill,'library/examples');
const sceneFiles=product || postcard ? [product ? kind : 'postcard'] : ['common',kind];
fs.writeFileSync(path.join(root,'film/film.js'),sceneFiles.map(n=>fs.readFileSync(path.join(examples,n+'.js'),'utf8')).join('\n'));
if (product) {
  fs.copyFileSync(path.join(examples,'product-cut-gl.js'),path.join(root,'film/product-cut-gl.js'));
  const htmlPath=path.join(root,'film/index.html');
  const modules={imports:{three:'/node_modules/three/build/three.module.js',
    'three/addons/':'/node_modules/three/examples/jsm/',
    postprocessing:'/node_modules/postprocessing/build/index.js'}};
  const scripts='<script type="importmap">'+JSON.stringify(modules)+'</script>\n'+
    '<script type="module" src="product-cut-gl.js"></script>';
  fs.writeFileSync(htmlPath,fs.readFileSync(htmlPath,'utf8').replace('</body>',scripts+'\n</body>'));
}
fs.writeFileSync(path.join(root,'SCRIPT.md'),lang==='ru'?'# Учебная сцена\n\nУсловная предметная иллюстрация. Без озвучки и субтитров.\n':'# Teaching scene\n\nGeneric object illustration. No voice or captions.\n');
const sync=spawnSync(process.execPath,['scripts/sync.mjs'],{cwd:root,stdio:'inherit'});if(sync.status!==0)process.exit(sync.status||1);
console.log(`Created ${root}. Next: cd to it; node scripts/render.mjs --draft --all; node scripts/render.mjs --verify --all`);

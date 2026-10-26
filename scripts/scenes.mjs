// Offline discovery; never installs packages, executes external code or contacts a registry.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = fs.existsSync(path.join(base, 'library/catalog.json')) ? path.join(base, 'library') : path.join(base, 'docs');
const read = (f) => JSON.parse(fs.readFileSync(path.join(folder, f), 'utf8'));
const local = read('catalog.json').items, registry = read('registry-index.json').items;
const sources = read('source-index.json').sources.map((s) => ({ ...s, id:'source:'+s.id, type:'source-family' }));
const all = [...local, ...registry, ...sources];
const args = process.argv.slice(2), command = args[0] || 'list';
const arg = (k, fallback) => { const i=args.indexOf('--'+k); return i<0?fallback:args[i+1]; };
const aliases = { 'число':'number','числа':'number','счётчик':'count','счетчик':'count','график':'chart','графики':'chart','данные':'data','диаграмма':'chart','диаграммы':'chart',
  'карта':'map','карты':'map','схема':'flow','связь':'connect','процесс':'process','очередь':'workflow','карточка':'cards','карточки':'cards','переход':'transition',
  'иконка':'icons','иконки':'icons','текст':'text','типографика':'type','иллюстрации':'illustrations','текстуры':'textures',
  'ведущий':'presenter','персонаж':'character','персонажи':'character','жест':'gestures','жесты':'gestures','волна':'wave',
  'письмо':'envelope','конверт':'envelope','сервер':'server','клавиатура':'keyboard','подарок':'gift','лицо':'face','запись':'record',
  'форма':'form','регистрация':'registration','рассылка':'email','подписка':'subscription','продление':'renewal','футер':'footer',
  'телефон':'phone','трубка':'phone','прослушка':'wiretap','календарь':'calendar','оплата':'payment','возврат':'refund','деньги':'money','монеты':'coins','штраф':'fine',
  'чат':'chat','сообщение':'message','штамп':'stamp','печать':'seal','решение':'decision','суд':'court','договор':'contract','замок':'lock','весы':'scales',
  'сессии':'sessions','записи':'recordings','камера':'camera','слежка':'surveillance','предмет':'objects','предметы':'objects',
  'массовка':'extras','второстепенный':'extras','второстепенные':'extras','ноутбук':'laptop','компьютер':'computer','книга':'book','книги':'books','ключ':'key',
  'лампочка':'bulb','часы':'clock','будильник':'alarm','машина':'automobile','автобус':'bus','самолёт':'airplane','самолет':'airplane','поезд':'train',
  'дом':'house','банк':'bank','больница':'hospital','таблетка':'pill','шприц':'syringe','лупа':'magnifying','портфель':'briefcase','сумка':'bag',
  'посылка':'package','коробка':'package','микрофон':'microphone','фотоаппарат':'camera','медаль':'medal','кубок':'trophy','огонь':'fire','бомба':'bomb',
  'ракета':'rocket','батарейка':'battery','магнит':'magnet','зонт':'umbrella','очки':'glasses','мешок':'bag','кошелёк':'purse','кошелек':'purse','чек':'receipt',
  'агент':'agent','агенты':'agent','бот':'bot','токены':'tokens','токен':'tokens','квота':'quota','баланс':'balance','тариф':'plans','тарифы':'plans',
  'лесенка':'ladder','ступени':'steps','слайды':'slides','презентация':'presentation','дека':'deck','воронка':'funnel','отбор':'filter',
  'команда':'team','инженер':'engineer','внедрение':'deployment','модель':'model','модели':'model','чип':'chip',
  'морфинг':'morph','превращение':'morph','перенос':'handoff','стык':'continuity',
  'шейдер':'shader','математика':'math','сравнение':'comparison','до':'before','после':'after','документ':'file','люди':'users' };
function words(s) { return s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((w)=>aliases[w]||w); }
const rank = (item) => ({ready:0,component:1,asset:2,external:3}[item.status] ?? 4);
function search(query) {
  const q=words(query);
  return all.map((item)=>{
    const hay=words([item.id,item.name,item.description,item.category,...(item.tags||[])].join(' '));
    const score=q.reduce((n,w)=>n+(hay.some((v)=>v===w||(w.length>=3&&v.includes(w)))?1:0),0);
    return{item,score};
  }).filter((r)=>!q.length||r.score>0).sort((a,b)=>b.score-a.score||rank(a.item)-rank(b.item)||a.item.id.localeCompare(b.item.id)).map((r)=>r.item);
}
try {
  if(command==='counts') {
    console.log(JSON.stringify({native:local.filter(x=>x.status==='ready').length,components:local.filter(x=>x.status==='component').length,local_svg:local.filter(x=>x.status==='asset').length,
      external_registry:registry.length,source_families:sources.length},null,2));
  } else if(command==='show') {
    const item=all.find((x)=>x.id===args[1]); if(!item)throw new Error('unknown item id'); console.log(JSON.stringify(item,null,2));
  } else if(command==='copy') {
    const item=local.find((x)=>x.id===args[1]&&x.status==='asset');if(!item)throw new Error('copy accepts a local SVG asset id only');
    const source=fs.existsSync(path.join(base,item.asset))?path.join(base,item.asset):path.join(base,'library',item.asset);
    const target=path.resolve(process.cwd(),arg('to',''));
    if(!arg('to')||!target.startsWith(process.cwd()+path.sep))throw new Error('--to must be a path inside the current project');
    if(fs.existsSync(target))throw new Error('refusing to overwrite an existing file');
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);console.log(target);
  } else if(command==='list'||command==='search') {
    let items=search(command==='search'?(args[1]||''):'');
    if(arg('status'))items=items.filter(x=>x.status===arg('status'));
    if(arg('category'))items=items.filter(x=>x.category===arg('category'));
    const limit=Number(arg('limit',20));if(!Number.isInteger(limit)||limit<1||limit>2000)throw new Error('--limit must be 1..2000');
    console.log(JSON.stringify({total:items.length,shown:Math.min(limit,items.length),items:items.slice(0,limit)},null,2));
  } else throw new Error('usage: scenes.mjs counts | list | search "words" | show id | copy icon:id --to assets/file.svg');
} catch(e) { console.error(e.message);process.exitCode=1; }

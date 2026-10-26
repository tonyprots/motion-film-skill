// The handoff must preserve endpoints/identity, be history-free, and refuse malformed geometry or timing.
const assert=require('node:assert/strict');
const M=require('../engine/lib/morph.js');
let checks=0;
const cases=[
  {from:M.rect(70,100,180,280),to:M.rect(620,270,260,180,14),at:2,duration:1.4,arc:100},
  {from:M.circle([100,80],18),to:M.rect(260,260,490,310,28),at:.7,duration:.8,arc:70},
  {from:[[0,0],[50,0],[80,130],[-10,75]],to:M.rect(250,350,400,120).reverse(),at:0,duration:2,arc:90}
];
for(const spec of cases){
  const a=JSON.parse(JSON.stringify(spec.from)),b=JSON.parse(JSON.stringify(spec.to)),h=M.handoff(spec);
  assert.deepEqual(h.at(spec.at),a);assert.deepEqual(h.at(spec.at+spec.duration),b);checks+=2;
  assert.equal(M.check(h.at(h.end),b,0),0);checks++;
  const times=[spec.at-.1,spec.at+.02*spec.duration,spec.at+.31*spec.duration,spec.at+.63*spec.duration,h.end+.1];
  const first=times.map(t=>h.at(t));
  for(let i=times.length-1;i>=0;i--){h.at(times[(i+2)%times.length]);assert.deepEqual(h.at(times[i]),first[i]);assert.ok(h.at(times[i]).flat().every(Number.isFinite));}checks++;
  const centre=h.centre(spec.at+spec.duration/2);assert.ok(centre[1]<(M.centre(a)[1]+M.centre(b)[1])/2);checks++;
  const returned=h.at(h.end);returned[0][0]+=10000;spec.from[0][0]+=30;spec.to[0][0]+=30;assert.deepEqual(h.at(h.end),b);assert.deepEqual(h.at(spec.at),a);checks++;
}
const from=M.circle([0,0],10),to=M.rect(100,100,50,50);
for(const spec of [{duration:0},{duration:NaN},{at:Infinity},{at:1e308,duration:1e308},{arc:NaN},{turn:[.8,.2]},{turn:[-.1,1]},{points:0},{points:NaN},{from:[]},{to:[[0,0],[1,1],[2,2]]},{stretch:Infinity}]){assert.throws(()=>M.handoff({from,to,...spec}));checks++;}
assert.throws(()=>M.handoff({from,to}).at(NaN));assert.throws(()=>M.check(from,to,NaN));assert.throws(()=>M.check(from,to,2));checks+=3;
console.log(`MORPH OK: ${checks} geometry/timing contracts`);

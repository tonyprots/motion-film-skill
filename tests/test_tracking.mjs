// Discrete sampling, loss gaps and cover coordinates must be independent of seek order.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const hooks = [], states = new Map();
const C = { gates: [], hooks: { before: hooks }, reg: () => {}, put: (element, props) => states.set(element, props) };
const context = { window: {}, C };
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../engine/lib/tracking.js', import.meta.url), 'utf8'), context);
const T = context.window.TRACKING;
const track = { version: 1, source: { fps: 24, frames: 4, width: 640, height: 360 },
  samples: [{x:100,y:180,status:'tracked'}, {x:null,y:null,status:'lost'},
    {x:null,y:null,status:'recovering'}, {x:130,y:180,status:'tracked'}] };
T.validate(track);
for (const frame of [3, 0, 2, 1, 0, 3]) {
  const point = T.sample(track, frame / 24);
  assert.equal(point?.x ?? null, track.samples[frame].x);
}
assert.equal(T.sample(track, 1.99 / 24), null); // never interpolate to the later recovered point
assert.equal(T.sample(track, -1), null);
assert.equal(T.sample(track, 4 / 24), null);
assert.equal(T.sample(track, 10 + 3 / 24, 10).x, 130);
assert.equal(T.project(track, {x:100,y:180}, {x:10,y:20,w:320,h:180}).x, 60);
assert.equal(T.project(track, {x:0,y:180}, {x:0,y:0,w:180,h:320}), null); // outside cover crop
const label = {};
T.follow(label, track, {box:{x:0,y:0,w:640,h:360}, dy:-30});
context.window.FRAME_T = 3 / 24;
hooks[0](0); // motion-blur subframe cannot choose another video frame
assert.equal(states.get(label).x, 130);
assert.equal(states.get(label).y, 150);
context.window.FRAME_T = 1 / 24;
hooks[0](3 / 24);
assert.equal(states.get(label).o, 0);
C.FMT = '9x16';
C.REC = {x:0,y:0,w:180,h:320};
C.TL = {recording: {offset:10, layout:{'9x16':{focus:[0,.5]}}}};
const recordingLabel = {};
T.follow(recordingLabel, track);
context.window.FRAME_T = 10;
hooks[1](0);
assert.equal(states.get(recordingLabel).o, 1);
assert.ok(Math.abs(states.get(recordingLabel).x - 100 * 320 / 360) < 1e-6);
context.window.FRAME_T = 0;
hooks[1](10);
assert.equal(states.get(recordingLabel).o, 0);
assert.throws(() => T.validate({...track, samples: [{x:NaN,y:4}]}));
console.log('tracking helper: discrete sampling, gaps, cover crop and shutter alignment OK');

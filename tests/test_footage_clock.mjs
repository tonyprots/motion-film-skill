// Encoded footage already has a shutter: all render samples must show one decoded source frame.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../engine/lib/footage.js', import.meta.url), 'utf8');
const checks = [];
for (const format of ['16x9', '9x16']) {
  let resolveDecode;
  const decoded = new Promise(resolve => { resolveDecode = resolve; });
  const images = [];
  const C = {
    TL: { broll: [{ id: 'bridge', at: 'start', _out: { [format]: { fps: 24, frames: 48 } } }] },
    FMT: format, W: 1920, H: 1080, stage: {}, bt: () => 1,
    hooks: { before: [] }, pending: [],
    el: () => {
      const image = { style: {}, decode: () => decoded };
      images.push(image);
      return image;
    }
  };
  const window = {};
  vm.runInNewContext(source, { C, window });
  const sample = (time, frame) => {
    window.FRAME_T = frame;
    C.pending = [];
    C.hooks.before[0](time);
    return { src: images[0].src, visible: images[0].style.display !== 'none', waits: C.pending.length };
  };
  for (const [name, time, frame, expected] of [
    ['shutter crossing a source-frame boundary', 1.045, 1.02, { src: '../assets/broll/bridge_' + format + '/0001.jpg', visible: true, waits: 1 }],
    ['same frame still waits for decoding', 1.02, 1.02, { src: '../assets/broll/bridge_' + format + '/0001.jpg', visible: true, waits: 1 }],
    ['shutter before the clip starts', 0.999, 1.001, { src: '../assets/broll/bridge_' + format + '/0001.jpg', visible: true, waits: 1 }],
    ['shutter after the clip ends', 3.001, 2.999, { src: '../assets/broll/bridge_' + format + '/0048.jpg', visible: true, waits: 1 }],
    ['ordinary backward seek', 1.5, undefined, { src: '../assets/broll/bridge_' + format + '/0013.jpg', visible: true, waits: 1 }],
    ['outside clip', 3.01, 3.01, { src: '../assets/broll/bridge_' + format + '/0013.jpg', visible: false, waits: 0 }]
  ]) {
    const actual = sample(time, frame);
    try { assert.deepEqual(actual, expected); checks.push({ format, name, ok: true }); }
    catch (error) { checks.push({ format, name, ok: false, actual, expected }); }
  }
  resolveDecode();
}
console.log(JSON.stringify({ passed: checks.filter(c => c.ok).length, total: checks.length, checks }, null, 2));
if (checks.some(c => !c.ok)) process.exitCode = 1;

// Неполный рендер не заменяет готовое видео; сбой процесса не считается успехом.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { runChecked, watchEncoder, writeFrame, workerExitError, stagingPath, probeVideo, publishVideos } from '../scripts/render_safety.mjs';

const base = fs.mkdtempSync(path.join(process.env.MF_TEST_OUTPUT || os.tmpdir(), 'mf-render-failure-'));
const output = path.join(base, 'final.mp4'), master = path.join(base, 'final_master.mp4');
const expected = { frames: 10, fps: 10, width: 32, height: 32 };
const encode = (file, color) => runChecked('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i',
  `color=c=${color}:s=32x32:r=10`, '-frames:v', '10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
encode(output, 'red');
fs.copyFileSync(output, master);
const old = fs.readFileSync(output), broken = stagingPath(output);
fs.writeFileSync(broken, 'incomplete');
assert.throws(() => publishVideos([{ staged: broken, output, expected }]));
assert.deepEqual(fs.readFileSync(output), old);
assert.deepEqual(fs.readFileSync(master), old);

const staged = stagingPath(output);
assert.notEqual(staged, stagingPath(output));
encode(staged, 'blue');
assert.throws(() => publishVideos([{ staged, output, expected }, { staged: broken, output: master, expected }]));
assert.deepEqual(fs.readFileSync(output), old, 'bad master leaves both previous outputs unchanged');
assert.throws(() => probeVideo(staged, { ...expected, frames: 11 }));
const archives = publishVideos([{ staged, output, expected }]);
assert.equal(archives.length, 1);
assert.deepEqual(fs.readFileSync(archives[0]), old);
assert.notDeepEqual(fs.readFileSync(output), old);
assert.equal(probeVideo(output, expected).frames, 10);

assert.throws(() => runChecked(process.execPath, ['-e', 'process.kill(process.pid, "SIGTERM")']));
assert.throws(() => runChecked('motion-film-command-does-not-exist', []));
assert.throws(() => runChecked(process.execPath, ['-e', 'process.exit(7)']));

const missing = watchEncoder(spawn('motion-film-command-does-not-exist', [], { stdio: ['pipe', 'ignore', 'ignore'] }));
await assert.rejects(missing.done);
const success = watchEncoder(spawn('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
  '-s', '16x16', '-framerate', '10', '-i', '-', '-f', 'null', '-'], { stdio: ['pipe', 'ignore', 'ignore'] }));
await writeFrame(success.p.stdin, Buffer.alloc(16 * 16 * 3));
success.p.stdin.end();
await success.done;

const killed = watchEncoder(spawn('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
  '-s', '16x16', '-framerate', '10', '-i', '-', '-f', 'null', '-'], { stdio: ['pipe', 'ignore', 'ignore'] }));
await once(killed.p, 'spawn');
const writing = writeFrame(killed.p.stdin, Buffer.alloc(8 * 1024 * 1024));
writing.catch(() => {});
killed.p.kill('SIGTERM');
const timer = setTimeout(() => { throw new Error('encoder write did not settle after process death'); }, 3000);
await assert.rejects(killed.done);
await assert.rejects(writing);
clearTimeout(timer);
assert.equal(killed.p.stdin.listenerCount('close'), 0);

for (const [code, signal, state, shouldFail] of [
  [0, null, { pending: 2, quitting: false }, true],
  [0, null, { pending: null, quitting: false }, true],
  [null, 'SIGTERM', { pending: 2, quitting: false }, true],
  [1, null, { pending: null, quitting: true }, true],
  [0, null, { pending: null, quitting: true }, false],
]) assert.equal(!!workerExitError(code, signal, state), shouldFail);

const early = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
const [code, signal] = await once(early, 'exit');
assert.ok(workerExitError(code, signal, { pending: 0, quitting: false }));
fs.writeFileSync(path.join(base, 'result.json'), JSON.stringify({ status: 'PASS', checks: [
  'invalid/truncated staged file preserves final', 'invalid master preserves both finals',
  'exact frame count', 'successful replacement archives old bytes', 'spawn/error/signal/nonzero reject',
  'encoder success', 'pending write rejects after SIGTERM', 'premature worker exit 0 rejects',
] }, null, 2) + '\n');
console.log(`render safety: PASS; evidence: ${base}`);

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export function runChecked(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: ['ignore', 'inherit', 'pipe'], ...options });
  if (result.error || result.status !== 0 || result.signal) {
    throw new Error(`${cmd} failed (${result.signal || result.status}): ${result.error?.message || result.stderr || ''}`);
  }
  return result;
}

export function watchEncoder(p) {
  let fail;
  const done = new Promise((resolve, reject) => {
    fail = reject;
    p.once('error', reject);
    p.once('close', (code, signal) => {
      if (code !== 0 || signal) reject(new Error(`ffmpeg exited with ${signal || code}`));
      else resolve();
      if (!p.stdin.destroyed) p.stdin.destroy();
    });
  });
  // Рендер ещё может ждать кадр Chromium; ошибка сохраняется до await done.
  done.catch(() => {});
  p.stdin.on('error', fail);
  return { p, done };
}

export function writeFrame(stream, buffer) {
  return new Promise((resolve, reject) => {
    if (stream.destroyed || !stream.writable) return reject(new Error('encoder input is closed'));
    const finish = (error) => {
      stream.off('error', onError);
      stream.off('close', onClose);
      error ? reject(error) : resolve();
    };
    const onError = (error) => finish(error);
    const onClose = () => finish(new Error('encoder input closed before the frame was written'));
    stream.once('error', onError);
    stream.once('close', onClose);
    stream.write(buffer, finish);
  });
}

export function workerExitError(code, signal, { pending, quitting }) {
  if (code !== 0 || signal || pending !== null || !quitting) {
    return new Error(`render worker exited with ${signal || code}; pending chunk: ${pending ?? 'none'}`);
  }
  return null;
}

export function stagingPath(output) {
  return path.join(path.dirname(output), `.render-${randomUUID()}.mp4`);
}

export function probeVideo(file, expected = null) {
  const result = runChecked('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,avg_frame_rate,nb_read_frames,duration', '-of', 'json', file],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
  // ffprobe может закончить с 0 даже при частично повреждённом потоке.
  if (result.stderr.trim()) throw new Error(`video probe failed: ${result.stderr.trim()}`);
  const stream = JSON.parse(result.stdout).streams?.[0];
  const [num, den] = (stream?.avg_frame_rate || '0/0').split('/').map(Number);
  const spec = { frames: Number(stream?.nb_read_frames), fps: num / den,
    duration: Number(stream?.duration), width: Number(stream?.width), height: Number(stream?.height) };
  if (!Number.isInteger(spec.frames) || spec.frames <= 0 || !Number.isFinite(spec.fps) || spec.fps <= 0 ||
      !Number.isFinite(spec.duration) || spec.duration <= 0) throw new Error(`invalid video: ${file}`);
  if (expected && (spec.frames !== expected.frames || Math.abs(spec.fps - expected.fps) > 0.001 ||
      Math.abs(spec.duration - expected.frames / expected.fps) > 1 / expected.fps + 0.001 ||
      (expected.width && spec.width !== expected.width) || (expected.height && spec.height !== expected.height))) {
    throw new Error(`video does not match expected frames/rate/size: ${file} (${JSON.stringify(spec)})`);
  }
  return spec;
}

export function publishVideos(outputs) {
  // Все варианты проверяются до замены первого файла. Старые финалы сохраняются.
  for (const { staged, expected } of outputs) probeVideo(staged, expected);
  const archives = [];
  for (const { output } of outputs) {
    if (!fs.existsSync(output)) continue;
    const folder = path.join(path.dirname(output), 'archive');
    fs.mkdirSync(folder, { recursive: true });
    const backup = path.join(folder, `${path.basename(output, '.mp4')}-${Date.now()}-${randomUUID()}.mp4`);
    fs.copyFileSync(output, backup, fs.constants.COPYFILE_EXCL);
    archives.push(backup);
  }
  for (const { staged, output } of outputs) fs.renameSync(staged, output);
  return archives;
}

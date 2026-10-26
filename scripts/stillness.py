"""Find stretches where the picture stops changing: stillness.py <video.mp4> [--mask 0,0.2] [--min 1.0] [--json out]

A viewer reads a frame as "stuck" when nothing new happens for about a second, even if a caption ticks, the camera
creeps or a character breathes. So the check compares each frame with the frame `--lag` seconds earlier on a small grey
copy and takes the share of pixels that changed by more than `--delta` (0–255). Bands given with --mask (fractions of
the height, e.g. the caption band 0,0.2) are ignored. If even the busiest frame of a `--min`-second window stays under
`--thr`, that window is still; overlapping still windows merge into one STILL range.

Calibrated on one 70-second 9:16 pair (2026-10-26): every stretch three blind critics called static in our film peaked
at 2–5 % changed pixels per second; the reference film never dropped under 9 % except its closing hold. It is a
pointer for the critic and the author, not a gate: a deliberate hold (end card, a beat of silence) is legitimate.
"""
import argparse, json, subprocess, sys

import numpy as np

p = argparse.ArgumentParser()
p.add_argument('video')
p.add_argument('--mask', action='append', default=[], help='ignored band as y0,y1 fractions of height; repeatable')
p.add_argument('--min', type=float, default=1.0, help='shortest stretch to report, seconds')
p.add_argument('--lag', type=float, default=0.5, help='compare with the frame this many seconds earlier')
p.add_argument('--delta', type=int, default=18, help='per-pixel change that counts, 0–255')
p.add_argument('--thr', type=float, default=0.045, help='share of changed pixels below which the frame is still')
p.add_argument('--fps', type=int, default=10)
p.add_argument('--json')
a = p.parse_args()

W, H = 72, 128
probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                        '-of', 'csv=p=0', a.video], capture_output=True, text=True, check=True).stdout.strip().split(',')
vw, vh = int(probe[0]), int(probe[1])
if vw > vh: W, H = 128, 72
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', a.video, '-vf', f'fps={a.fps},scale={W}:{H},format=gray',
                      '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.int16)
keep = np.ones(H, bool)
for band in a.mask:
    y0, y1 = (float(v) for v in band.split(','))
    keep[int(y0 * H):int(round(y1 * H))] = False
lag = max(1, round(a.lag * a.fps))
share = np.ones(len(frames))
for i in range(lag, len(frames)):
    share[i] = (np.abs(frames[i] - frames[i - lag])[keep] > a.delta).mean()
win = max(1, round(a.min * a.fps))
spans = []
for i in range(lag, len(frames) - win + 1):
    if share[i:i + win].max() < a.thr:
        t0, t1 = round(i / a.fps, 2), round((i + win) / a.fps, 2)
        if spans and t0 <= spans[-1][1]: spans[-1] = (spans[-1][0], t1)
        else: spans.append((t0, t1))

for t0, t1 in spans:
    print(f'STILL  {t0:6.2f}–{t1:6.2f} s  ({t1 - t0:.1f} s, under {a.thr:.1%} of the frame changes per {a.min:g} s)')
print(f'stillness: {len(frames) / a.fps:.1f} s checked at {a.fps} fps, mask {a.mask or "none"} · {len(spans)} STILL')
if a.json:
    json.dump({'spans': spans, 'params': vars(a)}, open(a.json, 'w'), indent=1)
sys.exit(1 if spans else 0)

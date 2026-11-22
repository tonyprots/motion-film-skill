"""Flag low whole-frame change for review. A small object can still change state inside a STILL range.

Compare sampled grayscale frames separated by --lag, excluding --mask bands. If the changed fraction
stays under --thr throughout a --min window, merge it with adjacent flagged windows. Optional --pairs
writes full-colour before/after samples from the encoded video; --region selects the subject for review.
"""
import argparse, json, subprocess, sys
from pathlib import Path
from tempfile import TemporaryDirectory

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
p.add_argument('--pairs', type=Path, metavar='DIR', help='save before/after images in a new or empty directory')
p.add_argument('--region', metavar='X0,Y0,X1,Y1', help='crop the evidence to these frame fractions; detection stays unchanged')
a = p.parse_args()
crop = ''
if a.region:
    if not a.pairs:
        p.error('--region needs --pairs DIR')
    try:
        x0, y0, x1, y1 = map(float, a.region.split(','))
    except ValueError:
        p.error('--region expects x0,y0,x1,y1')
    if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
        p.error('--region must be a positive rectangle within 0..1')
    crop = f"crop=w='max(1,iw*{x1-x0})':h='max(1,ih*{y1-y0})':x=iw*{x0}:y=ih*{y0}:exact=1,"
if a.pairs and a.pairs.exists() and (not a.pairs.is_dir() or any(a.pairs.iterdir())):
    p.error('--pairs needs a new or empty directory')
if a.fps <= 0:
    p.error('--fps must be positive')

W, H = 72, 128
probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                        '-of', 'csv=p=0', a.video], capture_output=True, text=True, check=True).stdout.strip().split(',')
vw, vh = int(probe[0]), int(probe[1])
if vw > vh: W, H = 128, 72
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', a.video, '-map', '0:v:0', '-vf', f'fps={a.fps},scale={W}:{H},format=gray',
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

def write_pairs():
    from PIL import Image, ImageDraw

    # Use the detector's fps filter and exactly its sample indices, including an EOF hold.
    indices = [(min(len(frames) - 1, round(t0 * a.fps)), min(len(frames) - 1, round(t1 * a.fps) - 1))
               for t0, t1 in spans]
    needed = sorted({i for pair in indices for i in pair})
    a.pairs.mkdir(parents=True, exist_ok=True)
    select = '+'.join(f'eq(n,{i})' for i in needed)
    filters = f"fps={a.fps},select='{select}',{crop}scale=w='min(iw,640)':h='min(ih,640)':force_original_aspect_ratio=decrease"
    with TemporaryDirectory() as tmp:
        subprocess.run(['ffmpeg', '-v', 'error', '-i', a.video, '-map', '0:v:0', '-vf', filters,
                        '-fps_mode', 'vfr', str(Path(tmp) / '%06d.png')], check=True)
        files = dict(zip(needed, sorted(Path(tmp).glob('*.png')), strict=True))
        for number, (first, last) in enumerate(indices, 1):
            with Image.open(files[first]) as before, Image.open(files[last]) as after:
                width, height = before.size
                board = Image.new('RGB', (2 * width + 2, height + 24), '#202020')
                board.paste(before, (0, 24))
                board.paste(after, (width + 2, 24))
                label = ImageDraw.Draw(board)
                for x, idx in ((0, first), (width + 2, last)):
                    label.text((x + 2, 5), f'{idx / a.fps:.3f} s', fill='white')
                path = a.pairs / f'still-{number:03d}.png'
                with path.open('xb') as output:
                    board.save(output, format='PNG')
                print(f'PAIR {spans[number-1][0]:.2f}-{spans[number-1][1]:.2f} s  {path}')


for t0, t1 in spans:
    print(f'STILL  {t0:6.2f}–{t1:6.2f} s  ({t1 - t0:.1f} s, under {a.thr:.1%} of unmasked pixels change across {lag / a.fps:g} s)')
print(f'stillness: {len(frames) / a.fps:.1f} s checked at {a.fps} fps, mask {a.mask or "none"} · {len(spans)} STILL')
if spans and a.pairs:
    try:
        write_pairs()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        p.exit(2, f'could not finish STILL pairs: {error}\n')
if a.json:
    params = {k: v for k, v in vars(a).items() if k not in ('pairs', 'region')}
    if a.pairs:
        params.update(pairs=str(a.pairs), region=a.region)
    with open(a.json, 'w') as out:
        json.dump({'spans': spans, 'params': params}, out, indent=1)
sys.exit(1 if spans else 0)

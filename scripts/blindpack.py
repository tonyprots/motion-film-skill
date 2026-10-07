#!/usr/bin/env python3
"""Blind-read pack: what a viewer who knows nothing about the film gets from it. Run from the project root.
  python3 scripts/blindpack.py <round> [--draft] [--fmt 16x9]
Writes review/blind_r<round>/ and NOTHING else goes to the reader:
  sheet_<k>.jpg   one frame per beat at 0.72 of the beat, cut from the ENCODED video, 12 per sheet (3 × 4), timestamps
  text.md         every text a viewer can read, with its time and where it is (caption / in the scene), no author notes;
                  a film without burned-in captions gets the voice as "voice (heard)" rows
  BRIEF.md        the reader's brief (reference/BLIND.md → the prompt part)
The reader is a fresh agent that opens only this folder: no SCRIPT.md, no brief, no code, no previous rounds. A reader who
saw round N is no longer blind for round N+1. Then compare the reader's thesis and chain with ## STORY (reference/BLIND.md)."""
import json, os, shutil, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

A = sys.argv[1:]
R = next((a for i, a in enumerate(A) if not a.startswith('--') and (i == 0 or A[i - 1] != '--fmt')), '1')
DRAFT = '--draft' in sys.argv
TL = json.load(open('timeline.json'))
FMT = sys.argv[sys.argv.index('--fmt') + 1] if '--fmt' in sys.argv else TL['formats'][0]
SRC = f"renders/{'draft_' if DRAFT else ''}{FMT}.mp4"
if not os.path.exists(SRC): sys.exit(f'{SRC} missing: node scripts/render.mjs {"--draft " if DRAFT else ""}--fmt {FMT}')
HERE = os.path.dirname(os.path.abspath(__file__))   # in a project copy, providers/.skill (init.sh) points back at the skill
SKILL = open(os.path.join(HERE, 'providers', '.skill')).read().strip() if os.path.exists(os.path.join(HERE, 'providers', '.skill')) else os.path.dirname(HERE)
OUT = f'review/blind_r{R}'
if os.path.exists(OUT): shutil.rmtree(OUT)
os.makedirs(OUT)

# text a viewer can read: the lint pass at 0.72 of each beat (same times as the frames)
lint = subprocess.run(['node', 'scripts/render.mjs', '--lint', '--fmt', FMT, '--phase', '0.72'], capture_output=True, text=True)
if not os.path.exists(f'review/text_{FMT}.json'): sys.exit('render.mjs --lint wrote no review/text_<fmt>.json:\n' + lint.stdout[-1500:] + lint.stderr[-1500:])
beats = json.load(open(f'review/text_{FMT}.json'))
times = [b['t'] for b in beats]

r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'json', SRC], capture_output=True, text=True)
s = json.loads(r.stdout)['streams'][0]; W, H = s['width'], s['height']; n, d = map(int, s['r_frame_rate'].split('/')); FPS = n / d
tw = 640 if W >= H else 300; th = int(tw * H / W) // 2 * 2
idx = sorted({int(round(t * FPS)) for t in times})
sel = '+'.join(f'eq(n\\,{i})' for i in idx)
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', SRC, '-vf', f"select='{sel}',scale={tw}:{th}:flags=area", '-vsync', '0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                     capture_output=True, check=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, th, tw, 3)
if len(fr) < 0.95 * len(idx): sys.exit(f'decoded {len(fr)} of {len(idx)} frames: the pack would be incomplete')
try: FONT = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 16)
except Exception: FONT = ImageFont.load_default()
COLS, ROWS, pad, lab = 3, 4, 8, 24
for k in range(0, len(fr), COLS * ROWS):
    chunk = fr[k:k + COLS * ROWS]; rows = (len(chunk) + COLS - 1) // COLS
    S = Image.new('RGB', (COLS * (tw + pad) + pad, rows * (th + lab + pad) + pad), (24, 24, 24)); dr = ImageDraw.Draw(S)
    for j, f in enumerate(chunk):
        x = pad + (j % COLS) * (tw + pad); y = pad + (j // COLS) * (th + lab + pad)
        S.paste(Image.fromarray(f), (x, y + lab)); dr.text((x + 2, y + 4), f'{idx[k + j] / FPS:6.2f}s', fill=(235, 235, 235), font=FONT)
    S.save(f'{OUT}/sheet_{k // (COLS * ROWS) + 1:02d}.jpg', quality=86)

# text table: a row when something new becomes readable, consecutive repeats folded
rows, last = [], {}
for b in beats:
    for it in b['text']:
        key = (it['where'], it['text'])
        if key not in last or b['t'] - last[key] > 1.5: rows.append((b['t'], it['where'], it['text']))
        last[key] = b['t']
# the voice: a viewer with sound hears it. If the film burns no captions, the heard text goes in as "voice" rows.
if not any(w == 'caption' for _, w, _ in rows) and os.path.exists('audio/vo_placed.json'):
    rows += [(p['t0'], 'voice (heard)', p['text']) for p in json.load(open('audio/vo_placed.json', encoding='utf-8'))]
    rows.sort(key=lambda r: r[0])
with open(f'{OUT}/text.md', 'w', encoding='utf-8') as f:
    f.write('| time | where | text on screen |\n|---|---|---|\n')
    for t, w, txt in rows: f.write(f"| {t:.2f}s | {w} | {txt.replace('|', '/')} |\n")

brief = open(os.path.join(SKILL, 'reference', 'BLIND.md'), encoding='utf-8').read()
cut = brief.find('<!-- reader -->')
open(f'{OUT}/BRIEF.md', 'w', encoding='utf-8').write(brief[cut + len('<!-- reader -->'):].strip() + '\n' if cut >= 0 else brief)
print(f'{OUT}/: {len(fr)} frames on {(len(fr) + 11) // 12} sheets, {len(rows)} text rows, BRIEF.md · from {SRC}')
print('Next: a FRESH agent reads only this folder (BRIEF.md says how); then compare with ## STORY (reference/BLIND.md).')

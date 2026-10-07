#!/usr/bin/env python3
"""A light copy of a final for chats (Telegram, mail): same picture and sound, under a size budget. Run from the project root.
  python3 scripts/share.py [--fmt 16x9 | --all] [--mb 10] [--fps 30]
Writes renders/<fmt>_share.mp4: H.264 at --fps (default 30: a chat player shows no difference), CRF climbing from 20 until
the file fits --mb (default 10 MB), AAC 160k, bt709 tags, fast start. The 60 fps master stays the deliverable; this is the
copy that opens instantly on a phone."""
import json, os, subprocess, sys
TL = json.load(open('timeline.json'))
arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
FMTS = TL['formats'] if '--all' in sys.argv else [arg('--fmt', TL['formats'][0])]
MB, FPS = float(arg('--mb', 10)), int(arg('--fps', 30))
for f in FMTS:
    src, out = f'renders/{f}.mp4', f'renders/{f}_share.mp4'
    if not os.path.exists(src): sys.exit(f'{src} missing: render the final first')
    for crf in range(20, 36, 2):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vf', f'fps={FPS},setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709', '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf), '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], check=True)
        size = os.path.getsize(out) / 1e6
        if size <= MB: break
    print(f"{out}: {size:.1f} MB (CRF {crf}, {FPS} fps){'' if size <= MB else f'  — still over {MB} MB at CRF {crf}: pass --fps 24 or a larger --mb'}")

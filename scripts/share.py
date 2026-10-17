#!/usr/bin/env python3
"""A light copy of a final for chats (Telegram, mail): same picture and sound, under a size budget. Run from the project root.
  python3 scripts/share.py [--fmt 16x9 | --all] [--mb 10] [--fps 30]
Writes renders/<fmt>_share.mp4: H.264 at --fps (default 30: a chat player shows no difference), CRF climbing from 20 until
the file fits --mb (default 10 MB), AAC 160k, bt709 tags, fast start. The 60 fps master stays the deliverable; this is the
copy that opens instantly on a phone.

  python3 scripts/share.py --gif [--fmt 16x9 | --all] [--width 720] [--gif-fps 15] [--mb 10] [--range 0,8]
Writes renders/<fmt>.gif (no sound; loops): a palette per clip (ffmpeg palettegen, stats_mode=diff: the colours of what
moves win), ordered dither with rectangle diff (only the changed region is re-encoded per frame, which keeps a still
background cheap). Starts at --width px wide and --gif-fps (default 720 px, 15 fps) and steps width, then frame rate down
(to 320 px, 8 fps) until the file fits --mb. A whole film rarely fits a chat GIF: cut a moment with --range a,b (seconds).
  --src FILE [--out FILE]   any video instead of renders/<fmt>.mp4 (no timeline.json needed), for --gif and the MP4 copy;
                            without --out the copy goes to the current folder"""
import json, os, subprocess, sys

arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
SRC = arg('--src', None)
if SRC:
    FMTS = [None]
else:
    if not os.path.exists('timeline.json'): sys.exit('timeline.json missing: run from the project root, or pass --src FILE')
    TL = json.load(open('timeline.json'))
    FMTS = TL['formats'] if '--all' in sys.argv else [arg('--fmt', TL['formats'][0])]
MB, FPS = float(arg('--mb', 10)), int(arg('--fps', 30))
GIF = '--gif' in sys.argv or arg('--format', '') == 'gif'
RANGE = [float(x) for x in arg('--range', '').split(',')] if '--range' in sys.argv else None


def gif(src, out):
    w0, f0 = int(arg('--width', 720)), int(arg('--gif-fps', 15))
    widths = [w0] + [w for w in (640, 560, 480, 400, 360, 320) if w < w0]
    rates = [f0] + [f for f in (12, 10, 8) if f < f0]
    tries = [(w, f0) for w in widths] + [(widths[-1], f) for f in rates[1:]]
    cut = ['-ss', f'{RANGE[0]}', '-t', f'{RANGE[1] - RANGE[0]}'] if RANGE else []
    for n, (w, f) in enumerate(tries):
        vf = (f'fps={f},scale={w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=diff[p];'
              f'[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', *cut, '-i', src, '-filter_complex', vf, '-loop', '0', out], check=True)
        size = os.path.getsize(out) / 1e6
        if size <= MB: break
    over = size > MB
    print(f"{out}: {size:.1f} MB ({w} px, {f} fps{', ' + str(n) + ' step(s) down' if n else ''})"
          + (f'  — still over {MB} MB at {w} px {f} fps: cut a moment with --range a,b or pass a larger --mb' if over else ''))
    return not over


def mp4(src, out):
    for crf in range(20, 36, 2):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vf', f'fps={FPS},setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709', '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf), '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], check=True)
        size = os.path.getsize(out) / 1e6
        if size <= MB: break
    print(f"{out}: {size:.1f} MB (CRF {crf}, {FPS} fps){'' if size <= MB else f'  — still over {MB} MB at CRF {crf}: pass --fps 24 or a larger --mb'}")
    return size <= MB


for f in FMTS:
    src = SRC or f'renders/{f}.mp4'
    if not os.path.exists(src): sys.exit(f'{src} missing: render the final first')
    stem = os.path.splitext(os.path.basename(src))[0] if SRC else f
    # --src without --out writes to the current folder, never next to a source that may sit in someone's outputs
    out = arg('--out', None) or (stem + ('.gif' if GIF else '_share.mp4') if SRC else f"renders/{f}{'.gif' if GIF else '_share.mp4'}")
    gif(src, out) if GIF else mp4(src, out)

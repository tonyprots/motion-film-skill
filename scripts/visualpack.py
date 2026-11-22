"""Picture-only blind pack from the encoded film. Invoked by blindpack.py --visual-only."""
import argparse
import json
import math
from pathlib import Path
import re
import subprocess


def pair(value):
    try:
        a, b = map(float, value.split(','))
        if not all(map(math.isfinite, (a, b))) or a < 0 or a >= b:
            raise ValueError()
        return a, b
    except ValueError:
        raise argparse.ArgumentTypeError('expected finite 0 <= start < end, comma-separated')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('round', type=int)
    p.add_argument('--visual-only', action='store_true')
    p.add_argument('--draft', action='store_true')
    p.add_argument('--fmt', choices=['16x9', '9x16', '1x1', '4x5'])
    p.add_argument('--mask', type=pair, help='caption band as fractions of frame height')
    p.add_argument('--range', type=pair, help='continuous segment in film seconds')
    a = p.parse_args()
    if a.round < 1 or (a.mask and a.mask[1] > 1):
        p.error('round >= 1; mask must be within [0,1]')
    tl = json.loads(Path('timeline.json').read_text())
    fmt = a.fmt or tl['formats'][0]
    src = Path(f"renders/{'draft_' if a.draft else ''}{fmt}.mp4")
    if not src.exists():
        p.error(f'missing {src}; render first')
    sources = [Path('timeline.json'), *[f for f in Path('film').rglob('*') if f.is_file()]]
    if src.stat().st_mtime < max(f.stat().st_mtime for f in sources):
        p.error('encoded film is older than film/ or timeline.json; render again')
    code = '\n'.join(f.read_text() for f in Path('film').glob('*.js') if f.name != 'data.js')
    captions = Path('captions.json')
    if not a.mask and ((captions.exists() and json.loads(captions.read_text())) or re.search(r'CAPTIONS\s*\.\s*\w+\s*\(', code)):
        p.error('captions may be burned in: supply --mask y0,y1 explicitly; they cannot be removed automatically')
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(src)]))
    duration = float(probe['format']['duration'])
    start, end = a.range or (0, duration)
    if end > duration + .001:
        p.error('range exceeds encoded duration')
    out = Path(f'review/visual_r{a.round}')
    if out.exists():
        p.error(f'refusing existing {out}; choose another round')
    out.mkdir(parents=True)
    filters = []
    if a.mask:
        y0, y1 = a.mask
        filters.append(f'drawbox=x=0:y=ih*{y0}:w=iw:h=ih*{y1-y0}:color=black:t=fill')
    cmd = ['ffmpeg', '-v', 'error', '-i', str(src), '-ss', str(start), '-t', str(end-start), '-an']
    if filters:
        cmd += ['-vf', ','.join(filters)]
    subprocess.run(cmd + ['-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', str(out/'silent.mp4')], check=True)
    # Continuous video is the primary evidence. Sheets merely help find moments.
    width = 480 if fmt != '9x16' else 240
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(out/'silent.mp4'), '-vf',
                    f'fps=2,scale={width}:-2,tile=4x3:nb_frames=12:padding=6:margin=6',
                    '-fps_mode', 'passthrough', str(out/'sheet_%02d.jpg')], check=True)
    (out/'BRIEF.md').write_text('''# Picture-only reading
Open silent.mp4 and sheets in this folder only. No script, voice, source code or earlier reviews.
Report what you can observe: initial situation → action → changed state → result.
Give timecodes for unclear motion, disconnected labels, incomplete objects, jumps or ambiguous results.
Do not infer an action from a status label alone. Separate observation from your interpretation.
If you cannot play the continuous clip, say so; sheets do not verify transitions.
''')
    (out/'pack.json').write_text(json.dumps({'source_range_s': [start, end], 'mask_height_fractions': a.mask,
                                           'audio': False, 'note': 'On-screen object labels remain; the mask may hide picture content.'}, indent=2)+'\n')
    print(f'{out}: continuous silent clip, sheets, reader brief; no transcript or author account')


if __name__ == '__main__':
    main()

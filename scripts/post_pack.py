#!/usr/bin/env python3
"""Post pack for a feed (Reels, Shorts, Telegram, VK Clips): an option at step 10, for a film that is posted, not shown.
Run from the project root after the final render:

  python3 scripts/post_pack.py --at <seconds|mark> [--fmt 9x16]   cover from that frame + caption.txt skeleton
  python3 scripts/post_pack.py --check                             check renders/post/caption.txt before handing it over

Writes renders/post/:
  cover_<fmt>.jpg   the poster frame (render.mjs --at), JPEG q 92, the film's own pixels (no extra text: the frame must
                    already say what the film is about — pick a frame with the heading or the number on screen)
  caption.txt       the post text, in the language of SCRIPT.md: a first line that works without "more" (≤ 125 chars,
                    the hook, not the film's title), 2–4 short paragraphs from the STORY, a call to watch or act, then
                    3–5 topic hashtags on the last line. The skeleton has the hook line from SCRIPT.md filled in; the agent
                    writes the rest, never invents a fact the film does not state.
--check: length ≤ 2200, first line ≤ 125, 3–5 hashtags, no placeholder left, the caption's language matches SCRIPT.md
(Cyrillic share), every number in the caption also appears in SCRIPT.md, audio/vo/lines.json or captions.json (a number the film
never says is an invented fact).
"""
import argparse, json, re, subprocess, sys
from pathlib import Path

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
ap.add_argument('--at', help='poster frame: seconds or a timeline mark')
ap.add_argument('--fmt', default='9x16')
ap.add_argument('--check', action='store_true')
A = ap.parse_args()
OUT = Path('renders/post'); OUT.mkdir(parents=True, exist_ok=True)
CAP = OUT / 'caption.txt'
script = Path('SCRIPT.md').read_text(encoding='utf-8') if Path('SCRIPT.md').exists() else ''
# what the film says: the script, the voice lines and the captions (overlay mode has no SCRIPT text, only lines.json)
said = script + '\n'.join(Path(f).read_text(encoding='utf-8') for f in ('audio/vo/lines.json', 'captions.json') if Path(f).exists())
cyr = lambda s: len(re.findall(r'[А-Яа-яЁё]', s)) / max(1, len(re.findall(r'[A-Za-zА-Яа-яЁё]', s)))
PH = '<…>'

if A.at:
    r = subprocess.run(['node', 'scripts/render.mjs', '--at', A.at, '--fmt', A.fmt], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-1500:])
    stills = sorted(Path('review/stills', A.fmt).glob('t*.png'), key=lambda p: p.stat().st_mtime)
    if not stills: sys.exit(f'no still in review/stills/{A.fmt}/')
    cover = OUT / f'cover_{A.fmt}.jpg'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(stills[-1]), '-q:v', '2', str(cover)], check=True)
    print(f'{cover} ← {stills[-1].name}')
    if not CAP.exists():
        hook = next((m.group(1).strip() for m in [re.search(r'(?im)^\s*(?:hook|хук)\s*[:—-]\s*(.+)$', script)] if m), PH)
        CAP.write_text(f'{hook}\n\n{PH} 2–4 short paragraphs from ## STORY\n\n{PH} call to watch / act\n\n{PH} #topic #topic #topic\n',
                       encoding='utf-8')
        print(f'{CAP}: skeleton written — fill every {PH}, then --check')

if A.check:
    if not CAP.exists(): sys.exit(f'{CAP} missing: run with --at first')
    t = CAP.read_text(encoding='utf-8').strip(); bad = []
    first = t.split('\n', 1)[0]
    tags = re.findall(r'(?<!\w)#[\w-]+', t)
    if PH in t: bad.append('placeholders left')
    if len(t) > 2200: bad.append(f'{len(t)} chars > 2200')
    if len(first) > 125: bad.append(f'first line {len(first)} chars > 125: it is cut behind "more"')
    if not 3 <= len(tags) <= 5: bad.append(f'{len(tags)} hashtags (want 3–5 on topic)')
    if script and abs(cyr(re.sub(r'#[\w-]+', '', t)) - cyr(script)) > 0.5: bad.append('caption language differs from SCRIPT.md')
    nums = {n for n in re.findall(r'\d+(?:[.,]\d+)?', re.sub(r'#[\w-]+', '', t))}
    norm = lambda s: s.replace(',', '.')
    have = {norm(n) for n in re.findall(r'\d+(?:[.,]\d+)?', said)}
    extra = sorted(n for n in nums if norm(n) not in have)
    if said and extra: bad.append(f'numbers the film never says (SCRIPT.md, lines.json, captions.json): {", ".join(extra)}')
    print(json.dumps({'chars': len(t), 'first_line': len(first), 'hashtags': tags, 'problems': bad}, ensure_ascii=False, indent=1))
    sys.exit(1 if bad else 0)
if not (A.at or A.check): ap.print_help()

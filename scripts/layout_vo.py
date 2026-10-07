#!/usr/bin/env python3
"""Lay the voice takes out on the beat grid: every scene starts on a bar, every phrase on a half-beat.
Input: audio/vo/lines.json (extract_lines.py) and the takes audio/vo/<id>.wav (voice.py or your own recordings).
Writes vo.json (for vo.py) and timeline.json → bpm, duration and these marks (in beats):
  sc<N>        scene N starts (a multiple of 4)          <id>      phrase starts (e.g. s4b)
  <id>.<k>     k-th speech chunk inside the phrase, k from 1 (pauses found the way vo.py --scan finds them)
  <id>.end     phrase ends                               done      end of the film
Animate from these marks: a headline word lands on <id>.<k>, a card on the chunk that names it.
Spacing comes from the script: per line `air` (silence after, s) + `hold` (a mute beat, s), first line of a scene
`pre` (lead-in before the voice, s → whole beats). Film-wide defaults in timeline.json "vo_layout":
  {"pre": 0.5, "gap": 0.45, "after": 0.2, "tail": 3.0}   (after = extra pause before the next scene; tail = end card)
The scene start rounds up to the next bar, so these stay small: voice silence on a scene seam should be 1-2 s, and 3 s or
more reads as a dropout (printed as WARN below). Lengthen a pause where the script asks for it (air / hold / pre), not here.
Run from the project root: python3 scripts/layout_vo.py, then python3 scripts/vo.py and node scripts/sync.mjs."""
import json, math, os, sys
from pathlib import Path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vo import load, segments

TL = json.loads(Path('timeline.json').read_text())
BPM = float(TL.get('bpm', 120)); BEAT = 60 / BPM
O = {'pre': 0.5, 'gap': 0.45, 'after': 0.2, 'tail': 3.0, **(TL.get('vo_layout') or {})}
lines = json.loads(Path('audio/vo/lines.json').read_text(encoding='utf-8'))
voice = json.loads(Path('audio/vo/voice.json').read_text()) if Path('audio/vo/voice.json').exists() else {'provider': 'file'}

scenes = {}
for L in lines:
    scenes.setdefault(int(''.join(c for c in L['id'][1:] if c.isdigit())), []).append(L)

half = lambda s: math.ceil(s / (BEAT / 2) - 1e-6) * 0.5          # seconds → the next half-beat (in beats)
marks, phrases, cur = {}, [], 0.0
seams, prev_end = {}, None
for n in sorted(scenes):
    takes = scenes[n]
    sb = math.ceil(cur / BEAT / 4 - 1e-6) * 4
    marks[f'sc{n}'] = sb
    t = (sb + max(1, math.ceil(takes[0].get('pre', O['pre']) / BEAT - 1e-6))) * BEAT
    for L in takes:
        segs = segments(load(L['id']))
        if not segs: sys.exit(f'{L["id"]}: no speech found in the take')
        a, b = segs[0][0], segs[-1][1]
        at = half(t)
        if L is takes[0] and prev_end is not None: seams[n] = at * BEAT - prev_end
        marks[L['id']] = at
        for k, (x, _) in enumerate(segs, 1):
            marks[f'{L["id"]}.{k}'] = round(at + (x - a) / BEAT, 3)
        marks[f'{L["id"]}.end'] = round(at + (b - a) / BEAT, 3)
        phrases.append({'id': L['id'], 'take': L['id'], 'from': a, 'to': b, 'at': L['id'], 'text': L['text']})
        gap = L.get('air', O['gap']) + L.get('hold', 0)
        t = at * BEAT + (b - a) + gap
        prev_end = at * BEAT + (b - a)
    last = takes[-1]
    cur = t - (last.get('air', O['gap']) + last.get('hold', 0)) + max(O['after'], last.get('hold', 0))
marks['done'] = math.ceil((cur + O['tail']) / BEAT)

Path('vo.json').write_text(json.dumps({'voice': voice, 'phrases': phrases}, ensure_ascii=False, indent=1))
keep = {k: v for k, v in (TL.get('marks') or {}).items() if not (k in marks or k.split('.')[0] in {L['id'] for L in lines} or k.startswith('sc'))}
TL['marks'] = {**keep, **marks}   # marks the film added by hand survive a re-layout
TL['duration'] = round(marks['done'] * BEAT, 3); TL['bpm'] = BPM
Path('timeline.json').write_text(json.dumps(TL, ensure_ascii=False, indent=2))
for n in sorted(scenes):
    s = seams.get(n)
    hold = (scenes[n - 1][-1].get('hold', 0) if n - 1 in scenes else 0) + scenes[n][0].get('pre', 0)
    print(f"sc{n:<3} beat {marks[f'sc{n}']:>4}  {marks[f'sc{n}'] * BEAT:6.1f}s  {len(scenes[n])} phrase(s)"
          + (f"  silence before {s:.1f}s" if s is not None else '')
          + ("  WARN: 3 s+ of silence on the seam reads as a dropout (vo_layout pre/after, or a deliberate hold/pre)"
             if s is not None and s >= 3 and hold < 1.5 else ''))
print(f"done  beat {marks['done']}  {TL['duration']:.1f}s at {BPM:g} BPM" + (f"  · kept {len(keep)} hand marks" if keep else ''))

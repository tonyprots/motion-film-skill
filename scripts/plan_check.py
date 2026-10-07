#!/usr/bin/env python3
"""Timeline check BEFORE the render: what the plan already gets wrong, in seconds, from the files sync.mjs reads.
Run from the project root after sync.mjs (and after render.mjs --lint, if you want the "heard but not seen" check).
  python3 scripts/plan_check.py
Reads timeline.json, beats.json?, cues.json, captions.json?, audio/vo_placed.json?, review/cuts.json?, review/text_<fmt>.json?
  FAIL  voice phrases overlap or run past the end; a caption on an unknown mark; a caption read faster than 20 chars/s
  WARN  nothing happens for more than 4 s (no cue, no voice, no caption); end hold outside 1.5–4 s; a shot shorter than 2 s;
        a caption over 70 chars or faster than 17 chars/s; a voice phrase that is heard but not on screen (sound-off viewer)
  NOT CHECKED  the input for a check is missing — never reported as clean
Exit 1 on any FAIL."""
import json, os, re, sys

def load(p, d=None):
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else d

TL = load('timeline.json') or sys.exit('timeline.json missing: run from the project root')
M, DUR = TL.get('marks', {}), float(TL['duration'])
G = load('beats.json') or {'beat': 60 / TL['bpm'], 'offset': 0, 'beats': []}
P, B = G.get('beat') or 60 / TL['bpm'], G.get('beats') or []

def beat_of(m):
    if isinstance(m, (int, float)): return float(m)
    if m not in M: raise KeyError(m)
    return float(M[m])

def bt(x):   # beat → seconds on the measured grid, same as sync.mjs
    if not B: return (G.get('offset') or 0) + x * P
    if x <= 0: return B[0] + x * P
    i, f = int(x), x - int(x)
    if i >= len(B) - 1: return B[-1] + (x - len(B) + 1) * P
    return B[i] + f * (B[i + 1] - B[i])

out = []   # (level, what)
def say(level, msg): out.append((level, msg))

cues = (load('cues.json') or {}).get('cues', [])
vo = load('audio/vo_placed.json', [])
caps = load('captions.json', [])

# ---- voice: order, overlap, end
for a, b in zip(vo, vo[1:]):
    if b['t0'] < a['t1'] - 0.02: say('FAIL', f"voice {a['id']} ({a['t0']:.2f}–{a['t1']:.2f}s) overlaps {b['id']} (starts {b['t0']:.2f}s)")
for p in vo:
    if p['t1'] > DUR: say('FAIL', f"voice {p['id']} ends at {p['t1']:.2f}s, after the film ends ({DUR:.2f}s)")

# ---- captions: marks, timing, reading speed (same timing rule as film/lib/captions.js)
take = lambda k: k.split('.')[0]
def end_of(k):
    try: return beat_of(f'{take(k)}.end') + 0.6
    except KeyError: return beat_of(k) + 4
spans = []
for i, (k, txt) in enumerate(caps):
    try: at = beat_of(k)
    except KeyError: say('FAIL', f'caption «{txt[:40]}» sits on mark "{k}", which timeline.json does not have'); continue
    nxt = caps[i + 1] if i + 1 < len(caps) else None
    try: end = beat_of(nxt[0]) if nxt and take(nxt[0]) == take(k) else min(end_of(k), beat_of(nxt[0])) if nxt else end_of(k)
    except KeyError: end = end_of(k)
    t0, t1 = bt(at), bt(end)
    if not txt.strip(): continue   # an empty entry closes the previous caption
    spans.append((t0, t1, txt))
    for part in txt.split('|'):
        if len(part) > 70: say('WARN', f'caption at {t0:.2f}s is {len(part)} chars (≤ 70, two lines): «{part[:50]}…»')
    n, dt = len(txt.replace('|', '')), max(t1 - t0, 1e-3)
    cps = n / dt
    if cps > 20: say('FAIL', f'caption at {t0:.2f}s: {n} chars in {dt:.2f}s = {cps:.0f} chars/s (max 20): split it or give it more time')
    elif cps > 17: say('WARN', f'caption at {t0:.2f}s: {cps:.0f} chars/s, fast for a sound-off viewer (≤ 17)')

# ---- dead air: nothing new for more than 4 s
events = sorted([c['t'] for c in cues] + [x for p in vo for x in (p['t0'], p['t1'])] + [x for s in spans for x in s[:2]] + [0.0, DUR])
if len(events) > 2:
    for a, b in zip(events, events[1:]):
        if b - a > 4: say('WARN', f'{a:.2f}–{b:.2f}s: {b - a:.1f}s with no cue, voice or caption — is something on screen carrying it?')
else: say('NOT CHECKED', 'dead air: no cues, voice or captions yet')

# ---- end hold: from the last voice/caption to the end
last = max([p['t1'] for p in vo] + [s[1] for s in spans] or [None]) if (vo or spans) else None
if last is None: say('NOT CHECKED', 'end hold: no voice or captions to measure from')
else:
    hold = DUR - last
    if not 1.5 <= hold <= 4: say('WARN', f'end hold {hold:.2f}s after the last words ({last:.2f}s → {DUR:.2f}s): keep it 1.5–4 s so the CTA is read, not waited on')

# ---- shots between hard cuts (cuts.json comes from any render.mjs run)
cuts = load('review/cuts.json')
if cuts is None: say('NOT CHECKED', 'shot length: no review/cuts.json yet (any render.mjs run writes it)')
else:
    for fmt, cs in cuts.items():
        edges = [0.0] + sorted(cs) + [DUR]
        for a, b in zip(edges, edges[1:]):
            if b - a < 2: say('WARN', f'{fmt}: shot {a:.2f}–{b:.2f}s is {b - a:.2f}s (< 2 s): the eye has not landed before it cuts')

# ---- heard but not seen: every voice phrase on screen as caption or in-scene text while it is spoken
words = lambda s: [w for w in re.findall(r'[\w’\']+', s.lower()) if len(w) > 3]
texts = {f: load(f'review/text_{f}.json') for f in TL['formats']}
if not vo: say('NOT CHECKED', 'heard but not seen: no audio/vo_placed.json')
elif not any(texts.values()): say('NOT CHECKED', 'heard but not seen: no review/text_<fmt>.json (render.mjs --lint)')
else:
    for f, beats in texts.items():
        if not beats: continue
        for p in vo:
            seen = set(w for b in beats if p['t0'] - 0.5 <= b['t'] <= p['t1'] + 0.5 for it in b['text'] for w in words(it['text']))
            need = words(p['text'])
            miss = [w for w in need if w not in seen]
            if need and len(miss) > len(need) / 2:
                say('WARN', f"{f}: voice {p['id']} ({p['t0']:.1f}s) is heard but mostly not on screen ({len(need) - len(miss)}/{len(need)} words): sound-off viewers lose it")

order = {'FAIL': 0, 'WARN': 1, 'NOT CHECKED': 2}
for lv, msg in sorted(out, key=lambda x: order[x[0]]): print(f'{lv:<12}{msg}')
nF, nW = sum(lv == 'FAIL' for lv, _ in out), sum(lv == 'WARN' for lv, _ in out)
print(f'plan: {len(cues)} cues, {len(vo)} voice phrases, {len(spans)} captions · {nF} FAIL, {nW} WARN')
sys.exit(1 if nF else 0)

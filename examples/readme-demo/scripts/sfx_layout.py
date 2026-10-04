"""Sound events from picture marks → timeline.json "sfx". Copy to scripts/sfx_layout.py and write one line per sound.
Rule that held up on a real film: a hit sits EXACTLY on the beat where the object lands (the spHit beat in film.js),
lead 0. Measured on the first film: lead 0 → 31/48 hits in sync, −35 ms → 25/48, −75 ms → 18/48. Whooshes build into
their cue, so put their cue ~0.6 beat before the cut (hit=False). Judge sync by frames, not by review.py's onset metric.
Run from the project root: python3 scripts/sfx_layout.py, then node scripts/sync.mjs, node scripts/sfx.mjs, python3 scripts/mix.py."""
import json
T = json.load(open('timeline.json')); M = T['marks']
LEAD = 0
def b(k, d=0): return round((M[k] if isinstance(k, str) else k) + d, 3)
ev = []
def a(at, typ, g, what, hit=True, **kw): ev.append({'at': b(at, LEAD) if hit else b(at), 'type': typ, 'gain': g, 'what': what, **kw})

# --- motion-film demo: hits on the beat the object lands (film.js spHit beats) ---------------------------------
a('s1a', 'pop', 0.5, '"0 views" pill lands')
a(7.0, 'whoosh', 0.45, 'page morphs into the video frame', hit=False)
ev.append({'at': 8.9, 'to': 9.8, 'every': 0.25, 'type': 'tick', 'gain': 0.28, 'what': 'typing "make it a film"'})
a(10.2, 'click', 0.5, 'send')
a('s2a.4', 'pop', 0.4, 'agent chip')
a(19.4, 'whoosh', 0.45, 'wipe into How', hit=False)
for i in range(5): a(b('s3b', 0.4 + i * 0.75), 'pop', 0.4, f'element {i + 1} drops onto its mark')
a(39.4, 'whoosh', 0.45, 'push up into Proof', hit=False)
a(b('s4a.2', 0.1), 'thump', 0.55, 'SHIP stamp')
ev.append({'at': b('s4a.4', -0.9), 'to': b('s4a.4', -0.4), 'every': 0.25, 'type': 'tick', 'gain': 0.22, 'what': 'typing the render command'})
a(b('s4a.5', 0.6), 'pop', 0.5, '4.3x lands')
a(b('s4a.end', 0.9), 'pop', 0.35, 'same pixels chip')
a(55.4, 'whoosh', 0.45, 'wipe into the end card', hit=False)
a(55.2, 'thump', 0.5, 'motion-film lockup')
for i in range(3): a(b('sc5', 0.2 + i * 0.3), 'pop', 0.4, f'agent chip {i + 1}')

T['sfx'] = ev; json.dump(T, open('timeline.json', 'w'), ensure_ascii=False, indent=2); print(len(ev), 'sound events')

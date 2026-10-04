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

# --- examples: replace with the film's own events -------------------------------------------------------------
# a('s1a.2', 'pop', 0.55, 'answer bubble lands')                         # on a speech chunk
# for k in ['sc2', 'sc3']: a(b(k, -0.6), 'whoosh', 0.5, f'transition into {k}', hit=False)
# for k, n in [('sc3', '01'), ('sc4', '02')]: a(k, 'thump', 0.6, f'number {n}')
# for i in range(3): a(b('s3b', 1.0 + i * 0.35), 'pop', 0.45, f'card {i + 1}')
# a('s8a.3', 'thump', 0.5, 'CTA lands')

T['sfx'] = ev; json.dump(T, open('timeline.json', 'w'), ensure_ascii=False, indent=2); print(len(ev), 'sound events')

"""Sound events from picture marks → timeline.json "sfx". Copy to scripts/sfx_layout.py and write one line per sound.
Rule that held up on a real film: a hit sits EXACTLY on the beat where the object lands (the spHit beat in film.js),
lead 0. Measured on the first film: lead 0 → 31/48 hits in sync, −35 ms → 25/48, −75 ms → 18/48. A move or a cut gets
no sound of its own (no whoosh, no riser). Judge sync by frames, not by review.py's onset metric.
Run from the project root: python3 scripts/sfx_layout.py, then node scripts/sync.mjs, node scripts/sfx.mjs, python3 scripts/mix.py."""
import json
T = json.load(open('timeline.json')); M = T['marks']
LEAD = 0
def b(k, d=0): return round((M[k] if isinstance(k, str) else k) + d, 3)
ev = []
def a(at, typ, g, what, hit=True, **kw): ev.append({'at': b(at, LEAD) if hit else b(at), 'type': typ, 'gain': g, 'what': what, **kw})

a('s6a.end', 'thump', 0.95, 'SHIP stamp (hero)')
a(b('sc7', -0.1), 'pop', 0.3, 'motion-film lockup')

T['sfx'] = ev; json.dump(T, open('timeline.json', 'w'), ensure_ascii=False, indent=2); print(len(ev), 'sound events')

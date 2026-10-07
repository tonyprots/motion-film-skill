#!/usr/bin/env python3
"""Timecoded notes on the film, so nothing said between rounds gets lost. Run from the project root.
  python3 scripts/notes.py add 12.4 "hard jump at the cut"     the user's remark (or the critic's), at a time in seconds
  python3 scripts/notes.py list [--all]                       open notes (--all: closed ones too)
  python3 scripts/notes.py resolve 3 --reply "cut moved onto the bar, checked with --at 12.35,12.4"
Notes live in docs/notes.json. An open note blocks delivery: every one is closed with a reply that says what changed and how
it was checked."""
import json, os, sys, datetime
F = 'docs/notes.json'
N = json.load(open(F, encoding='utf-8')) if os.path.exists(F) else []
def save(): os.makedirs('docs', exist_ok=True); json.dump(N, open(F, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
a = sys.argv[1:]
if not a or a[0] not in ('add', 'list', 'resolve'): sys.exit(__doc__)
if a[0] == 'add':
    if len(a) < 3: sys.exit('add <seconds> "<note>"')
    N.append({'n': len(N) + 1, 't': float(a[1]), 'text': ' '.join(a[2:]), 'open': True, 'at': datetime.date.today().isoformat()}); save()
    print(f"note {len(N)} at {float(a[1]):.2f}s")
elif a[0] == 'resolve':
    if len(a) < 4 or a[2] != '--reply': sys.exit('resolve <n> --reply "<what changed, how it was checked>"')
    x = next((x for x in N if x['n'] == int(a[1])), None)
    if not x: sys.exit(f'no note {a[1]}')
    x.update(open=False, reply=' '.join(a[3:]), closed=datetime.date.today().isoformat()); save(); print(f"note {x['n']} closed")
else:
    show = [x for x in N if x['open'] or '--all' in a]
    for x in sorted(show, key=lambda x: x['t']):
        print(f"{x['n']:3d} {'OPEN  ' if x['open'] else 'closed'} {x['t']:7.2f}s  {x['text']}" + (f"  → {x['reply']}" if x.get('reply') else ''))
    o = sum(x['open'] for x in N); print(f'{o} open, {len(N) - o} closed')
    sys.exit(1 if o else 0)

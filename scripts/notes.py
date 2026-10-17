#!/usr/bin/env python3
"""Timecoded notes on the film, so nothing said between rounds gets lost. Run from the project root.
  python3 scripts/notes.py add 12.4 "hard jump at the cut"            the user's remark (or the critic's), at a time in seconds
  python3 scripts/notes.py add 12.4 "accent too loud" --el "text:\\"Ship.\\" · css:[data-scene=\\"mid\\"] > div.line"
                                                                      --el: the element it is about (the player fills it in)
  python3 scripts/notes.py list [--all]                               open notes (--all: closed ones too)
  python3 scripts/notes.py resolve 3 --reply "cut moved onto the bar, checked with --at 12.35,12.4"
  python3 scripts/notes.py resolve 3 --reply "…" --rule "a cut lands on a bar line, never mid-bar"
                                                                      --rule: the lesson, appended to docs/style_guide.md
                                                                      («Правила из замечаний») so it does not come back
                                                                      in the next round or the next issue of the series
Notes live in docs/notes.json: [{n, t, text, open, at, el?, scene?, mark?, fmt?, kind?, src?, reply?, closed?, rule?}].
scripts/player.mjs writes the same records. An open note blocks delivery: every one is closed with a reply that says what
changed and how it was checked."""
import json, os, re, sys, datetime
F = 'docs/notes.json'
SG = 'docs/style_guide.md'
HEADS = ('## Правила из замечаний', '## Rules from notes')
HEAD_RE = re.compile(r'^##\s+(?:\d+\.\s*)?(?:Правила из замечаний|Rules from notes)\s*$')   # numbered or not
N = json.load(open(F, encoding='utf-8')) if os.path.exists(F) else []
today = datetime.date.today().isoformat()
def save(): os.makedirs('docs', exist_ok=True); json.dump(N, open(F, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
def tfmt(t): return f'{t:.3f}'.rstrip('0').rstrip('.')

def parse(args, flags):
    """positional words + '--flag value…' (a value runs to the next flag), so both quoted and bare words work"""
    out, cur = {'_': []}, '_'
    for x in args:
        if x in flags: cur = x[2:]; out[cur] = []; continue
        out[cur].append(x)
    return {k: ' '.join(v).strip() for k, v in out.items()}

def add_rule(note, rule):
    """append '- date, t=…: rule — «note»' to the 'Rules from notes' section of the style guide; create it if missing"""
    src = open(SG, encoding='utf-8').read() if os.path.exists(SG) else ''
    ru = bool(re.search('[А-Яа-яЁё]', src or rule + note['text']))
    line = f"- {today}, t={tfmt(note['t'])}: {rule} — «{note['text']}»"
    lines = src.split('\n') if src else []
    if line in lines: return 'already in'
    at = next((i for i, l in enumerate(lines) if HEAD_RE.match(l.strip())), None)
    if at is None:
        if lines and lines[-1].strip(): lines.append('')
        intro = ('Ошибки, которые уже исправляли по замечаниям. Перед каждым раундом и следующим выпуском серии проверить, '
                 'что ни одна не вернулась.') if ru else ('Mistakes already fixed after a note. Before every round and the next '
                 'issue of the series, check that none has come back.')
        lines += [HEADS[0] if ru else HEADS[1], '', intro, '', line, '']
    else:
        end = next((i for i in range(at + 1, len(lines)) if lines[i].startswith('## ')), len(lines))
        last = max((i for i in range(at + 1, end) if lines[i].strip()), default=at)
        if not lines[last].startswith('- '): lines.insert(last + 1, ''); last += 1   # the first rule after the heading or prose
        lines.insert(last + 1, line)
        if last + 2 < len(lines) and lines[last + 2].startswith('## '): lines.insert(last + 2, '')
    os.makedirs(os.path.dirname(SG), exist_ok=True)
    open(SG, 'w', encoding='utf-8').write('\n'.join(lines) if lines[-1] == '' else '\n'.join(lines) + '\n')
    return 'added to'

a = sys.argv[1:]
if not a or a[0] not in ('add', 'list', 'resolve'): sys.exit(__doc__)
if a[0] == 'add':
    o = parse(a[1:], ('--el',))
    words = o['_'].split(' ', 1)
    if len(words) < 2 or not words[1].strip(): sys.exit('add <seconds> "<note>" [--el "<selector / element text>"]')
    try: t = float(words[0])
    except ValueError: sys.exit(f'add: "{words[0]}" is not a time in seconds')
    x = {'n': len(N) + 1, 't': t, 'text': words[1].strip(), 'open': True, 'at': today}
    if o.get('el'): x['el'] = o['el']
    N.append(x); save()
    print(f"note {x['n']} at {t:.2f}s" + (f"  [{x['el']}]" if x.get('el') else ''))
elif a[0] == 'resolve':
    o = parse(a[1:], ('--reply', '--rule'))
    if not o['_'] or not o.get('reply'): sys.exit('resolve <n> --reply "<what changed, how it was checked>" [--rule "<rule for the style guide>"]')
    x = next((x for x in N if str(x['n']) == o['_']), None)
    if not x: sys.exit(f"no note {o['_']}")
    x.update(open=False, reply=o['reply'], closed=today)
    if o.get('rule'): x['rule'] = o['rule']
    save(); print(f"note {x['n']} closed")
    if o.get('rule'): print(f"rule {add_rule(x, o['rule'])} {SG}")
else:
    show = [x for x in N if x['open'] or '--all' in a]
    for x in sorted(show, key=lambda x: x['t']):
        print(f"{x['n']:3d} {'OPEN  ' if x['open'] else 'closed'} {x['t']:7.2f}s  {x['text']}" + (f"  → {x['reply']}" if x.get('reply') else ''))
        if x.get('el'): print(f"{'':19}el: {x['el']}")
        if x.get('rule'): print(f"{'':19}rule: {x['rule']}")
    o = sum(x['open'] for x in N); print(f'{o} open, {len(N) - o} closed')
    sys.exit(1 if o else 0)

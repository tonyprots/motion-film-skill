#!/usr/bin/env python3
"""Draft captions.json from the voice lines and their speech chunks. Run from the project root after layout_vo.py.
Each line is cut into caption-sized clauses (sentence ends first, then commas, colons, dashes; ≤ ~70 chars) and
each clause is pinned to the speech chunk (<id>.<k>) nearest to where it should start by letter count.
The draft is a starting point: then EDIT captions.json by hand —
  - screen spelling: digits and symbols on screen ("1 200", "−40%", "v2.0") where the voice says words;
  - move a clause to the chunk where the voice actually starts it (check with a contact sheet / stills);
  - "|" inside an entry shows its halves one after another.
Words on screen match the voice word for word, or are a deliberate shorter caption. Never a paraphrase.
Usage: captions.py [--max 48] [--force]"""
import json, re, sys
from pathlib import Path

MAX = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 70   # ≈ two caption lines
if Path('captions.json').exists() and '--force' not in sys.argv:
    sys.exit('captions.json exists (hand edits live there): --force to overwrite')
TL = json.loads(Path('timeline.json').read_text()); M = TL['marks']
lines = json.loads(Path('audio/vo/lines.json').read_text(encoding='utf-8'))


def clauses(text):
    out = []
    for sent in re.findall(r'[^.!?…]+[.!?…]*', text):
        sent = sent.strip()
        if not sent: continue
        while len(sent) > MAX:   # cut at the last soft break before MAX, else at the last space
            cut = max((m.end() for m in re.finditer(r'[,:;]\s|\s—\s', sent[:MAX + 1])), default=0) \
                or (sent.rfind(' ', 0, MAX) if len(sent) > MAX * 1.4 else 0)   # a hard cut only for really long clauses
            if cut <= 0: break
            out.append(sent[:cut].strip()); sent = sent[cut:].strip()
        out.append(sent)
    return out


caps = []
for L in lines:
    i = L['id']; chunks = sorted(((k, v) for k, v in M.items() if k.startswith(i + '.') and k[len(i) + 1:].isdigit()), key=lambda kv: kv[1])
    if not chunks: print(f'{i}: no chunk marks — run layout_vo.py first'); continue
    a, b = M[i], M[f'{i}.end']; total = len(L['text']); pos = 0; used = -1
    for c in clauses(L['text']):
        want = a + (b - a) * (L['text'].find(c, pos) / max(1, total)); pos = L['text'].find(c, pos) + len(c)
        k = min(range(len(chunks)), key=lambda j: abs(chunks[j][1] - want) + (1e6 if j <= used else 0))
        if k <= used: caps[-1][1] += ' ' + c; continue   # no free chunk left: join the previous caption
        used = k; caps.append([chunks[k][0], c])
Path('captions.json').write_text(json.dumps(caps, ensure_ascii=False, indent=0).replace('[\n"', '["').replace('",\n"', '", "').replace('"\n]', '"]'))
print(len(caps), 'captions → captions.json (draft: fix screen spelling, then node scripts/sync.mjs)')
for k, t in caps[:6]: print(f'  {k:8s} {t}')

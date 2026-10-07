#!/usr/bin/env python3
"""Script doctor in code: checks SCRIPT.md against the rules that make a voice film watchable.
Errors (exit 1) must be fixed before voicing; warnings are judgement calls — fix or say why not.
  - STORY block present (type and arc, logline, one sentence the viewer repeats, hero, stakes, turn — "none, because …" counts) and the thesis contract the
    blind read checks against: argument chain (3–6 steps) and "not about" (the wrong reading the film must rule out)
  - terms: a Latin word or abbreviation inside a Russian line with no entry in lexicon.json (next to SCRIPT.md) — say how
    the voice reads it, or confirm it on a sample
  - hook: the first voice line <= 60 chars, no number in it
  - every line <= 200 chars (~13 s); sentences <= 20 words; lists <= 3 items
  - numbers: digits never in the voice (write them as words); <= 1 number per line, <= 8 per film
  - the last line is a thought, not logistics (no links, "materials", "subscribe")
  - direction: if any line has mood, the film uses >= 3 moods; 1–2 hold beats per film
Usage: script_lint.py SCRIPT.md [--max-numbers 8]"""
import re, sys
if len(sys.argv) < 2: sys.exit(__doc__)
src = open(sys.argv[1], encoding='utf-8').read()
MAXN = int(sys.argv[sys.argv.index('--max-numbers') + 1]) if '--max-numbers' in sys.argv else 8
NUMW = set(('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen '
            'twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion percent half '
            'один одна одну два две три четыре пять шесть семь восемь девять десять одиннадцать двенадцать тринадцать четырнадцать '
            'пятнадцать двадцать тридцать сорок пятьдесят шестьдесят семьдесят восемьдесят девяносто сто двести триста четыреста пятьсот '
            'шестьсот семьсот восемьсот девятьсот тысяча тысяч тысячи миллион миллиона миллионов процент процента процентов половина вдвое втрое').split())
LOGISTICS = re.compile(r'https?://|www\.|\.(com|app|ru|io)\b|link|materials|subscribe|ссылк|материал|подпис', re.I)

lines, sec = [], None
for raw in src.splitlines():
    m = re.match(r'##\s+(\d+)[.)]\s*(.*)', raw)
    if m: sec = (int(m.group(1)), m.group(2)); continue
    m = re.match(r'\s*\*\*(?:Голос|Voice|VO):\*\*\s*[«"“](.*)[»"”]\s*(\{[^}]*\})?\s*$', raw)
    if m and sec: lines.append({'sec': sec, 'text': m.group(1).strip(), 'opts': m.group(2) or ''})

err, warn = [], []
E = lambda s: err.append(s); W = lambda s: warn.append(s)
if not lines: sys.exit('no voice lines found ("**Voice:** \\"…\\"" / "**Голос:** «…»" under "## N." sections)')

story = re.search(r'^#+\s*(STORY|История|Каркас)', src, re.M | re.I)
if not story: E('no STORY block: add logline, one sentence the viewer repeats, hero, stakes, turn — and get it approved first')
else:
    for key, alts in {'type and arc': r'type and arc|тип и арка', 'one sentence': r'one sentence|одна фраза', 'hero': r'hero|герой', 'stakes': r'stakes|ставк', 'turn': r'turn|поворот',
                      'argument chain': r'argument chain|цепочка', 'not about': r'not about|не про'}.items():
        if not re.search(alts, src, re.I): W(f'STORY has no "{key}" (reference/STORY.md: the blind read checks the film against it)')

def numbers(t):
    words = [w.lower() for w in re.findall(r"[\w'-]+", t)]
    digits = re.findall(r'\d[\d.,]*', t)
    n, prev = 0, False
    for w in words:  # a run of number words is one number ("one hundred twenty")
        is_n = any(p in NUMW for p in re.split(r'-', w))
        if is_n and not prev: n += 1
        prev = is_n
    return n + len(digits), digits

total_n = 0
for i, L in enumerate(lines):
    t, tag = L['text'], f"s{L['sec'][0]} «{L['text'][:40]}…»"
    n, digits = numbers(t); total_n += n
    if digits: E(f'{tag}: digits in the voice {digits} — write them as words (TTS misreads digits)')
    if len(t) > 200: E(f'{tag}: {len(t)} chars (> 200 ≈ 13 s) — split it, give the listener a breath')
    if n > 1: W(f'{tag}: {n} numbers in one line — keep one, move the rest on screen')
    for s in re.split(r'(?<=[.!?…])\s+', t):
        if len(s.split()) > 20: W(f'{tag}: a {len(s.split())}-word sentence — spoken sentences stay under ~15–20 words')
        if s.count(',') >= 3: W(f'{tag}: a list of {s.count(",") + 1} items — say three at most, show the rest')
    if i == 0:
        if len(t) > 60: E(f'hook {tag}: {len(t)} chars — the first line is <= 60 chars: a question, a contradiction or one striking fact')
        if n: W(f'hook {tag}: a number in the hook — numbers land better from the second line on')
    if i == len(lines) - 1:
        if LOGISTICS.search(t): E(f'last line {tag}: logistics in the voice — end on the meaning (echo the hook); links go on screen')
        if len(t) > 90: W(f'last line {tag}: {len(t)} chars — the closing thought is short')
if total_n > MAXN: W(f'{total_n} spoken numbers in the film (> {MAXN}) — viewers keep 2–3; one hero number, the rest on screen')

moods = {m for L in lines for m in re.findall(r'\bmood\s*=\s*([^\s}]+)', L['opts'])}
holds = sum(1 for L in lines if re.search(r'\bhold\s*=', L['opts']))
if moods and len(moods) < 3: W(f'only {len(moods)} mood(s) {sorted(moods)} — change delivery at least at every act')
if not moods: W('no voice direction ({mood=… pace=…}) — the whole film will sound the same')
if not holds: W('no hold beat — give the key moment 1–2 s of picture and music only ({hold=1.5})')
if holds > 3: W(f'{holds} hold beats — 1–2 per film, or they stop meaning anything')

import json, os
lex_path = os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), 'lexicon.json')
LEX = json.load(open(lex_path, encoding='utf-8')) if os.path.exists(lex_path) else {}
terms = {}
for L in lines:
    if not re.search('[а-яё]', L['text'], re.I): continue   # a Russian line: Latin words and abbreviations are the risk
    for w in re.findall(r"[A-Za-z][A-Za-z0-9.+#'-]*|\b[А-ЯЁ]{2,}\b", L['text']):
        if not any(w in k.split() or w == k for k in LEX): terms.setdefault(w.rstrip('.'), L['sec'][0])
if terms: W(f'{len(terms)} term(s) with no lexicon.json entry: ' + ', '.join(f'{t} (s{n})' for t, n in list(terms.items())[:12])
            + ' — add {"term": "how the voice says it"} or confirm on a voice sample')

chars = sum(len(L['text']) for L in lines)
print(f'{len(lines)} lines · {chars} chars · ≈{chars / 15:.0f} s of voice · {total_n} spoken numbers · moods {sorted(moods) or "—"} · holds {holds}')
for s in err: print('ERROR  ', s)
for s in warn: print('warning', s)
print('ok' if not err else f'{len(err)} error(s)')
sys.exit(1 if err else 0)

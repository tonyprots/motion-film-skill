#!/usr/bin/env python3
"""Timeline check BEFORE the render: what the plan already gets wrong, in seconds, from the files sync.mjs reads.
Run from the project root after sync.mjs (and after render.mjs --lint, if you want the "heard but not seen" check).
  python3 scripts/plan_check.py
Reads timeline.json, beats.json?, cues.json, captions.json?, audio/vo_placed.json?, review/cuts.json?, review/text_<fmt>.json?,
docs/shotlist.md?, SCRIPT.md?, brief.md? (its Sources row: local files and folders are read, URLs are not)
  FAIL  voice phrases overlap or run past the end; a caption on an unknown mark; a caption read faster than 20 chars/s;
        a number on screen (shot list "On-screen text", SCRIPT **Титр:**) that is neither in the voice nor in the sources
  WARN  nothing happens for more than 4 s (no cue, no voice, no caption); end hold outside 1.5–4 s; a shot shorter than 2 s;
        a caption over 70 chars or faster than 17 chars/s; a voice phrase that is heard but not on screen (sound-off viewer);
        shot list: the same camera move three times running, three push-ins running, accents (snap/punch/whip) over a third,
        a push not released by a pull/pan/cut within two shots, the camera touring screenshots (push, pan or pull on a
        screen in more than two shots: the camera doing the reading), a vague object («фон») or an action that only
        appears, a text card as the first or last shot
  NOT CHECKED  the input for a check is missing — never reported as clean
Exit 1 on any FAIL."""
import json, os, re, shutil, subprocess, sys

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
for i, (k, txt, *_) in enumerate(caps):
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
# karaoke (format «image per phrase») shows every word on its own mark: those are events too
KARAOKE = os.path.exists('film/film.js') and 'CAPTIONS.karaoke' in open('film/film.js', encoding='utf-8').read()
words = [bt(v) for k, v in M.items() if KARAOKE and re.search(r'\.w\d+$', k)]
events = sorted([c['t'] for c in cues] + [x for p in vo for x in (p['t0'], p['t1'])] + [x for s in spans for x in s[:2]] + words + [0.0, DUR])
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

# ---- shot list (docs/shotlist.md): camera grammar, concrete object and action, no text card at either end
# (idea: huashu-design storyboard_lint.py, MIT; own rules from RULES.md "camera is punctuation")
CAM = [('быстрый наезд', 'snap'), ('медленный наезд', 'push'), ('наезд', 'push'), ('отъезд', 'pull'), ('сдвиг', 'pan'), ('удар', 'punch'),
       ('хлёст', 'whip'), ('хлест', 'whip'), ('склейка', 'cut'), ('стоп', 'hold'), ('snap', 'snap'), ('push', 'push'), ('pull', 'pull'),
       ('pan', 'pan'), ('punch', 'punch'), ('whip', 'whip'), ('cut', 'cut'), ('hold', 'hold')]
ACCENT, PUSHES = {'snap', 'punch', 'whip'}, {'push', 'snap'}
VAGUE = {'заголовок', 'фон', 'иконка', 'пустой кадр', 'title', 'background', 'icon', 'empty frame', 'heading'}
SHOWS = {'появляется', 'появляются', 'показывается', 'показываются', 'плавно', 'просто', 'appears', 'appear', 'fades', 'fade', 'in', 'is', 'shown', 'smoothly'}
CARD = ('текст', 'титр', 'заголовок', 'плашка', 'title', 'card', 'text')
END_CARD = ('логотип', 'logo', 'продукт', 'product')
SCREEN = re.compile(r'скриншот|экран|окн[оаеу]|лендинг|страниц|screenshot|screen|window|landing|page|assets/shots')

def table(path):
    """The first Markdown table whose header has a Camera column: (header cells, [row cells])."""
    head, rows, first = None, [], True
    for line in open(path, encoding='utf-8'):
        if not line.lstrip().startswith('|'):
            if head: break
            first = True; continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if head is None:   # only a table's first row is its header
            if first and any(c.lower().startswith(('камера', 'camera')) for c in cells): head = [c.lower() for c in cells]
            first = False
        elif not all(re.fullmatch(r':?-+:?', c) for c in cells if c): rows.append(cells)
    return head, rows

def col(head, *names):
    return next((i for i, c in enumerate(head) if c.startswith(names)), None)

def cam_of(cell):
    c = cell.lower()
    return next((k for w, k in CAM if re.search(r'(?<!\w)' + w + r'(?!\w)', c)), None)

shots = []   # (label, object, action, camera kind | None, camera cell, on-screen text, is a screen)
sl_path = 'docs/shotlist.md'
head, rows = table(sl_path) if os.path.exists(sl_path) else (None, [])
if head is None: say('NOT CHECKED', f'shot list: {sl_path} ' + ('has no Camera column' if os.path.exists(sl_path) else 'missing'))
else:
    iO, iA, iC, iT = col(head, 'объект', 'object'), col(head, 'действие', 'action'), col(head, 'камера', 'camera'), col(head, 'текст на экране', 'on-screen text')
    iM = col(head, 'медиа', 'media')
    get = lambda r, i: r[i].strip() if i is not None and i < len(r) else ''
    for k, r in enumerate(rows):
        o, a, c, t = get(r, iO), get(r, iA), get(r, iC), get(r, iT)
        if not (o or a or c or t) or r[0] in ('…', '...') or o.startswith('<'): continue   # template placeholders
        m = get(r, iM).strip(' —-')
        shots.append((r[0] or str(k + 1), o, a, cam_of(c), c, t, bool(m) or bool(SCREEN.search(' '.join(r).lower()))))
    named = [s for s in shots if s[3]]
    if not shots: say('NOT CHECKED', 'shot list: no filled rows yet')
    elif not named: say('NOT CHECKED', 'shot list: no Camera cell uses the vocabulary (стоп · медленный наезд · отъезд · сдвиг · быстрый наезд · удар · хлёст · склейка)')
    else:
        odd = [f'#{s[0]} «{s[4]}»' for s in shots if s[4] and not s[3]]
        if odd: say('WARN', f'shot list: camera not in the vocabulary: {", ".join(odd[:6])} (стоп · медленный наезд · отъезд · сдвиг · быстрый наезд · удар · хлёст · склейка)')
        sg = open('docs/style_guide.md', encoding='utf-8').read().lower() if os.path.exists('docs/style_guide.md') else ''
        STILL = 'образ на фразу' in sg or 'image per phrase' in sg   # FORMATS.md §9: the camera never moves
        K = [s[3] for s in named]; L_ = [s[0] for s in named]
        for i in range(len(K) - 2):
            if K[i] == K[i + 1] == K[i + 2] == 'hold' and STILL: continue   # the format holds the camera on purpose
            if K[i] == K[i + 1] == K[i + 2]: say('WARN', f'shot list: #{L_[i]}–#{L_[i + 2]} three times «{K[i]}» in a row: camera is punctuation, not a habit')
            elif {K[i], K[i + 1], K[i + 2]} <= PUSHES: say('WARN', f'shot list: #{L_[i]}–#{L_[i + 2]} three push-ins in a row: the eye stops feeling them')
        acc = sum(k in ACCENT for k in K)
        if acc * 3 > len(K): say('WARN', f'shot list: {acc} of {len(K)} shots are accents (snap · punch · whip), more than a third: accents stop being accents')
        for i, k in enumerate(K):
            nxt = K[i + 1:i + 3]
            if k in PUSHES and nxt and not set(nxt) & {'pull', 'pan', 'cut'}:
                say('WARN', f'shot list: #{L_[i]} pushes in and the next {len(nxt)} shot(s) never release it (pull · pan · cut): the frame keeps closing in')
        onto = [s[0] for s in named if s[3] in {'push', 'snap', 'pan', 'pull'} and s[6]]
        if len(onto) > 2:
            say('WARN', f'shot list: the camera tours screenshots in {len(onto)} shots (#{", #".join(onto[:6])}): if a screen is unreadable '
                'without the move, use a sign card or a live component (RULES.md); on a screen the state changes, not the camera')
    for lab, o, a, *_ in shots if iO is not None else ():
        if not o or o.lower().strip(' .:') in VAGUE: say('WARN', f'shot list: #{lab} object «{o}» — name the thing on screen, not "title" or "background"')
        if a and not [w for w in re.findall(r'[\w-]+', a.lower()) if w not in SHOWS]: say('WARN', f'shot list: #{lab} action «{a}» — what does it DO, besides appearing?')
    for pos, s in (('first', shots[0]), ('last', shots[-1])) if shots else ():
        o = s[1].lower()
        if any(w in o for w in CARD) and not (pos == 'last' and any(w in o for w in END_CARD)):
            say('WARN', f'shot list: the {pos} shot (#{s[0]} «{s[1]}») is a text card: open and close on a thing, not on type')

# ---- numbers on screen: every one is in the voice or in the sources (a number leaked from a reference film fails)
NUM_RU = {**{w: v for v, ws in enumerate([('ноль', 'нуля'), ('один', 'одна', 'одно', 'одного', 'одной', 'одну', 'одним', 'одному'),
          ('два', 'две', 'двух', 'двум', 'двумя'), ('три', 'трёх', 'трех', 'трём', 'трем', 'тремя'), ('четыре', 'четырёх', 'четырех', 'четырём', 'четырьмя'),
          ('пять', 'пяти', 'пятью'), ('шесть', 'шести', 'шестью'), ('семь', 'семи', 'семью'), ('восемь', 'восьми', 'восемью'),
          ('девять', 'девяти', 'девятью'), ('десять', 'десяти', 'десятью')]) for w in ws},
          **{s + e: v for s, v in (('одиннадцат', 11), ('двенадцат', 12), ('тринадцат', 13), ('четырнадцат', 14), ('пятнадцат', 15), ('шестнадцат', 16),
             ('семнадцат', 17), ('восемнадцат', 18), ('девятнадцат', 19), ('двадцат', 20), ('тридцат', 30)) for e in ('ь', 'и', 'ью')},
          'сорок': 40, 'сорока': 40, 'пятьдесят': 50, 'пятидесяти': 50, 'шестьдесят': 60, 'шестидесяти': 60, 'семьдесят': 70, 'семидесяти': 70,
          'восемьдесят': 80, 'восьмидесяти': 80, 'девяносто': 90, 'девяноста': 90, 'сто': 100, 'ста': 100, 'двести': 200, 'двухсот': 200,
          'триста': 300, 'трёхсот': 300, 'трехсот': 300, 'четыреста': 400, 'четырёхсот': 400, 'четырехсот': 400, 'пятьсот': 500, 'пятисот': 500,
          'шестьсот': 600, 'шестисот': 600, 'семьсот': 700, 'семисот': 700, 'восемьсот': 800, 'восьмисот': 800, 'девятьсот': 900, 'девятисот': 900,
          'полтора': 1.5, 'полторы': 1.5,
          **{w: v for v, w in enumerate('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen '
                                        'seventeen eighteen nineteen'.split())},
          **{w: 10 * (i + 2) for i, w in enumerate('twenty thirty forty fifty sixty seventy eighty ninety'.split())}}
SCALE = [('тысяч', 1e3), ('тыс', 1e3), ('миллиард', 1e9), ('млрд', 1e9), ('миллион', 1e6), ('млн', 1e6), ('thousand', 1e3), ('million', 1e6),
         ('billion', 1e9), ('bn', 1e9), ('k', 1e3), ('m', 1e6), ('hundred', 100)]
scale_of = lambda w: next((v for s, v in SCALE if w == s or (len(s) > 3 and w.startswith(s))), None)

def numbers(text, words=False):
    """Numbers in a text, one tuple of readings each: «1 200» (1200,), «1,5 млн» (1.5, 1500000), «40 %» (40, '%'),
    and with words=True «двадцать пять тысяч» (25000,)."""
    out = []; toks = re.findall(r'\d+(?:[   ]\d{3})*(?:[.,]\d+)?|[^\W\d_]+', text.lower())
    i = 0
    while i < len(toks):
        t = toks[i]
        if t[0].isdecimal():   # «²» is isdigit() but not a number
            v = float(re.sub(r'[   ]', '', t).replace(',', '.'))
            sc = scale_of(toks[i + 1]) if i + 1 < len(toks) and not toks[i + 1][0].isdigit() else None
            out.append((v, v * sc) if sc else (v,))
            i += 1; continue
        if words and (t in NUM_RU or len(t) > 3 and (scale_of(t) or 0) >= 1e3):
            total = cur = 0.0
            while i < len(toks) and (toks[i] in NUM_RU or scale_of(toks[i]) or toks[i] in ('с', 'and', 'половиной')):
                w = toks[i]
                if w in NUM_RU: cur += NUM_RU[w]
                elif w == 'половиной': cur += 0.5
                elif scale_of(w):
                    if scale_of(w) == 100: cur = (cur or 1) * 100
                    else: total += (cur or 1) * scale_of(w); cur = 0
                i += 1
            out.append((total + cur,)); continue
        i += 1
    return [tuple(round(v, 6) for v in n) for n in out]
pool = lambda text, words=False: {v for n in numbers(text, words) for v in n}

def sources():
    """Text of the sources the brief lists: (text, [what was not read])."""
    val = None
    for p in ('brief.md',):
        if os.path.exists(p):
            for line in open(p, encoding='utf-8'):
                c = [x.strip() for x in line.strip().strip('|').split('|')]
                if len(c) > 1 and c[0].lower() in ('источники', 'sources'): val = c[1]
    if not val or val.strip() in ('?', '—', '-'):
        return None, ['brief.md: the Sources row is empty']
    text, skipped = [], []
    for part in re.split(r'[,;]\s*', val):
        cand = re.findall(r'`([^`]+)`', part) or re.findall(r'\]\(([^)]+)\)', part) or [part.strip()]
        for c in cand:
            if re.match(r'https?://', c): skipped.append(f'{c} (URL, not fetched)'); continue
            path = next((q for q in [os.path.expanduser(c)] + [os.path.join(*(['..'] * n + [c])) for n in range(1, 5)] if os.path.exists(q)), None)
            if not path: skipped.append(c); continue
            files = [path] if os.path.isfile(path) else [os.path.join(d, f) for d, _, fs in os.walk(path) for f in fs][:300]
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext in ('.md', '.txt', '.csv', '.json', '.html', '.tsv') and os.path.getsize(f) < 5e6: text.append(open(f, encoding='utf-8', errors='replace').read())
                elif ext == '.pdf':
                    r = subprocess.run(['pdftotext', '-layout', f, '-'], capture_output=True, text=True) if shutil.which('pdftotext') else None
                    if r and r.returncode == 0: text.append(r.stdout)
                    else: skipped.append(f'{f} (no pdftotext)')
    return ('\n'.join(text) if text else None), skipped

on_screen = [(f'shot #{s[0]}', s[5]) for s in shots if s[5]]
voice, sec = [], '?'
if os.path.exists('SCRIPT.md'):
    for line in open('SCRIPT.md', encoding='utf-8'):
        m = re.match(r'##\s+(\d+)', line); sec = m.group(1) if m else sec
        m = re.match(r'\s*\*\*(Голос|Voice|VO|Титр|Title):\*\*\s*(.*)', line)
        if not m: continue
        if m.group(1) in ('Титр', 'Title'):
            if not m.group(2).startswith('<'): on_screen.append((f'SCRIPT § {sec} title', m.group(2)))
        else: voice.append(re.sub(r'\{[^}]*\}\s*$', '', m.group(2)))
if not on_screen: say('NOT CHECKED', 'numbers on screen: no on-screen text in docs/shotlist.md and no **Титр:** in SCRIPT.md')
elif not voice: say('NOT CHECKED', 'numbers on screen: SCRIPT.md has no **Голос:** lines to check them against')
else:
    src_text, skipped = sources()
    known = pool(' '.join(voice), words=True) | (pool(src_text) if src_text else set())
    if src_text is None: say('NOT CHECKED', 'numbers on screen: sources not read (' + '; '.join(skipped[:3]) + '): checked against the voice only')
    elif skipped: say('NOT CHECKED', 'numbers on screen: sources not read: ' + '; '.join(skipped[:4]))
    small = 0
    for where, txt in on_screen:
        # dates and clock times («8 октября», «15:05») are logistics from the brief, not claims: not checked
        txt = re.sub(r'\b\d{1,2}:\d{2}\b|\b\d{1,2}\s+(?:январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*', ' ', txt, flags=re.I)
        vals = numbers(txt)
        # integers ≤ 10 without a unit are step numbers and list labels («3», «шаг 2») — too common to check
        big = [n for n in vals if not (len(n) == 1 and n[0] <= 10 and n[0] == int(n[0]) and not re.search(rf'(?<![\d.,]){int(n[0])}\s*%', txt))]
        small += len(vals) - len(big)
        for n in big:
            if not set(n) & known: say('FAIL', f'numbers on screen: {where} «{txt[:60]}» shows {n[-1]:g}, which is neither in the voice nor in the sources: a number from somewhere else?')
    if small: print(f'(numbers on screen: {small} integer(s) ≤ 10 taken as labels, not checked)')

order = {'FAIL': 0, 'WARN': 1, 'NOT CHECKED': 2}
for lv, msg in sorted(out, key=lambda x: order[x[0]]): print(f'{lv:<12}{msg}')
nF, nW = sum(lv == 'FAIL' for lv, _ in out), sum(lv == 'WARN' for lv, _ in out)
print(f'plan: {len(cues)} cues, {len(vo)} voice phrases, {len(spans)} captions · {nF} FAIL, {nW} WARN')
sys.exit(1 if nF else 0)

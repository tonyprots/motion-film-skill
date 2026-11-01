#!/usr/bin/env python3
"""Pick the film's stage theme (engine/lib/themes.js) from what the film is about. Run from the project root once
brief.md is filled (and again after SCRIPT.md, if the first pick was a fallback):
  python3 scripts/theme_pick.py                 # read brief.md + SCRIPT.md, pick, write timeline.json "theme", fetch fonts
  python3 scripts/theme_pick.py --set school    # take this theme, no scoring
  python3 scripts/theme_pick.py --dry           # print the ranking, write nothing
  python3 scripts/theme_pick.py --no-fonts      # do not run scripts/fonts.sh
The film reads the choice with THEMES.auto() (film.js). How it picks:
  - a theme named in the brief (`school`, «тема school») wins outright;
  - otherwise every theme scores the genre words it is made for (brief counts twice, SCRIPT.md once), and a format
    that is only 9x16 adds to the feed-native themes;
  - light by default: dark themes (newsroom, blueprint, graphite) count at 0.6 unless the brief asks for dark
    («тёмн», «ночн», «dark», «кино»); then they count at 1.3 and the light ones at 0.7;
  - nothing scores → notebook, the universal light explainer; `reference` is never picked (comparison only);
  - brand colours or fonts in the brief or a preset → the brand keeps palette and type, the theme gives the hand only
    ("only": "hand").
Writes timeline.json "theme": {name, only?, why, alt}, the brief row «Тема сцены», and fetches the fonts it needs."""
import json, os, re, subprocess, sys

# name: (dark, hand fontsource id, genre stems — lowercase, Russian and English, matched as word starts)
THEMES = {
    'notebook':   (False, 'caveat', 'исследован аналитик разбор вывод инсайт опрос данны гипотез стратег отток метрик когорт '
                   'research analys insight survey strategy churn cohort findings'),
    'draft':      (False, 'lxgw-wenkai-tc:700', 'архитектур инженер устройств механизм схем чертёж чертеж конструкц сборк деталь '
                   'прототип железо сервер инфраструктур api как работает engineering architecture hardware how it works prototype'),
    'studio':     (False, 'bad-script', 'продукт запуск презентац фич функци релиз сервис приложени интерфейс клиент '
                   'product launch feature release service app demo'),
    'feed':       (False, 'shantell-sans', 'reels shorts tiktok рилс шортс лента совет лайфхак ошибк соцсет тренд блогер подписчик '
                   'tips hack mistakes social creator followers'),
    'riso':       (False, 'neucha', 'анонс событи фестивал концерт вечеринк афиш зин молодёж молодеж клуб маркет выставк '
                   'event festival party zine gig exhibition'),
    'card':       (False, 'great-vibes', 'поздрав рождени юбиле свадьб праздник новый год спасибо благодар памят мам пап '
                   'birthday wedding anniversary greeting thank holiday'),
    'yard':       (False, 'rubik-wet-paint', 'спорт турнир матч музык улиц двор граффити стритбол забег скейт '
                   'sport tournament match street music graffiti skate'),
    'stationery': (False, 'playpen-sans', 'лайфстайл привычк личн уют рецепт чек-лист список план выходн утро '
                   'lifestyle habit checklist routine recipe weekend cozy'),
    'school':     (False, 'marck-script', 'обучени урок курс школ объясня учебн лекци физик математик детей задач '
                   'education lesson course school tutorial learn explain kids'),
    'newsroom':   (True, 'caveat', 'новост расследов инцидент авари кризис скандал утечк взлом суд выбор санкц '
                   'news investigat breaking incident breach crisis scandal'),
    'graphite':   (True, 'pangolin', 'финанс выручк прибыл отчётност квартал бюджет инвест акци рынок оценк ebitda '
                   'finance revenue earnings quarterly budget invest stock valuation'),
    'blueprint':  (True, 'lxgw-wenkai-tc:700', 'архитектур инженер устройств механизм схем конструкц железо сервер '
                   'engineering architecture hardware blueprint'),
}
DARK_ASK = re.compile(r'тёмн|темн|ночн|\bdark\b|\bnight|\bкино|cinema|noir', re.I)
VERTICAL = ('feed', 'yard', 'riso', 'stationery')

ROWS = {'brand': ('Цвета бренда', 'Brand colours'), 'fonts': ('Шрифты', 'Fonts'), 'formats': ('Форматы', 'Formats'),
        'theme': ('Тема сцены', 'Stage theme')}

def row(md, key):
    """Value column of a brief table row (Russian or English label, see ROWS); '' when absent or unanswered."""
    for line in md.splitlines():
        c = [x.strip() for x in line.strip().strip('|').split('|')]
        if len(c) >= 2 and any(c[0].lower().startswith(k.lower()) for k in ROWS[key]):
            v = c[1]
            return '' if v in ('?', '—', '-', '') or v.startswith(('выбирает', 'picked by', 'agent picks')) else v
    return ''

def answers(md):
    """What the brief says: the value column of its table and the free text, not the template's own labels and defaults."""
    out = []
    for line in md.splitlines():
        if line.strip().startswith('|'):
            c = [x.strip() for x in line.strip().strip('|').split('|')]
            if len(c) >= 2 and not c[0].startswith(ROWS['theme']) and not set(c[1]) <= set('-: ') and c[1] not in ('?', 'Значение', 'Value'):
                out.append(c[1])
        elif not line.startswith('#'):
            out.append(line)
    return '\n'.join(out)

def score(text, stems):
    low = text.lower()
    return [s for s in stems.split() if re.search(r'(?<![\w-])' + re.escape(s), low)]

MSG = {'ru': {'named': 'названа в брифе', 'none': 'по брифу жанр не виден: светлая универсальная «Тетрадь стратега»',
              'words': 'слова брифа', 'vertical': 'вертикаль', 'set': 'задана вручную',
              'brand': 'у ролика свои цвета и шрифты бренда: от темы только рукопись', 'alt': 'альтернативы'},
       'en': {'named': 'named in the brief', 'none': 'no genre in the brief: the light all-purpose notebook',
              'words': 'brief words', 'vertical': 'vertical', 'set': 'set by hand',
              'brand': 'the film has its own brand colours and fonts: the theme gives the hand only', 'alt': 'alternatives'}}

def lang_of(brief):
    return 'en' if re.search(r'^\| Stage theme', brief, re.M) or re.search(r'^\| Subject', brief, re.M) else 'ru'

def pick(brief, script='', tl=None):
    tl = tl or {}
    L = MSG[lang_of(brief)]
    fmt = row(brief, 'formats')
    brief = answers(brief)
    named = re.findall(r'`(\w+)`|(?:тем[аеуы]|theme)\s+[«"]?(\w+)', brief, re.I)
    for a, b in named:
        n = (a or b).lower()
        if n in THEMES:
            return n, f"{L['named']}: {n}", []
    dark_ask = bool(DARK_ASK.search(brief))
    vertical = re.fullmatch(r'\s*9\s*[x×:]\s*16\s*', fmt or '') is not None
    ranking = []
    for name, (dark, _, stems) in THEMES.items():
        hb, hs = score(brief, stems), score(script, stems)
        s = 2 * len(hb) + len(set(hs) - set(hb))
        s *= (1.3 if dark_ask else 0.6) if dark else (0.7 if dark_ask else 1)
        if vertical and name in VERTICAL: s += 1
        ranking.append((round(s, 2), name, sorted(set(hb) | set(hs))))
    ranking.sort(key=lambda r: (-r[0], list(THEMES).index(r[1])))
    top = ranking[0]
    if top[0] <= 0 or (vertical and top[0] <= 1 and not top[2]):
        name, why = 'notebook', L['none']
    else:
        name, why = top[1], f"{L['words']}: " + ', '.join(top[2][:6]) + (f" · {L['vertical']}" if vertical and top[1] in VERTICAL else '')
    alt = [r[1] for r in ranking if r[1] != name and r[0] > 0][:2]
    return name, why, alt

def has_brand(brief, tl):
    return bool(row(brief, 'brand') or row(brief, 'fonts') or (tl.get('brand') or {}).get('colors'))

def template_lines():
    here = os.path.dirname(os.path.abspath(__file__))
    skill = os.path.dirname(here)
    if os.path.exists(os.path.join(here, 'providers', '.skill')):                  # a project: init.sh wrote the skill path
        skill = open(os.path.join(here, 'providers', '.skill'), encoding='utf-8').read().strip()
    p = os.path.join(skill, 'templates', 'SCRIPT.md')
    return {l.strip() for l in open(p, encoding='utf-8')} if os.path.exists(p) else set()

def main():
    a = sys.argv[1:]
    if not os.path.exists('timeline.json'): sys.exit('timeline.json missing: run from the project root')
    tl = json.load(open('timeline.json', encoding='utf-8'))
    brief = open('brief.md', encoding='utf-8').read() if os.path.exists('brief.md') else ''
    script = open('SCRIPT.md', encoding='utf-8').read() if os.path.exists('SCRIPT.md') else ''
    tpl = template_lines()
    script = '\n'.join(l for l in script.splitlines() if l.strip() not in tpl)   # the template's own text is not the film
    if '--set' in a:
        name = a[a.index('--set') + 1]
        if name not in THEMES and name != 'reference': sys.exit(f'unknown theme {name}: {", ".join(THEMES)}')
        name, why, alt = name, MSG[lang_of(brief)]['set'], []
    else:
        name, why, alt = pick(brief, script, tl)
    brand = has_brand(brief, tl)
    L = MSG[lang_of(brief)]
    if brand and name != 'reference': why += f" · {L['brand']}"
    th = {'name': name, 'why': why, 'alt': alt, **({'only': 'hand'} if brand else {})}
    print(f'theme: {name}{" (hand only)" if brand else ""} — {why}' + (f" · {L['alt']}: {', '.join(alt)}" if alt else ''))
    if '--dry' in a: return
    tl['theme'] = th
    json.dump(tl, open('timeline.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    if brief:
        if re.search(r'^\| Stage theme', brief, re.M):
            line = f'| Stage theme (THEMES) | `{name}`{" — hand only" if brand else ""}: {why} | `scripts/theme_pick.py` from genre and tone |'
            brief = re.sub(r'^\| Stage theme.*$', lambda m: line, brief, flags=re.M)
        else:
            line = f'| Тема сцены (THEMES) | `{name}`{" — только рукопись" if brand else ""}: {why} | `scripts/theme_pick.py` по жанру и тону |'
            brief = re.sub(r'^\| Тема сцены.*$', lambda m: line, brief, flags=re.M)
        open('brief.md', 'w', encoding='utf-8').write(brief)
    if '--no-fonts' not in a:
        here = os.path.dirname(os.path.abspath(__file__))
        fonts = os.path.join('scripts', 'fonts.sh') if os.path.exists('scripts/fonts.sh') else os.path.join(here, 'fonts.sh')
        args = [THEMES[name][1]] if brand and name in THEMES else [name]
        if subprocess.run(['sh', fonts, *args]).returncode:
            print('WARN fonts not fetched (network?): run  sh scripts/fonts.sh ' + ' '.join(args) + '  before the render')

if __name__ == '__main__':
    main()

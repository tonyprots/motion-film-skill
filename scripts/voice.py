#!/usr/bin/env python3
"""Voiceover for a motion-film project, through any configured provider. Run from the project root.

  voice.py voices  [--provider P] [--lang ru]                 list voices (providers that have a catalogue)
  voice.py samples "<the tightest real line>" --voices a,b,c  one take per voice → audio/samples/<provider>-<voice>.mp3
  voice.py lines   [--only s2a,s3b] [--no-check]              every line of audio/vo/lines.json → audio/vo/<id>.wav
  voice.py check   [--only …]                                 transcribe the takes in audio/vo/ and score them against the script
                                                              (use it on takes you recorded yourself, too)
Common flags: --provider P  --voice V  --model M  --style "<delivery note for the whole film>"  --check-with P

Settings: flags → timeline.json "voiceover" {provider, voice, model, lang, style} and "transcribe" {provider} →
<skill>/defaults.local.json → <skill>/defaults.json. Keep one provider and one voice for the whole film.
Requests go one at a time: parallel TTS requests hang on several providers.
Every take is transcribed and retried (up to 3 takes, the last without direction tags) if it drifts from the text.
The script text leaves the machine: it goes to the voice provider and the checking provider."""
import argparse, difflib, json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import providers as P

MOOD = {'neutral': '', 'intrigue': 'curious, leaning in', 'concern': 'serious, weighty', 'relief': 'relieved, warm smile',
        'confident': 'confident, crisp', 'warm': 'warm, gentle', 'excited': 'excited, bright',
        'интрига': 'curious, leaning in', 'тревога': 'serious, weighty', 'облегчение': 'relieved, warm smile',
        'уверенность': 'confident, crisp', 'тепло': 'warm, gentle', 'нейтрально': ''}
PACE = {'slow': 'slowly', 'fast': 'energetic, a bit faster', 'normal': '', 'медленно': 'slowly', 'быстро': 'energetic, a bit faster'}


def direction(L, base=''):
    tags = [x for x in (PACE.get(L.get('pace', ''), L.get('pace', '')), MOOD.get(L.get('mood', ''), L.get('mood', ''))) if x]
    parts = [base] if base else []
    if tags: parts.append(', '.join(tags))
    if L.get('stress'): parts.append(f'stress the words "{L["stress"]}"')
    return '; '.join(parts)


def norm(s):
    return re.sub(r'[^\w ]', '', re.sub(r'[-–—]', ' ', s.lower().replace('ё', 'е'))).split()


# Number words on the script side and digits on the transcript side are dropped before comparing: some checkers
# (ElevenLabs Scribe) write "1200" for «тысяча двести» whatever they are asked.
NUMW = set(('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen '
            'eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion percent '
            'ноль один одна одно одну одного два две двух три трёх трех четыре четырёх пять шесть семь восемь девять десять '
            'одиннадцать двенадцать тринадцать четырнадцать пятнадцать шестнадцать семнадцать восемнадцать девятнадцать '
            'двадцать тридцать сорок пятьдесят шестьдесят семьдесят восемьдесят девяносто сто двести триста четыреста '
            'пятьсот шестьсот семьсот восемьсот девятьсот тысяча тысячи тысяч миллион миллиона миллионов миллиард '
            'процент процента процентов пяти шести семи восьми девяти десяти сорока').split())


def score(want, heard):
    w, h = norm(want), norm(heard)
    if any(x.isdigit() for x in h):
        w = [x for x in w if x not in NUMW]; h = [x for x in h if not x.isdigit()]
        want, heard = ' '.join(w), ' '.join(h)
    a, b = ''.join(norm(want)), ''.join(norm(heard))   # compact spellings ("YouTube" / "You Tube") compare equal
    return round(max(difflib.SequenceMatcher(None, norm(want), norm(heard)).ratio(), difflib.SequenceMatcher(None, a, b).ratio()), 3)


def save(raw, out):
    if not raw: sys.exit(f'empty audio for {out}')
    fmt = ['-c:a', 'libmp3lame', '-b:a', '96k'] if out.endswith('.mp3') else []
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0', *fmt, out], input=raw, check=True)
    return dur(out)


def dur(p):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout.strip())


def heard(checker, path, lang):
    with tempfile.NamedTemporaryFile(suffix='.mp3') as tmp:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-b:a', '64k', tmp.name], check=True)
        return P.need(checker, 'transcribe')(tmp.name, lang)


ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('cmd', choices=['voices', 'samples', 'lines', 'check']); ap.add_argument('text', nargs='?')
for f in ('provider', 'voice', 'model', 'style', 'lang', 'voices', 'only', 'out', 'check-with'): ap.add_argument('--' + f)
ap.add_argument('--no-check', action='store_true')
a = ap.parse_args()

S = P.settings('voiceover'); T = P.settings('transcribe')
prov = P.resolve(a.provider or S.get('provider') or 'auto')
if not prov or prov == 'none': sys.exit('no voice provider: set timeline.json "voiceover.provider" or pass --provider (reference/PROVIDERS.md)')
lang = a.lang or S.get('lang') or None
style = a.style if a.style is not None else S.get('style', '')
if prov == 'file':   # your own recordings: audio/vo/<id>.wav, named by line id
    if a.cmd != 'check': sys.exit('provider "file": put your own takes in audio/vo/<id>.wav (ids from lines.json), then run voice.py check')
    M = None
else:
    M = P.load(prov)
model = a.model or (S.get('model') if (a.provider in (None, S.get('provider'))) else None) or getattr(M, 'DEFAULT_MODEL', None)
voice = a.voice or (S.get('voice') if (a.provider in (None, S.get('provider'))) else None) or getattr(M, 'DEFAULT_VOICE', None)
chk_name = a.check_with or T.get('provider') or (prov if hasattr(M, 'transcribe') else None)
checker = P.load(chk_name) if chk_name and not a.no_check else None

if a.cmd == 'voices':
    for v in P.need(M, 'voices')(lang):
        print(f"{v['id']:24s} {v['name'][:28]:28s} {v.get('gender', ''):7s} {v.get('accent', '')[:12]:12s} {v.get('about', '')}")
    sys.exit()

if a.cmd == 'samples':
    if not a.text: sys.exit('samples needs one real line of the script (the tightest one)')
    out = a.out or 'audio/samples'; os.makedirs(out, exist_ok=True)
    for v in (a.voices or voice or '').split(','):
        if not v: sys.exit(f'--voices is required for {M.NAME}: {getattr(M, "VOICE_HINT", "")}')
        p = os.path.join(out, f'{prov}-{v}.mp3')
        print(p, round(save(P.need(M, 'tts')(a.text, v, model, style, lang), p), 1), 's')
    sys.exit()

lines = json.load(open('audio/vo/lines.json', encoding='utf-8'))
only = set(a.only.split(',')) if a.only else None
todo = [L for L in lines if not only or L['id'] in only]

if a.cmd == 'check':
    if not checker: sys.exit('no transcription provider: pass --check-with P or set timeline.json "transcribe.provider"')
    bad = 0
    for L in todo:
        f = next((f'audio/vo/{L["id"]}{e}' for e in ('.wav', '.mp3', '.m4a', '.flac') if os.path.exists(f'audio/vo/{L["id"]}{e}')), None)
        if not f: print(L['id'], 'MISSING'); bad += 1; continue
        h = heard(checker, f, lang); r = score(L['text'], h); bad += r < 0.93
        print(L['id'], f'{dur(f):5.1f}s', 'ok ' if r >= 0.93 else 'BAD', r, '' if r >= 0.93 else f'«{h[:90]}»')
    sys.exit(1 if bad else 0)

if not voice: sys.exit(f'no voice for {M.NAME}: set timeline.json "voiceover.voice" or pass --voice ({getattr(M, "VOICE_HINT", "")})')
total = 0
for L in todo:
    d_full = direction(L, style)
    out = f'audio/vo/{L["id"]}.wav'
    attempts = [d_full, d_full, style] if d_full != style else [style]   # direction is sometimes read aloud: last try without it
    for k, dr in enumerate(attempts):
        d = save(P.need(M, 'tts')(L['text'], voice, model, dr, lang), out)
        if not checker: r = None; break
        h = heard(checker, out, lang); r = score(L['text'], h)
        if r >= 0.93: break
        print(f'  {L["id"]} take {k + 1}: {r} «{h[:70]}» — retry')
    total += d
    print(L['id'], round(d, 2), 's', f'· {dr}' if dr else '', '' if r is None else f'· match {r}')
json.dump({'provider': prov, 'model': model, 'voice': voice, 'style': style, 'lang': lang}, open('audio/vo/voice.json', 'w'), ensure_ascii=False)
print('total', round(total, 1), 's  ·', M.NAME, model, voice)

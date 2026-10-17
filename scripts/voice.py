#!/usr/bin/env python3
"""Voiceover for a motion-film project, through any configured provider. Run from the project root.

  voice.py voices  [--provider P] [--lang ru]                 list voices (providers that have a catalogue)
  voice.py samples "<the tightest real line>" --voices a,b,c  one take per voice → audio/samples/<provider>-<voice>.mp3
  voice.py lines   [--only s2a,s3b] [--no-check]              every line of audio/vo/lines.json → audio/vo/<id>.wav
  voice.py check   [--only …]                                 transcribe the takes in audio/vo/ and score them against the script
                                                              (use it on takes you recorded yourself, too)
  voice.py check-mix [--only …]                               transcribe each phrase as it sounds in the FINAL audio/mix.wav
                                                              (music, sfx, ducking and limiter included); < 0.85 = lost in the mix
Common flags: --provider P  --voice V  --model M  --style "<delivery note for the whole film>"  --check-with P

Settings: flags → timeline.json "voiceover" {provider, voice, model, lang, style} and "transcribe" {provider} →
<skill>/defaults.local.json → <skill>/defaults.json. Keep one provider and one voice for the whole film.
Requests go one at a time: parallel TTS requests hang on several providers.
Every take is transcribed and retried (up to 3 takes, the last without direction tags) if it drifts from the text.
A line's "say" (lexicon.json → extract_lines.py) is what the voice reads; the check accepts either spelling.
Word timings: when the checker returns them (ElevenLabs Scribe does, in the same call), `lines` and `check` write
audio/vo/<id>.words.json — every word of the line's "text" with its start/end in the take (s), aligned to what was heard;
words the checker spelled differently (numbers, lexicon terms) share the time between their matched neighbours by letter
count. layout_vo.py turns them into the marks <id>.w<k>. For takes that already exist: `voice.py check` (no new voice).
The script text leaves the machine: it goes to the voice provider and the checking provider."""
import argparse, difflib, json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import providers as P
import inspect

MOOD = {'neutral': '', 'intrigue': 'curious, leaning in', 'concern': 'serious, weighty', 'relief': 'relieved, warm smile',
        'confident': 'confident, crisp', 'warm': 'warm, gentle', 'excited': 'excited, bright',
        'интрига': 'curious, leaning in', 'тревога': 'serious, weighty', 'облегчение': 'relieved, warm smile',
        'уверенность': 'confident, crisp', 'тепло': 'warm, gentle', 'восторг': 'excited, bright', 'нейтрально': ''}
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


def score2(L, heard):   # either spelling counts: the script's, or the lexicon's spoken form
    return max(score(L['text'], heard), score(L['say'], heard) if L.get('say') else 0)


def save(raw, out):
    if not raw: sys.exit(f'empty audio for {out}')
    fmt = ['-c:a', 'libmp3lame', '-b:a', '96k'] if out.endswith('.mp3') else []
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0', *fmt, out], input=raw, check=True)
    return dur(out)


def dur(p):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout.strip())


def hear(checker, path, lang):
    """(text, words): words = [{text, start, end}] in the take's seconds when the checker gives them, else None."""
    if hasattr(checker, 'transcribe_words') or getattr(checker, 'NAME', '') == 'ElevenLabs':
        with tempfile.NamedTemporaryFile(suffix='.flac') as tmp:   # lossless: an mp3 encoder delay would shift every word
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-ac', '1', '-ar', '16000', tmp.name], check=True)
            return checker.transcribe_words(tmp.name, lang) if hasattr(checker, 'transcribe_words') else scribe(checker, tmp.name, lang)
    with tempfile.NamedTemporaryFile(suffix='.mp3') as tmp:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-b:a', '64k', tmp.name], check=True)
        return P.need(checker, 'transcribe')(tmp.name, lang), None


def scribe(M, path, lang):
    """ElevenLabs Scribe: the request transcribe() makes, keeping the word timings the answer carries anyway (no extra cost)."""
    from providers._http import post, multipart
    fields = {'model_id': 'scribe_v2', 'tag_audio_events': 'false', 'timestamps_granularity': 'word'}
    if lang: fields['language_code'] = lang
    form = multipart(fields, {'file': (os.path.basename(path), open(path, 'rb').read(), 'audio/flac')})
    J = json.load(post(f'{M.BASE}/v1/speech-to-text', M._h(), form=form, timeout=180, name=M.NAME, hint=M._hint))
    return J['text'].strip(), [{'text': w['text'].strip(), 'start': round(w['start'], 3), 'end': round(w['end'], 3)}
                               for w in J.get('words') or [] if w.get('type', 'word') == 'word' and w.get('text', '').strip()]


# Display words, the same rule in layout_vo.py, sync.mjs and lib/captions.js: whitespace pieces; a piece with no letter
# or digit ("—", "…") sticks to the word before it (a leading one, to the first word). wkey = the word for matching
# (case, ё, punctuation dropped).
def tokens(text):
    out, lead = [], ''
    for p in text.replace('|', ' ').split():
        if re.search(r'\w', p): out.append(lead + p); lead = ''
        elif out: out[-1] += ' ' + p
        else: lead += p + ' '
    return out


def wkey(w):
    return re.sub(r'[\W_]', '', w.lower().replace('ё', 'е'))


def align(text, hw):
    """Script words of `text` with times from the heard words hw. Matched words take their own time; a run of unmatched
    ones (digits vs number words, lexicon terms) shares the heard span between its matched neighbours by letter count."""
    T = tokens(text); m = [None] * len(T)
    for blk in difflib.SequenceMatcher(None, [wkey(t) for t in T], [wkey(w['text']) for w in hw], autojunk=False).get_matching_blocks():
        for j in range(blk.size): m[blk.a + j] = blk.b + j
    out, i = [], 0
    while i < len(T):
        if m[i] is not None:
            w = hw[m[i]]; out.append({'text': T[i], 'start': w['start'], 'end': w['end'], 'heard': True}); i += 1; continue
        j = i
        while j < len(T) and m[j] is None: j += 1
        h0 = m[i - 1] + 1 if i else 0; h1 = m[j] if j < len(T) else len(hw)
        if h1 > h0: s, e = hw[h0]['start'], hw[h1 - 1]['end']
        else:
            s = hw[m[i - 1]]['end'] if i else hw[0]['start']
            e = hw[m[j]]['start'] if j < len(T) else hw[-1]['end']
        n = [max(1, len(wkey(t))) for t in T[i:j]]; tot, acc = sum(n), 0
        for t, k in zip(T[i:j], n):
            out.append({'text': t, 'start': round(s + (e - s) * acc / tot, 3), 'end': round(s + (e - s) * (acc + k) / tot, 3), 'heard': False}); acc += k
        i = j
    return out


def save_words(L, take, hw):
    if not hw: return ''
    W = align(L['text'], hw)
    json.dump({'id': L['id'], 'take': os.path.basename(take), 'take_mtime': round(os.path.getmtime(take), 3), 'source': chk_name,
               'words': W, 'heard': hw}, open(f'audio/vo/{L["id"]}.words.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    return f' · words {sum(w["heard"] for w in W)}/{len(W)} matched'


ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('cmd', choices=['voices', 'samples', 'lines', 'check', 'check-mix']); ap.add_argument('text', nargs='?')
for f in ('provider', 'voice', 'model', 'style', 'lang', 'voices', 'only', 'out', 'check-with'): ap.add_argument('--' + f)
ap.add_argument('--no-check', action='store_true')
a = ap.parse_args()

S = P.settings('voiceover'); T = P.settings('transcribe')
prov = P.resolve(a.provider or S.get('provider') or 'auto')
if not prov or prov == 'none': sys.exit('no voice provider: set timeline.json "voiceover.provider" or pass --provider (reference/PROVIDERS.md)')
lang = a.lang or S.get('lang') or None
style = a.style if a.style is not None else S.get('style', '')
if prov == 'file':   # your own recordings: audio/vo/<id>.wav, named by line id
    if a.cmd not in ('check', 'check-mix'): sys.exit('provider "file": put your own takes in audio/vo/<id>.wav (ids from lines.json), then run voice.py check')
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
        h, hw = hear(checker, f, lang); r = score2(L, h); bad += r < 0.93
        print(L['id'], f'{dur(f):5.1f}s', 'ok ' if r >= 0.93 else 'BAD', r, '' if r >= 0.93 else f'«{h[:90]}»', save_words(L, f, hw))
    sys.exit(1 if bad else 0)

if a.cmd == 'check-mix':   # what the viewer hears: each phrase cut from the final mix
    if not checker: sys.exit('no transcription provider: pass --check-with P or set timeline.json "transcribe.provider"')
    if not os.path.exists('audio/mix.wav') or not os.path.exists('audio/vo_placed.json'): sys.exit('needs audio/mix.wav and audio/vo_placed.json (vo.py, mix.py)')
    placed = {p['id']: p for p in json.load(open('audio/vo_placed.json', encoding='utf-8'))}
    bad = n = 0
    for L in todo:
        p = placed.get(L['id'])
        if not p: print(L['id'], 'NOT PLACED'); bad += 1; continue
        with tempfile.NamedTemporaryFile(suffix='.mp3') as tmp:
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(max(0, p['t0'] - 0.05)), '-to', str(p['t1'] + 0.35), '-i', 'audio/mix.wav',
                            '-ac', '1', '-ar', '16000', '-b:a', '64k', tmp.name], check=True)
            h = P.need(checker, 'transcribe')(tmp.name, lang)
        r = score2(L, h); bad += r < 0.85; n += 1
        print(L['id'], 'ok ' if r >= 0.85 else 'LOST', r, '' if r >= 0.85 else f'«{h[:90]}» — the mix buries it: lower music/sfx under this phrase')
    print(f'check-mix: {n} phrases transcribed from audio/mix.wav, {bad} lost')
    sys.exit(1 if bad or not n else 0)

if not voice: sys.exit(f'no voice for {M.NAME}: set timeline.json "voiceover.voice" or pass --voice ({getattr(M, "VOICE_HINT", "")})')
total = 0
for L in todo:
    d_full = direction(L, style)
    out = f'audio/vo/{L["id"]}.wav'
    attempts = [d_full, d_full, style] if d_full != style else [style]   # direction is sometimes read aloud: last try without it
    hw = None
    for k, dr in enumerate(attempts):
        f = P.need(M, 'tts')   # providers that read no direction text (ElevenLabs v4) take the line itself: mood/pace → settings
        d = save(f(L.get('say', L['text']), voice, model, dr, lang, line=L) if 'line' in inspect.signature(f).parameters else f(L.get('say', L['text']), voice, model, dr, lang), out)
        if not checker: r = None; break
        h, hw = hear(checker, out, lang); r = score2(L, h)
        if r >= 0.93: break
        print(f'  {L["id"]} take {k + 1}: {r} «{h[:70]}» — retry')
    total += d
    print(L['id'], round(d, 2), 's', f'· {dr}' if dr else '', '' if r is None else f'· match {r}', save_words(L, out, hw) if checker else '')
json.dump({'provider': prov, 'model': model, 'voice': voice, 'style': style, 'lang': lang}, open('audio/vo/voice.json', 'w'), ensure_ascii=False)
print('total', round(total, 1), 's  ·', M.NAME, model, voice)

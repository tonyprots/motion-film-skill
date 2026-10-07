#!/usr/bin/env python3
"""Real sound effects from Freesound (CC0 only) → a shared library that sfx.mjs plays instead of its synth.
Once per machine; needs FREESOUND_API_KEY (free: freesound.org/apiv2/apply) and ffmpeg. ~10 MB.

  .venv/bin/python scripts/sfx_fetch.py [--per 10] [--force]

Library: $MOTION_FILM_HOME/sfx (default ~/.cache/motion-film/sfx): <type>/<freesound id>.wav (mono 48 kHz 16-bit,
trimmed to the attack, peak −2 dBFS) and index.json (name, author, url, licence, lead = seconds from file start to the
loudest point: whooshes and risers peak ON their cue). Types are the synth's: click tick pop thump whoosh riser shutter.
Picks the most downloaded, well-rated CC0 sounds of each query, at most 3 per author, and drops files that clip, are
too quiet, hold several hits where one is wanted, or do not measure like their type (FIT: a click is short and bright,
a boom is low with a tail, a riser peaks at its end). CC0 needs no credit; index.json keeps the source anyway.
The Freesound API is free for non-commercial use; commercial use of the API is negotiated with UPF. The sounds
themselves are CC0 either way."""
import argparse, json, os, shutil, subprocess, sys, tempfile, urllib.parse, urllib.request
import numpy as np, soundfile as sf

# type → (queries, duration range s, max loud peaks in one file, words that disqualify a sound)
SPEC = {
    'click':   (['ui click', 'mouse click', 'button click'], (0.02, 0.5), 1, ['double', 'drum', 'gun', 'beep', 'hint']),
    'tick':    (['soft click', 'keyboard key press', 'soft tick'], (0.02, 0.4), 1, ['clock', 'loop', 'typing fast', 'typewriter']),
    'pop':     (['ui pop', 'bubble pop', 'pop sound'], (0.05, 0.7), 1, ['music', 'voice', 'mouth', 'cartoon']),
    'thump':   (['sub boom', 'cinematic boom', 'bass impact', 'low boom hit'], (0.3, 3.0), 2,
                ['gun', 'explosion', 'door', 'riser', 'chop', 'punch', 'clang', 'backfire', 'crash', 'flesh']),
    'whoosh':  (['whoosh', 'swoosh transition', 'swish'], (0.25, 1.6), 1, ['sword', 'fire', 'wind loop', 'vehicle', 'chop']),
    'riser':   (['riser', 'uplifter', 'reverse cymbal', 'build up sweep'], (1.2, 5.0), 1, ['loop', 'music', 'vocal', 'engine', 'horror', 'inhale']),
    'shutter': (['camera shutter', 'shutter click'], (0.05, 0.7), 2, ['burst', 'film winding', 'motor']),
}
# what a good one measures like (lab 2026-10-06: sorting by downloads alone put a beep among clicks, a boxing punch among
# booms and a front-loaded hit among risers). body = time above −20 dB, cen = spectral centroid Hz, low = energy share
# under 200 Hz, pk = loudest point as a share of the file.
FIT = {
    'click':   lambda m: m['body'] <= 0.06 and m['cen'] >= 1500,
    'tick':    lambda m: m['body'] <= 0.08 and m['cen'] >= 1500,
    'pop':     lambda m: m['body'] <= 0.10 and m['dur'] <= 0.3,
    'thump':   lambda m: m['low'] >= 0.6 and m['cen'] <= 400 and 0.15 <= m['body'] <= 1.2,
    'whoosh':  lambda m: m['low'] <= 0.4 and 0.08 <= m['body'] <= 0.5,
    'riser':   lambda m: m['pk'] >= 0.6 and m['body'] >= 0.8,
    'shutter': lambda m: m['cen'] >= 3000,
}
BUILDS = {'whoosh', 'riser'}   # these peak late: keep the build, store where the peak is
API = 'https://freesound.org/apiv2/search/text/'
SR = 48000

ap = argparse.ArgumentParser(); ap.add_argument('--per', type=int, default=10); ap.add_argument('--force', action='store_true')
a = ap.parse_args()
KEY = os.environ.get('FREESOUND_API_KEY') or sys.exit('FREESOUND_API_KEY is not set (free key: https://freesound.org/apiv2/apply)')
LIB = os.path.join(os.environ.get('MOTION_FILM_HOME') or os.path.expanduser('~/.cache/motion-film'), 'sfx')
if os.path.exists(os.path.join(LIB, 'index.json')) and not a.force:
    sys.exit(f'{LIB} exists (--force to rebuild it; projects keep their own frozen copy in audio/sfx_lib/)')


def search(q, lo, hi):
    qs = urllib.parse.urlencode({'query': q, 'filter': f'license:"Creative Commons 0" duration:[{lo} TO {hi}]', 'sort': 'downloads_desc',
                                 'fields': 'id,name,duration,num_downloads,avg_rating,num_ratings,username,url,previews,tags', 'page_size': 40})
    req = urllib.request.Request(f'{API}?{qs}', headers={'Authorization': f'Token {KEY}'})
    return json.load(urllib.request.urlopen(req, timeout=60))['results']


def env(x, win=0.005):
    n = max(1, int(win * SR)); k = len(x) // n
    return np.sqrt((x[:k * n].reshape(k, n) ** 2).mean(1) + 1e-12), n


def shape(path, typ, maxpeaks):
    """trim to the attack, cut the tail, normalise; None when the file is unusable. Returns (samples, lead s)."""
    x, sr = sf.read(path, dtype='float32')
    if x.ndim > 1: x = x.mean(1)
    pk = np.abs(x).max()
    if pk < 0.02 or (np.abs(x) > 0.995).mean() > 0.002: return None          # silent or clipped
    e, n = env(x); top = e.max()
    loud = np.flatnonzero(e > top * 10 ** (-40 / 20))
    start = loud[0] * n if typ in BUILDS else max(0, loud[0] * n - int(0.002 * SR))
    end = min(len(x), (loud[-1] + 1) * n + int(0.02 * SR))
    x = x[start:end]
    e, n = env(x)
    # count separate loud hits (≥80 ms apart, within 6 dB of the loudest)
    hot = e > top * 10 ** (-6 / 20); hits, last = 0, -1e9
    for i in np.flatnonzero(hot):
        if (i - last) * n > 0.08 * SR: hits += 1
        last = i
    if hits > maxpeaks: return None
    P = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2 + 1e-12; f = np.fft.rfftfreq(len(x), 1 / SR)
    above = np.flatnonzero(e > e.max() * 0.1)
    m = {'dur': len(x) / SR, 'body': (above[-1] - above[0]) * n / SR, 'cen': float((f * P).sum() / P.sum()),
         'low': float(P[f < 200].sum() / P.sum()), 'pk': float(np.argmax(e) / len(e))}
    if not FIT[typ](m): return None
    fade = min(len(x) // 4, int(0.02 * SR)); x[-fade:] *= np.linspace(1, 0, fade)
    x = x / np.abs(x).max() * 10 ** (-2 / 20)
    lead = (int(np.argmax(e)) * n + n / 2) / SR if typ in BUILDS else 0.0
    return x, round(lead, 4)


tmp = tempfile.mkdtemp(); new = LIB + '.new'
shutil.rmtree(new, ignore_errors=True); os.makedirs(new)
index = {}
for typ, (queries, (lo, hi), maxpeaks, bad) in SPEC.items():
    seen, per_user, got = set(), {}, []
    cands = []
    for q in queries:
        for r in search(q, lo, hi):
            if r['id'] in seen: continue
            seen.add(r['id'])
            text = (r['name'] + ' ' + ' '.join(r['tags'])).lower()
            if any(b in text for b in bad): continue
            if r['num_ratings'] and r['avg_rating'] < 3.8: continue
            cands.append(r)
    cands.sort(key=lambda r: -r['num_downloads'])
    os.makedirs(os.path.join(new, typ))
    for r in cands:
        if len(got) >= a.per: break
        if per_user.get(r['username'], 0) >= 3: continue
        mp3 = os.path.join(tmp, f"{r['id']}.mp3"); wav = os.path.join(tmp, f"{r['id']}.wav")
        try:
            urllib.request.urlretrieve(r['previews']['preview-hq-mp3'], mp3)
        except Exception as e:
            print(f'  skip {r["id"]}: {e}'); continue
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-ac', '1', '-ar', str(SR), wav], check=True)
        res = shape(wav, typ, maxpeaks)
        if res is None: continue
        x, lead = res
        f = f"{typ}/{r['id']}.wav"
        sf.write(os.path.join(new, f), x, SR, subtype='PCM_16')
        got.append({'id': r['id'], 'file': f, 'name': r['name'], 'author': r['username'], 'url': r['url'], 'licence': 'CC0-1.0',
                    'dur': round(len(x) / SR, 3), 'lead': lead, 'downloads': r['num_downloads']})
        per_user[r['username']] = per_user.get(r['username'], 0) + 1
    index[typ] = got
    print(f'{typ:8s} {len(got):2d} of {len(cands)} candidates')
json.dump(index, open(os.path.join(new, 'index.json'), 'w'), ensure_ascii=False, indent=1)
if os.path.exists(LIB): shutil.move(LIB, LIB + '.old')
shutil.move(new, LIB); shutil.rmtree(LIB + '.old', ignore_errors=True); shutil.rmtree(tmp, ignore_errors=True)
size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(LIB) for f in fs)
print(f'{LIB}: {sum(map(len, index.values()))} sounds, {size / 1e6:.1f} MB · sfx.mjs uses them from now on')

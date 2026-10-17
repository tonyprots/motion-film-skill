#!/usr/bin/env python3
"""Music for the film → audio/music.wav (48 kHz stereo), from whichever source timeline.json "music.source" names.
Run from the project root, after the voice is laid out (timeline.duration is final).

  synth                 scripts/music.py: an original score on the exact nominal grid (bpm, sections, chords).
                        No beat measurement needed: the grid IS the score. Don't run beats.py on it.
  file                  your own track: "music": {"source": "file", "path": "…/track.mp3", "bpm": 118, "start": 12.5}
                        cut from "start" (s), looped with a crossfade if shorter than the film. Then beats.py measures it.
  <provider>            generated: elevenlabs or openrouter (Lyria), or any provider with music().
                        "music": {"source": "elevenlabs", "prompt": "…", "model": null}. Then beats.py measures it.
  ace                   generated locally by ACE-Step 1.5 (providers/ace_step.py, set up once): nothing leaves the machine.
                        "music": {"source": "ace", "prompt": "…", "key": "A minor", "seed": 7}; bpm = timeline.bpm.
                        Same seed + same request → same track; a changed request regenerates (free). Then beats.py.
  none                  no music: mix.py writes a silent bed under voice and SFX.

The prompt describes only the music (genre, BPM, instruments, mood, "instrumental, no vocals"): providers refuse
brands and products, and a vocal line fights the voiceover. Generated music costs credits: say so before running
(not ace: local and free, but ~6 GB of weights once).
Usage: music_source.py [S | --source S] [--prompt "…"] [--bpm N] [--key "A minor"] [--seed N] [--force]"""
import argparse, inspect, json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import providers as P

DEFAULT_PROMPT = ('Instrumental background music, calm and confident, minimal electronic with soft piano and a light pulse, '
                  '{bpm} BPM, no vocals, steady under a voiceover, no dramatic drops, gentle ending.')


def ff(*a):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *a], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-1500:])


def dur(p):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout)


def fit(src, start, D):
    """src → audio/music.wav: from `start`, exactly D seconds, looped with a 1.5 s crossfade when too short, 2 s fade out."""
    L = dur(src) - start
    os.makedirs('audio', exist_ok=True)
    if L >= D:
        ff('-ss', str(start), '-t', str(D), '-i', src, '-af', f'afade=t=out:st={max(0, D - 2)}:d=2', '-ar', '48000', '-ac', '2', 'audio/music.wav')
    else:   # chain copies with acrossfade until long enough
        n = int(D // (L - 1.5)) + 1
        ins = sum([['-ss', str(start), '-i', src] for _ in range(n)], [])
        chain, last = [], '0:a'
        for i in range(1, n):
            chain.append(f'[{last}][{i}:a]acrossfade=d=1.5[x{i}]'); last = f'x{i}'
        chain.append(f'[{last}]atrim=0:{D},afade=t=out:st={max(0, D - 2)}:d=2[out]')
        ff(*ins, '-filter_complex', ';'.join(chain), '-map', '[out]', '-ar', '48000', '-ac', '2', 'audio/music.wav')
        print(f'looped {n}× with crossfades ({L:.1f} s track, {D:.1f} s film)')


ALIAS = {'ace': 'ace_step', 'ace-step': 'ace_step'}
ap = argparse.ArgumentParser(); ap.add_argument('pos_source', nargs='?'); ap.add_argument('--source'); ap.add_argument('--prompt')
ap.add_argument('--bpm', type=float); ap.add_argument('--key'); ap.add_argument('--seed', type=int); ap.add_argument('--force', action='store_true')
a = ap.parse_args()
TL = json.load(open('timeline.json', encoding='utf-8'))
M = TL.get('music') or {}
src = a.source or a.pos_source or M.get('source') or P.defaults().get('music', {}).get('source') or 'synth'
src = ALIAS.get(src, src)
D = float(TL['duration']); here = os.path.dirname(os.path.abspath(__file__))

if src == 'synth':
    subprocess.run([sys.executable, os.path.join(here, 'music.py')], check=True)
    if os.path.exists('beats.json'): print('note: beats.json exists — delete it so sync.mjs uses the exact nominal grid of the synth score')
elif src == 'none':
    ff('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', str(D), 'audio/music.wav'); print('silent bed', D, 's')
else:
    if src == 'file':
        path = M.get('path') or sys.exit('"music.path" is required for source "file"')
    else:
        mod = P.load(P.resolve(src, 'music'))
        fn = P.need(mod, 'music')
        bpm = a.bpm or M.get('bpm') or TL.get('bpm')
        prompt = a.prompt or M.get('prompt') or DEFAULT_PROMPT.format(bpm=int(bpm or 100))
        extra = {k: v for k, v in (('bpm', bpm), ('key', a.key or M.get('key')),
                                   ('seed', a.seed if a.seed is not None else M.get('seed'))) if v is not None}
        extra = {k: v for k, v in extra.items() if k in inspect.signature(fn).parameters}   # only what the provider takes
        if getattr(mod, 'LOCAL', False) and 'seed' in inspect.signature(fn).parameters:
            extra.setdefault('seed', 0)
        req = dict(prompt=prompt, seconds=round(D + 4, 2), model=M.get('model'), **extra)
        old = next((f'audio/music_{src}.{e}' for e in ('wav', 'mp3') if os.path.exists(f'audio/music_{src}.{e}')), None)
        side = f'audio/music_{src}.json'
        same = old and os.path.exists(side) and json.load(open(side, encoding='utf-8')) == req
        if old and not a.force and (same or not getattr(mod, 'LOCAL', False)):
            print(f'reusing {old} (generated earlier; --force for a new one' + ('' if getattr(mod, 'LOCAL', False) else ', paid') + ')')
            out = old
        else:
            raw, ext = fn(prompt, D + 4, M.get('model'), **extra)
            os.makedirs('audio', exist_ok=True)
            out = f'audio/music_{src}.{ext}'; open(out, 'wb').write(raw)
            json.dump(req, open(side, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            print(f'{mod.NAME}: {out} {dur(out):.1f} s' + (f' (asked {bpm:g} BPM)' if 'bpm' in extra else ''))
        path = out
    fit(path, float(M.get('start') or 0), D)
    bpm = M.get('bpm') or TL.get('bpm')
    print(f'next: python3 scripts/beats.py audio/music.wav  (set timeline.bpm ≈ {bpm} as the hint), check the residual, then node scripts/sync.mjs')
print('audio/music.wav', round(dur('audio/music.wav'), 2), 's')

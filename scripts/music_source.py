#!/usr/bin/env python3
"""Music for the film → audio/music.wav (48 kHz stereo), from whichever source timeline.json "music.source" names.
Run from the project root, after the voice is laid out (timeline.duration is final).

  synth                 scripts/music.py: an original score on the exact nominal grid (bpm, sections, chords).
                        No beat measurement needed: the grid IS the score. Don't run beats.py on it.
  file                  your own track: "music": {"source": "file", "path": "…/track.mp3", "bpm": 118, "start": 12.5}
                        cut from "start" (s), looped with a crossfade if shorter than the film. Then beats.py measures it.
  <provider>            generated: elevenlabs or openrouter (Lyria), or any provider with music().
                        "music": {"source": "elevenlabs", "prompt": "…", "model": null}. Then beats.py measures it.
  none                  no music: mix.py writes a silent bed under voice and SFX.

The prompt describes only the music (genre, BPM, instruments, mood, "instrumental, no vocals"): providers refuse
brands and products, and a vocal line fights the voiceover. Generated music costs credits: say so before running.
Usage: music_source.py [--source S] [--prompt "…"] [--force]"""
import argparse, json, os, subprocess, sys
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


ap = argparse.ArgumentParser(); ap.add_argument('--source'); ap.add_argument('--prompt'); ap.add_argument('--force', action='store_true')
a = ap.parse_args()
TL = json.load(open('timeline.json', encoding='utf-8'))
M = TL.get('music') or {}
src = a.source or M.get('source') or P.defaults().get('music', {}).get('source') or 'synth'
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
        out = f'audio/music_{src}.mp3'
        if os.path.exists(out) and not a.force:
            print(f'reusing {out} (generated earlier; --force to pay for a new one)')
        else:
            mod = P.load(P.resolve(src, 'music'))
            prompt = a.prompt or M.get('prompt') or DEFAULT_PROMPT.format(bpm=int(TL.get('bpm', 100)))
            raw, ext = P.need(mod, 'music')(prompt, D + 4, M.get('model'))
            out = f'audio/music_{src}.{ext}'; open(out, 'wb').write(raw)
            print(f'{mod.NAME}: {out} {dur(out):.1f} s')
        path = out
    fit(path, float(M.get('start') or 0), D)
    bpm = M.get('bpm') or TL.get('bpm')
    print(f'next: python3 scripts/beats.py audio/music.wav  (set timeline.bpm ≈ {bpm} as the hint), check the residual, then node scripts/sync.mjs')
print('audio/music.wav', round(dur('audio/music.wav'), 2), 's')

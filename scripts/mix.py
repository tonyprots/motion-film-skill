# Mix music + sfx + voiceover → audio/mix.wav at -14 LUFS integrated, ≤ -1 dBTP, 48 kHz 24-bit. Run from the project root.
#   python3 scripts/mix.py
# Inputs (any may be missing except music): audio/music.wav, audio/sfx.wav, audio/vo.wav
# Levels in dB from timeline.json "mix": { "music": 0, "sfx": -3, "vo": 0, "duck": true }
# Polish (timeline.json "mix", all on by default, false to switch off), plain ffmpeg filters, no extra dependencies:
#   "voice_chain": TTS → studio voice: high-pass 80 Hz, de-esser, -2 dB at 300 Hz (boxiness), +1.5 dB at 3 kHz (clarity),
#                  +1.5 dB air above 10 kHz, compressor 3:1 (attack 10 ms, release 120 ms)
#   "room": wet share of a short small-room convolution (RT60 ~0.3 s, 15 ms pre-delay, dark) on voice and SFX, default 0.08:
#           one shared space instead of dry TTS over dry clicks
#   "room_tone": dBFS of a quiet pink floor under the whole film, default -60: silence is not digital zero
#   "pocket": -3 dB around 2.5 kHz in the music while there is a voice: room for consonants
#   "glue": gentle bus compressor before the limiter (1.8:1, 1–2 dB of reduction)
# The music is trimmed/padded to timeline.duration with a 0.3 s tail fade, and side-chain ducked under the VO.
# After the master, a speech check per phrase (audio/vo_placed.json): the voice against everything else under it (ducked music
# + sfx). Under 15 dB → WARNING, under 12 dB → TOO LOW (exit 1): words get lost on a phone speaker. And the hits that land
# on speech: a hit under a spoken word is masked, the ear gets neither.
import json, os, subprocess, sys

TL = json.load(open('timeline.json'))
DUR = float(TL['duration'])
LV = {'music': 0.0, 'sfx': -3.0, 'vo': 0.0, 'duck': True, 'voice_chain': True, 'room': 0.08, 'room_tone': -60, 'pocket': True, 'glue': True, **(TL.get('mix') or {})}
have = {k: os.path.exists(f'audio/{k}.wav') for k in ('music', 'sfx', 'vo')}
if not have['music']: raise SystemExit('audio/music.wav missing (python3 scripts/music.py, or copy the supplied track there)')


def ff(args, capture=False):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-y', *args], capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr[-2000:])
    return r.stderr


inputs, chains, labels = [], [], []
def inp(name, gain, mono_to_stereo=False, pre='', room=False):
    inputs.extend(['-i', f'audio/{name}.wav']); i = len(inputs) // 2 - 1
    up = ',pan=stereo|c0=c0|c1=c0' if mono_to_stereo else ',aformat=channel_layouts=stereo'
    out = f'{name}_dry' if room and ROOM > 0 else name
    chains.append(f'[{i}:a]aresample=48000{pre}{up},apad,atrim=0:{DUR},volume={gain}dB[{out}]')
    if out != name:   # dry + ROOM × the room
        j = len(inputs) // 2; inputs.extend(['-i', 'audio/_room_ir.wav'])
        chains.append(f'[{out}]asplit[{name}_d][{name}_s];[{name}_s][{j}:a]afir=gtype=none[{name}_w];'
                      f'[{name}_d][{name}_w]amix=inputs=2:normalize=0:weights=1 {ROOM:.3f}:duration=first[{name}]')

# a small dark room as an impulse response: decorrelated L/R noise, exponential decay to -60 dB in 0.3 s, 15 ms pre-delay,
# one-pole low-pass at 6 kHz, unit energy. Generated with a fixed seed: the same mix every run.
ROOM = float(LV['room'] or 0)
if ROOM > 0:
    import numpy as np, wave
    from scipy.signal import lfilter
    sr, rt = 48000, 0.3
    n = int(rt * 1.2 * sr); t = np.arange(n) / sr
    ir = np.random.default_rng(7).standard_normal((n, 2)) * np.exp(-6.91 * t / rt)[:, None]
    a1 = np.exp(-2 * np.pi * 6000 / sr); ir = lfilter([1 - a1], [1, -a1], ir, axis=0)
    ir = np.vstack([np.zeros((int(0.015 * sr), 2)), ir]); ir /= np.sqrt((ir ** 2).sum(0)).max()
    with wave.open('audio/_room_ir.wav', 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(ir, -1, 1) * 32767).astype('<i2').tobytes())

VOICE = (',highpass=f=80:poles=2,deesser=i=0.35:m=0.5:f=0.55,equalizer=f=300:t=q:w=1:g=-2,equalizer=f=3000:t=q:w=0.8:g=1.5,'
         'highshelf=f=10000:g=1.5,acompressor=threshold=0.1:ratio=3:attack=10:release=120:makeup=1.6') if LV['voice_chain'] else ''
inp('music', LV['music'])
chains[-1] = chains[-1].replace('[music]', f",afade=t=out:st={DUR - 0.3}:d=0.3{',equalizer=f=2500:t=q:w=0.7:g=-3' if LV['pocket'] and have['vo'] else ''}[music]")
if have['sfx']: inp('sfx', LV['sfx'], room=True)
if have['vo']:
    inp('vo', LV['vo'], mono_to_stereo=True, pre=VOICE, room=True)
    if LV['duck']:
        chains.append('[vo]asplit[vo_out][vo_key]')
        chains.append('[music][vo_key]sidechaincompress=threshold=0.04:ratio=4:attack=15:release=280:makeup=1[music_out]')
ducked = have['vo'] and LV['duck']
labels = (['[music_out]'] if ducked else ['[music]']) + (['[sfx]'] if have['sfx'] else []) + ((['[vo_out]'] if ducked else ['[vo]']) if have['vo'] else [])
TONE = f";anoisesrc=c=pink:a=1:seed=7:d={DUR}:r=48000,lowpass=f=4000,volume={LV['room_tone']}dB,aformat=channel_layouts=stereo[tone]" if LV['room_tone'] is not None and LV['room_tone'] is not False else ''
if TONE: labels.append('[tone]')
GLUE = ',acompressor=threshold=0.125:ratio=1.8:attack=30:release=200:makeup=1' if LV['glue'] else ''
graph = ';'.join(chains) + TONE + f";{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=first{GLUE},alimiter=limit=0.95:level=false[mix]"
ff([*inputs, '-filter_complex', graph, '-map', '[mix]', '-c:a', 'pcm_f32le', 'audio/mix_raw.wav'])
if have['vo']:   # the same graph without the voice in the sum: what sits under each word
    bg = [l for l in labels if l not in ('[vo_out]', '[vo]')]
    g2 = ';'.join(chains) + TONE + f";{''.join(bg)}amix=inputs={len(bg)}:normalize=0:duration=first[bg]"
    # and the voice as it reaches the sum (after the chain, room and gain): the speech check compares these two
    ff([*inputs, '-filter_complex', g2, '-map', '[bg]', '-c:a', 'pcm_f32le', 'audio/_bg.wav', '-map', '[vo_out]' if ducked else '[vo]', '-c:a', 'pcm_f32le', 'audio/_vo.wav'])

# loudness: linear gain to -14 LUFS into a -1.5 dBFS limiter run at 4x oversampling (synth transients make
# inter-sample overs; a 48 kHz limiter lets true peak reach 0 dBTP), re-measured and corrected
def measure(path):
    e = ff(['-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'])
    summ = e[e.rfind('Summary'):]
    get = lambda k: float(next(l.split()[1] for l in summ.splitlines() if l.strip().startswith(k)))
    return get('I:'), get('Peak:')
I0, _ = measure('audio/mix_raw.wav'); gain = -14 - I0
for _ in range(3):
    ff(['-i', 'audio/mix_raw.wav', '-af', f'volume={gain:.2f}dB,aresample=192000,alimiter=limit=0.841:attack=1:release=40:level=false,aresample=48000', '-ar', '48000', '-c:a', 'pcm_s24le', 'audio/mix.wav'])
    I, TP = measure('audio/mix.wav')
    if abs(I + 14) <= 0.15: break
    gain += -14 - I
print(f"audio/mix.wav  inputs: {', '.join(k for k, v in have.items() if v)}  levels music {LV['music']} / sfx {LV['sfx']} / vo {LV['vo']} dB"
      f"{'  (music ducked under VO)' if have['vo'] and LV['duck'] else ''}")
print(f'integrated {I:.1f} LUFS (target -14)   true peak {TP:.1f} dBTP (limit -1)   gain {gain:+.1f} dB into the limiter')
if abs(I + 14) > 0.5 or TP > -1: print('WARNING: off target — the limiter is working too hard; lower the loudest stem (usually sfx) and rerun')

# speech over the background, per phrase: speech band (300–4000 Hz), voiced 50 ms frames only (pauses inside a phrase do not
# count), voice stem with its gain vs everything else after ducking. Calibrated on the demo film (approved by ear: 7–20 dB).
import numpy as np
def pcm(path, af='highpass=f=300,lowpass=f=4000'):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '16000', '-af', af, '-f', 'f32le', '-'], capture_output=True)
    return np.frombuffer(r.stdout, np.float32)
def frames_pow(a, t0, t1, fr=800):
    seg = a[int(t0 * 16000):int(t1 * 16000)]; n = len(seg) // fr
    return (seg[:n * fr].reshape(n, fr).astype(np.float64) ** 2).mean(1) if n else np.zeros(0)
bad = 0
if have['vo'] and os.path.exists('audio/vo_placed.json'):
    vo, bgw = pcm('audio/_vo.wav'), pcm('audio/_bg.wav'); g = 1.0   # _vo.wav already carries the gain and the chain
    rows = []
    for ph in json.load(open('audio/vo_placed.json', encoding='utf-8')):
        ev, eb = frames_pow(vo, ph['t0'], ph['t1']) * g, frames_pow(bgw, ph['t0'], ph['t1'])
        n = min(len(ev), len(eb))
        if not n: continue
        on = ev[:n] > ev[:n].max() * 0.01
        rows.append((round(float(10 * np.log10(ev[:n][on].mean() / (eb[:n][on].mean() + 1e-12))), 1), ph['id'], ph['text'][:50]))
    if rows:
        print(f"speech over background (300–4000 Hz, voiced frames): min {min(rows)[0]} dB ({min(rows)[1]}), median {sorted(rows)[len(rows) // 2][0]} dB"
              f" over {len(rows)} phrases · want ≥ 12, < 6 = words lost on a phone speaker")
        for d, i, t in sorted(r for r in rows if r[0] < 12)[:8]:
            print(f"  {'TOO LOW' if d < 6 else 'WARNING'} {i}: {d} dB «{t}» — lower music/sfx under it (timeline.mix) or raise vo")
        bad = sum(r[0] < 6 for r in rows)
    if os.path.exists('cues.json'):
        vo_full = pcm('audio/_vo.wav', 'anull'); placed = json.load(open('audio/vo_placed.json', encoding='utf-8'))
        hits = [c for c in json.load(open('cues.json'))['cues'] if c['type'] in ('pop', 'click', 'thump', 'shutter')]
        on_speech = [c for c in hits if any(ph['t0'] - 0.05 <= c['t'] <= ph['t1'] for ph in placed)
                     and (frames_pow(vo_full, c['t'] - 0.05, c['t'] + 0.15).mean() if len(frames_pow(vo_full, c['t'] - 0.05, c['t'] + 0.15)) else 0) * g > 10 ** -3.5]
        print(f"hits on speech: {len(on_speech)}/{len(hits)}" + (' — ' + ', '.join(f"{c['t']}s {c['type']}" for c in on_speech[:8]) if on_speech else '')
              + ('  · more than half: move hits into the pauses, the ear catches neither' if hits and len(on_speech) > len(hits) / 2 else ''))
elif have['vo']: print('speech over background: NOT CHECKED (no audio/vo_placed.json: run vo.py)')
for f in ('audio/_bg.wav', 'audio/_vo.wav', 'audio/_room_ir.wav'):
    if os.path.exists(f): os.remove(f)
sys.exit(1 if bad else 0)

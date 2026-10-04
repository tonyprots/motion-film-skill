# Mix music + sfx + voiceover → audio/mix.wav at -14 LUFS integrated, ≤ -1 dBTP, 48 kHz 24-bit. Run from the project root.
#   python3 scripts/mix.py
# Inputs (any may be missing except music): audio/music.wav, audio/sfx.wav, audio/vo.wav
# Levels in dB from timeline.json "mix": { "music": 0, "sfx": -3, "vo": 0, "duck": true }
# The music is trimmed/padded to timeline.duration with a 0.3 s tail fade, and side-chain ducked under the VO.
import json, os, subprocess

TL = json.load(open('timeline.json'))
DUR = float(TL['duration'])
LV = {'music': 0.0, 'sfx': -3.0, 'vo': 0.0, 'duck': True, **(TL.get('mix') or {})}
have = {k: os.path.exists(f'audio/{k}.wav') for k in ('music', 'sfx', 'vo')}
if not have['music']: raise SystemExit('audio/music.wav missing (python3 scripts/music.py, or copy the supplied track there)')


def ff(args, capture=False):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-y', *args], capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr[-2000:])
    return r.stderr


inputs, chains, labels = [], [], []
def inp(name, gain, mono_to_stereo=False):
    inputs.extend(['-i', f'audio/{name}.wav']); i = len(inputs) // 2 - 1
    up = ',pan=stereo|c0=c0|c1=c0' if mono_to_stereo else ',aformat=channel_layouts=stereo'
    chains.append(f'[{i}:a]aresample=48000{up},apad,atrim=0:{DUR},volume={gain}dB[{name}]')
inp('music', LV['music'])
chains[-1] = chains[-1].replace('[music]', f',afade=t=out:st={DUR - 0.3}:d=0.3[music]')
if have['sfx']: inp('sfx', LV['sfx'])
if have['vo']:
    inp('vo', LV['vo'], mono_to_stereo=True)
    if LV['duck']:
        chains.append('[vo]asplit[vo_out][vo_key]')
        chains.append('[music][vo_key]sidechaincompress=threshold=0.04:ratio=4:attack=15:release=280:makeup=1[music_out]')
ducked = have['vo'] and LV['duck']
labels = (['[music_out]'] if ducked else ['[music]']) + (['[sfx]'] if have['sfx'] else []) + ((['[vo_out]'] if ducked else ['[vo]']) if have['vo'] else [])
graph = ';'.join(chains) + f";{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=first,alimiter=limit=0.95:level=false[mix]"
ff([*inputs, '-filter_complex', graph, '-map', '[mix]', '-c:a', 'pcm_f32le', 'audio/mix_raw.wav'])

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

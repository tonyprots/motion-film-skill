"""Cut voiceover takes into phrases, place each phrase on the beat grid → audio/vo.wav + audio/vo_placed.json.
Run from the project root. Then run scripts/sync.mjs so the film gets window.VO (kinetic words land with the voice).

  python3 scripts/vo.py --scan     convert every take in audio/vo/ to 48 kHz mono WAV and print its speech segments
                                   (start–end in seconds): use them as the from/to cut points in vo.json
  python3 scripts/vo.py            place the phrases listed in vo.json

vo.json:
  { "voice": { "provider": "elevenlabs", "id": "...", "name": "..." },   (written by layout_vo.py)
    "phrases": [ { "id": "h1", "take": "l1", "from": 0.03, "to": 0.49, "at": "hook", "tempo": 1.0, "text": "One" }, ... ] }
  take   file stem in audio/vo/ (l1 → audio/vo/l1.wav)
  from/to  cut points inside the take (s) — cut at silences found by --scan
  at     beat number or timeline mark: where the phrase STARTS on the measured grid
  tempo  ffmpeg atempo for this phrase only (0.8–1.25 sounds natural). Never speed up a whole take: cut and place instead.
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt

SR = 48000
TL = json.loads(Path('timeline.json').read_text())
DUR = float(TL['duration'])
V = Path('audio/vo')


def ff(*a):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *a], check=True)


def to_wav(src):
    dst = src.with_suffix('.wav')
    if src.suffix != '.wav' and (not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime):
        ff('-i', str(src), '-ac', '1', '-ar', str(SR), '-c:a', 'pcm_s24le', str(dst))
    return dst


def load(take):
    for ext in ('.wav', '.mp3', '.m4a', '.ogg', '.flac'):
        if (V / f'{take}{ext}').exists():
            p = to_wav(V / f'{take}{ext}')
            y, sr = sf.read(p)
            if y.ndim > 1: y = y.mean(1)
            if sr != SR:
                ff('-i', str(p), '-ac', '1', '-ar', str(SR), str(V / f'_{take}_48k.wav')); y, _ = sf.read(V / f'_{take}_48k.wav')
            return y
    raise FileNotFoundError(f'no take "{take}" in {V}')


def segments(y, thresh_db=-38, min_sil=0.06, min_len=0.08):
    hop = int(0.005 * SR)
    rms = np.array([np.sqrt(np.mean(y[i:i + hop] ** 2)) for i in range(0, len(y) - hop, hop)])
    db = 20 * np.log10(rms / (rms.max() + 1e-12) + 1e-12)
    on = db > thresh_db
    segs, start, quiet = [], None, 0
    for i, v in enumerate(on):
        if v:
            if start is None: start = i
            quiet = 0
        elif start is not None:
            quiet += 1
            if quiet * hop / SR >= min_sil:
                end = i - quiet + 1
                if (end - start) * hop / SR >= min_len: segs.append((start * hop / SR, end * hop / SR))
                start, quiet = None, 0
    if start is not None: segs.append((start * hop / SR, len(on) * hop / SR))
    return [(round(max(0, a - 0.02), 3), round(b + 0.03, 3)) for a, b in segs]


def beat_time(x):
    x = TL['marks'][x] if isinstance(x, str) else float(x)
    G = json.loads(Path('beats.json').read_text()) if Path('beats.json').exists() else {'beats': [], 'beat': 60 / TL['bpm'], 'offset': 0}
    B, P = G['beats'], G.get('beat', 60 / TL['bpm'])
    if not B: return G.get('offset', 0) + x * P
    if x <= 0: return B[0] + x * P
    i = int(np.floor(x))
    if i >= len(B) - 1: return B[-1] + (x - len(B) + 1) * P
    return B[i] + (x - i) * (B[i + 1] - B[i])


def stretch(x, tempo):
    if abs(tempo - 1) < 1e-3: return x
    sf.write(V / '_s_in.wav', x, SR); ff('-i', str(V / '_s_in.wav'), '-af', f'atempo={tempo}', str(V / '_s_out.wav'))
    return sf.read(V / '_s_out.wav')[0]


def scan():
    for p in sorted(V.iterdir()):
        if p.name.startswith('_') or p.suffix not in ('.wav', '.mp3', '.m4a', '.ogg', '.flac'): continue
        if p.suffix != '.wav' and p.with_suffix('.wav').exists() and p.with_suffix('.wav').stat().st_mtime >= p.stat().st_mtime: continue
        y = load(p.stem)
        print(f'{p.stem:10s} {len(y) / SR:5.2f}s  ' + '  '.join(f'{a:.2f}–{b:.2f}' for a, b in segments(y)))


def place():
    spec = json.loads(Path('vo.json').read_text())
    bus = np.zeros(int(SR * DUR)); placed = []; takes = {}
    for ph in spec['phrases']:
        y = takes.setdefault(ph['take'], load(ph['take']))
        seg = y[int(ph['from'] * SR):int(ph['to'] * SR)].copy()
        f = int(0.012 * SR); seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
        seg = stretch(seg, ph.get('tempo', 1.0))
        t0 = beat_time(ph['at']); i = int(round(t0 * SR)); n = max(0, min(len(seg), len(bus) - i))
        bus[i:i + n] += seg[:n]
        placed.append({'id': ph['id'], 'text': ph['text'], 'at': ph['at'], 't0': round(t0, 3), 't1': round(t0 + len(seg) / SR, 3)})
    bus = sosfilt(butter(2, 90, 'highpass', fs=SR, output='sos'), bus)        # presence: HPF + gentle saturation
    bus = np.tanh(bus * 1.6) / np.tanh(1.6)
    sf.write('audio/vo.wav', bus, SR, subtype='PCM_24')
    Path('audio/vo_placed.json').write_text(json.dumps(placed, indent=1))
    for p in placed: print(f"{p['t0']:6.2f}–{p['t1']:6.2f}  {p['text']}")
    over = [(p['id'], q['id'], round(p['t1'] - q['t0'], 3)) for p, q in zip(placed, placed[1:]) if q['t0'] < p['t1'] - 0.005]
    late = [p['id'] for p in placed if p['t1'] > DUR]
    print('overlaps:', over or 'none', ' past the end:', late or 'none')


if __name__ == '__main__':
    scan() if '--scan' in sys.argv else place()

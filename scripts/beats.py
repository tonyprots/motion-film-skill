# Measure the beat grid → beats.json {bpm, beat, offset, beats, downbeats, hits}. Run from the project root.
#   python3 scripts/beats.py [audio/music.wav] [--stem audio/drums.wav]
#
#   hits      onset-strength peaks (librosa), backtracked to the preceding energy minimum, then refined to the attack
#             with a causal 0.5 ms envelope threshold (20 % of the rise). Weak peaks (echo/reverb tails) dropped.
#   beats     librosa beat tracker (tempo hint = timeline.bpm, half/double-time corrected) → straight-line fit (period)
#             → grid phase corrected by the median offset of strong hits near grid points → each beat snapped to a
#             strong hit within ±8 ms, else the grid. Covers the whole file.
#   downbeats every 4th beat; phase 0–3 chosen by sustained 20–150 Hz energy after the beat (bar-level bass roots).
# With --stem (a drums/kick stem of the same music) hits and beats are measured on the stem, downbeats on the mix.
import json, sys, os
import numpy as np, librosa
from scipy.signal import butter, sosfilt

args = sys.argv[1:]
stem = None
if '--stem' in args:
    i = args.index('--stem'); stem = args[i + 1]; del args[i:i + 2]
PATH = args[0] if args else 'audio/music.wav'
TL = json.load(open('timeline.json')) if os.path.exists('timeline.json') else {}
HINT = float(TL.get('bpm', 120))

y_mix, sr = librosa.load(PATH, sr=None, mono=True)
y0 = librosa.load(stem, sr=sr, mono=True)[0] if stem else y_mix
dur = len(y_mix) / sr
PAD = int(0.1 * sr)                          # silence pre-roll so an onset at t = 0 is detectable
y = np.concatenate([np.zeros(PAD), y0]); off = PAD / sr
HOP = 128

# ---------------- hits ----------------
env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
kw = dict(onset_envelope=env, sr=sr, hop_length=HOP, delta=0.04, wait=4, units='frames')
fr_pk = librosa.onset.onset_detect(**kw)
fr_bt = librosa.onset.onset_detect(**kw, backtrack=True)
hp = sosfilt(butter(2, 30, 'highpass', fs=sr, output='sos'), y)
W = int(0.0005 * sr)
envc = np.convolve(np.abs(hp), np.ones(W) / W)[:len(hp)]          # causal: no pre-echo
def attack(t_bt, t_pk, K=0.2):
    i0, i1 = int((t_bt - 0.004) * sr), int((t_pk + 0.004) * sr)
    i0 = max(i0, 0); seg = envc[i0:max(i1, i0 + 2)]
    floor = np.median(envc[max(0, i0 - int(0.003 * sr)):i0 + 1]) + 1e-7
    j = int(np.argmax(seg > floor + K * (seg.max() - floor)))
    return (i0 + j - W / 2) / sr
hits = []
for fb, fp in zip(fr_bt, fr_pk):
    s = float(env[fp] / env.max())
    if s < 0.12: continue
    t = attack(librosa.frames_to_time(fb, sr=sr, hop_length=HOP), librosa.frames_to_time(fp, sr=sr, hop_length=HOP)) - off
    if t > -0.003: hits.append({'t': round(max(0.0, t), 5), 's': round(s, 3)})
H = np.array([h['t'] for h in hits]); HS = np.array([h['s'] for h in hits])

# ---------------- beats ----------------
tempo, bt = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=HOP, start_bpm=HINT, tightness=400, units='time')
tempo = float(np.atleast_1d(tempo)[0]); bt = bt - off
k = np.round((bt - bt[0]) / (60 / tempo))
period, icpt = np.polyfit(k, bt, 1)
for f in (2.0, 0.5):                          # half/double-time correction toward the timeline tempo
    if abs(60 / (period / f) - HINT) < abs(60 / period - HINT) * 0.5: period /= f
t0 = icpt - np.floor((icpt + 0.03) / period) * period
grid = np.arange(t0, dur - 0.02, period)
strong = HS >= 0.3
offs = [H[strong][np.argmin(np.abs(H[strong] - g))] - g for g in grid] if strong.any() else []
offs = [o for o in offs if abs(o) < 0.03]
phase_corr = float(np.median(offs)) if offs else 0.0
grid = grid + phase_corr
if grid[0] < -0.001: grid = grid[1:]
beats, snapped = [], 0
for g in grid:
    cand = np.where((np.abs(H - g) <= 0.008) & (HS >= 0.2))[0] if len(H) else []
    if len(cand): beats.append(round(float(H[cand[np.argmin(np.abs(H[cand] - g))]]), 5)); snapped += 1
    else: beats.append(round(float(max(0.0, g)), 5))
resid = [min(abs(H[strong] - b)) * 1000 for b in beats if strong.any() and min(abs(H[strong] - b)) < 0.03]

# ---------------- downbeats (on the full mix) ----------------
S = np.abs(librosa.stft(y_mix, n_fft=4096, hop_length=HOP)) ** 2
freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)
low = S[(freqs > 20) & (freqs < 150)].sum(0)
def low_at(t):
    f0 = max(0, librosa.time_to_frames(t, sr=sr, hop_length=HOP)); f1 = max(f0 + 1, librosa.time_to_frames(t + 0.25, sr=sr, hop_length=HOP))
    return float(low[f0:f1].mean())
scores = np.array([np.mean([low_at(beats[i]) for i in range(p, len(beats), 4)]) for p in range(4)])
scores = scores / scores.max()
phase = int(np.argmax(scores))
downbeats = beats[phase::4]

out = {
    'source': PATH, 'stem': stem, 'duration': round(dur, 4),
    'bpm': round(60 / period, 3), 'beat': round(float(period), 6), 'offset': beats[0], 'tracker_bpm': round(tempo, 3),
    'phase_correction_ms': round(phase_corr * 1000, 2), 'max_grid_residual_ms': round(max(resid), 2) if resid else None,
    'beats': beats, 'downbeats': downbeats, 'downbeat_phase': phase, 'downbeat_scores': [round(float(s), 3) for s in scores],
    'hits': hits,
}
json.dump(out, open('beats.json', 'w'), indent=1)
print(f"bpm {out['bpm']} (tracker {tempo:.2f}, hint {HINT:g})  phase corr {phase_corr * 1000:+.2f} ms  beats {len(beats)} (snapped {snapped})  first {beats[0]:.4f}s  max residual {out['max_grid_residual_ms']} ms")
print(f"downbeat phase {phase}  scores {out['downbeat_scores']}")
print(f"hits {len(hits)} (strong >=0.3: {int(strong.sum())})")
if phase != 0: print('NOTE: downbeat phase is not 0 — bar 1 does not start on beat 0. Put marks on downbeats (beats.json.downbeats).')

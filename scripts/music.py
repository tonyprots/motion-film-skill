# Original score, synthesized in code → audio/music.wav (+ audio/drums.wav stem for beat measurement). Seeded.
# Run from the project root:  python3 scripts/music.py
#
# Reads timeline.json:
#   bpm, duration, marks
#   music.chords     one chord per bar, cycled: "Am" "F" "C" "G" "Dm" "Bb" "F#m" "Ebmaj7" "Gsus2" "Cadd9" ...
#   music.sections   [{ "at": beat|mark, "kind": ... }] — kinds:
#       intro   four-on-the-floor, rim backbeat, off-beat hats, root bass, mallet motif
#       full    + clap backbeat, 16th hats, off-beat bass plucks, brighter motif
#       dark    stripped: half-time kick, sparse rim, low bass, no motif (under dense UI / VO)
#       build   climbing mallet, clap roll accelerating into the next section, filtered-noise riser
#       gap     stop-time hit on its first beat, then silence (make the next section's first beat land hard)
#       drop    impact on its first beat (big kick, crash, chord stab, sub), then the full groove
#       outro   half-time, final chord on its first beat, rings out to the end
#   music.accents    [beat|mark, ...] extra crash + big kick (logo, CTA)
#   music.seed       integer (default 4242)
# Minimal and clean by design: kick, rim/clap, metallic hats, plucked sine bass, FM mallet. No pads, no vocals.
import json, os, re
import numpy as np, soundfile as sf
from scipy import signal

TL = json.load(open('timeline.json'))
MU = TL.get('music') or {}
SR, DUR, BPM = 48000, float(TL['duration']), float(TL['bpm'])
BEAT = 60 / BPM; N = int(SR * DUR); NB = int(np.ceil(DUR / BEAT))
beat_of = lambda m: TL['marks'][m] if isinstance(m, str) else float(m)
T = lambda b: b * BEAT


def mulberry32(seed, n):
    a = (np.uint64(seed) + np.arange(1, n + 1, dtype=np.uint64) * np.uint64(0x6D2B79F5)) & np.uint64(0xFFFFFFFF)
    t = ((a ^ (a >> np.uint64(15))) * (a | np.uint64(1))) & np.uint64(0xFFFFFFFF)
    t = (t ^ ((t + (((t ^ (t >> np.uint64(7))) * (t | np.uint64(61))) & np.uint64(0xFFFFFFFF))) & np.uint64(0xFFFFFFFF)))
    return ((t ^ (t >> np.uint64(14))) & np.uint64(0xFFFFFFFF)).astype(np.float64) / 4294967296.0


_seed = [int(MU.get('seed', 4242))]
def noise(n):
    _seed[0] += 7919; return mulberry32(_seed[0], n) * 2 - 1
def tt(d): return np.arange(int(d * SR)) / SR
def midi(m): return 440 * 2 ** ((m - 69) / 12)
def filt(x, kind, f, order=2): return signal.sosfilt(signal.butter(order, f, kind, fs=SR, output='sos'), x, axis=0)
def buf(): return np.zeros((N, 2))
GAPS = []   # [(b0, b1)] silent windows (gap sections); filled below
def add(dst, x, t0, gain=1.0, pan=0.0, force=False):
    if not force and any(g0 - 1e-6 <= t0 / BEAT < g1 for g0, g1 in GAPS): return
    i = int(round(t0 * SR))
    if x.ndim == 1: x = np.stack([x * np.sqrt(1 - pan), x * np.sqrt(1 + pan)], 1)
    if i < 0: x, i = x[-i:], 0
    j = min(N, i + len(x))
    if j > i: dst[i:j] += x[: j - i] * gain


# ---------- instruments ----------
def kick(g=1.0, big=False):
    t = tt(0.5 if big else 0.32)
    f = 46 + (120 if big else 95) * np.exp(-t * 30)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (5 if big else 9))
    click = filt(noise(len(t)), 'highpass', 3000) * np.exp(-t * 1200) * 0.25
    return np.tanh((body + click) * 1.5) * g

def rim(g=1.0):
    t = tt(0.08)
    tone = np.sin(2 * np.pi * 1720 * t) * 0.5 + np.sin(2 * np.pi * 820 * t) * 0.6
    return (tone * np.exp(-t * 90) + filt(noise(len(t)), 'bandpass', [1500, 5000]) * np.exp(-t * 400) * 0.6) * g

def clap(g=1.0):
    t = tt(0.25); n = filt(noise(len(t)), 'bandpass', [1000, 3500])
    env = sum(np.where(t >= o, np.exp(-(t - o) * 350), 0) for o in (0, 0.008, 0.017)) + np.where(t >= 0.02, np.exp(-(t - 0.02) * 22) * 0.5, 0)
    return n * env * g

def hat(g=1.0, open_=False):  # 808-style: six detuned square partials, high-passed
    t = tt(0.22 if open_ else 0.05)
    x = sum(signal.square(2 * np.pi * f * t) for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0))
    return filt(filt(x, 'bandpass', [7000, 12000]), 'highpass', 6500) * np.exp(-t * (16 if open_ else 90)) * g * 0.35

def bass(m, d=0.2, g=1.0):
    t = tt(d); f = midi(m)
    x = np.sin(2 * np.pi * f * t) + 0.28 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t)
    env = np.minimum(t / 0.004, 1) * np.exp(-t * (3.2 if d > 0.4 else 8)) * np.clip((d - t) / 0.015, 0, 1)
    return np.tanh(x * env * 1.3) * g

def mallet(m, g=1.0, d=0.9, bright=1.0):  # 2-op FM, ratio 4, fast index decay: clean glassy marimba
    t = tt(d); f = midi(m)
    idx = 2.2 * bright * np.exp(-t * 28)
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 4 * f * t))
    x += 0.18 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 12)
    return x * np.minimum(t / 0.0015, 1) * np.exp(-t * 5.5) * g

def crash(g=1.0, d=1.8):
    t = tt(d); n = filt(noise(len(t)), 'highpass', 4500)
    return n * np.exp(-t * 2.4) * np.minimum(t / 0.002, 1) * g

def riser(d, g=1.0):
    t = tt(d); u = t / d; n = noise(len(t)); y = np.zeros_like(n); z = 0.0
    a = 1 - np.exp(-2 * np.pi * (300 + 7000 * u ** 2.4) / SR)
    for i in range(len(n)): z += a[i] * (n[i] - z); y[i] = z
    return filt(y, 'highpass', 200) * u ** 2.6 * g

def room(x, secs=0.7, seed=5, mix=1.0):
    t = tt(secs); out = []
    for ch in range(2):
        ir = filt((mulberry32(seed + ch, len(t)) * 2 - 1) * np.exp(-t * 7 / secs), 'lowpass', 6000)
        ir /= np.sqrt((ir ** 2).sum()); out.append(signal.fftconvolve(x[:, ch], ir)[:N])
    return np.stack(out, 1) * mix

def delay(x, secs, fb=0.3, mix=0.3):
    d = int(secs * SR); y = x.copy()
    for k in range(1, 5):
        if d * k < N: y[d * k:] += x[:-d * k] * (fb ** k) * mix * (1 if k % 2 else 0.8)
    return y


# ---------- harmony ----------
PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def chord(sym):
    m = re.match(r'^([A-G])([#b]?)(m(?!aj))?(.*)$', sym)
    if not m: raise ValueError(f'bad chord "{sym}"')
    pc = (PC[m[1]] + {'#': 1, 'b': -1, '': 0}[m[2]]) % 12
    minor, ext = bool(m[3]), m[4]
    iv = [0, 3 if minor else 4, 7, 10 if minor else 12]
    if 'maj7' in ext: iv[3] = 11
    elif '7' in ext: iv[3] = 10
    if 'sus2' in ext: iv[1] = 2
    if 'sus4' in ext: iv[1] = 5
    if 'add9' in ext: iv[3] = 14
    base = 64 + ((pc - 64) % 12)             # voicing root in 64..75
    return 40 + ((pc - 4) % 12), [base + i for i in iv]    # (bass root 40..51, 4 chord tones)
CHORDS = [chord(c) for c in MU.get('chords', ['Am', 'F', 'C', 'G'])]
MOTIF_STEPS = [0, 3, 6, 8, 10, 13]; MOTIF_IDX = [0, 2, 1, 3, 2, 1]

SECS = sorted([(beat_of(s['at']), s['kind']) for s in MU.get('sections', [{'at': 0, 'kind': 'full'}])])
def section(b):
    cur = SECS[0]
    for s in SECS:
        if s[0] <= b + 1e-9: cur = s
    nxt = next((s[0] for s in SECS if s[0] > cur[0]), NB)
    return cur[1], cur[0], nxt
ACCENTS = [beat_of(a) for a in MU.get('accents', [])]
for i, (s0, k) in enumerate(SECS):
    if k == 'gap': GAPS.append((s0, SECS[i + 1][0] if i + 1 < len(SECS) else NB))

kickb, drums, bassb, keys, fx = buf(), buf(), buf(), buf(), buf()
for b in range(NB):
    kind, s0, s1 = section(b)
    bar, pos = divmod(b, 4); root, voic = CHORDS[bar % len(CHORDS)]
    first = b == int(np.ceil(s0))
    if kind == 'gap': continue
    groove = 'full' if kind == 'drop' else kind
    # kick
    if groove in ('intro', 'full', 'build') or (groove in ('dark', 'outro') and pos in (0, 2)):
        big = first and kind in ('drop', 'outro') or b in ACCENTS
        add(kickb, kick(1.25 if big else (0.8 if groove == 'dark' else 1.0), big=big), T(b))
    # backbeat
    if pos in (1, 3):
        if groove == 'intro': add(drums, rim(0.55), T(b), pan=0.08)
        elif groove in ('full', 'build'): add(drums, clap(0.5), T(b), pan=0.08)
    if groove == 'dark' and not first: add(drums, rim(0.35), T(b + 0.75), pan=-0.3)
    # hats
    steps = (0.25, 0.5, 0.75) if groove in ('full', 'build') else (0.5,)
    for s in steps:
        g = (0.55 if s == 0.5 else 0.28) * (0.55 if groove in ('dark', 'outro') else 1)
        add(drums, hat(g), T(b + s), pan=0.25 if s == 0.5 else -0.2)
    if pos == 3 and groove == 'full': add(drums, hat(0.3, True), T(b + 0.5), pan=0.3)
    # bass
    if pos == 0: add(bassb, bass(root, 0.45, 0.7), T(b))
    if groove in ('full', 'build'): add(bassb, bass(root + (12 if pos == 2 else 0), 0.18, 0.55), T(b + 0.5))
    if groove == 'dark': add(bassb, bass(root - 12, 0.42, 0.6), T(b + 0.5))
    # mallet motif (bar level) for intro / full
    if pos == 0 and groove in ('intro', 'full'):
        for st, ix in zip(MOTIF_STEPS, MOTIF_IDX):
            if b + st / 4 >= s1: break
            add(keys, mallet(voic[ix], 0.34 if groove == 'full' else 0.3, bright=1.2 if groove == 'full' else 1.0), T(b + st / 4), pan=(ix - 1.5) * 0.25)
    # build: repeated high root climbing, clap roll accelerating in the last bar
    if groove == 'build' and pos in (0, 2):
        dense = s1 - b <= 4
        for k in range(4 if dense else 2):
            add(keys, mallet(voic[0] + 12 + int(b - s0), 0.16 + 0.03 * k, 0.3, 1.4), T(b + k * (0.25 if dense else 0.5)))
    if groove == 'build' and s1 - b <= 2:
        for i in range(4): add(drums, clap(0.16 + 0.06 * (i + 4 * (b + 2 - s1))), T(b + i * 0.25), pan=-0.05)
    # section starts
    if first and kind == 'build':
        add(fx, riser(max(0.5, T(s1 - s0) - 0.075), 0.4), T(s0))     # clears 75 ms before the next section
    if first and kind in ('drop', 'outro') or b in ACCENTS:
        add(fx, crash(0.28 if kind == 'drop' or b in ACCENTS else 0.16), T(b))
        add(bassb, bass(root - 12, 1.6, 0.85), T(b))
        ring = 2.0 if kind == 'drop' else max(1.2, DUR - T(b))
        for k, m in enumerate(voic + [voic[0] + 12]):
            add(keys, mallet(m, 0.3, ring, 1.1), T(b) + k * 0.02, pan=(k - 2) * 0.2)

for g0, _ in GAPS:   # stop-time hit on the first instant of each gap, then silence
    add(kickb, kick(1.0), T(g0), force=True); add(drums, clap(0.7), T(g0), force=True); add(drums, rim(0.5), T(g0), force=True)

# ---------- mix ----------
keys = delay(keys, BEAT * 0.75, 0.32, 0.35)
duck = np.ones(N)
kick_env = np.abs(kickb[:, 0]); L_ = int(BEAT * SR)
for b in range(NB):   # bass ducks under every kick that was placed
    i = int(T(b) * SR)
    if i < N and kick_env[i:i + int(0.02 * SR)].max() > 0.05:
        e = 1 - 0.45 * np.exp(-np.arange(L_) / (0.07 * SR)); seg = duck[i:i + L_]; seg[:] = np.minimum(seg, e[:len(seg)])
bassb *= (0.3 + 0.7 * duck)[:, None]
wet = room(keys + drums * 0.6, 0.8, 11, 0.22)
mix = kickb * 0.95 + drums * 0.8 + bassb * 0.85 + keys * 0.8 + fx * 0.7 + wet
mix = filt(mix, 'highpass', 28)
fade = int(0.3 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
peak = np.abs(mix).max(); mix /= peak / 10 ** (-1 / 20)
stem = kickb * 0.95 + drums * 0.8; stem /= peak / 10 ** (-1 / 20)
os.makedirs('audio', exist_ok=True)
sf.write('audio/music.wav', mix.astype(np.float32), SR, subtype='FLOAT')
sf.write('audio/drums.wav', stem.astype(np.float32), SR, subtype='FLOAT')
print(f'audio/music.wav + audio/drums.wav  {DUR}s  {BPM:g} bpm  {NB} beats  sections: ' + ', '.join(f'b{s:g} {k}' for s, k in SECS))

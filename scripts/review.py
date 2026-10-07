# Critique kit, built from the RENDERED MP4s (never from the page). Run from the project root.
#   python3 scripts/review.py <round> [--draft]      (--draft reads renders/draft_<fmt>.mp4)
# Writes review/r<round>/:
#   contact.jpg        primary format, 2 fps, 6 across, timestamps
#   strip_fast.jpg     12 consecutive frames around the fastest action;  strip_fast2.jpg  the 2nd, a different moment
#   strip_cut<k>.jpg   6 frames through every hard cut (review/cuts.json from render.mjs), up to 8 cuts
#   phone_<fmt>.jpg    1 fps at 360 px wide, every rendered format (what a phone feed shows)
#   safe_9x16.jpg      9:16 at 1 fps with the Reels/TikTok UI zones shaded (top 14 %, bottom 20 %, right 12 %)
#   loop_seam.jpg      last 6 + first 6 frames of the video played twice
#   audio.jpg          spectrogram + waveform of the mix with cue lines (red) and voice spans (blue): the critic cannot hear
#   metrics.json       motion peaks, longest static run, max gap between visual events, near-blank frames, single-frame pops,
#                      flashes (WCAG 2.3.1), encode spec, per-cue sync (audio onset vs cue, visual onset vs audio), loudness,
#                      and "gates": FAIL / WARN / NOT CHECKED lines. Exit 1 on any FAIL.
# A check that checked nothing is reported as NOT CHECKED, never as clean.
import sys, os, json, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

R = next((a for a in sys.argv[1:] if not a.startswith('--')), '1')
DRAFT = '--draft' in sys.argv
OUT = f'review/r{R}'; os.makedirs(OUT, exist_ok=True)
TL = json.load(open('timeline.json'))
V = {f: f"renders/{'draft_' if DRAFT else ''}{f}.mp4" for f in TL['formats'] if os.path.exists(f"renders/{'draft_' if DRAFT else ''}{f}.mp4")}
if not V: raise SystemExit('no renders found: node scripts/render.mjs --draft --all  (or a final render)')
P = TL['formats'][0] if TL['formats'][0] in V else next(iter(V))
try: FONT = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 15)
except Exception: FONT = ImageFont.load_default()


def probe(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', p], capture_output=True, text=True)
    j = json.loads(r.stdout); s = j['streams'][0]; n, d = map(int, s['r_frame_rate'].split('/'))
    return s['width'], s['height'], n / d, float(j['format']['duration'])
def frames(path, w, h, fps=None, gray=False):
    vf = (f'fps={fps},' if fps else '') + f'scale={w}:{h}:flags=area'
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'gray' if gray else 'rgb24', '-'], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.uint8)
    return a.reshape(-1, h, w) if gray else a.reshape(-1, h, w, 3)
def frames_at(path, idx, w, h):
    sel = '+'.join(f'eq(n\\,{i})' for i in idx)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f"select='{sel}',scale={w}:{h}:flags=area", '-vsync', '0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)
def tile(ims, cols, labels, out, pad=6, lab=22, bg=(20, 20, 20)):
    w, h = ims[0].size; rows = (len(ims) + cols - 1) // cols
    S = Image.new('RGB', (cols * (w + pad) + pad, rows * (h + lab + pad) + pad), bg); d = ImageDraw.Draw(S)
    for i, (im, l) in enumerate(zip(ims, labels)):
        x = pad + (i % cols) * (w + pad); y = pad + (i // cols) * (h + lab + pad)
        S.paste(im, (x, y + lab)); d.text((x + 2, y + 3), l, fill=(235, 235, 235), font=FONT)
    S.save(out, quality=88); return out


W0, H0, FPS, DUR = probe(V[P])
tw, th = (480, int(480 * H0 / W0) // 2 * 2) if W0 >= H0 else (270, int(270 * H0 / W0) // 2 * 2)
M = {'round': R, 'source': V[P], 'fps': round(FPS, 3), 'duration': round(DUR, 3)}
GATES = []   # (level, check, message): FAIL blocks the round, WARN goes to the critic, NOT CHECKED is never "clean"
def gate(level, check, msg): GATES.append({'level': level, 'check': check, 'msg': msg})
CUTS = json.load(open('review/cuts.json')).get(P, []) if os.path.exists('review/cuts.json') else None


# 0. encode spec, every format: size, fps, frame count, pixel format, colour tags, fast start, audio, clean decode
SIZES = {'16x9': (1920, 1080), '1x1': (1080, 1080), '4x5': (1080, 1350), '9x16': (1080, 1920)}
def moov_first(path):
    with open(path, 'rb') as f:
        while True:
            h = f.read(8)
            if len(h) < 8: return None
            size, kind = int.from_bytes(h[:4], 'big'), h[4:8]
            if kind in (b'moov', b'mdat'): return kind == b'moov'
            if size == 1: size = int.from_bytes(f.read(8), 'big') - 8
            elif size == 0: return None
            f.seek(size - 8, 1)
M['spec'] = {}
for f, p in V.items():
    r = subprocess.run(['ffprobe', '-v', 'error', '-count_packets', '-show_entries', 'stream=codec_type,width,height,r_frame_rate,nb_read_packets,pix_fmt,'
                        'color_primaries,color_transfer,color_space,sample_rate,channels', '-of', 'json', p], capture_output=True, text=True)
    st = json.loads(r.stdout)['streams']; v = next(s for s in st if s['codec_type'] == 'video'); au = next((s for s in st if s['codec_type'] == 'audio'), None)
    n, d = map(int, v['r_frame_rate'].split('/')); fps = n / d
    want_fps = 30 if DRAFT else TL.get('fps', 60); want_n = round(float(TL['duration']) * want_fps)
    sp = {'size': f"{v['width']}x{v['height']}", 'fps': round(fps, 3), 'frames': int(v['nb_read_packets']), 'frames_expected': want_n,
          'pix_fmt': v.get('pix_fmt'), 'color': [v.get('color_primaries'), v.get('color_transfer'), v.get('color_space')],
          'faststart': moov_first(p), 'audio': f"{au['sample_rate']} Hz × {au['channels']}" if au else None}
    M['spec'][f] = sp
    if f in SIZES and (v['width'], v['height']) != SIZES[f]: gate('FAIL', 'spec', f'{f}: size {sp["size"]}, expected {SIZES[f][0]}x{SIZES[f][1]}')
    if abs(fps - want_fps) > 0.01: gate('FAIL', 'spec', f'{f}: {fps:.3f} fps, expected {want_fps}')
    if abs(sp['frames'] - want_n) > 1: gate('FAIL', 'spec', f'{f}: {sp["frames"]} frames, expected {want_n} ±1 (chunks joined with a drift?)')
    if sp['pix_fmt'] != 'yuv420p': gate('FAIL', 'spec', f'{f}: pix_fmt {sp["pix_fmt"]}, expected yuv420p')
    if sp['color'] != ['bt709'] * 3: gate('WARN', 'spec', f'{f}: colour tags {sp["color"]}, expected bt709 ×3')
    if sp['faststart'] is not True: gate('WARN', 'spec', f'{f}: moov atom is not before mdat (no fast start)')
    if not au: gate('FAIL' if os.path.exists('audio/mix.wav') else 'NOT CHECKED', 'spec', f'{f}: no audio stream')
    elif (int(au['sample_rate']), int(au['channels'])) != (48000, 2): gate('WARN', 'spec', f'{f}: audio {sp["audio"]}, expected 48000 Hz × 2')
    dec = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-f', 'null', '-'], capture_output=True, text=True).stderr.strip()
    if dec: gate('FAIL', 'spec', f'{f}: decode errors: {dec[:200]}')

# 1. contact sheet, 2 fps
fr = frames(V[P], tw, th, fps=2)
tile([Image.fromarray(f) for f in fr], 6 if W0 >= H0 else 10, [f'{i / 2:.1f}s' for i in range(len(fr))], f'{OUT}/contact.jpg')

# 2. motion energy per frame → fastest-action strips, peaks, static runs, gaps between events, blank frames
g = frames(V[P], 320, int(320 * H0 / W0) // 2 * 2, gray=True).astype(np.float32)
energy = np.abs(np.diff(g, axis=0)).mean(axis=(1, 2))
win = np.convolve(energy, np.ones(12), 'valid')
order = np.argsort(win)[::-1]; peaks = []
for i in order:
    if all(abs(int(i) - p) > int(0.5 * FPS) for p in peaks): peaks.append(int(i))
    if len(peaks) == 5: break
NF = len(g)
for k, c in enumerate(peaks[:2]):
    s = max(0, min(NF - 12, c)); idx = list(range(s, s + 12))
    st = frames_at(V[P], idx, 640, int(640 * H0 / W0) // 2 * 2)
    tile([Image.fromarray(x) for x in st], 6, [f'f{i}  {i / FPS:.3f}s' for i in idx], f'{OUT}/strip_fast{"" if k == 0 else 2}.jpg')
M['motion_peaks_s'] = [round(p / FPS, 2) for p in peaks]
still = energy < 0.35; run = best = bi = 0
for i, s in enumerate(still):
    run = run + 1 if s else 0
    if run > best: best, bi = run, i
M['longest_static'] = {'seconds': round(best / FPS, 2), 'from_s': round((bi - best + 1) / FPS, 2)}
ev = np.where((energy > max(1.0, 2.5 * np.median(energy))) & (np.r_[0, energy[:-1]] <= energy) & (np.r_[energy[1:], 0] <= energy))[0]
ev_t = np.r_[0.0, ev / FPS, DUR]; gaps = np.diff(ev_t); gi = int(np.argmax(gaps))
M['max_gap_between_visual_events'] = {'seconds': round(float(gaps[gi]), 2), 'from_s': round(float(ev_t[gi]), 2), 'rule': 'something new every 2–4 s'}
lum = frames(V[P], 160, int(160 * H0 / W0) // 2 * 2, gray=True).astype(np.float32).reshape(len(g), -1)
blank = np.where(lum.std(1) < 4)[0]
runs = []
for i in blank:
    if runs and i == runs[-1][1] + 1: runs[-1][1] = int(i)
    else: runs.append([int(i), int(i)])
M['near_blank_frames'] = [{'from_s': round(a / FPS, 3), 'frames': b - a + 1, 'mean_luma': int(lum[a].mean())} for a, b in runs]
if NF < 0.95 * round(DUR * FPS): gate('FAIL', 'motion', f'decoded {NF} frames of {round(DUR * FPS)}: the motion metrics saw part of the film only')

# single-frame pops: a frame that changes far more than both neighbours (a flash of the wrong layer, a one-frame jump).
# Planned hard cuts (review/cuts.json) are skipped; slow zooms can give weak false positives near the 1.0 floor.
near_cut = lambda i: CUTS is not None and any(abs(i + 1 - c * FPS) <= 1.5 for c in CUTS)
pops = [i for i in range(1, len(energy) - 1) if energy[i] > 1.0 and energy[i] > 3 * max(energy[i - 1], energy[i + 1]) and not near_cut(i)]
M['pops'] = [{'t': round((i + 1) / FPS, 3), 'jump': round(float(energy[i]), 1)} for i in pops]
if CUTS is None: gate('NOT CHECKED', 'pops', 'review/cuts.json missing (render.mjs writes it on --draft/final): planned cuts are not excluded, pops near cuts may be cuts')
for p_ in M['pops'][:12]: gate('WARN', 'pops', f"single-frame jump at {p_['t']}s (Δ {p_['jump']}): look at --at {p_['t'] - 1 / FPS:.3f},{p_['t']:.3f}")

# flashes (WCAG 2.3.1, simplified): relative luminance of the whole frame and of each quadrant; a flash is a pair of opposing
# changes ≥ 0.10 where the darker state is < 0.80; more than 3 flashes in any 1 s window fails.
L2 = frames(V[P], 160, int(160 * H0 / W0) // 2 * 2, gray=True).astype(np.float32) / 255.0
L2 = L2 ** 2.2; hh, ww = L2.shape[1] // 2, L2.shape[2] // 2
series = {'frame': L2.mean(axis=(1, 2)), 'q1': L2[:, :hh, :ww].mean(axis=(1, 2)), 'q2': L2[:, :hh, ww:].mean(axis=(1, 2)),
          'q3': L2[:, hh:, :ww].mean(axis=(1, 2)), 'q4': L2[:, hh:, ww:].mean(axis=(1, 2))}
def transitions(x, dead=0.01):
    ext, cur, i_cur, dirn = [(0, x[0])], x[0], 0, 0          # turning points of the luminance curve
    for i in range(1, len(x)):
        if dirn >= 0 and x[i] >= cur or dirn <= 0 and x[i] <= cur:
            if dirn == 0 and abs(x[i] - cur) > dead: dirn = 1 if x[i] > cur else -1
            if dirn: cur, i_cur = x[i], i
        elif abs(x[i] - cur) > dead:
            ext.append((i_cur, cur)); dirn = -dirn; cur, i_cur = x[i], i
    ext.append((i_cur, cur))
    return [j for (_, a_), (j, b_) in zip(ext, ext[1:]) if abs(b_ - a_) >= 0.10 and min(a_, b_) < 0.80]
worst = {'per_s': 0.0, 'at_s': None, 'where': None}
for k, x in series.items():
    tr = np.array(transitions(x))
    for i in tr:
        n_ = int(((tr >= i) & (tr < i + FPS)).sum()) / 2
        if n_ > worst['per_s']: worst = {'per_s': n_, 'at_s': round(i / FPS, 2), 'where': k}
M['flashes'] = {**worst, 'limit_per_s': 3}
if worst['per_s'] > 3: gate('FAIL', 'flash', f"{worst['per_s']:.1f} flashes/s at {worst['at_s']}s ({worst['where']}): photosensitivity limit is 3")
elif worst['per_s'] >= 2: gate('WARN', 'flash', f"{worst['per_s']:.1f} flashes/s at {worst['at_s']}s ({worst['where']})")

# hard cuts: 6 frames through each (3 before, 3 after), what the eye checks for a jump at the seam
if CUTS:
    for k, c in enumerate([c for c in CUTS if 0 < c < DUR][:8]):
        i0 = max(0, min(NF - 6, int(round(c * FPS)) - 3)); idx = list(range(i0, i0 + 6))
        st = frames_at(V[P], idx, 480, int(480 * H0 / W0) // 2 * 2)
        tile([Image.fromarray(x) for x in st], 6, [f'f{i} {i / FPS:.3f}s' + (' |CUT' if i == int(round(c * FPS)) else '') for i in idx], f'{OUT}/strip_cut{k + 1}.jpg')

# 3. phone test: 1 fps at 360 px wide, every format; 9x16 safe zones
for f, p in V.items():
    w, h, _, _ = probe(p); ph = int(360 * h / w) // 2 * 2
    fr = frames(p, 360, ph, fps=1)
    tile([Image.fromarray(x) for x in fr], 5 if w >= h else 8, [f'{i}s' for i in range(len(fr))], f'{OUT}/phone_{f}.jpg')
    if f == '9x16':
        ims = []
        for x in fr:
            im = Image.fromarray(x).convert('RGBA'); o = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(o)
            d.rectangle([0, 0, 360, int(ph * 0.14)], fill=(255, 0, 80, 70)); d.rectangle([0, int(ph * 0.80), 360, ph], fill=(255, 0, 80, 70))
            d.rectangle([int(360 * 0.88), int(ph * 0.14), 360, int(ph * 0.80)], fill=(255, 0, 80, 70))
            ims.append(Image.alpha_composite(im, o).convert('RGB'))
        tile(ims, 8, [f'{i}s' for i in range(len(ims))], f'{OUT}/safe_9x16.jpg')

# 4. loop seam: last 6 + first 6 frames when the video repeats
tail = frames_at(V[P], list(range(NF - 6, NF)), 480, int(480 * H0 / W0) // 2 * 2)
head = frames_at(V[P], list(range(6)), 480, int(480 * H0 / W0) // 2 * 2)
tile([Image.fromarray(x) for x in list(tail) + list(head)], 6, [f'A f{NF - 6 + i}' for i in range(6)] + [f'B f{i}' for i in range(6)], f'{OUT}/loop_seam.jpg')
M['loop_seam_jump'] = {'value': round(float(np.abs(head[0].astype(float) - tail[-1].astype(float)).mean()), 1), 'note': 'typical hard cut 40–80; < 10 reads as continuous'}

# 5. sound sync. Audio onset: high-passed at 150 Hz (sub-bass makes false onsets), 2.5 ms blocks, rise in dB over the loudest
# of the 4 blocks before; per video frame the largest rise. audio_vs_cue = audio onset minus the cue time (> 1 frame = the mix
# or the hit is masked). The MP4 audio is cross-correlated with audio/mix.wav: off by more than a frame = FAIL. visual_minus_audio = first frame reaching 50 % of the local motion peak minus the audio onset;
# it measures where motion STARTS, so landings read late by design: confirm hits on strips, this number is only a pointer.
if not os.path.exists('cues.json'): gate('NOT CHECKED', 'sync', 'no cues.json (node scripts/sync.mjs)')
else:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', V[P], '-ac', '1', '-ar', '48000', '-af', 'highpass=f=150:poles=2', '-f', 'f32le', '-'], capture_output=True).stdout
    a = np.frombuffer(raw, np.float32)
    cues = [c for c in json.load(open('cues.json'))['cues'] if c['t'] < DUR - 0.05]
    if not len(a): gate('NOT CHECKED', 'sync', f'{V[P]} has no audio')
    elif not cues: gate('NOT CHECKED', 'sync', 'cues.json has no cues')
    else:
        blk = 120; nb = len(a) // blk
        db = 20 * np.log10(np.sqrt((a[:nb * blk].reshape(nb, blk) ** 2).mean(1)) + 1e-6)
        prev = np.max(np.stack([np.r_[np.full(k, -120.0), db[:-k]] for k in range(1, 5)]), axis=0)
        rise = np.maximum(0, db - prev)
        per = 48000 / FPS / blk
        aflux = np.array([rise[int(i * per):max(int(i * per) + 1, int((i + 1) * per))].max(initial=0) for i in range(int(nb / per))])
        def near_peak(sig, t, w=0.12):
            c = int(round(t * FPS)); lo = max(0, c - int(w * FPS)); hi = max(lo + 1, min(len(sig), c + int(w * FPS)))
            return (lo + int(np.argmax(sig[lo:hi]))) / FPS - t
        def near_onset(sig, t, w=0.12):
            c = int(round(t * FPS)); lo = max(0, c - int(w * FPS)); hi = max(lo + 1, min(len(sig), c + int(w * FPS)))
            seg = sig[lo:hi]; return (lo + int(np.argmax(seg >= 0.5 * seg.max())) + 1) / FPS - t
        rows = []
        for c in cues:
            au = near_peak(aflux, c['t']); va = near_onset(energy, c['t'])
            rows.append({'t': c['t'], 'type': c['type'], 'what': c['what'], 'audio_vs_cue_ms': round(au * 1000), 'visual_minus_audio_ms': round((va - au) * 1000)})
        hits = [r for r in rows if r['type'] not in ('whoosh', 'riser', 'tick')]
        absd = [abs(r['visual_minus_audio_ms']) for r in hits]
        masked = [r for r in hits if abs(r['audio_vs_cue_ms']) > 1000 / FPS + 1]
        M['sync'] = {'cues': rows, 'checked': f'{len(hits)} hits of {len(rows)} cues', 'hits_within_45ms': f'{sum(v <= 45 for v in absd)}/{len(absd)}',
                     'hits_mean_abs_ms': round(float(np.mean(absd)), 1) if absd else None, 'hits_not_sharpest': len(masked),
                     'note': 'audio_vs_cue: the sharpest onset in the mix within ±120 ms of the cue. More than a frame off = the hit is not '
                             'what the ear catches there (voice syllable or drum on top, or a hit without a high-frequency transient). '
                             'visual_minus_audio measures motion START (positive = picture late): a pointer, confirm on strips.'}
        if masked: gate('WARN', 'sync', f'{len(masked)}/{len(hits)} hits are not the sharpest sound at their cue (masked by voice/music, or no HF click): '
                        + ', '.join(f"{r['t']}s" for r in masked[:8]) + ' · audio.jpg shows them')
    # mux check: the audio in the MP4 must be audio/mix.wav to the sample frame (cross-correlation of the first 20 s)
    if len(a) and os.path.exists('audio/mix.wav'):
        def pcm(src):
            r_ = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-t', '20', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], capture_output=True).stdout
            return np.frombuffer(r_, np.float32)
        x, y = pcm(V[P]), pcm('audio/mix.wav'); n_ = min(len(x), len(y))
        if n_ > 8000:
            x, y = x[:n_] - x[:n_].mean(), y[:n_] - y[:n_].mean(); L_ = 1 << int(np.ceil(np.log2(2 * n_)))
            cc = np.fft.irfft(np.fft.rfft(x, L_) * np.conj(np.fft.rfft(y, L_)), L_)
            lags = np.r_[cc[:1600], cc[-1600:]]; k_ = int(np.argmax(lags)); lag = (k_ if k_ < 1600 else k_ - 3200) / 8000
            M['mux_offset_ms'] = round(lag * 1000, 1)
            if abs(lag) > 1 / FPS: gate('FAIL', 'mux', f'audio in {V[P]} is {lag * 1000:+.0f} ms off audio/mix.wav: re-mux (render.mjs --mux)')
    elif not os.path.exists('audio/mix.wav'): gate('NOT CHECKED', 'mux', 'no audio/mix.wav to compare the MP4 audio with')

# 6. a picture of the sound for the critic, who cannot hear: spectrogram + waveform, cue lines (red), voice spans (blue)
spec_ok = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', V[P], '-lavfi', 'showspectrumpic=s=1600x360:legend=0:scale=log:fscale=log', f'{OUT}/_spec.png']).returncode == 0
wave_ok = spec_ok and subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', V[P], '-lavfi', 'aformat=channel_layouts=mono,showwavespic=s=1600x140:colors=0x8a8a8a', f'{OUT}/_wave.png']).returncode == 0
if wave_ok:
    sp, wv = Image.open(f'{OUT}/_spec.png').convert('RGB'), Image.open(f'{OUT}/_wave.png').convert('RGB')
    S_ = Image.new('RGB', (1600, sp.height + wv.height + 46), (20, 20, 20)); S_.paste(sp, (0, 0)); S_.paste(wv, (0, sp.height + 24)); d = ImageDraw.Draw(S_)
    X = lambda t: int(t / DUR * 1599)
    if os.path.exists('audio/vo_placed.json'):
        for ph in json.load(open('audio/vo_placed.json')): d.rectangle([X(ph['t0']), sp.height + 4, X(ph['t1']), sp.height + 18], fill=(70, 120, 230))
    if os.path.exists('cues.json'):
        for c in json.load(open('cues.json'))['cues']:
            if c['type'] not in ('tick',): d.line([X(c['t']), 0, X(c['t']), S_.height - 22], fill=(230, 60, 60), width=1)
    for s_ in range(0, int(DUR) + 1, 5): d.text((X(s_) + 2, S_.height - 18), f'{s_}s', fill=(220, 220, 220), font=FONT)
    S_.save(f'{OUT}/audio.jpg', quality=88)
    for t_ in ('_spec.png', '_wave.png'): os.remove(f'{OUT}/{t_}')
else: gate('NOT CHECKED', 'audio', 'no audio picture (no audio stream?)')

lo = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', V[P], '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
summ = lo[lo.rfind('Summary'):]
M['loudness'] = {l.split(':')[0].strip(): l.split(':')[1].strip() for l in summ.splitlines() if l.strip().startswith(('I:', 'Peak:'))} or 'no audio'
if M['loudness'] == 'no audio': gate('NOT CHECKED', 'loudness', 'no audio')
else:
    I_ = float(M['loudness']['I'].split()[0]); TP_ = float(M['loudness']['Peak'].split()[0])
    if abs(I_ + 14) > 0.5 or TP_ > -1: gate('FAIL', 'loudness', f'{I_} LUFS / {TP_} dBTP: target -14 ±0.5 LUFS, ≤ -1 dBTP (after AAC; remix with mix.py)')

M['gates'] = GATES
json.dump(M, open(f'{OUT}/metrics.json', 'w'), indent=1, ensure_ascii=False)
print(json.dumps({k: v for k, v in M.items() if k not in ('sync', 'gates', 'spec')}, indent=1, ensure_ascii=False))
if 'sync' in M: print('sync:', M['sync']['checked'], '·', M['sync']['hits_within_45ms'], 'visual within 45 ms, mean', M['sync']['hits_mean_abs_ms'], 'ms ·', M['sync']['hits_not_sharpest'], 'hits not the sharpest sound at their cue · mux offset', M.get('mux_offset_ms'), 'ms')
print(f'wrote {OUT}/: ' + ' '.join(sorted(os.listdir(OUT))))
for g_ in GATES: print(f"{g_['level']:12s} {g_['check']:9s} {g_['msg']}")
fails = sum(g_['level'] == 'FAIL' for g_ in GATES)
print(f"gates: {fails} FAIL, {sum(g_['level'] == 'WARN' for g_ in GATES)} WARN, {sum(g_['level'] == 'NOT CHECKED' for g_ in GATES)} NOT CHECKED"
      f" · checked {NF} frames, {len(V)} format(s)")
sys.exit(1 if fails else 0)

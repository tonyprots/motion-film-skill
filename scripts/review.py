# Critique kit, built from the RENDERED MP4s (never from the page). Run from the project root.
#   python3 scripts/review.py <round> [--draft]      (--draft reads renders/draft_<fmt>.mp4)
# Writes review/r<round>/:
#   contact.jpg        primary format, 2 fps, 6 across, timestamps
#   strip_fast.jpg     12 consecutive frames around the fastest action;  strip_fast2.jpg  the 2nd, a different moment
#   phone_<fmt>.jpg    1 fps at 360 px wide, every rendered format (what a phone feed shows)
#   safe_9x16.jpg      9:16 at 1 fps with the Reels/TikTok UI zones shaded (top 14 %, bottom 20 %, right 12 %)
#   loop_seam.jpg      last 6 + first 6 frames of the video played twice
#   metrics.json       motion peaks, longest static run, max gap between visual events, near-blank frames,
#                      per-cue sync (visual onset minus audio onset), loudness
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

# 5. sound sync: for every cue, visual onset (first frame reaching 50 % of the local motion peak) minus audio onset
if os.path.exists('cues.json'):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', V[P], '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], capture_output=True).stdout
    a = np.frombuffer(raw, np.float32)
    if len(a):
        hop = int(48000 / FPS)
        env = np.array([np.sqrt(np.mean(a[i:i + hop] ** 2)) for i in range(0, len(a) - hop, hop)])
        aflux = np.maximum(0, np.diff(np.log(env + 1e-4)))
        def near_peak(sig, t, w=0.12):
            c = int(round(t * FPS)); lo = max(0, c - int(w * FPS)); hi = max(lo + 1, min(len(sig), c + int(w * FPS)))
            return (lo + int(np.argmax(sig[lo:hi])) + 1) / FPS - t
        def near_onset(sig, t, w=0.12):
            c = int(round(t * FPS)); lo = max(0, c - int(w * FPS)); hi = max(lo + 1, min(len(sig), c + int(w * FPS)))
            seg = sig[lo:hi]; return (lo + int(np.argmax(seg >= 0.5 * seg.max())) + 1) / FPS - t
        cues = json.load(open('cues.json'))['cues']
        rows = []
        for c in cues:
            if c['t'] >= DUR - 0.05: continue
            va, au = near_onset(energy, c['t']), near_peak(aflux, c['t'])
            rows.append({'t': c['t'], 'type': c['type'], 'what': c['what'], 'visual_minus_audio_ms': round((va - au) * 1000)})
        absd = [abs(r['visual_minus_audio_ms']) for r in rows if r['type'] not in ('whoosh', 'riser', 'tick')]
        M['sync'] = {'cues': rows, 'hits_within_45ms': f'{sum(v <= 45 for v in absd)}/{len(absd)}', 'hits_mean_abs_ms': round(float(np.mean(absd)), 1) if absd else None,
                     'note': 'positive = picture late. whoosh/riser build INTO the cue by design; ticks are texture. Visual hits should read ON the audio (|x| <= 45 ms).'}
lo = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', V[P], '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
summ = lo[lo.rfind('Summary'):]
M['loudness'] = {l.split(':')[0].strip(): l.split(':')[1].strip() for l in summ.splitlines() if l.strip().startswith(('I:', 'Peak:'))} or 'no audio'

json.dump(M, open(f'{OUT}/metrics.json', 'w'), indent=1)
print(json.dumps({k: v for k, v in M.items() if k != 'sync'}, indent=1))
if 'sync' in M: print('sync:', M['sync']['hits_within_45ms'], 'hits within 45 ms, mean', M['sync']['hits_mean_abs_ms'], 'ms')
print(f'wrote {OUT}/: ' + ' '.join(sorted(os.listdir(OUT))))

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
#                      "slideshow": is it a slide deck with transitions? fast-motion share, blank mid-film frames,
#                      blue-violet share, push-ins per minute, slow-zoom share, worst 30 s window (every format).
#   python3 scripts/review.py --slideshow <a.mp4> [b.mp4 …] [--cuts review/cuts.json:16x9]   the slideshow metrics alone,
#                      on any MP4 (calibration, someone else's film); prints the numbers and the gates, exit 1 on FAIL.
# A check that checked nothing is reported as NOT CHECKED, never as clean.
import sys, os, json, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

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
    # -fps_mode, not -vsync (removed in ffmpeg 9); batches of 40: ffmpeg 8+ cannot parse a select of ~100+ terms
    def grab(part):
        sel = '+'.join(f'eq(n\\,{i})' for i in part)
        return subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f"select='{sel}',scale={w}:{h}:flags=area", '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    raw = b''.join(grab(idx[k:k + 40]) for k in range(0, len(idx), 40))
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)
def tile(ims, cols, labels, out, pad=6, lab=22, bg=(20, 20, 20)):
    w, h = ims[0].size; rows = (len(ims) + cols - 1) // cols
    S = Image.new('RGB', (cols * (w + pad) + pad, rows * (h + lab + pad) + pad), bg); d = ImageDraw.Draw(S)
    for i, (im, l) in enumerate(zip(ims, labels)):
        x = pad + (i % cols) * (w + pad); y = pad + (i // cols) * (h + lab + pad)
        S.paste(im, (x, y + lab)); d.text((x + 2, y + 3), l, fill=(235, 235, 235), font=FONT)
    S.save(out, quality=88); return out


# ---- "is it a slideshow?" — measured on the finished MP4, numpy + ffmpeg only (idea: huashu-design film_gate.py, MIT;
# own code, own thresholds). 12 fps, 320 px wide grey, the caption band masked; cuts and dissolves are not motion.
SL_FPS, SL_W = 12, 320
SL_FAST = 9.0             # mean |Δ| of a frame pair (0–255) that counts as fast motion
SL_BLANK_GRAD, SL_BLANK_FRAC, SL_BLANK_S = 24.0, 0.002, 0.3   # blank = < 0.2 % of pixels with a Sobel edge > 24, ≥ 0.3 s
SL_PUSH_STEP, SL_PUSH_MIN = 0.004, 0.03   # push-in: zoom-in > 0.4 % per 1/12 s, ≥ 3 % in total
# WARN thresholds, calibrated 2026-10-14 on five films a user accepted (A–E) and on PPT stand-ins (static cards, a cut every 3 s;
# "+kb" = each card slow-zooms 8 %, "+push" = a 12 % push on every card). Accepted, 16:9 / 9:16:
#   A .028/.031 fast · B .034/.038 · C .033 · D .016/.021 · readme-demo .064/.051
#   (huashu's red line 0.035 would flag 5 of these 9 renders: our films hold still and move in bursts, measured at 60 fps with blur)
#   lowest-motion 30 s window, mean |Δ|: A 1.15/1.15 · B–C .93–1.13 · D .26/.27 · readme-demo 1.82/1.79 (16.5 s window)
#   push-ins per minute 0–0.8; slow-zoom share 0; blue-violet share 0; blank mid-film run: none in any of them.
#   PPT stand-ins: fast 0 (all three) · worst-window motion 0 / .85 / .71 · push/min 0 / 0 / 20.1 · slow zoom 0 / 1.0 / 0 ·
#   blue-violet .27–.33 (two of six cards are navy-violet) · the grey second → blank 0.84 s.
# fast_ratio < 0.010 (accepted min 0.016) · worst window motion < 0.15 (accepted min 0.26) · push ≥ 8/min (accepted max 0.8,
# huashu's line kept; needs ≥ 3 pushes: the 16 s smoke film has 2 = 7.5/min) · slow zoom ≥ 0.5 (accepted 0, Ken Burns
# deck 1.0) · blue-violet ≥ 0.12 (huashu's line; accepted 0).
SL_WARN = {'fast_ratio': 0.010, 'worst_motion': 0.15, 'blue_violet': 0.12, 'push_per_min': 8.0, 'slow_zoom_share': 0.5}


def sobel_mag(a):   # a: (n, h, w) float32 → (n, h-2, w-2)
    gx = (a[:, :-2, 2:] + 2 * a[:, 1:-1, 2:] + a[:, 2:, 2:]) - (a[:, :-2, :-2] + 2 * a[:, 1:-1, :-2] + a[:, 2:, :-2])
    gy = (a[:, 2:, :-2] + 2 * a[:, 2:, 1:-1] + a[:, 2:, 2:]) - (a[:, :-2, :-2] + 2 * a[:, :-2, 1:-1] + a[:, :-2, 2:])
    return np.hypot(gx, gy)


def block_flow(a, b, prior=None, B=48, S=32):
    """Shift of textured blocks a → b by phase correlation. prior (k, tx, ty): the b block is read where that camera
    puts it, so the correlation only has to find the remainder. Returns block centres (y, x) and shifts (dy, dx)."""
    h, w = a.shape
    pos, off = [], []
    for y in range(0, h - B + 1, S):
        for x in range(0, w - B + 1, S):
            oy = ox = 0
            if prior is not None:
                k_, tx, ty = prior; oy, ox = int(round(k_ * (y + B / 2 - h / 2) + ty)), int(round(k_ * (x + B / 2 - w / 2) + tx))
            if 0 <= y + oy <= h - B and 0 <= x + ox <= w - B: pos.append((y, x)); off.append((oy, ox))
    if len(pos) < 8: return None
    A = np.stack([a[y:y + B, x:x + B] for y, x in pos]); Bb = np.stack([b[y + oy:y + oy + B, x + ox:x + ox + B] for (y, x), (oy, ox) in zip(pos, off)])
    tex = (A.std((1, 2)) > 6) & (Bb.std((1, 2)) > 6)
    if tex.sum() < 8: return None
    win = np.outer(np.hanning(B), np.hanning(B)).astype(np.float32)
    X = np.fft.fft2((Bb[tex] - Bb[tex].mean((1, 2), keepdims=True)) * win) * np.conj(np.fft.fft2((A[tex] - A[tex].mean((1, 2), keepdims=True)) * win))
    c = np.fft.ifft2(X / (np.abs(X) + 1e-6)).real
    n = len(c); flat = c.reshape(n, -1); k = flat.argmax(1); py, px = k // B, k % B; r = np.arange(n)
    def sub(p, up, dn):   # parabolic sub-pixel peak
        den = up + dn - 2 * flat[r, k]
        return p + np.where(np.abs(den) > 1e-9, 0.5 * (dn - up) / np.where(np.abs(den) > 1e-9, den, 1), 0.0)
    dy = sub(py, c[r, (py + 1) % B, px], c[r, (py - 1) % B, px]); dx = sub(px, c[r, py, (px + 1) % B], c[r, py, (px - 1) % B])
    dy = np.where(dy > B / 2, dy - B, dy); dx = np.where(dx > B / 2, dx - B, dx)
    o = np.array(off, np.float32)[tex]; ok = flat.max(1) > 0.15
    return (np.array(pos, np.float32)[tex] + B / 2)[ok], np.stack([dy + o[:, 0], dx + o[:, 1]], 1)[ok], int(tex.sum())


def fit_camera(h, w, flow, tol):
    """v = k·(p − centre) + t by least squares, one outlier pass. None when the blocks do not agree on one camera."""
    if flow is None: return None
    P_, D, ntex = flow; good = np.ones(len(P_), bool)
    for _ in range(3):
        if good.sum() < 6: return None
        M_ = np.zeros((2 * good.sum(), 3), np.float32)
        M_[0::2, 0] = P_[good, 1] - w / 2; M_[0::2, 1] = 1; M_[1::2, 0] = P_[good, 0] - h / 2; M_[1::2, 2] = 1
        v = np.empty(2 * good.sum(), np.float32); v[0::2] = D[good, 1]; v[1::2] = D[good, 0]
        sol = np.linalg.lstsq(M_, v, rcond=None)[0]
        res = np.hypot(*(M_ @ sol - v).reshape(-1, 2).T); idx = np.where(good)[0]
        if (res < tol).all(): break
        good = np.zeros_like(good); good[idx[res < tol]] = True
    return sol if good.sum() >= max(6, 0.5 * ntex) else None


def zoom_step(a, b):
    """Global zoom between two grey frames, log(1 + k) (> 0 = push in), or None (no single camera, or nothing textured).
    Coarse first (half size: fast moves stay inside the block), then full size from the coarse camera."""
    h, w = a.shape; h2, w2 = h // 2, w // 2
    half = lambda x: x[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2).mean((1, 3))
    c = fit_camera(h2, w2, block_flow(half(a), half(b), B=32, S=16), 1.0)
    prior = None if c is None else (c[0], 2 * c[1], 2 * c[2])
    sol = fit_camera(h, w, block_flow(a, b, prior), 0.75)
    return None if sol is None else float(np.log1p(sol[0]))


def slideshow(path, cuts=None):
    """Slideshow metrics of one MP4. cuts: planned hard cuts in seconds (review/cuts.json), excluded besides detected ones."""
    w0, h0, _, dur = probe(path)
    h = int(SL_W * h0 / w0) // 2 * 2
    F = frames(path, SL_W, h, fps=SL_FPS, gray=True)
    F = np.ascontiguousarray(F[:, :int(h * (0.82 if w0 >= h0 else 0.72))])   # captions: 16:9 y ≥ 0.83 H, 9:16 0.73–0.80 H
    n = len(F)
    if n < 2 * SL_FPS: return None
    d = np.concatenate([np.abs(np.diff(F[s:s + 241].astype(np.int16), axis=0)).mean((1, 2)) for s in range(0, n - 1, 240)])
    # transitions: an isolated spike (a cut, also one the plan does not list), planned cuts ±1, cross-dissolves
    trans = np.zeros(n - 1, bool)
    for i in range(n - 1):
        nb = np.r_[d[max(0, i - 6):i], d[i + 1:i + 7]]
        if d[i] >= max(8.0, 3 * np.median(nb) + 2) and d[i] > 2 * max(d[i - 1] if i else 0, d[i + 1] if i + 1 < n - 1 else 0): trans[i] = True
    for t in cuts or []:
        i = int(round(t * SL_FPS)) - 1; trans[max(0, i - 1):i + 2] = True
    for i in np.where((d >= SL_FAST) & ~trans)[0]:   # a dissolve: the middle frame is a linear mix of the two ends
        for hw in (2, 3, 5):
            a_, b_ = i - hw + 1, i + hw
            if a_ < 0 or b_ >= n: continue
            Aa, Bb, X = F[a_].astype(np.float32), F[b_].astype(np.float32), F[i].astype(np.float32)
            D = Aa - Bb; nd = float((D * D).sum())
            if np.abs(D).mean() < 10 or nd < 1: continue
            al = float(((X - Bb) * D).sum() / nd)
            if 0.15 < al < 0.85 and np.abs(X - Bb - al * D).mean() / np.abs(D).mean() < 0.22:
                trans[max(0, a_):b_] = True; break
    mv = d[~trans]
    fast = d >= SL_FAST
    fast_ratio = float((fast & ~trans).sum() / max(1, (~trans).sum()))
    win = int(min(30.0, dur / 2) * SL_FPS); worst = (None, None, None)   # the 30 s with the least motion: (motion, fast share, from)
    if win >= 4 * SL_FPS:
        for s in range(0, n - 1 - win + 1, SL_FPS):
            ok = ~trans[s:s + win]
            v = (float(d[s:s + win][ok].mean()), float(fast[s:s + win][ok].mean())) if ok.any() else (0.0, 0.0)
            if worst[0] is None or v[0] < worst[0]: worst = (*v, s / SL_FPS)
    # blank frames in mid-film: no edges at all, away from the first/last 0.5 s and from transitions
    blank = np.concatenate([(sobel_mag(F[s:s + 120].astype(np.float32)) > SL_BLANK_GRAD).mean((1, 2)) < SL_BLANK_FRAC for s in range(0, n, 120)])
    ok = np.ones(n, bool); e = SL_FPS // 2; ok[:e] = ok[n - e:] = False
    for i in np.where(trans)[0]: ok[i] = ok[i + 1] = False
    runs, s0 = [], None
    for i, v in enumerate(list(blank & ok) + [False]):
        if v and s0 is None: s0 = i
        elif not v and s0 is not None:
            if (i - s0) / SL_FPS >= SL_BLANK_S - 1e-9: runs.append((round(s0 / SL_FPS, 2), round(i / SL_FPS, 2)))
            s0 = None
    # camera: global zoom per frame pair, push-ins (runs of zoom-in, one frame gap allowed), slow zoom per shot
    zr = np.zeros(n - 1)
    Ff = F.astype(np.float32)
    for i in range(n - 1):
        if trans[i] or d[i] < 0.05: continue
        z = zoom_step(Ff[i], Ff[i + 1]); zr[i] = z if z is not None else 0.0
    pushes, i = [], 0
    while i < n - 1:
        if zr[i] > SL_PUSH_STEP:
            j = i
            while j + 1 < n - 1 and (zr[j + 1] > SL_PUSH_STEP or (j + 2 < n - 1 and zr[j + 2] > SL_PUSH_STEP)): j += 1
            if zr[i:j + 1][zr[i:j + 1] > 0].sum() >= SL_PUSH_MIN: pushes.append(round(i / SL_FPS, 1))
            i = j + 1
        else: i += 1
    edges = [0] + [int(i) + 1 for i in np.where(trans)[0]] + [n - 1]
    slow = 0.0
    for a_, b_ in zip(edges, edges[1:]):
        if (b_ - a_) / SL_FPS < 1.2: continue
        z = zr[a_:b_]; act = np.abs(z) > 0.0008; sg = np.sign(z[act])
        if 0.02 <= abs(z.sum()) <= 0.25 and act.mean() >= 0.6 and abs(sg.mean()) >= 0.7 and np.percentile(np.abs(z), 95) * SL_FPS < 0.25:
            slow += (b_ - a_) / SL_FPS
    # blue-violet frames: hue 225–300°, saturation ≥ 0.3, value 0.06–0.90 on ≥ 30 % of the pixels; 2 fps, 160 px
    bh = int(160 * h0 / w0) // 2 * 2
    C = frames(path, 160, bh, fps=2).astype(np.float32) / 255
    mx, mn = C.max(3), C.min(3); dl = mx - mn + 1e-6; r, g, b = C[..., 0], C[..., 1], C[..., 2]
    hue = np.where(mx == r, ((g - b) / dl) % 6, np.where(mx == g, (b - r) / dl + 2, (r - g) / dl + 4)) * 60
    sat = (mx - mn) / (mx + 1e-6)
    bv = (((hue >= 225) & (hue <= 300) & (sat >= 0.3) & (mx >= 0.06) & (mx <= 0.90)).mean((1, 2)) >= 0.30)
    secs = (n - 1) / SL_FPS
    return {'file': path, 'seconds': round(secs, 1), 'transitions': int(trans.sum()),
            'fast_ratio': round(fast_ratio, 3), 'mean_motion': round(float(mv.mean()), 2) if len(mv) else 0.0,
            'worst_window': {'motion': round(worst[0], 2) if worst[0] is not None else None, 'fast_ratio': round(worst[1], 3) if worst[0] is not None else None,
                             'from_s': worst[2], 'len_s': round(win / SL_FPS, 1)},
            'blank_runs_s': runs, 'blue_violet': round(float(bv.mean()), 3),
            'blue_violet_at_s': [round(float(i) / 2, 1) for i in np.where(bv)[0][:12]],
            'pushes': len(pushes), 'push_per_min': round(len(pushes) / secs * 60, 1), 'push_at_s': pushes[:30],
            'slow_zoom_share': round(slow / secs, 3), 'zoom_measured': round(float((zr != 0).mean()), 3)}


def slideshow_gates(m, fmt, gate):
    """WARN lines from the slideshow metrics; a blank stretch in mid-film is the only FAIL (a fact, not taste)."""
    for a_, b_ in m['blank_runs_s']: gate('FAIL', 'slides', f'{fmt}: blank frame {a_}–{b_}s ({b_ - a_:.2f}s ≥ {SL_BLANK_S}s, no edges at all) in mid-film')
    if m['fast_ratio'] < SL_WARN['fast_ratio']:
        gate('WARN', 'slides', f"{fmt}: fast motion in {m['fast_ratio']:.1%} of frames (< {SL_WARN['fast_ratio']:.0%}): reads as slides with transitions — does anything move inside a shot?")
    ww = m['worst_window']
    if ww['motion'] is not None and ww['motion'] < SL_WARN['worst_motion']:
        gate('WARN', 'slides', f"{fmt}: {ww['from_s']:.0f}–{ww['from_s'] + ww['len_s']:.0f}s barely moves (mean Δ {ww['motion']} < {SL_WARN['worst_motion']}, "
                               f"fast frames {ww['fast_ratio']:.1%}): the film sags there")
    if m['blue_violet'] >= SL_WARN['blue_violet']:
        gate('WARN', 'slides', f"{fmt}: {m['blue_violet']:.0%} of the film is a blue-violet frame (≥ {SL_WARN['blue_violet']:.0%}), e.g. at {m['blue_violet_at_s'][:6]} s: the generic AI palette")
    if m['push_per_min'] >= SL_WARN['push_per_min'] and m['pushes'] >= 3:   # two pushes in a 16 s film are not a habit yet
        gate('WARN', 'slides', f"{fmt}: {m['push_per_min']} push-ins per minute (≥ {SL_WARN['push_per_min']}), at {m['push_at_s'][:8]} s: a push on every slide is still a slideshow")
    if m['slow_zoom_share'] >= SL_WARN['slow_zoom_share']:
        gate('WARN', 'slides', f"{fmt}: slow steady zoom on {m['slow_zoom_share']:.0%} of the film (≥ {SL_WARN['slow_zoom_share']:.0%}): Ken Burns instead of staging")


if len(sys.argv) > 1 and sys.argv[1] == '--slideshow':
    args = sys.argv[2:]; cuts = None
    if '--cuts' in args:
        k = args.index('--cuts'); src, _, fmt_ = args[k + 1].partition(':'); cuts = json.load(open(src)).get(fmt_ or '16x9'); del args[k:k + 2]
    out_, nfail = [], 0
    for p_ in args:
        m_ = slideshow(p_, cuts)
        if m_ is None: print(f'NOT CHECKED  {p_}: shorter than 2 s'); continue
        gl = []; slideshow_gates(m_, os.path.basename(p_), lambda lv, c, msg: gl.append((lv, msg)))
        print(json.dumps(m_, ensure_ascii=False))
        for lv, msg in gl: print(f'{lv:12s} slides    {msg}')
        nfail += sum(lv == 'FAIL' for lv, _ in gl)
    sys.exit(1 if nfail else 0)

R = next((a for a in sys.argv[1:] if not a.startswith('--')), '1')
DRAFT = '--draft' in sys.argv
OUT = f'review/r{R}'; os.makedirs(OUT, exist_ok=True)
TL = json.load(open('timeline.json'))
V = {f: f"renders/{'draft_' if DRAFT else ''}{f}.mp4" for f in TL['formats'] if os.path.exists(f"renders/{'draft_' if DRAFT else ''}{f}.mp4")}
if not V: raise SystemExit('no renders found: node scripts/render.mjs --draft --all  (or a final render)')
P = TL['formats'][0] if TL['formats'][0] in V else next(iter(V))


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
# overlay mode: the recording under the film has its own cuts and motion, a jump inside it is not ours — say so
REC_NOTE = '; overlay mode: compare with the source recording, a cut inside it is not a defect' if TL.get('recording') else ''
for p_ in M['pops'][:12]: gate('WARN', 'pops', f"single-frame jump at {p_['t']}s (Δ {p_['jump']}): look at --at {p_['t'] - 1 / FPS:.3f},{p_['t']:.3f}{REC_NOTE}")

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
        hits = [r for r in rows if r['type'] != 'tick']
        absd = [abs(r['visual_minus_audio_ms']) for r in hits]
        masked = [r for r in hits if abs(r['audio_vs_cue_ms']) > 1000 / FPS + 1]
        M['sync'] = {'cues': rows, 'checked': f'{len(hits)} hits of {len(rows)} cues', 'hits_within_45ms': f'{sum(v <= 45 for v in absd)}/{len(absd)}',
                     'hits_mean_abs_ms': round(float(np.mean(absd)), 1) if absd else None, 'hits_not_sharpest': len(masked),
                     'note': 'audio_vs_cue: the sharpest onset in the mix within ±120 ms of the cue. More than a frame off = the hit is not '
                             'what the ear catches there (voice syllable or drum on top, or a hit without a high-frequency transient). '
                             'visual_minus_audio measures motion START (positive = picture late): a pointer, confirm on strips.'}
        if masked: gate('WARN', 'sync', f'{len(masked)}/{len(hits)} hits are not the sharpest sound at their cue (masked by voice/music, or no HF click): '
                        + ', '.join(f"{r['t']}s" for r in masked[:8]) + ' · audio.jpg shows them')
        # the picture on the cue, by what the event says it is (timeline sfx "visual"; after Bodila51/opus-sound-layer qa.py):
        # cut = the frame changes hard within a frame, move = a motion peak within 0.1 s, land = motion settles within 0.07 s,
        # appear = a local jump within a frame. Tolerances in seconds: the film runs at 60 fps.
        # Whole-frame motion fits full-screen cuts only: a chip landing while the card drifts read 83 ms early on the demo
        # (the strip showed it 30 ms late, fine by ear). So move/land/appear read the 8×4 tile that moves most near the cue.
        full = np.r_[0.0, energy]; n = len(full); w = lambda s: max(1, int(round(s * FPS)))
        TX, TY = 8, 4; th, tw = g.shape[1] // TY, g.shape[2] // TX
        tiles = np.zeros((len(g), TY * TX), np.float32)   # tiles[i] = change INTO frame i, per tile
        for s0 in range(0, len(g) - 1, 240):
            d = np.abs(np.diff(g[s0:s0 + 241], axis=0))[:, :th * TY, :tw * TX]
            tiles[s0 + 1:s0 + 1 + len(d)] = d.reshape(len(d), TY, th, TX, tw).mean(axis=(2, 4)).reshape(len(d), -1)
        def picture(kind, f):
            if f < 1 or f >= n: return False, 'cue outside the video'
            if kind == 'cut': m, where = full, 'frame'
            else:
                back, ahead = {'land': (w(0.5), w(0.1)), 'move': (w(0.15), w(0.15))}.get(kind, (1, 1))
                k = int(np.argmax(tiles[max(1, f - back):min(n, f + ahead + 1)].max(0))); m, where = tiles[:, k], f'tile {k % TX},{k // TX}'
            med = lambda: float(np.median(m[max(1, f - w(0.5)):min(n, f + w(0.5))]))
            if kind in ('cut', 'appear'):
                lo, hi = max(1, f - 1), min(n, f + 2); i = lo + int(np.argmax(m[lo:hi])); base = med()
                ok = m[i] > 4 * (base + 1) and m[i] > 6 if kind == 'cut' else m[i] >= 0.3 and m[i] >= 3 * (base + 0.1)
                return ok, f'{where}: largest change at {i / FPS:.3f}s ({m[i]:.1f} vs local {base:.1f})'
            if kind == 'move':
                lo, hi = max(1, f - w(0.1)), min(n, f + w(0.1) + 1); i = lo + int(np.argmax(m[lo:hi]))
                ok = m[i] >= m[max(1, i - 1)] and m[i] >= m[min(n - 1, i + 1)] and m[i] > 0.5
                return ok, f'{where}: motion peak at {i / FPS:.3f}s ({(i - f) / FPS * 1000:+.0f} ms)'
            if kind == 'land':
                pre = m[max(1, f - w(0.5)):max(2, f - 1)]
                if not len(pre) or pre.max() < 0.5: return False, f'{where}: no motion before the landing'
                thr = max(0.25, 0.05 * pre.max())
                for i in range(max(1, f - w(0.2)), min(n, f + w(0.2) + 1)):
                    if m[i] <= thr < m[i - 1]: return abs(i - f) <= w(0.07), f'{where}: motion stops at {i / FPS:.3f}s ({(i - f) / FPS * 1000:+.0f} ms)'
                return False, f'{where}: motion does not stop near the cue'
            return True, f'unknown visual "{kind}" (cut | move | land | appear)'
        typed = [c for c in cues if c.get('visual')]
        pic = [{'t': c['t'], 'visual': c['visual'], 'what': c['what'], **(lambda ok, why: {'ok': bool(ok), 'why': why})(*picture(c['visual'], int(round(c['t'] * FPS))))} for c in typed]
        M['sync']['picture'] = pic
        if not typed: gate('NOT CHECKED', 'picture', 'no sfx event says what the picture does ("visual": cut | move | land | appear in timeline.json sfx)')
        # land is a pointer only: a spring with overshoot over a drifting card has no clean stop (demo: 13 of 14 landings read
        # ±80–200 ms off while the strips showed them on the beat). Confirm landings on strips; gate cut, move and appear.
        elif bad_pic := [r for r in pic if not r['ok'] and r['visual'] != 'land']:
            gate('WARN', 'picture', f'{len(bad_pic)}/{sum(r["visual"] != "land" for r in pic)} cuts, moves and appearances do not match the picture: ' + '; '.join(f"{r['t']}s {r['visual']}: {r['why']}" for r in bad_pic[:6])
                 + ' · move the cue or the motion, then confirm on a strip (render.mjs --at)')
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

# 7. is it a slideshow? every format (the numbers per format go to metrics.json "slideshow")
CUTS_ALL = json.load(open('review/cuts.json')) if os.path.exists('review/cuts.json') else {}
M['slideshow'] = {}
for f, p in V.items():
    m_ = slideshow(p, CUTS_ALL.get(f))
    if m_ is None: gate('NOT CHECKED', 'slides', f'{f}: shorter than 2 s'); continue
    M['slideshow'][f] = {k: v for k, v in m_.items() if k != 'file'}
    slideshow_gates(m_, f, gate)

lo = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', V[P], '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
summ = lo[lo.rfind('Summary'):]
M['loudness'] = {l.split(':')[0].strip(): l.split(':')[1].strip() for l in summ.splitlines() if l.strip().startswith(('I:', 'Peak:'))} or 'no audio'
if M['loudness'] == 'no audio': gate('NOT CHECKED', 'loudness', 'no audio')
else:
    I_ = float(M['loudness']['I'].split()[0]); TP_ = float(M['loudness']['Peak'].split()[0])
    if abs(I_ + 14) > 0.5 or TP_ > -1: gate('FAIL', 'loudness', f'{I_} LUFS / {TP_} dBTP: target -14 ±0.5 LUFS, ≤ -1 dBTP (after AAC; remix with mix.py)')

M['gates'] = GATES
json.dump(M, open(f'{OUT}/metrics.json', 'w'), indent=1, ensure_ascii=False)
print(json.dumps({k: v for k, v in M.items() if k not in ('sync', 'gates', 'spec', 'slideshow')}, indent=1, ensure_ascii=False))
for f, m_ in M['slideshow'].items():
    ww = m_['worst_window']; q = f"quietest {ww['len_s']:.0f} s from {ww['from_s']}s: Δ {ww['motion']}" if ww['motion'] is not None else 'too short for a window'
    print(f"slideshow {f}: fast {m_['fast_ratio']:.3f} · {q} · push-ins {m_['push_per_min']}/min · slow zoom {m_['slow_zoom_share']:.0%} · "
          f"blue-violet {m_['blue_violet']:.0%} · blank runs {len(m_['blank_runs_s'])}")
if 'sync' in M: print('sync:', M['sync']['checked'], '·', M['sync']['hits_within_45ms'], 'visual within 45 ms, mean', M['sync']['hits_mean_abs_ms'], 'ms ·', M['sync']['hits_not_sharpest'], 'hits not the sharpest sound at their cue · mux offset', M.get('mux_offset_ms'), 'ms')
print(f'wrote {OUT}/: ' + ' '.join(sorted(os.listdir(OUT))))
for g_ in GATES: print(f"{g_['level']:12s} {g_['check']:9s} {g_['msg']}")
fails = sum(g_['level'] == 'FAIL' for g_ in GATES)
print(f"gates: {fails} FAIL, {sum(g_['level'] == 'WARN' for g_ in GATES)} WARN, {sum(g_['level'] == 'NOT CHECKED' for g_ in GATES)} NOT CHECKED"
      f" · checked {NF} frames, {len(V)} format(s)")
sys.exit(1 if fails else 0)

#!/usr/bin/env python3
"""Overlay mode: a finished recording (talking head, talk, interview) is the bottom layer of the whole film, the engine's
graphics go over it, the recording's own sound is the voice, and the voice marks come from its transcript.
Replaces step 4 of SKILL.md (extract_lines → voice.py → layout_vo.py → vo.py). Run from the project root, after init.sh:

  python3 <skill>/scripts/overlay_prep.py <recording.mp4> --transcript <segments.json | raw.json | .srt | .vtt>
        [--words raw.json] [--scenes 12.5,31.4,…] [--min-scene 5] [--tail 2.5] [--height 1080] [--q 3] [--shift 0] [--keep-fps] [--force]

What it writes:
  assets/recording/<stem>.mp4         the recording (copied)
  assets/recording/<stem>/00001.jpg…  every frame at the source frame rate (footage.js shows frame k on [k/fps, (k+1)/fps))
  audio/vo.wav                        the recording's sound, 48 kHz mono, aligned to the first video frame, film length
  audio/vo/lines.json                 one line per phrase {id, text} (captions.py reads it)
  audio/vo_placed.json                phrases in seconds {id, text, at, t0, t1} (sync.mjs → window.VO, mix.py, plan_check.py)
  timeline.json                       duration = the recording, "recording" (the layer), marks in beats as layout_vo.py names them:
      sc<N>      scene N starts: one scene per transcript segment, short ones merged (--min-scene s), or at --scenes times
                 (each snapped to the first phrase that starts at or after it)
      <id>       phrase starts (s1a, s1b, s2a … one phrase per sentence)
      <id>.<k>   k-th speech chunk of the phrase (word pauses ≥ 0.12 s, commas, ≤ 7 words; from word timings)
      <id>.end   phrase ends                        done   the end of the film: the recording + --tail seconds
                 (--tail: an end card over the frozen last frame; without it the end hold is whatever the recording has)
    and, unless already set: "mix": {"voice_chain": false, "room": 0} — a real recording keeps its own room and tone;
    fps = the largest multiple of the source rate ≤ 60 (25 → 50, 30 → 60, 24 → 48) so every source frame is shown
    equally long (--keep-fps leaves the timeline's fps).
Transcript (the transcriber skill): segments.json "readable" gives the phrases and their text; word timings come from
raw.json next to it (primary hypothesis, metadata.chunks[].words) or --words. Without word timings phrases are timed by
letter count inside each segment and chunks by speech pauses in the audio (printed as ESTIMATED). Transcript times count
from the first sample of the sound, film time from the first video frame: the offset between the two streams is added
by itself; --shift adds more seconds on top (a transcript of a trimmed copy).
Then: music_source.py, captions.py, sync.mjs, film.js (scenes over the recording, transparent roots), sfx, mix.py, render.
Do NOT run layout_vo.py or vo.py in this mode: they would rebuild audio/vo.wav from TTS takes."""
import argparse, difflib, json, math, os, re, shutil, subprocess, sys
from pathlib import Path

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
ap.add_argument('recording')
ap.add_argument('--transcript', required=True)
ap.add_argument('--words', help='raw.json with word timings (default: raw.json next to segments.json)')
ap.add_argument('--scenes', help='scene start times in seconds, comma-separated (overrides one-scene-per-segment)')
ap.add_argument('--min-scene', type=float, default=5.0, help='merge transcript segments into scenes of at least this many seconds')
ap.add_argument('--height', type=int, default=1080, help='frame height cap for the extracted JPEGs (default 1080)')
ap.add_argument('--q', type=int, default=3, help='JPEG quality, ffmpeg -q:v (2 best … 31), default 3')
ap.add_argument('--shift', type=float, default=0.0)
ap.add_argument('--tail', type=float, default=0.0, help='seconds of end card after the recording: its last frame holds, the sound is silent')
ap.add_argument('--keep-fps', action='store_true')
ap.add_argument('--force', action='store_true', help='extract the frames again even if they are there')
A = ap.parse_args()

if not Path('timeline.json').exists(): sys.exit('timeline.json missing: run from the project root (after init.sh)')
TL = json.loads(Path('timeline.json').read_text(encoding='utf-8'))
src = Path(A.recording).expanduser().resolve()
if not src.exists(): sys.exit(f'{src}: no such file')


def run(*a, capture=False):
    r = subprocess.run(a, capture_output=True, text=True)
    if r.returncode: sys.exit(f'{a[0]} failed: {r.stderr[-1500:]}')
    return r.stdout


def rate(s):
    n, _, d = (s or '0/1').partition('/')
    return float(n) / float(d or 1) if float(d or 1) else 0.0


# ---------------------------------------------------------------- probe
P = json.loads(run('ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(src)))
V = next((s for s in P['streams'] if s['codec_type'] == 'video'), None)
AU = next((s for s in P['streams'] if s['codec_type'] == 'audio'), None)
if not V: sys.exit(f'{src.name}: no video stream')
if not AU: sys.exit(f'{src.name}: no audio stream — overlay mode takes the voice from the recording')
fps_s = V.get('avg_frame_rate') if rate(V.get('avg_frame_rate')) else V.get('r_frame_rate')
fps, r_fps = rate(fps_s), rate(V.get('r_frame_rate'))
if r_fps and abs(r_fps - fps) / fps > 0.01:
    print(f'NOTE: variable frame rate (avg {fps:.3f}, nominal {r_fps:.3f}): frames are resampled to a constant {r_fps:.3f} fps')
    fps_s, fps = V['r_frame_rate'], r_fps
v0 = float(V.get('start_time') or 0); a0 = float(AU.get('start_time') or 0)
vdur = float(V.get('duration') or P['format']['duration'])
w, h = int(V['width']), int(V['height'])
rot = int((V.get('tags') or {}).get('rotate', 0) or next((d.get('rotation', 0) for d in V.get('side_data_list', []) if 'rotation' in d), 0) or 0)
if abs(rot) % 180 == 90: w, h = h, w   # ffmpeg autorotates on decode: the frames come out upright

# ---------------------------------------------------------------- frames
stem = re.sub(r'[^A-Za-z0-9_-]+', '-', src.stem).strip('-') or 'rec'
rec_dir = Path('assets/recording'); rec_dir.mkdir(parents=True, exist_ok=True)
dst = rec_dir / f'{stem}{src.suffix.lower()}'
if dst.resolve() != src: shutil.copy2(src, dst)
fdir = rec_dir / stem
expect = int(math.floor(vdur * fps + 1e-6))
pad = max(5, len(str(expect + 10)))
have = sorted(fdir.glob('*.jpg')) if fdir.exists() else []
if A.force or abs(len(have) - expect) > 2:
    if fdir.exists(): shutil.rmtree(fdir)
    fdir.mkdir(parents=True)
    oh = min(h, A.height); ow = round(w * oh / h / 2) * 2
    print(f'extracting {expect} frames ({w}x{h} → {ow}x{oh}, {fps:.3f} fps, -q:v {A.q}) …', flush=True)
    # fps= on the source rate: a constant-rate source passes frame for frame; a variable-rate one is held/dropped to it.
    # Frame 1 is the first video frame; its time is the film's t = 0 (setpts: a video stream that starts after the sound
    # would otherwise get copies of its first frame padded in front, and picture and sound would part by that much).
    run('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src), '-map', '0:v:0', '-an',
        '-vf', f'setpts=PTS-STARTPTS,fps={fps_s}:round=near,scale={ow}:{oh}:flags=lanczos', '-q:v', str(A.q), '-start_number', '1',
        str(fdir / f'%0{pad}d.jpg'))
    have = sorted(fdir.glob('*.jpg'))
else:
    print(f'frames already there: {len(have)} in {fdir} (--force to extract again)')
frames = len(have)
if not frames: sys.exit('no frames extracted')
REC_DUR = round(frames / fps, 3)
DUR = round(REC_DUR + max(0.0, A.tail), 3)   # the film: the recording + an optional end card on its frozen last frame
mb = sum(f.stat().st_size for f in have) / 1e6
print(f'{fdir}: {frames} frames, {mb:.0f} MB ({mb / frames * 1000:.0f} KB/frame), {REC_DUR:.3f} s' + (f' + {A.tail:g} s end card' if A.tail > 0 else ''))

# ---------------------------------------------------------------- sound → audio/vo.wav, aligned to the first video frame
Path('audio/vo').mkdir(parents=True, exist_ok=True)
d = a0 - v0   # > 0: the sound starts after the first frame (pad it); < 0: before (trim it)
align = f'adelay={round(d * 1000, 3)}:all=1' if d > 0.0005 else f'atrim=start={-d:.6f},asetpts=PTS-STARTPTS' if d < -0.0005 else 'anull'
END = f'atrim=0:{REC_DUR},' + (f'afade=t=out:st={REC_DUR - 0.02:.3f}:d=0.02,' if A.tail > 0 else '') + f'apad,atrim=0:{DUR}'
run('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src), '-map', '0:a:0', '-vn',
    '-af', f'asetpts=PTS-STARTPTS,{align},aresample=48000,pan=mono|c0=0.5*c0+0.5*c1,{END}'
    if int(AU.get('channels', 1)) > 1 else f'asetpts=PTS-STARTPTS,{align},aresample=48000,{END}',
    '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s24le', 'audio/vo.wav')
print(f'audio/vo.wav: {DUR:.3f} s, sound offset {d * 1000:+.1f} ms against the first frame (transcript times shifted by it) ({"padded" if d > 0.0005 else "trimmed" if d < -0.0005 else "none"})')

# ---------------------------------------------------------------- transcript
# a transcript counts from the first sample of the sound (that is what an ASR decodes); the film counts from the first frame
SHIFT = A.shift + (d if abs(d) > 0.0005 else 0.0)
tp = Path(A.transcript).expanduser()
if not tp.exists(): sys.exit(f'{tp}: no such transcript')


def ts(s):  # 00:01:02,345 / 01:02.345 → seconds
    p = s.replace(',', '.').split(':'); return sum(float(x) * 60 ** i for i, x in enumerate(reversed(p)))


def primary_chunks(raw):
    hyps = raw.get('hypotheses') or []
    h = next((x for x in hyps if (x.get('metadata') or {}).get('role') == 'primary'), hyps[0] if hyps else None)
    return ((h or {}).get('metadata') or {}).get('chunks') or (h or {}).get('segments') or []


segs, words = [], []
if tp.suffix.lower() in ('.srt', '.vtt'):
    for m in re.finditer(r'(\d[\d:.,]*)\s*-->\s*(\d[\d:.,]*)[^\n]*\n(.*?)(?:\n\s*\n|\Z)', tp.read_text(encoding='utf-8'), re.S):
        segs.append({'start': ts(m[1]), 'end': ts(m[2]), 'text': ' '.join(m[3].split())})
else:
    J = json.loads(tp.read_text(encoding='utf-8'))
    if 'readable' in J: segs = J['readable']
    elif 'hypotheses' in J: segs = primary_chunks(J)
    elif isinstance(J, list): segs = J
    else: sys.exit(f'{tp}: not a transcriber segments.json / raw.json, nor a list of {{start, end, text}}')
    wp = Path(A.words) if A.words else (tp if 'hypotheses' in J else tp.with_name('raw.json'))
    if wp.exists():
        for c in primary_chunks(json.loads(wp.read_text(encoding='utf-8'))):
            words += [x for x in c.get('words') or [] if str(x.get('text', '')).strip()]
segs = sorted(({'start': float(s['start']) + SHIFT, 'end': float(s['end']) + SHIFT, 'text': ' '.join(str(s['text']).split())}
               for s in segs if str(s.get('text', '')).strip()), key=lambda s: s['start'])
words = sorted(({'start': float(x['start']) + SHIFT, 'end': float(x['end']) + SHIFT, 'text': str(x['text']).strip()} for x in words),
               key=lambda x: x['start'])
segs = [s for s in segs if s['start'] < REC_DUR - 0.05]
words = [x for x in words if x['start'] < REC_DUR - 0.02]
if not segs: sys.exit(f'{tp}: no segments inside the recording (0–{REC_DUR:.1f} s); wrong file or --shift?')
estimated = not words
for x in words: x['end'] = min(x['end'], REC_DUR)

# words → segments: a word belongs to the segment whose span holds its midpoint (neighbours overlap by ~0.1 s)
bounds = [(a['end'] + b['start']) / 2 for a, b in zip(segs, segs[1:])]
for s in segs: s['words'] = []
for x in words:
    mid = (x['start'] + x['end']) / 2
    segs[sum(mid >= b for b in bounds)]['words'].append(x)

norm = lambda s: re.sub(r'[^\w]+', '', s.lower())
SENT = re.compile(r'[^.!?…]+(?:[.!?…]+["»”)]*|$)')


def phrases_of(seg):
    """Split a segment into sentences, each with t0, t1 and its words (readable text kept for the screen)."""
    sents = [x.strip() for x in SENT.findall(seg['text']) if x.strip()]
    merged = []
    for x in sents:   # a one-word sentence ("So.") joins the next one
        if merged and len(merged[-1].split()) < 2: merged[-1] += ' ' + x
        else: merged.append(x)
    sents = merged or [seg['text']]
    W = seg['words']
    if not W:   # no word timings: share the segment by letter count
        tot = sum(len(x) for x in sents); t, out = seg['start'], []
        for x in sents:
            t1 = t + (seg['end'] - seg['start']) * len(x) / max(1, tot)
            out.append({'text': x, 't0': t, 't1': t1, 'words': []}); t = t1
        return out
    # align readable tokens to the spoken words (fillers and glossary fixes differ): each sentence takes the words its
    # tokens matched, a sentence with no match gets the words between its neighbours
    toks = [(i, norm(tk)) for i, x in enumerate(sents) for tk in x.split()]
    sm = difflib.SequenceMatcher(None, [t for _, t in toks], [norm(x['text']) for x in W], autojunk=False)
    owner = [None] * len(W)
    for a, b, n in sm.get_matching_blocks():
        for j in range(n): owner[b + j] = toks[a + j][0]
    last = 0
    for j in range(len(W)):   # unmatched words (fillers, misheard) go to the sentence before them
        owner[j] = last if owner[j] is None else max(owner[j], last); last = owner[j]
    out = []
    for i, x in enumerate(sents):
        ws = [W[j] for j in range(len(W)) if owner[j] == i]
        if ws: out.append({'text': x, 't0': ws[0]['start'], 't1': ws[-1]['end'], 'words': ws})
        elif out: out[-1]['text'] += ' ' + x
    return out or [{'text': seg['text'], 't0': W[0]['start'], 't1': W[-1]['end'], 'words': W}]


def chunks_of(ph):
    """Speech chunks inside a phrase: start times. From words: a new chunk after a pause ≥ 0.12 s, after a comma-like
    mark, or after 7 words. Without words: pauses in the recording's sound."""
    W = ph['words']
    if W:
        out, n = [W[0]['start']], 0
        for p, x in zip(W, W[1:]):
            n += 1
            if x['start'] - p['end'] >= 0.12 or re.search(r'[,;:—–]$', p['text']) or n >= 7: out.append(x['start']); n = 0
        return out
    if not TL.get('duration'):   # vo.py reads the film length from timeline.json when it is imported
        TL['duration'] = DUR; Path('timeline.json').write_text(json.dumps(TL, ensure_ascii=False, indent=2), encoding='utf-8')
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import soundfile as sf
    from vo import segments as speech
    y, sr = sf.read('audio/vo.wav')
    seg = y[int(ph['t0'] * sr):int(ph['t1'] * sr)]
    return [ph['t0'] + a for a, _ in speech(seg)] or [ph['t0']]


# ---------------------------------------------------------------- scenes and phrases
groups = []
if A.scenes:
    cuts = sorted(float(x) for x in A.scenes.split(',') if x.strip())
    allph = [p for s in segs for p in phrases_of(s)]
    for p in allph:
        k = sum(p['t0'] >= c - 0.05 for c in cuts)
        if not groups or groups[-1][0] != k: groups.append((k, []))
        groups[-1][1].append(p)
    groups = [g for _, g in groups]
else:
    cur = []
    for s in segs:
        cur += phrases_of(s)
        if cur and cur[-1]['t1'] - cur[0]['t0'] >= A.min_scene: groups.append(cur); cur = []
    if cur:
        if groups and cur[-1]['t1'] - cur[0]['t0'] < A.min_scene / 2: groups[-1] += cur   # a short tail joins the last scene
        else: groups.append(cur)

BPM = float(TL.get('bpm', 120)); BEAT = 60 / BPM
B = lambda t: round(t / BEAT, 4)
letters = lambda i: chr(97 + i) if i < 26 else 'z' + letters(i - 25)
marks, lines, placed, prev_end = {}, [], [], 0.0
for n, g in enumerate(groups, 1):
    marks[f'sc{n}'] = 0.0 if n == 1 else B(max(prev_end, g[0]['t0'] - 0.25))
    for i, p in enumerate(g):
        pid = f's{n}{letters(i)}'
        t0 = max(p['t0'], prev_end); t1 = max(t0 + 0.05, min(p['t1'], REC_DUR))
        marks[pid] = B(t0); marks[f'{pid}.end'] = B(t1)
        for k, c in enumerate(chunks_of(p), 1): marks[f'{pid}.{k}'] = B(min(max(c, t0), t1))
        lines.append({'id': pid, 'text': p['text']})
        placed.append({'id': pid, 'text': p['text'], 'at': pid, 't0': round(t0, 3), 't1': round(t1, 3)})
        prev_end = t1
marks['done'] = B(DUR)

ours = {L['id'] for L in lines}
keep = {k: v for k, v in (TL.get('marks') or {}).items() if not (k in marks or k.split('.')[0] in ours or re.fullmatch(r'sc\d+', k)
                                                              or re.fullmatch(r's\d+[a-z]+(\.\w+)?', k))}
TL['marks'] = {**keep, **marks}
TL['duration'] = DUR; TL['bpm'] = BPM
old = TL.get('recording') or {}
TL['recording'] = {'src': str(fdir), 'file': str(dst), 'fps': round(fps, 6), 'frames': frames, 'pad': pad, 'w': w, 'h': h, 'offset': 0,
                   'transcript': str(tp), 'layout': old.get('layout', {})}
TL['voiceover'] = {'source': 'recording', 'file': str(dst)}
mix = TL.get('mix') or {}
mix.setdefault('voice_chain', False); mix.setdefault('room', 0); TL['mix'] = mix
if not A.keep_fps:
    k = max(1, int(60 // fps + 1e-9)); new = round(fps * k, 6)
    if TL.get('fps') != new: print(f'fps {TL.get("fps")} → {new:g} ({k}× the source rate: every source frame shown {k} film frames)')
    TL['fps'] = new
Path('timeline.json').write_text(json.dumps(TL, ensure_ascii=False, indent=2), encoding='utf-8')
Path('audio/vo/lines.json').write_text(json.dumps(lines, ensure_ascii=False, indent=1), encoding='utf-8')
Path('audio/vo_placed.json').write_text(json.dumps(placed, ensure_ascii=False, indent=1), encoding='utf-8')
if Path('vo.json').exists(): print('NOTE: vo.json from a TTS layout is still here — do not run vo.py in overlay mode (it would overwrite audio/vo.wav)')

print(f'recording {w}x{h} @ {fps:.3f} fps, {REC_DUR:.3f} s · film {DUR:.3f} s at {BPM:g} BPM · {len(groups)} scenes, {len(lines)} phrases'
      + ('' if not estimated else ' · ESTIMATED timing (no word timings: letter count + pauses in the sound)'))
for n, g in enumerate(groups, 1):
    print(f"  sc{n:<3} {marks[f'sc{n}'] * BEAT:7.2f}s  {len(g)} phrase(s)  «{g[0]['text'][:60]}»")
over = [(a['id'], b['id']) for a, b in zip(placed, placed[1:]) if b['t0'] < a['t1'] - 0.005]
print('overlaps:', over or 'none', f'· kept {len(keep)} hand marks' if keep else '')
print('next: music_source.py → captions.py → node scripts/sync.mjs → film.js over the recording → sfx → mix.py → render.mjs')

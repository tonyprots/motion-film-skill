#!/usr/bin/env python3
"""Generated B-roll bridges — ONLY when the brief asks for them (they cost money and can read as stock).
A bridge is a 4–8 s clip that starts on the film's own frame at a mark and ends on its frame `seconds` later, so it
cuts in and out invisibly; lib/footage.js plays it full-frame from t, no film.js code. Atmosphere only: no screens,
no text, no faces, no logos — the model invents them wrong.

  timeline.json  "broll": [{"id": "b1", "at": "s3", "seconds": 4, "prompt": "slow push through morning fog over a city",
                            "model": "google/veo-3.1-fast", "resolution": "1080p"}]
  The film must hold still-ish frames at "at" and at "at" + seconds (scene B starts at that second).
  .venv/bin/python scripts/broll.py            → prints the plan and the price, spends nothing
  .venv/bin/python scripts/broll.py --yes      → generates what is missing → assets/broll/<id>_<fmt>/0001.jpg … + .mp4 + .json
  options: --only b1  --force (regenerate)
Then node scripts/sync.mjs (data.js picks up "_out"). Key: OPENROUTER_API_KEY. Models with first+last frame: Veo 3.1
(fast / lite), Kling 3.0, Seedance 2.0, Hailuo 3, Wan 2.7 (GET https://openrouter.ai/api/v1/videos/models)."""
import argparse, base64, io, json, os, subprocess, sys, time, urllib.request
from PIL import Image

API = 'https://openrouter.ai/api/v1'
ASPECT = {'16x9': '16:9', '9x16': '9:16', '1x1': '1:1'}
SIZE = {'16x9': (1920, 1080), '9x16': (1080, 1920), '1x1': (1080, 1080)}

ap = argparse.ArgumentParser(); ap.add_argument('--yes', action='store_true'); ap.add_argument('--force', action='store_true'); ap.add_argument('--only')
a = ap.parse_args()
TL = json.load(open('timeline.json', encoding='utf-8'))
B = [b for b in TL.get('broll') or [] if not a.only or b['id'] == a.only]
if not B: sys.exit('timeline.json has no "broll" entries — bridges are opt-in (only when the brief asks for them)')
KEY = os.environ.get('OPENROUTER_API_KEY')


def call(method, path, body=None, raw=False):
    req = urllib.request.Request(path if path.startswith('http') else API + path, method=method,
                                 data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'})
    try:
        r = urllib.request.urlopen(req, timeout=300)
    except urllib.error.HTTPError as e:
        sys.exit(f'OpenRouter {e.code}: {e.read().decode()[:600]}')
    return r.read() if raw else json.load(r)


models = {m['id']: m for m in json.load(urllib.request.urlopen(f'{API}/videos/models', timeout=60))['data']}


def price(m, seconds, res):
    sk = m.get('pricing_skus') or {}
    for k in (f'duration_seconds_without_audio_{res}', 'duration_seconds_without_audio', 'duration_seconds', f'image_to_video_duration_seconds_{res}'):
        if k in sk: return float(sk[k]) * seconds
    if 'cents_per_second_output' in sk: return float(sk['cents_per_second_output']) / 100 * seconds
    return None


def frame(fmt, at):
    """the film's own frame at `at` (seconds or a mark) as a JPEG data URL, via render.mjs --at"""
    out = subprocess.run(['node', 'scripts/render.mjs', '--at', str(at), '--fmt', fmt], capture_output=True, text=True)
    path = [l.split('wrote ', 1)[1] for l in out.stdout.splitlines() if l.startswith('wrote ')]
    if not path: sys.exit(f'render.mjs --at {at} failed:\n{out.stderr[-800:]}')
    buf = io.BytesIO(); Image.open(path[-1]).convert('RGB').save(buf, 'JPEG', quality=92)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


plan, total = [], 0.0
for b in B:
    if not isinstance(b.get('at'), str): sys.exit(f"{b['id']}: \"at\" must be a mark name (the bridge starts there)")
    m = models.get(b.get('model', 'google/veo-3.1-fast')) or sys.exit(f"unknown model {b.get('model')} (see {API}/videos/models)")
    secs, res = int(b.get('seconds', 4)), b.get('resolution', '1080p')
    if secs not in (m.get('supported_durations') or [secs]): sys.exit(f"{b['id']}: {m['id']} supports {m['supported_durations']} s, not {secs}")
    if 'last_frame' not in (m.get('supported_frame_images') or []): sys.exit(f"{b['id']}: {m['id']} cannot end on a given frame — pick a model with last_frame")
    for fmt in TL.get('formats', ['16x9']):
        if fmt not in ASPECT: print(f"{b['id']} {fmt}: skipped (no {fmt} aspect in video models)"); continue
        done = os.path.exists(f"assets/broll/{b['id']}_{fmt}/0001.jpg") and (b.get('_out') or {}).get(fmt)
        p = price(m, secs, res)
        plan.append((b, fmt, m, secs, res, done)); total += 0 if done and not a.force else (p or 0)
        print(f"{b['id']} {fmt}: {m['id']} {secs} s {res} at {b['at']} — {'cached' if done and not a.force else f'~${p:.2f}' if p else 'price unknown'}")
print(f'total to spend: ~${total:.2f}')
if not a.yes: sys.exit('nothing generated: ask the customer, then run with --yes')
if not KEY: sys.exit('OPENROUTER_API_KEY is not set')

for b, fmt, m, secs, res, done in plan:
    if done and not a.force: continue
    first, last = frame(fmt, b['at']), frame(fmt, f"{b['at']}+{secs}")
    body = {'model': m['id'], 'prompt': b['prompt'] + ' Cinematic, realistic motion, no text, no logos, no people\'s faces.',
            'duration': secs, 'resolution': res, 'aspect_ratio': ASPECT[fmt], 'generate_audio': False, 'seed': b.get('seed', 7),
            'frame_images': [{'type': 'image_url', 'image_url': {'url': first}, 'frame_type': 'first_frame'},
                             {'type': 'image_url', 'image_url': {'url': last}, 'frame_type': 'last_frame'}]}
    if not m.get('seed'): body.pop('seed')
    job = call('POST', '/videos', body); print(f"{b['id']} {fmt}: job {job['id']} {job['status']}")
    for _ in range(120):                       # up to ~20 min
        time.sleep(10); job = call('GET', f"/videos/{job['id']}")
        if job['status'] in ('completed', 'failed', 'cancelled'): break
    if job['status'] != 'completed': sys.exit(f"{b['id']} {fmt}: {job['status']} {job.get('error', '')}")
    os.makedirs('assets/broll', exist_ok=True); stem = f"assets/broll/{b['id']}_{fmt}"
    open(stem + '.mp4', 'wb').write(call('GET', f"/videos/{job['id']}/content", raw=True))
    fps = round(eval(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', stem + '.mp4'],
                                    capture_output=True, text=True).stdout.strip() or '24'), 3)
    os.makedirs(stem, exist_ok=True)
    for f in os.listdir(stem): os.remove(os.path.join(stem, f))
    W, H = SIZE[fmt]
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', stem + '.mp4', '-vf', f'scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H}',
                    '-q:v', '2', f'{stem}/%04d.jpg'], check=True)
    n = len(os.listdir(stem))
    json.dump({'model': m['id'], 'prompt': body['prompt'], 'seed': body.get('seed'), 'job': job['id'], 'usage': job.get('usage'),
               'fps': fps, 'frames': n}, open(stem + '.json', 'w'), indent=1)
    b.setdefault('_out', {})[fmt] = {'fps': fps, 'frames': min(n, int(secs * fps))}
    json.dump(TL, open('timeline.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f"{stem}: {n} frames @ {fps} fps, cost {(job.get('usage') or {}).get('cost', '?')}")
print('next: node scripts/sync.mjs, then render.mjs --range around each bridge to check both edges')

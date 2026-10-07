#!/usr/bin/env python3
"""Cutouts and depth for PHOTOS (people, products, objects, places) — never for UI screenshots, text or flat graphics.

  .venv/bin/python scripts/vision.py cutout assets/shots/team.jpg     → assets/shots/team.cut.png (RGBA, soft edge)
  .venv/bin/python scripts/vision.py depth  assets/shots/team.jpg     → assets/shots/team.depth.png (16-bit grey, white = near)
  options: --out PATH  --force (skip the photo check)

When it pays: a person or product lifted off its background with a shadow under it, or a slow 2.5D push on a still photo
(gl.js depthPhoto). When it does not: a UI screenshot is already flat and sharp — a cutout adds a halo and parallax
tears its straight edges; text, logos and charts the same. The script measures the image first and refuses graphics
(a big share of perfectly flat pixels) unless --force. One or two such shots per film, on the hero or a human moment.

Models run locally (onnxruntime, CPU / CoreML), downloaded once to $MOTION_FILM_HOME/models with a pinned sha256:
  cutout  BiRefNet lite (MIT), fp16, 115 MB      depth  Depth Anything V2 Small (Apache-2.0), fp16, 50 MB
onnxruntime itself (MIT, ~80 MB) is installed into the shared venv on first use."""
import argparse, hashlib, os, subprocess, sys, urllib.request
import numpy as np
from PIL import Image

HOME = os.environ.get('MOTION_FILM_HOME') or os.path.expanduser('~/.cache/motion-film')
HF = 'https://huggingface.co/{repo}/resolve/{rev}/{file}'
MODELS = {
    'cutout': dict(repo='onnx-community/BiRefNet_lite-ONNX', rev='de15b22ba131738a16dff04aab8bdf8dc32e3ac1', file='onnx/model_fp16.onnx',
                   sha='d39b897ceb16ae654c1731f3dba0cf9b368d9cae74b5a57459b455cc8bfec402', size=(1024, 1024)),
    'depth': dict(repo='onnx-community/depth-anything-v2-small', rev='4472b7362082ad9968fee890ca0f1e5aca36b93d', file='onnx/model_fp16.onnx',
                  sha='2df6223f206b5164e21f664ace61dabeb9bb6a49b8b5a3e00510b4807d0f5b04', size=518),
}
ORT = 'onnxruntime==1.30.0'
MEAN, STD = np.array([0.485, 0.456, 0.406], np.float32), np.array([0.229, 0.224, 0.225], np.float32)


def runtime():
    try:
        import onnxruntime
    except ImportError:
        print(f'installing {ORT} into {sys.prefix} (once, ~80 MB) …')
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '--no-deps', ORT], check=True)
        import onnxruntime
    return onnxruntime


def model(kind):
    m = MODELS[kind]; path = os.path.join(HOME, 'models', f"{kind}-{m['sha'][:12]}.onnx")
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        url = HF.format(**m); print(f'downloading {m["repo"]} ({kind}) once …'); tmp = path + '.part'
        urllib.request.urlretrieve(url, tmp)
        h = hashlib.sha256(open(tmp, 'rb').read()).hexdigest()
        if h != m['sha']: os.remove(tmp); sys.exit(f'sha256 mismatch for {url}: {h}')
        os.rename(tmp, path)
    ort = runtime()
    prov = [p for p in ('CoreMLExecutionProvider', 'CPUExecutionProvider') if p in ort.get_available_providers()]
    try: return ort.InferenceSession(path, providers=prov)
    except Exception: return ort.InferenceSession(path, providers=['CPUExecutionProvider'])


def flat_share(img):
    """share of pixels whose 3×3 neighbourhood is exactly one colour: UI and graphics ≫ 0.3, photos ≈ 0."""
    a = np.asarray(img.convert('RGB').resize((512, int(512 * img.height / img.width)) if img.width > 512 else img.size, Image.NEAREST)).astype(np.int16)
    same = np.ones(a.shape[:2], bool)[1:-1, 1:-1]
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            same &= (a[1 + dy:a.shape[0] - 1 + dy, 1 + dx:a.shape[1] - 1 + dx] == a[1:-1, 1:-1]).all(-1)
    return float(same.mean())


def tensor(img, w, h, sess):
    x = (np.asarray(img.convert('RGB').resize((w, h), Image.BICUBIC), np.float32) / 255 - MEAN) / STD
    x = x.transpose(2, 0, 1)[None]
    return x.astype(np.float16) if 'float16' in sess.get_inputs()[0].type else x


def cutout(img, out):
    sess = model('cutout'); w, h = MODELS['cutout']['size']
    y = sess.run(None, {sess.get_inputs()[0].name: tensor(img, w, h, sess)})[-1].astype(np.float32).squeeze()
    a = 1 / (1 + np.exp(-y)) if y.min() < 0 or y.max() > 1 else y          # logits or probabilities, depending on the export
    alpha = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize(img.size, Image.BICUBIC)
    rgba = img.convert('RGB'); rgba.putalpha(alpha); rgba.save(out)
    cov = (np.asarray(alpha) > 127).mean()
    print(f'{out}: cutout, subject covers {cov:.0%} of the frame' + ('  — WARN: almost nothing found, is there a clear subject?' if cov < 0.03 else ''))


def depth(img, out):
    sess = model('depth'); s = MODELS['depth']['size']
    k = s / min(img.size); w, h = (max(14, round(img.width * k / 14) * 14), max(14, round(img.height * k / 14) * 14))
    y = sess.run(None, {sess.get_inputs()[0].name: tensor(img, w, h, sess)})[0].astype(np.float32).squeeze()
    y = (y - y.min()) / max(1e-6, y.max() - y.min())                         # relative inverse depth: 1 = nearest
    d = Image.fromarray((y * 65535).astype(np.uint16)).resize(img.size, Image.BICUBIC)
    d.save(out); print(f'{out}: depth {img.width}×{img.height} (white = near)')


ap = argparse.ArgumentParser(); ap.add_argument('op', choices=['cutout', 'depth']); ap.add_argument('image')
ap.add_argument('--out'); ap.add_argument('--force', action='store_true')
a = ap.parse_args()
img = Image.open(a.image)
f = flat_share(img)
if f > 0.3 and not a.force:
    sys.exit(f'REFUSED: {a.image} looks like a UI screenshot or flat graphic ({f:.0%} of it is perfectly flat colour). '
             'Cutouts halo and parallax tears straight edges there: show it flat, or move it with CAM.rig. '
             '--force if this really is a photo.')
out = a.out or f"{os.path.splitext(a.image)[0]}.{'cut' if a.op == 'cutout' else 'depth'}.png"
(cutout if a.op == 'cutout' else depth)(img, out)

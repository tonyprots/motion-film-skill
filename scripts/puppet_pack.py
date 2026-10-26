"""Build a cut-out puppet pack (lib/puppet.js) from generated frames on a flat green background.

  python3 scripts/puppet_pack.py --anchor anchor.png --frames gen/ --geom geom.json --out assets/puppets/<name> \
      [--alias chin=think] [--touch hush,facepalm,think]

Frames (all edits of the anchor: same character, framing and head; only arms or only the face changed):
  pose-<pose>.png    one per ACTOR pose (explain, point, listen, shrug, worry, welcome, hush, think, chin, scratch,
                     facepalm, cheer, wave); rest is the anchor itself
  face-<expr>.png    happy, worried, surprised, shocked, grimace, wink, sad, skeptic (neutral is the anchor)
  face-m-<shape>.png mouth shapes b c d e f (lib/lipsync.js); x (closed) is the anchor
  face-blink.png     both eyes closed
geom.json, in pixels of the 1024×1024 frame: head [x0,y0,x1,y1] (box used to align frames), face / mouth / eyes
[cx,cy,rx,ry] ellipses cut out as patches. --touch: poses whose hand deliberately covers the mouth or eyes (the hand
layer then keeps those areas too). Writes PNGs + puppet.json and prints the alignment error per frame: above ~15 the
frame moved the head or redrew the character; regenerate it rather than ship a jumping head.
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageFilter

POSES = ['explain', 'point', 'listen', 'shrug', 'worry', 'welcome', 'hush', 'think', 'chin', 'scratch', 'facepalm', 'cheer', 'wave']
FACES = ['happy', 'worried', 'surprised', 'shocked', 'grimace', 'wink', 'sad', 'skeptic']
SHAPES = ['b', 'c', 'd', 'e', 'f']
S = 1024

ap = argparse.ArgumentParser()
ap.add_argument('--anchor', required=True); ap.add_argument('--frames', required=True); ap.add_argument('--geom', required=True)
ap.add_argument('--out', required=True); ap.add_argument('--alias', action='append', default=[]); ap.add_argument('--touch', default='')
a = ap.parse_args()
G = json.load(open(a.geom))
HEAD, FACE, MOUTH, EYES = (tuple(G[k]) for k in ('head', 'face', 'mouth', 'eyes'))
TOUCH = {x for x in a.touch.split(',') if x}
os.makedirs(a.out, exist_ok=True)
yy, xx = np.mgrid[0:S, 0:S]
ell = lambda cx, cy, rx, ry: ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
rgb = lambda p: np.asarray(Image.open(p).convert('RGB').resize((S, S))).astype(np.float32)


def offset(A, B, box, search, mask):
    """(dx, dy, error): B shifted by (dx, dy) matches A over box, pixels where mask is True."""
    x0, y0, x1, y1 = box
    ref, M = A[y0:y1:2, x0:x1:2].mean(-1), mask[y0:y1:2, x0:x1:2]
    def err(dx, dy):
        C = B[y0 + dy:y1 + dy:2, x0 + dx:x1 + dx:2].mean(-1)
        return np.abs(ref - C)[M].mean() if C.shape == ref.shape else 1e9
    _, bx, by = min((err(dx, dy), dx, dy) for dy in range(-search, search + 1, 2) for dx in range(-search, search + 1, 2))
    e, dx, dy = min((err(bx + i, by + j), bx + i, by + j) for i in (-1, 0, 1) for j in (-1, 0, 1))   # 1 px refinement
    return dx, dy, float(e)


def alpha_of(im):
    """green-screen alpha 0..1 and the despilled colour"""
    g = im[..., 1] - np.maximum(im[..., 0], im[..., 2])
    out = im.copy(); out[..., 1] -= np.maximum(0, g)
    return np.clip(1 - (g - 40) / 80, 0, 1), out


def keyed(im):
    al, col = alpha_of(im)
    A = Image.fromarray((al * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.7))
    res = Image.fromarray(col.clip(0, 255).astype(np.uint8)).convert('RGBA'); res.putalpha(A); return res


def save(im, name):
    im.save(os.path.join(a.out, name), optimize=True); return name


def patch(src, dx, dy, shape, name, feather=6):
    cx, cy, rx, ry = shape
    x0, y0, x1, y1 = cx - rx - feather, cy - ry - feather, cx + rx + feather, cy + ry + feather
    m = np.clip((1.0 - ell(cx, cy, rx, ry)) * rx / feather + .5, 0, 1)[y0:y1, x0:x1]   # soft elliptical edge
    al, col = alpha_of(src[y0 + dy:y1 + dy, x0 + dx:x1 + dx])
    im = Image.fromarray(col.clip(0, 255).astype(np.uint8)).convert('RGBA'); im.putalpha(Image.fromarray((m * al * 255).astype(np.uint8)))
    return {'src': save(im, name + '.png'), 'at': [int(x0), int(y0)]}


A = rgb(a.anchor)
headmask = ell(*FACE) > 1.25            # align heads by hair, ears and outline, not by the changing face
frame = lambda n: os.path.join(a.frames, n)
man = {'format': 'motion-film-puppet/1', 'size': [S, S], 'foot': [S // 2, S], 'poses': {}, 'alias': {}, 'faces': {}, 'mouths': {}, 'quality': {}}
man['poses']['rest'] = {'src': save(keyed(A), 'pose-rest.png'), 'head': [0, 0]}
hx0, hy0, hx1, hy1 = HEAD[0] + 10, FACE[1] - FACE[3] - 10, HEAD[2] - 10, FACE[1] + FACE[3] + 40
for p in POSES:
    if not os.path.exists(frame(f'pose-{p}.png')): continue
    P = rgb(frame(f'pose-{p}.png')); dx, dy, e = offset(A, P, HEAD, 30, headmask)
    man['poses'][p] = {'src': save(keyed(P), f'pose-{p}.png'), 'head': [dx, dy]}; man['quality'][f'pose-{p}'] = round(e, 2)
    # hands over the face: pixels of this pose that differ strongly from the anchor inside the face area stay on top
    d = np.abs(P - A).max(-1)
    m = (d > 70) & (ell(*FACE) < 1.6)
    if p not in TOUCH: m &= (ell(*MOUTH) > 1.15) & (ell(*EYES) > 1.15)
    m[:hy0] = False; m[hy1:] = False; m[:, :hx0] = False; m[:, hx1:] = False
    if m.sum() < 150: continue
    mi = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(1.5))
    k = keyed(P); ka = np.asarray(k.getchannel('A')).astype(np.float32) * np.asarray(mi).astype(np.float32) / 255
    k.putalpha(Image.fromarray(ka.astype(np.uint8)))
    man['poses'][p]['over'] = {'src': save(k.crop((hx0, hy0, hx1, hy1)), f'over-{p}.png'), 'at': [hx0, hy0]}
for spec in a.alias:
    k, v = spec.split('=')
    if v not in man['poses']: sys.exit(f'alias {k}={v}: no pose {v}')
    man['alias'][k] = v
man['faces']['neutral'] = patch(A, 0, 0, FACE, 'face-neutral')
for f in FACES:
    if not os.path.exists(frame(f'face-{f}.png')): continue
    F = rgb(frame(f'face-{f}.png')); dx, dy, e = offset(A, F, HEAD, 24, headmask)
    man['faces'][f] = patch(F, dx, dy, FACE, f'face-{f}'); man['quality'][f'face-{f}'] = round(e, 2)
man['mouths']['x'] = patch(A, 0, 0, MOUTH, 'mouth-x')
for m in SHAPES:
    if not os.path.exists(frame(f'face-m-{m}.png')): continue
    F = rgb(frame(f'face-m-{m}.png')); dx, dy, e = offset(A, F, HEAD, 24, headmask)
    man['mouths'][m] = patch(F, dx, dy, MOUTH, f'mouth-{m}'); man['quality'][f'mouth-{m}'] = round(e, 2)
if os.path.exists(frame('face-blink.png')):
    F = rgb(frame('face-blink.png')); dx, dy, e = offset(A, F, HEAD, 24, headmask)
    man['blink'] = patch(F, dx, dy, EYES, 'eyes-closed'); man['quality']['blink'] = round(e, 2)
json.dump(man, open(os.path.join(a.out, 'puppet.json'), 'w'), indent=1)
missing = [p for p in POSES if p not in man['poses'] and p not in man['alias']]
for k, e in man['quality'].items(): print(f'{k:16s} error {e:6.2f}{"  ← regenerate" if e > 15 else ""}')
print(f'pack {a.out}: {len(man["poses"])} poses, {len(man["alias"])} aliases, {len(man["faces"])} faces, {len(man["mouths"])} mouths'
      + (f'; no picture for {", ".join(missing)} (drawn as the nearest pose)' if missing else ''))

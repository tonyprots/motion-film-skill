"""Build a cut-out puppet pack (lib/puppet.js) from generated frames on a flat green background.

  python3 scripts/puppet_pack.py --anchor anchor.png --frames gen/ --geom geom.json --out assets/puppets/<name> \
      [--alias chin=think]

Frames (all edits of the anchor: same character, framing and head; only arms or only the face changed):
  pose-<pose>.png    one per ACTOR pose (explain, point, listen, shrug, worry, welcome, hush, think, chin, scratch,
                     facepalm, cheer, wave); rest is the anchor itself
  face-<expr>.png    happy, worried, surprised, shocked, grimace, wink, sad, skeptic (neutral is the anchor)
  face-m-<shape>.png mouth shapes b c d e f (lib/lipsync.js); x (closed) is the anchor
  face-blink.png     both eyes closed
geom.json, in pixels of the 1024×1024 frame: head [x0,y0,x1,y1] (box used to align frames), face / mouth / eyes
[cx,cy,rx,ry] ellipses. A face is cut along the anchor's own face outline (skin inside the jaw and hairline, holes for
eyes and brows filled), not along the face ellipse: raised or wide brows stick out of any ellipse and leave the
anchor's brows showing beside them. Mouth and eyes are their ellipse inside that outline.
geom.json "outline": [[x,y], ...] — optional polygon of the face (hairline to chin) in anchor pixels, used instead of
the automatic outline when hair touches an eye or a beard or stubble covers the jaw: the automatic one then loses that
eye or the mouth, and the expression never reaches them.
geom.json "hands": {"<pose>": [[x,y], ...]} — for a pose whose hand lies on the face (facepalm, hush, chin), a polygon
around that hand in the pose frame's pixels. The pose picture inside it is put over the face layers. It is drawn by
hand on purpose: a palm is skin over skin and an image model redraws every line of the face a little, so a difference
with the anchor finds either no palm or the whole face. Leave a pose out if its hand stays off the face.
Writes PNGs + puppet.json and prints the alignment error per frame: above ~15 the frame moved the head or
redrew the character; regenerate it rather than ship a jumping head.
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

POSES = ['explain', 'point', 'listen', 'shrug', 'worry', 'welcome', 'hush', 'think', 'chin', 'scratch', 'facepalm', 'cheer', 'wave']
FACES = ['happy', 'worried', 'surprised', 'shocked', 'grimace', 'wink', 'sad', 'skeptic', 'angry', 'laugh']
SHAPES = ['b', 'c', 'd', 'e', 'f']
S = 1024

ap = argparse.ArgumentParser()
ap.add_argument('--anchor', required=True); ap.add_argument('--frames', required=True); ap.add_argument('--geom', required=True)
ap.add_argument('--out', required=True); ap.add_argument('--alias', action='append', default=[])
a = ap.parse_args()
G = json.load(open(a.geom))
HEAD, FACE, MOUTH, EYES = (tuple(G[k]) for k in ('head', 'face', 'mouth', 'eyes'))
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


def as_img(m):
    return Image.fromarray((m * 255).astype(np.uint8))


def flood(m, seeds):
    """pixels of m connected to any seed (4-neighbour)"""
    im = as_img(m).copy()   # an image made by fromarray shares the array and floodfill does not write into it
    for x, y in seeds:
        if im.getpixel((x, y)) == 255: ImageDraw.floodfill(im, (x, y), 128)
    return np.asarray(im) == 128


def fill_holes(m):
    pad = np.pad(m, 1)
    return m | ~flood(~pad, [(0, 0)])[1:-1, 1:-1]


def grow(m, px):
    return np.asarray(as_img(m).filter(ImageFilter.MaxFilter(2 * px + 1))) > 127


def shrink(m, px):
    return np.asarray(as_img(m).filter(ImageFilter.MinFilter(2 * px + 1))) > 127


def face_outline(A):
    """the anchor's face: the hand-drawn outline from geom.json, else warm light skin connected to the face centre
    inside the head box, holes filled"""
    if G.get('outline'):
        mi = Image.new('L', (S, S), 0); ImageDraw.Draw(mi).polygon([tuple(q) for q in G['outline']], fill=255)
        return np.asarray(mi) > 127
    r, g, b = A[..., 0], A[..., 1], A[..., 2]
    skin = (r > 150) & (r - b > 35) & (r > g) & (g > 80)
    box = np.zeros_like(skin); box[HEAD[1]:HEAD[3], HEAD[0]:HEAD[2]] = True
    face = fill_holes(flood(skin & box, [(FACE[0], FACE[1] + FACE[3] // 3)]))
    return shrink(face, 4)


def soft(m, feather=3):
    return np.asarray(as_img(m).filter(ImageFilter.GaussianBlur(feather))).astype(np.float32) / 255


def patch(src, dx, dy, area, name):
    """area: 0..1 mask in anchor pixels; src is sampled shifted by (dx, dy)"""
    ys, xs = np.nonzero(area > 0.01)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    m = area[y0:y1, x0:x1]
    al, col = alpha_of(src[y0 + dy:y1 + dy, x0 + dx:x1 + dx])
    im = Image.fromarray(col.clip(0, 255).astype(np.uint8)).convert('RGBA'); im.putalpha(Image.fromarray((m * al * 255).astype(np.uint8)))
    return {'src': save(im, name + '.png'), 'at': [int(x0), int(y0)]}


A = rgb(a.anchor)
headmask = ell(*FACE) > 1.25            # align heads by hair, ears and outline, not by the changing face
OUTLINE = face_outline(A)
oval = lambda shape: soft(OUTLINE & (ell(*shape) < 1), 2)
FACE_AREA, MOUTH_AREA, EYES_AREA = soft(OUTLINE), oval(MOUTH), oval(EYES)
frame = lambda n: os.path.join(a.frames, n)
man = {'format': 'motion-film-puppet/1', 'size': [S, S], 'foot': [S // 2, S], 'poses': {}, 'alias': {}, 'faces': {}, 'mouths': {}, 'quality': {}}
man['poses']['rest'] = {'src': save(keyed(A), 'pose-rest.png'), 'head': [0, 0]}
for p in POSES:
    if not os.path.exists(frame(f'pose-{p}.png')): continue
    P = rgb(frame(f'pose-{p}.png')); dx, dy, e = offset(A, P, HEAD, 30, headmask)
    man['poses'][p] = {'src': save(keyed(P), f'pose-{p}.png'), 'head': [dx, dy]}; man['quality'][f'pose-{p}'] = round(e, 2)
    # the hand on the face: the pose picture inside the polygon from geom.json, put over the face layers
    poly = G.get('hands', {}).get(p)
    if not poly: continue
    mi = Image.new('L', (S, S), 0); ImageDraw.Draw(mi).polygon([tuple(q) for q in poly], fill=255)
    mi = mi.filter(ImageFilter.GaussianBlur(1.5))
    k = keyed(P); ka = np.asarray(k.getchannel('A')).astype(np.float32) * np.asarray(mi).astype(np.float32) / 255
    k.putalpha(Image.fromarray(ka.astype(np.uint8)))
    xs, ys = [q[0] for q in poly], [q[1] for q in poly]
    bx0, by0, bx1, by1 = max(0, min(xs) - 4), max(0, min(ys) - 4), min(S, max(xs) + 4), min(S, max(ys) + 4)
    man['poses'][p]['over'] = {'src': save(k.crop((bx0, by0, bx1, by1)), f'over-{p}.png'), 'at': [bx0, by0]}
for k in G.get('hands', {}):
    if k not in man['poses']: sys.exit(f'geom.json hands: no pose {k}')
for spec in a.alias:
    k, v = spec.split('=')
    if v not in man['poses']: sys.exit(f'alias {k}={v}: no pose {v}')
    man['alias'][k] = v
man['faces']['neutral'] = patch(A, 0, 0, FACE_AREA, 'face-neutral')
for f in FACES:
    if not os.path.exists(frame(f'face-{f}.png')): continue
    F = rgb(frame(f'face-{f}.png')); dx, dy, e = offset(A, F, HEAD, 24, headmask)
    man['faces'][f] = patch(F, dx, dy, FACE_AREA, f'face-{f}'); man['quality'][f'face-{f}'] = round(e, 2)
man['mouths']['x'] = patch(A, 0, 0, MOUTH_AREA, 'mouth-x')
for m in SHAPES:
    if not os.path.exists(frame(f'face-m-{m}.png')): continue
    F = rgb(frame(f'face-m-{m}.png')); dx, dy, e = offset(A, F, HEAD, 24, headmask)
    man['mouths'][m] = patch(F, dx, dy, MOUTH_AREA, f'mouth-{m}'); man['quality'][f'mouth-{m}'] = round(e, 2)
if os.path.exists(frame('face-blink.png')):
    F = rgb(frame('face-blink.png')); dx, dy, e = offset(A, F, HEAD, 24, headmask)
    man['blink'] = patch(F, dx, dy, EYES_AREA, 'eyes-closed'); man['quality']['blink'] = round(e, 2)
json.dump(man, open(os.path.join(a.out, 'puppet.json'), 'w'), indent=1)
missing = [p for p in POSES if p not in man['poses'] and p not in man['alias']]
for k, e in man['quality'].items(): print(f'{k:16s} error {e:6.2f}{"  ← regenerate" if e > 15 else ""}')
print(f'pack {a.out}: {len(man["poses"])} poses, {len(man["alias"])} aliases, {len(man["faces"])} faces, {len(man["mouths"])} mouths'
      + (f'; no picture for {", ".join(missing)} (drawn as the nearest pose)' if missing else ''))

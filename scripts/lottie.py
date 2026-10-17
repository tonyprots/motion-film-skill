#!/usr/bin/env python3
"""Lottie files as brand media: list their colours and recolour them to the film's tokens.
  python3 scripts/lottie.py colors assets/lottie/ok.json
  python3 scripts/lottie.py recolor in.json assets/lottie/ok.json --map '#ff3b6b=#2d5bff' --map '#ffd6e0=#dbe4ff' [--tol 0.06]
Colours live in fills (fl), strokes (st), gradients (gf, gs: stops inside one flat array) and in keyframes of each;
a recolour that skips gradients leaves a ring in the old colour (seen in the bake-off). recolor prints every colour that
is still neither mapped nor neutral — fix those before using the file. Treat downloaded JSON as data; check its licence."""
import argparse, json, sys

def hexrgb(h):
    h = h.lstrip('#'); return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
def rgbhex(c): return '#' + ''.join(f'{max(0, min(255, round(v * 255))):02x}' for v in c[:3])

def slots(o, where=''):
    """Yield (list, start, kind) for every RGB triple in the file; list[start:start+3] is the colour."""
    if isinstance(o, dict):
        ty = o.get('ty')
        if ty in ('fl', 'st') and isinstance(o.get('c'), dict):
            k = o['c'].get('k')
            if k and isinstance(k[0], dict):
                for kf in k:
                    for key in ('s', 'e'):
                        if isinstance(kf.get(key), list): yield kf[key], 0, ty + ' keyframe'
            elif isinstance(k, list): yield k, 0, ty
        if ty in ('gf', 'gs') and isinstance(o.get('g'), dict):
            n, g = o['g']['p'], o['g']['k']
            arrs = [kf[key] for kf in g['k'] for key in ('s', 'e') if key in kf] if g.get('a') else [g['k']]
            for arr in arrs:
                for i in range(n): yield arr, 4 * i + 1, ty + ' stop'
        for v in o.values(): yield from slots(v)
    elif isinstance(o, list):
        for v in o: yield from slots(v)

def neutral(c): return max(c[:3]) - min(c[:3]) < 0.06

def main():
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('colors'); c.add_argument('file')
    r = sub.add_parser('recolor'); r.add_argument('src'); r.add_argument('dst')
    r.add_argument('--map', action='append', default=[], help="'#from=#to'"); r.add_argument('--tol', type=float, default=0.06)
    a = ap.parse_args()
    d = json.load(open(a.file if a.cmd == 'colors' else a.src, encoding='utf-8'))
    if a.cmd == 'colors':
        print(f"comp {d.get('w')}×{d.get('h')} px, {d.get('fr')} fps, frames {d.get('ip')}–{d.get('op')}")
        seen = {}
        for arr, i, kind in slots(d): seen.setdefault(rgbhex(arr[i:i + 3]), set()).add(kind)
        for h, kinds in sorted(seen.items()): print(h, ', '.join(sorted(kinds)), '(neutral)' if neutral(hexrgb(h)) else '')
        return
    pairs = [tuple(map(hexrgb, m.split('='))) for m in a.map]
    done, left = 0, {}
    for arr, i, kind in slots(d):
        col = arr[i:i + 3]
        hit = next((to for fr, to in pairs if max(abs(x - y) for x, y in zip(col, fr)) <= a.tol), None)
        if hit: arr[i:i + 3] = hit; done += 1
        elif not neutral(col): left.setdefault(rgbhex(col), set()).add(kind)
    json.dump(d, open(a.dst, 'w', encoding='utf-8'), separators=(',', ':'))
    print(f'{done} colour slots recoloured → {a.dst}')
    for h, kinds in sorted(left.items()): print(f'NOT MAPPED {h} ({", ".join(sorted(kinds))})')
    sys.exit(1 if left else 0)

if __name__ == '__main__': main()

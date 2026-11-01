"""Hershey glyph strokes -> engine/lib/hand-glyphs.js. Rebuild (only when a face or a character is added):
  Rscript scripts/hand_glyphs.R /tmp/hg.pdf && python3 scripts/hand_glyphs.py /tmp/hg.pdf engine/lib/hand-glyphs.js
The R script draws every character of every face into its own cell (R's built-in Hershey tables, vfont) and writes a
sidecar .tsv with each cell's origin and advance; this one reads the PDF's line segments back, assigns them to cells,
joins touching segments into pen strokes and normalises to cap height = 1, y down."""
import re, json, sys
pdf = open(sys.argv[1], 'rb').read().decode('latin-1')
streams = re.findall(r'stream\r?\n(.*?)endstream', pdf, re.S)
pages = [s for s in streams if ' m ' in s]
rows = [l.rstrip('\n').split('\t') for l in open(sys.argv[1][:-4] + '.tsv', encoding='utf-8')]
faces = ['script', 'cyr', 'sans']
assert len(pages) == 3, len(pages)
out = {}
for fi, f in enumerate(faces):
    cells = [(r[1], float(r[2]), float(r[3]), float(r[4]), float(r[5])) for r in rows if r[0] == f]
    hh = cells[0][4]
    segs = [tuple(map(float, m)) for m in re.findall(r'([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l', pages[fi])]
    G = {c[0]: {'w': round(c[3] / hh, 3), 's': []} for c in cells}
    last = {}
    for x1, y1, x2, y2 in segs:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ch, x0, y0, adv, _ = min(cells, key=lambda c: (mx - (c[1] + c[3] / 2)) ** 2 + (my - (c[2] + hh / 2)) ** 2)
        pt = lambda x, y: [round((x - x0) / hh, 3), round(-(y - y0) / hh, 3)]
        S = G[ch]['s']
        if last.get(ch) and abs(last[ch][0] - x1) < 0.02 and abs(last[ch][1] - y1) < 0.02: S[-1] += pt(x2, y2)
        else: S.append(pt(x1, y1) + pt(x2, y2))
        last[ch] = (x2, y2)
    out[f] = G
    print(f, len(G), 'glyphs', sum(len(g['s']) for g in G.values()), 'strokes', [c for c, g in G.items() if not g['s']])
js = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
HEAD = """// Single-stroke glyphs for HAND (lib/hand.js): A. V. Hershey's vector fonts (U.S. National Bureau of Standards, 1967),
// faces script (Latin cursive), cyr (Complex Cyrillic, oblique), sans (Simplex Roman). Extracted from R's built-in
// Hershey tables by scripts/hand_glyphs.R + hand_glyphs.py; see NOTICE-hershey. Units: cap height = 1, y down, origin
// on the baseline at the pen's start; w = advance; s = strokes in pen order, each a flat [x0, y0, x1, y1, …].
"""
open(sys.argv[2], 'w').write(HEAD + 'window.HAND_GLYPHS = ' + js + ';\n')
print(len(js.encode()), 'bytes')

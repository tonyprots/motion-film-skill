"""Tile stills into one review sheet: tile.py <out.jpg> <cols> <width> <png...>"""
import sys
from PIL import Image, ImageDraw
out, cols, tw, files = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4:]
ims = [Image.open(f).convert('RGB') for f in files]
th = int(tw * ims[0].height / ims[0].width)
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * (tw + 8) + 8, rows * (th + 8) + 8), (40, 40, 40))
d = ImageDraw.Draw(S)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = 8 + (i % cols) * (tw + 8), 8 + (i // cols) * (th + 8)
    S.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
    d.rectangle([x, y, x + 90, y + 22], fill=(0, 0, 0)); d.text((x + 4, y + 5), f.rsplit('/', 1)[-1][:-4], fill=(255, 255, 255))
S.save(out, quality=86)

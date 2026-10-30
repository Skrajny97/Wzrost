"""Puts every frame of a walk from PixelLab (tools/animate-walks.mjs) on its
start frame's colours: each pixel takes the nearest colour of the start
frame (in Lab, so a grey speck becomes the cloth or skin it sits on), as
PixelLab adds colours of its own in a few frames (the author: "wszedzie sie
przebijają szare piksele okazjonalne"). Needs Python 3 and Pillow:
  python3 tools/walk-palette.py START FRAME [FRAME...]
Each frame is saved next to itself as <frame>-clean.png."""
import sys
from PIL import Image, ImageCms

start, frames = sys.argv[1], sys.argv[2:]
srgb = ImageCms.createProfile('sRGB')
lab = ImageCms.createProfile('LAB')
to_lab = ImageCms.buildTransform(srgb, lab, 'RGB', 'LAB')


def lab_of(colours):
    strip = Image.new('RGB', (len(colours), 1))
    strip.putdata(colours)
    return list(ImageCms.applyTransform(strip, to_lab).get_flattened_data())


im = Image.open(start).convert('RGBA')
palette = sorted({p[:3] for p in im.get_flattened_data() if p[3] == 255})
palette_lab = lab_of(palette)
for frame in frames:
    im = Image.open(frame).convert('RGBA')
    pixels = list(im.get_flattened_data())
    colours = sorted({p[:3] for p in pixels if p[3] == 255})
    nearest = {}
    for colour, (l, a, b) in zip(colours, lab_of(colours)):
        best = min(range(len(palette)), key=lambda i: (palette_lab[i][0] - l) ** 2 + (palette_lab[i][1] - a) ** 2 + (palette_lab[i][2] - b) ** 2)
        nearest[colour] = palette[best]
    changed = sum(1 for p in pixels if p[3] == 255 and nearest[p[:3]] != p[:3])
    im.putdata([(*nearest[p[:3]], 255) if p[3] == 255 else (0, 0, 0, 0) for p in pixels])
    im.save(frame[:-4] + '-clean.png')
    print(frame.rsplit('/', 1)[-1], 'changed', changed)

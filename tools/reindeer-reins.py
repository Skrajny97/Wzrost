# Usage: python3 tools/reindeer-reins.py <trot sheet in> <trot sheet out>, run once on the sheet that
# tools/mount-trots.py writes (src/client/art/scenes/mounts/reindeer.png).
# The reindeer's reins up to the rider's hands, as the horses' (the author,
# 17.11.2026: „te paski muszą być dostosowane do każdego wierzchowca”): in
# each frame of the trot sheet a strap two pixels thick from the bit by the
# mouth to the point the riders' hands hold, the seat of the frame moved
# (21, -8). Writes the sheet given.
import json, sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
walk = json.load(open('data/animations.json'))['walk']
t = walk['mounts']['reindeer']
sheet = Image.open(src).convert('RGBA'); px = sheet.load()
W = t['width']
BITS = [(132, 61), (132, 60), (132, 58), (132, 60), (132, 62), (132, 61), (132, 58), (132, 60)]
BROWN, DARK = (0x5f, 0x36, 0x22, 255), (0x08, 0x00, 0x00, 255)
def line(x0, y0, x1, y1):
    dx, dy = abs(x1 - x0), -abs(y1 - y0); sx = 1 if x0 < x1 else -1; sy = 1 if y0 < y1 else -1; err = dx + dy
    while True:
        yield x0, y0
        if (x0, y0) == (x1, y1): return
        e2 = 2 * err
        if e2 >= dy: err += dy; x0 += sx
        if e2 <= dx: err += dx; y0 += sy
for f in range(t['frames']):
    sx, sy = t['seats'][f]
    hx, hy = sx + 21, sy - 8
    bx, by = BITS[f]
    for x, y in line(hx, hy, bx - 1, by):
        px[f * W + x, y + 1] = DARK
        px[f * W + x, y] = BROWN
sheet.save(out)
print('ok', out)

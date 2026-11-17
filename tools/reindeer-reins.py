# Usage: python3 tools/reindeer-reins.py [--check OUT_DIR]
#
# The reindeer's reins (the author, 17.11.2026: „te paski muszą być
# dostosowane do każdego wierzchowca” and „jeden sznur wodzy na reniferze
# wisi w powietrzu”) as a layer of their own over its trot and under the
# rider (scenes.js ride; walk.mounts.reindeer.reins in data/animations.json).
# Its neck is low and far ahead, so the reins the riders hold for the horses
# end in the air over it; each picture here is a sheet as wide and high as
# the trot's, clear but for the reins:
#
# - reins.file: the reins most riders hold, a strap two pixels thick in each
#   frame from the bit by the mouth (reins.bits, one for each frame) to where
#   the hands are, the frame's seat moved by reins.hands; drawn on the
#   sheet's own pixels, so it grows with the reindeer's scale as the trot.
# - next to it, <file without .png>-<look>.png for each rider in
#   reins.riders that holds reins of its own: their ends (x, y in the
#   rider's own picture, its box in walk.rider) each get a strap from the
#   bit, in the colours of that end, drawn on the screen's pixels (the
#   sheet's size times its scale, the size the scene shows it at) where the
#   rider stands in each frame, so the straps meet the rider's to the pixel.
#
# Writes the pictures under src/client/; with --check, the trot with the
# reins and each rider over them, frame by frame, into OUT_DIR.
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIENT = os.path.join(ROOT, 'src', 'client')
BROWN, DARK = (0x5f, 0x36, 0x22, 255), (0x08, 0x00, 0x00, 255)


def line(x0, y0, x1, y1):
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        yield x0, y0
        if (x0, y0) == (x1, y1):
            return
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def strand_end(rider, x, y):
    # The column of the rider's strand at its end: its top and the colours of
    # its top and bottom pixel (at most two of them), or one when it is thin.
    px = rider.load()
    opaque = lambda yy: 0 <= yy < rider.height and px[x, yy][3] > 0
    top = y
    while opaque(top - 1) and y - top < 2:
        top -= 1
    bottom = y
    while opaque(bottom + 1) and bottom - top < 2:
        bottom += 1
    if bottom - top >= 1:
        return top, [px[x, top], px[x, top + 1]]
    return top, [px[x, top]]


def main():
    walk = json.load(open(os.path.join(ROOT, 'data', 'animations.json'), encoding='utf8'))['walk']
    trot = walk['mounts']['reindeer']
    reins = trot['reins']
    w, h, frames, scale = trot['width'], trot['height'], trot['frames'], trot.get('scale', 1)
    # The scene shows the sheet at these many pixels (scenes.js ride).
    ws, hs = round(w * scale), round(h * scale)
    sx_scale, sy_scale = ws / w, hs / h

    # The reins most riders hold, on the sheet's own pixels.
    common = Image.new('RGBA', (w * frames, h), (0, 0, 0, 0))
    px = common.load()
    for f in range(frames):
        seat_x, seat_y = trot['seats'][f]
        bit_x, bit_y = reins['bits'][f]
        for x, y in line(seat_x + reins['hands'][0], seat_y + reins['hands'][1], bit_x, bit_y):
            px[f * w + x, y + 1] = DARK
            px[f * w + x, y] = BROWN
    out = os.path.join(CLIENT, reins['file'])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    common.save(out, optimize=True)
    written = [reins['file']]

    # The riders' own reins, on the screen's pixels.
    large = walk['rider'].get('large', {})
    for look, ends in reins['riders'].items():
        box = large if look in large.get('ids', []) else walk['rider']
        seat_x, seat_y = box['seat']
        nudge_x, nudge_y = walk['rider'].get('nudge', {}).get(look, {}).get('reindeer', [0, 0])
        rider = Image.open(os.path.join(CLIENT, 'art', 'riders', look + '.png')).convert('RGBA')
        sheet = Image.new('RGBA', (ws * frames, hs), (0, 0, 0, 0))
        spx = sheet.load()
        for f in range(frames):
            fx, fy = round(trot['seats'][f][0] * scale), round(trot['seats'][f][1] * scale)
            left, top = fx - seat_x + nudge_x, fy - seat_y + nudge_y
            # The bit: the pixel of the common reins' end as the scene shows it.
            bx, by = reins['bits'][f]
            bit = (int((bx + 0.5) * sx_scale), int((by + 0.5) * sy_scale))
            for end_x, end_y in ends:
                end_top, colours = strand_end(rider, end_x, end_y)
                start = (left + end_x, top + end_top)
                for x, y in line(start[0], start[1], bit[0], bit[1]):
                    if not (0 <= x < ws and 0 <= y < hs - 1):
                        continue
                    for k, colour in enumerate(colours):
                        spx[f * ws + x, y + k] = colour
        name = reins['file'][:-4] + '-' + look + '.png'
        sheet.save(os.path.join(CLIENT, name), optimize=True)
        written.append(name)

    if '--check' in sys.argv:
        check(walk, trot, reins, sys.argv[sys.argv.index('--check') + 1])
    print(len(written), 'pictures:', ', '.join(written[:3]), '...')


def check(walk, trot, reins, out_dir):
    # Each rider of reins.riders (and one that holds none of its own) on the
    # trot with its reins, the eight frames in a row, twice as big.
    os.makedirs(out_dir, exist_ok=True)
    w, h, frames, scale = trot['width'], trot['height'], trot['frames'], trot.get('scale', 1)
    ws, hs = round(w * scale), round(h * scale)
    sheet = Image.open(os.path.join(CLIENT, trot['file'])).convert('RGBA').resize((ws * frames, hs), Image.NEAREST)
    large = walk['rider'].get('large', {})
    for look in list(reins['riders']) + ['warrior-female']:
        box = large if look in large.get('ids', []) else walk['rider']
        own = look in reins['riders']
        layer = Image.open(os.path.join(CLIENT, reins['file'][:-4] + '-' + look + '.png' if own else reins['file'])).convert('RGBA').resize((ws * frames, hs), Image.NEAREST)
        rider = Image.open(os.path.join(CLIENT, 'art', 'riders', look + '.png')).convert('RGBA')
        nudge_x, nudge_y = walk['rider'].get('nudge', {}).get(look, {}).get('reindeer', [0, 0])
        row = Image.new('RGBA', (ws * frames, hs + 40), (226, 222, 212, 255))
        for f in range(frames):
            frame = Image.new('RGBA', (ws, hs + 40), (226, 222, 212, 255))
            frame.alpha_composite(sheet.crop((f * ws, 0, (f + 1) * ws, hs)), (0, 40))
            frame.alpha_composite(layer.crop((f * ws, 0, (f + 1) * ws, hs)), (0, 40))
            fx, fy = round(trot['seats'][f][0] * scale), round(trot['seats'][f][1] * scale)
            frame.alpha_composite(rider, (fx - box['seat'][0] + nudge_x, 40 + fy - box['seat'][1] + nudge_y))
            row.alpha_composite(frame, (f * ws, 0))
        row.resize((row.width * 2, row.height * 2), Image.NEAREST).save(os.path.join(out_dir, look + '.png'))


if __name__ == '__main__':
    main()

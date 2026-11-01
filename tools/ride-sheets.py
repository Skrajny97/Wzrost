"""Puts a rider in the saddle of each frame of a mount's trot.

The mount's trot (tools/animate-mounts.mjs) moves the saddle up and down
and a little sideways. The seat in the first frame is given by hand per
mount (`seat` in art/mounts.json: x, y of the saddle's lowest point in the
start frame); in every other frame it is found by sliding the saddle's
patch of the first frame over the frame (the place where the colours
differ least). The rider (one picture, art/references/riders/skeleton.json
gives the point it sits on) goes on that place, and the near leg covers the
mount's flank, as it should.

    python3 -I tools/ride-sheets.py MOUNT_DIR RIDER.png OUT.png [--seat X,Y] [--seat-of mounts.json:id]

MOUNT_DIR holds the trot's frames as PNGs, sorted by name (frame 1 first).
OUT.png is a sheet of the frames side by side. Prints the seat per frame.
"""

import json
import sys
from pathlib import Path

from PIL import Image

PATCH = (14, 8)   # half width and half height of the saddle's patch
SEARCH = (5, 8)   # how far the saddle can move between frames


def load_frames(folder):
    files = sorted(Path(folder).glob('*.png'), key=lambda p: int(p.stem.rsplit('-', 1)[-1]) if p.stem.rsplit('-', 1)[-1].isdigit() else p.stem)
    return [Image.open(f).convert('RGBA') for f in files]


def patch(image, cx, cy):
    hx, hy = PATCH
    return image.crop((cx - hx, cy - hy, cx + hx, cy + hy)).load(), 2 * hx, 2 * hy


def difference(a, b, w, h):
    total = 0
    for y in range(h):
        for x in range(w):
            pa, pb = a[x, y], b[x, y]
            if pa[3] < 128 and pb[3] < 128:
                continue
            if (pa[3] < 128) != (pb[3] < 128):
                total += 300
                continue
            total += abs(pa[0] - pb[0]) + abs(pa[1] - pb[1]) + abs(pa[2] - pb[2])
    return total


def seats(frames, seat):
    sx, sy = seat
    # The patch sits just above the seat: the saddle and the back under it.
    cx, cy = sx, sy - 2
    reference, w, h = patch(frames[0], cx, cy)
    found = [(sx, sy)]
    for frame in frames[1:]:
        best = None
        for dy in range(-SEARCH[1], SEARCH[1] + 1):
            for dx in range(-SEARCH[0], SEARCH[0] + 1):
                candidate, _, _ = patch(frame, cx + dx, cy + dy)
                score = difference(reference, candidate, w, h)
                if best is None or score < best[0]:
                    best = (score, dx, dy)
        found.append((sx + best[1], sy + best[2]))
    return found


def main():
    folder, rider_file, out = sys.argv[1], sys.argv[2], sys.argv[3]
    args = sys.argv[4:]
    seat = None
    if '--seat' in args:
        seat = tuple(int(v) for v in args[args.index('--seat') + 1].split(','))
    elif '--seat-of' in args:
        path, mount = args[args.index('--seat-of') + 1].split(':')
        seat = tuple(json.loads(Path(path).read_text())['mounts'][mount]['seat'])
    frames = load_frames(folder)
    rider = Image.open(rider_file).convert('RGBA')
    anchor = json.loads(Path('art/references/riders/skeleton.json').read_text())['seat']
    places = seats(frames, seat)
    w, h = frames[0].size
    # Room above the mount for the rider's head.
    top = max(0, anchor[1] - min(y for _, y in places) + 4)
    sheet = Image.new('RGBA', (w * len(frames), h + top), (0, 0, 0, 0))
    for index, (frame, (x, y)) in enumerate(zip(frames, places)):
        cell = Image.new('RGBA', (w, h + top), (0, 0, 0, 0))
        cell.alpha_composite(frame, (0, top))
        cell.alpha_composite(rider, (x - anchor[0], y + top - anchor[1]))
        sheet.alpha_composite(cell, (index * w, 0))
    sheet.save(out)
    print(json.dumps({'frame': [w, h + top], 'seats': places, 'top': top}))


if __name__ == '__main__':
    main()

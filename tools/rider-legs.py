"""Takes the far leg off each rider (the author: "ma znikać noga, która jest
z drugiego boku wierzcha, ma być widoczna tylko jedna przednia").

Retro Diffusion drew the riders as if squatting, both legs showing, in the
three-quarter view of all the game's figures: facing right, the chest
turned a little towards the viewer. In that view the near leg (on the
viewer's side of the mount) is the one further back, on the left, and the
far one sticks out in front of it, to the right, with its knee, shin and
foot a little higher. On a mount the far leg hangs on the other side and
the mount's body hides it, so it goes: tools/rider-legs.json gives, rider
by rider, the polygons (x, y of pixel corners) that hold it, drawn by hand
on the pictures enlarged. A pixel goes when its centre lies inside one,
unless the rider's "keep" lists it (reins drawn across the far knee); the
entry is then {"cut": [polygons], "keep": [[x, y], ...]}. Then:
- the near leg's side, where the far leg touched it, gets the rider's
  outline colour, unless it is dark already;
- specks the cut left behind, cut off from the figure, go too.

    python3 -I tools/rider-legs.py tools/rider-legs.json DRAWN_DIR OUT_DIR [--check SHEET.png] [--ids a,b]

DRAWN_DIR holds the riders as drawn (both legs); the skin tones are made
after, from OUT_DIR (tools/rider-tones.py). --check draws a sheet of each
rider as drawn, with what goes in red, and after.
"""
import json
import sys
from collections import Counter, deque

from PIL import Image, ImageDraw


def lum(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def inside(px, py, poly):
    hit = False
    j = len(poly) - 1
    for i in range(len(poly)):
        (xi, yi), (xj, yj) = poly[i], poly[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def outline_colour(im):
    px = im.load()
    W, H = im.size
    edge = Counter()
    for y in range(H):
        for x in range(W):
            if px[x, y][3] < 128:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < W and 0 <= ny < H) or px[nx, ny][3] < 128:
                    edge[px[x, y][:3]] += 1
                    break
    darkest = sorted(edge, key=lum)[: max(1, len(edge) // 8)]
    return max(darkest, key=lambda c: edge[c])


def cut(im, entry):
    polygons, keep = (entry['cut'], {tuple(p) for p in entry.get('keep', [])}) if isinstance(entry, dict) else (entry, set())
    im = im.copy()
    px = im.load()
    W, H = im.size
    outline = outline_colour(im)
    cleared = set()
    for y in range(H):
        for x in range(W):
            if px[x, y][3] and (x, y) not in keep and any(inside(x + 0.5, y + 0.5, poly) for poly in polygons):
                cleared.add((x, y))
                px[x, y] = (0, 0, 0, 0)
    for (x, y) in cleared:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if 0 <= q[0] < W and 0 <= q[1] < H and q not in cleared and q not in keep and px[q][3] >= 128 and lum(px[q][:3]) > lum(outline) + 28:
                px[q] = (*outline, 255)
    seen, parts = set(), []
    for y in range(H):
        for x in range(W):
            if px[x, y][3] and (x, y) not in seen:
                part, todo = [], deque([(x, y)])
                seen.add((x, y))
                while todo:
                    cx, cy = todo.popleft()
                    part.append((cx, cy))
                    for ddx in (-1, 0, 1):
                        for ddy in (-1, 0, 1):
                            n = (cx + ddx, cy + ddy)
                            if 0 <= n[0] < W and 0 <= n[1] < H and n not in seen and px[n][3]:
                                seen.add(n)
                                todo.append(n)
                parts.append(part)
    parts.sort(key=len, reverse=True)
    for part in parts[1:]:
        if len(part) < 12:
            for p in part:
                px[p] = (0, 0, 0, 0)
    return im, cleared


def check_sheet(rows, out):
    s, crop = 5, (12, 44, 62, 96)
    cw, ch = (crop[2] - crop[0]) * s, (crop[3] - crop[1]) * s
    sheet = Image.new('RGBA', (3 * (cw + 8) + 160, len(rows) * (ch + 8)), (88, 100, 84, 255))
    d = ImageDraw.Draw(sheet)
    for r, (name, drawn, cleared, after) in enumerate(rows):
        marked = drawn.copy()
        mp = marked.load()
        for (x, y) in cleared:
            c = mp[x, y]
            mp[x, y] = ((c[0] + 3 * 255) // 4, c[1] // 4, c[2] // 4, 255)
        for c, im in enumerate((drawn, marked, after)):
            big = im.crop(crop).resize((cw, ch), Image.NEAREST)
            sheet.alpha_composite(big, (160 + c * (cw + 8), r * (ch + 8)))
        d.text((6, r * (ch + 8) + ch // 2), name, fill=(255, 245, 215, 255))
    sheet.save(out)


def main():
    cuts = json.load(open(sys.argv[1], encoding='utf8'))
    cuts.pop('$comment', None)
    src_dir, out_dir = sys.argv[2], sys.argv[3]
    args = sys.argv[4:]
    ids = args[args.index('--ids') + 1].split(',') if '--ids' in args else sorted(cuts)
    rows = []
    for name in ids:
        drawn = Image.open(f'{src_dir}/{name}.png').convert('RGBA')
        after, cleared = cut(drawn, cuts[name])
        after.save(f'{out_dir}/{name}.png')
        rows.append((name, drawn, cleared, after))
    if '--check' in args:
        check_sheet(rows, args[args.index('--check') + 1])
    print('done', len(rows))


if __name__ == '__main__':
    main()

"""Clean grey specks off a walk sheet's outline (companion walks, 5.11.2026).

Some frames from PixelLab have a lighter outline here and there; the palette
step (tools/walk-palette.py) turns those pixels into the nearest colour of the
start frame, a grey of the axe or the chainmail, so grey specks flicker along
the figure's edge. Here every grey pixel on the edge (touching transparency)
outside the grey material (the axe head, the chainmail: grey areas of at least
MIN_MATERIAL pixels) becomes the outline colour, or goes when the outline is
already there beside it. Only palette indices change.

usage: python3 -I tools/walk-outline.py <sheet.png> <out.png> [frame width]
"""
import sys
from collections import deque
from PIL import Image

MIN_MATERIAL = 25


def lum(rgb):
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def main(src, out, fw=128):
    im = Image.open(src)
    assert im.mode == 'P', im.mode
    pal = im.getpalette()
    colours = [tuple(pal[i * 3:i * 3 + 3]) for i in range(len(pal) // 3)]
    trans = im.info.get('transparency', 0)
    if isinstance(trans, bytes):
        trans = [i for i, a in enumerate(trans) if a == 0][0]
    used = set(im.get_flattened_data()) if hasattr(im, "get_flattened_data") else set(im.getdata())
    grey = {i for i in used if i != trans and max(colours[i]) - min(colours[i]) <= 30 and lum(colours[i]) >= 60}
    dark_ids = sorted((i for i in used if i != trans and lum(colours[i]) < 12), key=lambda i: lum(colours[i]))
    outline = dark_ids[0]
    dark = set(dark_ids)
    W, H = im.size
    px = im.load()
    changed = 0
    for f in range(W // fw):
        x0 = f * fw
        inside = lambda x, y: x0 <= x < x0 + fw and 0 <= y < H
        # Grey material: connected grey areas of MIN_MATERIAL pixels or more.
        seen = set()
        material = set()
        for y in range(H):
            for x in range(x0, x0 + fw):
                if px[x, y] in grey and (x, y) not in seen:
                    comp = []
                    queue = deque([(x, y)])
                    seen.add((x, y))
                    while queue:
                        a, b = queue.popleft()
                        comp.append((a, b))
                        for dx in (-1, 0, 1):
                            for dy in (-1, 0, 1):
                                c, d = a + dx, b + dy
                                if inside(c, d) and (c, d) not in seen and px[c, d] in grey:
                                    seen.add((c, d))
                                    queue.append((c, d))
                    if len(comp) >= MIN_MATERIAL:
                        material.update(comp)
        for _ in range(3):
            edge = set()
            for y in range(H):
                for x in range(x0, x0 + fw):
                    if px[x, y] in grey and (x, y) not in material:
                        if any(not inside(x + dx, y + dy) or px[x + dx, y + dy] == trans for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                            edge.add((x, y))
            if not edge:
                break
            plan = {}
            for x, y in edge:
                around = [px[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                          if inside(x + dx, y + dy) and px[x + dx, y + dy] != trans and (x + dx, y + dy) not in edge]
                plan[(x, y)] = trans if around and all(i in dark for i in around) else outline
            for (x, y), i in plan.items():
                px[x, y] = i
                changed += 1
            # A pixel taken away between two outline pixels leaves a notch
            # in the outline: it takes the outline colour instead.
            for (x, y), i in plan.items():
                if i == trans:
                    across = [(px[x - 1, y], px[x + 1, y]) if inside(x - 1, y) and inside(x + 1, y) else (None, None),
                              (px[x, y - 1], px[x, y + 1]) if inside(x, y - 1) and inside(x, y + 1) else (None, None)]
                    if any(a in dark and b in dark for a, b in across):
                        px[x, y] = outline
    im.save(out, transparency=trans)
    print(f'{src}: {changed} pixels changed')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 128)

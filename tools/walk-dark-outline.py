"""A black outline all round a walk sheet's figure, as on its start frame
(657 B, 5.11.2026). Run after tools/walk-outline.py.

The start frames (art/references/walks/start/companion-*.png) have a black
outline all round; PixelLab draws it lighter here and there in the walk
(brown on the boots, light on a bow's limb, the skin of a face), so the edge
flickers from frame to frame. In every frame an edge pixel (one with a
transparent 4-neighbour) with luminance of at least LIGHT that lies on the
solid body (across from a transparent side there is an opaque pixel with at
least SOLID opaque pixels among the 24 around it) takes the darkest outline
colour, or goes when the outline is already beside it (a light halo outside
the black line). A pixel taken away between two outline pixels takes the
outline colour instead, so the line keeps no notch. Light pixels in the air
(a bowstring, a feather) have nothing solid behind them and stay.

--grey-below Y: neutral grey pixels (spread at most 16, luminance at least
45) under row Y of every frame take the most common body colour around them,
round after round until none is left beside the body, for a figure whose
start frame has grey only above that row (the cleric's hair and beard), so a
grey streak between the robe and the staff goes. A second run of the tool
changes nothing.

Only palette indices change; the palette and the transparent index stay.

usage: python3 -I tools/walk-dark-outline.py <sheet.png> <out.png> [--grey-below Y] [frame width]
"""
import sys
from collections import Counter
from PIL import Image

LIGHT = 45
SOLID = 12
DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))
AROUND = [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy]


def lum(rgb):
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def main(argv):
    args = list(argv)
    below = None
    if '--grey-below' in args:
        at = args.index('--grey-below')
        below = int(args[at + 1])
        del args[at:at + 2]
    src, out = args[0], args[1]
    fw = int(args[2]) if len(args) > 2 else 128
    im = Image.open(src)
    assert im.mode == 'P', im.mode
    pal = im.getpalette()
    colours = [tuple(pal[i * 3:i * 3 + 3]) for i in range(len(pal) // 3)]
    trans = im.info.get('transparency', 0)
    if isinstance(trans, bytes):
        trans = [i for i, a in enumerate(trans) if a == 0][0]
    px = im.load()
    W, H = im.size
    used = {px[x, y] for y in range(H) for x in range(W)}
    dark_ids = sorted((i for i in used if i != trans and lum(colours[i]) < 14), key=lambda i: lum(colours[i]))
    outline, dark = dark_ids[0], set(dark_ids)
    light = {i for i in used if i != trans and lum(colours[i]) >= LIGHT}
    grey = {i for i in used if i != trans and max(colours[i]) - min(colours[i]) <= 16 and lum(colours[i]) >= LIGHT}
    counts = []
    for f in range(W // fw):
        x0 = f * fw
        inside = lambda x, y: x0 <= x < x0 + fw and 0 <= y < H
        get = lambda x, y: px[x, y] if inside(x, y) else trans
        changed = 0
        # Again and again until no grey is left beside the body: a streak two
        # pixels wide loses its inner pixels only once their neighbours have
        # taken the body's colour.
        while below is not None:
            plan = {}
            for y in range(below, H):
                for x in range(x0, x0 + fw):
                    if px[x, y] in grey:
                        body = Counter(get(x + dx, y + dy) for dx, dy in AROUND
                                       if get(x + dx, y + dy) not in (trans, *grey) and get(x + dx, y + dy) not in dark)
                        if body:
                            plan[(x, y)] = body.most_common(1)[0][0]
            if not plan:
                break
            for (x, y), i in plan.items():
                px[x, y] = i
            changed += len(plan)

        def solid(x, y):
            return get(x, y) != trans and sum(get(x + dx, y + dy) != trans for dx in range(-2, 3) for dy in range(-2, 3) if dx or dy) >= SOLID

        plan = set()
        for y in range(H):
            for x in range(x0, x0 + fw):
                if px[x, y] in light and any(get(x + dx, y + dy) == trans for dx, dy in DIRS):
                    if any(get(x + dx, y + dy) == trans and solid(x - dx, y - dy) for dx, dy in DIRS):
                        plan.add((x, y))
        final = {}
        for x, y in plan:
            around = [get(x + dx, y + dy) for dx, dy in DIRS if get(x + dx, y + dy) != trans and (x + dx, y + dy) not in plan]
            final[(x, y)] = trans if around and all(i in dark for i in around) else outline
        for (x, y), i in final.items():
            px[x, y] = i
        for (x, y), i in final.items():
            if i == trans:
                pairs = ((get(x - 1, y), get(x + 1, y)), (get(x, y - 1), get(x, y + 1)))
                if any(a in dark and b in dark for a, b in pairs):
                    px[x, y] = outline
        changed += len(final)
        counts.append(changed)
    im.save(out, transparency=trans)
    print(f'{src}: {sum(counts)} pixels changed {counts}')


if __name__ == '__main__':
    main(sys.argv[1:])

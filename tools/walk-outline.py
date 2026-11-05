"""Clean grey noise off a walk sheet's outline, frame by frame (5.11.2026).

The start frames (art/references/walks/start/companion-*.png) have a
near-black outline; grey belongs only to things such as blades, chainmail,
a cowl, white hair or a beard. PixelLab draws the outline lighter here and
there, and the palette step (tools/walk-palette.py) turns those pixels into
a neutral grey of the start frame, so grey specks and runs flicker along
the figure's edge from frame to frame.

In every frame the grey pixels (spread of the channels at most SPREAD,
luminance at least LUM) form 8-connected runs. A run is noise when
- at least EDGE_SHARE of it lies on the figure's edge (it has a transparent
  4-neighbour): an outline drawn grey, one or two pixels thick, while
  blades, chainmail, cowls and hair keep most of their pixels inside; and
- at least BODY_SHARE of it lies on the solid body ("leans"): across from a
  transparent side there is the body, or one grey or outline pixel and then
  the body. Solid body means opaque, not grey, with at least SOLID opaque
  pixels among the 24 around it, so a bowstring or a haft in the air, even
  two pixels thick, stays.
In a noise run an edge pixel that leans becomes the darkest outline colour,
or goes when the outline is already beside it (a grey halo outside the black
line); an edge pixel that does not lean but touches the outline is a step of
the outline and becomes outline too; an inner pixel takes the most common
body colour around it. A pixel taken away between two outline pixels takes
the outline colour instead, so the line keeps no notch. Only palette indices
change; the palette and the transparent index stay.

usage: python3 -I tools/walk-outline.py <sheet.png> <out.png> [frame width]
"""
import sys
from collections import Counter, deque
from PIL import Image

SPREAD = 16
LUM = 45
EDGE_SHARE = 0.6
BODY_SHARE = 0.5
SOLID = 12
DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))
AROUND = [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy]


def lum(rgb):
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def clean_frame(px, x0, fw, H, trans, grey, dark, outline):
    inside = lambda x, y: x0 <= x < x0 + fw and 0 <= y < H
    at = lambda x, y: px[x, y] if inside(x, y) else trans
    on_edge = lambda x, y: any(at(x + dx, y + dy) == trans for dx, dy in DIRS)
    is_body = lambda i: i != trans and i not in grey

    def solid(x, y):
        return is_body(at(x, y)) and sum(
            at(x + dx, y + dy) != trans for dx in range(-2, 3) for dy in range(-2, 3) if dx or dy) >= SOLID

    def leans(x, y):
        if not on_edge(x, y):
            return any(solid(x + dx, y + dy) for dx, dy in DIRS)
        for dx, dy in DIRS:
            if at(x + dx, y + dy) == trans:
                one = at(x - dx, y - dy)
                if solid(x - dx, y - dy) or ((one in grey or one in dark) and solid(x - 2 * dx, y - 2 * dy)):
                    return True
        return False

    seen, noise = set(), set()
    for y in range(H):
        for x in range(x0, x0 + fw):
            if px[x, y] in grey and (x, y) not in seen:
                run, queue = [], deque([(x, y)])
                seen.add((x, y))
                while queue:
                    a, b = queue.popleft()
                    run.append((a, b))
                    for dx, dy in AROUND:
                        c, d = a + dx, b + dy
                        if inside(c, d) and (c, d) not in seen and px[c, d] in grey:
                            seen.add((c, d))
                            queue.append((c, d))
                if sum(on_edge(*p) for p in run) >= EDGE_SHARE * len(run) and \
                        sum(leans(*p) for p in run) >= BODY_SHARE * len(run):
                    noise.update(run)

    plan = {}
    for x, y in noise:
        if on_edge(x, y):
            if leans(x, y):
                plan[(x, y)] = 'outline'
        else:
            body = Counter(at(x + dx, y + dy) for dx, dy in AROUND
                           if is_body(at(x + dx, y + dy)) and at(x + dx, y + dy) not in dark)
            plan[(x, y)] = body.most_common(1)[0][0] if body else outline
    # A step of the outline: an edge pixel of a noise run beside the outline.
    for x, y in noise:
        if (x, y) not in plan and on_edge(x, y):
            if any(at(x + dx, y + dy) in dark or plan.get((x + dx, y + dy)) == 'outline' for dx, dy in AROUND):
                plan[(x, y)] = 'outline'

    final = {}
    for (x, y), what in plan.items():
        if what == 'outline':
            around = [at(x + dx, y + dy) for dx, dy in DIRS
                      if at(x + dx, y + dy) != trans and (x + dx, y + dy) not in plan]
            final[(x, y)] = trans if around and all(i in dark for i in around) else outline
        else:
            final[(x, y)] = what
    for (x, y), i in final.items():
        px[x, y] = i
    for (x, y), i in final.items():
        if i == trans:
            pairs = ((at(x - 1, y), at(x + 1, y)), (at(x, y - 1), at(x, y + 1)))
            if any(a in dark and b in dark for a, b in pairs):
                px[x, y] = outline
    return len(final)


def main(src, out, fw=128):
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
    grey = {i for i in used if i != trans and max(colours[i]) - min(colours[i]) <= SPREAD and lum(colours[i]) >= LUM}
    dark_ids = sorted((i for i in used if i != trans and lum(colours[i]) < 14), key=lambda i: lum(colours[i]))
    counts = [clean_frame(px, f * fw, fw, H, trans, grey, set(dark_ids), dark_ids[0]) for f in range(W // fw)]
    im.save(out, transparency=trans)
    print(f'{src}: {sum(counts)} pixels changed {counts}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 128)

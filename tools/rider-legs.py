"""Takes the far leg off each rider (the author: "Postacie powinny mieć
tylko jedną nogę widoczną jadąc na wierzchowcu (bo drugą mają przewieszoną
na drugą stronę siedząc)"). Retro Diffusion drew the riders squatting, both
lower legs showing; the one behind (to the left: the riders face right) is
cleared by the rectangles chosen by hand for each rider in
tools/rider-legs.json ([left, top, right, bottom), right and bottom not
included), with the slivers of its outline, and a dark outline is drawn
along the cut where the near leg now meets the empty side.

    python3 -I tools/rider-legs.py tools/rider-legs.json DRAWN_DIR OUT_DIR

DRAWN_DIR holds the riders as drawn (both legs); the skin tones are made
after, from OUT_DIR (tools/rider-tones.py).
"""
import json, sys
from PIL import Image
cuts = json.load(open(sys.argv[1]))
src_dir, out_dir = sys.argv[2], sys.argv[3]
lum = lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
for name, rects in cuts.items():
    im = Image.open(f'{src_dir}/{name}.png').convert('RGBA')
    px = im.load()
    W, H = im.size
    darks = sorted((px[x, y][:3] for y in range(H) for x in range(W) if px[x, y][3] >= 128), key=lum)
    outline = darks[len(darks) // 50] if darks else (30, 24, 20)
    cleared = set()
    for x0, y0, x1, y1 in rects:
        for y in range(y0, min(y1, H)):
            for x in range(x0, min(x1, W)):
                if px[x, y][3]:
                    cleared.add((x, y))
                px[x, y] = (0, 0, 0, 0)
    # Slivers of the far leg's outline left of a cut (at most 2 px wide
    # in a row, with nothing further left) go too.
    for x0, y0, x1, y1 in rects:
        for y in range(y0, min(y1, H)):
            run = [x for x in range(max(0, x0 - 3), x0) if px[x, y][3]]
            if run and (x0 - 3 < 0 or not px[x0 - 3, y][3]) and len(run) <= 2:
                for x in run:
                    cleared.add((x, y))
                    px[x, y] = (0, 0, 0, 0)
    # The near leg's side along the cut gets an outline.
    for (x, y) in cleared:
        for dx in (1,):
            q = (x + dx, y)
            if 0 <= q[0] < W and px[q][3] >= 128 and (q not in cleared) and lum(px[q][:3]) > 60:
                px[q] = (*outline, 255)
    # Specks the cut left behind, cut off from the figure.
    from collections import deque
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
    im.save(f'{out_dir}/{name}.png')
print('done', len(cuts))

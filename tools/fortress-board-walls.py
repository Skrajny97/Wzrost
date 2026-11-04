# The Warownia's board from whole pieces (the author's 602 and 606 A,
# 4.11.2026): the approved top wall of PixelLab (art/references/fortress-board/
# top-wall.png: two towers, the curtain walls and the gatehouse) at the top
# and the same wall again at the bottom, on the courtyard's grass; side walls
# of one thickness down both sides, built of the tower top's own pixels (its
# parapets with their merlons, and a walkway of its lit floor), from under
# the top towers to under the bottom ones. The lower courtyard's grass is
# copied from 200 rows above and joined under a seam of least difference;
# the camp's big boulder by the left wall moves 4 px right so the thicker
# wall does not cut it, and the road out of the bottom gate runs on narrow to
# the board's edge.
#
# Usage: python3 -I tools/fortress-board-walls.py <repo> <out.png>
# (from art/inputs/fortress-board/court.png, the 602 A board; writes the
# board, 320 × 729).
import sys
from collections import deque

import numpy as np
from PIL import Image

repo, out_path = sys.argv[1], sys.argv[2]
TOP_WALL = f'{repo}/art/references/fortress-board/top-wall.png'
COURT = f'{repo}/art/inputs/fortress-board/court.png'
CAMP = f'{repo}/src/client/art/board-tall/camp-3.png'


# Small binary morphology on boolean arrays.
def dilate(m, r=1):
    h, w = m.shape
    p = np.pad(m, r)
    out = np.zeros_like(m)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= p[r + dy:r + dy + h, r + dx:r + dx + w]
    return out


def erode(m, r=1):
    return ~dilate(~m, r)


def fill_holes(m):
    h, w = m.shape
    outside = np.zeros_like(m)
    q = deque((y, x) for y in range(h) for x in range(w) if (y in (0, h - 1) or x in (0, w - 1)) and not m[y, x])
    for y, x in q:
        outside[y, x] = True
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and not m[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                q.append((ny, nx))
    return ~outside


def biggest(m):
    """The largest 4-connected piece of the mask."""
    h, w = m.shape
    seen = np.zeros_like(m)
    best = []
    for y0 in range(h):
        for x0 in range(w):
            if m[y0, x0] and not seen[y0, x0]:
                seen[y0, x0] = True
                q, piece = deque([(y0, x0)]), []
                while q:
                    y, x = q.popleft()
                    piece.append((y, x))
                    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                        if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((ny, nx))
                if len(piece) > len(best):
                    best = piece
    out = np.zeros_like(m)
    for y, x in best:
        out[y, x] = True
    return out


def stone_mask(strip):
    """The wall's stone apart from the trees, grass and road around it: grey
    and bluish-grey pixels inside the pieces' bounds (towers, curtain walls,
    gatehouse), the trees' dark teal shade above the battlements left out,
    the oak gate filled in as the stone's hole."""
    im = strip.astype(int)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mx, mn = im.max(-1), im.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    green = (g > r + 8) & (g > b + 4)
    orange = (r > g + 12) & (g > b)
    stone = ~green & ~orange & ((sat < 0.30) | ((b >= g) & (b >= r)))
    boxes = np.zeros_like(stone)
    for x0, y0, x1, y1 in ((11, 1, 53, 79), (264, 1, 300, 79), (52, 23, 265, 66), (127, 5, 195, 66)):
        boxes[y0:y1 + 1, x0:x1 + 1] = True
    stone &= boxes
    teal = g > r + 8
    teal[28:] = False
    stone &= ~teal
    stone = erode(dilate(stone))
    stone = fill_holes(stone)
    stone = dilate(erode(stone))
    return fill_holes(biggest(stone))


def side_wall(strip, height, walk=8):
    """A side wall seen from above, `walk` + 12 px wide: the tower top's left
    parapet (merlon, crenel, joint: 9 rows) on the left, its right parapet on
    the right, between them a walkway of its lit floor in staggered
    flagstones, the left parapet's shadow along it."""
    period, row0 = 9, 13
    left = strip[row0:row0 + period, 11:17]
    right = strip[row0:row0 + period, 47:53]
    floor = strip[17:24, 19:27]
    joint, shade = strip[12, 30], strip[14, 22]
    w = 12 + walk
    out = np.zeros((height, w, 3), np.uint8)
    for y in range(height):
        k = y % period
        out[y, :6] = left[k]
        out[y, w - 6:] = right[k]
        course = (y // period) % 2
        row = np.roll(floor[y % floor.shape[0]][:walk].copy(), 3 * course, axis=0)
        if k == period - 1:
            row[:] = joint
        else:
            row[3 if course else 5] = joint
        row[0] = shade
        out[y, 6:6 + walk] = row
    return out


def seam_rows(a, b):
    """For each column of two overlapping bands, the row from which `b`
    replaces `a`, along the path of least difference."""
    err = ((a.astype(int) - b.astype(int)) ** 2).sum(-1).T.astype(float)  # cols x rows
    w, h = err.shape
    back = np.zeros((w, h), int)
    for x in range(1, w):
        for y in range(h):
            lo, hi = max(0, y - 1), min(h, y + 2)
            k = lo + int(np.argmin(err[x - 1, lo:hi]))
            back[x, y] = k
            err[x, y] += err[x - 1, k]
    rows = np.zeros(w, int)
    rows[-1] = int(np.argmin(err[-1]))
    for x in range(w - 1, 0, -1):
        rows[x - 1] = back[x, rows[x]]
    return rows


board = np.asarray(Image.open(COURT).convert('RGB')).copy()
H, W = board.shape[:2]
strip = np.asarray(Image.open(TOP_WALL).convert('RGB'))
mask = stone_mask(strip)
SH = strip.shape[0]          # 80
TOP, B0 = 6, 643             # the wall's place at the top and at the bottom
LEFT, RIGHT = (14, 34), (278, 298)

# 1. The lower courtyard: grass from 200 rows above under a seam.
X0, X1, DST0, DST1, SHIFT, OV = 26, 292, 556, 712, 200, 14
src = board[DST0 - SHIFT - OV:DST1 - SHIFT, X0:X1].copy()
cut = seam_rows(board[DST0 - OV:DST0, X0:X1], src[:OV])
for i, x in enumerate(range(X0, X1)):
    board[DST0 - OV + cut[i]:DST1, x] = src[cut[i]:, i]

# 2. The camp's boulder by the left wall, 4 px right; its place grass again.
camp = np.asarray(Image.open(CAMP).convert('RGB')).astype(int)
BX0, BX1, BY0, BY1, MOVE = 31, 50, 130, 162, 4
reg = camp[BY0:BY1, BX0:BX1]
rock = reg[..., 1] <= np.maximum(reg[..., 0], reg[..., 2]) + 5
for j, i in zip(*np.nonzero(rock)):
    if BX0 + i >= LEFT[1]:
        board[BY0 + j, BX0 + i] = board[BY0 + j + 68, BX0 + i]
for j, i in zip(*np.nonzero(rock)):
    board[BY0 + j, BX0 + i + MOVE] = reg[j, i]

# 3. The side walls, from under the top towers to under the bottom ones.
for x0, x1 in (LEFT, RIGHT):
    board[TOP + 60:B0 + 60, x0:x1] = side_wall(strip, B0 - TOP, walk=x1 - x0 - 12)

# 4. The top wall as approved over the walls' ends, and the trees that hang
#    over the right tower's foot.
top = board[TOP:TOP + SH]
top[mask] = strip[mask]
trees = np.zeros_like(mask)
trees[40:, 286:] = True
top[trees & ~mask] = strip[trees & ~mask]

# 5. The bottom wall: the ground below it as below the top wall (the road out
#    of the gate), then its stone; the courtyard shows above and between the
#    battlements.
band = board[B0:B0 + SH]
for x in np.nonzero(mask.any(0))[0]:
    low = np.nonzero(mask[:, x])[0].max()
    band[low + 1:, x] = strip[low + 1:, x]
band[mask] = strip[mask]

# 6. The road out of the bottom gate on to the edge, as narrow as it leaves.
board[B0 + SH:H, 120:190] = board[B0 + SH - (H - B0 - SH):B0 + SH, 120:190]

Image.fromarray(board).save(out_path)
print('board', board.shape[1], 'x', board.shape[0])

#!/usr/bin/env python3
"""Cuts the plain background off a bust drawn on one (the companions'
busts, art/prompts.json "residents"): the background is filled from the top
edge down, through pixels near its colour, so the shoulders that reach the
bottom and the side edges stay whole, and what the fill leaves around the
figure in the background (a tuft of grass, a beam) goes with the parts not
joined to the figure.

    python3 tools/cut-bust.py SOURCE OUT [--seed x,y ...] [--flood x,y ...]
        [--wall N] [--erase x0,y0,x1,y1 ...]

--seed starts the fill at one more pixel, with that pixel's colour as the
background's (a pocket cut off from the top, as under a sword, or a patch
of another shade, as grass). --flood starts a fill that takes every pixel
up to the figure's dark outline, darker than --wall (a background with a
house or a tree in it). --erase clears a box (inclusive) of background the
fill cannot tell from the figure.
"""

import argparse
from collections import deque

from PIL import Image

WALL = 48  # the brightness of the outline a --flood stops at
NEAR = 44  # how far from the background's colour a pixel is still background
STEP = 9  # how far a pixel may differ from the background pixel beside it
FAR = 96  # and how far from the background's colour that soft edge may go
SPECK = 4  # the most pixels of a speck of background left in the hair
SPECK_REACH = 2  # and how close to the cut-off background it lies
SPECK_CONTRAST = 70  # and how much lighter than the strands around it


def distance(a, b):
    return sum((x - y) ** 2 for x, y in zip(a[:3], b[:3])) ** 0.5


def background_colour(image):
    width, _ = image.size
    row = [image.getpixel((x, 0)) for x in range(width)]
    return max(set(row), key=row.count)


def brightness(colour):
    r, g, b = colour[:3]
    return 0.299 * r + 0.587 * g + 0.114 * b


def cut(image, seeds=(), erase=(), floods=(), wall=WALL):
    image = image.convert('RGBA')
    width, height = image.size
    pixels = image.load()
    ground = background_colour(image)
    gone = [[False] * width for _ in range(height)]
    queue = deque()
    starts = [((x, 0), ground) for x in range(width) if distance(pixels[x, 0], ground) < NEAR]
    starts += [((x, y), pixels[x, y]) for x, y in seeds]
    starts += [((x, y), None) for x, y in floods]
    for (x, y), colour in starts:
        if not gone[y][x]:
            gone[y][x] = True
            queue.append((x, y, colour))
    while queue:
        x, y, colour = queue.popleft()
        here = pixels[x, y]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if not (0 <= nx < width and 0 <= ny < height) or gone[ny][nx]:
                continue
            there = pixels[nx, ny]
            if colour is None:
                if brightness(there) >= wall:
                    gone[ny][nx] = True
                    queue.append((nx, ny, colour))
                continue
            off = distance(there, colour)
            if off < NEAR or (off < FAR and distance(there, here) < STEP):
                gone[ny][nx] = True
                queue.append((nx, ny, colour))
    for x0, y0, x1, y1 in erase:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                gone[y][x] = True
    # Specks of the background shut in between strands of hair at the
    # figure's edge: a few pixels of its colour, close to what is cut off.
    near_edge = lambda x, y: any(
        gone[ny][nx]
        for nx in range(max(0, x - SPECK_REACH), min(width, x + SPECK_REACH + 1))
        for ny in range(max(0, y - SPECK_REACH), min(height, y + SPECK_REACH + 1))
    )
    checked = [[False] * width for _ in range(height)]
    for y in range(height):
        for x in range(width):
            if gone[y][x] or checked[y][x] or distance(pixels[x, y], ground) >= FAR:
                continue
            speck = [(x, y)]
            checked[y][x] = True
            for cx, cy in speck:
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < width and 0 <= ny < height and not gone[ny][nx] and not checked[ny][nx] and distance(pixels[nx, ny], ground) < FAR:
                        checked[ny][nx] = True
                        speck.append((nx, ny))
            # Only a light speck among dark strands: a white beard or a
            # headscarf keeps its own light pixels.
            inside = set(speck)
            around = {
                (nx, ny)
                for sx, sy in speck
                for nx in range(max(0, sx - 1), min(width, sx + 2))
                for ny in range(max(0, sy - 1), min(height, sy + 2))
                if (nx, ny) not in inside and not gone[ny][nx]
            }
            light = sum(brightness(pixels[sx, sy]) for sx, sy in speck) / len(speck)
            dark = sum(brightness(pixels[nx, ny]) for nx, ny in around) / len(around) if around else 0
            if len(speck) <= SPECK and all(near_edge(sx, sy) for sx, sy in speck) and light - dark >= SPECK_CONTRAST:
                for sx, sy in speck:
                    gone[sy][sx] = True
    # Only the figure stays: the largest part of what is left, joined at
    # the sides and corners.
    seen = [[False] * width for _ in range(height)]
    parts = []
    for y in range(height):
        for x in range(width):
            if gone[y][x] or seen[y][x]:
                continue
            part = []
            seen[y][x] = True
            stack = [(x, y)]
            while stack:
                cx, cy = stack.pop()
                part.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < width and 0 <= ny < height and not gone[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
            parts.append(part)
    figure = set(max(parts, key=len)) if parts else set()
    out = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    target = out.load()
    for x, y in figure:
        r, g, b, _ = pixels[x, y]
        target[x, y] = (r, g, b, 255)
    return out


def point(text):
    return tuple(int(value) for value in text.split(','))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('out')
    parser.add_argument('--seed', type=point, action='append', default=[])
    parser.add_argument('--flood', type=point, action='append', default=[])
    parser.add_argument('--wall', type=int, default=WALL)
    parser.add_argument('--erase', type=point, action='append', default=[])
    args = parser.parse_args()
    cut(Image.open(args.source), args.seed, args.erase, args.flood, args.wall).save(args.out, optimize=True)


if __name__ == '__main__':
    main()

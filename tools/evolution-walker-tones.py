# Recolours the skin of the evolutions' walking figures (src/client/art/walkers,
# <evolution>-<look>, four frames of 48×48) to the tones of data/skins.json,
# one file per figure and tone: <evolution>-<look>-<tone>.png next to the
# figure, as tools/walker-tones.py does for the classes' figures.
#
# The masks were made by hand, figure by figure (tools/evolution-walker-tones.json):
# the figure's skin colours ("palette") inside the boxes where its face and
# hands show (x within the frame, y), the same in every frame, less
# "not_pixels" and plus "pixels" ({frame: [[x, y], ...]}). Each skin colour
# keeps its place between the darkest and the lightest skin colour, on the
# tone's ramp from shadow to light (an added pixel lighter or darker than
# the palette, a white light on the toes, takes the end); "span" moves those
# two ends along the
# ramp (default [0, 1]), for a face drawn in one colour or without its
# shadow, which would else take the tone's shadow.
#
# Usage: python3 tools/evolution-walker-tones.py
import json, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WALKERS = os.path.join(ROOT, 'src', 'client', 'art', 'walkers')
FRAME = 48


def rgb(code):
    code = code.lstrip('#')
    return tuple(int(code[i:i + 2], 16) for i in (0, 2, 4))


def lum(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def within(box, x, y):
    return box[0] <= x < box[2] and box[1] <= y < box[3]


def skin_of(im, cfg):
    px = im.load()
    palette = {rgb(c) for c in cfg['palette']}
    skin = {
        (x, y)
        for y in range(im.height)
        for x in range(im.width)
        if px[x, y][3] > 16 and px[x, y][:3] in palette and any(within(b, x % FRAME, y) for b in cfg['boxes'])
    }
    for frame, points in cfg.get('not_pixels', {}).items():
        skin -= {(int(frame) * FRAME + x, y) for x, y in points}
    for frame, points in cfg.get('pixels', {}).items():
        skin |= {(int(frame) * FRAME + x, y) for x, y in points}
    return skin


def on_ramp(ramp, t):
    t = min(1, max(0, t))
    shadow, mid, light = ramp
    a, b, u = (shadow, mid, t * 2) if t < 0.5 else (mid, light, t * 2 - 1)
    return tuple(round(a[i] + (b[i] - a[i]) * u) for i in range(3))


def main():
    masks = json.load(open(os.path.join(ROOT, 'tools', 'evolution-walker-tones.json'), encoding='utf-8'))
    tones = [t for t in json.load(open(os.path.join(ROOT, 'data', 'skins.json'), encoding='utf-8'))['skins'] if t.get('ramp')]
    for name, cfg in masks.items():
        im = Image.open(os.path.join(WALKERS, name + '.png')).convert('RGBA')
        skin = skin_of(im, cfg)
        palette = {rgb(c) for c in cfg['palette']}
        colours = {im.getpixel(p)[:3] for p in skin} & palette
        low, high = min(map(lum, colours)), max(map(lum, colours))
        span = cfg.get('span', [0, 1])
        for tone in tones:
            ramp = [rgb(c) for c in tone['ramp']]
            out = im.copy()
            px = out.load()
            for x, y in skin:
                c = px[x, y]
                px[x, y] = (*on_ramp(ramp, span[0] + (span[1] - span[0]) * (lum(c[:3]) - low) / (high - low or 1)), c[3])
            out.save(os.path.join(WALKERS, f"{name}-{tone['id']}.png"), optimize=True)
        print(name, len(skin), 'pixels')


if __name__ == '__main__':
    main()

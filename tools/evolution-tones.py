# Recolours the skin of the evolutions' portraits (src/client/art/portraits,
# <evolution>-<look>) to the tones of data/skins.json, one file per portrait
# and tone: <evolution>-<look>-<tone>.png next to the portrait, as
# tools/skin-tones.py does for the starting portraits. The portrait itself
# stays the tone without a ramp.
#
# The masks were made by hand, portrait by portrait (tools/evolution-tones.json),
# as the evolutions' armour, leather and bronze share the colours of skin:
#   palette + boxes  the portrait's own skin colours, inside the boxes where
#                    skin shows (left, top, right, bottom);
#   polys            outlines drawn around the skin: every warm pixel inside
#                    is skin, the dark outline is not. "hue", "sat",
#                    "satmax" and "val" (here or on one outline) say what
#                    warm is, so hair, robes and fire stay out;
#   not_boxes, not_pixels, pixels   what the rules above get wrong.
# Each skin colour keeps its place between the darkest and the lightest skin
# colour of the portrait, on the tone's ramp from shadow to light.
#
# Usage: python3 tools/evolution-tones.py [--ids a,b] [--mask out-dir]
import colorsys, json, os, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTRAITS = os.path.join(ROOT, 'src', 'client', 'art', 'portraits')


def rgb(code):
    code = code.lstrip('#')
    return tuple(int(code[i:i + 2], 16) for i in (0, 2, 4))


def lum(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def within(box, x, y):
    return box[0] <= x < box[2] and box[1] <= y < box[3]


def warm(c, rule):
    h, s, v = colorsys.rgb_to_hsv(c[0] / 255, c[1] / 255, c[2] / 255)
    lo, hi = rule.get('hue', [0.0, 0.1])
    return lo <= h <= hi and rule.get('sat', 0.15) <= s <= rule.get('satmax', 1) and v >= rule.get('val', 0.3)


def skin_of(im, cfg):
    px = im.load()
    palette = {rgb(c) for c in cfg.get('palette', [])}
    outside = lambda x, y: any(within(b, x, y) for b in cfg.get('not_boxes', []))
    skin = set()
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if c[3] > 16 and c[:3] in palette and any(within(b, x, y) for b in cfg.get('boxes', [])) and not outside(x, y):
                skin.add((x, y))
    for poly in cfg.get('polys', []):
        rule = {**cfg, **poly} if isinstance(poly, dict) else cfg
        area = Image.new('L', im.size, 0)
        ImageDraw.Draw(area).polygon([tuple(v) for v in (poly['pts'] if isinstance(poly, dict) else poly)], fill=255, outline=255)
        inside = area.load()
        for y in range(im.height):
            for x in range(im.width):
                if inside[x, y] and px[x, y][3] > 16 and warm(px[x, y], rule) and not outside(x, y):
                    skin.add((x, y))
    skin -= {tuple(p) for p in cfg.get('not_pixels', [])}
    skin |= {tuple(p) for p in cfg.get('pixels', [])}
    return skin


def on_ramp(ramp, t):
    shadow, mid, light = ramp
    a, b, u = (shadow, mid, t * 2) if t < 0.5 else (mid, light, t * 2 - 1)
    return tuple(round(a[i] + (b[i] - a[i]) * u) for i in range(3))


def main():
    masks = json.load(open(os.path.join(ROOT, 'tools', 'evolution-tones.json'), encoding='utf-8'))
    tones = [t for t in json.load(open(os.path.join(ROOT, 'data', 'skins.json'), encoding='utf-8'))['skins'] if t.get('ramp')]
    mask_dir = sys.argv[sys.argv.index('--mask') + 1] if '--mask' in sys.argv else None
    only = set(sys.argv[sys.argv.index('--ids') + 1].split(',')) if '--ids' in sys.argv else None
    for name, cfg in masks.items():
        if only and name not in only:
            continue
        im = Image.open(os.path.join(PORTRAITS, name + '.png')).convert('RGBA')
        skin = skin_of(im, cfg)
        colours = {im.getpixel(p)[:3] for p in skin}
        low, high = min(map(lum, colours)), max(map(lum, colours))
        for tone in tones:
            ramp = [rgb(c) for c in tone['ramp']]
            out = im.copy()
            px = out.load()
            for x, y in skin:
                c = px[x, y]
                px[x, y] = (*on_ramp(ramp, (lum(c[:3]) - low) / (high - low or 1)), c[3])
            out.save(os.path.join(PORTRAITS, f"{name}-{tone['id']}.png"), optimize=True)
        if mask_dir:
            view = im.copy()
            for p in skin:
                view.putpixel(p, (255, 0, 255, 255))
            view.save(os.path.join(mask_dir, name + '-mask.png'))
        print(name, len(skin), 'pixels')


if __name__ == '__main__':
    main()

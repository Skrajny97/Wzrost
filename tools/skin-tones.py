# Recolours the skin of the starting portraits (src/client/art/portraits) to
# the tones of data/appearances.json, one file per portrait and tone:
# <class>-<look>-<tone>.png next to the portrait. The portrait itself stays
# the tone without a ramp.
#
# Skin is found in two steps: the colours of the face (a box around it that
# pass a test for skin), and of those only the pixels inside the boxes below,
# where the figure shows skin (head, arms or hands, feet), as the portraits
# reuse some skin colours on leather and cloth. Each skin colour keeps its
# place between the darkest and the lightest skin colour of the portrait, on
# the tone's ramp from shadow to light.
#
# Usage: python3 tools/skin-tones.py [--mask out.png]
import colorsys, json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTRAITS = os.path.join(ROOT, 'src', 'client', 'art', 'portraits')
# Where the face is across (art.js `faces`), when not in the middle.
FACES = {'archer-female': 49, 'archer-male': 52, 'cleric-male': 49, 'shadow-male': 51, 'warrior-male': 50}
# (left, top, right, bottom) of the places that show skin, in pixels.
BOXES = {
    'archer-female': [(43, 8, 59, 32), (26, 60, 38, 80), (62, 60, 74, 80)],
    'archer-male': [(41, 6, 60, 31), (26, 66, 42, 88), (60, 64, 74, 86)],
    'cleric-female': [(36, 4, 58, 36), (28, 50, 48, 72), (54, 50, 68, 70), (36, 100, 66, 128)],
    'cleric-male': [(38, 6, 60, 34), (28, 50, 40, 80), (58, 46, 72, 76), (34, 86, 72, 128)],
    'mage-female': [(40, 4, 60, 34), (30, 56, 42, 84), (58, 52, 72, 78), (34, 96, 68, 128)],
    'mage-male': [(40, 13, 62, 34), (44, 30, 58, 40), (28, 68, 40, 88), (58, 66, 72, 86), (34, 96, 66, 128)],
    'shadow-female': [(40, 12, 60, 24), (24, 40, 40, 86), (54, 36, 74, 82), (30, 110, 66, 128)],
    'shadow-male': [(40, 8, 62, 28), (26, 64, 40, 88), (58, 60, 72, 84), (32, 110, 66, 128)],
    'warrior-female': [(40, 6, 62, 36), (20, 52, 38, 88), (62, 50, 80, 84), (32, 108, 72, 128)],
    'warrior-male': [(40, 4, 62, 34), (44, 34, 58, 46), (24, 54, 40, 86), (60, 52, 76, 84), (32, 108, 70, 128)],
}


def skinlike(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return 0.01 <= h <= 0.085 and 0.2 <= s <= 0.62 and v >= 0.42


def luminance(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def skin_pixels(im, name):
    px = im.load()
    fx = FACES.get(name, im.width // 2)
    top = next(y for y in range(im.height) if any(px[x, y][3] for x in range(im.width)))
    colours = {px[x, y][:3] for y in range(top + 6, top + 22) for x in range(fx - 6, fx + 7) if px[x, y][3] and skinlike(*px[x, y][:3])}
    head, *limbs = BOXES[name]
    within = lambda box, x, y: box[0] <= x < box[2] and box[1] <= y < box[3]
    # Hands and feet may have a shade the face lacks: a skin-like colour close
    # to one of the face's counts there too, but not on the head, where hair
    # and hood come close.
    # Cream cloth and khaki straps come close too, but they are greyer or
    # yellower: a colour farther away counts only when it is as saturated and
    # as orange as skin.
    def near(c):
        if not skinlike(*c):
            return False
        distance = min(sum((a - b) ** 2 for a, b in zip(c, f)) for f in colours) ** 0.5
        hue, saturation, _ = colorsys.rgb_to_hsv(*(v / 255 for v in c))
        return distance < 28 or (distance < 45 and saturation >= 0.3 and hue <= 0.08)
    in_box = lambda x, y: within(head, x, y) or any(within(box, x, y) for box in limbs)
    pixels = {(x, y) for y in range(im.height) for x in range(im.width) if px[x, y][3] and px[x, y][:3] in colours and in_box(x, y)}
    # A shade the face lacks counts only right next to skin found already
    # (two steps out), so cloth farther away keeps its colour.
    for _ in range(2):
        grown = set()
        for x, y in pixels:
            for nx in (x - 1, x, x + 1):
                for ny in (y - 1, y, y + 1):
                    if (nx, ny) in pixels or not (0 <= nx < im.width and 0 <= ny < im.height):
                        continue
                    c = px[nx, ny]
                    if c[3] and any(within(box, nx, ny) for box in limbs) and near(c[:3]):
                        grown.add((nx, ny))
        pixels |= grown
    pixels = sorted(pixels)
    colours = colours | {px[x, y][:3] for x, y in pixels}
    return colours, pixels


def rgb(code):
    return tuple(int(code[i:i + 2], 16) for i in (1, 3, 5))


def on_ramp(ramp, t):
    shadow, mid, light = ramp
    a, b, u = (shadow, mid, t * 2) if t < 0.5 else (mid, light, t * 2 - 1)
    return tuple(round(a[i] + (b[i] - a[i]) * u) for i in range(3))


def main():
    tones = json.load(open(os.path.join(ROOT, 'data', 'skins.json'), encoding='utf8'))['skins']
    masks = []
    for name in sorted(BOXES):
        im = Image.open(os.path.join(PORTRAITS, f'{name}.png')).convert('RGBA')
        colours, pixels = skin_pixels(im, name)
        lums = {c: luminance(c) for c in colours}
        low, high = min(lums.values()), max(lums.values())
        for tone in tones:
            if not tone.get('ramp'):
                continue
            out = im.copy()
            po = out.load()
            for x, y in pixels:
                c = po[x, y]
                t = (lums[c[:3]] - low) / (high - low or 1)
                po[x, y] = (*on_ramp([rgb(code) for code in tone['ramp']], t), c[3])
            out.save(os.path.join(PORTRAITS, f"{name}-{tone['id']}.png"))
        mask = im.copy()
        for x, y in pixels:
            mask.putpixel((x, y), (255, 0, 255, 255))
        masks.append(mask)
        print(name, len(colours), 'colours,', len(pixels), 'pixels')
    if '--mask' in sys.argv:
        w, h = masks[0].size
        sheet = Image.new('RGBA', (w * 3 * 5 + 40, h * 3 * 2 + 10), (18, 24, 20, 255))
        for i, m in enumerate(masks):
            sheet.alpha_composite(m.resize((w * 3, h * 3), Image.NEAREST), ((i % 5) * (w * 3 + 10), (i // 5) * (h * 3 + 10)))
        sheet.save(sys.argv[sys.argv.index('--mask') + 1])


main()

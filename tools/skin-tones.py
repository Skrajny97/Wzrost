# Recolours the skin of the starting portraits (src/client/art/portraits) to
# the tones of data/skins.json, one file per portrait and tone:
# <class>-<look>-<tone>.png next to the portrait. The portrait itself stays
# the tone without a ramp.
#
# Skin is found in two steps: the colours of the face (a box around it that
# pass a test for skin), and of those only the pixels inside the boxes below,
# where the figure shows skin (head, arms or hands, feet), as the portraits
# reuse some skin colours on leather and cloth. Then the mask as checked
# pixel by pixel (GROW and below) takes over. Each skin colour keeps its
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
# Where the cheeks are (left, top, right, bottom), for a portrait whose
# fringe has the colours of skin; the others take their face's colours from
# below the top of the figure.
SEEDS = {
    'archer-female': (47, 23, 55, 28),
    'archer-male': (48, 24, 55, 29),
    'mage-male': (46, 24, 54, 29),
    'shadow-female': (45, 21, 55, 24),
}
# Portraits whose neck lies apart from the face, below the line of the jaw
# (elsewhere the laces of a shirt have the face's colours).
NECKS = {'mage-male'}
# (left, top, right, bottom) of the places that show skin, in pixels.
BOXES = {
    'archer-female': [(43, 8, 59, 32), (26, 60, 38, 80), (62, 60, 74, 80)],
    'archer-male': [(41, 6, 60, 31), (26, 66, 42, 88), (60, 64, 74, 86)],
    'cleric-female': [(36, 4, 58, 36), (28, 50, 48, 72), (54, 50, 68, 70), (36, 100, 66, 128)],
    'cleric-male': [(38, 6, 60, 34), (28, 50, 40, 80), (58, 46, 72, 76), (34, 86, 72, 128)],
    'mage-female': [(40, 4, 60, 34), (30, 56, 42, 84), (58, 52, 72, 78), (34, 96, 68, 128)],
    'mage-male': [(40, 13, 62, 34), (44, 30, 58, 46), (28, 68, 40, 88), (58, 66, 72, 86), (34, 96, 66, 128)],
    'shadow-female': [(40, 17, 60, 24), (24, 40, 40, 86), (54, 36, 74, 82), (30, 110, 66, 128)],
    'shadow-male': [(40, 8, 62, 28), (26, 64, 40, 88), (58, 60, 72, 84), (32, 110, 66, 128)],
    'warrior-female': [(40, 6, 62, 36), (20, 52, 38, 88), (62, 50, 80, 84), (32, 108, 72, 128)],
    'warrior-male': [(40, 4, 62, 34), (44, 34, 58, 46), (24, 54, 40, 86), (60, 52, 76, 84), (32, 108, 70, 128)],
}


# The masks as checked pixel by pixel (the author: "nawet portrety mają
# słabe maski"). The head keeps the skin found on it. From there skin grows,
# inside GROW's boxes (head: neck, chest, forehead; limbs: arms, hands,
# feet), only into the face's own skin colours: saturated and orange enough,
# without the colours in NOT (a collar, a lace or a strap the face shares);
# elsewhere the skin found keeps only those colours, so cloth and wraps of a
# skin-like colour drop out. PATCHES are bits of skin cut off from the rest,
# such as a heel between straps: the skin colours in their box and the shades
# named for it. PIXELS and NOT_PIXELS are single pixels the colours get
# wrong: skin between strands of a fringe, the iris of an eye. Next to the
# skin of the limbs, a dark, warm outline takes a darker shade of the tone,
# so no brown or maroon rim is left around a grey arm (rim_pixels).
GROW = {
    'archer-female': ([(44, 28, 56, 37)], [(26, 60, 40, 82), (60, 60, 76, 82)]),
    'archer-male': ([(44, 24, 62, 40)], [(32, 62, 46, 92), (60, 62, 78, 90)]),
    'cleric-female': ([], [(28, 50, 48, 72), (52, 50, 68, 70), (34, 98, 68, 128)]),
    'cleric-male': ([(44, 30, 58, 47)], [(26, 50, 42, 84), (56, 46, 74, 80), (32, 86, 72, 128)]),
    'mage-female': ([(48, 30, 58, 42)], [(28, 56, 42, 86), (56, 52, 72, 80), (32, 96, 68, 128)]),
    'mage-male': ([(46, 30, 58, 46)], [(26, 66, 40, 90), (56, 64, 72, 88), (32, 96, 66, 128)]),
    'shadow-female': ([(46, 12, 57, 18), (43, 18, 47, 23), (54, 18, 58, 23)], [(22, 38, 40, 88), (52, 34, 76, 84), (28, 108, 68, 128)]),
    'shadow-male': ([], [(24, 62, 40, 90), (56, 58, 74, 86), (30, 108, 68, 128)]),
    'warrior-female': ([(44, 30, 58, 44)], [(18, 50, 38, 90), (60, 48, 82, 86), (30, 106, 74, 128)]),
    'warrior-male': ([(44, 30, 58, 46)], [(22, 52, 40, 88), (58, 50, 78, 86), (30, 106, 72, 128)]),
}
NOT = {'warrior-female': ['#876d56', '#775030'], 'warrior-male': ['#6c4e39']}
PATCHES = {
    'shadow-female': [((46, 36, 54, 42), [])],
    'warrior-female': [((28, 119, 31, 123), [])],
    'warrior-male': [((53, 114, 56, 119), []), ((61, 115, 64, 118), ['#af713f'])],
}
PIXELS = {
    'shadow-female': [(46, 17), (47, 16), (48, 15), (48, 16), (53, 21), (67, 75), (67, 76), (66, 77), (66, 76), (65, 76)],
}
NOT_PIXELS = {
    'shadow-female': [(50, 13), (47, 21), (48, 21), (47, 22), (48, 22), (52, 21)],
}
SIDES = ((1, 0), (-1, 0), (0, 1), (0, -1))


def skinlike(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return 0.01 <= h <= 0.085 and 0.2 <= s <= 0.62 and v >= 0.42


def luminance(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def warm(c):
    h, s, v = colorsys.rgb_to_hsv(*(x / 255 for x in c))
    return (h <= 0.12 or h >= 0.9) and s >= 0.12 and v >= 0.35


def distance(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def found_pixels(im, name):
    px = im.load()
    fx = FACES.get(name, im.width // 2)
    top = next(y for y in range(im.height) if any(px[x, y][3] for x in range(im.width)))
    left, upper, right, lower = SEEDS.get(name, (fx - 6, top + 6, fx + 7, top + 22))
    seed = [(x, y) for y in range(upper, lower) for x in range(left, right) if px[x, y][3] and skinlike(*px[x, y][:3])]
    colours = {px[x, y][:3] for x, y in seed}
    within = lambda box, x, y: box[0] <= x < box[2] and box[1] <= y < box[3]
    # The head is its box and the neck's box touching it; the others are
    # hands and feet.
    first = BOXES[name][0]
    touches = lambda b: b[0] <= first[2] and first[0] <= b[2] and b[1] <= first[3] and first[1] <= b[3]
    head = [box for box in BOXES[name] if touches(box)]
    limbs = [box for box in BOXES[name] if not touches(box)]
    in_head = lambda x, y: any(within(box, x, y) for box in head)
    # The colours of the hair (or hood) right above the face: a shade of
    # theirs never grows into skin on the head.
    hair = {px[x, y][:3] for y in range(top, top + 6) for x in range(first[0], first[2]) if px[x, y][3]} - colours
    # On the head, skin is what joins the face: its colours, also across a
    # corner between strands of a fringe, and darker or redder shades right
    # next to them (the ear, the nose, the neck's shadow), so hair and cloth of
    # the same colours keep theirs. A neck below the line of the jaw starts
    # from the face's colours on it.
    if name in NECKS:
        seed += [(x, y) for box in head[1:] for y in range(box[1], box[3]) for x in range(box[0], box[2]) if px[x, y][3] and px[x, y][:3] in colours]
    pixels = set(seed)
    edge = list(seed)
    while edge:
        x, y = edge.pop()
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1)):
            nx, ny = x + dx, y + dy
            if (nx, ny) in pixels or not in_head(nx, ny):
                continue
            c = px[nx, ny]
            if not c[3]:
                continue
            side = dx == 0 or dy == 0
            # Below the head's box, on the neck, no hair comes close.
            haired = c[:3] in hair and within(first, nx, ny)
            if c[:3] in colours or (side and not haired and warm(c[:3]) and distance(c[:3], px[x, y][:3]) < 70):
                pixels.add((nx, ny))
                edge.append((nx, ny))
    # Lips, blush and single pixels skin closes around count too, but not the
    # dark of the eyes and brows.
    for _ in range(2):
        holes = set()
        for y in range(im.height):
            for x in range(im.width):
                c = px[x, y]
                if (x, y) in pixels or not c[3] or not in_head(x, y) or not warm(c[:3]):
                    continue
                if sum((n in pixels) for n in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))) >= 3:
                    holes.add((x, y))
        pixels |= holes
    # Hands and feet may have a shade the face lacks: a skin-like colour close
    # to one of the face's counts there, right next to skin found already (two
    # steps out), so cloth farther away keeps its colour. Cream cloth and
    # khaki straps come close too, but they are greyer or yellower: a colour
    # farther away counts only when it is as saturated and as orange as skin.
    def near(c):
        if not skinlike(*c):
            return False
        far = min(distance(c, f) for f in colours)
        hue, saturation, _ = colorsys.rgb_to_hsv(*(v / 255 for v in c))
        return far < 28 or (far < 45 and saturation >= 0.3 and hue <= 0.08)
    in_limb = lambda x, y: any(within(box, x, y) for box in limbs)
    hands = {(x, y) for y in range(im.height) for x in range(im.width) if px[x, y][3] and px[x, y][:3] in colours and in_limb(x, y)}
    for _ in range(2):
        grown = set()
        for x, y in hands:
            for nx in (x - 1, x, x + 1):
                for ny in (y - 1, y, y + 1):
                    if (nx, ny) in hands or not (0 <= nx < im.width and 0 <= ny < im.height):
                        continue
                    c = px[nx, ny]
                    if c[3] and in_limb(nx, ny) and near(c[:3]):
                        grown.add((nx, ny))
        hands |= grown
    pixels = sorted(pixels | hands)
    colours = colours | {px[x, y][:3] for x, y in pixels}
    return colours, pixels


def within(box, x, y):
    return box[0] <= x < box[2] and box[1] <= y < box[3]


def skin_pixels(im, name):
    px = im.load()
    _, found = found_pixels(im, name)
    head = BOXES[name][0]
    heads, limbs = GROW[name]
    grow = heads + limbs

    def skin_colour(c):
        h, s, _ = colorsys.rgb_to_hsv(*(v / 255 for v in c))
        return s >= 0.3 and (h <= 0.08 or h >= 0.95)

    allowed = {px[p][:3] for p in found if within(head, *p) and skin_colour(px[p][:3])}
    allowed -= {rgb(code) for code in NOT.get(name, [])}
    pixels = {p for p in found if within(head, *p) or px[p][:3] in allowed}
    edge = list(pixels)
    while edge:
        x, y = edge.pop()
        for dx, dy in SIDES:
            n = (x + dx, y + dy)
            if n not in pixels and any(within(box, *n) for box in grow) and px[n][3] and px[n][:3] in allowed:
                pixels.add(n)
                edge.append(n)
    for box, shades in PATCHES.get(name, []):
        here = allowed | {rgb(code) for code in shades}
        pixels |= {(x, y) for y in range(box[1], box[3]) for x in range(box[0], box[2]) if px[x, y][3] and px[x, y][:3] in here}
    pixels = (pixels | set(PIXELS.get(name, []))) - set(NOT_PIXELS.get(name, []))
    return {px[p][:3] for p in pixels}, sorted(pixels)


def rim_pixels(im, name, pixels):
    px = im.load()
    skin = set(pixels)
    rim = set()
    for box in GROW[name][1]:
        for y in range(box[1], box[3]):
            for x in range(box[0], box[2]):
                c = px[x, y]
                if (x, y) in skin or not c[3]:
                    continue
                h, s, v = colorsys.rgb_to_hsv(*(t / 255 for t in c[:3]))
                if (h <= 0.1 or h >= 0.9) and s >= 0.4 and 0.08 <= v < 0.36 and any((x + dx, y + dy) in skin for dx, dy in SIDES):
                    rim.add((x, y))
    return sorted(rim)


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
        rim = rim_pixels(im, name, pixels)
        lums = {c: luminance(c) for c in colours}
        low, high = min(lums.values()), max(lums.values())
        for tone in tones:
            if not tone.get('ramp'):
                continue
            out = im.copy()
            po = out.load()
            # The outline as dark next to the tone's shadow as it was next
            # to the darkest skin.
            shadow = rgb(tone['ramp'][0])
            for x, y in rim:
                c = po[x, y]
                k = min(1, luminance(c) / (low or 1))
                po[x, y] = (*(round(v * k) for v in shadow), c[3])
            for x, y in pixels:
                c = po[x, y]
                t = (lums[c[:3]] - low) / (high - low or 1)
                po[x, y] = (*on_ramp([rgb(code) for code in tone['ramp']], t), c[3])
            out.save(os.path.join(PORTRAITS, f"{name}-{tone['id']}.png"))
        mask = im.copy()
        for x, y in pixels:
            mask.putpixel((x, y), (255, 0, 255, 255))
        for x, y in rim:
            mask.putpixel((x, y), (0, 230, 255, 255))
        masks.append(mask)
        print(name, len(colours), 'colours,', len(pixels), 'pixels,', len(rim), 'outline')
    if '--mask' in sys.argv:
        w, h = masks[0].size
        sheet = Image.new('RGBA', (w * 3 * 5 + 40, h * 3 * 2 + 10), (18, 24, 20, 255))
        for i, m in enumerate(masks):
            sheet.alpha_composite(m.resize((w * 3, h * 3), Image.NEAREST), ((i % 5) * (w * 3 + 10), (i // 5) * (h * 3 + 10)))
        sheet.save(sys.argv[sys.argv.index('--mask') + 1])


if __name__ == '__main__':
    main()

# Recolours the skin of the walking figures of the Walka scene
# (src/client/art/walkers, drawn from the portraits) to the tones of
# data/skins.json, one file per figure and tone: <class>-<look>-<tone>.png
# next to the figure, as tools/skin-tones.py does for the portraits.
#
# A figure is small and its skin has few colours, picked by hand from the
# figure's palette below. SKIN holds the colours that are skin wherever they
# are; a colour the hair shares counts from a row down (code, row). EDGES
# holds the lights and shadows of the skin that the figure shares with its
# clothes or hair, such as a cream light on the face and on the shirt, or a
# brown shadow on the arm and on the trousers: they count as skin only next
# to it, up to two pixels in, and one the hair shares only from a row down.
# Every frame of every figure was then checked pixel by pixel in all tones.
# PIXELS holds, per frame (x within the 48-pixel frame, y), the pixels of
# skin that the colours leave out: cream and white lights on faces, arms
# and toes, outlines of hands and feet, a hand behind the body, lips.
# NOT_PIXELS holds the pixels that share a skin colour but are not skin:
# hair, a boot, a cloak, a belt, eyebrows and the dark between the eyes.
#
# Each skin colour keeps its place between the darkest and the lightest
# colour of SKIN and EDGES, on the tone's ramp from shadow to light. A
# checked pixel lighter than those takes the light end; a darker one, an
# outline, takes the shadow end darkened as much as it is darker (as the
# rims of the portraits in tools/skin-tones.py).
#
# Usage: python3 tools/walker-tones.py [--mask out.png]
import importlib.util, json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WALKERS = os.path.join(ROOT, 'src', 'client', 'art', 'walkers')
SKIN = {
    'archer-female': ['#f4c3a7', '#8e402d'],
    'archer-male': ['#fce0d4', '#d27a6c', '#8a424c'],
    'cleric-female': ['#fccaa7', '#f0c068', '#eca278', '#b87250'],
    'cleric-male': ['#e5aa5c', '#b77d3e', '#8d3d2b'],
    'mage-female': ['#f7bb90', '#cd845b', '#a9543e'],
    'mage-male': ['#fcc691', '#f7a56f', ('#e17a4f', 14), '#c45640'],
    'shadow-female': ['#fcc1a0', '#d37a60', '#9a4b3b'],
    'shadow-male': ['#f4d1be', '#eab390', '#dda993', '#d0907c', '#9d5540'],
    'warrior-female': ['#e2896e', '#c36e55', '#97453d'],
    'warrior-male': ['#f8b779', '#cf7e4c'],
}
EDGES = {
    'archer-male': ['#63373d'],
    'cleric-female': ['#87392f'],
    'cleric-male': ['#dac880'],
    'mage-female': ['#e2a769', '#f1d794', '#8c482b'],
    'mage-male': ['#88271a', ('#905a3a', 18)],
    'shadow-female': ['#6d361f'],
    'shadow-male': ['#5e372c', '#4c211a', '#3b1819'],
    'warrior-female': ['#e8cda5', '#fdac5c'],
    'warrior-male': ['#b17b44', '#7e321d', ('#824f2d', 18)],
}
PIXELS = {
    # The Archer's small face: its lights share the hood's colours.
    'archer-male': {
        0: [(27, 18), (27, 19), (28, 20), (28, 21), (27, 23)],
        1: [(28, 19), (28, 20), (26, 22), (27, 22)],
        2: [(27, 18), (27, 19), (28, 20), (28, 21), (28, 22), (25, 21), (27, 23)],
        3: [(28, 19), (28, 20), (26, 22), (27, 22)],
    },
    # The nose and the chin's edge, the shoulder's light, the shadow under
    # the chin, the outlines of the arms, hands and feet, the toes' light,
    # and in the passing frames the foot under the robe.
    'cleric-female': {
        0: [(29, 19), (29, 20), (29, 22), (20, 23), (22, 23), (28, 23), (21, 24), (27, 24), (28, 24),
            (20, 25), (19, 27), (16, 32), (17, 32), (19, 38), (31, 39), (32, 39), (28, 41), (30, 41)],
        1: [(24, 22), (19, 23), (27, 23), (28, 23), (21, 25), (21, 26), (21, 27), (17, 28), (18, 28),
            (19, 31), (20, 32), (22, 40), (23, 40), (24, 40), (22, 41), (23, 41), (24, 41), (25, 41)],
        2: [(29, 19), (29, 22), (23, 23), (28, 23), (23, 25), (21, 26), (24, 27), (22, 31), (26, 31),
            (23, 32), (24, 33), (25, 33), (30, 37), (30, 38), (17, 40), (20, 40), (20, 41)],
        3: [(29, 21), (22, 22), (24, 22), (28, 22), (19, 23), (28, 23), (21, 25), (21, 26), (21, 27),
            (19, 31), (20, 31), (22, 40), (23, 40), (24, 40), (22, 41), (23, 41), (24, 41), (25, 41)],
    },
    # A light on the cheek, and the far hand at the hip.
    'mage-male': {0: [(26, 22), (28, 28), (29, 28), (28, 29), (29, 29)], 1: [(26, 28)], 2: [(26, 22)], 3: [(26, 28)]},
    # Lights on the cheek, the lips, and the far foot under the dress.
    'mage-female': {
        0: [(28, 21), (28, 22), (29, 21), (29, 22), (20, 38), (21, 38)],
        1: [(28, 20), (28, 21), (29, 20), (28, 22), (26, 38), (27, 38)],
        2: [(29, 21)],
        3: [(28, 20), (29, 20), (28, 21), (29, 21), (26, 38), (27, 38)],
    },
    # Lights on the forehead and the hands, the temple, the nose, the
    # elbows, and the far hand.
    'shadow-male': {
        0: [(24, 16), (27, 16), (26, 18), (26, 27), (28, 27), (14, 28), (15, 30)],
        1: [(26, 14), (28, 14), (28, 17), (29, 18), (18, 25), (19, 25)],
        2: [(27, 16), (26, 18), (22, 28), (21, 29)],
        3: [(26, 14), (28, 14), (28, 17), (24, 18), (29, 18), (18, 25), (19, 25), (20, 30)],
    },
    # Dark red outlines of the ear, the face and the hands, a light on the
    # hand, and the far hand.
    'shadow-female': {
        0: [(23, 19), (21, 20), (23, 20), (29, 20), (23, 21), (16, 32), (28, 28), (29, 28), (29, 29), (30, 29), (28, 30)],
        1: [(23, 19), (20, 29)],
        2: [(23, 19), (23, 20), (22, 21), (23, 21), (23, 31), (21, 31)],
        3: [(23, 19), (23, 20), (19, 29), (20, 29)],
    },
    # The cheek by the right eye, red outlines of the face, hands and feet,
    # a light on the arm.
    'warrior-female': {
        0: [(26, 18), (26, 19), (15, 31), (30, 40), (30, 19), (29, 22), (29, 23), (30, 28), (30, 29), (27, 41)],
        1: [(30, 18), (29, 21), (20, 32)],
        2: [(30, 19), (29, 22), (22, 27), (20, 27), (20, 39)],
        3: [(29, 21), (29, 22)],
    },
    # Cream lights on the chin, the shoulder and the toes, the neck, and the
    # red outlines of the far hand and the feet in shadow.
    'warrior-male': {
        0: [(25, 20), (26, 20), (27, 20), (25, 21), (27, 21), (20, 22), (18, 24), (29, 27), (30, 27),
            (29, 37), (20, 38), (21, 38)],
        1: [(25, 17), (28, 18), (26, 19), (21, 21), (21, 22), (26, 38)],
        2: [(25, 19), (28, 19), (26, 20), (26, 21), (30, 36), (29, 37), (28, 38)],
        3: [(28, 17), (28, 18), (26, 19), (21, 21), (21, 22), (21, 37), (26, 38)],
    },
}
NOT_PIXELS = {
    'archer-male': {0: [(22, 37), (23, 37)], 2: [(21, 39)]},  # the back boot
    'archer-female': {1: [(16, 21)], 2: [(27, 25), (27, 27)], 3: [(16, 21)]},  # the cloak, the clasp
    'cleric-female': {1: [(24, 28), (26, 28)]},  # the belt
    'shadow-male': {0: [(26, 19)], 1: [(25, 16)], 3: [(25, 16)]},  # between the eyes, an eyebrow
    'shadow-female': {0: [(22, 12)], 1: [(22, 12), (26, 13)], 2: [(22, 12)], 3: [(22, 11)]},  # the hair
    'warrior-female': {1: [(20, 15)], 2: [(21, 8)]},  # the hair
}
FRAME = 48
STEPS = 2

# The ramp and its colours as tools/skin-tones.py reads them (without
# leaving a compiled copy of it in tools/).
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('skin_tones', os.path.join(ROOT, 'tools', 'skin-tones.py'))
skin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(skin)


def skin_pixels(im, name):
    px = im.load()
    tops = {skin.rgb(code): 0 for code in SKIN[name] if isinstance(code, str)}
    tops.update({skin.rgb(code): row for code, row in (item for item in SKIN[name] if not isinstance(item, str))})
    edges = {skin.rgb(code): 0 for code in EDGES.get(name, []) if isinstance(code, str)}
    edges.update({skin.rgb(code): row for code, row in (item for item in EDGES.get(name, []) if not isinstance(item, str))})
    found = {(x, y) for y in range(im.height) for x in range(im.width) if px[x, y][3] and y >= tops.get(px[x, y][:3], im.height)}
    for _ in range(STEPS):
        found |= {
            (x, y)
            for y in range(im.height)
            for x in range(im.width)
            if px[x, y][3] and y >= edges.get(px[x, y][:3], im.height) and any((x + dx, y + dy) in found for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        }
    sheet = lambda lists: {(frame * FRAME + x, y) for frame, frame_pixels in lists.get(name, {}).items() for x, y in frame_pixels}
    return (found | sheet(PIXELS)) - sheet(NOT_PIXELS)


def main():
    tones = json.load(open(os.path.join(ROOT, 'data', 'skins.json'), encoding='utf8'))['skins']
    masks = []
    for name in sorted(SKIN):
        im = Image.open(os.path.join(WALKERS, f'{name}.png')).convert('RGBA')
        pixels = skin_pixels(im, name)
        lums = {c: skin.luminance(c) for c in {im.getpixel(p)[:3] for p in pixels}}
        listed = {skin.rgb(item if isinstance(item, str) else item[0]) for item in SKIN[name] + EDGES.get(name, [])}
        low = min(lum for c, lum in lums.items() if c in listed)
        high = max(lum for c, lum in lums.items() if c in listed)
        for tone in tones:
            if not tone.get('ramp'):
                continue
            ramp = [skin.rgb(code) for code in tone['ramp']]
            out = im.copy()
            po = out.load()
            for x, y in pixels:
                c = po[x, y]
                lum = lums[c[:3]]
                if lum < low:
                    po[x, y] = (*(round(v * lum / low) for v in ramp[0]), c[3])
                else:
                    po[x, y] = (*skin.on_ramp(ramp, min(1, (lum - low) / (high - low or 1))), c[3])
            out.save(os.path.join(WALKERS, f"{name}-{tone['id']}.png"), optimize=True)
        mask = im.copy()
        for x, y in pixels:
            mask.putpixel((x, y), (255, 0, 255, 255))
        masks.append(mask)
        print(name, len(pixels), 'pixels of skin')
    if '--mask' in sys.argv:
        w, h = masks[0].size
        sheet = Image.new('RGBA', (w * 3, (h * 3 + 6) * len(masks)), (18, 24, 20, 255))
        for i, m in enumerate(masks):
            sheet.alpha_composite(m.resize((w * 3, h * 3), Image.NEAREST), (0, i * (h * 3 + 6)))
        sheet.save(sys.argv[sys.argv.index('--mask') + 1])


main()

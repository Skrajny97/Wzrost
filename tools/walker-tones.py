# Recolours the skin of the walking figures of the Walka scene
# (src/client/art/walkers, drawn from the portraits) to the tones of
# data/skins.json, one file per figure and tone: <class>-<look>-<tone>.png
# next to the figure, as tools/skin-tones.py does for the portraits.
#
# A figure is small and its skin has few colours, picked by hand from the
# figure's palette below (face, arms, bare legs), so hair, leather, a cream
# shirt or a rope belt of a close colour keep theirs. A colour the hair
# shares counts from a row down (code, row). Each skin colour keeps its place
# between the darkest and the lightest of them, on the tone's ramp from
# shadow to light.
#
# Usage: python3 tools/walker-tones.py [--mask out.png]
import importlib.util, json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WALKERS = os.path.join(ROOT, 'src', 'client', 'art', 'walkers')
SKIN = {
    'archer-female': ['#f4c3a7', '#8e402d'],
    'archer-male': ['#fce0d4', '#d27a6c', '#8a424c'],
    'cleric-female': ['#df9362', '#c06d4e'],
    'cleric-male': ['#e5aa5c', '#b77d3e', '#8d3d2b'],
    'mage-female': ['#f7bb90', '#cd845b', '#a9543e'],
    'mage-male': ['#fcc691', '#f7a56f', ('#e17a4f', 13), '#c45640'],
    'shadow-female': ['#fcc1a0', '#d37a60', '#9a4b3b'],
    'shadow-male': ['#f4d1be', '#eab390', '#dda993', '#d0907c', '#9d5540'],
    'warrior-female': ['#e2896e', '#c36e55', '#97453d'],
    'warrior-male': ['#f8b779', '#cf7e4c'],
}

# The ramp and its colours as tools/skin-tones.py reads them (without
# leaving a compiled copy of it in tools/).
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('skin_tones', os.path.join(ROOT, 'tools', 'skin-tones.py'))
skin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(skin)


def main():
    tones = json.load(open(os.path.join(ROOT, 'data', 'skins.json'), encoding='utf8'))['skins']
    masks = []
    for name, codes in sorted(SKIN.items()):
        im = Image.open(os.path.join(WALKERS, f'{name}.png')).convert('RGBA')
        px = im.load()
        tops = {skin.rgb(code): 0 for code in codes if isinstance(code, str)}
        tops.update({skin.rgb(code): row for code, row in (item for item in codes if not isinstance(item, str))})
        lums = {c: skin.luminance(c) for c in tops}
        low, high = min(lums.values()), max(lums.values())
        pixels = [(x, y) for y in range(im.height) for x in range(im.width) if px[x, y][3] and y >= tops.get(px[x, y][:3], im.height)]
        for tone in tones:
            if not tone.get('ramp'):
                continue
            out = im.copy()
            po = out.load()
            for x, y in pixels:
                c = po[x, y]
                t = (lums[c[:3]] - low) / (high - low or 1)
                po[x, y] = (*skin.on_ramp([skin.rgb(code) for code in tone['ramp']], t), c[3])
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

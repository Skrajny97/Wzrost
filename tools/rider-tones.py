# Recolours the skin of the riders of the Walka scene
# (src/client/art/riders/<id>.png, one picture each, drawn by Retro Diffusion
# on the riding skeleton, tools/ride-skeleton.py) to the tones of
# data/skins.json, one file per rider and tone: <id>-<tone>.png next to it.
#
# The same way as tools/walk-tones.py does it for the walks, with its
# functions: a colour of the rider is skin when the nearest colour of the
# portrait of its look (in Lab) is skin in most of the portrait's pixels of
# that colour, and the skin's shades the colours miss count next to it.
# tools/rider-tones.json corrects what that gets wrong, rider by rider, with
# the walks' keys that need no skeleton: colours to "add" or "drop", boxes of
# the picture that are "not" skin or the "only" ones that are, "open",
# "near_not", "rims_below", "span", "pixels" and "not_pixels" (under the
# frame "0").
#
# Usage: python3 tools/rider-tones.py [--ids a,b] [--check OUT_DIR]
import importlib.util
import json
import os
import sys

from PIL import Image

# walk-tones.py is loaded as a module; no __pycache__ left in tools/.
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('walk_tones', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'walk-tones.py'))
walk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(walk)

RIDERS = os.path.join(walk.ROOT, 'src', 'client', 'art', 'riders')


def main():
    path = os.path.join(walk.ROOT, 'tools', 'rider-tones.json')
    fixes = json.load(open(path, encoding='utf8')) if os.path.exists(path) else {}
    fixes.pop('$comment', None)
    tones = [t for t in json.load(open(os.path.join(walk.ROOT, 'data', 'skins.json'), encoding='utf8'))['skins'] if t.get('ramp')]
    tone_ids = {t['id'] for t in tones}
    drawn = sorted(f[:-4] for f in os.listdir(RIDERS) if f.endswith('.png') and f[:-4].rsplit('-', 1)[-1] not in tone_ids)
    ids = sys.argv[sys.argv.index('--ids') + 1].split(',') if '--ids' in sys.argv else drawn
    check = sys.argv[sys.argv.index('--check') + 1] if '--check' in sys.argv else None
    for name in ids:
        im = Image.open(os.path.join(RIDERS, f'{name}.png')).convert('RGBA')
        walk.save_indexed(im, os.path.join(RIDERS, f'{name}.png'))
        fix = fixes.get(name, {})
        colours = walk.skin_colours(im, name, fix)
        skin = walk.skin_pixels(im, colours, fix)
        lums = [walk.luminance(im.getpixel(p)[:3]) for p in skin]
        low, high = (min(lums), max(lums)) if lums else (1, 1)
        span = fix.get('span', [0, 1])
        rims = walk.rim_pixels(im, skin, low, fix.get('rims_below', 1))
        toned = {}
        for tone in tones:
            out = walk.recolour(im, skin, rims, low, high, [walk.rgb(code) for code in tone['ramp']], span)
            walk.save_indexed(out, os.path.join(RIDERS, f"{name}-{tone['id']}.png"))
            toned[tone['id']] = out
        if check:
            walk.check_sheet(im, [toned['grey'], toned['dark']], skin, rims, os.path.join(check, f'{name}.png'))
        print(name, len(skin), 'pixels of skin,', len(rims), 'of rim,', ' '.join(sorted(map(walk.hexa, colours))))


if __name__ == '__main__':
    main()

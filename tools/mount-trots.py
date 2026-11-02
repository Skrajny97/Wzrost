"""Makes the trots of the Stajnia's mounts for the Walka scene from the
PixelLab drafts (tools/animate-mounts.mjs, kept on the art-drafts branch
under art/drafts/mounts-pixellab): for each mount in art/mounts.json with a
"trot", the chosen frames side by side in src/client/art/scenes/mounts/<id>.png
and its entry in data/animations.json (walk.mounts): the frame's size, the
frames, their speed and the saddle's place in each frame, where the rider's
seat goes (art/references/riders/skeleton.json).

A "trot" in art/mounts.json:
  "draft": the drafts' name without the frame number (<id>-<stamp>-<seed>),
  "frames": the frame numbers in the loop's order (the ones that close the
            loop best: the last flows into the first),
  "seat": x, y of the saddle in the first of them, by hand; in the others it
          is found by sliding the saddle's patch over the frame
          (tools/ride-sheets.py),
  "fps": the frames a second,
  "clean": boxes [left, top, right, bottom) where reddish pixels PixelLab
           left (the steed's ears turned red) take the colour "to";
           and specks cut off from the mount go in every frame;
  "dir": the drafts' folder next to DRAFTS_DIR when not that one (the
         posed walks of tools/animate-mounts-skeleton.mjs are in
         mounts-skeleton);
  "seat_in": "start" when "seat" is the saddle in the start frame
             (art/references/mounts) rather than in the first frame;
  "patch": gaps in the mount where the background shows through (the
           pony's back between its rump and saddle): boxes [left, top,
           right, bottom) of the start frame, moved in each frame with the
           saddle; a clear pixel in one with the mount on both sides and
           below takes the coat colour "coat" ("left": the colour of the
           mount on the gap's left, not its outline), and the "outline",
           if given, where it meets the clear above ("seam": the outline
           on the gap's left, inside the mount now, takes the coat beside
           it); a deep gap fills from the bottom up. The Stajnia's picture
           takes the same patch;
  "graft": parts of a frame drawn anew from another frame of the loop:
           {"frame": n, "from": m, "box": [left, top, right, bottom),
           "shift": [x, y]}, frames counted from 1 in the loop's order;
  "picture": the frame of the loop (counted from 1) that is the mount's
             picture on its card in the Stajnia and the Sklep Systemu, cut
             to the mount, so the card shows the mount as it walks.

    python3 -I tools/mount-trots.py [DRAFTS_DIR]

DRAFTS_DIR (art/drafts/mounts-pixellab by default) holds the drafts'
frames, e.g. after `git fetch origin art-drafts` and
`git archive FETCH_HEAD art/drafts/mounts-pixellab | tar -x`.
"""
import colorsys
import importlib.util
import json
import os
import sys
from collections import deque

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True


def load_module(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'tools', file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ride = load_module('ride_sheets', 'ride-sheets.py')
walk = load_module('walk_tones', 'walk-tones.py')


def clean(frame, rules):
    px = frame.load()
    W, H = frame.size
    seen, parts = set(), []
    for y in range(H):
        for x in range(W):
            if px[x, y][3] >= 40 and (x, y) not in seen:
                todo, part = deque([(x, y)]), []
                seen.add((x, y))
                while todo:
                    cx, cy = todo.popleft()
                    part.append((cx, cy))
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            n = (cx + dx, cy + dy)
                            if 0 <= n[0] < W and 0 <= n[1] < H and n not in seen and px[n][3] >= 40:
                                seen.add(n)
                                todo.append(n)
                parts.append(part)
    parts.sort(key=len, reverse=True)
    for part in parts[1:]:
        for p in part:
            px[p] = (0, 0, 0, 0)
    for rule in rules:
        x0, y0, x1, y1 = rule['box']
        to = walk.rgb(rule['to'])
        for y in range(y0, y1):
            for x in range(x0, x1):
                r, g, b, a = px[x, y]
                if a < 40:
                    continue
                h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
                if (h < 0.06 or h > 0.92) and s > 0.3 and l > 0.1:
                    px[x, y] = (*to, 255)
    return frame


def patch(frame, rules, shift):
    px = frame.load()
    W, H = frame.size
    opaque = lambda x, y: 0 <= x < W and 0 <= y < H and px[x, y][3] >= 128
    dx, dy = shift
    original = frame.copy()
    drawn = original.load()
    for rule in rules:
        x0, y0, x1, y1 = rule['box']
        x0, y0, x1, y1 = x0 + dx, y0 + dy, x1 + dx, y1 + dy

        def coat(x, y):
            # "left": the coat of the mount's part on the left of the gap
            # (the rump's piebald goes on under the saddle), not its outline.
            if rule['coat'] == 'left':
                for k in range(1, x - x0 + 4):
                    if 0 <= x - k < W:
                        r, g, b, a = drawn[x - k, y]
                        if a >= 128 and r * 299 + g * 587 + b * 114 >= 30000:
                            return (r, g, b)
                return walk.rgb(rule.get('fallback', '6c3820'))
            return walk.rgb(rule['coat'])

        filled = []
        # A gap deeper than a few pixels (the pony's back behind the
        # saddle) fills from the bottom up: each pass fills what has the
        # mount on both sides and below, the pixels filled before counting.
        while True:
            found = []
            for y in range(max(0, y0), min(H, y1)):
                for x in range(max(0, x0), min(W, x1)):
                    if opaque(x, y):
                        continue
                    left = any(opaque(x - k, y) for k in range(1, x - x0 + 4))
                    right = any(opaque(x + k, y) for k in range(1, x1 - x + 4))
                    below = any(opaque(x, y + k) for k in range(1, 6))
                    if left and right and below:
                        found.append((x, y))
            if not found:
                break
            for (x, y) in found:
                px[x, y] = (*coat(x, y), 255)
            filled += found
        if rule.get('seam'):
            # The outline of the part on the gap's left (the rump's edge)
            # is inside the mount now: it takes the coat next to it.
            dark = lambda p: p[3] >= 128 and p[0] * 299 + p[1] * 587 + p[2] * 114 < 30000
            for (x, y) in filled:
                if x >= 2 and dark(drawn[x - 1, y]) and drawn[x - 2, y][3] >= 128 and not dark(drawn[x - 2, y]):
                    px[x - 1, y] = drawn[x - 2, y][:3] + (255,)
        if rule.get('outline'):
            line = walk.rgb(rule['outline'])
            for (x, y) in filled:
                if not opaque(x, y - 1):
                    px[x, y] = (*line, 255)
    return frame


def graft(frame, source, rule):
    """A part of the loop's frame `frame` drawn anew from another one: the
    box [left, top, right, bottom) of `frame` cleared, and `source`'s box
    put there moved by "shift" [x, y] (the tiger's first frame lost the
    black tip of its tail; the author: "ma ucięty odrobinę ogon")."""
    left, top, right, bottom = rule['box']
    dx, dy = rule.get('shift', [0, 0])
    out = frame.copy()
    px = out.load()
    for y in range(top, bottom):
        for x in range(left, right):
            px[x, y] = (0, 0, 0, 0)
    part = source.crop((left, top, right, bottom))
    out.alpha_composite(part, (left + dx, top + dy))
    return out


def main():
    drafts = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'art', 'drafts', 'mounts-pixellab')
    config = json.load(open(os.path.join(ROOT, 'art', 'mounts.json'), encoding='utf8'))
    data_path = os.path.join(ROOT, 'data', 'animations.json')
    out_dir = os.path.join(ROOT, 'src', 'client', 'art', 'scenes', 'mounts')
    os.makedirs(out_dir, exist_ok=True)
    mounts = {}
    for mount_id, mount in config['mounts'].items():
        trot = mount.get('trot')
        if not trot:
            continue
        folder = os.path.join(os.path.dirname(drafts), trot['dir']) if trot.get('dir') else drafts
        frames = [clean(Image.open(os.path.join(folder, f"{trot['draft']}-{n}.png")).convert('RGBA'), trot.get('clean', [])) for n in trot['frames']]
        for rule in trot.get('graft', []):
            frames[rule['frame'] - 1] = graft(frames[rule['frame'] - 1], frames[rule['from'] - 1], rule)
        width, height = frames[0].size
        if trot.get('seat_in') == 'start':
            # The posed frames (tools/animate-mounts-skeleton.mjs) are all
            # new drawings: the saddle is looked for from the start frame.
            start = Image.open(os.path.join(ROOT, mount['start'])).convert('RGBA')
            seats = ride.seats([start] + frames, tuple(trot['seat']))[1:]
        else:
            seats = ride.seats(frames, tuple(trot['seat']))
        if trot.get('patch'):
            sx, sy = trot['seat'] if trot.get('seat_in') == 'start' else seats[0]
            frames = [patch(frame, trot['patch'], (x - sx, y - sy)) for frame, (x, y) in zip(frames, seats)]
            # The Stajnia's picture is the start frame cut to the mount.
            start = Image.open(os.path.join(ROOT, mount['start'])).convert('RGBA')
            picture = patch(start.copy(), trot['patch'], (0, 0)).crop(start.getbbox())
            picture.save(os.path.join(ROOT, 'src', 'client', 'art', 'mounts', f'{mount_id}.png'), optimize=True)
        if trot.get('picture'):
            # The picture on the mount's card (the Stajnia, the Sklep Systemu)
            # is a frame of its walk ("picture", counted from 1), cut to the
            # mount, so the card shows it as it walks in the game (the
            # author: "zmienić wygląd w karcie na najnowszy, jeśli jest nowy").
            shown = frames[trot['picture'] - 1]
            shown.crop(shown.getbbox()).save(os.path.join(ROOT, 'src', 'client', 'art', 'mounts', f'{mount_id}.png'), optimize=True)
        sheet = Image.new('RGBA', (width * len(frames), height), (0, 0, 0, 0))
        for index, frame in enumerate(frames):
            sheet.alpha_composite(frame, (index * width, 0))
        walk.save_indexed(sheet, os.path.join(out_dir, f'{mount_id}.png'))
        mounts[mount_id] = {
            'file': f'art/scenes/mounts/{mount_id}.png',
            'width': width,
            'height': height,
            'frames': len(frames),
            'fps': trot['fps'],
            'seats': [list(seat) for seat in seats],
        }
        print(mount_id, len(frames), 'frames', [list(seat) for seat in seats])
    # Only walk.mounts changes, in the file's own style: an entry a line.
    text = open(data_path, encoding='utf8').read()
    start = text.index('"mounts": ', text.index('"walk"')) + len('"mounts": ')
    _, length = json.JSONDecoder().raw_decode(text[start:])
    lines = [f'      {json.dumps(key)}: {json.dumps(value, ensure_ascii=False).replace("{", "{ ").replace("}", " }")}' for key, value in mounts.items()]
    block = '{\n' + ',\n'.join(lines) + '\n    }' if lines else '{}'
    open(data_path, 'w', encoding='utf8').write(text[:start] + block + text[start + length:])


if __name__ == '__main__':
    main()

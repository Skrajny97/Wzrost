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
             (art/references/mounts) rather than in the first frame.

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
        width, height = frames[0].size
        if trot.get('seat_in') == 'start':
            # The posed frames (tools/animate-mounts-skeleton.mjs) are all
            # new drawings: the saddle is looked for from the start frame.
            start = Image.open(os.path.join(ROOT, mount['start'])).convert('RGBA')
            seats = ride.seats([start] + frames, tuple(trot['seat']))[1:]
        else:
            seats = ride.seats(frames, tuple(trot['seat']))
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

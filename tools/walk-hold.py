"""Writes the skeletons of the walks whose figure holds something still
(art/walks.json, a character's "hold"), into art/walk-poses.json, which
tools/animate-walks.mjs uses in place of the shared skeleton for them.

An arm that carries a staff, a shield or a bow keeps the pose it has in the
start frame and moves only with the body, by the neck's bob, instead of
swinging: PixelLab draws what the hand holds in the same hand in every
frame, and the held thing can be laid over each frame from one drawing (the
author on 775.2 v4: „kostur przeskakuje z ręki do ręki”, on 775.7 and 775.8:
„tarcza się zacina”). A hold names the arm ("right" is the near one, the
figure facing right) with its elbow and hand in the start frame's pixels:
  "hold": {"right": {"elbow": [73, 56], "hand": [86, 60]}}
and may sway the hand a few pixels back and forth with the step
("sway": 2), so the arm is not stiff. The other arm may swing less than the
shared skeleton's ("swing": {"left": 0.6}), so the free hand does not reach
the held thing. Needs Python 3:
  python3 tools/walk-hold.py"""
import json

walks = json.load(open('art/walks.json', encoding='utf-8'))
skeleton = json.load(open(walks['skeleton'], encoding='utf-8'))
size = skeleton['size']


def joint(pose, label):
    return next(p for p in pose if p['label'] == label)


def mean_of(label):
    points = [joint(frame, label) for frame in skeleton['frames']]
    return sum(p['x'] for p in points) / len(points), sum(p['y'] for p in points) / len(points)


def held(pose, key, hold, swing, scale):
    # The arm keeps its start-frame pose, moved as the neck moves from the key
    # pose, and sways with the step if asked; a free arm swings `scale` times
    # as far about its middle as the shared skeleton's.
    neck, key_neck = joint(pose, 'NECK'), joint(key, 'NECK')
    dx, dy = neck['x'] - key_neck['x'], neck['y'] - key_neck['y']
    out = []
    for point in pose:
        point = dict(point)
        for side, k in scale.items():
            if point['label'] in (f'{side.upper()} ELBOW', f'{side.upper()} ARM'):
                mx, my = mean_of(point['label'])
                point['x'] = round(mx + (point['x'] - mx) * k, 4)
                point['y'] = round(my + (point['y'] - my) * k, 4)
        for side, arm in hold.items():
            sway = arm.get('sway', 0) * swing / size
            if point['label'] == f'{side.upper()} ELBOW':
                point['x'] = round(arm['elbow'][0] / size + dx + sway / 2, 4)
                point['y'] = round(arm['elbow'][1] / size + dy, 4)
            if point['label'] == f'{side.upper()} ARM':
                point['x'] = round(arm['hand'][0] / size + dx + sway, 4)
                point['y'] = round(arm['hand'][1] / size + dy, 4)
        out.append(point)
    return out


poses = {}
for cid, character in walks['characters'].items():
    hold = character.get('hold')
    if not hold:
        continue
    key = skeleton['keys'][character['pose'] - 1]
    # The swing of the free near hand in each frame, -1 (back) to 1 (forward),
    # paces a held hand's sway with the step.
    xs = [joint(frame, 'RIGHT ARM')['x'] for frame in skeleton['frames']]
    mid, half = (max(xs) + min(xs)) / 2, (max(xs) - min(xs)) / 2
    swings = [(x - mid) / half for x in xs]
    key_swing = (joint(key, 'RIGHT ARM')['x'] - mid) / half
    scale = character.get('swing', {})
    poses[cid] = {
        'first': held(key, key, hold, 0, scale),
        'frames': [held(frame, key, hold, swing - key_swing, scale) for frame, swing in zip(skeleton['frames'], swings)],
    }

# One line per character after the comment, so the file stays valid JSON
# also with no walk holding anything.
comment = '"Skeletons of the walks whose figure holds something still: written by tools/walk-hold.py from art/walks.json (hold) and the shared skeleton; used by tools/animate-walks.mjs."'
entries = [f'  "$comment": {comment}'] + [f'  {json.dumps(cid)}: {json.dumps(pose)}' for cid, pose in poses.items()]
with open('art/walk-poses.json', 'w', encoding='utf-8') as f:
    f.write('{\n' + ',\n'.join(entries) + '\n}\n')
print(len(poses), 'skeletons:', ', '.join(poses))

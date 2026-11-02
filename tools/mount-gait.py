"""Writes the steps of the mounts' walk or trot as skeletons, frame by frame,
for PixelLab to draw the mount in each pose (tools/animate-mounts-skeleton.mjs).
The author saw the text animations limp: their legs drifted out of step.
Here every leg follows the same loop at its own moment of the cycle:

- trot (the horses): two beats, the diagonal pairs together (front left
  with hind right, then front right with hind left), the body lowest when
  a pair stands under it, so it rises and falls twice a cycle;
- walk (the tiger): four beats, one paw after another (hind left, front
  left, hind right, front right), the body nearly level, the head nodding.

A hoof or paw stands on the ground and slides back under the body (the
mount trots in place, the ground going by), then lifts and swings forward;
the knee follows by two-bone reach from the shoulder or hip, bending the
way it bends in the start frame. The legs' joints are the four-legged
templates' (horse, lion): the front legs on the arms' joints (SHOULDER,
ELBOW, ARM), the hind legs on the legs' (HIP, KNEE, LEG).

    python3 -I tools/mount-gait.py SKELETONS_DIR [--ids pony,horse]

SKELETONS_DIR holds <id>-skeleton.json from the estimate step
(art/drafts/mounts-skeleton). Each mount's gait, frames and sizes are in
art/mounts.json under "gait"; a joint the estimate put wrong can be set by
hand there ("fix": {"LABEL": [x, y]} in pixels of the start frame), and
"cross": true makes the two legs of a pair swing around one place, so they
pass each other (the tiger stood with its hind legs apart and they never
crossed). "stride", "lift", "bob" and "nod" size the steps (shares of a
leg's length); "crouch", "roll" and "head_drop" lower the body and the head
and rock the shoulders (the author saw that as a tiger stalking with broken
legs). A big cat's walk ("pendulum"): the body is not lowered; the
shoulder or hip stays as high as in the start frame while the leg reaches
the paw and goes lower over a paw too far ahead or behind, as over a stilt,
a hind paw standing a little "behind" the hip; "fold": a front leg stands
on a straight wrist, its paw folding back under it while it swings (the
estimate puts the front legs' middle joint halfway down; "fix" moves it to
the wrist). Writes art/mount-gaits.json.
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEGS = {
    'front_left': ('LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM'),
    'front_right': ('RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM'),
    'hind_left': ('LEFT HIP', 'LEFT KNEE', 'LEFT LEG'),
    'hind_right': ('RIGHT HIP', 'RIGHT KNEE', 'RIGHT LEG'),
}
# Each leg's moment in the cycle (0-1): when its hoof touches down.
PHASES = {
    'trot': {'front_left': 0.0, 'hind_right': 0.0, 'front_right': 0.5, 'hind_left': 0.5},
    'walk': {'hind_left': 0.0, 'front_left': 0.25, 'hind_right': 0.5, 'front_right': 0.75},
}
# The share of the cycle a hoof stands on the ground.
STANCE = {'trot': 0.5, 'walk': 0.65}
HEAD = ('NOSE', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR')


def reach(top, end, upper, lower, bend):
    """The middle joint of a two-bone leg from `top` to `end`, on the side
    `bend` (+1 or -1) of the line between them."""
    dx, dy = end[0] - top[0], end[1] - top[1]
    d = max(1e-6, min(math.hypot(dx, dy), upper + lower - 1e-6))
    a = (upper * upper - lower * lower + d * d) / (2 * d)
    h = math.sqrt(max(0.0, upper * upper - a * a))
    ux, uy = dx / d, dy / d
    mx, my = top[0] + a * ux, top[1] + a * uy
    return (mx - bend * h * uy, my + bend * h * ux)


def foot(phase, stance, stride, lift):
    """Where a hoof is, relative to its standing place, at `phase` (0 = just
    down, in front): back along the ground while it stands, then up and
    forward."""
    if phase < stance:
        t = phase / stance
        return (stride * (0.5 - t), 0.0)
    t = (phase - stance) / (1 - stance)
    return (stride * (t - 0.5), -lift * math.sin(math.pi * t))


def gait(points, size, spec):
    w, h = size
    pos = {p['label']: (p['x'] * w, p['y'] * h) for p in points}
    for label, xy in spec.get('fix', {}).items():
        pos[label] = tuple(xy)
    kind = spec['kind']
    frames = spec['frames']
    legs = {}
    for leg, (top, mid, end) in LEGS.items():
        t, m, e = pos[top], pos[mid], pos[end]
        legs[leg] = {
            'upper': math.dist(t, m),
            'lower': math.dist(m, e),
            # A front leg folds with its knee forward (the mount faces
            # right), a hind leg with its hock back.
            'bend': -1 if leg.startswith('front') else 1,
            'top': t,
            'rest': e,
        }
    base = dict(pos)
    if spec.get('cross'):
        # The two legs of a pair swing around one place under the body, so
        # they pass each other, as a walking cat's paws do; the start frame
        # may stand with them apart. Seen from the side, the two hips (and
        # the two shoulders) are one above the other.
        for pair, top in (('front', 'SHOULDER'), ('hind', 'HIP')):
            left, right = legs[f'{pair}_left'], legs[f'{pair}_right']
            tx = (base[f'LEFT {top}'][0] + base[f'RIGHT {top}'][0]) / 2
            # Halfway between where the paws stand and under the joint above,
            # so a leg does not lean back the whole step; under the joint
            # for a big cat, so the body rises and falls evenly.
            if spec.get('pendulum'):
                # Each paw on its own ground line (the far legs stand higher
                # in the picture), a front paw under the shoulder, a hind paw
                # a little behind the hip ("behind", a share of the leg).
                x = tx - (spec.get('behind', 0) * (left['upper'] + left['lower']) if pair == 'hind' else 0)
                left['rest'], right['rest'] = (x, left['rest'][1]), (x, right['rest'][1])
            else:
                x = ((left['rest'][0] + right['rest'][0]) / 2 + tx) / 2
                y = max(left['rest'][1], right['rest'][1])
                left['rest'] = right['rest'] = (x, y)
            for side in ('LEFT', 'RIGHT'):
                base[f'{side} {top}'] = (tx, base[f'{side} {top}'][1])
    length = sum(l['upper'] + l['lower'] for l in legs.values()) / 4
    stride = spec.get('stride', 0.45 if kind == 'trot' else 0.4) * length
    lift = spec.get('lift', 0.22 if kind == 'trot' else 0.14) * length
    bob = spec.get('bob', 0.04 if kind == 'trot' else 0.015) * length
    nod = spec.get('nod', 0.02 if kind == 'trot' else 0.04) * length
    # A big cat walks low: the body lowered on bent legs ("crouch"), the
    # shoulder or hip above a standing leg higher than above a swinging one
    # ("roll"), the head carried low ("head_drop").
    crouch = spec.get('crouch', 0) * length
    roll = spec.get('roll', 0) * length
    head_drop = spec.get('head_drop', 0) * length
    pendulum = spec.get('pendulum', False)
    fold = spec.get('fold', False)
    out = []
    for i in range(frames):
        phi = i / frames
        # The body: lowest when a pair stands under it (trot), or a slight
        # sway with each step (walk).
        dy = bob * math.cos(2 * math.pi * phi * (2 if kind == 'trot' else 4)) + crouch
        head = nod * math.sin(2 * math.pi * phi * 2) + head_drop
        frame = dict(base)
        for label, (x, y) in base.items():
            frame[label] = (x, y + dy + (head if label in HEAD else 0))
        lifted = {}
        for leg, (top, mid, end) in LEGS.items():
            info = legs[leg]
            phase = (phi - PHASES[kind][leg]) % 1
            fx, fy = foot(phase, STANCE[kind], stride, lift * (1.15 if leg.startswith('front') else 1))
            if roll:
                tx, ty = frame[top]
                frame[top] = (tx, ty - roll * math.cos(2 * math.pi * (phase - STANCE[kind] / 2)))
            e = (info['rest'][0] + fx, info['rest'][1] + fy)
            longest = 0.97 * (info['upper'] + info['lower'])
            if pendulum:
                # The shoulder or hip stays as high as in the start frame
                # while the leg reaches the paw, and goes lower when the paw
                # is too far ahead or behind for it, as over a stilt (the
                # front legs stand straight); while the paw swings it goes
                # from where it was at the lift to where it will be at the
                # touch.
                tx = frame[top][0]
                stilt = 0.995 * (info['upper'] + info['lower'])
                over = lambda x: max(base[top][1], info['rest'][1] - math.sqrt(max(0.0, stilt * stilt - (x - tx) ** 2)))
                if phase < STANCE[kind]:
                    ty = over(e[0])
                else:
                    k = (phase - STANCE[kind]) / (1 - STANCE[kind])
                    ty = over(info['rest'][0] - stride / 2) * (1 - k) + over(info['rest'][0] + stride / 2) * k
                lifted[leg] = ty - base[top][1]
                frame[top] = (tx, ty)
                longest = stilt * 1.0001
            t = frame[top]
            # The leg cannot stretch: a hoof too far for it rises a little,
            # as a hoof does when it rolls over at the end of a step.
            dx = e[0] - t[0]
            if math.hypot(dx, e[1] - t[1]) > longest:
                e = (e[0], t[1] + math.sqrt(max(0.0, longest * longest - dx * dx)))
            bend = info['bend']
            if fold and leg.startswith('front'):
                bend = 1 if phase < STANCE[kind] else -1
            frame[mid] = reach(t, e, info['upper'], info['lower'], bend)
            frame[end] = e
        if pendulum:
            # The neck and the head go up and down with the shoulders.
            rise = (lifted['front_left'] + lifted['front_right']) / 2
            for label in HEAD + ('NECK',):
                if label in frame:
                    frame[label] = (frame[label][0], frame[label][1] + rise)
        out.append(frame)
    def points_of(frame):
        return [
            {'x': round(min(1, max(0, x / w)), 4), 'y': round(min(1, max(0, y / h)), 4), 'label': label}
            for label, (x, y) in frame.items()
        ]
    return [{'x': round(x / w, 4), 'y': round(y / h, 4), 'label': label} for label, (x, y) in pos.items()], [points_of(f) for f in out]


def main():
    from PIL import Image
    folder = sys.argv[1]
    config = json.load(open(os.path.join(ROOT, 'art', 'mounts.json'), encoding='utf8'))
    path = os.path.join(ROOT, 'art', 'mount-gaits.json')
    data = json.load(open(path, encoding='utf8')) if os.path.exists(path) else {'mounts': {}}
    args = sys.argv[2:]
    ids = args[args.index('--ids') + 1].split(',') if '--ids' in args else [k for k, v in config['mounts'].items() if v.get('gait')]
    for mount_id in ids:
        mount = config['mounts'][mount_id]
        spec = mount['gait']
        estimate = json.load(open(os.path.join(folder, f'{mount_id}-skeleton.json'), encoding='utf8'))
        size = Image.open(os.path.join(ROOT, mount['start'])).size
        first, frames = gait(estimate['keypoints'], size, spec)
        data['mounts'][mount_id] = {'template': spec['template'], 'action': spec['kind'], 'first': first, 'frames': frames}
        print(mount_id, spec['kind'], len(frames), 'frames')
    data['$comment'] = 'Kroki wierzchowców, szkielet po szkielecie (tools/mount-gait.py) dla PixelLab (tools/animate-mounts-skeleton.mjs): first to szkielet pierwszej klatki, frames to szkielety kolejnych klatek pętli.'
    with open(path, 'w', encoding='utf8') as file:
        file.write('{\n')
        file.write(f' "$comment": {json.dumps(data["$comment"], ensure_ascii=False)},\n')
        file.write(' "mounts": {\n')
        items = list(data['mounts'].items())
        for n, (key, value) in enumerate(items):
            file.write(f'  {json.dumps(key)}: {json.dumps(value, ensure_ascii=False)}' + (',' if n < len(items) - 1 else '') + '\n')
        file.write(' }\n}\n')


if __name__ == '__main__':
    main()

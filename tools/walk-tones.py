# Recolours the skin of the walking figures of the Walka scene
# (src/client/art/walkers/<id>.png, eight frames of 128×128 from PixelLab,
# DECISIONS.md "Chody od zera") to the tones of data/skins.json, one file per
# figure and tone: <id>-<tone>.png next to the figure.
#
# The skin of a portrait is known: it is what its grey tone file changed
# (tools/skin-tones.py, tools/evolution-tones.py, both checked by hand). A
# walk is drawn from its portrait, and its frames keep the colours of its
# start frame (tools/walk-palette.py), so a colour of the walk is skin when
# the nearest colour of the portrait (in Lab, at most MAX_DISTANCE away) is
# skin in most of the portrait's pixels of that colour. tools/walk-tones.json
# corrects what that gets wrong, figure by figure: colours to add or drop
# (a dropped colour is never skin), boxes of the frame where the skin's
# colours are not skin ("not", such as a bronze helmet) or the only ones
# where they are ("only"), a box with "head" moving up and down with the head
# as the skeleton's nose does (art/references/walks/skeleton.json), places
# of the skeleton in each frame instead of a box in "only" ("head", "hands",
# "upper-arms", "forearms", "thighs", "shins", "feet": PixelLab keeps the
# joints where the skeleton has them), "rims_below" for outlines only
# darker than that part of the skin's darkest colour (sandals), "open"
# to leave out lines of the skin's colours a pixel or two thin (a blade),
# "near_not" ({"colours": [...], "radius": n}) to leave out the skin's
# colours within n pixels of colours only a thing has (a golden cross whose
# light is the colour of a face),
# single pixels ({frame: [[x, y], ...]}, "pixels" and "not_pixels"), boxes
# of one frame that are not skin ({frame: [[left, top, right, bottom), ...]},
# "not_boxes", a rope belt the hand passes), and
# "span", the part of the tone's ramp the skin takes (default [0, 1]), for a
# skin of a colour or two, which would else take its whole ramp.
# "add_in" ([{"colours": [...], "places": [...]}]) adds colours that are
# skin only in those places (a thigh's shadow the colour of a greave).
# Shades of the skin the colours miss, such as a hand's shadow, count next
# to the skin found.
#
# Each skin colour keeps its place between the darkest and the lightest skin
# colour of the figure, on the tone's ramp from shadow to light. A dark, warm
# outline next to the skin takes the ramp's shadow darkened as much as it is
# darker, so no brown rim is left around a grey hand.
#
# Usage: python3 tools/walk-tones.py [--ids a,b] [--check OUT_DIR]
import colorsys, json, os, sys
from collections import Counter
from PIL import Image, ImageCms

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WALKERS = os.path.join(ROOT, 'src', 'client', 'art', 'walkers')
PORTRAITS = os.path.join(ROOT, 'src', 'client', 'art', 'portraits')
FRAME = 128
MAX_DISTANCE = 14
# How far the skin's missed shades grow from it, and how light they must be
# against its lightest colour.
GROW = 2
GROW_LIGHT = 0.5
# The share of a shade's pixels next to the skin that makes it skin.
PROMOTE = 0.5
# The fewest pixels of a thing's own colours (near_not) that count as the thing.
MARK_PART = 6
SIDES = ((1, 0), (-1, 0), (0, 1), (0, -1))

TO_LAB = ImageCms.buildTransform(ImageCms.createProfile('sRGB'), ImageCms.createProfile('LAB'), 'RGB', 'LAB')


def rgb(code):
    code = code.lstrip('#')
    return tuple(int(code[i:i + 2], 16) for i in (0, 2, 4))


def hexa(c):
    return '%02x%02x%02x' % c[:3]


def labs(colours):
    colours = list(colours)
    im = Image.new('RGB', (len(colours), 1))
    im.putdata(colours)
    flat = list(ImageCms.applyTransform(im, TO_LAB).get_flattened_data())
    values = [flat[i:i + 3] for i in range(0, len(flat), 3)] if flat and not isinstance(flat[0], tuple) else flat
    return {c: (L * 100 / 255, a - 128, b - 128) for c, (L, a, b) in zip(colours, values)}


def distance(p, q):
    return sum((x - y) ** 2 for x, y in zip(p, q)) ** 0.5


def luminance(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def warm(c):
    h, s, v = colorsys.rgb_to_hsv(*(x / 255 for x in c))
    return (h <= 0.12 or h >= 0.9) and s >= 0.12


def on_ramp(ramp, t):
    shadow, mid, light = ramp
    a, b, u = (shadow, mid, t * 2) if t < 0.5 else (mid, light, t * 2 - 1)
    return tuple(round(a[i] + (b[i] - a[i]) * u) for i in range(3))


def portrait_skin(name):
    """How many of the portrait's pixels of each colour there are, and how
    many of them are skin."""
    base = Image.open(os.path.join(PORTRAITS, f'{name}.png')).convert('RGBA')
    grey = Image.open(os.path.join(PORTRAITS, f'{name}-grey.png')).convert('RGBA')
    bp, gp = base.load(), grey.load()
    total, skin = Counter(), Counter()
    for y in range(base.height):
        for x in range(base.width):
            c = bp[x, y]
            if c[3] >= 128:
                total[c[:3]] += 1
                if gp[x, y][:3] != c[:3]:
                    skin[c[:3]] += 1
    return total, skin


def skin_colours(im, name, fix):
    px = im.load()
    used = {px[x, y][:3] for y in range(im.height) for x in range(im.width) if px[x, y][3] >= 128}
    total, skin = portrait_skin(name)
    lab = labs(used | set(total))
    found = set()
    for c in used:
        d, p = min((distance(lab[c], lab[p]), p) for p in total)
        if d <= MAX_DISTANCE and skin[p] * 2 >= total[p]:
            found.add(c)
    found |= {rgb(code) for code in fix.get('add', [])}
    found -= {rgb(code) for code in fix.get('drop', [])}
    return found


def within(box, x, y):
    return box[0] <= x < box[2] and box[1] <= y < box[3]


def skeleton_frames():
    """The skeleton's joints in each frame of the walk, in pixels, and the
    start frame's pose."""
    walks = json.load(open(os.path.join(ROOT, 'art', 'walks.json'), encoding='utf8'))
    skeleton = json.load(open(os.path.join(ROOT, walks['skeleton']), encoding='utf8'))
    joints = lambda pose: {p['label']: (p['x'] * skeleton['size'], p['y'] * skeleton['size']) for p in pose}
    return [joints(pose) for pose in skeleton['frames']], joints(skeleton['keys'][1])


FRAMES, START = skeleton_frames()
# The places of the skeleton: around the head (between the nose and the ear),
# the hands (the arm's end), along the upper arms, the forearms, the thighs
# and the shins, and around the feet (the leg's end).
HEAD_RADIUS, HAND_RADIUS, ARM_RADIUS, LEG_RADIUS, FOOT_RADIUS = 13, 6, 6, 7, 9


def to_segment(p, a, b):
    ax, ay = a
    bx, by = b
    length = (bx - ax) ** 2 + (by - ay) ** 2 or 1
    u = max(0, min(1, ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / length))
    return distance(p, (ax + u * (bx - ax), ay + u * (by - ay)))


def in_place(place, frame, p):
    j = FRAMES[frame]
    if place == 'head':
        centre = ((j['NOSE'][0] + j['RIGHT EAR'][0]) / 2, (j['NOSE'][1] + j['RIGHT EAR'][1]) / 2)
        return distance(p, centre) <= HEAD_RADIUS
    if place == 'hands':
        return min(distance(p, j['RIGHT ARM']), distance(p, j['LEFT ARM'])) <= HAND_RADIUS
    if place == 'upper-arms':
        return min(to_segment(p, j[f'{side} SHOULDER'], j[f'{side} ELBOW']) for side in ('RIGHT', 'LEFT')) <= ARM_RADIUS
    if place == 'forearms':
        return min(to_segment(p, j[f'{side} ELBOW'], j[f'{side} ARM']) for side in ('RIGHT', 'LEFT')) <= ARM_RADIUS
    if place == 'thighs':
        return min(to_segment(p, j[f'{side} HIP'], j[f'{side} KNEE']) for side in ('RIGHT', 'LEFT')) <= LEG_RADIUS
    if place == 'shins':
        return min(to_segment(p, j[f'{side} KNEE'], j[f'{side} LEG']) for side in ('RIGHT', 'LEFT')) <= LEG_RADIUS
    if place == 'feet':
        return min(distance(p, j['RIGHT LEG']), distance(p, j['LEFT LEG'])) <= FOOT_RADIUS
    raise ValueError(f'unknown place {place}')


def in_box(box, x, y):
    """A box of the frame, one with "head" that moves up and down with the
    head, or a place of the skeleton."""
    frame, fx = divmod(x, FRAME)
    if isinstance(box, str):
        return in_place(box, frame, (fx, y))
    dy = round(FRAMES[frame]['NOSE'][1] - START['NOSE'][1]) if len(box) > 4 and box[4] == 'head' else 0
    return within(box, fx, y - dy)


def skin_shade(c, light):
    """A colour a skin's shadow or light could be: orange and saturated
    enough, and not as dark as hair or leather."""
    h, s, v = colorsys.rgb_to_hsv(*(x / 255 for x in c))
    return (h <= 0.11 or h >= 0.95) and 0.18 <= s <= 0.7 and luminance(c) >= light * GROW_LIGHT


def skin_pixels(im, colours, fix):
    px = im.load()
    dropped = {rgb(code) for code in fix.get('drop', [])}
    allowed = lambda x, y: px[x, y][:3] not in dropped and not any(in_box(box, x, y) for box in fix.get('not', [])) and (
        not fix.get('only') or any(in_box(box, x, y) for box in fix['only'])
    )
    pixels = {
        (x, y)
        for y in range(im.height)
        for x in range(im.width)
        if px[x, y][3] >= 128 and px[x, y][:3] in colours and allowed(x, y)
    }
    # Shades that are skin only in some places, such as a thigh's shadow
    # the colour of a bronze greave.
    for rule in fix.get('add_in', []):
        shades = {rgb(code) for code in rule['colours']}
        pixels |= {
            (x, y)
            for y in range(im.height)
            for x in range(im.width)
            if px[x, y][3] >= 128 and px[x, y][:3] in shades and allowed(x, y) and any(in_box(place, x, y) for place in rule['places'])
        }
    # The shades of the skin the colours miss, such as the shadow of a hand,
    # count next to it, up to GROW pixels in.
    light = max((luminance(c) for c in colours), default=0)
    for _ in range(GROW):
        pixels |= {
            p
            for x, y in pixels
            for dx, dy in SIDES
            for p in [(x + dx, y + dy)]
            if p not in pixels
            and 0 <= p[0] < im.width
            and 0 <= p[1] < im.height
            and px[p][3] >= 128
            and allowed(*p)
            and skin_shade(px[p][:3], light)
        }
    # A shade found mostly next to the skin is skin wherever it is, as on a
    # hand that swings apart from the rest in its shadow.
    grown = Counter(px[p][:3] for p in pixels if px[p][:3] not in colours)
    every = Counter(px[x, y][:3] for y in range(im.height) for x in range(im.width) if px[x, y][3] >= 128)
    shades = {c for c, n in grown.items() if n >= every[c] * PROMOTE}
    pixels |= {
        (x, y)
        for y in range(im.height)
        for x in range(im.width)
        if px[x, y][3] >= 128 and px[x, y][:3] in shades and allowed(x, y)
    }
    if fix.get('open'):
        pixels = opened(pixels)
    if fix.get('near_not'):
        marks = {rgb(code) for code in fix['near_not']['colours']}
        reach = fix['near_not'].get('radius', 2)
        marked = {(x, y) for y in range(im.height) for x in range(im.width) if px[x, y][3] >= 128 and px[x, y][:3] in marks}
        # Only the thing itself, not a stray pixel of its colour in an eye.
        marked = {p for part in parts(marked) if len(part) >= MARK_PART for p in part}
        near = {(x + dx, y + dy) for x, y in marked for dx in range(-reach, reach + 1) for dy in range(-reach, reach + 1)}
        pixels -= near
    listed = lambda key: {(int(frame) * FRAME + x, y) for frame, points in fix.get(key, {}).items() for x, y in points}
    boxed = {
        (int(frame) * FRAME + x, y)
        for frame, boxes in fix.get('not_boxes', {}).items()
        for left, top, right, bottom in boxes
        for x in range(left, right)
        for y in range(top, bottom)
    }
    return (pixels | listed('pixels')) - listed('not_pixels') - boxed


def parts(pixels):
    """The pixels in groups that touch, corners too."""
    left, found = set(pixels), []
    while left:
        part, todo = set(), [left.pop()]
        while todo:
            x, y = todo.pop()
            part.add((x, y))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    p = (x + dx, y + dy)
                    if p in left:
                        left.remove(p)
                        todo.append(p)
        found.append(part)
    return found


def opened(pixels):
    """The skin without its lines a pixel or two thin: what is left after
    taking off its edge, grown back by that edge."""
    square = [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)]
    core = {(x, y) for x, y in pixels if all((x + dx, y + dy) in pixels for dx, dy in square)}
    return {(x + dx, y + dy) for x, y in core for dx, dy in square} & pixels


def rim_pixels(im, skin, low, below=1):
    """Dark, warm outlines next to the skin, darker than its darkest colour
    (or than `below` of it, so the straps of a sandal stay leather)."""
    px = im.load()
    rims = set()
    for x, y in skin:
        for dx, dy in SIDES:
            p = (x + dx, y + dy)
            if p in skin or not (0 <= p[0] < im.width and 0 <= p[1] < im.height):
                continue
            c = px[p]
            if c[3] >= 128 and luminance(c[:3]) < low * below and warm(c[:3]):
                rims.add(p)
    return rims


def recolour(im, skin, rims, low, high, ramp, span):
    out = im.copy()
    po = out.load()
    for x, y in skin:
        c = po[x, y]
        t = min(1, max(0, (luminance(c[:3]) - low) / (high - low or 1)))
        po[x, y] = (*on_ramp(ramp, span[0] + (span[1] - span[0]) * t), c[3])
    for x, y in rims:
        c = po[x, y]
        k = luminance(c[:3]) / low
        po[x, y] = (*(round(v * k) for v in ramp[0]), c[3])
    return out


def save_indexed(im, path):
    """The walk as a PNG of its own colours (at most a hundred, each pixel
    opaque or clear), a third of the size with the same pixels."""
    px = im.load()
    colours = sorted({px[x, y][:3] for y in range(im.height) for x in range(im.width) if px[x, y][3]})
    if len(colours) > 255 or any(0 < px[x, y][3] < 255 for y in range(im.height) for x in range(im.width)):
        im.save(path, optimize=True)
        return
    index = {c: i + 1 for i, c in enumerate(colours)}
    out = Image.new('P', im.size, 0)
    out.putpalette([0, 0, 0] + [v for c in colours for v in c])
    out.putdata([index[px[x, y][:3]] if px[x, y][3] else 0 for y in range(im.height) for x in range(im.width)])
    out.save(path, optimize=True, transparency=0)


def check_sheet(im, toned, skin, rims, path):
    """The frames as drawn, the mask (skin magenta, rims cyan) and two tones,
    at twice the size, for checking by eye."""
    mask = im.copy()
    mp = mask.load()
    for p in skin:
        mp[p] = (255, 0, 255, 255)
    for p in rims:
        mp[p] = (0, 230, 255, 255)
    rows = [im, mask, *toned]
    sheet = Image.new('RGBA', (im.width * 2, im.height * 2 * len(rows)), (200, 196, 186, 255))
    for i, row in enumerate(rows):
        sheet.alpha_composite(row.resize((im.width * 2, im.height * 2), Image.NEAREST), (0, i * im.height * 2))
    sheet.save(path)


def main():
    walks = json.load(open(os.path.join(ROOT, 'art', 'walks.json'), encoding='utf8'))['characters']
    fixes = json.load(open(os.path.join(ROOT, 'tools', 'walk-tones.json'), encoding='utf8'))
    fixes.pop('$comment', None)
    tones = [t for t in json.load(open(os.path.join(ROOT, 'data', 'skins.json'), encoding='utf8'))['skins'] if t.get('ramp')]
    ids = sys.argv[sys.argv.index('--ids') + 1].split(',') if '--ids' in sys.argv else list(walks)
    check = sys.argv[sys.argv.index('--check') + 1] if '--check' in sys.argv else None
    for name in ids:
        im = Image.open(os.path.join(WALKERS, f'{name}.png')).convert('RGBA')
        save_indexed(im, os.path.join(WALKERS, f'{name}.png'))
        fix = fixes.get(name, {})
        colours = skin_colours(im, name, fix)
        skin = skin_pixels(im, colours, fix)
        # Pixels listed by hand (pixels) are skin, but they do not set its
        # darkest and lightest colour, so a fist in deep shadow does not pale
        # the face; those darker than the rest of the skin are shaded as its
        # rims are.
        listed = {(int(frame) * FRAME + x, y) for frame, points in fix.get('pixels', {}).items() for x, y in points} & skin
        lums = [luminance(im.getpixel(p)[:3]) for p in (skin - listed or skin)]
        low, high = (min(lums), max(lums)) if lums else (1, 1)
        span = fix.get('span', [0, 1])
        shaded = {p for p in listed if luminance(im.getpixel(p)[:3]) < low}
        skin -= shaded
        rims = rim_pixels(im, skin, low, fix.get('rims_below', 1)) | shaded
        toned = {}
        for tone in tones:
            out = recolour(im, skin, rims, low, high, [rgb(code) for code in tone['ramp']], span)
            save_indexed(out, os.path.join(WALKERS, f"{name}-{tone['id']}.png"))
            toned[tone['id']] = out
        if check:
            check_sheet(im, [toned['grey'], toned['dark']], skin, rims, os.path.join(check, f'{name}.png'))
        print(name, len(skin), 'pixels of skin,', len(rims), 'of rim,', ' '.join(sorted(map(hexa, colours))))


if __name__ == '__main__':
    main()

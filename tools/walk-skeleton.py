# Draws the skeleton every walk is drawn on (art/prompts.json, kind "walks"):
# a grey mannequin seen from the side, facing right, in the 4 frames of a
# walk that loops (contact, passing, contact with the other leg, passing),
# the far limbs darker, the body lower at contact and higher when passing.
# Frames of 128 x 128 on a flat background (Retro Diffusion takes an RGB
# picture), in a 2 x 2 sheet. Needs Python 3 and Pillow:
#   python3 tools/walk-skeleton.py art/references/walks/skeleton.png
import math, sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
S = 128
GROUND = 122
BG = (214, 210, 200)
OUTLINE = (38, 38, 44)
NEAR = (206, 206, 210)
BODY = (172, 172, 178)
FAR = (112, 112, 120)

THIGH, SHIN, FOOT = 26, 25, 12
UPPER, FORE = 19, 17
TORSO = 32  # hip to the base of the neck
HEAD_R = 8

# Angles in degrees from straight down, positive = forward (to the right);
# a foot's angle is from the horizontal, positive = toes up.
FRAMES = [
    # 1 contact: near leg forward, far leg back; far arm forward
    dict(nl=(28, 10, 16), fl=(-24, -50, -40), na=(-30, -14), fa=(28, 55)),
    # 2 passing: near leg under the body, far leg swings forward bent
    dict(nl=(3, 0, 0), fl=(26, -34, -14), na=(-7, 8), fa=(7, 22)),
    # 3 contact: far leg forward, near leg back; near arm forward
    dict(nl=(-24, -50, -40), fl=(28, 10, 16), na=(28, 55), fa=(-30, -14)),
    # 4 passing: far leg under the body, near leg swings forward bent
    dict(nl=(26, -34, -14), fl=(3, 0, 0), na=(7, 22), fa=(-7, 8)),
]
LEAN = 4

def point(x, y, angle, length):
    a = math.radians(angle)
    return x + length * math.sin(a), y + length * math.cos(a)

def leg(hx, hy, thigh, shin, foot):
    kx, ky = point(hx, hy, thigh, THIGH)
    ax, ay = point(kx, ky, shin, SHIN)
    f = math.radians(foot)
    toe = (ax + (FOOT - 3) * math.cos(f), ay - (FOOT - 3) * math.sin(f) + 2)
    heel = (ax - 3 * math.cos(f), ay + 3 * math.sin(f) + 2)
    return dict(hip=(hx, hy), knee=(kx, ky), ankle=(ax, ay), toe=toe, heel=heel)

def arm(sx, sy, upper, fore):
    ex, ey = point(sx, sy, upper, UPPER)
    wx, wy = point(ex, ey, fore, FORE)
    return dict(shoulder=(sx, sy), elbow=(ex, ey), wrist=(wx, wy), hand=point(wx, wy, fore, 3))

def capsule(draw, a, b, width, fill):
    ax, ay = a; bx, by = b
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy) or 1
    nx, ny = -dy / length * width / 2, dx / length * width / 2
    draw.polygon([(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)], fill=fill)
    r = width / 2
    for (cx, cy) in (a, b):
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)

def ellipse(draw, c, rx, ry, fill):
    draw.ellipse([c[0] - rx, c[1] - ry, c[0] + rx, c[1] + ry], fill=fill)

# A layer is drawn twice: one pixel wider in the outline colour, then filled,
# so the joints of one limb merge without lines inside.
def leg_shapes(p, width):
    return [
        ('capsule', p['hip'], p['knee'], width),
        ('capsule', p['knee'], p['ankle'], width - 1),
        ('capsule', p['heel'], p['toe'], 5),
        ('capsule', p['ankle'], ((p['ankle'][0] + p['toe'][0]) / 2, (p['ankle'][1] + p['toe'][1]) / 2), 6),
    ]

def arm_shapes(p, width):
    return [
        ('capsule', p['shoulder'], p['elbow'], width),
        ('capsule', p['elbow'], p['wrist'], width - 1),
        ('ellipse', p['hand'], 3.5, 3.5),
    ]

def draw_layer(draw, shapes, fill):
    for grow, colour in ((2, OUTLINE), (0, fill)):
        for shape in shapes:
            if shape[0] == 'capsule':
                capsule(draw, shape[1], shape[2], shape[3] + grow, colour)
            elif shape[0] == 'ellipse':
                ellipse(draw, shape[1], shape[2] + grow / 2, shape[3] + grow / 2, colour)
            elif shape[0] == 'polygon':
                if grow:
                    draw.polygon(shape[1], fill=colour, outline=colour, width=2)
                else:
                    draw.polygon(shape[1], fill=colour)

def frame(spec):
    hx = 60
    probe = [leg(hx, 0, *spec['nl']), leg(hx, 0, *spec['fl'])]
    hy = GROUND - max(max(p['toe'][1], p['heel'][1]) for p in probe) - 2
    near, far = leg(hx, hy, *spec['nl']), leg(hx + 1, hy, *spec['fl'])
    neck = point(hx, hy, 180 - LEAN, TORSO)
    shoulder = (neck[0] - 1, neck[1] + 5)
    head = (neck[0] + 2, neck[1] - HEAD_R - 1)

    im = Image.new('RGB', (S, S), BG)
    d = ImageDraw.Draw(im)
    draw_layer(d, arm_shapes(arm(shoulder[0] + 2, shoulder[1], *spec['fa']), 7), FAR)
    draw_layer(d, leg_shapes(far, 9), FAR)
    top = (neck[0], neck[1] + 2)
    torso = [
        (top[0] - 7, top[1]), (top[0] + 7, top[1] + 1), (top[0] + 8, top[1] + 9),
        (hx + 7, hy - 4), (hx + 7, hy + 4), (hx - 7, hy + 4), (hx - 8, hy - 6), (top[0] - 8, top[1] + 8),
    ]
    face = [(head[0] + HEAD_R - 1, head[1] - 1), (head[0] + HEAD_R + 2, head[1] + 3), (head[0] + HEAD_R - 1, head[1] + 4)]
    draw_layer(d, [('polygon', torso), ('capsule', (neck[0], neck[1] - 2), (neck[0], neck[1] + 4), 6), ('ellipse', head, HEAD_R, HEAD_R + 1), ('polygon', face)], BODY)
    d.point((head[0] + 4, head[1] - 1), fill=OUTLINE)
    d.point((head[0] + 4, head[1]), fill=OUTLINE)
    draw_layer(d, leg_shapes(near, 10), NEAR)
    draw_layer(d, arm_shapes(arm(*shoulder, *spec['na']), 8), NEAR)
    return im

frames = [frame(spec) for spec in FRAMES]
sheet = Image.new('RGB', (S * 2, S * 2), BG)
for index, im in enumerate(frames):
    sheet.paste(im, ((index % 2) * S, (index // 2) * S))
sheet.save(OUT)

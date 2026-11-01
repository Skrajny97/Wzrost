# Draws the skeleton every rider is drawn on (art/prompts.json, kind
# "riders"): the grey mannequin of the walks (tools/walk-skeleton.py, the
# same limbs and colours) sitting astride a saddle that is not drawn, seen
# from the side and facing right, both hands in front holding the reins.
# Only the near leg shows: the mount covers the far one. One frame of
# 128 x 128 on a flat background (Retro Diffusion takes an RGB picture), and
# the point the rider sits on (the hip, `seat`), which goes on the mount's
# saddle when the riding frames are put together (tools/ride-sheets.py).
# Needs Python 3 and Pillow:
#   python3 tools/ride-skeleton.py art/references/riders/skeleton.png art/references/riders/skeleton.json
import json, math, sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
JOINTS = sys.argv[2] if len(sys.argv) > 2 else None
S = 128
BG = (214, 210, 200)
OUTLINE = (38, 38, 44)
NEAR = (206, 206, 210)
BODY = (172, 172, 178)
FAR = (112, 112, 120)

# The walk's limbs made smaller (R): at the walk's size the riders dwarfed
# the mounts, whose saddles stand 40-85 px above the ground.
R = 0.72
THIGH, SHIN, FOOT = round(26 * R), round(25 * R), round(12 * R)
UPPER, FORE = round(19 * R), round(17 * R)
TORSO = round(32 * R)
HEAD_R = round(8 * R)
HIP = (56, 76)
LEAN = 8

# Angles in degrees from straight down, positive = forward (to the right).
NEAR_LEG = (62, -6, 0)   # thigh forward along the mount, shin down, foot level
NEAR_ARM = (28, 78)      # upper arm a little forward, forearm out to the reins
FAR_ARM = (34, 84)


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
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy) or 1
    nx, ny = -dy / length * width / 2, dx / length * width / 2
    draw.polygon([(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)], fill=fill)
    r = width / 2
    for (cx, cy) in (a, b):
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)


def ellipse(draw, c, rx, ry, fill):
    draw.ellipse([c[0] - rx, c[1] - ry, c[0] + rx, c[1] + ry], fill=fill)


def leg_shapes(p, width):
    return [
        ('capsule', p['hip'], p['knee'], width),
        ('capsule', p['knee'], p['ankle'], width - 1),
        ('capsule', p['heel'], p['toe'], 4),
        ('capsule', p['ankle'], ((p['ankle'][0] + p['toe'][0]) / 2, (p['ankle'][1] + p['toe'][1]) / 2), 5),
    ]


def arm_shapes(p, width):
    return [
        ('capsule', p['shoulder'], p['elbow'], width),
        ('capsule', p['elbow'], p['wrist'], width - 1),
        ('ellipse', p['hand'], 2.5, 2.5),
    ]


# A layer is drawn twice: one pixel wider in the outline colour, then
# filled, so the joints of one limb merge without lines inside.
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


hx, hy = HIP
neck = point(hx, hy, 180 - LEAN, TORSO)
shoulder = (neck[0] - 1, neck[1] + 4)
head = (neck[0] + 1, neck[1] - HEAD_R - 1)

im = Image.new('RGB', (S, S), BG)
d = ImageDraw.Draw(im)
draw_layer(d, arm_shapes(arm(shoulder[0] + 2, shoulder[1], *FAR_ARM), 5), FAR)
top = (neck[0], neck[1] + 2)
torso = [
    (top[0] - 5, top[1]), (top[0] + 5, top[1] + 1), (top[0] + 6, top[1] + 7),
    (hx + 5, hy - 3), (hx + 6, hy + 3), (hx - 6, hy + 3), (hx - 7, hy - 4), (top[0] - 6, top[1] + 6),
]
face = [(head[0] + HEAD_R - 1, head[1] - 1), (head[0] + HEAD_R + 2, head[1] + 2), (head[0] + HEAD_R - 1, head[1] + 3)]
draw_layer(d, [('polygon', torso), ('capsule', (neck[0], neck[1] - 2), (neck[0], neck[1] + 3), 4), ('ellipse', head, HEAD_R, HEAD_R + 1), ('polygon', face)], BODY)
d.point((head[0] + 3, head[1] - 1), fill=OUTLINE)
near = leg(hx, hy, *NEAR_LEG)
draw_layer(d, leg_shapes(near, 7), NEAR)
draw_layer(d, arm_shapes(arm(*shoulder, *NEAR_ARM), 6), NEAR)
im.save(OUT)
if JOINTS:
    with open(JOINTS, 'w', encoding='utf8') as file:
        json.dump({'size': S, 'seat': [hx, hy + 3]}, file, indent=1)
        file.write('\n')

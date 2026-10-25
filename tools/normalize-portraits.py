# Brings the class portraits (96 × 128) to one size: the generator draws some
# figures larger than others, so a woman and a man of a class looked like an
# adult and a youngster side by side. Each figure is scaled without smoothing
# to the same height, stands on the same line and is centred, so the busts in
# fights and on the class cards show heads of about the same size. Running it
# again changes nothing, also after hair drawn by hand above a head the
# generator cut at the top. It prints where each face is: the busts centre on
# it (`faces` in src/client/art.js). Needs Python 3 and Pillow:
#   python3 tools/normalize-portraits.py src/client/art/portraits/*.png
import json
import os
import statistics
import sys

from PIL import Image

WIDTH, HEIGHT = 96, 128
FIGURE = 118  # the figure's height, from the top of the head to the feet
FEET = 124  # the line the feet stand on
DRAWN_ABOVE = 8  # rows a hand may add above a cut head without a new scaling
FACE = (8, 24)  # the rows of the face, counted from the top of a figure of FIGURE


def normalize(path):
    image = Image.open(path).convert('RGBA')
    assert image.size == (WIDTH, HEIGHT), f'{path}: {image.size}'
    box = image.getchannel('A').point(lambda alpha: 255 if alpha > 16 else 0).getbbox()
    figure = image.crop(box)
    if box[3] == FEET and FIGURE <= figure.height <= FIGURE + DRAWN_ABOVE:
        scale, top = 1, box[1]
    else:
        scale, top = FIGURE / figure.height, FEET - FIGURE
        figure = figure.resize((max(1, round(figure.width * scale)), FIGURE), Image.NEAREST)
    assert figure.width <= WIDTH, f'{path}: the figure is wider than the portrait'
    canvas = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    canvas.alpha_composite(figure, (WIDTH // 2 - figure.width // 2, top))
    canvas.save(path, optimize=True)
    return scale, face_centre(canvas)


# The middle of the face across: the median of the rows' middles.
def face_centre(image):
    alpha = image.getchannel('A').load()
    middles = []
    for y in range(FEET - FIGURE + FACE[0], FEET - FIGURE + FACE[1]):
        xs = [x for x in range(WIDTH) if alpha[x, y] > 16]
        if xs:
            middles.append((xs[0] + xs[-1]) / 2)
    return round(statistics.median(middles))


faces = {}
for path in sys.argv[1:]:
    scale, face = normalize(path)
    faces[os.path.splitext(os.path.basename(path))[0]] = face
    print(f'{path}: x{scale:.3f}, face at {face}')
print('faces off the middle:', json.dumps({id: face for id, face in sorted(faces.items()) if face != WIDTH // 2}))

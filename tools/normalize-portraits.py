# Brings the class portraits (96 × 128) to one size: the generator draws some
# figures larger than others, so a woman and a man of a class looked like an
# adult and a youngster side by side. Each figure is scaled without smoothing
# to the same height, stands on the same line and is centred, so the busts in
# fights and on the class cards show heads of about the same size. Running it
# again changes nothing. Needs Python 3 and Pillow:
#   python3 tools/normalize-portraits.py src/client/art/portraits/*.png
import sys

from PIL import Image

WIDTH, HEIGHT = 96, 128
FIGURE = 118  # the figure's height, from the top of the head to the feet
FEET = 124  # the line the feet stand on


def normalize(path):
    image = Image.open(path).convert('RGBA')
    assert image.size == (WIDTH, HEIGHT), f'{path}: {image.size}'
    box = image.getchannel('A').point(lambda alpha: 255 if alpha > 16 else 0).getbbox()
    figure = image.crop(box)
    scale = FIGURE / figure.height
    figure = figure.resize((max(1, round(figure.width * scale)), FIGURE), Image.NEAREST)
    assert figure.width <= WIDTH, f'{path}: the figure is wider than the portrait'
    canvas = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    canvas.alpha_composite(figure, (WIDTH // 2 - figure.width // 2, FEET - FIGURE))
    canvas.save(path, optimize=True)
    return scale


for path in sys.argv[1:]:
    print(f'{path}: x{normalize(path):.3f}')

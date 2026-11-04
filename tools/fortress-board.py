# The Warownia's board, step 1: the tall camp board at its third look with two
# more bands of glade below the Osada's band (for the seven buildings), and the
# masks PixelLab draws in (inpaint-v3: white = draw, black = keep; at most
# 512 px a side): the seams of the new bands as grass, and the palisade with
# its gates as stone walls, the upper half first, then the lower one over it.
# Usage: python3 -I compose.py <repo> <out-dir> [<upper-walls-result.png>]
import sys
from PIL import Image, ImageDraw

repo, out = sys.argv[1], sys.argv[2]
board = Image.open(f'{repo}/src/client/art/board-tall/camp-3.png').convert('RGB')
W, H = board.size        # 320 x 563
BAND = 83                # the Osada's band: rows 329..412 of the tall board
TOP, CUT = 329, 412
FH = H + 2 * BAND        # 729
base = Image.new('RGB', (W, FH))
base.paste(board.crop((0, 0, W, CUT)), (0, 0))
band = board.crop((0, TOP, W, CUT))
base.paste(band, (0, CUT))
base.paste(band.transpose(Image.FLIP_LEFT_RIGHT), (0, CUT + BAND))
base.paste(board.crop((0, CUT, W, H)), (0, CUT + 2 * BAND))
base.save(f'{out}/base.png')

LEFT, RIGHT = (10, 40), (268, 298)
BOTTOM = 502 + 2 * BAND  # the bottom palisade, moved down by the two bands
def walls():
    m = Image.new('L', (W, FH), 0)
    d = ImageDraw.Draw(m)
    d.rectangle([LEFT[0], 4, RIGHT[1], 72], fill=255)
    d.rectangle([LEFT[0], 4, LEFT[1], BOTTOM + 50], fill=255)
    d.rectangle([RIGHT[0], 4, RIGHT[1], BOTTOM + 50], fill=255)
    d.rectangle([LEFT[0], BOTTOM, RIGHT[1], BOTTOM + 50], fill=255)
    return m
wall = walls()
wall.save(f'{out}/walls-mask-full.png')

# The seams where the copied bands meet the glade, as grass.
SEAMS = (372, 620)
seam = Image.new('L', (W, FH), 0)
for y in (CUT, CUT + BAND, CUT + 2 * BAND):
    ImageDraw.Draw(seam).rectangle([LEFT[1] + 1, y - 6, RIGHT[0] - 1, y + 6], fill=255)
base.crop((0, SEAMS[0], W, SEAMS[1])).save(f'{out}/seams.png')
seam.crop((0, SEAMS[0], W, SEAMS[1])).convert('RGB').save(f'{out}/seams-mask.png')

UP = (0, 512)
base.crop((0, UP[0], W, UP[1])).save(f'{out}/walls-top.png')
wall.crop((0, UP[0], W, UP[1])).convert('RGB').save(f'{out}/walls-top-mask.png')

# The lower half, once the upper one is chosen: the upper result (and the
# grass seams) pasted in, and only what the upper did not reach masked.
if len(sys.argv) > 3:
    done = base.copy()
    upper = Image.open(sys.argv[3]).convert('RGB')
    done.paste(Image.composite(upper, done.crop((0, 0, W, 512)), wall.crop((0, 0, W, 512))), (0, 0))
    if len(sys.argv) > 4:
        seams = Image.open(sys.argv[4]).convert('RGB')
        part = done.crop((0, SEAMS[0], W, SEAMS[1]))
        done.paste(Image.composite(seams, part, seam.crop((0, SEAMS[0], W, SEAMS[1]))), (0, SEAMS[0]))
    done.save(f'{out}/upper-done.png')
    LOW = (FH - 512, FH)
    low = wall.copy()
    ImageDraw.Draw(low).rectangle([0, 0, W, 511], fill=0)
    done.crop((0, LOW[0], W, LOW[1])).save(f'{out}/walls-bottom.png')
    low.crop((0, LOW[0], W, LOW[1])).convert('RGB').save(f'{out}/walls-bottom-mask.png')
print('board', base.size)

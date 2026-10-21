"""Convert out/frames/f_###.png (from film.py) into site/assets/hero-frames/f_###.webp for the scroll player."""
import glob, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, '..', '..', 'site', 'assets', 'hero-frames')
os.makedirs(DEST, exist_ok=True)
total = 0
for path in sorted(glob.glob(os.path.join(HERE, 'out', 'frames', 'f_*.png'))):
    out = os.path.join(DEST, os.path.basename(path)[:-4] + '.webp')
    Image.open(path).convert('RGB').save(out, quality=84, method=6)
    total += os.path.getsize(out)
print(f'{len(os.listdir(DEST))} frames, {total / 1e6:.1f} MB')

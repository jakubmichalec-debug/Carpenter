"""Convert film.py output for the site: out/frames/f_###.png -> site/assets/hero-frames/*.webp, the last frame ->
assets/3d/hero-still.webp and assets/og.jpg, and out/ba-before.png / ba-after.png -> assets/3d/ba-*.webp."""
import glob, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, '..', '..', 'site', 'assets', 'hero-frames')
os.makedirs(DEST, exist_ok=True)
total = 0
for path in sorted(glob.glob(os.path.join(HERE, 'out', 'frames', 'f_*.png'))):
    out = os.path.join(DEST, os.path.basename(path)[:-4] + '.webp')
    Image.open(path).convert('RGB').save(out, quality=72, method=6)  # 1080p: about 5 MB for 120 frames
    total += os.path.getsize(out)
print(f'{len(os.listdir(DEST))} frames, {total / 1e6:.1f} MB')

SITE = os.path.join(HERE, '..', '..', 'site', 'assets')
frames = sorted(glob.glob(os.path.join(HERE, 'out', 'frames', 'f_*.png')))
if frames:
    last = Image.open(frames[-1]).convert('RGB')
    last.save(os.path.join(SITE, '3d', 'hero-still.webp'), quality=84, method=6)
    w, h = last.size; t = int(w * 630 / 1200)
    last.crop((0, (h - t) // 2, w, (h - t) // 2 + t)).resize((1200, 630), Image.LANCZOS).save(os.path.join(SITE, 'og.jpg'), quality=84)
    print('hero-still.webp and og.jpg from', os.path.basename(frames[-1]))
for name in ('ba-before', 'ba-after'):
    src = os.path.join(HERE, 'out', f'{name}.png')
    if os.path.exists(src):
        Image.open(src).convert('RGB').save(os.path.join(SITE, '3d', f'{name}.webp'), quality=84, method=6)
        print(f'{name}.webp')

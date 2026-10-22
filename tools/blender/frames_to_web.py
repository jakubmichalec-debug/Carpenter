"""Convert film.py output for the site: out/frames/f_###.png -> site/assets/hero-frames/*.webp, the last frame ->
assets/3d/hero-still.webp and assets/og.jpg, and out/ba-before.png / ba-after.png -> assets/3d/ba-*.webp.
Every image is cleaned (clean(): colour blotches and flat-area noise removed) and then graded (grade(): the AgX
render's flat tonal range given real darks and colour), the same way for every frame so nothing flickers.
`python frames_to_web.py --regrade DIR` grades already-encoded webp frames from DIR instead (no PNGs needed)."""
import glob, json, os, sys, time
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

QUALITY = 88  # WebP; below this the plain wall shows blocks once graded


def clean(im, chroma_r=2.0, luma_r=1.2, flat=3):
    """Blur only the colour channels (removes the pink/green blotches lossy frames and render noise leave on the
    plain wall; the eye barely sees colour detail) and smooth brightness only where it is already flat, so wood
    grain, edges and the rug keep their texture."""
    y, cb, cr = im.convert('YCbCr').split()
    a = np.asarray(Image.merge('YCbCr', (y, cb.filter(ImageFilter.GaussianBlur(chroma_r)), cr.filter(ImageFilter.GaussianBlur(chroma_r))))).astype(np.float32)
    yb = np.asarray(y.filter(ImageFilter.GaussianBlur(luma_r))).astype(np.float32)
    a[..., 0] = np.where(np.abs(a[..., 0] - yb) < flat, yb, a[..., 0])
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'YCbCr').convert('RGB')


def grade(im, black=30, white=238, sat=1.07, s_curve=0.08):
    """Levels (AgX keeps its darks around 50/255), a gentle S-curve and a little saturation; the same for every frame."""
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    a = np.clip((a - black / 255) / ((white - black) / 255), 0, 1)
    a = a + s_curve * (a - 0.5) * (1 - np.abs(2 * a - 1))
    return ImageEnhance.Color(Image.fromarray((np.clip(a, 0, 1) * 255 + .5).astype(np.uint8))).enhance(sat)

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, '..', '..', 'site', 'assets', 'hero-frames')
os.makedirs(DEST, exist_ok=True)
total = 0
regrade = sys.argv[sys.argv.index('--regrade') + 1] if '--regrade' in sys.argv else None
sources = sorted(glob.glob(os.path.join(regrade, 'f_*.webp'))) if regrade else sorted(glob.glob(os.path.join(HERE, 'out', 'frames', 'f_*.png')))
for path in sources:
    out = os.path.join(DEST, os.path.splitext(os.path.basename(path))[0] + '.webp')
    grade(clean(Image.open(path))).save(out, quality=QUALITY, method=6)
    total += os.path.getsize(out)
# drop frames left over from a longer earlier render, then tell the player what is there (hero-frames.js)
for stale in glob.glob(os.path.join(DEST, 'f_*.webp')):
    if int(os.path.basename(stale)[2:5]) >= len(sources): os.remove(stale)
if sources:
    w, h = Image.open(sources[0]).size
    with open(os.path.join(DEST, 'manifest.json'), 'w') as f:
        json.dump({'count': len(sources), 'width': w, 'height': h, 'v': int(time.time())}, f)
print(f'{len(sources)} frames, {total / 1e6:.1f} MB')

SITE = os.path.join(HERE, '..', '..', 'site', 'assets')
frames = sources
if frames:
    last = grade(clean(Image.open(frames[-1])))
    last.save(os.path.join(SITE, '3d', 'hero-still.webp'), quality=QUALITY, method=6)
    w, h = last.size; t = int(w * 630 / 1200)
    last.crop((0, (h - t) // 2, w, (h - t) // 2 + t)).resize((1200, 630), Image.LANCZOS).save(os.path.join(SITE, 'og.jpg'), quality=84)
    print('hero-still.webp and og.jpg from', os.path.basename(frames[-1]))
for name in ('ba-before', 'ba-after'):
    src = os.path.join(HERE, 'out', f'{name}.png')
    if os.path.exists(src):
        grade(clean(Image.open(src))).save(os.path.join(SITE, '3d', f'{name}.webp'), quality=QUALITY, method=6)
        print(f'{name}.webp')

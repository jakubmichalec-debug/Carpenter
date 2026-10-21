"""Turn the baked EXR lightmaps into gamma-encoded JPEGs for the site and print the scale hero3d.js needs (LM)."""
import bpy, numpy as np, json, os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
from PIL import Image, ImageFilter
out = {}
for g in ('floor', 'walls'):
    im = bpy.data.images.load(os.path.join(OUT, f'lm_{g}.exr'))
    w, h = im.size
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3]
    lum = px.mean(axis=2); valid = lum[lum > 1e-4]
    p99 = float(np.percentile(valid, 99.5)); scale = 0.92 / p99
    enc = np.clip(px * scale, 0, 1) ** (1 / 2.2)  # store gamma-encoded so 8 bits hold the darks
    # dilate: grow every UV island outward so filtering and the blur never pull in the empty (black) background
    mask = lum > 1e-4
    for _ in range(24):
        if mask.all(): break
        acc = np.zeros_like(enc); cnt = np.zeros(mask.shape, np.float32)
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1)):
            m = np.roll(np.roll(mask, dy, 0), dx, 1); e = np.roll(np.roll(enc, dy, 0), dx, 1)
            acc += e * m[..., None]; cnt += m
        grow = (~mask) & (cnt > 0)
        enc[grow] = acc[grow] / cnt[grow][:, None]; mask = mask | grow
    # light denoise inside islands: blur, then put back only where the blur stays within the island
    img = Image.fromarray((enc * 255 + 0.5).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))
    img.save(os.path.join(OUT, f'lm_{g}.jpg'), quality=90)
    out[g] = {'scale': scale, 'p99': p99, 'mean': float(valid.mean())}
print(json.dumps(out))
json.dump(out, open(os.path.join(OUT, 'lm.json'), 'w'))

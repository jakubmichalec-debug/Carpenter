# Blender hero scene

Builds the Home hero's wardrobe and alcove room in Blender 5.2 (headless, through the `bpy` package),
with CC0 textures and HDRI from [Poly Haven](https://polyhaven.com). Its output in `site/assets/3d/` is committed;
`tex/`, `tex1k/` and `out/` are not.

```
python -m venv .venv && .venv/bin/pip install bpy pillow numpy
.venv/bin/python fetch_assets.py
# web export: GLB with 1k textures + Cycles-baked room lightmaps
.venv/bin/python build.py --web --bake --export
.venv/bin/python lm.py            # prints the lightmap scales; copy them into LM in site/js/hero3d.js
cp out/hero.glb out/lm_floor.jpg out/lm_walls.jpg tex/room_1k.hdr ../../site/assets/3d/
# stills (2k textures, Cycles): out/still_site.png, still_beauty.png, still_closed.png
.venv/bin/python build.py --render --samples 128 --res 1920x1080
```

## Photoreal hero (image sequence)

The Home hero plays a Cycles-rendered image sequence of the assembly, scrubbed by scroll (`site/js/hero-frames.js`).
`film.py` builds on `build.py`'s scene (adds the window and sunlight, ceiling, softer linen, hangers, depth of field)
and replays the choreography and camera path of `createHero()` frame by frame.

```
.venv/bin/python film.py --total 120 --samples 40 --res 1280x720   # ~50 s a frame on 4 CPU cores; resumable
.venv/bin/python film.py --still 0.5                                 # one test frame at progress 0.5
python frames_to_web.py                                              # -> site/assets/hero-frames/*.webp
```

If the frame count changes, update `FRAME_COUNT` in `site/js/hero-frames.js`.

### Rendering on a Windows PC with an NVIDIA card (e.g. GTX 1660 Ti)

Shortcut: double-click `render_gpu.bat` (downloads textures, renders a test frame, then all 120, then converts them). The steps it runs:

1. Install [Blender 5.2](https://www.blender.org/download/) and an up-to-date NVIDIA driver, plus Python 3 with `pip install pillow`.
2. Get the branch and the textures:
   ```
   git clone -b wip https://github.com/jakubmichalec-debug/Carpenter
   cd Carpenter\tools\blender
   python fetch_assets.py
   ```
3. Render 120 frames at 1080p on the GPU (`--gpu` picks OptiX, then CUDA; about 15-30 s a frame on a 1660 Ti):
   ```
   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P film.py -- --gpu --total 120 --samples 64 --res 1920x1080
   ```
   It skips frames that already exist, so you can stop it and run the same command again to continue.
   Try one frame first: `... -P film.py -- --gpu --still 0.5 --samples 64 --res 1920x1080` writes `out\film_still_0.5.png`.
4. Convert and publish:
   ```
   python frames_to_web.py
   cd ..\..
   git add site/assets/hero-frames
   git commit -m "Hero frames: 1080p GPU render"
   git push
   ```

- Panel names, sizes and positions mirror `createHero()` in `site/js/hero3d.js`. Change both together.
- `hero3d.js` swaps each panel's geometry and material for the GLB's by name; the scroll choreography stays in JS.
- Three.js `(x, y, z)` is Blender `(x, -z, y)`.

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

- Panel names, sizes and positions mirror `createHero()` in `site/js/hero3d.js`. Change both together.
- `hero3d.js` swaps each panel's geometry and material for the GLB's by name; the scroll choreography stays in JS.
- Three.js `(x, y, z)` is Blender `(x, -z, y)`.

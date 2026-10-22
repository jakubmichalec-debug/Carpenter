"""Furnish the room around the alcove for film.py: scanned Poly Haven plants and furniture (CC0, fetched by
fetch_assets.py), a natural jute rug under the flat-pack pile, and a stained plinth. The wardrobe stays empty.

Placement is in three.js coordinates (x right, y up, z toward the camera; the wall face is z = 0.66) and keeps
clear of the panels' flight paths between the pile (around x 0.15, z 1.6) and the alcove (x -1..1).
"""
import math, os
import bpy
from mathutils import Vector


def _import(S, name):
    path = os.path.join(S.TEX, 'models', name, f'{name}.gltf')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before]
    for o in objs:
        for c in list(o.users_collection): c.objects.unlink(o)
        S.room.objects.link(o)
    roots = [o for o in objs if o.parent is None or o.parent not in objs]
    pivot = bpy.data.objects.new(f'{name}_pivot', None); S.room.objects.link(pivot)
    for r in roots:
        r.parent = pivot
    bpy.context.view_layer.update()
    return pivot, [o for o in objs if o.type == 'MESH']


def _bounds(meshes):
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def place(S, name, x, z, y=0.0, rot=0.0, height=None, report=None):
    """Stand a model on height y at (x, z), turned rot radians about the vertical, optionally scaled to a height."""
    pivot, meshes = _import(S, name)
    pivot.rotation_euler = (0, 0, rot)
    bpy.context.view_layer.update()
    lo, hi = _bounds(meshes)
    if height:
        pivot.scale = (height / (hi.z - lo.z),) * 3
        bpy.context.view_layer.update(); lo, hi = _bounds(meshes)
    target = S.B(x, y, z)
    centre = (lo + hi) / 2
    pivot.location += Vector((target.x - centre.x, target.y - centre.y, target.z - lo.z))
    bpy.context.view_layer.update()
    lo, hi = _bounds(meshes)
    if report is not None:
        report.append(f'{name}: {hi.x - lo.x:.2f} x {hi.z - lo.z:.2f} x {hi.y - lo.y:.2f} m (w x h x d)')
    for m in meshes:
        m.visible_shadow = True
    return pivot, (lo, hi)


def rug(S, x0, x1, z0, z1, border=0.045):
    # a darker woven border under the field, like a bound wool rug
    edge = S.pbr('rug_border', 'hessian_230_diff.jpg', 'hessian_230_rough.jpg', 'hessian_230_nor.jpg', nor_strength=0.8)
    en = edge.node_tree.nodes; el = edge.node_tree.links
    etex = [t for t in en if t.type == 'TEX_IMAGE' and t.image.colorspace_settings.name == 'sRGB'][0]
    emul = en.new('ShaderNodeMix'); emul.data_type = 'RGBA'; emul.blend_type = 'MULTIPLY'; emul.inputs['Factor'].default_value = 1.0
    emul.inputs['B'].default_value = (0.42, 0.37, 0.32, 1)
    el.new(etex.outputs['Color'], emul.inputs['A']); el.new(emul.outputs['Result'], en['Principled BSDF'].inputs['Base Color'])
    b = S.box_mesh('rug_border', [x1 - x0 + 2 * border, 0.007, z1 - z0 + 2 * border], 0.003)
    bpy.context.collection.objects.unlink(b); S.room.objects.link(b)
    S.uv_box(b, tile=0.12); b.data.materials.append(edge)
    S.place(b, [(x0 + x1) / 2, 0.0035, (z0 + z1) / 2])
    mat = S.pbr('rug', 'hessian_230_diff.jpg', 'hessian_230_rough.jpg', 'hessian_230_nor.jpg', nor_strength=0.8)
    bs = mat.node_tree.nodes['Principled BSDF']
    bs.inputs['Sheen Weight'].default_value = 0.0  # sheen washes the weave out at the camera's grazing angle
    bs.inputs['Sheen Roughness'].default_value = 0.6
    n = mat.node_tree.nodes; l = mat.node_tree.links
    tex = [t for t in n if t.type == 'TEX_IMAGE' and t.image.colorspace_settings.name == 'sRGB'][0]
    # natural light jute: the hessian scan is a saturated sack brown, so calm and lighten it; keep its contrast
    hs = n.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = 0.5; hs.inputs['Value'].default_value = 1.35
    bc = n.new('ShaderNodeBrightContrast'); bc.inputs['Contrast'].default_value = 0.3
    l.new(tex.outputs['Color'], hs.inputs['Color']); l.new(hs.outputs['Color'], bc.inputs['Color'])
    l.new(bc.outputs['Color'], bs.inputs['Base Color'])
    nm = [x for x in n if x.type == 'NORMAL_MAP'][0]; nm.inputs['Strength'].default_value = 2.2
    ob = S.box_mesh('rug', [x1 - x0, 0.008, z1 - z0], 0.003)
    bpy.context.collection.objects.unlink(ob); S.room.objects.link(ob)
    S.uv_box(ob, tile=0.12)
    ob.data.materials.append(mat)
    S.place(ob, [(x0 + x1) / 2, 0.0045, (z0 + z1) / 2])
    return ob


def art_print(size=768):
    """A quiet abstract print on warm paper (slate disc, amber arc, a fine rule), made with numpy so it needs no files."""
    import numpy as np
    h = w = size
    y, x = np.mgrid[0:h, 0:w] / size
    rng = np.random.default_rng(7)
    img = np.empty((h, w, 3), np.float32)
    img[:] = (0.93, 0.91, 0.87)
    img += (rng.random((h, w, 1)) - 0.5) * 0.025  # paper grain
    disc = ((x - 0.42) ** 2 + (y - 0.56) ** 2) < 0.24 ** 2
    img[disc] = img[disc] * 0.35 + np.array((0.31, 0.44, 0.52)) * 0.65
    r = np.sqrt((x - 0.62) ** 2 + (y - 0.4) ** 2)
    arc = (np.abs(r - 0.22) < 0.012) & (y > 0.4)
    img[arc] = (0.75, 0.54, 0.31)
    rule = (np.abs(y - 0.86) < 0.0025) & (x > 0.18) & (x < 0.82)
    img[rule] = (0.2, 0.2, 0.2)
    im = bpy.data.images.new('art_print', w, h)
    rgba = np.concatenate([np.clip(img, 0, 1), np.ones((h, w, 1), np.float32)], axis=2)[::-1]
    im.pixels.foreach_set(rgba.ravel())
    im.pack()
    return im


def dress_frame(S, pivot):
    """Swap the model's placeholder insert for the print and its dark blended glass for clear glass."""
    for ob in pivot.children_recursive:
        if ob.type != 'MESH':
            continue
        for slot in ob.material_slots:
            m = slot.material
            if not m:
                continue
            if m.name.endswith('_artwork'):
                bs = m.node_tree.nodes['Principled BSDF']
                tex = [n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and bs.inputs['Base Color'].links and n == bs.inputs['Base Color'].links[0].from_node]
                node = tex[0] if tex else m.node_tree.nodes.new('ShaderNodeTexImage')
                node.image = art_print()
                if not tex: m.node_tree.links.new(node.outputs['Color'], bs.inputs['Base Color'])
                bs.inputs['Roughness'].default_value = 0.85
            elif m.name.endswith('_glass'):
                g = bpy.data.materials.new('frame_glass'); g.use_nodes = True
                gb = g.node_tree.nodes['Principled BSDF']
                gb.inputs['Base Color'].default_value = (1, 1, 1, 1)
                gb.inputs['Roughness'].default_value = 0.02
                gb.inputs['Alpha'].default_value = 0.1
                slot.material = g


def stained(S, mat, darkness=0.32):
    """Turn a flat material into stained oak: the oak veneer texture multiplied down to a dark stain."""
    nt = mat.node_tree; n = nt.nodes; l = nt.links
    bs = n['Principled BSDF']
    tex = n.new('ShaderNodeTexImage'); tex.image = S.img('oak_veneer_01_diff.jpg')
    mul = n.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    mul.inputs['B'].default_value = (darkness, darkness * 0.92, darkness * 0.86, 1)
    l.new(tex.outputs['Color'], mul.inputs['A']); l.new(mul.outputs['Result'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.55


def populate(S):
    # the wardrobe is shown empty: drop the linen, boxes and shirts build.py adds for the stills
    for ob in list(S.props.objects):
        if ob.name.startswith(('fold', 'box', 'shirt')):
            bpy.data.objects.remove(ob, do_unlink=True)
    stained(S, S.PLINTH)

    report = []
    rug(S, -1.5, 1.55, 1.0, 2.8)
    # right of the alcove: side table with a succulent and a vase, a large plant, a print on the wall
    _, (lo, hi) = place(S, 'side_table_01', 1.62, 1.02, rot=0.0, report=report)
    top = hi.z
    place(S, 'potted_plant_04', 1.52, 0.98, y=top, report=report)
    place(S, 'ceramic_vase_01', 1.78, 1.06, y=top, height=0.3, report=report)
    place(S, 'potted_plant_02', 2.55, 1.05, rot=0.6, height=1.15, report=report)
    frame, _ = place(S, 'hanging_picture_frame_01', 2.1, 0.68, y=1.25, report=report)
    dress_frame(S, frame)
    # left, in the window light: a tall plant and a lounge chair turned toward the room
    place(S, 'potted_plant_01', -4.35, 1.0, rot=1.2, height=1.35, report=report)
    place(S, 'mid_century_lounge_chair', -3.25, 1.45, rot=math.radians(-28), report=report)
    print('\n'.join(report))

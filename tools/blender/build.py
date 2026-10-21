"""Build the Grain & Joint hero scene in Blender: wardrobe panels (same names and sizes as site/js/hero3d.js),
an alcove room with baked lighting, an HDRI world. Exports a GLB for the site and renders Cycles stills.

Usage: python build.py [--bake] [--export] [--render] [--samples N] [--res WxH]
Three.js coordinates (x, y up, z toward the camera) map to Blender as (x, -z, y).
"""
import math, os, sys, random
import bpy, bmesh
from mathutils import Vector, Matrix, Euler

ROOT = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(ROOT, 'tex1k' if '--web' in sys.argv else 'tex')
sys.path.insert(0, ROOT)
OUT = os.path.join(ROOT, 'out')
os.makedirs(OUT, exist_ok=True)
# works both as `python build.py ...` (bpy package) and `blender -b -P build.py -- ...`
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
def arg(name, default=None):
    return args[args.index(name) + 1] if name in args else default

def B(x, y, z):  # three -> blender
    return Vector((x, -z, y))

# ------------------------------------------------------------------ reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'

# ------------------------------------------------------------------ materials
def img(name, colorspace='sRGB'):
    path = os.path.join(TEX, name)
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = colorspace
    return im

def pbr(name, diff, rough=None, nor=None, rough_value=0.6, tint=None, nor_strength=0.6, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; n = nt.nodes; l = nt.links
    bsdf = n['Principled BSDF']
    t = n.new('ShaderNodeTexImage'); t.image = img(diff); l.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if rough:
        r = n.new('ShaderNodeTexImage'); r.image = img(rough, 'Non-Color'); l.new(r.outputs['Color'], bsdf.inputs['Roughness'])
    else:
        bsdf.inputs['Roughness'].default_value = rough_value
    if nor:
        nt_ = n.new('ShaderNodeTexImage'); nt_.image = img(nor, 'Non-Color')
        nm = n.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = nor_strength
        l.new(nt_.outputs['Color'], nm.inputs['Color']); l.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if coat:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = 0.35
    return m

def flat(name, color, rough=0.6, metal=0.0, emit=None, emit_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    return m

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)

OAK = pbr('oak', 'oak_veneer_01_diff.jpg', 'oak_veneer_01_rough.jpg', 'oak_veneer_01_nor.jpg', nor_strength=0.35)
BIRCH = pbr('birch', 'birch_diff.jpg', 'white_oak_veneer_rough.jpg', 'white_oak_veneer_nor.jpg', nor_strength=0.3)
PLINTH = flat('plinth', srgb('#2b2622'), 0.7)
STEEL = flat('steel', srgb('#c9c4bb'), 0.28, 1.0)
HANDLE = flat('handle', srgb('#26262a'), 0.38, 0.85)
LED = flat('led', srgb('#fff1d6'), 0.5, emit=srgb('#ffd9a0'), emit_strength=0.0)

# ------------------------------------------------------------------ geometry helpers
def box_mesh(name, dims3, bevel=0.0015):
    """dims3 in three.js order (x, y, z). Returns an object with origin at its centre."""
    dx, dy, dz = dims3
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((dx, dz, dy)), verts=bm.verts)
    if bevel and min(dims3) > 4 * bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, profile=0.5, affect='EDGES')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob

def uv_box(ob, tile=1.0, grain_axis=None, seed=0):
    """Per-face planar UVs in metres / tile. The grain (texture V) runs along grain_axis (blender axis index)
    when that axis lies in the face, so long panels show long grain."""
    me = ob.data
    dims = [max(v.co[i] for v in me.vertices) - min(v.co[i] for v in me.vertices) for i in range(3)]
    if grain_axis is None:
        grain_axis = max(range(3), key=lambda i: dims[i])
    rnd = random.Random(seed)
    off = (rnd.random(), rnd.random())
    bm = bmesh.new(); bm.from_mesh(me)
    uvl = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        n = f.normal
        na = max(range(3), key=lambda i: abs(n[i]))
        axes = [i for i in range(3) if i != na]
        if grain_axis in axes:
            v_ax = grain_axis; u_ax = axes[0] if axes[1] == grain_axis else axes[1]
        else:
            u_ax, v_ax = axes[0], axes[1]
        for loop in f.loops:
            co = loop.vert.co
            loop[uvl].uv = (co[u_ax] / tile + off[0], co[v_ax] / tile + off[1])
    bm.to_mesh(me); bm.free()

def smooth_bevel(ob):
    for p in ob.data.polygons: p.use_smooth = False

def place(ob, pos3, rot_y=0.0):
    ob.location = B(*pos3)
    ob.rotation_euler = Euler((0, 0, rot_y))

# ------------------------------------------------------------------ wardrobe (mirrors hero3d.js)
W, H, D, T, PL = 2.0, 2.3, 0.6, 0.022, 0.1
yb, yt = PL + T, H - T
bayW = W / 2 - T - T / 2
lx = -(W / 2 - T) / 2 - T / 4; rx = -lx
fy = (PL + H) / 2

wardrobe = bpy.data.collections.new('wardrobe'); scene.collection.children.link(wardrobe)
room = bpy.data.collections.new('room'); scene.collection.children.link(room)
props = bpy.data.collections.new('props'); scene.collection.children.link(props)

def panel(name, dims, pos, mat, grain='y', seed=0, bevel=0.0015, coll=wardrobe):
    ob = box_mesh(name, dims, bevel)
    bpy.context.collection.objects.unlink(ob); coll.objects.link(ob)
    gmap = {'x': 0, 'y': 2, 'z': 1}  # three axis -> blender axis
    uv_box(ob, tile=1.15, grain_axis=gmap[grain], seed=seed)
    ob.data.materials.append(mat)
    place(ob, pos)
    return ob

P = {}
P['sideL'] = panel('sideL', [T, H, D], [-(W / 2 - T / 2), H / 2, D / 2], OAK, 'y', 2)
P['sideR'] = panel('sideR', [T, H, D], [W / 2 - T / 2, H / 2, D / 2], OAK, 'y', 3)
P['bottom'] = panel('bottom', [W - 2 * T, T, D - 0.01], [0, PL + T / 2, D / 2 + 0.005], BIRCH, 'x', 1)
P['plinth'] = panel('plinth', [W - 2 * T, PL, 0.018], [0, PL / 2, D - 0.07], PLINTH, 'x', 0)
for i, sd in enumerate([-1, 1]):
    P[f'back{i}'] = panel(f'back{i}', [(W - 2 * T) / 2 - 0.001, H - PL, 0.008], [sd * (W - 2 * T) / 4, fy, 0.004], BIRCH, 'y', 4 + i, bevel=0)
P['divider'] = panel('divider', [T, yt - yb, D - 0.012], [0, (yt + yb) / 2, (D - 0.012) / 2 + 0.008], BIRCH, 'y', 5)
P['top'] = panel('top', [W, T, D], [0, H - T / 2, D / 2], OAK, 'x', 6)
shelfH = [yb + ((yt - yb) / 5) * k for k in range(1, 5)]
for i, y in enumerate(shelfH):
    P[f'shelfL{i}'] = panel(f'shelfL{i}', [bayW, T, D - 0.04], [lx, y, (D - 0.04) / 2 + 0.01], BIRCH, 'x', 7 + i)
railY = 1.86
rShelves = [shelfH[0], shelfH[1], 2.02]
for i, y in enumerate(rShelves):
    P[f'shelfR{i}'] = panel(f'shelfR{i}', [bayW, T, D - 0.04], [rx, y, (D - 0.04) / 2 + 0.01], BIRCH, 'x', 12 + i)
# rail: a real tube instead of a box
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.013, depth=bayW - 0.02, rotation=(0, math.pi / 2, 0))
rail = bpy.context.object; rail.name = 'rail'; rail.data.name = 'rail'
for c in rail.users_collection: c.objects.unlink(rail)
wardrobe.objects.link(rail); rail.data.materials.append(STEEL); place(rail, [rx, railY, 0.3])
for p in rail.data.polygons: p.use_smooth = True
P['rail'] = rail

doorW = W / 2 - 0.004; doorH = H - PL - 0.008
door_pose = {}
for i, (side, hx) in enumerate([(-1, -W / 2 + 0.002), (1, W / 2 - 0.002)]):
    hingeDir = 1 if side == -1 else -1
    d = panel(f'door{i}', [doorW, doorH, T], [hx + hingeDir * doorW / 2, (PL + 0.004 + H - 0.004) / 2, D + T / 2 + 0.002], OAK, 'y', 20 + i)
    # handle: a slim bar with rounded ends, child of the door, near the free edge
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.008, depth=0.34)
    h = bpy.context.object; h.name = f'door{i}_handle'; h.data.name = h.name
    for c in h.users_collection: c.objects.unlink(h)
    wardrobe.objects.link(h); h.data.materials.append(HANDLE)
    for p in h.data.polygons: p.use_smooth = True
    h.parent = d
    h.location = B(hingeDir * (doorW / 2 - 0.07), -0.05, T / 2 + 0.016)
    # two standoffs
    for k, yy in enumerate((-0.13, 0.13)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.004, depth=0.018, rotation=(math.pi / 2, 0, 0))
        s = bpy.context.object; s.name = f'door{i}_post{k}'
        for c in s.users_collection: c.objects.unlink(s)
        wardrobe.objects.link(s); s.data.materials.append(HANDLE); s.parent = d
        s.location = B(hingeDir * (doorW / 2 - 0.07), -0.05 + yy, T / 2 + 0.008)
    P[f'door{i}'] = d
    door_pose[i] = (hx, hingeDir)

# LED strips (stills only; the site keeps its own emissive bars)
leds = []
for i, (x, y) in enumerate([(lx, yt), (rx, 2.02 - T / 2)]):
    l = box_mesh(f'led{i}', [bayW - 0.1, 0.008, 0.02], 0)
    bpy.context.collection.objects.unlink(l); props.objects.link(l)
    l.data.materials.append(LED); place(l, [x, y - 0.006, 0.4]); leds.append(l)

# ------------------------------------------------------------------ room (alcove 2.0 wide, 2.38 high, 0.66 deep)
WALL_FRONT = 0.66; AH = 2.38; RW = 9.0; RH = 4.6; FD = 10.0
WALL = pbr('wall', 'white_plaster_02_diff.jpg', None, 'white_plaster_02_nor.jpg', rough_value=0.92, nor_strength=0.15)
# the plaster texture is grey: tint it to the site's paper colour by mixing in a flat colour
wn = WALL.node_tree.nodes; wl = WALL.node_tree.links
mix = wn.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MIX'; mix.inputs['Factor'].default_value = 0.86
mix.inputs['B'].default_value = (*srgb('#ecebe6'), 1)
tex = [n for n in wn if n.type == 'TEX_IMAGE' and n.image.colorspace_settings.name == 'sRGB'][0]
wl.new(tex.outputs['Color'], mix.inputs['A']); wl.new(mix.outputs['Result'], wn['Principled BSDF'].inputs['Base Color'])
FLOOR = pbr('floor', 'laminate_floor_02_diff.jpg', 'laminate_floor_02_rough.jpg', 'laminate_floor_02_nor.jpg', nor_strength=0.4)
SKIRT = flat('skirting', srgb('#f1f0ec'), 0.55)

def room_box(name, x0, x1, y0, y1, z0, z1, mat, tile=1.6):
    ob = box_mesh(name, [x1 - x0, y1 - y0, z1 - z0], 0)
    bpy.context.collection.objects.unlink(ob); room.objects.link(ob)
    uv_box(ob, tile=tile, seed=0)
    ob.data.materials.append(mat)
    place(ob, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2])
    return ob

floor = room_box('room_floor', -RW, RW, -0.05, 0.0, -0.2, FD, FLOOR, tile=2.4)
walls = [
    room_box('wall_l', -RW, -W / 2, 0, RH, -0.3, WALL_FRONT, WALL),
    room_box('wall_r', W / 2, RW, 0, RH, -0.3, WALL_FRONT, WALL),
    room_box('wall_soffit', -W / 2, W / 2, AH, RH, -0.3, WALL_FRONT, WALL),
    room_box('wall_back', -W / 2, W / 2, 0, AH, -0.3, 0.0, WALL),
]
skirts = [
    room_box('skirt_l', -RW, -W / 2 - 0.0, 0, 0.1, WALL_FRONT, WALL_FRONT + 0.018, SKIRT),
    room_box('skirt_r', W / 2, RW, 0, 0.1, WALL_FRONT, WALL_FRONT + 0.018, SKIRT),
]

# ------------------------------------------------------------------ props for the stills: folded linen, boxes, shirts
FAB = [flat(f'fab{i}', srgb(c), 0.95) for i, c in enumerate(['#efe6d4', '#7d8b6a', '#c0765a', '#6b4a35', '#8aa0aa', '#d9a441', '#e6d6b8', '#a9b59a'])]
for m in FAB:
    bs = m.node_tree.nodes['Principled BSDF']; bs.inputs['Sheen Weight'].default_value = 0.4
rnd = random.Random(5)
def fold_stack(cx, base, cz, count, ci):
    for i in range(count):
        ob = box_mesh('fold', [0.4, 0.05, 0.32], 0.012)
        bpy.context.collection.objects.unlink(ob); props.objects.link(ob)
        mod = ob.modifiers.new('sub', 'SUBSURF'); mod.levels = 1; mod.render_levels = 2
        ob.data.materials.append(FAB[(ci + (1 if i % 5 == 3 else 0)) % len(FAB)])
        for p in ob.data.polygons: p.use_smooth = True
        place(ob, [cx + (rnd.random() - .5) * .014, base + 0.025 + i * 0.05, cz + (rnd.random() - .5) * .014], (rnd.random() - .5) * .05)
ci = 0
for i, y0 in enumerate([yb] + shelfH):
    y = y0 + T / 2
    c = [5, 4, 6, 4, 3][i]
    fold_stack(lx - 0.2, y, 0.34, c, ci); ci += 1
    if i % 2 == 0:
        fold_stack(lx + 0.22, y, 0.34, max(2, c - 2), ci); ci += 1
    else:
        bx = box_mesh('box', [0.36, 0.22, 0.3], 0.01); bpy.context.collection.objects.unlink(bx); props.objects.link(bx)
        bx.data.materials.append(flat('kraft', srgb('#d8c7a6'), 0.9)); place(bx, [lx + 0.22, y + 0.11, 0.34])
for i, y0 in enumerate([yb, rShelves[0], rShelves[2]]):
    y = y0 + T / 2
    fold_stack(rx - 0.2, y, 0.34, [5, 4, 3][i], ci); ci += 1
    fold_stack(rx + 0.22, y, 0.34, [3, 5, 4][i], ci); ci += 1
shirt = [(-0.05, 0), (-0.22, -0.07), (-0.3, -0.24), (-0.225, -0.285), (-0.18, -0.2), (-0.18, -0.7), (0.18, -0.7), (0.18, -0.2), (0.225, -0.285), (0.3, -0.24), (0.22, -0.07), (0.05, 0), (0, -0.035)]
for i in range(8):
    me = bpy.data.meshes.new('shirt'); bm = bmesh.new()
    vs = [bm.verts.new((x, 0, y)) for x, y in shirt]; f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f]); bmesh.ops.translate(bm, vec=(0, 0.022, 0), verts=[e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('shirt', me); props.objects.link(ob)
    bev = ob.modifiers.new('bev', 'BEVEL'); bev.width = 0.007; bev.segments = 2
    ob.data.materials.append(FAB[[1, 2, 0, 4, 3, 5, 7, 1][i]])
    sx = 0.92 + rnd.random() * 0.2; sy = 0.86 + rnd.random() * 0.28
    ob.scale = (sx, 1, sy)
    place(ob, [rx - bayW / 2 + 0.1 + (i * (bayW - 0.2)) / 7, railY - 0.012, 0.3], math.pi / 2 - 0.85 + (rnd.random() - .5) * 0.16)

# ------------------------------------------------------------------ world + lights
world = bpy.data.worlds.new('world'); scene.world = world; world.use_nodes = True
wn = world.node_tree.nodes; wl = world.node_tree.links
env = wn.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(os.path.join(TEX, 'room_2k.hdr'))
mapn = wn.new('ShaderNodeMapping'); coord = wn.new('ShaderNodeTexCoord')
mapn.inputs['Rotation'].default_value = (0, 0, math.radians(200))
wl.new(coord.outputs['Generated'], mapn.inputs['Vector']); wl.new(mapn.outputs['Vector'], env.inputs['Vector'])
wn['Background'].inputs['Strength'].default_value = 0.42
wl.new(env.outputs['Color'], wn['Background'].inputs['Color'])

def look_at(ob, target):
    d = (target - ob.location).normalized()
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

# key: matches the site's directional light (0.8, 5.4, 5.6) -> (0, 1, 0.3)
sun = bpy.data.lights.new('key', 'SUN'); sun.energy = 2.6; sun.angle = math.radians(6); sun.color = srgb('#fff3e4')
so = bpy.data.objects.new('key', sun); scene.collection.objects.link(so)
so.location = B(0.8, 5.4, 5.6); look_at(so, B(0, 1, 0.3))
# soft window light from the front left
area = bpy.data.lights.new('window', 'AREA'); area.shape = 'RECTANGLE'; area.size = 3.0; area.size_y = 2.2; area.energy = 650; area.color = srgb('#eef3ff')
ao = bpy.data.objects.new('window', area); scene.collection.objects.link(ao)
ao.location = B(-4.5, 2.4, 4.0); look_at(ao, B(0, 1.0, 0.3))
# warm LED bay lights (stills only)
led_lights = []
for i, (x, y) in enumerate([(lx, yt), (rx, 2.02 - T / 2)]):
    ll = bpy.data.lights.new(f'ledlight{i}', 'AREA'); ll.shape = 'RECTANGLE'; ll.size = bayW - 0.1; ll.size_y = 0.02; ll.energy = 0.0; ll.color = srgb('#ffc98a')
    lo = bpy.data.objects.new(f'ledlight{i}', ll); props.objects.link(lo)
    lo.location = B(x, y - 0.012, 0.4); lo.rotation_euler = (0, 0, 0)  # area lights point down (-Z) by default
    led_lights.append(lo)

# ------------------------------------------------------------------ render settings
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
if '--gpu' in args:
    # NVIDIA: OptiX first (works on GTX 16xx and RTX), then CUDA; AMD: HIP; Apple: Metal
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for backend in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == backend]
        except Exception:
            gpus = []
        if gpus:
            for d in prefs.devices: d.use = d.type == backend
            scene.cycles.device = 'GPU'
            print('Cycles on', backend, [d.name for d in gpus])
            break
    else:
        print('No GPU found, rendering on the CPU')
scene.cycles.samples = int(arg('--samples', 96))
scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = -0.25
scene.cycles.max_bounces = 6
w, h = (int(v) for v in arg('--res', '1600x900').split('x'))
scene.render.resolution_x, scene.render.resolution_y = w, h

def set_assembled(open_doors=True, leds_on=True):
    for i, (hx, hingeDir) in door_pose.items():
        d = P[f'door{i}']
        ang = (-1 if hingeDir > 0 else 1) * 1.78 if open_doors else 0.0
        # rotate the door about its hinge line (three: y axis at x = hx, z = D + T/2 + 0.002)
        hinge = B(hx, 0, D + T / 2 + 0.002)
        centre = B(hx + hingeDir * doorW / 2, (PL + 0.004 + H - 0.004) / 2, D + T / 2 + 0.002)
        rel = centre - Vector((hinge.x, hinge.y, centre.z))
        rel.rotate(Euler((0, 0, ang)))
        d.location = Vector((hinge.x, hinge.y, centre.z)) + rel
        d.rotation_euler = Euler((0, 0, ang))
    for l in leds:
        l.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 6.0 if leds_on else 0.0
    for lo in led_lights:
        lo.data.energy = 14.0 if leds_on else 0.0

def camera(pos3, look3, fov_v=34, name='cam'):
    cd = bpy.data.cameras.new(name); cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(fov_v)
    co = bpy.data.objects.new(name, cd); scene.collection.objects.link(co)
    co.location = B(*pos3); look_at(co, B(*look3))
    scene.camera = co
    return co

# ------------------------------------------------------------------ bake room lighting into lightmaps
def bake_room(size=1024, samples=256):
    for c in (wardrobe, props): c.hide_render = True
    bpy.context.view_layer.update()
    targets = [floor] + walls + skirts
    for ob in targets:
        uvs = ob.data.uv_layers
        lm = uvs.new(name='lightmap')
    # one shared lightmap atlas for all walls + skirting, one for the floor
    groups = {'floor': [floor], 'walls': walls + skirts}
    scene.cycles.samples = samples
    scene.render.bake.margin = 6
    for gname, obs in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in obs:
            ob.select_set(True); ob.data.uv_layers.active = ob.data.uv_layers['lightmap']
        bpy.context.view_layer.objects.active = obs[0]
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, scale_to_bounds=False)
        bpy.ops.uv.pack_islands(margin=0.004)
        bpy.ops.object.mode_set(mode='OBJECT')
        im = bpy.data.images.new(f'lm_{gname}', size, size, float_buffer=True)
        for ob in obs:
            for m in ob.data.materials:
                nt = m.node_tree
                node = nt.nodes.get('lm_target') or nt.nodes.new('ShaderNodeTexImage')
                node.name = 'lm_target'; node.image = im
                uvn = nt.nodes.get('lm_uv') or nt.nodes.new('ShaderNodeUVMap'); uvn.name = 'lm_uv'; uvn.uv_map = 'lightmap'
                if not node.inputs['Vector'].links: nt.links.new(uvn.outputs['UV'], node.inputs['Vector'])
                nt.nodes.active = node
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, use_clear=True, margin=6)
        path = os.path.join(OUT, f'lm_{gname}.exr')
        im.filepath_raw = path; im.file_format = 'OPEN_EXR'; im.save()
        print('baked', path)
        for ob in obs: ob.data.uv_layers.active = ob.data.uv_layers['UVMap']
    for c in (wardrobe, props): c.hide_render = False

if '--bake' in args:
    bake_room(int(arg('--lm', 1024)), int(arg('--bake-samples', 256)))

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'grain-and-joint-hero.blend'))

# ------------------------------------------------------------------ export panels for the site
if '--export' in args:
    flatwall = flat('wall', srgb('#ecebe6'), 0.92)
    for ob in walls: ob.data.materials[0] = flatwall
    bpy.ops.object.select_all(action='DESELECT')
    for ob in wardrobe.objects: ob.select_set(True)
    for ob in [floor] + walls + skirts: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'hero.glb'), use_selection=True, export_format='GLB',
                              export_image_format='JPEG', export_jpeg_quality=86, export_apply=True,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT', export_yup=True)
    print('exported glb')

# ------------------------------------------------------------------ stills
if '--render' in args:
    set_assembled(True, True)
    # the site's final scroll pose at 16:9
    tanV = math.tan(math.radians(17)); dist = max(4.5 / (2 * tanV), 6.2 / (16 / 9 * 2 * tanV))
    tx = -0.95 * (1 - 0.35)
    camera((tx, 1.85, 0.5 + dist), (tx, 1.15, 0.5), 34, 'cam_site')
    scene.render.filepath = os.path.join(OUT, 'still_site.png'); bpy.ops.render.render(write_still=True)
    camera((2.6, 1.55, 4.1), (0.05, 1.12, 0.3), 36, 'cam_beauty')
    scene.render.filepath = os.path.join(OUT, 'still_beauty.png'); bpy.ops.render.render(write_still=True)
    set_assembled(False, False)
    camera((-1.9, 1.5, 4.2), (0.1, 1.15, 0.3), 34, 'cam_closed')
    scene.render.filepath = os.path.join(OUT, 'still_closed.png'); bpy.ops.render.render(write_still=True)
    print('rendered')

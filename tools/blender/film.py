"""Render the Home hero as a photoreal image sequence: the wardrobe assembling from a flat-pack pile, frame by frame,
with the same choreography and camera path as site/js/hero3d.js (landscape framing).

Usage: python film.py [--frames 0:144] [--total 144] [--samples 48] [--res 1600x900] [--still P]
Writes out/frames/f_###.png. --still P renders a single frame at progress P to out/film_still.png.
"""
import math, os, sys, random
_args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
sys.argv = [sys.argv[0]] + [a for a in _args if a in ('--web', '--gpu')] + ['--samples', '0']  # build.py reads argv
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build as S
import bpy, bmesh
from mathutils import Vector, Quaternion, Matrix, Euler

def arg(name, default=None):
    return _args[_args.index(name) + 1] if name in _args else default

scene = S.scene
B, srgb = S.B, S.srgb

# ------------------------------------------------------------------ realism pass on the scene
# window in a left side wall, with sun falling through it
LX = -7.0
win_mat = S.WALL
def box(name, x0, x1, y0, y1, z0, z1, mat, coll):
    ob = S.box_mesh(name, [x1 - x0, y1 - y0, z1 - z0], 0)
    bpy.context.collection.objects.unlink(ob); coll.objects.link(ob)
    S.uv_box(ob, tile=1.6); ob.data.materials.append(mat)
    S.place(ob, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]); return ob
CEIL = 3.6
wz0, wz1, wy0, wy1 = 1.6, 4.4, 0.7, 2.6
box('lwall_a', LX - 0.25, LX, 0, CEIL, S.WALL_FRONT, wz0, win_mat, S.room)
box('lwall_b', LX - 0.25, LX, 0, CEIL, wz1, 9.5, win_mat, S.room)
box('lwall_c', LX - 0.25, LX, 0, wy0, wz0, wz1, win_mat, S.room)
box('lwall_d', LX - 0.25, LX, wy1, CEIL, wz0, wz1, win_mat, S.room)
frame_mat = S.flat('window_frame', srgb('#f1f0ec'), 0.45)
for (a, b2, c, d) in [(wy0, wy0 + 0.05, wz0, wz1), (wy1 - 0.05, wy1, wz0, wz1), (wy0, wy1, wz0, wz0 + 0.05), (wy0, wy1, wz1 - 0.05, wz1), (wy0, wy1, (wz0 + wz1) / 2 - 0.025, (wz0 + wz1) / 2 + 0.025), ((wy0 + wy1) / 2 + 0.2 - 0.02, (wy0 + wy1) / 2 + 0.2 + 0.02, wz0, wz1)]:
    box('wframe', LX - 0.2, LX - 0.12, a, b2, c, d, frame_mat, S.room)
sill = box('sill', LX - 0.25, LX + 0.06, wy0 - 0.03, wy0, wz0 - 0.05, wz1 + 0.05, frame_mat, S.room)
# ceiling (keeps the bounce light realistic) and the plaster wall stays textured for the film
box('ceiling', LX - 0.3, S.RW, CEIL, CEIL + 0.1, -0.3, 9.5, S.flat('ceiling', srgb('#f4f4f1'), 0.9), S.room)
for ob in S.walls:  # walls were cut at RH; trim the room to the ceiling height visually by leaving them (hidden above the ceiling)
    pass

# sun through the window, from the left, front and above
S.sun.energy = 4.6; S.sun.angle = math.radians(1.0); S.sun.color = srgb('#fff7ec')
sun_dir = Vector((1.0, -0.36, -0.5)).normalized()  # three coords: travelling right, down, toward the back wall
S.so.location = B(-6, 4, 4)
S.so.rotation_euler = B(*sun_dir).to_track_quat('-Z', 'Y').to_euler()
S.area.energy = 260; S.area.size = 4.0  # soft fill from the camera side
S.ao.location = B(0.5, 2.2, 9.0); S.look_at(S.ao, B(0, 1.2, 0))
bpy.data.worlds['world'].node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
scene.view_settings.exposure = 0.2

# furnish the room (plants, side table, chair, rug, a print); the wardrobe itself stays empty
import furnish
furnish.populate(S)

# camera depth of field
scene.render.use_persistent_data = True
scene.cycles.samples = int(arg('--samples', 48))
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.02
scene.cycles.max_bounces = 8
w, h = (int(v) for v in arg('--res', '1600x900').split('x'))
scene.render.resolution_x, scene.render.resolution_y = w, h
scene.render.image_settings.file_format = 'PNG'
cam_data = bpy.data.cameras.new('film_cam'); cam_data.sensor_fit = 'VERTICAL'; cam_data.angle_y = math.radians(34)
cam_data.dof.use_dof = True; cam_data.dof.aperture_fstop = 5.6
cam = bpy.data.objects.new('film_cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam

# ------------------------------------------------------------------ choreography (ported from hero3d.js)
clamp = lambda v, a, b: min(b, max(a, v))
lerp = lambda a, b, t: a + (b - a) * t
rng_range = lambda p, a, b: clamp((p - a) / (b - a), 0, 1)
smooth = lambda t: t * t * (3 - 2 * t)
easeInOut = lambda t: 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2
easeOutCubic = lambda t: 1 - (1 - t) ** 3
def easeOutBack(t):
    c1 = 1.5; c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2

M = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # three -> blender
def q_to_blender(q):
    return (M @ q.to_matrix() @ M.transposed()).to_quaternion()

W, H, D, T, PL = S.W, S.H, S.D, S.T, S.PL
doorW = S.doorW
rand = random.Random(5).random

class Rec:
    pass
recs = []
def rec_for(name, dims, center, door=None):
    r = Rec(); r.name = name; r.ob = S.P[name]; r.dims = dims; r.finalCenter = Vector(center); r.door = door
    r.ob.rotation_mode = 'QUATERNION'
    recs.append(r); return r

yb, yt, bayW, lx, rx, fy = S.yb, S.yt, S.bayW, S.lx, S.rx, S.fy
carcass = [
    rec_for('sideL', [T, H, D], [-(W / 2 - T / 2), H / 2, D / 2]),
    rec_for('sideR', [T, H, D], [W / 2 - T / 2, H / 2, D / 2]),
    rec_for('bottom', [W - 2 * T, T, D - 0.01], [0, PL + T / 2, D / 2 + 0.005]),
    rec_for('plinth', [W - 2 * T, PL, 0.018], [0, PL / 2, D - 0.07]),
    rec_for('back0', [(W - 2 * T) / 2 - 0.001, H - PL, 0.008], [-(W - 2 * T) / 4, fy, 0.004]),
    rec_for('back1', [(W - 2 * T) / 2 - 0.001, H - PL, 0.008], [(W - 2 * T) / 4, fy, 0.004]),
    rec_for('divider', [T, yt - yb, D - 0.012], [0, (yt + yb) / 2, (D - 0.012) / 2 + 0.008]),
    rec_for('top', [W, T, D], [0, H - T / 2, D / 2]),
]
for i, y in enumerate(S.shelfH):
    carcass.append(rec_for(f'shelfL{i}', [bayW, T, D - 0.04], [lx, y, (D - 0.04) / 2 + 0.01]))
for i, y in enumerate(S.rShelves):
    carcass.append(rec_for(f'shelfR{i}', [bayW, T, D - 0.04], [rx, y, (D - 0.04) / 2 + 0.01]))
carcass.append(rec_for('rail', [bayW - 0.02, 0.026, 0.026], [rx, S.railY, 0.3]))
doors = []
for i, (side, hx) in enumerate([(-1, -W / 2 + 0.002), (1, W / 2 - 0.002)]):
    hingeDir = 1 if side == -1 else -1
    hinge = Vector((hx, (PL + 0.004 + H - 0.004) / 2, D + T / 2 + 0.002))
    r = rec_for(f'door{i}', [doorW, H - PL - 0.008, T], hinge + Vector((hingeDir * doorW / 2, 0, 0)), door=dict(hinge=hinge, hingeDir=hingeDir))
    doors.append(r)

# flat-pack pile: longest axis -> x, middle -> z, thinnest -> y, stacked
stack = list(reversed(carcass + doors))
ySum = 0.02
for r in stack:
    idx = sorted(range(3), key=lambda a: -r.dims[a])
    cols = [Vector(), Vector(), Vector()]
    cols[idx[0]] = Vector((1, 0, 0)); cols[idx[1]] = Vector((0, 0, 1)); cols[idx[2]] = Vector((0, 1, 0))
    m = Matrix((cols[0], cols[1], cols[2])).transposed()
    if m.determinant() < 0:
        cols[idx[2]] = Vector((0, -1, 0)); m = Matrix((cols[0], cols[1], cols[2])).transposed()
    q = m.to_quaternion()
    q = Quaternion((0, 1, 0), (rand() - 0.5) * 0.18) @ q
    th = r.dims[idx[2]]
    r.pileQ = q
    r.pileCenter = Vector((0.15 + (rand() - 0.5) * 0.22, ySum + th / 2, 1.6 + (rand() - 0.5) * 0.14))
    ySum += th + 0.0015

def hover_of(n):
    if n.startswith('side'): return Vector((0, 0.25, 0.85))
    if n == 'top': return Vector((0, 0.75, 0.8))
    if n == 'bottom': return Vector((0, 0.05, 1.0))
    if n == 'plinth': return Vector((0, 0, 1.1))
    if n.startswith('back'): return Vector((0, 0.12, 0.95))
    if n == 'divider': return Vector((0, 0.35, 0.8))
    if n == 'rail': return Vector((0, 0.3, 0.8))
    return Vector((0, 0.2, 0.95))
n = len(carcass)
for i, r in enumerate(carcass):
    r.t0 = 0.02 + (i / (n - 1)) * 0.09; r.t1 = r.t0 + 0.13
    r.lift = 0.45 + rand() * 0.35
    r.hoverCenter = r.finalCenter + hover_of(r.name)
for j, r in enumerate(sorted(carcass, key=lambda r: r.finalCenter.y)):
    r.l0 = 0.26 + (j / (n - 1)) * 0.11; r.l1 = r.l0 + 0.09
for i, r in enumerate(doors):
    r.t0 = 0.6 + i * 0.03; r.t1 = r.t0 + 0.1; r.lift = 0.45; r.swing = (0.72 + i * 0.03, 0.83 + i * 0.03); r.angle = 1.78

# contents: linen, boxes, shirts appear 0.46-0.58 (bottom shelves first); LEDs glow from 0.80
items = []
for ob in S.props.objects:
    if ob.parent is not None or ob.name.startswith(('led', 'hanger', 'hook')):
        continue
    it = Rec(); it.ob = ob; it.base = ob.location.copy(); it.scale = ob.scale.copy()
    it.kind = 'garment' if ob.name.startswith('shirt') else 'stack'
    items.append(it)
stacks = sorted([i for i in items if i.kind == 'stack'], key=lambda i: (round(i.base.z, 2), i.base.x))
for k, it in enumerate(stacks): it.t0 = 0.46 + k * 0.0011; it.dur = 0.06
for k, it in enumerate(sorted([i for i in items if i.kind == 'garment'], key=lambda i: i.base.x)):
    it.t0 = 0.5 + k * 0.006; it.dur = 0.06
led_mats = [l.data.materials[0] for l in S.leds]

def apply(pRaw):
    p = clamp(pRaw / 0.97, 0, 1)
    ident = Quaternion()
    for r in recs:
        if r.door:
            t = easeInOut(rng_range(p, r.t0, r.t1))
            if p >= r.t1:
                o = easeInOut(rng_range(p, *r.swing))
                sign = -1 if r.door['hingeDir'] > 0 else 1
                q = Quaternion((0, 1, 0), sign * r.angle * o)
                c = r.door['hinge'] + q @ Vector((r.door['hingeDir'] * doorW / 2, 0, 0))
            else:
                q = r.pileQ.slerp(ident, t)
                c = r.pileCenter.lerp(r.finalCenter, t); c.y += math.sin(math.pi * t) * r.lift
        else:
            a = easeInOut(rng_range(p, r.t0, r.t1)); b = easeInOut(rng_range(p, r.l0, r.l1))
            q = r.pileQ.slerp(ident, a)
            c = r.pileCenter.lerp(r.hoverCenter, a); c.y += math.sin(math.pi * a) * r.lift
            if b > 0: c = r.hoverCenter.lerp(r.finalCenter, b)
        r.ob.location = B(*c); r.ob.rotation_quaternion = q_to_blender(q)
    for it in items:
        t = rng_range(p, it.t0, it.t0 + it.dur)
        it.ob.hide_render = t <= 0
        for ch in it.ob.children: ch.hide_render = t <= 0
        if t <= 0: continue
        e = easeOutBack(t)
        if it.kind == 'garment':
            it.ob.scale = (it.scale.x, it.scale.y, it.scale.z * clamp(e, 0.001, 1.08)); continue
        s = max(0.001, e)
        it.ob.scale = it.scale * s
        it.ob.location = it.base + Vector((0, 0, (1 - easeOutCubic(t)) * 0.5))
    led_on = smooth(rng_range(p, 0.8, 0.93))
    for l in S.leds: l.hide_render = p < 0.55
    for m in led_mats: m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 6.0 * led_on
    for lo in S.led_lights: lo.data.energy = 14.0 * led_on
    # camera (landscape 16:9 framing from hero3d.js)
    aspect = w / h; tanV = math.tan(math.radians(17))
    fitD = lambda ww, hh: max(hh / (2 * tanV), ww / (aspect * 2 * tanV))
    dA, dB = fitD(5.2, 4.3), fitD(6.2, 4.5)
    pull = smooth(rng_range(p, 0.86, 1)); dist = lerp(dA, dB, pull)
    orbit = smooth(rng_range(p, 0, 0.84))
    az = lerp(-0.6, 0.1, orbit) * (1 - pull)
    tx = lerp(-1.1, -0.95, orbit) * (1 - pull * 0.35)
    ty = lerp(1.15, lerp(1.5, 1.15, orbit), smooth(rng_range(p, 0, 0.14)))
    camY = lerp(2.4, 1.6, orbit) + pull * 0.25
    pos = Vector((tx + math.sin(az) * dist, camY, 0.5 + math.cos(az) * dist))
    cam.location = B(*pos); S.look_at(cam, B(tx, ty, 0.5))
    cam_data.dof.focus_distance = (pos - Vector((0, 1.15, 0.6))).length

out_dir = os.path.join(S.OUT, 'frames'); os.makedirs(out_dir, exist_ok=True)
total = int(arg('--total', 144))
if arg('--still') is not None:
    apply(float(arg('--still')))
    scene.render.filepath = os.path.join(S.OUT, f"film_still_{arg('--still')}.png")
    bpy.ops.render.render(write_still=True)
else:
    a, b = (int(v) for v in arg('--frames', f'0:{total}').split(':'))
    for f in range(a, b):
        path = os.path.join(out_dir, f'f_{f:03d}.png')
        if os.path.exists(path) and '--force' not in _args:
            continue
        apply(f / (total - 1))
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print(f'frame {f} done', flush=True)

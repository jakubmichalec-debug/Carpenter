"""Download the CC0 Poly Haven textures and HDRI the Blender scene uses into tex/ (2k, for renders)
and tex1k/ (1k, for the web export). Needs curl and Pillow."""
import json, os, shutil, subprocess
from PIL import Image, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))
TEX, TEX1K = os.path.join(HERE, 'tex'), os.path.join(HERE, 'tex1k')
os.makedirs(TEX, exist_ok=True); os.makedirs(TEX1K, exist_ok=True)
curl = lambda *a: subprocess.run(['curl', '-sSL', *a], check=True, capture_output=True).stdout

for asset in ['oak_veneer_01', 'white_oak_veneer', 'laminate_floor_02', 'white_plaster_02']:
    files = json.loads(curl(f'https://api.polyhaven.com/files/{asset}'))
    for key, suffix in [('Diffuse', 'diff'), ('Rough', 'rough'), ('nor_gl', 'nor')]:
        curl('-o', os.path.join(TEX, f'{asset}_{suffix}.jpg'), files[key]['2k']['jpg']['url'])
hdri = json.loads(curl('https://api.polyhaven.com/files/small_empty_room_3'))['hdri']
curl('-o', os.path.join(TEX, 'room_2k.hdr'), hdri['2k']['hdr']['url'])
curl('-o', os.path.join(TEX, 'room_1k.hdr'), hdri['1k']['hdr']['url'])

# scanned furniture and plants for the room (Poly Haven, CC0) and a wool texture for the rug
MODELS = ['potted_plant_01', 'potted_plant_02', 'potted_plant_04', 'side_table_01', 'ceramic_vase_01',
          'hanging_picture_frame_01', 'mid_century_lounge_chair']
for model in MODELS:
    dest = os.path.join(TEX, 'models', model)
    if os.path.exists(os.path.join(dest, f'{model}.gltf')):
        continue
    gl = json.loads(curl(f'https://api.polyhaven.com/files/{model}'))['gltf']['1k']['gltf']
    os.makedirs(dest, exist_ok=True)
    curl('-o', os.path.join(dest, f'{model}.gltf'), gl['url'])
    for rel, info in gl.get('include', {}).items():
        os.makedirs(os.path.dirname(os.path.join(dest, rel)), exist_ok=True)
        curl('-o', os.path.join(dest, rel), info['url'])
rug = json.loads(curl('https://api.polyhaven.com/files/hessian_230'))
for key, suffix in [('Diffuse', 'diff'), ('Rough', 'rough'), ('nor_gl', 'nor')]:
    curl('-o', os.path.join(TEX, f'hessian_230_{suffix}.jpg'), rug[key]['1k']['jpg']['url'])

# birch-ply interior: white oak veneer, brighter and a touch warmer
im = Image.open(os.path.join(TEX, 'white_oak_veneer_diff.jpg')).convert('RGB')
im = ImageEnhance.Color(ImageEnhance.Brightness(im).enhance(1.32)).enhance(0.8)
r, g, b = im.split()
Image.merge('RGB', (r.point(lambda v: min(255, int(v * 1.04))), g, b.point(lambda v: int(v * 0.93)))).save(os.path.join(TEX, 'birch_diff.jpg'), quality=92)

for name in os.listdir(TEX):
    src = os.path.join(TEX, name)
    if name.endswith('.jpg'):
        size = 512 if '_rough' in name else 1024
        Image.open(src).resize((size, size), Image.LANCZOS).save(os.path.join(TEX1K, name), quality=88)
shutil.copy(os.path.join(TEX, 'room_1k.hdr'), os.path.join(TEX1K, 'room_2k.hdr'))
print('assets ready')

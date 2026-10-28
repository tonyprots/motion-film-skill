"""Build the isometric figure library (motion-film): business objects modelled from primitives in Blender, rendered
through an orthographic camera fitted to the projection of engine/lib/iso.js, so a sprite sits on the same floor and
reads with the same light as ISO.box(). Our own models, no third-party assets.

  blender -b -P scripts/figures_build.py -- [--out library/figures] [--only office,person] [--samples 48] [--ppu 2]

Each figure gives two PNGs and a manifest entry:
  <name>.png          grey shading of the whole figure (alpha = silhouette); ISO.figure() multiplies it by the
                      object's colour, so one render serves every theme
  <name>.accent.png   only the accent parts (lit windows, the band on a bundle, a tie, a seal), occluded by the rest;
                      tinted with the theme's accent
  figures.json        { name: { w, d, h, anchor:[px,py], scale, size:[w,h], quad? } }: footprint in iso units,
                      the pixel of the iso origin (x=y=z=0, the footprint's corner), canvas px per sprite px at s=1,
                      and for screens and frames the four corners of the flat area (sprite px), so the film can paint
                      a chat, a chart or a real photo onto it with ISO.figureQuad().

Space is the one of iso.js: x along the width (right and a little down), y into depth (right and up), z up; one
Blender unit = 100 iso units. A figure stands on x ∈ [0, w], y ∈ [0, d], z ≥ 0.
"""
import bpy, sys, json, math, os
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default
OUT = os.path.abspath(arg('--out', os.path.join(os.path.dirname(__file__), '..', 'library', 'figures')))
ONLY = [s for s in arg('--only', '').split(',') if s]
SAMPLES = int(arg('--samples', '48'))
PPU = float(arg('--ppu', '2'))          # sprite px per iso unit: 2 = sharp at s ≤ 2 on a 1080 frame
os.makedirs(OUT, exist_ok=True)

# ---- the camera: the orthonormal rows closest to iso.js (AX, AY; z straight up), by a polar fit
AX, AY = (0.94, 0.17), (0.42, -0.30)
M = np.array([[AX[0], AY[0], 0.0], [AX[1], AY[1], -1.0]])   # iso (x, y, z) → screen (right, down)
U_, S_, Vt = np.linalg.svd(M, full_matrices=False)
Q = U_ @ Vt                                                   # rows: screen right, screen down (unit vectors)
K = float(S_.mean())                                          # iso px per projected unit (≈ 1.04; residual ≈ 1.7 %)
QR, QD = Vector(Q[0]), Vector(Q[1])
CZ = QR.cross(-QD)                                            # camera looks along −CZ; CZ.z > 0: from above
assert CZ.z > 0, 'iso projection is seen from below: flip a world axis'

ROLES = {'main': 0.90, 'light': 1.0, 'mid': 0.66, 'dark': 0.34, 'accent': 0.95}

def mat(role):
    name = f'role_{role}'
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF'); v = ROLES[role]
    b.inputs['Base Color'].default_value = (v, v, v, 1); b.inputs['Roughness'].default_value = 0.62
    return m

def holdout():
    m = bpy.data.materials.get('holdout')
    if m: return m
    m = bpy.data.materials.new('holdout'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); h = nt.nodes.new('ShaderNodeHoldout')
    nt.links.new(h.outputs[0], o.inputs['Surface']); return m

U = 0.01   # iso unit → Blender unit
PARTS = []

def finish(ob, role, bevel):
    ob.data.materials.clear(); ob.data.materials.append(mat(role)); ob['role'] = role
    if bevel:
        md = ob.modifiers.new('bevel', 'BEVEL'); md.width = bevel * U; md.segments = 3; md.limit_method = 'ANGLE'
    for p in ob.data.polygons: p.use_smooth = True
    PARTS.append(ob); return ob

def cube(x, y, z, w, d, h, role='main', bevel=1.5, rz=0.0, rx=0.0):
    """a box with its corner at (x, y, z), sized w × d × h (iso units); rz/rx rotate it about its own corner (degrees)"""
    bpy.ops.mesh.primitive_cube_add(size=1)
    ob = bpy.context.object; ob.scale = (w * U, d * U, h * U)
    bpy.ops.object.transform_apply(scale=True)
    ob.data.transform(Matrix.Translation((w * U / 2, d * U / 2, h * U / 2)))
    ob.rotation_euler = (math.radians(rx), 0, math.radians(rz)); ob.location = (x * U, y * U, z * U)
    return finish(ob, role, min(bevel, w / 3, d / 3, h / 3))

def cyl(x, y, z, r, h, role='main', verts=40, rot=(0, 0, 0), r2=None, bevel=1.0):
    """a cylinder standing on (x, y, z) (its base centre), radius r, height h; r2 makes a cone; rot in degrees"""
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r * U, depth=h * U)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r * U, radius2=r2 * U, depth=h * U)
    ob = bpy.context.object; ob.data.transform(Matrix.Translation((0, 0, h * U / 2)))
    ob.rotation_euler = tuple(math.radians(a) for a in rot); ob.location = (x * U, y * U, z * U)
    return finish(ob, role, bevel)

def ball(x, y, z, r, role='main', scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=r * U)
    ob = bpy.context.object; ob.scale = scale; ob.location = (x * U, y * U, z * U)
    return finish(ob, role, 0)

def prism(x, y, z, w, d, h, role='main'):
    """a triangular roof along x: w long, d deep, h high, corner at (x, y, z)"""
    bpy.ops.mesh.primitive_cylinder_add(vertices=3, radius=1, depth=w * U)
    ob = bpy.context.object
    # put one vertex up: cylinder axis → x, then scale the triangle to d × h
    ob.data.transform(Matrix.Rotation(math.radians(90), 4, 'Y') @ Matrix.Rotation(math.radians(-30), 4, 'Z'))
    xs = [v.co for v in ob.data.vertices]
    ymin, ymax = min(v.y for v in xs), max(v.y for v in xs); zmin, zmax = min(v.z for v in xs), max(v.z for v in xs)
    for v in ob.data.vertices:
        v.co = Vector((v.co.x + w * U / 2, (v.co.y - ymin) / (ymax - ymin) * d * U, (v.co.z - zmin) / (zmax - zmin) * h * U))
    ob.location = (x * U, y * U, z * U)
    return finish(ob, role, 1.0)

QUAD = {}
def quad(name, pts):
    """the four corners (iso units) of a flat area to paint on in the film: top-left, top-right, bottom-right, bottom-left"""
    QUAD[name] = [Vector((p[0] * U, p[1] * U, p[2] * U)) for p in pts]

# ---------------------------------------------------------------- the figures (iso units; footprint from the origin)
def office():
    cube(0, 0, 0, 240, 150, 14, 'mid', 3)
    cube(15, 15, 14, 210, 120, 190, 'main', 4)
    cube(10, 10, 204, 220, 130, 10, 'light', 3)
    cube(140, 40, 214, 54, 54, 26, 'mid', 3)
    for c in range(4):
        for r in range(5):
            cube(36 + c * 46, 12, 42 + r * 32, 28, 4, 20, 'accent', 1)
    for c in range(3):
        for r in range(5):
            cube(224, 30 + c * 36, 42 + r * 32, 4, 24, 20, 'accent', 1)
    cube(104, 11, 14, 32, 5, 26, 'dark', 1)
    return dict(w=240, d=150, h=240)

def courthouse():
    cube(0, 0, 0, 260, 170, 10, 'mid', 2); cube(10, 10, 10, 240, 150, 10, 'light', 2); cube(20, 20, 20, 220, 130, 10, 'mid', 2)
    cube(40, 60, 30, 180, 80, 130, 'main', 3)
    for i in range(6):
        cyl(42 + i * 35, 40, 30, 10, 130, 'light')
    cube(20, 20, 160, 220, 130, 18, 'light', 2)
    prism(20, 20, 178, 220, 130, 46, 'main')
    cyl(130, 22, 196, 13, 3, 'accent', rot=(90, 0, 0))
    return dict(w=260, d=170, h=224)

def person():
    cyl(22, 20, 0, 9, 62, 'dark'); cyl(40, 20, 0, 9, 62, 'dark')
    cube(9, 7, 58, 44, 28, 58, 'main', 11)
    cyl(8, 20, 62, 7, 50, 'main', rot=(0, -5, 0)); cyl(54, 20, 62, 7, 50, 'main', rot=(0, 5, 0))
    cube(28, 5, 78, 6, 3, 34, 'accent', 1)
    ball(31, 20, 138, 18, 'light')
    return dict(w=62, d=40, h=158)

def money_stack():
    for i in range(4):
        cube(0, 0, i * 19, 180, 104, 18, 'light', 2.5)
        cube(76, -1, i * 19 + 1, 28, 106, 16.5, 'accent', 0.6)
    return dict(w=180, d=104, h=76)

def document():
    cube(0, 0, 0, 120, 160, 3, 'light', 0.6)
    cube(14, 128, 3, 70, 12, 1, 'dark', 0.2)
    for i in range(5):
        cube(14, 104 - i * 16, 3, 92 if i != 4 else 54, 6, 0.8, 'mid', 0.2)
    cyl(88, 26, 3, 15, 1.2, 'accent', bevel=0.3)
    quad('document', [(0, 160, 3), (120, 160, 3), (120, 0, 3), (0, 0, 3)])
    return dict(w=120, d=160, h=4)

def papers():
    for i, (dx, dy, a) in enumerate([(0, 0, 0), (6, -4, -4), (-3, 6, 5), (4, 2, -2)]):
        cube(dx, dy, i * 3.2, 120, 160, 3, 'light', 0.6, rz=a)
    cube(18, 130, 12.8, 64, 10, 0.8, 'dark', 0.2, rz=-2)
    for i in range(4):
        cube(18, 108 - i * 16, 12.8, 86, 5, 0.6, 'mid', 0.2, rz=-2)
    return dict(w=126, d=166, h=14)

def server_rack():
    cube(0, 0, 0, 90, 110, 250, 'mid', 4)
    for r in range(7):
        cube(8, -2, 14 + r * 33, 74, 4, 24, 'dark', 1)
        cube(64, -4, 22 + r * 33, 8, 3, 8, 'accent', 0.5)
    return dict(w=90, d=110, h=250)

def bar_chart():
    cube(0, 0, 0, 230, 70, 8, 'mid', 2)
    for i, h in enumerate([50, 82, 118, 168]):
        cube(16 + i * 52, 16, 8, 38, 38, h, 'accent' if i == 3 else 'main', 2)
    return dict(w=230, d=70, h=176)

def phone():
    cube(0, 30, 0, 96, 40, 8, 'mid', 2)
    cube(6, 34, 8, 84, 12, 168, 'dark', 9, rx=-8)
    cube(12, 32.4, 20, 72, 1.6, 144, 'light', 0.4, rx=-8)
    # the screen face after the −8° tilt about the box corner (12, 32.4, 20): y moves by z·sin
    t = math.radians(-8)
    def tilt(x, y, z): return (x, 32.4 + (y - 32.4) * math.cos(t) - (z - 20) * math.sin(t), 20 + (y - 32.4) * math.sin(t) + (z - 20) * math.cos(t))
    quad('phone', [tilt(12, 32.4, 164), tilt(84, 32.4, 164), tilt(84, 32.4, 20), tilt(12, 32.4, 20)])
    return dict(w=96, d=70, h=180)

def map_pin():
    cyl(45, 45, 0, 44, 6, 'mid', bevel=2)
    cyl(45, 45, 6, 3, 74, 'accent', r2=27, bevel=0)
    ball(45, 45, 98, 28, 'accent'); ball(45, 30, 104, 10, 'light')
    return dict(w=90, d=90, h=126)

def gavel():
    cyl(55, 60, 0, 44, 16, 'mid', bevel=2)
    cyl(10, 60, 52, 18, 84, 'main', rot=(0, 90, 0))
    for x in (22, 76): cyl(x, 60, 52, 19.5, 6, 'accent', rot=(0, 90, 0))
    cyl(52, 60, 52, 6, 120, 'main', rot=(90, 0, -30))
    return dict(w=110, d=120, h=72)

def laptop():
    cube(0, 0, 0, 160, 110, 8, 'mid', 2)
    cube(14, 18, 8, 132, 56, 1, 'dark', 0.3)
    cube(0, 104, 6, 160, 6, 108, 'dark', 2, rx=-14)
    t = math.radians(-14)
    def tilt(x, y, z): return (x, 104 + (y - 104) * math.cos(t) - (z - 6) * math.sin(t), 6 + (y - 104) * math.sin(t) + (z - 6) * math.cos(t))
    cube(8, 103, 14, 144, 1, 92, 'light', 0.3, rx=-14)
    quad('laptop', [tilt(8, 103, 106), tilt(152, 103, 106), tilt(152, 103, 14), tilt(8, 103, 14)])
    return dict(w=160, d=116, h=112)

def portrait():
    cube(0, 30, 0, 130, 46, 8, 'mid', 2)
    cube(6, 40, 8, 118, 12, 156, 'main', 4, rx=-6)
    t = math.radians(-6)
    def tilt(x, y, z): return (x, 40 + (y - 40) * math.cos(t) - (z - 8) * math.sin(t), 8 + (y - 40) * math.sin(t) + (z - 8) * math.cos(t))
    cube(16, 39, 18, 98, 1, 136, 'light', 0.3, rx=-6)
    quad('portrait', [tilt(16, 39, 154), tilt(114, 39, 154), tilt(114, 39, 18), tilt(16, 39, 18)])
    return dict(w=130, d=76, h=166)

FIGURES = dict(office=office, courthouse=courthouse, person=person, money_stack=money_stack, document=document,
               papers=papers, server_rack=server_rack, bar_chart=bar_chart, phone=phone, map_pin=map_pin, gavel=gavel,
               laptop=laptop, portrait=portrait)

# ---------------------------------------------------------------- scene, light, render
def reset():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes): bpy.data.meshes.remove(me)
    PARTS.clear(); QUAD.clear()

def setup():
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'
    try:
        pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
        for d in pr.devices: d.use = True
        sc.cycles.device = 'GPU'
    except Exception: sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
    sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes.get('Background'); bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = 0.42

def lights_and_camera(bounds):
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.4; sun.angle = math.radians(14)
    so = bpy.data.objects.new('sun', sun); bpy.context.scene.collection.objects.link(so)
    # light travels +x, +y, −z: the front face (−y) is lit, the right face (+x) in shade, the top brightest (as ISO.box)
    d = Vector((0.42, 0.62, -0.92)).normalized()
    so.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'
    co = bpy.data.objects.new('cam', cam); bpy.context.scene.collection.objects.link(co); bpy.context.scene.camera = co
    (x0, y0, x1, y1) = bounds; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    R = Matrix((QR, -QD, CZ)).transposed()
    co.matrix_world = Matrix.Translation(QR * cx + QD * cy + CZ * 40) @ R.to_4x4()
    cam.ortho_scale = max(x1 - x0, y1 - y0); cam.clip_end = 200
    sc = bpy.context.scene
    sc.render.resolution_x = max(8, round((x1 - x0) / U * PPU)); sc.render.resolution_y = max(8, round((y1 - y0) / U * PPU))
    sc.render.resolution_percentage = 100
    return cx, cy

def screen(p):   # Blender-space point → projected (right, down) in Blender units
    return (QR.dot(p), QD.dot(p))

def still(path):   # render, then drop PNG text chunks (date, render time): the files stay byte-stable between runs
    bpy.context.scene.render.filepath = path; bpy.ops.render.render(write_still=True)
    d = open(path, 'rb').read(); out, i = d[:8], 8
    while i < len(d):
        n = int.from_bytes(d[i:i + 4], 'big')
        if d[i + 4:i + 8] not in (b'tEXt', b'iTXt', b'zTXt'): out += d[i:i + 12 + n]
        i += 12 + n
    open(path, 'wb').write(out)

def build(name, fn):
    reset(); info = fn()
    bpy.context.view_layer.update()
    pts = [ob.matrix_world @ v.co for ob in PARTS for v in ob.data.vertices]
    sx = [screen(p) for p in pts]; pad = 0.04
    bounds = (min(a for a, _ in sx) - pad, min(b for _, b in sx) - pad, max(a for a, _ in sx) + pad, max(b for _, b in sx) + pad)
    lights_and_camera(bounds)
    sc = bpy.context.scene
    px = lambda p: [round((screen(p)[0] - bounds[0]) / U * PPU, 1), round((screen(p)[1] - bounds[1]) / U * PPU, 1)]
    entry = dict(info, anchor=px(Vector((0, 0, 0))), scale=round(K / PPU, 5),
                 size=[sc.render.resolution_x, sc.render.resolution_y], accent=any(ob['role'] == 'accent' for ob in PARTS))
    if name in QUAD: entry['quad'] = [px(p) for p in QUAD[name]]
    still(os.path.join(OUT, f'{name}.png'))
    if entry['accent']:
        keep = {ob.name: ob.data.materials[0] for ob in PARTS}
        for ob in PARTS:
            if ob['role'] != 'accent': ob.data.materials[0] = holdout()
        still(os.path.join(OUT, f'{name}.accent.png'))
        for ob in PARTS: ob.data.materials[0] = keep[ob.name]
    return entry

setup()
man_path = os.path.join(OUT, 'figures.json')
manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}
manifest['_'] = dict(ppu=PPU, K=round(K, 5), note='built by scripts/figures_build.py; anchor = sprite px of iso (0,0,0)')
for name, fn in FIGURES.items():
    if ONLY and name not in ONLY: continue
    manifest[name] = build(name, fn); print(f'figure {name}: {manifest[name]["size"]}')
json.dump(manifest, open(man_path, 'w'), indent=1)
open(os.path.join(OUT, 'figures.js'), 'w').write('// built by scripts/figures_build.py: the manifest of figures.json for engine/lib/iso.js\nwindow.FIGURES = ' + json.dumps(manifest) + ';\n')
print(f'wrote {man_path}')

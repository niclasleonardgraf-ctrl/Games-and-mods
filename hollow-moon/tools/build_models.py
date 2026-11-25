"""Hollow Moon asset pipeline. Builds every low-poly model in Blender and exports one GLB.
Run:  python3 tools/build_models.py   (needs `pip install bpy`, or run inside Blender)
Blender axes: Z up, -Y is the front of a model (becomes +Z, toward the camera, in the game)."""
import bpy, bmesh, math, random, base64, os
from mathutils import Matrix, Euler, Vector

random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
COL = bpy.context.scene.collection
MATS = {}


def mat(name, rgb, rough=0.9, emit=None, estr=1.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b is None:
        b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(b.outputs[0], out.inputs[0])
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = estr
    MATS[name] = m
    return m


STONE = mat('stone', (0.36, 0.38, 0.42)); STONE_D = mat('stoneDark', (0.2, 0.22, 0.26))
MOSS = mat('moss', (0.16, 0.26, 0.17)); WOOD = mat('wood', (0.24, 0.15, 0.09)); WOOD_L = mat('woodLight', (0.42, 0.29, 0.17))
BARK = mat('bark', (0.13, 0.1, 0.09)); PINE = mat('pine', (0.07, 0.19, 0.15)); PINE2 = mat('pine2', (0.1, 0.25, 0.18))
LEAF = mat('leaf', (0.13, 0.24, 0.12)); IRON = mat('iron', (0.06, 0.06, 0.08), 0.5)
BRICK = mat('brick', (0.38, 0.17, 0.13)); PLASTER = mat('plaster', (0.62, 0.58, 0.5)); SLATE = mat('slate', (0.13, 0.14, 0.2))
WHITE = mat('trim', (0.75, 0.74, 0.7)); DOOR = mat('door', (0.12, 0.07, 0.05))
GLOW = mat('window', (1, 0.72, 0.35), 0.4, (1, 0.62, 0.25), 2.2); DARKWIN = mat('windowDark', (0.05, 0.07, 0.12), 0.2)
LANTERN = mat('lantern', (1, 0.8, 0.5), 0.4, (1, 0.7, 0.35), 4)
SKIN = mat('skin', (0.78, 0.6, 0.5)); CLOTH = mat('cloth', (0.5, 0.5, 0.5)); PANTS = mat('pants', (0.12, 0.13, 0.18))
HAIR = mat('hair', (0.12, 0.08, 0.06)); SHOE = mat('shoe', (0.05, 0.04, 0.04))
LAPIS = mat('lapis', (0.08, 0.2, 0.75), 0.2, (0.1, 0.3, 1), 3); VERV = mat('vervain', (0.5, 0.3, 0.8), 0.6, (0.45, 0.2, 0.9), 1.5)
STEM = mat('stem', (0.15, 0.35, 0.15)); FLAME = mat('flame', (1, 0.5, 0.1), 0.5, (1, 0.4, 0.05), 5)
CANVAS = mat('canvas', (0.45, 0.33, 0.2)); AWN = mat('awning', (0.4, 0.07, 0.1))


class B:
    """Accumulates primitives into one mesh; one material slot per colour."""

    def __init__(s, name):
        s.name, s.bm, s.mats = name, bmesh.new(), []

    def _fin(s, verts, m, M):
        bmesh.ops.transform(s.bm, matrix=M, verts=verts)
        if m not in s.mats:
            s.mats.append(m)
        i = s.mats.index(m)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = i

    def box(s, size, loc, m, rot=(0, 0, 0)):
        v = bmesh.ops.create_cube(s.bm, size=1)['verts']
        s._fin(v, m, Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1)))
        return s

    def cyl(s, r1, r2, h, loc, m, seg=8, rot=(0, 0, 0)):
        v = bmesh.ops.create_cone(s.bm, cap_ends=True, segments=seg, radius1=r1, radius2=max(r2, 0.0001), depth=h)['verts']
        s._fin(v, m, Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4())
        return s

    def ico(s, r, loc, m, sub=1, scale=(1, 1, 1), jit=0.0):
        v = bmesh.ops.create_icosphere(s.bm, subdivisions=sub, radius=r)['verts']
        for q in v:
            q.co *= 1 + random.uniform(-jit, jit)
        s._fin(v, m, Matrix.Translation(loc) @ Matrix.Diagonal((*scale, 1)))
        return s

    def roof(s, w, d, h, z, m, over=0.3):
        """Gable roof: ridge runs along X."""
        w2, d2 = w / 2 + over, d / 2 + over
        P = [(-w2, -d2, z), (w2, -d2, z), (w2, d2, z), (-w2, d2, z), (-w2, 0, z + h), (w2, 0, z + h)]
        vs = [s.bm.verts.new(p) for p in P]
        for f in ((0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4), (3, 2, 1, 0)):
            s.bm.faces.new([vs[i] for i in f])
        s._fin(vs, m, Matrix.Identity(4))
        return s

    def done(s, parent=None, loc=(0, 0, 0)):
        bmesh.ops.recalc_face_normals(s.bm, faces=s.bm.faces)
        me = bpy.data.meshes.new(s.name)
        s.bm.to_mesh(me)
        s.bm.free()
        for m in s.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(s.name, me)
        COL.objects.link(ob)
        ob.location, ob.parent = loc, parent
        return ob


def empty(name):
    e = bpy.data.objects.new(name, None)
    COL.objects.link(e)
    return e


# ---------- characters: separate limbs so the game can animate them ----------
hu = empty('human')
B('hTorso').box((0.5, 0.27, 0.62), (0, 0, 1.16), CLOTH).box((0.44, 0.25, 0.14), (0, 0, 0.82), PANTS) \
    .box((0.16, 0.14, 0.1), (0, 0, 1.5), SKIN).done(hu)
B('hHead').ico(0.175, (0, 0, 0.17), SKIN, 1, (0.95, 1, 1.08)).box((0.36, 0.3, 0.16), (0, 0.04, 0.3), HAIR) \
    .box((0.36, 0.14, 0.3), (0, 0.13, 0.16), HAIR).box((0.05, 0.05, 0.06), (0, -0.18, 0.14), SKIN).done(hu, (0, 0, 1.52))
for sx, n in ((-1, 'hArmL'), (1, 'hArmR')):
    B(n).box((0.13, 0.15, 0.58), (0, 0, -0.27), CLOTH).box((0.11, 0.12, 0.11), (0, 0, -0.61), SKIN).done(hu, (sx * 0.32, 0, 1.44))
for sx, n in ((-1, 'hLegL'), (1, 'hLegR')):
    B(n).box((0.18, 0.2, 0.74), (0, 0, -0.37), PANTS).box((0.19, 0.3, 0.1), (0, -0.05, -0.79), SHOE).done(hu, (sx * 0.13, 0, 0.84))
# attachments
B('coat').box((0.56, 0.3, 0.5), (0, 0.02, 0.62), CLOTH).box((0.6, 0.2, 0.16), (0, 0.06, 1.44), CLOTH).done()
B('hat').cyl(0.3, 0.3, 0.03, (0, 0, 0.36), WOOD, 10).cyl(0.17, 0.15, 0.16, (0, 0, 0.45), WOOD, 10).done()
B('longhair').box((0.38, 0.14, 0.5), (0, 0.15, 0.05), HAIR).done()
B('crossbow').box((0.06, 0.6, 0.06), (0, -0.2, 0), WOOD).box((0.6, 0.05, 0.04), (0, -0.45, 0), IRON).done()
B('stake').cyl(0.04, 0.0, 0.5, (0, 0, 0), WOOD_L, 5, (math.pi / 2, 0, 0)).done()

# ---------- cemetery ----------
B('grave1').box((0.8, 0.2, 0.9), (0, 0, 0.45), STONE).cyl(0.4, 0.4, 0.2, (0, 0, 0.9), STONE, 10, (math.pi / 2, 0, 0)) \
    .box((1.0, 0.36, 0.14), (0, 0, 0.07), STONE_D).box((0.5, 0.22, 0.2), (0.1, 0, 0.3), MOSS).done()
B('grave2').box((0.2, 0.18, 1.5), (0, 0, 0.75), STONE).box((0.8, 0.18, 0.2), (0, 0, 1.1), STONE).box((0.6, 0.5, 0.16), (0, 0, 0.08), STONE_D).done()
B('grave3').cyl(0.32, 0.16, 1.9, (0, 0, 1.1), STONE, 4, (0, 0, math.pi / 4)).cyl(0.16, 0, 0.3, (0, 0, 2.2), STONE, 4, (0, 0, math.pi / 4)) \
    .box((0.8, 0.8, 0.3), (0, 0, 0.15), STONE_D).done()
a = B('angel').box((1.2, 1.2, 0.9), (0, 0, 0.45), STONE_D).cyl(0.42, 0.2, 1.5, (0, 0, 1.65), STONE, 8).ico(0.2, (0, -0.03, 2.6), STONE)
for sx in (-1, 1):
    a.box((0.08, 0.5, 1.3), (sx * 0.42, 0.25, 2.0), STONE, (0.25, sx * 0.5, sx * -0.35))
    a.box((0.1, 0.1, 0.6), (sx * 0.22, -0.2, 1.95), STONE, (0.9, 0, 0))
a.done()
c = B('crypt').box((5, 6, 3.2), (0, 0, 1.6), STONE).roof(5, 6, 1.3, 3.2, STONE_D, 0.35) \
    .box((1.3, 0.2, 2.2), (0, -3.02, 1.1), DOOR).box((1.7, 0.16, 0.25), (0, -3.05, 2.3), STONE_D) \
    .box((5.6, 1.0, 0.25), (0, -3.4, 0.12), STONE_D).box((0.9, 0.14, 0.9), (0, -3.08, 3.5), MOSS)
for sx in (-1.6, 1.6):
    c.cyl(0.24, 0.2, 3.0, (sx, -3.25, 1.6), WHITE, 8)
c.done()
f = B('fence').box((4, 0.06, 0.06), (0, 0, 1.25), IRON).box((4, 0.06, 0.06), (0, 0, 0.3), IRON)
for i in range(9):
    f.box((0.05, 0.05, 1.5), (-2 + i * 0.5, 0, 0.75), IRON)
    f.cyl(0.05, 0, 0.16, (-2 + i * 0.5, 0, 1.58), IRON, 4)
f.done()
g = B('gate')
for sx in (-2.2, 2.2):
    g.box((0.7, 0.7, 3.4), (sx, 0, 1.7), STONE).cyl(0.5, 0, 0.5, (sx, 0, 3.65), STONE_D, 4, (0, 0, math.pi / 4))
g.box((4.4, 0.1, 0.12), (0, 0, 3.3), IRON).box((2.6, 0.08, 0.5), (0, 0, 3.65), IRON).done()

# ---------- nature ----------
for name, hh in (('pine', 1.0), ('pineTall', 1.35)):
    t = B(name).cyl(0.22, 0.12, 3.2 * hh, (0, 0, 1.6 * hh), BARK, 6)
    for i, (r, z) in enumerate(((1.7, 3.0), (1.35, 4.3), (0.95, 5.5), (0.55, 6.5))):
        t.cyl(r, 0.05, 1.9, (random.uniform(-.08, .08), random.uniform(-.08, .08), z * hh), PINE if i % 2 else PINE2, 7, (0, 0, i))
    t.done()
d = B('deadtree').cyl(0.3, 0.14, 3.6, (0, 0, 1.8), BARK, 6)
for i in range(5):
    an = i * 1.3
    d.cyl(0.09, 0.02, 2.0, (math.cos(an) * 0.7, math.sin(an) * 0.7, 3.4 + i * 0.25), BARK, 5, (0.9 * math.sin(an), -0.9 * math.cos(an), 0))
d.done()
B('oak').cyl(0.4, 0.26, 3.4, (0, 0, 1.7), BARK, 7).ico(2.1, (0, 0, 4.9), LEAF, 1, (1, 1, 0.8), 0.14) \
    .ico(1.4, (1.3, 0.5, 4.2), LEAF, 1, (1, 1, 0.8), 0.14).ico(1.5, (-1.2, -0.4, 4.4), PINE2, 1, (1, 1, 0.8), 0.14).done()
B('bush').ico(0.8, (0, 0, 0.5), LEAF, 1, (1.2, 1, 0.7), 0.16).ico(0.55, (0.6, 0.3, 0.4), PINE2, 1, (1, 1, 0.7), 0.16).done()
B('rock').ico(0.8, (0, 0, 0.35), STONE_D, 1, (1.3, 1, 0.6), 0.2).done()

# ---------- town ----------
def house(name, w, d, h, wall, roofm, shop=False):
    b = B(name).box((w, d, h), (0, 0, h / 2), wall).roof(w, d, h * 0.45, h, roofm) \
        .box((w + 0.2, d + 0.2, 0.3), (0, 0, 0.15), STONE_D).box((0.7, 0.7, 1.6), (w * 0.28, d * 0.15, h + h * 0.4), BRICK)
    b.box((1.1, 0.14, 2.1), (0, -d / 2 - 0.03, 1.05), DOOR).box((1.4, 0.1, 0.16), (0, -d / 2 - 0.05, 2.2), WHITE)
    for sx in (-1, 1):
        if shop:
            b.box((w * 0.3, 0.1, 1.5), (sx * w * 0.3, -d / 2 - 0.02, 1.5), GLOW)
        else:
            b.box((1.0, 0.1, 1.2), (sx * w * 0.3, -d / 2 - 0.02, 1.7), GLOW if sx < 0 else DARKWIN)
        b.box((1.0, 0.1, 1.0), (sx * w * 0.3, -d / 2 - 0.02, h - 0.9), DARKWIN if not shop else GLOW)
    if shop:
        b.box((w * 0.94, 1.2, 0.1), (0, -d / 2 - 0.55, 2.55), AWN, (0.22, 0, 0)).box((1.6, 0.08, 0.5), (0, -d / 2 - 0.1, 3.1), WOOD)
    return b.done()

house('houseA', 8, 7, 4.6, PLASTER, SLATE); house('houseB', 9, 7, 5.2, BRICK, SLATE)
house('shop', 9, 7, 5.0, mat('shopWall', (0.2, 0.28, 0.27)), SLATE, True)
house('grill', 12, 8, 5.0, BRICK, mat('roofRed', (0.25, 0.1, 0.1)), True)
h = B('hall').box((14, 9, 6), (0, 0, 3), PLASTER).roof(14, 9, 2.2, 6, SLATE, 0.5).box((15, 2.4, 0.4), (0, -5.4, 0.2), STONE) \
    .box((15, 1.2, 0.35), (0, -6.6, 0.1), STONE).box((1.8, 0.14, 3), (0, -4.53, 1.7), DOOR).box((12, 2.6, 0.5), (0, -5.4, 5.6), WHITE)
for i in range(4):
    h.cyl(0.36, 0.3, 5.0, (-4.5 + i * 3, -6.0, 2.9), WHITE, 10)
for sx in (-4.5, 4.5):
    h.box((1.2, 0.1, 2.2), (sx, -4.52, 2.6), GLOW)
h.done()
t = B('tower').box((3.6, 3.6, 12), (0, 0, 6), BRICK).box((4.2, 4.2, 0.5), (0, 0, 0.25), STONE).box((4.0, 4.0, 0.4), (0, 0, 12.1), WHITE) \
    .cyl(2.9, 0, 3.4, (0, 0, 14), SLATE, 4, (0, 0, math.pi / 4)).box((1.0, 0.12, 2.0), (0, -1.82, 1.2), DOOR)
for an in range(4):
    r = an * math.pi / 2
    t.cyl(1.2, 1.2, 0.12, (math.sin(r) * 1.82, -math.cos(r) * 1.82, 10), GLOW, 12, (math.pi / 2, 0, r))
t.done()
B('lamp').cyl(0.12, 0.07, 3.6, (0, 0, 1.8), IRON, 6).cyl(0.22, 0.22, 0.2, (0, 0, 0.1), IRON, 6).box((0.34, 0.34, 0.42), (0, 0, 3.8), LANTERN) \
    .cyl(0.3, 0, 0.26, (0, 0, 4.14), IRON, 4, (0, 0, math.pi / 4)).done()
B('bench').box((1.8, 0.5, 0.08), (0, 0, 0.45), WOOD_L).box((1.8, 0.08, 0.5), (0, 0.24, 0.75), WOOD_L) \
    .box((0.08, 0.5, 0.45), (-0.8, 0, 0.22), IRON).box((0.08, 0.5, 0.45), (0.8, 0, 0.22), IRON).done()

# ---------- chapel ruin (walls mirrored by colliders in game.js) ----------
r = B('ruin').box((12, 0.9, 5.5), (0, 9, 2.75), STONE).cyl(2.2, 0, 2.6, (0, 9, 6.6), STONE, 4, (0, 0, math.pi / 4))
r.box((2.4, 0.3, 3.0), (0, 8.5, 3.4), DARKWIN)
for sx in (-6, 6):
    for i, (y, hh) in enumerate(((7, 4.6), (3.5, 3.4), (0, 4.0), (-3.2, 2.0))):
        r.box((0.9, 2.6, hh if sx < 0 else hh * 0.75), (sx, y, (hh if sx < 0 else hh * 0.75) / 2), STONE if i % 2 else STONE_D)
r.box((3, 3, 7.5), (-4.6, -6, 3.75), STONE).box((3.3, 3.3, 0.4), (-4.6, -6, 7.6), STONE_D).box((1.2, 0.2, 2.2), (-4.6, -7.52, 5.5), DARKWIN)
r.box((11, 16, 0.15), (0, 1.5, 0.07), STONE_D).box((2.6, 1.6, 1.0), (0, 6.8, 0.5), STONE).box((3.0, 2.0, 0.2), (0, 6.8, 1.1), STONE_D)
for i in range(9):
    r.ico(random.uniform(.4, .9), (random.uniform(-5, 5), random.uniform(-7, 5), 0.25), STONE_D if i % 2 else MOSS, 1, (1.2, 1, 0.6), 0.2)
r.done()

# ---------- bridge (deck along X) ----------
b = B('bridge').box((26, 6.4, 0.4), (0, 0, 0.0), WOOD)
for i in range(13):
    b.box((1.8, 6.2, 0.08), (-12 + i * 2, 0, 0.24), WOOD_L if i % 2 else WOOD)
for sy in (-3.2, 3.2):
    b.box((26, 0.16, 0.16), (0, sy, 1.3), WOOD_L).box((26, 0.12, 0.12), (0, sy, 0.75), WOOD_L)
    for i in range(9):
        b.box((0.22, 0.22, 1.4), (-12 + i * 3, sy, 0.7), WOOD)
b.done()

# ---------- pickups & camp ----------
B('lapis').ico(0.28, (0, 0, 0), LAPIS, 1, (1, 1, 1.5)).done()
v = B('vervain')
for i in range(7):
    an = i * 0.9
    x, y = math.cos(an) * 0.22 * (i % 3), math.sin(an) * 0.22 * (i % 3)
    v.cyl(0.025, 0.02, 0.7, (x, y, 0.35), STEM, 4).cyl(0.09, 0.02, 0.4, (x, y, 0.85), VERV, 5)
v.done()
cf = B('campfire').cyl(0.5, 0.05, 1.0, (0, 0, 0.55), FLAME, 6).cyl(0.25, 0.02, 0.6, (0.15, 0.1, 0.4), LANTERN, 5)
for i in range(6):
    an = i * math.pi / 3
    cf.cyl(0.09, 0.09, 1.1, (math.cos(an) * 0.4, math.sin(an) * 0.4, 0.12), BARK, 6, (math.pi / 2, 0, an + math.pi / 2))
    cf.ico(0.2, (math.cos(an + .5) * 0.85, math.sin(an + .5) * 0.85, 0.1), STONE_D)
cf.done()
B('tent').roof(2.6, 3.2, 1.7, 0, CANVAS, 0).done()

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
glb = os.path.join(out, 'models.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True, export_yup=True)
with open(glb, 'rb') as fh, open(os.path.join(out, 'models.js'), 'w') as js:
    js.write('window.HM_MODELS="' + base64.b64encode(fh.read()).decode() + '";\n')
print('exported', os.path.getsize(glb), 'bytes,', len(bpy.data.objects), 'objects')

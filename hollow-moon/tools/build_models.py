"""Hollow Moon asset pipeline. Builds every low-poly model in Blender and exports one GLB.
Run:  python3 tools/build_models.py   (needs `pip install bpy`, or run inside Blender)
Writes assets/models.glb and assets/models.js (window.HM_MODELS = base64 of the GLB), then prints a report:
world-space bounds, triangle and material count of every model, and the pivots of articulated parts.

Conventions the game relies on:
- Blender axes: Z up, metres. A model's FRONT faces -Y (becomes +Z, toward the camera, in three.js).
- Every top-level object is one model, named exactly as the game asks for it; origin on the ground at the
  footprint centre unless the model says otherwise (weapons: grip; head wear: neck pivot; lapis: gem centre).
- Articulated models (human, beast, wolf, deer, chest) are an Empty `X` with child meshes `X_Part`;
  each child's origin is its joint pivot.
- Flat shaded, no UVs, at most 6 materials per mesh. Material names are part of the contract (the game tints by name)."""
import bpy, bmesh, math, random, base64, os
from mathutils import Matrix, Euler, Vector

random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
COL = bpy.context.scene.collection
MATS = {}
PI = math.pi
FWD = (PI / 2, 0, 0)  # rotation that lays a +Z-built shape forward: local +Z -> -Y (front), local +Y -> up
R2 = math.sqrt(2)
U = random.uniform


def mat(name, rgb, rough=0.9, emit=None, estr=1.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    if m.node_tree is None:  # Blender < 5 needs nodes switched on explicitly
        m.use_nodes = True
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


# ---- palette (names are part of the game contract: it tints / swaps some of them by name) ----
STONE = mat('stone', (0.36, 0.38, 0.42)); STONE_D = mat('stoneDark', (0.2, 0.22, 0.26))
MOSS = mat('moss', (0.16, 0.26, 0.17)); WOOD = mat('wood', (0.24, 0.15, 0.09)); WOOD_L = mat('woodLight', (0.42, 0.29, 0.17))
BARK = mat('bark', (0.13, 0.1, 0.09)); PINE = mat('pine', (0.07, 0.19, 0.15)); PINE2 = mat('pine2', (0.1, 0.25, 0.18))
LEAF = mat('leaf', (0.13, 0.24, 0.12)); IRON = mat('iron', (0.06, 0.06, 0.08), 0.5)
BRICK = mat('brick', (0.38, 0.17, 0.13)); PLASTER = mat('plaster', (0.62, 0.58, 0.5)); SLATE = mat('slate', (0.13, 0.14, 0.2))
TRIM = mat('trim', (0.75, 0.74, 0.7)); DOOR = mat('door', (0.12, 0.07, 0.05))
GLOW = mat('window', (1, 0.72, 0.35), 0.4, (1, 0.62, 0.25), 2.2); DARKWIN = mat('windowDark', (0.05, 0.07, 0.12), 0.2)
LANTERN = mat('lantern', (1, 0.8, 0.5), 0.4, (1, 0.7, 0.35), 4)
SKIN = mat('skin', (0.78, 0.6, 0.5)); CLOTH = mat('cloth', (0.5, 0.5, 0.5)); PANTS = mat('pants', (0.12, 0.13, 0.18))
HAIR = mat('hair', (0.12, 0.08, 0.06)); SHOE = mat('shoe', (0.05, 0.04, 0.04)); EYE = mat('eye', (0.03, 0.03, 0.04), 0.4)
LAPIS = mat('lapis', (0.08, 0.2, 0.75), 0.2, (0.1, 0.3, 1), 3); VERV = mat('vervain', (0.5, 0.3, 0.8), 0.6, (0.45, 0.2, 0.9), 1.5)
STEM = mat('stem', (0.15, 0.35, 0.15)); FLAME = mat('flame', (1, 0.5, 0.1), 0.5, (1, 0.4, 0.05), 5)
CANVAS = mat('canvas', (0.45, 0.33, 0.2)); AWN = mat('awning', (0.4, 0.07, 0.1))
SHOPWALL = mat('shopWall', (0.2, 0.28, 0.27)); ROOF_RED = mat('roofRed', (0.25, 0.1, 0.1))
FUR = mat('fur', (0.21, 0.19, 0.18)); FUR_D = mat('furDark', (0.09, 0.08, 0.08)); CLAW = mat('claw', (0.78, 0.74, 0.62), 0.5)
EYEGLOW = mat('eyeGlow', (1, 0.85, 0.2), 0.4, (1, 0.8, 0.1), 4)
HIDE = mat('hide', (0.45, 0.31, 0.2)); HIDE_L = mat('hideLight', (0.72, 0.64, 0.5)); HOOF = mat('hoof', (0.07, 0.06, 0.05))
BONE = mat('bone', (0.78, 0.74, 0.62)); SHADE = mat('shade', (0.06, 0.07, 0.11)); VOID = mat('void', (0, 0, 0), 1.0)
CAPE = mat('cape', (0.32, 0.04, 0.06)); LEATHER = mat('leather', (0.25, 0.15, 0.09)); STEEL = mat('steel', (0.62, 0.65, 0.7), 0.35)
FELT = mat('felt', (0.1, 0.08, 0.07)); RUNE = mat('rune', (0.45, 0.35, 1.0), 0.4, (0.4, 0.3, 1.0), 3)
WATER = mat('water', (0.1, 0.25, 0.35), 0.15); CARPAINT = mat('carPaint', (0.4, 0.1, 0.1), 0.35)
GLASS = mat('glass', (0.12, 0.17, 0.22), 0.1); TIRE = mat('tire', (0.04, 0.04, 0.045)); PAPER = mat('paper', (0.8, 0.76, 0.62))
GOLD = mat('gold', (0.9, 0.7, 0.2), 0.35, (0.8, 0.55, 0.1), 0.6); BLOOD = mat('blood', (0.6, 0.02, 0.04), 0.3, (0.8, 0.03, 0.05), 2)
MOONSTONE = mat('moonstone', (0.82, 0.88, 0.95), 0.25, (0.6, 0.75, 1.0), 1.5)
GLOWCAP = mat('glowcap', (0.3, 0.9, 0.8), 0.5, (0.15, 0.9, 0.75), 2.5); GRASS = mat('grassBlade', (0.2, 0.36, 0.16))
BIRCH = mat('birchBark', (0.82, 0.8, 0.74)); BIRCH_L = mat('birchLeaf', (0.5, 0.56, 0.16)); WILLOW = mat('willow', (0.24, 0.36, 0.16))
LEAF_L = mat('leafLight', (0.2, 0.32, 0.14)); HAY = mat('hay', (0.66, 0.54, 0.24)); HAY_D = mat('hayDark', (0.46, 0.36, 0.15))
WOLFSBANE = mat('wolfsbane', (0.9, 0.78, 0.2), 0.6, (0.8, 0.65, 0.1), 1.0); SAGE = mat('sage', (0.42, 0.5, 0.42))
SAGE_F = mat('sageFlower', (0.92, 0.92, 0.86), 0.6, (0.6, 0.6, 0.55), 0.6)
BARN = mat('barnRed', (0.42, 0.1, 0.08)); CLAP = mat('clapboard', (0.4, 0.43, 0.36)); CLIFF = mat('cliff', (0.23, 0.22, 0.23))


def TR(loc=(0, 0, 0), rot=(0, 0, 0), sc=(1, 1, 1)):
    return Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*sc, 1))


class _At:
    def __init__(s, b, M):
        s.b, s.M = b, M

    def __enter__(s):
        s.b.stack.append(s.b.stack[-1] @ s.M)
        return s.b

    def __exit__(s, *a):
        s.b.stack.pop()


class B:
    """Accumulates primitives into one flat-shaded mesh; one material slot per colour.
    All primitives are wound outward by construction (mirrored transforms are un-flipped)."""

    def __init__(s, name):
        s.name, s.bm, s.mats, s.stack = name, bmesh.new(), [], [Matrix.Identity(4)]

    def at(s, loc=(0, 0, 0), rot=(0, 0, 0), sc=(1, 1, 1)):
        """with b.at(...): everything built inside is moved / rotated / scaled (use sc=(-1,1,1) to mirror)."""
        return _At(s, TR(loc, rot, sc))

    def _mi(s, m):
        if m not in s.mats:
            s.mats.append(m)
        return s.mats.index(m)

    def _add(s, pts, faces, m, M=None):
        T = s.stack[-1] if M is None else s.stack[-1] @ M
        flip = T.determinant() < 0
        vs = [s.bm.verts.new(T @ Vector(p)) for p in pts]
        mi = s._mi(m)
        for f in faces:
            if len(set(f)) < 3:
                continue
            try:
                face = s.bm.faces.new([vs[i] for i in (tuple(reversed(f)) if flip else f)])
            except ValueError:
                continue
            face.material_index = mi
        return s

    def box(s, size, loc, m, rot=(0, 0, 0), top=None, skip=''):
        """Box centred on loc. top=(sx, sy[, dx, dy]) scales / shifts the +Z face (taper).
        skip: faces to leave out, any of b t f k l r (bottom, top, front -Y, back +Y, left -X, right +X)."""
        tx, ty, dx, dy = (tuple(top) + (0, 0))[:4] if top else (1, 1, 0, 0)
        dx, dy = dx / size[0], dy / size[1]
        P = [(-.5, -.5, -.5), (.5, -.5, -.5), (.5, .5, -.5), (-.5, .5, -.5), (-.5 * tx + dx, -.5 * ty + dy, .5),
             (.5 * tx + dx, -.5 * ty + dy, .5), (.5 * tx + dx, .5 * ty + dy, .5), (-.5 * tx + dx, .5 * ty + dy, .5)]
        F = {'b': (3, 2, 1, 0), 't': (4, 5, 6, 7), 'f': (0, 1, 5, 4), 'r': (1, 2, 6, 5), 'k': (2, 3, 7, 6), 'l': (3, 0, 4, 7)}
        return s._add(P, [F[k] for k in F if k not in skip], m, TR(loc, rot, size))

    def loft(s, rings, m, seg=8, loc=(0, 0, 0), rot=(0, 0, 0), caps='tb', phase=None, hole=None, capm=None):
        """Stack of elliptical rings (z, rx, ry[, cx, cy]) skinned into a tube; rx=ry=0 collapses a ring to a point.
        z may be a list (per-vertex heights, cycled) for ragged edges. seg=4 with default phase: rx/ry are the
        half-extents of a rectangle. hole(band, face) -> True leaves that side face out. capm = other material for caps."""
        k = 1.0
        if phase is None:
            phase = PI / seg if seg % 2 == 0 else PI / 2
            if seg == 4:
                k = R2
        zav = [sum(r[0]) / len(r[0]) if isinstance(r[0], (list, tuple)) else r[0] for r in rings]
        if zav[0] > zav[-1]:
            rings = rings[::-1]
        pts, idx = [], []
        for r in rings:
            z, rx, ry = r[0], r[1], r[2]
            cx, cy = (r[3] if len(r) > 3 else 0), (r[4] if len(r) > 4 else 0)
            if rx <= 1e-6 and ry <= 1e-6:
                idx.append([len(pts)])
                pts.append((cx, cy, z))
                continue
            row = []
            for j in range(seg):
                a = phase + 2 * PI * j / seg
                zz = z[j % len(z)] if isinstance(z, (list, tuple)) else z
                row.append(len(pts))
                pts.append((cx + rx * k * math.cos(a), cy + ry * k * math.sin(a), zz))
            idx.append(row)
        F = []
        for i in range(len(idx) - 1):
            A, C = idx[i], idx[i + 1]
            for j in range(seg):
                if hole and hole(i, j):
                    continue
                j2 = (j + 1) % seg
                if len(A) == 1 and len(C) == 1:
                    continue
                if len(A) == 1:
                    F.append((A[0], C[j2], C[j]))
                elif len(C) == 1:
                    F.append((A[j], A[j2], C[0]))
                else:
                    F.append((A[j], A[j2], C[j2], C[j]))
        C = []
        if 'b' in caps and len(idx[0]) > 1:
            C.append(tuple(reversed(idx[0])))
        if 't' in caps and len(idx[-1]) > 1:
            C.append(tuple(idx[-1]))
        if capm is None:
            return s._add(pts, F + C, m, TR(loc, rot))
        return s._add(pts, F, m, TR(loc, rot))._add(pts, C, capm, TR(loc, rot))

    def cyl(s, r1, r2, h, loc, m, seg=8, rot=(0, 0, 0), caps='tb', sc=(1, 1)):
        """Cylinder / cone centred on loc (r1 bottom, r2 top; r2=0 gives a true cone)."""
        return s.loft([(-h / 2, r1 * sc[0], r1 * sc[1]), (h / 2, r2 * sc[0], r2 * sc[1])], m, seg, loc, rot, caps)

    def zc(s, r1, r2, z0, z1, m, x=0, y=0, seg=8, caps='tb', sc=(1, 1)):
        """Upright cylinder / cone from height z0 to z1."""
        return s.loft([(z0, r1 * sc[0], r1 * sc[1]), (z1, r2 * sc[0], r2 * sc[1])], m, seg, (x, y, 0), (0, 0, 0), caps)

    def ico(s, r, loc, m, sub=1, scale=(1, 1, 1), jit=0.0, rot=(0, 0, 0)):
        T = s.stack[-1] @ TR(loc, rot, scale)
        g = bmesh.ops.create_icosphere(s.bm, subdivisions=sub, radius=r)
        v = g['verts']
        if jit:
            for q in v:
                q.co *= 1 + U(-jit, jit)
        bmesh.ops.transform(s.bm, matrix=T, verts=v)
        fs = list({f for q in v for f in q.link_faces})
        if T.determinant() < 0:
            bmesh.ops.reverse_faces(s.bm, faces=fs)
        mi = s._mi(m)
        for f in fs:
            f.material_index = mi
        return s

    def tube(s, path, radii, m, seg=5, caps='tb', sc=(1, 1)):
        """Sweep a ring along a 3D polyline (limbs, branches, antlers, bars). radii: one per point, 0 = pointed end.
        sc flattens the section (first axis starts out as world X where it can)."""
        P = [Vector(p) for p in path]
        n = len(P)
        pts, idx, nrm, tprev = [], [], None, None
        for i in range(n):
            t = (P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized()
            if nrm is None:
                ref = Vector((1, 0, 0)) if abs(t.x) < 0.9 else Vector((0, 1, 0))
                nrm = (ref - t * ref.dot(t)).normalized()
            else:
                nrm = tprev.rotation_difference(t) @ nrm
                nrm = (nrm - t * nrm.dot(t)).normalized()
            tprev = t
            bn = t.cross(nrm)
            if radii[i] <= 1e-6:
                idx.append([len(pts)])
                pts.append(tuple(P[i]))
                continue
            row = []
            for j in range(seg):
                a = 2 * PI * (j + 0.5) / seg
                row.append(len(pts))
                pts.append(tuple(P[i] + nrm * (math.cos(a) * radii[i] * sc[0]) + bn * (math.sin(a) * radii[i] * sc[1])))
            idx.append(row)
        F = []
        for i in range(n - 1):
            A, C = idx[i], idx[i + 1]
            for j in range(seg):
                j2 = (j + 1) % seg
                if len(A) == 1 and len(C) == 1:
                    continue
                if len(A) == 1:
                    F.append((A[0], C[j2], C[j]))
                elif len(C) == 1:
                    F.append((A[j], A[j2], C[0]))
                else:
                    F.append((A[j], A[j2], C[j2], C[j]))
        if 'b' in caps and len(idx[0]) > 1:
            F.append(tuple(reversed(idx[0])))
        if 't' in caps and len(idx[-1]) > 1:
            F.append(tuple(idx[-1]))
        return s._add(pts, F, m)

    def ann(s, ro, ri, h, loc, m, seg=12, rot=(0, 0, 0), ro2=None, ri2=None, sc=(1, 1), skip=''):
        """Ring with a rectangular section (basin walls, rims, bands): base at loc, height h.
        ro2 / ri2 are the radii at the top. skip any of o i t b (outer, inner, top, bottom faces)."""
        ro2 = ro if ro2 is None else ro2
        ri2 = ri if ri2 is None else ri2
        pts = []
        for r, z in ((ro, 0), (ro2, h), (ri2, h), (ri, 0)):
            for j in range(seg):
                a = PI / seg + 2 * PI * j / seg
                pts.append((r * sc[0] * math.cos(a), r * sc[1] * math.sin(a), z))
        F = []
        for q, key in enumerate('otib'):
            if key in skip:
                continue
            a0, b0 = q * seg, ((q + 1) % 4) * seg
            for j in range(seg):
                j2 = (j + 1) % seg
                F.append((a0 + j, a0 + j2, b0 + j2, b0 + j))
        return s._add(pts, F, m, TR(loc, rot))

    def prism(s, pts, depth, m, axis='y', loc=(0, 0, 0), rot=(0, 0, 0), caps=(True, True)):
        """Extrude a 2D outline (may be concave). axis='y': pts are (x, z), extruded along Y, centred (caps = back, front);
        axis='x': pts are (y, z), extruded along X, centred (caps = left, right);
        axis='z': pts are (x, y), extruded upward from 0 to depth (caps = bottom, top)."""
        n = len(pts)
        area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
        if area < 0:
            pts = pts[::-1]
        w0, w1 = (0, depth) if axis == 'z' else (-depth / 2, depth / 2)
        cv = {'z': lambda u, v, w: (u, v, w), 'y': lambda u, v, w: (u, -w, v), 'x': lambda u, v, w: (w, u, v)}[axis]
        P = [cv(u, v, w0) for u, v in pts] + [cv(u, v, w1) for u, v in pts]
        F = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        if caps[0]:
            F.append(tuple(reversed(range(n))))
        if caps[1]:
            F.append(tuple(range(n, 2 * n)))
        return s._add(P, F, m, TR(loc, rot))

    def poly(s, pts, m, double=False):
        """Single flat face (counter-clockwise seen from its visible side); double adds the reverse side too."""
        s._add(pts, [tuple(range(len(pts)))], m)
        if double:
            s._add(pts, [tuple(reversed(range(len(pts))))], m)
        return s

    def sheet(s, grid, m, double=False):
        """Quad grid from rows of points (cloth, hulls, rock faces). double adds the reverse side too."""
        nc = len(grid[0])
        pts = [p for row in grid for p in row]
        F = [(r * nc + c, r * nc + c + 1, (r + 1) * nc + c + 1, (r + 1) * nc + c) for r in range(len(grid) - 1) for c in range(nc - 1)]
        s._add(pts, F, m)
        if double:
            s._add(pts, [tuple(reversed(f)) for f in F], m)
        return s

    def gable(s, length, span, h, z, m, over=0.35, t=0.14, axis='x', loc=(0, 0), wall=None):
        """Pitched roof shell with thickness and overhang. Ridge runs along `axis` for `length`; `span` is the wall-to-wall
        width under it; z = wall-top height; h = ridge rise. wall = material for the two triangular gable-end infills."""
        L, D, sl = length / 2 + over, span / 2 + over, h / (span / 2)
        ze, zr, tt = z - over * sl, z + h, t * math.sqrt(1 + sl * sl)
        P = []
        for x in (-L, L):
            P += [(x, -D, ze + tt), (x, 0, zr + tt), (x, D, ze + tt), (x, -D, ze), (x, 0, zr), (x, D, ze)]
        F = [(0, 6, 7, 1), (1, 7, 8, 2), (4, 10, 9, 3), (5, 11, 10, 4), (3, 9, 6, 0), (11, 5, 2, 8),
             (0, 1, 4, 3), (1, 2, 5, 4), (9, 10, 7, 6), (10, 11, 8, 7)]
        M = TR((loc[0], loc[1], 0), (0, 0, PI / 2 if axis == 'y' else 0))
        s._add(P, F, m, M)
        if wall:
            l, sp = length / 2, span / 2
            s._add([(-l, sp, z), (-l, -sp, z), (-l, 0, zr), (l, -sp, z), (l, sp, z), (l, 0, zr)], [(0, 1, 2), (3, 4, 5)], wall, M)
        return s

    def hip(s, w, d, h, z, m, over=0.35, loc=(0, 0), drop=0.12):
        """Hipped roof over a w x d rectangle (ridge along the longer side; a square gives a pyramid)."""
        if d > w:
            with s.at((loc[0], loc[1], 0), (0, 0, PI / 2)):
                return s.hip(d, w, h, z, m, over, (0, 0), drop)
        W, D = w / 2 + over, d / 2 + over
        R, ze, zt = W - D, z - drop, z + h
        if R < 1e-4:
            P = [(-W, -D, ze), (W, -D, ze), (W, D, ze), (-W, D, ze), (0, 0, zt)]
            F = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)]
        else:
            P = [(-W, -D, ze), (W, -D, ze), (W, D, ze), (-W, D, ze), (-R, 0, zt), (R, 0, zt)]
            F = [(0, 1, 5, 4), (1, 2, 5), (2, 3, 4, 5), (3, 0, 4), (3, 2, 1, 0)]
        return s._add(P, F, m, TR((loc[0], loc[1], 0)))

    def done(s, parent=None, loc=(0, 0, 0)):
        loose = [v for v in s.bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(s.bm, geom=loose, context='VERTS')
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


def mirror(b):
    """Yields (sign, context) for the left and right copies of a symmetric part."""
    return ((-1, b.at(sc=(-1, 1, 1))), (1, b.at()))


# ======================================================================================================
# CHARACTERS: separate limbs so the game can animate them. Child origin = joint pivot.
# ======================================================================================================
hu = empty('human')
# torso: pelvis + belt + chest + neck (pivot at the waist, z=0.9)
t = B('human_Torso')
t.loft([(-0.14, 0.13, 0.095), (-0.06, 0.165, 0.11), (0.06, 0.16, 0.105)], PANTS, 8, caps='b')
t.loft([(0.045, 0.168, 0.113), (0.095, 0.168, 0.113)], SHOE, 8, caps='')
t.loft([(0.08, 0.155, 0.10), (0.25, 0.18, 0.115), (0.42, 0.24, 0.13), (0.515, 0.275, 0.125), (0.57, 0.22, 0.105),
        (0.60, 0.08, 0.07)], CLOTH, 8, caps='t')
t.loft([(0.58, 0.058, 0.06), (0.675, 0.052, 0.056)], SKIN, 6, caps='')
t.done(hu, (0, 0, 0.9))
# head: skull with jaw taper, nose, eyes, hair cap (pivot at the neck)
t = B('human_Head')
t.loft([(0.015, 0.05, 0.055, 0, -0.03), (0.07, 0.088, 0.097, 0, -0.015), (0.15, 0.102, 0.117), (0.23, 0.104, 0.12),
        (0.31, 0.06, 0.075)], SKIN, 8)
t.box((0.032, 0.04, 0.055), (0, -0.122, 0.135), SKIN, top=(0.6, 0.5, 0, 0.01), skip='k')
for sx in (-1, 1):
    t.box((0.03, 0.02, 0.022), (sx * 0.043, -0.106, 0.19), EYE, skip='k')
t.loft([(0.15, 0.108, 0.105, 0, 0.035), (0.225, 0.116, 0.12, 0, 0.02), (0.285, 0.11, 0.127, 0, 0.004),
        (0.34, 0.06, 0.075, 0, 0.008)], HAIR, 8, caps='t')
t.done(hu, (0, 0, 1.52))
for sx, n in ((-1, 'human_ArmL'), (1, 'human_ArmR')):
    t = B(n)
    with t.at(sc=(sx, 1, 1)):
        t.loft([(-0.56, 0.04, 0.045), (-0.30, 0.05, 0.055), (-0.07, 0.066, 0.072, -0.012), (0.025, 0.07, 0.074, -0.025),
                (0.06, 0.04, 0.05, -0.04)], CLOTH, 6)
    t.box((0.055, 0.085, 0.13), (0, 0, -0.62), SKIN, rot=(PI, 0, 0), top=(0.75, 0.7))
    t.done(hu, (sx * 0.32, 0, 1.44))
for sx, n in ((-1, 'human_LegL'), (1, 'human_LegR')):
    t = B(n)
    t.loft([(-0.77, 0.05, 0.055), (-0.42, 0.062, 0.068), (-0.36, 0.068, 0.073), (-0.05, 0.09, 0.098), (0.03, 0.083, 0.09)], PANTS, 6, caps='')
    t.box((0.11, 0.27, 0.09), (0, -0.045, -0.795), SHOE, top=(0.8, 0.5, 0, 0.055))
    t.done(hu, (sx * 0.13, 0, 0.84))

# ---- beast (werewolf): hunched torso, wolf head, long clawed arms, digitigrade legs ----
be = empty('beast')
t = B('beast_Torso')
t.loft([(-0.18, 0.2, 0.17, 0, 0.06), (0.0, 0.24, 0.19, 0, 0.05), (0.15, 0.22, 0.18, 0, 0.03), (0.42, 0.36, 0.27, 0, -0.04),
        (0.68, 0.47, 0.31, 0, -0.10), (0.84, 0.34, 0.26, 0, -0.15), (0.94, 0.15, 0.15, 0, -0.18)], FUR, 8)
for y, z, r in ((0.05, 0.9, 0.09), (0.16, 0.74, 0.11), (0.2, 0.54, 0.1), (0.2, 0.34, 0.08)):  # mane spikes down the spine
    t.loft([(0, r, r * 0.8), (r * 2.6, 0, 0)], FUR_D, 4, (0, y, z), (-0.9, 0, 0), caps='')
t.tube([(0, 0.18, -0.08), (0, 0.42, -0.26), (0, 0.55, -0.6)], [0.07, 0.09, 0], FUR_D, 5, caps='')
t.done(be, (0, 0, 1.1))
t = B('beast_Head')
t.loft([(-0.16, 0.09, 0.09, 0, 0.10), (-0.04, 0.17, 0.16, 0, 0.13), (0.12, 0.165, 0.15, 0, 0.12), (0.22, 0.10, 0.09, 0, 0.07),
        (0.46, 0.07, 0.06, 0, 0.04)], FUR, 8, rot=FWD)
t.box((0.08, 0.05, 0.05), (0, -0.47, 0.065), FUR_D)
t.box((0.11, 0.3, 0.045), (0, -0.29, -0.035), FUR_D, rot=(0.2, 0, 0), top=(0.8, 1))
for sx in (-1, 1):
    t.loft([(0, 0.055, 0.035), (0.22, 0, 0)], FUR_D, 4, (sx * 0.115, 0.02, 0.22), (-0.25, sx * 0.4, 0), caps='')
    t.box((0.06, 0.04, 0.035), (sx * 0.085, -0.185, 0.175), EYEGLOW, rot=(0, sx * 0.35, sx * -0.3))
    t.loft([(0, 0.014, 0.014), (0.07, 0, 0)], CLAW, 3, (sx * 0.045, -0.41, -0.005), (PI, 0, 0), caps='')
t.done(be, (0, -0.15, 1.95))
for sx, n in ((-1, 'beast_ArmL'), (1, 'beast_ArmR')):
    t = B(n)
    with t.at(sc=(sx, 1, 1)):
        t.tube([(0, 0, 0.09), (0.01, 0, -0.08), (0.05, -0.02, -0.45), (0.04, -0.08, -0.6), (0.02, -0.14, -0.88)],
               [0.09, 0.135, 0.085, 0.1, 0.065], FUR, 6)
        t.box((0.14, 0.16, 0.13), (0.02, -0.16, -0.93), FUR_D, top=(0.8, 0.8))
        for i in range(4):
            t.loft([(0, 0.02, 0.02), (0.17, 0, 0)], CLAW, 3, (0.02 + (i - 1.5) * 0.036, -0.2, -0.98), (PI - 0.45, 0, 0), caps='')
    t.done(be, (sx * 0.5, 0, 1.8))
for sx, n in ((-1, 'beast_LegL'), (1, 'beast_LegR')):
    t = B(n)
    with t.at(sc=(sx, 1, 1)):
        t.tube([(0, 0, 0.1), (0, -0.16, -0.38), (0, 0.12, -0.72), (0, 0.02, -0.93)], [0.16, 0.115, 0.07, 0.06], FUR, 6)
        t.box((0.15, 0.32, 0.08), (0, -0.1, -0.96), FUR_D, top=(0.8, 0.7, 0, 0.05))
        for i in (-1, 0, 1):
            t.loft([(0, 0.02, 0.02), (0.1, 0, 0)], CLAW, 3, (i * 0.048, -0.25, -0.975), FWD, caps='')
    t.done(be, (sx * 0.22, 0, 1.0))


def quadruped(name, body_p, head_p, leg_z, leg_x, leg_yf, leg_yb, tail_p, parts):
    """Shared assembly for wolf / deer: `parts` maps a part key to a function(builder) that models it around its pivot."""
    root = empty(name)
    for key, piv in (('Body', body_p), ('Head', head_p), ('Tail', tail_p)):
        b = B(name + '_' + key)
        parts[key](b)
        b.done(root, piv)
    for key, sx, y in (('LegFL', -1, leg_yf), ('LegFR', 1, leg_yf), ('LegBL', -1, leg_yb), ('LegBR', 1, leg_yb)):
        b = B(name + '_' + key)
        with b.at(sc=(sx, 1, 1)):
            parts['LegF' if 'F' in key[:4] else 'LegB'](b)
        b.done(root, (sx * leg_x, y, leg_z))
    return root


# ---- wolf ----
def _wolf_body(b):
    b.loft([(-0.62, 0.08, 0.09, 0, 0.06), (-0.5, 0.15, 0.17, 0, 0.03), (-0.15, 0.145, 0.155, 0, 0.0), (0.25, 0.18, 0.2, 0, 0.0),
            (0.5, 0.15, 0.18, 0, 0.08), (0.68, 0.105, 0.125, 0, 0.15)], FUR, 8, rot=FWD)
    b.loft([(0.28, 0.2, 0.2, 0, 0.03), (0.42, 0.2, 0.21, 0, 0.07), (0.56, 0.14, 0.16, 0, 0.12)], FUR_D, 8, rot=FWD, caps='')  # neck ruff
    b.box((0.14, 0.7, 0.05), (0, 0.12, 0.17), FUR_D, top=(0.5, 0.9))  # dark saddle along the spine


def _wolf_head(b):
    b.loft([(-0.1, 0.085, 0.085, 0, 0.02), (0.02, 0.12, 0.115, 0, 0.04), (0.12, 0.11, 0.1, 0, 0.03), (0.19, 0.06, 0.055, 0, -0.005),
            (0.37, 0.042, 0.04, 0, -0.02)], FUR, 8, rot=FWD)
    b.box((0.05, 0.04, 0.04), (0, -0.38, -0.01), FUR_D)
    b.box((0.07, 0.2, 0.03), (0, -0.25, -0.065), FUR_D, rot=(0.12, 0, 0))
    for sx in (-1, 1):
        b.loft([(0, 0.04, 0.025), (0.15, 0, 0)], FUR_D, 4, (sx * 0.075, 0.0, 0.12), (-0.2, sx * 0.3, 0), caps='')
        b.box((0.04, 0.03, 0.028), (sx * 0.06, -0.15, 0.085), EYEGLOW, rot=(0, sx * 0.3, sx * -0.3))


def _wolf_legf(b):
    b.tube([(0, 0, 0.1), (0, 0.02, -0.24), (0, -0.01, -0.5)], [0.08, 0.05, 0.036], FUR, 5, caps='')
    b.box((0.085, 0.13, 0.05), (0, -0.03, -0.525), FUR_D, top=(0.8, 0.7, 0, 0.02))


def _wolf_legb(b):
    b.tube([(0, 0, 0.1), (0, -0.07, -0.2), (0, 0.09, -0.37), (0, 0.04, -0.5)], [0.095, 0.065, 0.04, 0.034], FUR, 5, caps='')
    b.box((0.085, 0.13, 0.05), (0, 0.0, -0.525), FUR_D, top=(0.8, 0.7, 0, 0.02))


def _wolf_tail(b):
    b.tube([(0, -0.16, -0.02), (0, 0.12, -0.06), (0, 0.36, -0.2)], [0.045, 0.08, 0.065], FUR, 5, caps='b')
    b.tube([(0, 0.36, -0.2), (0, 0.52, -0.32)], [0.065, 0], FUR_D, 5, caps='')


quadruped('wolf', (0, 0, 0.62), (0, -0.6, 0.75), 0.55, 0.18, -0.45, 0.5, (0, 0.75, 0.7),
          {'Body': _wolf_body, 'Head': _wolf_head, 'LegF': _wolf_legf, 'LegB': _wolf_legb, 'Tail': _wolf_tail})


# ---- deer (stag) ----
def _deer_body(b):
    b.loft([(-0.7, 0.1, 0.12, 0, 0.06), (-0.55, 0.19, 0.22, 0, 0.03), (-0.1, 0.2, 0.22, 0, -0.01), (0.3, 0.2, 0.24, 0, 0.0),
            (0.52, 0.13, 0.18, 0, 0.04)], HIDE, 8, rot=FWD)
    b.tube([(0, -0.36, 0.0), (0, -0.63, 0.28)], [0.17, 0.125], HIDE, 6, caps='')  # neck base, up to the head pivot
    b.box((0.26, 0.5, 0.1), (0, 0.0, -0.2), HIDE_L, top=(1.15, 1.2))  # pale belly
    b.box((0.2, 0.08, 0.2), (0, 0.69, 0.06), HIDE_L, rot=(-0.35, 0, 0), top=(0.6, 1))  # rump patch


def _deer_head(b):
    b.tube([(0, 0.05, -0.08), (0, -0.05, 0.2), (0, -0.08, 0.44)], [0.125, 0.095, 0.075], HIDE, 6, caps='')  # neck rises from the pivot
    with b.at((0, -0.06, 0.42)):
        b.loft([(-0.08, 0.055, 0.065, 0, 0.04), (0.03, 0.08, 0.085, 0, 0.05), (0.12, 0.07, 0.07, 0, 0.035), (0.2, 0.045, 0.045, 0, 0.0),
                (0.32, 0.035, 0.035, 0, -0.03)], HIDE, 6, rot=FWD)
        b.box((0.05, 0.035, 0.04), (0, -0.33, -0.03), HOOF)
        for sx in (-1, 1):
            b.loft([(0, 0.035, 0.018), (0.15, 0, 0)], HIDE_L, 4, (sx * 0.07, 0.03, 0.09), (-0.5, sx * 1.0, 0), caps='')  # ears
            b.box((0.025, 0.025, 0.025), (sx * 0.068, -0.09, 0.075), HOOF)
            with b.at(sc=(sx, 1, 1)):  # antlers: main beam + three tines
                b.tube([(0.035, 0.0, 0.11), (0.12, 0.05, 0.3), (0.26, 0.04, 0.46), (0.3, -0.06, 0.62)], [0.022, 0.02, 0.016, 0], BONE, 4, caps='')
                b.tube([(0.07, 0.025, 0.2), (0.07, -0.12, 0.3)], [0.016, 0], BONE, 3, caps='')
                b.tube([(0.16, 0.05, 0.35), (0.14, -0.06, 0.5)], [0.016, 0], BONE, 3, caps='')
                b.tube([(0.26, 0.04, 0.46), (0.4, 0.08, 0.56)], [0.015, 0], BONE, 3, caps='')


def _deer_legf(b):
    b.tube([(0, 0, 0.1), (0, 0.01, -0.42), (0, -0.01, -0.84)], [0.085, 0.042, 0.03], HIDE, 5, caps='')
    b.box((0.06, 0.08, 0.07), (0, -0.015, -0.865), HOOF, top=(0.8, 0.7, 0, 0.01))


def _deer_legb(b):
    b.tube([(0, 0, 0.12), (0, -0.05, -0.34), (0, 0.08, -0.56), (0, 0.03, -0.84)], [0.11, 0.06, 0.036, 0.03], HIDE, 5, caps='')
    b.box((0.06, 0.08, 0.07), (0, 0.02, -0.865), HOOF, top=(0.8, 0.7, 0, 0.01))


def _deer_tail(b):
    b.loft([(0, 0.05, 0.03), (0.16, 0.035, 0.02), (0.2, 0, 0)], HIDE_L, 4, (0, -0.02, 0.03), (-2.2, 0, 0), caps='')


quadruped('deer', (0, 0, 0.95), (0, -0.65, 1.25), 0.9, 0.16, -0.45, 0.5, (0, 0.7, 1.05),
          {'Body': _deer_body, 'Head': _deer_head, 'LegF': _deer_legf, 'LegB': _deer_legb, 'Tail': _deer_tail})

# ---- shade: hooded floating wraith (single mesh) ----
t = B('shade')
t.loft([([0.3, 0.55], 0.46, 0.4), (0.8, 0.35, 0.29), (1.2, 0.29, 0.23), (1.5, 0.33, 0.21), (1.62, 0.18, 0.16)], SHADE, 10, caps='t')
t.loft([(0.55, 0.3, 0.26), (0.62, 0.3, 0.26)], VOID, 6, caps='b')  # blacks out the inside of the robe
t.loft([(1.52, 0.2, 0.19, 0, 0.02), (1.66, 0.25, 0.25, 0, -0.01), (1.9, 0.24, 0.26, 0, -0.02), (2.04, 0.14, 0.16, 0, 0.05),
        (2.12, 0, 0, 0, 0.12)], SHADE, 10, phase=1.4 * PI, caps='', hole=lambda i, j: i == 1 and j in (0, 1, 9))
t.loft([(1.6, 0.17, 0.17, 0, 0.03), (1.78, 0.21, 0.2, 0, 0.03), (1.96, 0.15, 0.15, 0, 0.03)], VOID, 6)  # hollow of the hood
for sx in (-1, 1):
    t.box((0.07, 0.03, 0.03), (sx * 0.075, -0.19, 1.8), EYEGLOW, rot=(0, sx * 0.35, 0))
    with t.at(sc=(sx, 1, 1)):
        t.tube([(0.27, 0, 1.5), (0.4, -0.1, 1.28), (0.37, -0.36, 1.08)], [0.1, 0.11, 0.17], SHADE, 6, caps='b', sc=(0.8, 1))
        t.loft([(0, 0, 0), (0.42, 0.1, 0.13)], SHADE, 4, (0.37, -0.33, 0.62), (0.12, 0, 0), caps='')  # drooping sleeve tail
        t.loft([(0, 0.11, 0.14), (0.01, 0.11, 0.14)], VOID, 6, (0.372, -0.37, 1.07), (0.95, 0.1, 0), caps='t')
t.done()

# ======================================================================================================
# WEARABLES (origin = human root on the ground, or the head pivot at the neck) AND HELD ITEMS (origin = grip, pointing -Y)
# ======================================================================================================
t = B('coat')
t.loft([(0.44, 0.25, 0.185, 0, 0.01), (0.7, 0.215, 0.155, 0, 0.005), (0.98, 0.178, 0.123), (1.02, 0.165, 0.11)], CLOTH, 8, caps='t')
t.loft([(1.435, 0.11, 0.095, 0, 0.012), (1.54, 0.135, 0.115, 0, 0.03)], CLOTH, 8, caps='')  # turned-up collar (outer)
t.loft([(1.435, 0.085, 0.075, 0, 0.012), (1.54, 0.11, 0.095, 0, 0.03)], CLOTH, 8, caps='b')
t.done()
t = B('cape')
g = []
for z, hw, yb, wrap in ((1.5, 0.2, 0.1, 0.5), (1.4, 0.3, 0.13, 0.9), (1.05, 0.34, 0.17, 0.7), (0.7, 0.4, 0.23, 0.6), ([0.3, 0.38], 0.47, 0.3, 0.5)):
    row = []
    for j in range(5):
        a = (j - 2) / 2.0  # -1 .. 1 across the back
        zz = z[j % 2] if isinstance(z, list) else z
        row.append((hw * math.sin(a * 1.45), yb - (1 - math.cos(a * 1.45)) * hw * wrap, zz))
    g.append(row)
t.sheet(g, CAPE, double=True)
t.loft([(1.44, 0.1, 0.09, 0, 0.01), (1.49, 0.115, 0.1, 0, 0.015)], CAPE, 8, caps='')
t.done()
t = B('armor')
t.loft([(1.0, 0.18, 0.125), (1.2, 0.205, 0.137), (1.325, 0.26, 0.15), (1.42, 0.292, 0.142), (1.478, 0.235, 0.118)], LEATHER, 8, caps='')
t.loft([(0.97, 0.185, 0.13), (1.03, 0.185, 0.13)], IRON, 8, caps='')
t.box((0.1, 0.02, 0.2), (0, -0.146, 1.25), IRON, top=(1.5, 1), skip='k')
for sx in (-1, 1):
    t.loft([(0, 0.11, 0.11), (0.07, 0.085, 0.09), (0.1, 0.03, 0.04)], IRON, 6, (sx * 0.31, 0, 1.44), (0, sx * 0.4, 0), caps='t')
t.done()
t = B('hat')
t.loft([(0.255, 0.29, 0.31), (0.275, 0.3, 0.32), (0.285, 0.13, 0.14)], FELT, 10, caps='b')
t.loft([(0.28, 0.132, 0.143), (0.4, 0.118, 0.128), (0.42, 0.08, 0.1)], FELT, 8)
t.loft([(0.285, 0.137, 0.148), (0.318, 0.134, 0.145)], LEATHER, 8, caps='')
t.done()
t = B('hood')
t.loft([(-0.04, 0.15, 0.13, 0, 0.03), (0.08, 0.14, 0.15, 0, 0.025), (0.26, 0.145, 0.165, 0, 0.02), (0.34, 0.11, 0.13, 0, 0.04),
        (0.385, 0, 0, 0, 0.09)], CLOTH, 10, phase=1.4 * PI, caps='', hole=lambda i, j: i == 1 and j in (0, 1, 9))
t.loft([(-0.1, 0.19, 0.14, 0, 0.03), (-0.04, 0.15, 0.13, 0, 0.03)], CLOTH, 10, phase=1.4 * PI, caps='')  # mantle over the shoulders
t.done()
t = B('longhair')
t.loft([(-0.34, 0.09, 0.03, 0, 0.14), (-0.2, 0.15, 0.05, 0, 0.14), (0.0, 0.14, 0.06, 0, 0.115), (0.16, 0.125, 0.07, 0, 0.09),
        (0.27, 0.09, 0.05, 0, 0.07)], HAIR, 6)
for sx in (-1, 1):
    t.loft([(-0.14, 0.02, 0.03), (0.02, 0.03, 0.045), (0.2, 0.025, 0.05)], HAIR, 4, (sx * 0.112, -0.02, 0), caps='b')  # side locks
t.done()
t = B('crown')
t.ann(0.13, 0.117, 0.035, (0, 0.012, 0.25), IRON, 8, sc=(1, 1.09), skip='b')
for i in range(8):
    a = PI / 8 + i * PI / 4
    t.loft([(0, 0.016, 0.016), (0.1 if i % 2 else 0.065, 0, 0)], IRON, 3, (0.123 * math.cos(a), 0.012 + 0.134 * math.sin(a), 0.283), caps='')
t.box((0.03, 0.012, 0.03), (0, -0.126, 0.268), RUNE, rot=(0, PI / 4, 0))
t.done()

# ---- weapons: grip at the origin, business end toward -Y ----
B('wStake').loft([(-0.1, 0.022, 0.022), (0.0, 0.03, 0.03), (0.2, 0.03, 0.03), (0.35, 0, 0)], WOOD_L, 5, rot=FWD, caps='b').done()
t = B('wDagger')
t.loft([(-0.09, 0.02, 0.02), (0.045, 0.017, 0.017)], LEATHER, 6, rot=FWD)
t.box((0.04, 0.035, 0.04), (0, 0.1, 0), IRON).box((0.12, 0.028, 0.032), (0, -0.055, 0), IRON)
t.loft([(0.065, 0.03, 0.01), (0.24, 0.022, 0.008), (0.31, 0, 0)], STEEL, 4, rot=FWD, phase=0, caps='')
t.done()
B('wBat').loft([(-0.13, 0.02, 0.02), (-0.115, 0.03, 0.03), (-0.09, 0.018, 0.018), (0.2, 0.02, 0.02), (0.5, 0.038, 0.038),
                (0.69, 0.04, 0.04), (0.72, 0.025, 0.025)], WOOD_L, 6, rot=FWD).done()
t = B('wSword')
t.loft([(-0.15, 0.018, 0.018), (0.0, 0.016, 0.016)], LEATHER, 6, rot=FWD, caps='')
t.box((0.05, 0.045, 0.05), (0, 0.17, 0), IRON, rot=(0, PI / 4, 0)).box((0.27, 0.04, 0.036), (0, -0.015, 0), IRON)
t.loft([(0.03, 0.046, 0.013), (0.7, 0.036, 0.01), (0.88, 0, 0)], STEEL, 4, rot=FWD, phase=0, caps='')
t.done()
t = B('wAxe')
t.loft([(-0.3, 0.024, 0.024), (0.8, 0.02, 0.02)], WOOD, 6, rot=FWD)
t.prism([(-0.075, -0.64), (-0.075, -0.73), (0.05, -0.745), (0.2, -0.86), (0.27, -0.69), (0.2, -0.52), (0.05, -0.625)], 0.05, STEEL, 'z', (0, 0, -0.025))
t.box((0.07, 0.13, 0.066), (0, -0.685, 0), IRON)
t.done()
t = B('wGreat')
t.loft([(-0.34, 0.022, 0.022), (0.0, 0.02, 0.02)], LEATHER, 6, rot=FWD, caps='')
t.box((0.065, 0.06, 0.065), (0, 0.36, 0), IRON, rot=(0, PI / 4, 0)).box((0.44, 0.05, 0.045), (0, -0.02, 0), IRON)
for sx in (-1, 1):
    t.box((0.05, 0.09, 0.04), (sx * 0.2, -0.05, 0), IRON)
t.loft([(0.045, 0.085, 0.017), (0.95, 0.075, 0.015), (1.24, 0, 0)], STEEL, 4, rot=FWD, phase=0, caps='')
t.box((0.03, 0.7, 0.04), (0, -0.42, 0), IRON)
t.done()
t = B('wStaff')
t.tube([(0, 0.5, 0), (0.012, 0.1, 0.01), (-0.016, -0.4, -0.012), (0.012, -0.8, 0.014), (0, -1.03, 0)], [0.02, 0.026, 0.024, 0.029, 0.036], WOOD, 5)
for i in range(3):
    a = PI / 2 + i * 2 * PI / 3
    ux, uz = math.cos(a), math.sin(a)
    t.tube([(ux * 0.025, -1.0, uz * 0.025), (ux * 0.085, -1.08, uz * 0.085), (ux * 0.05, -1.18, uz * 0.05)], [0.016, 0.014, 0], WOOD, 3, caps='')
t.loft([(1.04, 0, 0), (1.1, 0.05, 0.05), (1.2, 0, 0)], RUNE, 5, rot=FWD)
t.done()
t = B('wClaws')
t.box((0.12, 0.035, 0.045), (0, -0.045, 0), IRON).box((0.11, 0.09, 0.016), (0, -0.01, 0.036), LEATHER)
for i in (-1, 0, 1):
    t.loft([(0.03, 0.011, 0.017, i * 0.042, 0.035), (0.2, 0.009, 0.014, i * 0.042, 0.03), (0.29, 0, 0, i * 0.042, 0.0)], STEEL, 4, rot=FWD, phase=0, caps='b')
t.done()
t = B('crossbow')
t.loft([(-0.2, 0.03, 0.045, 0, -0.015), (-0.05, 0.022, 0.03), (0.4, 0.022, 0.025)], WOOD, 4, rot=FWD)
t.tube([(-0.3, -0.23, 0.02), (-0.17, -0.335, 0.02), (0, -0.365, 0.02), (0.17, -0.335, 0.02), (0.3, -0.23, 0.02)], [0.012, 0.016, 0.02, 0.016, 0.012], IRON, 4)
t.tube([(-0.3, -0.23, 0.02), (0, -0.05, 0.034), (0.3, -0.23, 0.02)], [0.005, 0.005, 0.005], TRIM, 3, caps='')
t.loft([(0.05, 0.008, 0.008, 0, 0.036), (0.38, 0.008, 0.008, 0, 0.036), (0.44, 0, 0, 0, 0.036)], STEEL, 4, rot=FWD, caps='b')
t.box((0.02, 0.03, 0.06), (0, 0.02, -0.06), IRON)
t.done()
t = B('revolver')
t.loft([(0.03, 0.013, 0.013, 0, 0.036), (0.2, 0.012, 0.012, 0, 0.036)], IRON, 6, rot=FWD)
t.loft([(-0.012, 0.025, 0.025, 0, 0.03), (0.045, 0.025, 0.025, 0, 0.03)], STEEL, 6, rot=FWD)
t.box((0.02, 0.1, 0.045), (0, -0.02, 0.022), IRON)
t.box((0.028, 0.045, 0.1), (0, 0.05, -0.03), WOOD, rot=(-0.4, 0, 0), top=(0.9, 0.9))
t.box((0.01, 0.02, 0.03), (0, 0.032, 0.062), IRON, rot=(-0.5, 0, 0))
t.done()

# ======================================================================================================
# BUILDING KIT. Footprints are W (x) by D (y) centred on the origin, door on the front (-Y).
# Roof overhangs, awnings and porches stay inside the footprint unless the model says otherwise.
# ======================================================================================================
_ROT = {'f': 0.0, 'r': PI / 2, 'k': PI, 'l': -PI / 2}


def _wall(b, face):
    """Maps a 'front wall' frame (wall plane at y = -plane facing -Y, +X along the wall) onto wall f / k / l / r."""
    return b.at(rot=(0, 0, _ROT[face]))


def _al(face, pos):
    return -pos if face in 'kl' else pos


def _rect(a, y, z0, z1, w):
    return [(a - w / 2, y, z0), (a + w / 2, y, z0), (a + w / 2, y, z1), (a - w / 2, y, z1)]


def _lancet(a, y, z0, z1, w, e=0.0):
    sh = z1 - w * 0.6
    return [(a - w / 2 - e, y, z0 - e), (a + w / 2 + e, y, z0 - e), (a + w / 2 + e, y, sh + e * 0.5), (a, y, z1 + e * 1.7), (a - w / 2 - e, y, sh + e * 0.5)]


def win(b, pos, z, w, h, face='f', plane=0.0, lit=True, frame=TRIM, mull=True, sill=None, pointed=False, shut=None):
    """Window centred at height z on a wall. pos = world coordinate along the wall (x for f/k walls, y for l/r);
    plane = distance of the wall face from the origin along its outward direction."""
    g = lit if not isinstance(lit, bool) else (GLOW if lit else DARKWIN)
    a = _al(face, pos)
    with _wall(b, face):
        y = -plane
        if pointed:
            if frame:
                b.poly(_lancet(a, y - 0.03, z - h / 2, z + h / 2, w, 0.1), frame)
            b.poly(_lancet(a, y - 0.06, z - h / 2, z + h / 2, w), g)
        else:
            yq = y - 0.03
            if frame:
                b.box((w + 0.2, 0.08, h + 0.2), (a, y - 0.03, z), frame, skip='k')
                yq = y - 0.085
            b.poly(_rect(a, yq, z - h / 2, z + h / 2, w), g)
            mm = frame if mull is True else mull
            if mm:
                b.poly(_rect(a, yq - 0.012, z - h / 2, z + h / 2, 0.06), mm)
                b.poly(_rect(a, yq - 0.012, z + h * 0.14 - 0.03, z + h * 0.14 + 0.03, w), mm)
        if sill:
            b.box((w + 0.36, 0.18, 0.08), (a, y - 0.09, z - h / 2 - 0.14), sill, skip='k')
        if shut:
            for sx in (-1, 1):
                b.poly(_rect(a + sx * (w * 0.72 + (0.1 if frame else 0.01)), y - 0.03, z - h / 2 - 0.05, z + h / 2 + 0.05, w * 0.44), shut)


def door(b, pos, w, h, face='f', plane=0.0, m=DOOR, frame=TRIM, z0=0.0, pointed=False, split=None):
    a = _al(face, pos)
    with _wall(b, face):
        y = -plane
        if pointed:
            if frame:
                b.prism([(p[0], p[2]) for p in _lancet(a, 0, z0, z0 + h, w, 0.18)], 0.16, frame, 'y', (0, y - 0.04, 0), caps=(False, True))
            b.poly(_lancet(a, y - 0.14, z0, z0 + h, w), m)
        else:
            if frame:
                b.box((w + 0.3, 0.12, h + 0.15), (a, y - 0.04, z0 + (h + 0.15) / 2), frame, skip='kb')
            b.poly(_rect(a, y - (0.115 if frame else 0.03), z0, z0 + h, w), m)
        if split:
            b.poly(_rect(a, y - 0.155, z0, z0 + h * (0.8 if pointed else 1), 0.06), split)


def disc(b, pos, z, r, face, plane, m, seg=8, off=0.03):
    a = _al(face, pos)
    with _wall(b, face):
        b.poly([(a + r * math.cos(PI / seg + i * 2 * PI / seg), -plane - off, z + r * math.sin(PI / seg + i * 2 * PI / seg)) for i in range(seg)], m)


def strip(b, p0, z0, p1, z1, wd, face, plane, m, off=0.03):
    """Flat board on a wall from (p0, z0) to (p1, z1) (timber framing, door braces, corner boards)."""
    a0, a1 = _al(face, p0), _al(face, p1)
    dx, dz = a1 - a0, z1 - z0
    ln = math.hypot(dx, dz)
    nx, nz = -dz / ln * wd / 2, dx / ln * wd / 2
    with _wall(b, face):
        y = -plane - off
        b.poly([(a0 - nx, y, z0 - nz), (a1 - nx, y, z1 - nz), (a1 + nx, y, z1 + nz), (a0 + nx, y, z0 + nz)], m)


def chimney(b, x, y, z0, z1, m, w=0.62, d=0.62, cap=None, pot=None):
    b.box((w, d, z1 - z0), (x, y, (z0 + z1) / 2), m, skip='bt')
    b.box((w + 0.16, d + 0.16, 0.14), (x, y, z1 + 0.07), cap or m)
    if pot:
        b.box((w - 0.26, d - 0.26, 0.14), (x, y, z1 + 0.21), pot, skip='b')


def column(b, x, y, z0, z1, r, m, seg=6, base=True):
    if base:
        b.box((r * 2.7, r * 2.7, 0.16), (x, y, z0 + 0.08), m, skip='b')
    b.loft([(z0, r, r), (z1 - 0.18, r * 0.82, r * 0.82)], m, seg, (x, y, 0), caps='')
    b.box((r * 2.6, r * 2.6, 0.2), (x, y, z1 - 0.1), m, skip='t')


def awning(b, x0, x1, plane, ztop, depth, drop, m, stripe=None, n=4):
    """Sloped shop awning with a valance on the front wall; optional contrasting stripes."""
    yw, yf, zf = -plane, -plane - depth, ztop - drop
    b.prism([(yw, ztop + 0.04), (yf - 0.02, zf + 0.04), (yf - 0.02, zf - 0.24), (yf + 0.03, zf - 0.24), (yf + 0.03, zf - 0.05),
             (yw, ztop - 0.05)], x1 - x0, m, 'x', ((x0 + x1) / 2, 0, 0))
    if stripe:
        sw = (x1 - x0) / (2 * n + 1)
        for i in range(n):
            xa = x0 + sw * (2 * i + 1)
            b.poly([(xa, yf - 0.02, zf + 0.06), (xa + sw, yf - 0.02, zf + 0.06), (xa + sw, yw, ztop + 0.06), (xa, yw, ztop + 0.06)], stripe)
            b.poly(_rect(xa + sw / 2, yf - 0.035, zf - 0.24, zf + 0.04, sw), stripe)


def dormer(b, x, yf, zb, w, d, h, wallm, roofm, lit=True, frame=TRIM, rh=0.5, ext=0.7):
    """Roof dormer whose window faces the front: face at y = yf, sill line at zb, w x d x h body."""
    b.box((w, d, h), (x, yf + d / 2, zb + h / 2), wallm, skip='bkt')
    b.gable(d + ext, w, rh, zb + h, roofm, 0.12, 0.08, 'y', (x, yf + (d + ext) / 2), wall=wallm)
    win(b, x, zb + h * 0.55, w * 0.52, h * 0.58, 'f', -yf, lit, frame, mull=False)


# ---- houseA: 8 x 7 plaster cottage, timber framing, gabled entrance bay ----
b = B('houseA')
b.box((7.4, 5.6, 0.3), (0, 0.4, 0.15), STONE, skip='b')
b.box((7.2, 5.4, 2.8), (0, 0.4, 1.4), PLASTER, skip='bt')
b.gable(7.2, 5.4, 2.5, 2.8, SLATE, 0.4, loc=(0, 0.4), wall=PLASTER)
b.box((2.6, 1.2, 2.8), (-1.6, -2.6, 1.4), PLASTER, skip='btk')
b.box((2.8, 1.0, 0.3), (-1.6, -2.75, 0.15), STONE, skip='bk')
b.gable(3.6, 2.6, 1.5, 2.8, SLATE, 0.25, axis='y', loc=(-1.6, -1.4), wall=PLASTER)
door(b, -1.6, 0.95, 2.05, 'f', 3.2, WOOD, WOOD, z0=0.3)
b.box((1.5, 0.28, 0.16), (-1.6, -3.36, 0.08), STONE, skip='b')
win(b, -1.6, 3.35, 0.5, 0.55, 'f', 3.2, True, WOOD, mull=False)
win(b, 1.0, 1.6, 0.9, 1.1, 'f', 2.3, True, WOOD, sill=WOOD)
win(b, 2.75, 1.6, 0.9, 1.1, 'f', 2.3, False, WOOD, sill=WOOD)
win(b, 1.7, 1.6, 0.9, 1.1, 'r', 3.6, False, WOOD)
win(b, -0.9, 1.6, 0.9, 1.1, 'l', 3.6, True, WOOD)
win(b, 0.4, 3.75, 0.6, 0.7, 'r', 3.6, True, WOOD, mull=False)
win(b, 0.4, 3.75, 0.6, 0.7, 'l', 3.6, False, WOOD, mull=False)
win(b, 1.5, 1.6, 0.9, 1.1, 'k', 3.1, False, None, mull=False)
for p0, z0, p1, z1 in ((-0.2, 0.3, -0.2, 2.8), (1.87, 0.3, 1.87, 2.8), (3.52, 0.3, 3.52, 2.8), (-3.52, 0.3, -3.52, 2.8), (-0.3, 2.7, 3.6, 2.7),
                       (-0.3, 0.42, 3.6, 0.42), (-3.6, 2.7, -2.9, 2.7)):
    strip(b, p0, z0, p1, z1, 0.16, 'f', 2.3, WOOD)
for p0, z0, p1, z1 in ((-2.82, 0.3, -2.82, 2.8), (-0.38, 0.3, -0.38, 2.8), (-2.9, 2.72, -0.3, 2.72), (-2.75, 2.85, -1.6, 4.1), (-0.45, 2.85, -1.6, 4.1)):
    strip(b, p0, z0, p1, z1, 0.16, 'f', 3.2, WOOD)
for f in 'lr':
    for p0, z0, p1, z1 in ((-2.22, 0.3, -2.22, 2.8), (0.4, 0.3, 0.4, 2.8), (3.02, 0.3, 3.02, 2.8), (-2.3, 2.8, 3.1, 2.8), (-0.75, 2.8, -0.75, 4.15),
                           (1.55, 2.8, 1.55, 4.15), (-2.3, 0.42, 3.1, 0.42)):
        strip(b, p0, z0, p1, z1, 0.16, f, 3.6, WOOD)
chimney(b, 2.5, 1.5, 3.8, 6.1, STONE, 0.7, 0.7, pot=SLATE)
b.done()

# ---- houseB: 9 x 7 brick house, hipped roof, bay window, dormers, door hood ----
b = B('houseB')
b.box((8.4, 6.1, 0.35), (0, 0.2, 0.175), SLATE, skip='b')
b.box((8.2, 5.9, 3.3), (0, 0.2, 1.65), BRICK, skip='bt')
b.box((8.32, 6.02, 0.2), (0, 0.2, 3.12), TRIM, skip='bt')
b.hip(8.2, 5.9, 2.2, 3.3, SLATE, 0.35, loc=(0, 0.2))
b.box((2.0, 0.6, 2.2), (-2.3, -3.05, 1.5), BRICK, skip='kt')
b.hip(2.0, 0.6, 0.4, 2.6, SLATE, 0.1, loc=(-2.3, -3.05), drop=0.0)
win(b, -2.3, 1.6, 1.5, 1.2, 'f', 3.35, True, TRIM)
door(b, 1.0, 1.0, 2.1, 'f', 2.75, DOOR, TRIM, z0=0.35)
win(b, 1.0, 2.72, 1.0, 0.24, 'f', 2.75, True, TRIM, mull=False)
b.gable(0.6, 1.7, 0.45, 2.95, SLATE, 0.1, 0.08, 'y', (1.0, -3.05), wall=TRIM)
for sx in (-1, 1):
    b.box((0.1, 0.1, 2.6), (1.0 + sx * 0.75, -3.28, 1.65), TRIM, skip='bt')
b.box((1.9, 0.7, 0.35), (1.0, -3.1, 0.175), TRIM, skip='bk')
win(b, -0.4, 1.75, 0.8, 1.3, 'f', 2.75, False, TRIM, sill=TRIM)
win(b, 3.1, 1.75, 0.9, 1.3, 'f', 2.75, True, TRIM, sill=TRIM)
for f, pos, lit in (('l', -1.2, False), ('l', 1.6, True), ('r', -1.2, True), ('r', 1.6, False)):
    win(b, pos, 1.75, 0.9, 1.3, f, 4.1, lit, TRIM, sill=TRIM)
for x in (-2.2, 2.2):
    win(b, x, 1.75, 0.9, 1.3, 'k', 3.15, False, None, mull=False)
dormer(b, -1.9, -2.3, 3.6, 1.3, 1.3, 1.0, TRIM, SLATE, True, TRIM, 0.45)
dormer(b, 1.9, -2.3, 3.6, 1.3, 1.3, 1.0, TRIM, SLATE, False, TRIM, 0.45)
chimney(b, -3.2, 0.2, 3.4, 6.3, BRICK, pot=SLATE)
chimney(b, 3.2, 0.2, 3.4, 6.3, BRICK, pot=SLATE)
b.done()

# ---- houseC: 10 x 8 two-storey white colonial, full-height porch columns inside the footprint ----
b = B('houseC')
b.box((9.4, 5.9, 0.3), (0, 0.75, 0.15), BRICK, skip='b')
b.box((9.4, 1.95, 0.3), (0, -2.93, 0.15), BRICK, skip='bk')
b.box((2.6, 0.3, 0.15), (0, -3.85, 0.075), BRICK, skip='bk')
b.box((9.2, 5.7, 5.6), (0, 0.75, 2.8), TRIM, skip='bt')
b.gable(9.2, 7.2, 2.4, 5.6, SLATE, 0.4, loc=(0, 0), wall=TRIM)
b.box((9.2, 1.7, 0.45), (0, -2.85, 5.275), TRIM, skip='kt')
for x in (-4.1, -1.4, 1.4, 4.1):
    column(b, x, -3.3, 0.3, 5.05, 0.23, TRIM)
door(b, 0, 1.15, 2.25, 'f', 2.1, DOOR, None, z0=0.3)
win(b, 0, 2.82, 1.15, 0.36, 'f', 2.1, True, None, mull=False)
for i, x in enumerate((-3.3, -1.75, 1.75, 3.3)):
    win(b, x, 1.85, 0.85, 1.35, 'f', 2.1, i in (0, 3), None, mull=TRIM, shut=DOOR)
for i, x in enumerate((-3.3, -1.75, 0, 1.75, 3.3)):
    win(b, x, 4.3, 0.85, 1.25, 'f', 2.1, i in (1, 2), None, mull=TRIM, shut=DOOR)
for f in 'lr':
    for i, (pos, z) in enumerate(((-0.6, 1.85), (2.3, 1.85), (-0.6, 4.3), (2.3, 4.3))):
        win(b, pos, z, 0.85, 1.3, f, 4.6, (i == 1) == (f == 'l'), None, mull=TRIM, shut=DOOR)
    win(b, 0, 6.5, 0.7, 0.7, f, 4.6, False, None, mull=TRIM)
for x in (-2.8, 0, 2.8):
    win(b, x, 4.3, 0.85, 1.25, 'k', 3.6, x == 0, None, mull=False)
chimney(b, -3.9, 0.6, 5.8, 9.0, BRICK, 0.7, 0.9, pot=SLATE)
chimney(b, 3.9, 0.6, 5.8, 9.0, BRICK, 0.7, 0.9, pot=SLATE)
b.done()

# ---- shop: 9 x 7 apothecary, stepped false front, lit shopfront under a striped awning ----
b = B('shop')
b.box((8.6, 5.7, 0.25), (0, 0.45, 0.125), SLATE, skip='b')
b.box((8.4, 5.5, 5.6), (0, 0.45, 2.8), SHOPWALL, skip='bt')
b.gable(5.3, 8.4, 2.1, 5.6, SLATE, 0.3, axis='y', loc=(0, 0.55), wall=SHOPWALL)
for w, z0, z1 in ((8.4, 5.6, 6.3), (5.6, 6.3, 7.1), (2.8, 7.1, 7.9)):
    b.box((w, 0.3, z1 - z0), (0, -2.15, (z0 + z1) / 2), SHOPWALL, skip='b' if w < 8 else 'bt')
for x, w, z in ((-3.5, 1.5, 6.35), (3.5, 1.5, 6.35), (-2.1, 1.5, 7.15), (2.1, 1.5, 7.15), (0, 3.0, 7.95)):
    b.box((w, 0.44, 0.1), (x, -2.15, z), TRIM, skip='b')
disc(b, 0, 7.05, 0.42, 'f', 2.3, TRIM, 8, 0.03)
disc(b, 0, 7.05, 0.32, 'f', 2.3, GLOW, 8, 0.06)
for x in (-2.5, 2.5):
    win(b, x, 1.6, 2.5, 1.9, 'f', 2.3, True, TRIM, sill=TRIM)
door(b, 0, 1.1, 2.2, 'f', 2.3, AWN, TRIM, z0=0.25)
win(b, 0, 2.72, 1.1, 0.32, 'f', 2.3, True, TRIM, mull=False)
awning(b, -4.15, 4.15, 2.3, 3.45, 1.1, 0.6, AWN, TRIM, 4)
b.box((4.6, 0.08, 0.55), (0, -2.34, 3.95), TRIM, skip='k')
b.poly(_rect(0, -2.39, 3.8, 4.1, 4.2), AWN)
for x, lit in ((-2.6, True), (0, False), (2.6, True)):
    win(b, x, 4.95, 0.9, 1.1, 'f', 2.3, lit, TRIM, sill=TRIM)
win(b, 0.5, 4.7, 0.9, 1.2, 'r', 4.2, False, TRIM)
win(b, 0.5, 4.7, 0.9, 1.2, 'l', 4.2, True, TRIM)
win(b, 0.5, 1.8, 0.9, 1.2, 'r', 4.2, False, TRIM)
win(b, -2, 4.7, 0.9, 1.2, 'k', 3.2, False, None, mull=False)
b.box((0.06, 0.9, 0.06), (3.75, -2.75, 5.2), SLATE)
b.box((0.07, 0.62, 0.55), (3.75, -2.8, 4.86), AWN)
b.zc(0.14, 0.14, 6.4, 8.2, SLATE, 2.6, 1.9, 6, caps='')
b.zc(0.22, 0.22, 8.2, 8.3, SLATE, 2.6, 1.9, 6)
b.done()

# ---- grill: 12 x 8 brick tavern, awning along the front, sign board on the roof ----
b = B('grill')
b.box((11.3, 6.6, 0.4), (0, 0.35, 0.2), WOOD, skip='b')
b.box((11.2, 6.5, 3.6), (0, 0.35, 1.8), BRICK, skip='bt')
b.gable(11.2, 6.5, 2.0, 3.6, ROOF_RED, 0.4, loc=(0, 0.35), wall=BRICK)
awning(b, -5.3, 5.3, 2.9, 3.05, 1.05, 0.5, AWN, TRIM, 5)
door(b, 0, 1.8, 2.3, 'f', 2.9, WOOD, TRIM, z0=0.1, split=TRIM)
for x in (-3.5, 3.5):
    win(b, x, 1.6, 2.6, 1.5, 'f', 2.9, True, TRIM, sill=TRIM)
for x in (-1.45, 1.45):
    win(b, x, 1.75, 0.45, 0.9, 'f', 2.9, True, TRIM, mull=False)
win(b, -0.5, 1.8, 1.4, 1.2, 'r', 5.6, True, TRIM, sill=TRIM)
win(b, 1.2, 1.8, 1.4, 1.2, 'l', 5.6, True, TRIM, sill=TRIM)
door(b, -1.4, 0.9, 2.1, 'l', 5.6, WOOD, TRIM, z0=0.1)
for x in (-3, 3):
    win(b, x, 2.0, 1.0, 0.8, 'k', 3.6, True, None, mull=False)
for x in (-2.3, 2.3):
    b.box((0.14, 0.14, 1.0), (x, -2.2, 4.4), WOOD, skip='bt')
b.box((5.4, 0.16, 1.15), (0, -2.25, 5.3), WOOD)
b.poly(_rect(0, -2.345, 4.9, 5.7, 5.0), TRIM)
for i in range(5):
    b.poly(_rect(-1.8 + i * 0.9, -2.36, 5.05, 5.55, 0.55 if i != 2 else 0.2), AWN)
for x in (-1.7, 1.7):
    b.box((0.3, 0.3, 0.14), (x, -2.55, 5.98), GLOW, top=(0.5, 0.5))
    b.box((0.05, 0.3, 0.05), (x, -2.4, 6.0), WOOD)
chimney(b, 4.3, 1.7, 3.6, 6.9, BRICK, 1.0, 0.8, cap=TRIM, pot=WOOD)
b.box((0.7, 0.7, 0.5), (-3.2, 0.35, 5.75), TRIM, skip='b')
b.loft([(6.0, 0.48, 0.48), (6.4, 0, 0)], ROOF_RED, 4, (-3.2, 0.35, 0))
b.done()

# ---- hall: 14 x 9 council hall, six-column portico with pediment, steps reach 2 m past the footprint ----
b = B('hall')
b.box((13.4, 6.7, 0.9), (0, 0.85, 0.45), STONE, skip='b')
b.box((13.2, 6.5, 6.2), (0, 0.85, 3.1), PLASTER, skip='bt')
b.box((13.5, 6.8, 0.4), (0, 0.85, 6.0), TRIM, skip='bt')
b.hip(13.2, 6.5, 2.4, 6.2, SLATE, 0.4, loc=(0, 0.85))
b.box((8.8, 1.9, 0.9), (0, -3.35, 0.45), STONE, skip='bk')
for i in range(4):
    b.box((7.4, 2.0 - i * 0.5, 0.225), (0, -5.3 + i * 0.25, 0.1125 + i * 0.225), STONE, skip='bk')
for sx in (-1, 1):
    b.box((0.7, 2.1, 1.1), (sx * 4.05, -5.3, 0.55), STONE, skip='bk', top=(1, 0.4, 0, 0.6))
for i in range(6):
    column(b, -3.75 + i * 1.5, -3.95, 0.9, 5.5, 0.3, TRIM, base=False)
b.box((8.8, 1.9, 0.7), (0, -3.35, 5.85), TRIM, skip='kt')
b.gable(4.3, 8.8, 1.6, 6.2, SLATE, 0.15, 0.14, 'y', (0, -2.15), wall=TRIM)
disc(b, 0, 6.85, 0.42, 'f', 4.3, GLOW, 8, 0.03)
door(b, 0, 1.9, 3.0, 'f', 2.4, DOOR, TRIM, z0=0.9, split=TRIM)
win(b, 0, 4.35, 1.9, 0.55, 'f', 2.4, True, TRIM, mull=False)
for x in (-5.5, -2.5, 2.5, 5.5):
    win(b, x, 3.3, 1.0, 2.6, 'f', 2.4, True, TRIM, sill=TRIM)
for f in 'lr':
    for pos in (-0.7, 2.4):
        win(b, pos, 3.3, 1.0, 2.6, f, 6.6, GLOW if pos > 0 else DOOR, TRIM, sill=TRIM)
for x in (-4.6, -1.5, 1.5, 4.6):
    win(b, x, 3.3, 1.0, 2.6, 'k', 4.1, GLOW if abs(x) < 2 else DOOR, None, mull=False)
b.loft([(8.0, 0.95, 0.95), (9.3, 0.95, 0.95)], TRIM, 8, (0, 0.85, 0), caps='')
for f, pl, pos in (('f', 0.028, 0), ('k', 1.728, 0), ('r', 0.878, 0.85), ('l', 0.878, 0.85)):
    strip(b, pos, 8.35, pos, 9.0, 0.45, f, pl, DOOR)
b.loft([(9.3, 1.25, 1.25), (9.45, 1.25, 1.25), (10.5, 0, 0)], SLATE, 8, (0, 0.85, 0))
b.zc(0.05, 0, 10.4, 11.2, DOOR, 0, 0.85, 4, caps='')
b.done()

# ---- tower: 4.2 x 4.2 clock tower, 15 m, four lit faces ----
b = B('tower')
b.box((4.2, 4.2, 0.6), (0, 0, 0.3), TRIM, skip='b', top=(0.92, 0.92))
b.box((3.3, 3.3, 8.0), (0, 0, 4.5), BRICK, skip='bt')
for sx in (-1, 1):
    for sy in (-1, 1):
        b.box((0.5, 0.5, 7.9), (sx * 1.5, sy * 1.5, 4.45), TRIM, skip='bt')
b.box((3.55, 3.55, 0.22), (0, 0, 4.6), TRIM, skip='bt')
b.box((4.0, 4.0, 0.3), (0, 0, 8.55), TRIM)
b.box((3.7, 3.7, 2.4), (0, 0, 9.9), BRICK, skip='bt')
b.box((4.2, 4.2, 0.3), (0, 0, 11.25), TRIM)
b.loft([(11.4, 2.0, 2.0), (14.6, 0, 0)], SLATE, 4)
b.zc(0.07, 0, 14.35, 15.0, DOOR, seg=4, caps='')
b.box((0.26, 0.26, 0.26), (0, 0, 14.5), DOOR, rot=(0, 0, PI / 4))
for f in 'frkl':
    disc(b, 0, 9.9, 1.2, f, 1.85, TRIM, 12, 0.03)
    disc(b, 0, 9.9, 1.04, f, 1.85, GLOW, 12, 0.06)
    strip(b, 0, 9.9, 0.0, 10.75, 0.12, f, 1.85, DOOR, 0.09)
    strip(b, 0, 9.9, 0.55, 9.58, 0.14, f, 1.85, DOOR, 0.09)
door(b, 0, 1.1, 2.4, 'f', 1.65, DOOR, TRIM, z0=0.6, pointed=True)
win(b, 0, 5.6, 0.5, 1.3, 'f', 1.65, True, TRIM, pointed=True)
win(b, 0, 7.3, 0.5, 1.3, 'f', 1.65, False, TRIM, pointed=True)
win(b, 0, 3.3, 0.5, 1.3, 'r', 1.65, False, TRIM, pointed=True)
win(b, 0, 6.5, 0.5, 1.3, 'r', 1.65, True, TRIM, pointed=True)
win(b, 0, 3.3, 0.5, 1.3, 'l', 1.65, True, TRIM, pointed=True)
win(b, 0, 6.5, 0.5, 1.3, 'l', 1.65, False, TRIM, pointed=True)
b.done()

# ---- boarding: 14 x 10 three-storey boarding house, twin front gables, porch reaches 2 m past the footprint ----
b = B('boarding')
b.box((13.2, 9.2, 8.4), (0, 0, 4.2), CLAP, skip='bt')
b.gable(13.2, 9.2, 3.0, 8.4, SLATE, 0.4, loc=(0, 0), wall=CLAP)
b.box((13.32, 9.32, 0.14), (0, 0, 5.95), TRIM, skip='bt')
b.box((13.32, 9.32, 0.14), (0, 0, 3.15), TRIM, skip='bt')
for sx in (-1, 1):
    b.box((3.4, 0.5, 8.4), (sx * 3.6, -4.55, 4.2), CLAP, skip='btk')
    b.gable(5.0, 3.4, 1.7, 8.4, SLATE, 0.2, 0.12, 'y', (sx * 3.6, -2.3), wall=CLAP)
    win(b, sx * 3.6, 9.05, 0.7, 1.0, 'f', 4.8, sx > 0, TRIM, pointed=True)
    for sy in (-1, 1):
        b.box((0.18, 0.18, 8.4), (sx * 6.6, sy * 4.6, 4.2), TRIM, skip='bt')
    chimney(b, sx * 4.6, 1.6, 9.3, 12.5, WOOD, 0.8, 0.8, pot=SLATE)
    win(b, 0, 9.5, 0.8, 1.1, 'r' if sx > 0 else 'l', 6.6, sx < 0, TRIM, pointed=True)
lit = (1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0)
k = 0
for z in (1.95, 4.6, 7.25):
    for x in (-4.3, -2.9, 2.9, 4.3):
        win(b, x, z, 0.8, 1.3, 'f', 4.8, bool(lit[k]), TRIM, mull=False); k += 1
    for x in ((-1.3, 1.3) if z < 3 else (-0.95, 0.95)):
        win(b, x, z, 0.8, 1.3, 'f', 4.6, bool(lit[k]), TRIM, mull=False); k += 1
    for f in 'lr':
        for pos in (-2.0, 2.0):
            win(b, pos, z, 0.8, 1.3, f, 6.6, bool(lit[k]), TRIM, mull=False); k += 1
    for x in (-4.5, -1.5, 1.5, 4.5):
        win(b, x, z, 0.8, 1.3, 'k', 4.6, x == 1.5 and z > 3, None, mull=False)
door(b, 0, 1.1, 2.2, 'f', 4.6, WOOD, TRIM, z0=0.45)
# porch: floor, posts, rails, shed roof, steps (beyond the footprint)
b.box((12.4, 1.85, 0.45), (0, -5.5, 0.225), WOOD, skip='bk')
for i in range(6):
    x = -6.0 + i * 2.4
    b.box((0.18, 0.18, 2.8), (x, -6.25, 1.85), TRIM, skip='bt')
    if i < 5 and i != 2:
        b.box((2.22, 0.07, 0.09), (x + 1.2, -6.25, 1.3), TRIM, skip='lr')
        b.box((2.22, 0.05, 0.5), (x + 1.2, -6.25, 0.85), TRIM, skip='lrtb')
b.box((12.5, 0.14, 0.2), (0, -6.25, 3.2), TRIM)
b.prism([(-4.6, 3.95), (-6.6, 3.42), (-6.6, 3.28), (-4.6, 3.8)], 12.8, SLATE, 'x')
for i in range(2):
    b.box((2.4, 0.55 - i * 0.27, 0.15), (0, -6.7 + i * 0.135, 0.075 + i * 0.15), WOOD, skip='bk')
b.done()

# ---- manor: 24 x 14 gothic mansion, two corner towers with pointed roofs, gabled entrance, lancet windows ----
b = B('manor')
b.box((20.2, 10.1, 0.6), (0, 1.65, 0.3), STONE_D, skip='b')
b.box((20.0, 9.9, 6.6), (0, 1.65, 3.3), STONE, skip='bt')
b.box((20.14, 10.04, 0.3), (0, 1.65, 6.35), STONE_D, skip='bt')
b.gable(20.0, 9.9, 3.6, 6.6, SLATE, 0.4, 0.16, loc=(0, 1.65), wall=STONE)
for sx in (-1, 1):
    tx = sx * 10.0
    b.box((3.9, 3.9, 0.6), (tx, -4.7, 0.3), STONE_D, skip='b')
    b.box((3.7, 3.7, 9.0), (tx, -4.7, 4.5), STONE, skip='bt')
    b.box((3.95, 3.95, 0.35), (tx, -4.7, 8.85), STONE_D)
    b.loft([(9.0, 2.0, 2.0), (13.6, 0, 0)], SLATE, 4, (tx, -4.7, 0), caps='')
    b.zc(0.07, 0, 13.4, 14.2, STONE_D, tx, -4.7, 4, caps='')
    for i, z in enumerate((2.3, 5.0, 7.5)):
        win(b, tx, z, 0.7, 1.7, 'f', 6.55, i == 2 or (i == 0 and sx > 0), STONE_D, pointed=True)
        win(b, -4.7, z, 0.7, 1.7, 'r' if sx > 0 else 'l', 11.85, i == 1 and sx < 0, STONE_D, pointed=True)
    for i, x in enumerate((4.2, 6.5)):
        win(b, sx * x, 2.5, 0.9, 2.1, 'f', 3.3, (i == 0) == (sx > 0), STONE_D, pointed=True)
        win(b, sx * x, 5.1, 0.9, 1.8, 'f', 3.3, (i == 1) == (sx > 0), STONE_D, pointed=True)
    for i, pos in enumerate((0.4, 3.6)):
        win(b, pos, 2.5, 0.9, 2.1, 'r' if sx > 0 else 'l', 10.0, i == 0 and sx > 0, STONE_D, pointed=True)
        win(b, pos, 5.1, 0.9, 1.8, 'r' if sx > 0 else 'l', 10.0, i == 1 and sx < 0, STONE_D, pointed=True)
    dormer(b, sx * 5.4, -2.9, 6.8, 1.5, 1.7, 1.3, STONE, SLATE, sx < 0, STONE_D, 0.7, 1.0)
    chimney(b, sx * 6.5, 1.65, 9.4, 12.0, STONE_D, 0.9, 0.9, cap=STONE)
    chimney(b, sx * 9.0, 4.2, 7.9, 11.0, STONE_D, 0.8, 0.8, cap=STONE)
    b.box((0.3, 0.3, 0.45), (sx * 1.75, -5.52, 2.7), GLOW, top=(0.6, 0.6))
for x in (-7.5, -4.5, -1.5, 1.5, 4.5, 7.5):
    win(b, x, 2.5, 0.9, 2.1, 'k', 6.6, False, None, pointed=True)
    win(b, x, 5.1, 0.9, 1.8, 'k', 6.6, x == 4.5, None, pointed=True)
# entrance bay with steps, grand door and rose window
b.box((5.2, 2.4, 7.0), (0, -4.2, 3.5), STONE, skip='btk')
b.gable(6.3, 5.2, 2.6, 7.0, SLATE, 0.25, 0.16, 'y', (0, -2.25), wall=STONE)
for i in range(3):
    b.box((4.6 - i * 0.6, 1.5 - i * 0.5, 0.2), (0, -6.15 + i * 0.25, 0.1 + i * 0.2), STONE_D, skip='bk')
door(b, 0, 2.2, 3.6, 'f', 5.4, DOOR, STONE_D, z0=0.6, pointed=True, split=STONE_D)
disc(b, 0, 6.1, 0.95, 'f', 5.4, STONE_D, 8, 0.03)
disc(b, 0, 6.1, 0.75, 'f', 5.4, GLOW, 8, 0.06)
b.done()

# ---- church: 10 x 18 (long axis Y), bell tower and spire at the front, lancet windows, buttresses ----
b = B('church')
b.box((9.2, 12.4, 0.5), (0, 0.9, 0.25), STONE_D, skip='b')
b.box((9.0, 12.2, 5.2), (0, 0.9, 2.6), STONE, skip='bt')
b.gable(12.2, 9.0, 4.2, 5.2, SLATE, 0.4, 0.16, 'y', (0, 0.9), wall=STONE)
b.box((5.6, 1.6, 4.2), (0, 7.8, 2.1), STONE, skip='bft')
b.gable(2.2, 5.6, 2.8, 4.2, SLATE, 0.25, 0.14, 'y', (0, 7.6), wall=STONE)
win(b, 0, 2.6, 0.9, 2.2, 'k', 8.6, True, STONE_D, pointed=True)
b.box((4.2, 4.2, 10.5), (0, -6.7, 5.25), STONE, skip='bt')
b.box((4.4, 4.4, 0.5), (0, -6.7, 0.25), STONE_D, skip='b')
b.box((4.36, 4.36, 0.2), (0, -6.7, 7.3), STONE_D, skip='bt')
b.box((4.5, 4.5, 0.3), (0, -6.7, 10.4), STONE_D)
for sx in (-1, 1):
    b.box((0.6, 0.6, 6.6), (sx * 2.0, -8.7, 3.3), STONE_D, skip='b', top=(0.5, 0.5, -sx * 0.1, 0.1))
    win(b, sx * 3.3, 2.7, 0.5, 1.5, 'f', 5.2, False, STONE_D, pointed=True)
    win(b, -6.7, 4.6, 0.5, 1.6, 'r' if sx > 0 else 'l', 2.1, sx < 0, STONE_D, pointed=True)
    for i, y in enumerate((-3.2, -0.5, 2.2, 4.9)):
        win(b, y, 2.9, 0.9, 2.6, 'r' if sx > 0 else 'l', 4.5, (i % 2 == 0) == (sx > 0), STONE_D, pointed=True)
    for y in (-4.55, -1.85, 0.85, 3.55, 6.3):
        b.box((0.42, 0.45, 4.3), (sx * 4.69, y, 2.15), STONE_D, skip='b', top=(0.3, 1, -sx * 0.14, 0))
for f, pl in (('f', 8.8), ('k', -4.6), ('r', 2.1), ('l', 2.1)):
    win(b, 0 if f in 'fk' else -6.7, 8.9, 0.9, 1.9, f, pl, False, STONE_D, pointed=True)
b.loft([(10.55, 2.25, 2.25), (15.2, 0, 0)], SLATE, 8, (0, -6.7, 0), caps='')
b.box((0.1, 0.1, 0.95), (0, -6.7, 15.52), DOOR)
b.box((0.5, 0.1, 0.1), (0, -6.7, 15.65), DOOR)
door(b, 0, 1.5, 2.9, 'f', 8.8, DOOR, STONE_D, z0=0.25, pointed=True, split=STONE_D)
b.box((2.0, 0.18, 0.25), (0, -8.89, 0.125), STONE_D, skip='bk')
disc(b, 0, 5.4, 0.85, 'f', 8.8, STONE_D, 8, 0.03)
disc(b, 0, 5.4, 0.65, 'f', 8.8, GLOW, 8, 0.06)
b.done()

# ---- cabin: 6 x 5 log cabin with a stone chimney ----
b = B('cabin')
b.box((4.9, 3.9, 2.6), (0, 0, 1.3), WOOD, skip='bt')
for i in range(4):
    z = 0.3 + 0.58 * i
    for y in (-2.0, 2.0):
        b.loft([(-2.8, 0.3, 0.3), (2.8, 0.3, 0.3)], WOOD, 6, (0, y, z), (0, PI / 2, 0), phase=0, capm=WOOD_L)
    for x in (-2.5, 2.5):
        b.loft([(-2.3, 0.3, 0.3), (2.3, 0.3, 0.3)], WOOD, 6, (x, 0, z + 0.29), FWD, capm=WOOD_L)
b.gable(5.0, 4.0, 1.7, 2.6, BARK, 0.45, 0.14, loc=(0, 0), wall=WOOD)
door(b, -0.8, 0.95, 1.95, 'f', 2.26, WOOD_L, BARK)
win(b, 1.2, 1.45, 0.8, 0.8, 'f', 2.26, True, WOOD_L)
win(b, 0.3, 1.45, 0.8, 0.8, 'r', 2.76, True, WOOD_L)
b.loft([(0, 0.32, 0.5), (2.6, 0.26, 0.42), (4.7, 0.2, 0.3)], STONE, 4, (-2.66, 0.5, 0), caps='')
b.box((0.56, 0.76, 0.12), (-2.66, 0.5, 4.74), STONE)
for x0, x1, y0, y1 in ((0.6, 2.3, -2.3, -1.3), (-2.2, -1.2, -1.0, -0.2)):
    zf = lambda y: 2.6 + (y + 2.0) * 0.85 + 0.205
    b.poly([(x0, y0, zf(y0)), (x1, y0, zf(y0)), (x1 - 0.2, y1, zf(y1)), (x0 + 0.3, y1, zf(y1))], MOSS)
b.done()

# ---- barn: 10 x 8 red barn, gambrel roof ~7 m, big braced doors, hayloft, ridge cupola ----
b = B('barn')
b.box((9.4, 7.6, 0.4), (0, 0, 0.2), STONE, skip='b')
b.prism([(-4.6, 0), (4.6, 0), (4.6, 3.4), (2.9, 5.7), (0, 6.8), (-2.9, 5.7), (-4.6, 3.4)], 7.4, BARN, 'y')
b.prism([(-4.98, 3.1), (-3.0, 5.85), (0, 7.0), (3.0, 5.85), (4.98, 3.1), (4.8, 3.0), (2.9, 5.67), (0, 6.8), (-2.9, 5.67), (-4.8, 3.0)], 8.0, SLATE, 'y')
b.poly(_rect(0, -3.73, 0.4, 3.6, 3.6), WOOD)
for p0, z0, p1, z1 in ((-1.8, 0.4, -1.8, 3.6), (1.8, 0.4, 1.8, 3.6), (0, 0.4, 0, 3.6), (-1.8, 3.6, 1.8, 3.6), (-1.8, 0.45, 1.8, 0.45),
                       (-1.8, 0.4, 0, 3.6), (0, 3.6, 1.8, 0.4), (-1.8, 3.6, 0, 0.4), (0, 0.4, 1.8, 3.6)):
    strip(b, p0, z0, p1, z1, 0.16, 'f', 3.7, TRIM, 0.05)
b.poly(_rect(0, -3.73, 4.2, 5.4, 1.3), DOOR)
for p0, z0, p1, z1 in ((-0.7, 4.2, -0.7, 5.4), (0.7, 4.2, 0.7, 5.4), (-0.7, 5.4, 0.7, 5.4), (-0.7, 4.2, 0.7, 4.2),
                       (-4.52, 0.4, -4.52, 3.4), (4.52, 0.4, 4.52, 3.4), (-4.6, 3.3, -2.95, 5.55), (4.6, 3.3, 2.95, 5.55),
                       (-2.95, 5.6, 0, 6.72), (2.95, 5.6, 0, 6.72)):
    strip(b, p0, z0, p1, z1, 0.16, 'f', 3.7, TRIM, 0.05)
b.box((0.2, 1.0, 0.2), (0, -3.6, 6.35), WOOD)
for f in 'lr':
    for pos in (-1.8, 1.8):
        win(b, pos, 2.1, 0.8, 0.8, f, 4.6, DOOR, TRIM)
win(b, 0, 4.6, 1.2, 1.2, 'k', 3.7, DOOR, TRIM)
b.box((1.1, 1.1, 0.8), (0, 0, 7.25), TRIM, skip='b')
b.loft([(7.65, 0.75, 0.75), (8.3, 0, 0)], SLATE, 4)
b.done()

# ---- shed: 4 x 3 plank shed with a lean-to roof ----
b = B('shed')
b.prism([(-1.25, 0), (1.3, 0), (1.3, 2.0), (-1.25, 2.47)], 3.6, WOOD_L, 'x')
b.prism([(-1.5, 2.64), (1.5, 2.07), (1.5, 1.95), (-1.5, 2.52)], 4.0, SLATE, 'x')
for sx in (-1, 1):
    b.box((0.14, 0.14, 2.4), (sx * 1.76, -1.2, 1.2), WOOD, skip='b')
    strip(b, sx * 0.6, 0, sx * 0.6, 2.1, 0.05, 'f', 1.25, WOOD)
door(b, 0, 0.9, 1.95, 'f', 1.25, WOOD, None)
for p0, z0, p1, z1 in ((-0.42, 0.3, 0.42, 0.3), (-0.42, 1.65, 0.42, 1.65), (-0.4, 0.33, 0.4, 1.62)):
    strip(b, p0, z0, p1, z1, 0.12, 'f', 1.25, WOOD_L, 0.05)
win(b, 0.1, 1.5, 0.6, 0.5, 'r', 1.8, False, WOOD, mull=False)
b.done()

# ---- crypt: 5 x 6 stone mausoleum with a four-column portico ----
b = B('crypt')
b.box((5.0, 6.0, 0.18), (0, 0, 0.09), STONE_D, skip='b')
b.box((4.5, 5.5, 0.18), (0, 0, 0.27), STONE_D, skip='b')
b.box((3.8, 3.9, 2.74), (0, 0.55, 1.73), STONE, skip='bt')
for x in (-1.75, -0.95, 0.95, 1.75):
    column(b, x, -2.1, 0.36, 3.1, 0.19, TRIM)
b.box((4.4, 5.2, 0.34), (0, 0, 3.27), STONE_D)
b.gable(5.2, 4.4, 1.1, 3.44, STONE_D, 0.24, 0.12, 'y', (0, 0), wall=STONE)
disc(b, 0, 3.85, 0.3, 'f', 2.6, MOSS, 6)
door(b, 0, 1.2, 2.1, 'f', 1.4, IRON, STONE_D, z0=0.36, split=STONE_D)
for f in 'lr':
    for pos in (-0.8, 0.55, 1.9):
        with _wall(b, f):
            b.box((0.3, 0.12, 2.74), (_al(f, pos), -1.94, 1.73), STONE_D, skip='kbt')
for sx in (-1, 1):
    b.loft([(0.36, 0.14, 0.14), (0.6, 0.22, 0.22), (0.85, 0.1, 0.1)], STONE_D, 6, (sx * 2.0, -2.5, 0))
    b.box((1.2, 0.12, 0.5), (sx * 1.2, 2.52, 0.6), MOSS, skip='b')
b.box((1.0, 0.1, 0.7), (-1.5, -1.47, 0.7), MOSS, skip='b', top=(0.5, 1))
b.done()

_rs = random.getstate()  # keep every later model's jitter as it was before this one was added
b = B('cellar')  # old root cellar dug into a bank: mossy mound, stone face with a barred iron door, wing walls, hanging chains
b.ico(3.1, (0, 1.9, -0.25), MOSS, 1, (1.0, 1.2, 0.62), 0.22)
b.ico(1.5, (-2.1, 0.9, -0.2), MOSS, 1, (1.0, 1.0, 0.6), 0.15)
b.box((4.8, 0.6, 2.35), (0, -0.9, 1.175), STONE, skip='b', top=(0.94, 1))
b.box((5.0, 0.72, 0.22), (0, -0.9, 2.46), STONE_D)
b.box((1.5, 0.1, 1.95), (0, -1.21, 0.975), VOID, skip='bk')
b.box((2.1, 0.74, 0.34), (0, -0.93, 2.1), STONE_D)
for sx in (-1, 1):
    b.box((0.3, 0.74, 1.95), (sx * 0.9, -0.93, 0.975), STONE_D, skip='b')
    b.box((0.5, 2.7, 1.5), (sx * 1.75, -2.5, 0.75), STONE, skip='b', top=(0.8, 1, 0, 0), rot=(0, 0, sx * 0.16))
    b.box((0.62, 2.8, 0.14), (sx * 1.75, -2.5, 1.55), STONE_D, rot=(0, 0, sx * 0.16))
    b.box((0.5, 0.5, 0.5), (sx * 2.05, -4.0, 0.25), STONE_D, skip='b', rot=(0, 0, 0.4))
    b.cyl(0.07, 0.07, 0.05, (sx * 1.25, -1.24, 1.75), IRON, 6, rot=(PI / 2, 0, 0))
    chain = [(sx * 1.25, -1.28, 1.72), (sx * 1.28, -1.34, 1.3), (sx * 1.2, -1.4, 0.85), (sx * 1.3, -1.5, 0.4), (sx * 1.05, -1.75, 0.06), (sx * 0.8, -2.2, 0.05)]
    b.tube(chain, [0.035] * len(chain), IRON, 4)
    b.box((0.16, 0.2, 0.1), (sx * 0.8, -2.28, 0.06), IRON, skip='b')
for i in range(6):
    b.box((0.05, 0.05, 1.9), (-0.55 + 0.22 * i, -1.27, 0.95), IRON, skip='tb')
for z in (0.45, 1.5):
    b.box((1.46, 0.05, 0.06), (0, -1.28, z), IRON, skip='lr')
b.box((0.16, 0.08, 0.22), (0.3, -1.31, 1.0), IRON)
for i, (w, y) in enumerate(((2.9, -1.75), (2.7, -2.5), (2.5, -3.25))):
    b.box((w, 0.72, 0.1 - 0.02 * i), (0, y, 0.05 - 0.01 * i), STONE_D, skip='b')
b.box((0.9, 0.5, 0.3), (-1.9, -0.6, 2.72), MOSS, skip='b', top=(0.6, 0.7))
b.box((1.3, 0.12, 0.6), (1.5, -1.22, 0.55), MOSS, skip='b', top=(0.5, 1))
b.done()
random.setstate(_rs)

# ---- gazebo: 6 x 6 open octagonal bandstand ----
b = B('gazebo')
b.loft([(0, 2.95, 2.95), (0.25, 2.95, 2.95)], STONE, 8, caps='')
b.loft([(0.25, 2.85, 2.85), (0.42, 2.85, 2.85)], WOOD_L, 8, caps='t')
for i in range(2):
    b.box((1.7, 0.5 - i * 0.24, 0.14), (0, -2.74 + i * 0.12, 0.07 + i * 0.14), STONE, skip='bk')
for i in range(8):
    a0, a1 = PI / 8 + i * PI / 4, PI / 8 + (i + 1) * PI / 4
    x0, y0, x1, y1 = 2.62 * math.cos(a0), 2.62 * math.sin(a0), 2.62 * math.cos(a1), 2.62 * math.sin(a1)
    b.box((0.17, 0.17, 2.6), (x0, y0, 1.72), TRIM, rot=(0, 0, a0), skip='bt')
    if i != 5:  # the front side stays open
        am = (a0 + a1) / 2
        for z, hh in ((1.3, 0.09), (0.62, 0.07)):
            b.box((math.hypot(x1 - x0, y1 - y0) - 0.15, 0.07, hh), ((x0 + x1) / 2, (y0 + y1) / 2, z), TRIM, rot=(0, 0, am + PI / 2), skip='lr')
b.ann(2.76, 2.48, 0.22, (0, 0, 3.0), TRIM, 8, skip='t')
b.loft([(3.2, 3.2, 3.2), (3.3, 3.2, 3.2), (4.5, 0.55, 0.55)], ROOF_RED, 8, caps='b')
b.loft([(4.45, 0.45, 0.45), (4.8, 0.45, 0.45)], TRIM, 8, caps='')
b.loft([(4.8, 0.7, 0.7), (5.45, 0, 0)], ROOF_RED, 8, caps='b')
b.zc(0.04, 0, 5.4, 5.9, TRIM, seg=4, caps='')
b.done()

# ---- ruin: 12 x 18 chapel ruin. Wall footprints and heights are mirrored by colliders in the game: every block below
# ---- fills (or is carved from) the volume of the original wall boxes; only courses, moss caps and broken tops were added.
b = B('ruin')


def _ruin_wall(b, sx, sy, sz, cx, cy, m, moss_top, jag, base=True):
    """Original box (sx, sy, sz) at (cx, cy): optional dark base course, main body, then broken top blocks, all inside
    the original volume (at least one block reaches the original height)."""
    body, z0 = sz - jag[0], 0.0
    if base:
        b.box((sx, sy, 0.5), (cx, cy, 0.25), STONE_D, skip='bt')
        z0 = 0.5
    b.box((sx, sy, body - z0), (cx, cy, z0 + (body - z0) / 2), m, skip='b')
    n = len(jag) - 1
    along_y = sy > sx
    seg = (sy if along_y else sx) / n
    for i in range(n):
        hgt = jag[0] * jag[i + 1]
        if hgt <= 0:
            continue
        o = -(sy if along_y else sx) / 2 + seg * (i + 0.5)
        b.box((sx, seg, hgt) if along_y else (seg, sy, hgt), (cx, cy + o, body + hgt / 2) if along_y else (cx + o, cy, body + hgt / 2),
              MOSS if (moss_top and jag[i + 1] <= 0.5) else m, skip='b')


_ruin_wall(b, 12, 0.9, 5.5, 0, 9, STONE, True, (0.9, 0.45, 1, 0.3, 1, 1, 0.7, 0.2, 0.6))
b.loft([(5.3, 1.556, 1.556), (7.9, 0, 0)], STONE, 4, (0, 9, 0))
b.box((2.4, 0.3, 3.0), (0, 8.5, 3.4), DARKWIN)
for sx in (-6, 6):
    for i, (y, hh) in enumerate(((7, 4.6), (3.5, 3.4), (0, 4.0), (-3.2, 2.0))):
        hgt = hh if sx < 0 else hh * 0.75
        _ruin_wall(b, 0.9, 2.6, hgt, sx, y, STONE if i % 2 else STONE_D, i % 2 == 0,
                   ((0.7, 1, 0.3), (0.6, 0.4, 1), (0.8, 0.25, 1), (0.5, 1, 0.0))[i], base=False)
b.box((3, 3, 0.5), (-4.6, -6, 0.25), STONE_D, skip='bt')
b.box((3, 3, 3.3), (-4.6, -6, 2.15), STONE, skip='bt')
b.box((3, 3, 0.25), (-4.6, -6, 3.925), STONE_D, skip='bt')
b.box((3, 3, 3.45), (-4.6, -6, 5.775), STONE, skip='bt')
b.box((3.3, 3.3, 0.4), (-4.6, -6, 7.6), STONE_D)
b.box((1.2, 0.2, 2.2), (-4.6, -7.52, 5.5), DARKWIN)
b.box((11, 16, 0.15), (0, 1.5, 0.07), STONE_D, skip='b')
b.box((2.6, 1.6, 1.0), (0, 6.8, 0.5), STONE, skip='b').box((3.0, 2.0, 0.2), (0, 6.8, 1.1), STONE_D)
for i, (r, x, y) in enumerate(((0.658, 1.176, 1.114), (0.481, -1.599, -6.369), (0.824, 4.931, -1.408), (0.414, 0.281, 4.742), (0.826, 3.061, 2.82),
                               (0.894, 4.55, -2.624), (0.855, 2.823, 2.002), (0.476, 4.049, 2.678), (0.617, 3.717, 2.914))):
    b.ico(r, (x, y, 0.25), STONE_D if i % 2 else MOSS, 1, (1.2, 1, 0.6), 0.2)
b.done()
# ======================================================================================================
# TOWN & ROAD PROPS
# ======================================================================================================
b = B('lamp')  # 4.2 m street lamp
b.loft([(0, 0.22, 0.22), (0.12, 0.22, 0.22), (0.22, 0.11, 0.11), (0.62, 0.095, 0.095), (0.72, 0.07, 0.07), (3.42, 0.05, 0.05)], IRON, 6, caps='')
b.box((0.62, 0.05, 0.05), (0, 0, 3.12), IRON)
b.loft([(3.4, 0.05, 0.05), (3.5, 0.15, 0.15)], IRON, 4, caps='')
b.loft([(3.5, 0.13, 0.13), (3.9, 0.2, 0.2)], LANTERN, 4, caps='')
b.loft([(3.9, 0.27, 0.27), (4.08, 0.07, 0.07), (4.2, 0, 0)], IRON, 4, caps='b')
b.done()

b = B('bench')  # backrest toward +Y, sitter faces -Y
for y in (-0.17, -0.01, 0.15):
    b.box((1.8, 0.13, 0.05), (0, y, 0.45), WOOD_L)
for z, y in ((0.7, 0.275), (0.9, 0.315)):
    b.box((1.8, 0.05, 0.15), (0, y, z), WOOD_L, rot=(-0.2, 0, 0))
for sx in (-1, 1):
    b.box((0.06, 0.06, 0.43), (sx * 0.8, -0.2, 0.215), IRON, skip='tb')
    b.box((0.06, 0.07, 1.02), (sx * 0.8, 0.24, 0.5), IRON, rot=(-0.2, 0, 0), skip='b')
    b.box((0.06, 0.56, 0.05), (sx * 0.8, 0.0, 0.66), IRON)
    b.box((0.06, 0.5, 0.05), (sx * 0.8, 0.0, 0.405), IRON, skip='t')
b.done()

b = B('fence')  # wrought iron, 4 m along X
for z in (0.3, 1.22):
    b.box((4.0, 0.05, 0.06), (0, 0, z), IRON, skip='lr')
for i in range(9):
    end = i in (0, 8)
    r = 0.045 if end else 0.03
    b.loft([(0, r, r), (1.62 if end else 1.48, r, r), (1.86 if end else 1.72, 0, 0)], IRON, 4 if end else 3, (-2 + i * 0.5, 0, 0), caps='')
b.done()

b = B('woodfence')  # split-rail fence, 4 m along X
for x, h in ((-1.93, 1.22), (0, 1.3), (1.93, 1.18)):
    b.box((0.15, 0.15, h), (x, 0, h / 2), WOOD, skip='b', top=(0.7, 0.7))
for z, ry in ((0.45, 0.012), (0.92, -0.016)):
    b.box((4.0, 0.06, 0.13), (0, -0.1, z), WOOD_L, rot=(0, ry, 0))
b.done()

b = B('gate')  # two stone posts 4.4 m apart (same posts as before) under a wrought-iron arch
for sx in (-2.2, 2.2):
    b.box((0.7, 0.7, 0.45), (sx, 0, 0.225), STONE_D, skip='bt')
    b.box((0.7, 0.7, 2.6), (sx, 0, 1.75), STONE, skip='bt')
    b.box((0.7, 0.7, 0.35), (sx, 0, 3.225), STONE_D, skip='b')
    b.loft([(3.4, 0.354, 0.354), (3.9, 0, 0)], STONE_D, 4, (sx, 0, 0), caps='')
b.box((4.4, 0.1, 0.12), (0, 0, 3.3), IRON, skip='lr')
arch = [(-1.85 + 3.7 * i / 6, 0, 3.3 + 1.0 * math.sin(PI * i / 6)) for i in range(7)]
b.tube(arch, [0.045] * 7, IRON, 4, caps='')
for i in (1, 2, 4, 5):
    b.box((0.05, 0.05, arch[i][2] - 3.3), (arch[i][0], 0, (arch[i][2] + 3.3) / 2), IRON, skip='tb')
b.box((1.5, 0.07, 0.42), (0, 0, 3.72), IRON)
b.loft([(4.3, 0.035, 0.035), (4.62, 0, 0)], IRON, 4, caps='')
b.done()

b = B('fountain')  # 4 m round basin, tiered centre pillar
b.ann(2.06, 1.66, 0.62, (0, 0, 0), STONE, 12, ro2=2.0, ri2=1.72, skip='b')
b.poly([(1.72 * math.cos(PI / 12 + i * PI / 6), 1.72 * math.sin(PI / 12 + i * PI / 6), 0.46) for i in range(12)], WATER)
b.loft([(0.3, 0.55, 0.55), (0.6, 0.42, 0.42), (0.72, 0.24, 0.24), (1.55, 0.18, 0.18)], STONE, 6, caps='')
b.loft([(1.5, 0.2, 0.2), (1.82, 0.95, 0.95), (1.92, 0.98, 0.98)], STONE_D, 8, caps='')
b.poly([(0.98 * math.cos(PI / 8 + i * PI / 4), 0.98 * math.sin(PI / 8 + i * PI / 4), 1.92) for i in range(8)], STONE_D)
b.poly([(0.82 * math.cos(PI / 8 + i * PI / 4), 0.82 * math.sin(PI / 8 + i * PI / 4), 1.935) for i in range(8)], WATER)
b.loft([(1.9, 0.13, 0.13), (2.3, 0.08, 0.08), (2.45, 0.17, 0.17), (2.72, 0, 0)], STONE, 6, caps='')
b.box((0.9, 0.5, 0.16), (1.2, -1.45, 0.66), MOSS, rot=(0, 0, 0.9), top=(0.7, 0.6), skip='b')
b.done()

b = B('well')  # 1.6 m stone well with windlass and roof
b.ann(0.8, 0.58, 0.85, (0, 0, 0), STONE, 10, skip='b')
b.poly([(0.6 * math.cos(i * PI / 5), 0.6 * math.sin(i * PI / 5), 0.3) for i in range(10)], WATER)
for sx in (-1, 1):
    b.box((0.12, 0.14, 2.15), (sx * 0.86, 0, 1.075), WOOD, skip='b')
b.cyl(0.07, 0.07, 1.6, (0, 0, 1.5), WOOD_L, 6, (0, PI / 2, 0), caps='')  # windlass
b.box((0.04, 0.04, 0.3), (1.0, 0, 1.38), IRON).box((0.2, 0.04, 0.04), (1.08, 0, 1.24), IRON)
b.box((0.03, 0.03, 0.55), (0.1, 0, 1.2), WOOD_L, skip='tb')
b.loft([(0.72, 0.12, 0.12), (0.98, 0.16, 0.16)], WOOD_L, 6, (0.1, 0, 0), caps='b')
b.gable(1.6, 1.3, 0.55, 2.12, BARK, 0.18, 0.08, loc=(0, 0), wall=WOOD)
b.done()

b = B('signpost')  # waypoint: 3 m post, two arrow boards, hanging lantern
b.loft([(0, 0.09, 0.09), (2.9, 0.065, 0.065), (3.0, 0, 0)], WOOD, 4, caps='')
b.loft([(0, 0.2, 0.2), (0.28, 0.1, 0.1)], STONE_D, 5, caps='')
b.prism([(-0.2, 2.38), (0.78, 2.38), (0.98, 2.5), (0.78, 2.62), (-0.2, 2.62)], 0.05, WOOD_L, 'y', (0, -0.09, 0), (0, 0, 0.12))
b.prism([(0.2, 1.98), (-0.72, 1.98), (-0.92, 2.1), (-0.72, 2.22), (0.2, 2.22)], 0.05, WOOD_L, 'y', (0, -0.09, 0), (0, 0, 0.2))
b.box((0.05, 0.62, 0.05), (0, -0.3, 2.82), IRON)
b.box((0.03, 0.03, 0.14), (0, -0.55, 2.73), IRON, skip='tb')
b.loft([(2.44, 0.06, 0.06), (2.64, 0.09, 0.09)], LANTERN, 4, (0, -0.55, 0), caps='b')
b.loft([(2.64, 0.12, 0.12), (2.72, 0, 0)], IRON, 4, (0, -0.55, 0), caps='b')
b.done()

b = B('board')  # notice board, 2 m wide, papers on the front (-Y)
for sx in (-1, 1):
    b.box((0.12, 0.12, 2.15), (sx * 0.94, 0, 1.075), WOOD, skip='b')
b.box((1.9, 0.08, 1.15), (0, 0, 1.42), WOOD_L)
b.gable(2.0, 0.24, 0.2, 2.1, BARK, 0.1, 0.05, loc=(0, 0))
for x, z, w, h, tl in ((-0.6, 1.62, 0.36, 0.46, 0.06), (-0.12, 1.5, 0.3, 0.4, -0.05), (0.42, 1.66, 0.4, 0.5, 0.03), (0.52, 1.14, 0.3, 0.26, -0.1),
                       (-0.5, 1.12, 0.34, 0.22, 0.02)):
    c, s_ = math.cos(tl), math.sin(tl)
    b.poly([(x + (ux * c - uz * s_), -0.05, z + (ux * s_ + uz * c)) for ux, uz in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))], PAPER)
b.box((0.08, 0.02, 0.08), (-0.12, -0.06, 1.66), BLOOD, rot=(0, PI / 4, 0), skip='k')
b.done()


def _wheel(b, x, y, r, w, seg=8, hub=TRIM):
    """Tyre on an X axle; outer face gets a hubcap."""
    out = 't' if x > 0 else 'b'
    b.cyl(r, r, w, (x, y, r), TIRE, seg, (0, PI / 2, 0), caps=out)
    xo = x + (w / 2 + 0.012) * (1 if x > 0 else -1)
    pts = [(xo, y + r * 0.55 * math.cos(i * PI / 3), r + r * 0.55 * math.sin(i * PI / 3)) for i in range(6)]
    b.poly(pts if x > 0 else pts[::-1], hub)


b = B('car')  # parked sedan, 4.4 x 1.8, nose toward -Y
b.prism([(-2.16, 0.34), (-2.18, 0.62), (-2.06, 0.8), (-0.95, 0.9), (1.45, 0.92), (2.1, 0.84), (2.18, 0.6), (2.14, 0.34), (1.75, 0.27), (-1.75, 0.27)],
        1.72, CARPAINT, 'x')
b.loft([(0.9, 0.83, 1.1, 0, 0.2), (1.38, 0.68, 0.7, 0, 0.3)], GLASS, 4, caps='')
b.loft([(1.38, 0.71, 0.74, 0, 0.3), (1.45, 0.62, 0.62, 0, 0.3)], CARPAINT, 4, caps='t')
for sx in (-1, 1):
    b.box((0.07, 0.08, 0.5), (sx * 0.74, 0.32, 1.14), CARPAINT, top=(1, 1, -sx * 0.13, 0), skip='tb')
    for y in (-1.38, 1.36):
        _wheel(b, sx * 0.8, y, 0.33, 0.22)
    b.box((0.34, 0.05, 0.14), (sx * 0.58, -2.15, 0.66), TRIM, skip='k')
    b.box((0.34, 0.05, 0.12), (sx * 0.58, 2.17, 0.7), AWN, skip='f')
b.box((1.78, 0.1, 0.13), (0, -2.17, 0.4), TRIM, skip='k').box((1.78, 0.1, 0.13), (0, 2.17, 0.4), TRIM, skip='f')
b.done()

b = B('truck')  # parked pickup, 5.2 x 2, nose toward -Y
b.prism([(-2.56, 0.44), (-2.58, 0.84), (-2.44, 1.04), (-1.1, 1.12), (2.56, 1.12), (2.58, 0.48), (2.2, 0.38), (-2.2, 0.38)], 1.88, CARPAINT, 'x')
b.loft([(1.1, 0.9, 0.86, 0, -0.26), (1.72, 0.76, 0.58, 0, -0.18)], GLASS, 4, caps='')
b.loft([(1.72, 0.79, 0.62, 0, -0.18), (1.8, 0.7, 0.52, 0, -0.18)], CARPAINT, 4, caps='t')
b.poly([(-0.8, 0.72, 1.125), (0.8, 0.72, 1.125), (0.8, 2.44, 1.125), (-0.8, 2.44, 1.125)], TIRE)
for sx in (-1, 1):
    b.box((0.1, 1.9, 0.16), (sx * 0.88, 1.6, 1.2), CARPAINT, skip='b')
    for y in (-1.62, 1.6):
        _wheel(b, sx * 0.88, y, 0.42, 0.28)
    b.box((0.36, 0.05, 0.16), (sx * 0.64, -2.55, 0.86), TRIM, skip='k')
    b.box((0.16, 0.05, 0.3), (sx * 0.8, 2.57, 0.86), AWN, skip='f')
b.box((1.96, 0.12, 0.16), (0, -2.56, 0.5), TRIM, skip='k').box((1.96, 0.12, 0.16), (0, 2.56, 0.5), TRIM, skip='f')
b.box((1.86, 0.08, 0.2), (0, 2.5, 1.2), CARPAINT, skip='b')
b.box((0.6, 0.6, 0.45), (-0.4, 1.2, 1.35), WOOD_L, rot=(0, 0, 0.3), skip='b')
b.box((0.5, 0.5, 0.36), (0.35, 1.9, 1.3), WOOD_L, rot=(0, 0, -0.2), skip='b')
b.done()

b = B('mailbox')
b.box((0.1, 0.1, 1.08), (0, 0, 0.54), WOOD, skip='bt')
b.prism([(-0.12, 1.05), (0.12, 1.05), (0.12, 1.24), (0.07, 1.33), (-0.07, 1.33), (-0.12, 1.24)], 0.46, STEEL, 'y', (0, -0.02, 0))
b.box((0.02, 0.05, 0.2), (0.135, -0.05, 1.3), AWN).box((0.02, 0.14, 0.09), (0.135, -0.1, 1.42), AWN)
b.done()

b = B('barrel')
b.loft([(0, 0.3, 0.3), (0.3, 0.38, 0.38), (0.6, 0.38, 0.38), (0.9, 0.3, 0.3)], WOOD_L, 8, caps='t', capm=WOOD)
for z0, r in ((0.16, 0.352), (0.68, 0.372)):
    b.loft([(z0, r, r), (z0 + 0.07, r + (0.012 if z0 < 0.4 else -0.012), r + (0.012 if z0 < 0.4 else -0.012))], IRON, 8, caps='')
b.done()

b = B('crate')  # 0.9 m cube
b.box((0.82, 0.82, 0.82), (0, 0, 0.45), WOOD_L, skip='bt')
b.box((0.9, 0.9, 0.09), (0, 0, 0.045), WOOD, skip='b').box((0.9, 0.9, 0.09), (0, 0, 0.855), WOOD)
for sx in (-1, 1):
    for sy in (-1, 1):
        b.box((0.09, 0.09, 0.72), (sx * 0.405, sy * 0.405, 0.45), WOOD, skip='bt')
for f in 'fr':
    strip(b, -0.36, 0.1, 0.36, 0.8, 0.09, f, 0.41, WOOD, 0.012)
b.done()

b = B('cart')  # wooden hand cart, handles toward -Y
b.box((1.1, 1.6, 0.1), (0, 0.1, 0.62), WOOD_L)
for sx in (-1, 1):
    b.box((0.06, 1.6, 0.32), (sx * 0.55, 0.1, 0.83), WOOD, skip='b')
    b.cyl(0.5, 0.5, 0.08, (sx * 0.66, 0.2, 0.5), WOOD, 10, (0, PI / 2, 0))
    b.cyl(0.1, 0.1, 0.16, (sx * 0.66, 0.2, 0.5), IRON, 6, (0, PI / 2, 0))
    b.box((0.06, 1.2, 0.06), (sx * 0.45, -1.25, 0.72), WOOD, rot=(-0.12, 0, 0))
    b.box((0.06, 0.06, 0.58), (sx * 0.45, -0.6, 0.29), WOOD, skip='tb')
b.box((1.1, 0.06, 0.32), (0, 0.9, 0.83), WOOD, skip='b')
b.box((0.5, 0.4, 0.3), (-0.15, 0.4, 0.82), CANVAS, top=(0.7, 0.7), skip='b')
b.box((0.4, 0.4, 0.26), (0.2, -0.1, 0.8), HAY, top=(0.8, 0.8), skip='b')
b.done()

b = B('haybale')  # round bale, 1.4 m, lying along X
b.cyl(0.7, 0.7, 1.2, (0, 0, 0.68), HAY, 10, (0, PI / 2, 0), caps='')
for sx in (-1, 1):
    for r, off, m in ((0.7, 0.6, HAY_D), (0.34, 0.612, HAY)):
        pts = [(sx * off, r * math.cos(PI / 10 + i * PI / 5), 0.68 + r * math.sin(PI / 10 + i * PI / 5)) for i in range(10)]
        b.poly(pts if sx > 0 else pts[::-1], m)
b.done()

b = B('scarecrow')
b.box((0.08, 0.08, 1.9), (0, 0, 0.95), WOOD, skip='bt').box((1.7, 0.06, 0.06), (0, 0, 1.45), WOOD)
b.loft([([0.72, 0.85], 0.24, 0.14), (1.2, 0.2, 0.12), (1.52, 0.27, 0.13), (1.6, 0.1, 0.09)], AWN, 6, caps='t')
for sx in (-1, 1):
    b.box((0.5, 0.15, 0.15), (sx * 0.5, 0, 1.45), AWN, top=(1, 0.8))
    b.loft([(0, 0.07, 0.07), (0.26, 0.11, 0.02)], HAY, 4, (sx * 0.74, 0, 1.45), (0, sx * PI / 2, 0), caps='')
    b.box((0.035, 0.02, 0.035), (sx * 0.06, -0.15, 1.78), EYE, skip='k')
b.loft([(1.56, 0.1, 0.1), (1.66, 0.165, 0.16), (1.84, 0.16, 0.155), (1.93, 0.07, 0.07)], CANVAS, 6)
b.loft([(1.56, 0.17, 0.17), (1.62, 0.1, 0.1)], HAY, 6, caps='')
b.loft([(1.86, 0.34, 0.34), (1.9, 0.33, 0.33), (1.93, 0.15, 0.15), (2.12, 0.05, 0.05)], HAY_D, 8, caps='b')
b.done()

b = B('stall')  # 3 x 2 market stall, striped awning, counter at the front
b.box((2.8, 0.9, 0.08), (0, -0.4, 0.9), WOOD_L)
b.box((2.8, 0.06, 0.86), (0, -0.8, 0.43), WOOD, skip='b')
for sx in (-1, 1):
    b.box((0.09, 0.09, 2.0), (sx * 1.4, -0.86, 1.0), WOOD, skip='bt')
    b.box((0.09, 0.09, 2.42), (sx * 1.4, 0.86, 1.21), WOOD, skip='bt')
    b.box((0.06, 0.9, 0.86), (sx * 1.37, -0.4, 0.43), WOOD, skip='b')
b.prism([(1.0, 2.52), (-1.0, 2.07), (-1.0, 1.85), (-0.96, 1.85), (-0.96, 1.99), (1.0, 2.44)], 3.0, AWN, 'x')
for i in range(4):
    xa = -1.5 + (2 * i + 1) * 3.0 / 9
    b.poly([(xa, -1.0, 2.085), (xa + 1 / 3, -1.0, 2.085), (xa + 1 / 3, 1.0, 2.535), (xa, 1.0, 2.535)], TRIM)
    b.poly(_rect(xa + 1 / 6, -1.012, 1.85, 2.07, 1 / 3), TRIM)
b.box((0.7, 0.5, 0.24), (-0.85, -0.42, 1.06), WOOD, skip='b')
b.poly([(-1.16, -0.63, 1.2), (-0.54, -0.63, 1.2), (-0.54, -0.21, 1.2), (-1.16, -0.21, 1.2)], LEAF)
b.box((0.7, 0.5, 0.24), (0.0, -0.42, 1.06), WOOD, skip='b')
b.poly([(-0.31, -0.63, 1.2), (0.31, -0.63, 1.2), (0.31, -0.21, 1.2), (-0.31, -0.21, 1.2)], AWN)
b.loft([(0.94, 0.16, 0.16), (1.2, 0.2, 0.2)], WOOD_L, 6, (0.95, -0.4, 0), caps='t')
b.done()

b = B('boat')  # 3.2 m rowboat along Y, bow toward -Y
st = [(-1.6, 0.0, 0.64, 0.3), (-1.1, 0.4, 0.54, 0.07), (-0.3, 0.62, 0.47, 0.0), (0.6, 0.63, 0.46, 0.0), (1.3, 0.52, 0.5, 0.04), (1.6, 0.43, 0.53, 0.1)]
outer = [[(hb, y, zg), (hb * 0.62, y, zk + 0.12), (0, y, zk), (-hb * 0.62, y, zk + 0.12), (-hb, y, zg)] for y, hb, zg, zk in st]
inner = [[(-hb * 0.86, y * 0.95, zg), (-hb * 0.5, y * 0.95, zk + 0.17), (0, y * 0.95, zk + 0.07), (hb * 0.5, y * 0.95, zk + 0.17), (hb * 0.86, y * 0.95, zg)]
         for y, hb, zg, zk in st]
b.sheet(outer, WOOD)
b.sheet(inner, WOOD_L)
for i in range(len(st) - 1):
    b.poly([outer[i][0], outer[i + 1][0], inner[i + 1][4], inner[i][4]], WOOD)
    b.poly([outer[i + 1][4], outer[i][4], inner[i][0], inner[i + 1][0]], WOOD)
b.poly(outer[-1], WOOD)
b.poly(inner[-1], WOOD_L)
b.poly([outer[-1][4], inner[-1][0], inner[-1][4], outer[-1][0]], WOOD)
for y, w in ((-0.25, 1.06), (0.85, 1.02)):
    b.box((w, 0.24, 0.04), (0, y, 0.36), WOOD_L)
for sx in (-1, 1):
    b.cyl(0.025, 0.025, 1.7, (sx * 0.3, 0.15, 0.4), WOOD_L, 4, (PI / 2, 0, sx * 0.08), caps='')
    b.box((0.14, 0.4, 0.025), (sx * 0.375, -0.85, 0.4), WOOD_L, rot=(0, 0, sx * 0.08))
b.done()

b = B('dock')  # pier 3 wide, runs 10 m from the origin (shore end) toward -Y; deck top at z = 0.35
for i in range(10):
    b.box((3.0 - (i % 3) * 0.06, 0.96, 0.1), (((i * 7) % 3 - 1) * 0.02, -0.5 - i, 0.3), WOOD_L if i % 2 else WOOD, skip='b')
for sx in (-1, 1):
    b.box((0.16, 10.0, 0.2), (sx * 1.2, -5.0, 0.15), WOOD, skip='t')
    for j, y in enumerate((-0.5, -3.5, -6.5, -9.6)):
        top = (0.95, 0.42, 0.8, 1.05)[j] if sx > 0 else (0.42, 0.9, 0.42, 1.05)[j]
        b.loft([(-1.6, 0.13, 0.13), (top, 0.11, 0.11)], BARK, 5, (sx * 1.5, y, 0), caps='t')
b.loft([(1.05, 0.07, 0.07), (1.3, 0.1, 0.1)], LANTERN, 4, (1.5, -9.6, 0), caps='')
b.loft([(1.3, 0.13, 0.13), (1.4, 0, 0)], IRON, 4, (1.5, -9.6, 0), caps='b')
b.done()

# ---- bridge (deck along X), unchanged dimensions ----
b = B('bridge').box((26, 6.4, 0.4), (0, 0, 0.0), WOOD)
for i in range(13):
    b.box((1.8, 6.2, 0.08), (-12 + i * 2, 0, 0.24), WOOD_L if i % 2 else WOOD, skip='b')
for sy in (-3.2, 3.2):
    b.box((26, 0.16, 0.16), (0, sy, 1.3), WOOD_L).box((26, 0.12, 0.12), (0, sy, 0.75), WOOD_L)
    for i in range(9):
        b.box((0.22, 0.22, 1.4), (-12 + i * 3, sy, 0.7), WOOD, skip='b')
b.done()
# ======================================================================================================
# CEMETERY & DUNGEON
# ======================================================================================================
STONE_M = mat('stoneMid', (0.28, 0.3, 0.34))

b = B('grave1')  # rounded headstone, leaning a little
b.box((1.0, 0.36, 0.14), (0, 0, 0.07), STONE_D, skip='b')
with b.at(rot=(-0.07, 0.04, 0)):
    b.prism([(-0.4, 0.1), (0.4, 0.1), (0.4, 0.92), (0.28, 1.2), (0, 1.3), (-0.28, 1.2), (-0.4, 0.92)], 0.2, STONE, 'y')
    for z, w in ((0.95, 0.4), (0.8, 0.5), (0.68, 0.34)):
        b.poly(_rect(0, -0.105, z - 0.025, z + 0.025, w), STONE_D)
b.box((0.5, 0.1, 0.3), (0.16, -0.12, 0.26), MOSS, top=(0.5, 0.6), skip='b')
b.done()

b = B('grave2')  # ringed stone cross
b.box((0.8, 0.5, 0.12), (0, 0, 0.06), STONE_D, skip='b').box((0.56, 0.36, 0.12), (0, 0, 0.18), STONE_D, skip='b')
b.box((0.2, 0.16, 1.28), (0, 0, 0.88), STONE, top=(0.8, 0.9), skip='b')
b.box((0.8, 0.15, 0.19), (0, 0, 1.12), STONE)
b.ann(0.31, 0.22, 0.1, (0, 0.05, 1.12), STONE, 8, FWD, skip='i')
b.box((0.3, 0.08, 0.2), (-0.14, -0.2, 0.2), MOSS, top=(0.6, 0.6), skip='b')
b.done()

b = B('grave3')  # obelisk
b.box((0.8, 0.8, 0.3), (0, 0, 0.15), STONE_D, skip='b', top=(0.9, 0.9))
b.box((0.58, 0.58, 0.12), (0, 0, 0.36), STONE, skip='b')
b.loft([(0.42, 0.226, 0.226), (2.05, 0.113, 0.113), (2.35, 0, 0)], STONE, 4, caps='')
b.box((0.4, 0.12, 0.26), (0.12, -0.36, 0.2), MOSS, top=(0.5, 0.6), skip='b')
b.done()

b = B('angel')  # winged statue on a stepped plinth
b.box((1.2, 1.2, 0.25), (0, 0, 0.125), STONE_D, skip='b')
b.box((0.92, 0.92, 0.65), (0, 0, 0.575), STONE_D, skip='b', top=(0.86, 0.86))
b.loft([(0.9, 0.36, 0.3), (1.5, 0.25, 0.2), (2.0, 0.2, 0.14), (2.3, 0.26, 0.15), (2.42, 0.1, 0.09)], STONE, 8, caps='t')
b.ico(0.145, (0, -0.02, 2.56), STONE, 1, (1, 1.05, 1.1))
for sx, ctx in mirror(b):
    with ctx:
        b.tube([(0.25, 0, 2.28), (0.27, -0.14, 1.98), (0.03, -0.25, 2.14)], [0.07, 0.06, 0.05], STONE, 4, caps='t')
        with b.at((0.1, 0.2, 0), (0, 0, 0.5)):
            b.prism([(0.0, 2.25), (0.38, 2.78), (0.72, 2.62), (0.86, 2.1), (0.8, 1.6), (0.6, 1.2), (0.36, 1.5), (0.12, 1.9)], 0.08, STONE, 'y')
b.box((0.6, 0.1, 0.3), (-0.2, -0.47, 0.5), MOSS, top=(0.6, 0.5), skip='b')
b.done()

b = B('statue')  # hooded figure leaning on a sword, 3 m with plinth
b.box((1.1, 1.1, 0.2), (0, 0, 0.1), STONE_D, skip='b')
b.box((0.86, 0.86, 0.8), (0, 0, 0.6), STONE_D, skip='b', top=(0.9, 0.9))
b.loft([(1.0, 0.36, 0.32), (1.9, 0.27, 0.22), (2.4, 0.31, 0.2), (2.52, 0.2, 0.18)], STONE, 8, caps='')
b.loft([(2.45, 0.2, 0.2), (2.66, 0.23, 0.24, 0, -0.02), (2.88, 0.18, 0.2), (3.0, 0, 0, 0, 0.07)], STONE, 8, caps='')
b.poly([(0.11 * math.cos(PI / 2 + i * PI / 3), -0.255, 2.7 + 0.15 * math.sin(PI / 2 + i * PI / 3)) for i in range(6)], STONE_D)
for sx, ctx in mirror(b):
    with ctx:
        b.tube([(0.29, 0, 2.3), (0.3, -0.2, 2.0), (0.06, -0.33, 2.12)], [0.09, 0.08, 0.075], STONE, 5, caps='t')
b.box((0.08, 0.05, 1.25), (0, -0.36, 1.6), STONE_D, top=(1, 1), skip='t')
b.box((0.4, 0.06, 0.07), (0, -0.36, 2.12), STONE_D)
b.box((0.5, 0.1, 0.3), (0.2, -0.45, 0.4), MOSS, top=(0.6, 0.5), skip='b')
b.done()

b = B('coffin')  # 1 x 2.2, head toward +Y, lid slid ajar
shape = [(-0.28, 1.1), (0.28, 1.1), (0.48, 0.5), (0.3, -1.1), (-0.3, -1.1), (-0.48, 0.5)]
b.prism(shape, 0.45, WOOD, 'z', caps=(False, True))
b.poly([(x * 0.86, y * 0.94 + 0.02, 0.455) for x, y in shape][::-1], VOID)
with b.at((0.14, 0.03, 0.47), (0, 0.0, 0.13)):
    b.prism([(x * 1.04, y * 1.02) for x, y in shape], 0.07, WOOD, 'z')
    b.box((0.07, 0.9, 0.02), (0, 0.1, 0.08), STEEL, skip='b').box((0.42, 0.07, 0.02), (0, 0.4, 0.08), STEEL, skip='b')
for sx in (-1, 1):
    b.box((0.04, 0.3, 0.05), (sx * 0.41, -0.2, 0.26), IRON, rot=(0, 0, sx * 0.11))
b.done()

b = B('sarcophagus')  # 1.4 x 2.6 x 1.1 stone tomb with a carved lid
b.box((1.4, 2.6, 0.15), (0, 0, 0.075), STONE_D, skip='b')
b.box((1.16, 2.36, 0.6), (0, 0, 0.45), STONE, skip='bt')
for sx in (-1, 1):
    for sy in (-1, 0, 1):
        b.box((0.14, 0.16, 0.6), (sx * 0.55, sy * 1.12, 0.45), STONE_D, skip='bt')
b.box((1.36, 2.56, 0.12), (0, 0, 0.81), STONE_D)
b.box((1.2, 2.4, 0.2), (0, 0, 0.97), STONE, top=(0.6, 0.86), skip='b')
b.box((0.12, 1.5, 0.03), (0, -0.1, 1.085), STONE_D, skip='b').box((0.5, 0.12, 0.03), (0, 0.35, 1.085), STONE_D, skip='b')
b.box((0.5, 0.12, 0.35), (0.3, -1.3, 0.3), MOSS, top=(0.6, 0.5), skip='b')
b.done()

b = B('tombwall')  # exactly 4 x 4 x 4.6: flush stone-block courses on all four sides so segments tile seamlessly
ch = 4.6 / 8
for f in 'frkl':
    with _wall(b, f):
        for c in range(8):
            xs = (-2, -2 / 3, 2 / 3, 2) if c % 2 == 0 else (-2, -4 / 3, 0, 4 / 3, 2)
            for j in range(len(xs) - 1):
                m = (STONE, STONE_M)[(c // 2 + j) % 2]
                if c % 2 and j in (0, 3):
                    m = STONE_M
                if c == 0 or (c, j) in ((3, 1), (6, 2), (5, 2)):
                    m = STONE_D
                b.poly([(xs[j], -2, c * ch), (xs[j + 1], -2, c * ch), (xs[j + 1], -2, (c + 1) * ch), (xs[j], -2, (c + 1) * ch)], m)
b.poly([(-2, -2, 4.6), (2, -2, 4.6), (2, 2, 4.6), (-2, 2, 4.6)], STONE_D)
b.done()

b = B('tombpillar')  # 1.2 m square base and capital, octagonal shaft, 4.6 m tall
b.box((1.2, 1.2, 0.45), (0, 0, 0.225), STONE_D, skip='b')
b.loft([(0.45, 0.58, 0.58), (0.62, 0.46, 0.46), (3.9, 0.4, 0.4), (4.2, 0.62, 0.62)], STONE, 8, caps='')
b.box((1.2, 1.2, 0.4), (0, 0, 4.4), STONE_D)
b.done()

b = B('brazier')  # 1.3 m iron tripod, burning bowl
for i in range(3):
    a = PI / 2 + i * 2 * PI / 3
    b.tube([(0.42 * math.cos(a), 0.42 * math.sin(a), 0), (0.2 * math.cos(a), 0.2 * math.sin(a), 0.6), (0.16 * math.cos(a), 0.16 * math.sin(a), 1.02)],
           [0.03, 0.025, 0.025], IRON, 3, caps='')
b.loft([(0.55, 0.22, 0.22), (0.6, 0.22, 0.22)], IRON, 6, caps='')
b.loft([(0.96, 0.12, 0.12), (1.2, 0.42, 0.42), (1.3, 0.46, 0.46)], IRON, 8, caps='b')
b.poly([(0.44 * math.cos(PI / 8 + i * PI / 4), 0.44 * math.sin(PI / 8 + i * PI / 4), 1.28) for i in range(8)], FLAME)
b.loft([(1.28, 0.3, 0.3), (1.55, 0.2, 0.2, 0.04, 0.02), (1.95, 0, 0, -0.03, 0.02)], FLAME, 5, caps='')
b.loft([(1.3, 0.16, 0.16), (1.7, 0, 0, 0.03, 0)], LANTERN, 4, caps='')
b.done()

b = B('torch')  # free-standing torch, 2 m
b.box((0.42, 0.42, 0.12), (0, 0, 0.06), STONE_D, skip='b', top=(0.8, 0.8))
b.loft([(0.1, 0.05, 0.05), (1.6, 0.035, 0.035)], WOOD, 5, caps='')
b.loft([(1.52, 0.045, 0.045), (1.72, 0.13, 0.13), (1.78, 0.13, 0.13)], IRON, 6, caps='b')
b.loft([(1.74, 0.11, 0.11), (1.9, 0.075, 0.075, 0.015, 0), (2.08, 0, 0, -0.01, 0.01)], FLAME, 5, caps='')
b.done()

b = B('altar')  # 2.6 x 1.6 x 1.0 stone altar, red runner, two candles
b.box((2.6, 1.6, 0.14), (0, 0, 0.07), STONE_D, skip='b')
b.box((2.2, 1.24, 0.7), (0, 0, 0.49), STONE, skip='bt')
for sx in (-1, 1):
    for sy in (-1, 1):
        b.box((0.22, 0.2, 0.7), (sx * 1.02, sy * 0.55, 0.49), STONE_D, skip='bt')
    b.loft([(1.0, 0.045, 0.045), (1.26, 0.04, 0.04)], BONE, 5, (sx * 1.02, 0.1, 0), caps='')
    b.loft([(1.26, 0.035, 0.035), (1.36, 0, 0)], FLAME, 4, (sx * 1.02, 0.1, 0), caps='')
b.box((2.6, 1.6, 0.16), (0, 0, 0.92), STONE_D)
b.box((0.8, 1.63, 0.02), (0, 0, 1.01), CAPE, skip='b')
for sy in (-1, 1):
    b.box((0.8, 0.02, 0.5), (0, sy * 0.81, 0.76), CAPE, skip='t')
    b.box((0.8, 0.03, 0.06), (0, sy * 0.812, 0.54), GOLD)
b.done()

b = B('stairs')  # dungeon exit: stone arch 4 wide, 1.5 deep, 4.2 tall, black doorway, glowing rune rim and keystone
I_ = [(-1.2, 0), (-1.2, 2.3), (-1.05, 2.9), (-0.6, 3.3), (0, 3.5), (0.6, 3.3), (1.05, 2.9), (1.2, 2.3), (1.2, 0)]
O_ = [(-1.34, 0), (-1.34, 2.34), (-1.17, 3.0), (-0.67, 3.44), (0, 3.66), (0.67, 3.44), (1.17, 3.0), (1.34, 2.34), (1.34, 0)]
b.prism([(-2, 0)] + I_ + [(2, 0), (2, 3.95), (-2, 3.95)], 1.5, STONE, 'y')
b.box((4.0, 1.5, 0.25), (0, 0, 4.075), STONE_D, skip='b')
b.poly([(-1.2, 0.35, 0), (1.2, 0.35, 0), (1.2, 0.35, 2.3), (1.05, 0.35, 2.9), (0.6, 0.35, 3.3), (0, 0.35, 3.5), (-0.6, 0.35, 3.3), (-1.05, 0.35, 2.9),
        (-1.2, 0.35, 2.3)], VOID)
for i, (d, h) in enumerate(((0.4, 0.2), (0.4, 0.4), (0.3, 0.6))):
    b.box((2.4, d, h), (0, -0.55 + i * 0.38, h / 2), STONE_D, skip='bklr')
b.sheet([[(x, -0.765, z) for x, z in I_], [(x, -0.765, z) for x, z in O_]], RUNE)
b.box((0.4, 0.12, 0.5), (0, -0.705, 3.92), RUNE, rot=(PI, 0, 0), top=(0.7, 1), skip='f')
for sx in (-1, 1):
    for z in (0.9, 1.8, 2.7):
        b.poly(_rect(sx * 1.67, -0.76, z - 0.03, z + 0.03, 0.66), STONE_D)
b.done()

b = B('portal')  # glowing 3 m ring flat on the ground inside six small standing stones
b.loft([(0, 1.66, 1.66), (0.05, 1.6, 1.6)], STONE_D, 12)
b.ann(1.5, 1.27, 0.03, (0, 0, 0.04), RUNE, 12, skip='oib')
for k in range(2):
    tri = [(1.18 * math.cos(PI / 2 + k * PI + i * 2 * PI / 3), 1.18 * math.sin(PI / 2 + k * PI + i * 2 * PI / 3)) for i in range(3)]
    for i in range(3):
        (x0, y0), (x1, y1) = tri[i], tri[(i + 1) % 3]
        dx, dy = x1 - x0, y1 - y0
        ln = math.hypot(dx, dy)
        nx, ny = -dy / ln * 0.035, dx / ln * 0.035
        b.poly([(x0 - nx, y0 - ny, 0.062 + k * 0.004), (x1 - nx, y1 - ny, 0.062 + k * 0.004), (x1 + nx, y1 + ny, 0.062 + k * 0.004),
                (x0 + nx, y0 + ny, 0.062 + k * 0.004)], RUNE)
for i in range(6):
    a = PI / 6 + i * PI / 3
    h = (0.75, 0.5, 0.9, 0.6, 0.8, 0.55)[i]
    b.loft([(0, 0.2, 0.14), (h * 0.6, 0.17, 0.12, 0.02, 0), (h, 0.07, 0.06, 0.05, 0.02)], STONE, 5, (1.88 * math.cos(a), 1.88 * math.sin(a), 0),
           (0, 0, a + PI / 2), caps='t')
b.done()

ch_ = empty('chest')  # 1.1 x 0.7 chest; lid hinges on the back edge
b = B('chest_Base')
b.box((1.1, 0.7, 0.55), (0, 0, 0.275), WOOD, skip='b')
b.poly([(-0.48, -0.28, 0.553), (0.48, -0.28, 0.553), (0.48, 0.28, 0.553), (-0.48, 0.28, 0.553)], VOID)
b.loft([(0.553, 0.4, 0.22), (0.66, 0.15, 0.08)], GOLD, 4, caps='t')
for sx in (-1, 1):
    b.box((0.09, 0.73, 0.565), (sx * 0.38, 0, 0.28), IRON, skip='bt')
    b.box((0.05, 0.74, 0.56), (sx * 0.53, 0, 0.28), IRON, skip='bt')
b.box((0.16, 0.05, 0.16), (0, -0.365, 0.46), GOLD, skip='k')
b.done(ch_, (0, 0, 0))
b = B('chest_Lid')
arc = [(0, 0), (-0.7, 0), (-0.7, 0.12), (-0.6, 0.24), (-0.35, 0.31), (-0.1, 0.24), (0, 0.12)]
b.prism(arc, 1.1, WOOD, 'x')
for sx in (-1, 1):
    b.prism([(-0.35 + (y + 0.35) * 1.03, z * 1.05) for y, z in arc], 0.09, IRON, 'x', (sx * 0.38, 0, 0))
    b.prism([(-0.35 + (y + 0.35) * 1.03, z * 1.05) for y, z in arc], 0.05, IRON, 'x', (sx * 0.53, 0, 0))
b.box((0.12, 0.04, 0.11), (0, -0.715, 0.05), GOLD, skip='k')
b.done(ch_, (0, 0.35, 0.55))

b = B('bones')  # small pile with a skull
b.ico(0.11, (0.12, -0.08, 0.115), BONE, 1, (1, 1.15, 0.95))
b.box((0.11, 0.08, 0.07), (0.12, -0.17, 0.05), BONE, top=(0.8, 0.9), skip='b')
for sx in (-1, 1):
    b.box((0.035, 0.03, 0.035), (0.12 + sx * 0.04, -0.2, 0.125), EYE, skip='k')
for i, (x, y, rz) in enumerate(((-0.2, 0.05, 0.4), (-0.02, 0.2, -1.0))):
    b.loft([(-0.2, 0.032, 0.032), (-0.15, 0.016, 0.016), (0.15, 0.016, 0.016), (0.2, 0.032, 0.032)], BONE, 4, (x, y, 0.035 + i * 0.03), (PI / 2, 0, rz))
for i in range(3):
    y = 0.02 + i * 0.09
    b.tube([(-0.36, y, 0), (-0.33, y + 0.02, 0.14), (-0.2, y + 0.03, 0.2), (-0.08, y + 0.02, 0.13)], [0.014, 0.014, 0.012, 0.008], BONE, 3, caps='')
b.done()

b = B('rubble')  # broken masonry
for x, y, z, sx, sy, sz, rz, rx, m in ((0, 0, 0.2, 0.9, 0.55, 0.45, 0.3, 0.1, STONE), (0.55, 0.35, 0.14, 0.6, 0.4, 0.3, -0.5, -0.15, STONE_D),
                                       (-0.6, -0.2, 0.12, 0.5, 0.45, 0.28, 1.0, 0.2, STONE), (0.1, -0.55, 0.1, 0.45, 0.3, 0.22, 0.2, 0.0, STONE_D),
                                       (-0.2, 0.55, 0.1, 0.4, 0.35, 0.22, -0.9, 0.1, STONE_D), (0.2, 0.1, 0.52, 0.5, 0.35, 0.25, 0.8, 0.25, STONE_D)):
    b.box((sx, sy, sz), (x, y, z), m, rot=(rx, rx * 0.5, rz), top=(0.8, 0.85), skip='b')
b.ico(0.22, (0.75, -0.3, 0.08), STONE, 1, (1.2, 1, 0.6), 0.2).ico(0.2, (-0.75, 0.35, 0.07), MOSS, 1, (1.2, 1, 0.5), 0.2)
b.done()
# ======================================================================================================
# NATURE (canopies stay under ~3.6 m wide so they do not hide the player)
# ======================================================================================================
def spike(b, x, y, z0, h, r, m, dx=0.0, dy=0.0, seg=3, a0=0.0):
    """Open-based pointed blade / cone: seg side triangles from a small base ring to a (leaning) tip."""
    base = [(x + r * math.cos(a0 + k * 2 * PI / seg), y + r * math.sin(a0 + k * 2 * PI / seg), z0) for k in range(seg)]
    return b._add(base + [(x + dx, y + dy, z0 + h)], [(k, (k + 1) % seg, seg) for k in range(seg)], m)


def _pine(name, tiers):
    b = B(name)
    top = tiers[-1][0] + tiers[-1][2]
    b.loft([(0, 0.28, 0.28), (0.45, 0.19, 0.19), (top - 0.7, 0.05, 0.05)], BARK, 6, caps='')
    for i, (z0, r, h) in enumerate(tiers):  # each tier is a ragged star-shaped cone with drooping tips
        n, a0, pts = 10, U(0, 6.28), []
        for j in range(n):
            rr = r * (1.0 if j % 2 == 0 else 0.66) * U(0.9, 1.08)
            a = a0 + j * 2 * PI / n
            pts.append((rr * math.cos(a), rr * math.sin(a), z0 + (0 if j % 2 == 0 else r * 0.24) + U(-0.07, 0.07)))
        pts.append((U(-0.06, 0.06), U(-0.06, 0.06), z0 + h))
        b._add(pts, [(j, (j + 1) % n, n) for j in range(n)], PINE if i % 2 else PINE2)
    return b.done()


_pine('pine', [(1.5, 1.55, 2.2), (2.9, 1.25, 2.0), (4.2, 0.95, 1.8), (5.4, 0.62, 1.9)])
_pine('pineTall', [(2.2, 1.6, 2.5), (3.9, 1.35, 2.3), (5.5, 1.1, 2.1), (7.0, 0.82, 1.9), (8.3, 0.52, 1.6)])

b = B('oak')
b.tube([(0, 0, 0), (0.03, 0, 0.35), (0.06, 0, 1.3), (-0.08, 0.05, 2.5), (0, 0, 3.5)], [0.62, 0.42, 0.33, 0.28, 0.2], BARK, 7, caps='')
b.tube([(-0.03, 0.03, 2.3), (0.75, 0.3, 3.5)], [0.16, 0.09], BARK, 4, caps='')
b.tube([(-0.05, 0.03, 2.5), (-0.7, -0.3, 3.6)], [0.15, 0.09], BARK, 4, caps='')
for r, x, y, z, m in ((1.35, 0, 0, 5.2, LEAF), (1.05, 0.62, 0.3, 4.3, LEAF_L), (1.1, -0.6, -0.25, 4.45, PINE2), (0.95, 0.1, -0.7, 4.15, LEAF),
                      (0.9, -0.15, 0.72, 4.6, LEAF_L), (0.8, 0.35, -0.2, 5.95, LEAF_L)):
    b.ico(r, (x, y, z), m, 1, (1, 1, 0.88), 0.15, (0, 0, x * 3))
b.done()

b = B('deadtree')
b.tube([(0, 0, 0), (0.03, 0, 0.3), (0.1, 0, 1.4), (-0.1, 0.1, 2.8), (0.06, 0, 3.9), (0.02, 0.1, 4.7)], [0.46, 0.3, 0.23, 0.17, 0.09, 0], BARK, 6, caps='')
for (x0, y0, z0), (x1, y1, z1), (x2, y2, z2), r in (((0.0, 0.05, 2.2), (0.8, 0.2, 2.9), (1.35, 0.1, 3.9), 0.09), ((-0.08, 0.1, 2.7), (-0.8, 0.4, 3.3), (-1.2, 0.3, 4.3), 0.085),
                                                    ((0.0, 0.0, 3.2), (0.25, -0.7, 3.8), (0.2, -1.2, 4.6), 0.07), ((0.03, 0.02, 3.6), (-0.3, 0.75, 4.2), (-0.1, 1.15, 4.9), 0.06),
                                                    ((0.05, 0, 1.6), (0.6, -0.35, 1.9), (0.9, -0.45, 2.5), 0.06)):
    b.tube([(x0, y0, z0), (x1, y1, z1), (x2, y2, z2)], [r, r * 0.6, 0], BARK, 4, caps='')
    b.tube([(x1, y1, z1), (x1 * 1.5 + 0.1, y1 * 1.5, z1 + 0.35)], [r * 0.5, 0], BARK, 3, caps='')
b.done()

b = B('bush')
b.ico(0.78, (0, 0, 0.48), LEAF, 1, (1.2, 1, 0.72), 0.17).ico(0.55, (0.62, 0.28, 0.38), PINE2, 1, (1, 1, 0.75), 0.17)
b.ico(0.5, (-0.55, -0.3, 0.34), LEAF_L, 1, (1, 1, 0.75), 0.17)
b.done()

b = B('rock')
b.ico(0.8, (0, 0, 0.32), STONE_D, 1, (1.3, 1, 0.65), 0.22, (0.2, 0.1, 0.4))
b.ico(0.38, (0.8, -0.35, 0.14), STONE, 1, (1.2, 1, 0.7), 0.22, (0, 0.3, 1.0))
b.ico(0.3, (-0.2, 0.1, 0.74), MOSS, 1, (1.5, 1.2, 0.3), 0.15)
b.done()

b = B('birch')
b.tube([(0, 0, 0), (0.06, 0, 1.6), (-0.05, 0.04, 3.4), (0.04, 0, 5.3)], [0.15, 0.115, 0.08, 0.025], BIRCH, 5, caps='')
for z in (0.5, 1.2, 2.1, 2.9):  # dark bands on the white bark
    cx, cy = (0.0375 * z, 0) if z < 1.6 else (0.06 - 0.0611 * (z - 1.6), 0.0222 * (z - 1.6))
    r = (0.15 - 0.0219 * z if z < 1.6 else 0.115 - 0.0194 * (z - 1.6)) + 0.007
    b.tube([(cx, cy, z), (cx + 0.003, cy, z + 0.07)], [r, r], BARK, 5, caps='')
for (x1, y1, z1), z0 in (((0.7, 0.2, 4.0), 3.1), ((-0.6, -0.3, 4.4), 3.6), ((0.1, 0.6, 4.7), 4.0)):
    b.tube([(0, 0.02, z0), (x1, y1, z1)], [0.05, 0.015], BIRCH, 3, caps='')
for r, x, y, z in ((0.78, 0.05, 0, 5.2), (0.62, 0.85, 0.25, 4.25), (0.6, -0.75, -0.35, 4.6), (0.5, 0.1, 0.72, 4.85), (0.45, -0.2, -0.6, 3.7)):
    b.ico(r, (x, y, z), BIRCH_L, 1, (1, 1, 0.72), 0.2, (0, 0, x * 5))
b.done()

b = B('willow')
b.tube([(0, 0, 0), (0.04, 0, 0.3), (0.16, 0, 1.3), (0.08, 0.05, 2.5)], [0.6, 0.42, 0.32, 0.26], BARK, 6, caps='')
for x, y in ((0.9, 0.3), (-0.8, 0.4), (0.0, -0.95)):
    b.tube([(0.1, 0.04, 2.2), (x, y, 3.25)], [0.14, 0.07], BARK, 4, caps='')
b.ico(1.4, (0.05, 0, 3.45), WILLOW, 1, (1.08, 1.08, 0.5), 0.12)
for i in range(10):
    a = i * 2 * PI / 10 + 0.2
    r, zb = 1.3 + (i % 2) * 0.08, 0.75 + (i * 7 % 5) * 0.16
    x, y = r * math.cos(a) + 0.05, r * math.sin(a)
    b.tube([(x * 0.86, y * 0.86, 3.45), (x, y, 2.3), (x * 1.03, y * 1.03, zb)], [0.2, 0.28, 0], WILLOW if i % 2 else LEAF_L, 3, caps='', sc=(1, 0.55))
b.done()

b = B('stump')
b.loft([(0, 0.52, 0.52), (0.16, 0.36, 0.36), (0.5, 0.31, 0.31)], BARK, 7, caps='t', capm=WOOD_L)
b.poly([(0.13 * math.cos(i * PI / 3), 0.13 * math.sin(i * PI / 3) + 0.02, 0.507) for i in range(6)], WOOD)
for a in (0.4, 2.5, 4.4):
    b.box((0.22, 0.5, 0.16), (0.52 * math.cos(a), 0.52 * math.sin(a), 0.07), BARK, rot=(0, 0, a - PI / 2), top=(0.5, 0.35, 0, -0.08), skip='b')
b.box((0.3, 0.25, 0.08), (-0.1, -0.15, 0.52), MOSS, top=(0.6, 0.6), skip='b')
b.done()

b = B('log')  # fallen trunk, 3 m along X
b.loft([(-1.5, 0.31, 0.31), (0.3, 0.27, 0.27), (1.5, 0.23, 0.23)], BARK, 7, (0, 0, 0.27), (0, PI / 2, 0), capm=WOOD_L)
b.loft([(0, 0.09, 0.09), (0.35, 0.06, 0.06)], BARK, 5, (0.5, 0.05, 0.45), (-0.5, 0.3, 0), capm=WOOD_L, caps='t')
b.box((1.1, 0.3, 0.07), (-0.6, 0, 0.56), MOSS, top=(0.8, 0.6), skip='b')
b.done()

b = B('boulder')  # ~3 m wide, ~2 m tall
b.ico(1.2, (0, 0, 0.85), STONE_D, 1, (1.15, 0.95, 0.9), 0.2, (0.3, 0.2, 0.5))
b.ico(0.75, (1.0, -0.3, 0.42), STONE, 1, (1, 1, 0.8), 0.22, (0, 0.4, 1.2))
b.ico(0.6, (-0.95, 0.35, 0.33), STONE_D, 1, (1.1, 1, 0.8), 0.22, (0.5, 0, 2.0))
b.ico(0.5, (-0.1, 0.05, 1.82), MOSS, 1, (1.4, 1.1, 0.28), 0.15)
b.done()

b = B('cliff')  # rock wall segment: exactly 8 m along X, ~3 m deep, 7 m tall; both ends share one profile so segments tile
NX, NJ = 6, 5
_xs = [-4 + 8 * i / NX + (U(-0.35, 0.35) if 0 < i < NX else 0) for i in range(NX + 1)]


def _cliff_col(i):
    zs = [0] + [j * 1.55 + U(-0.3, 0.3) for j in range(1, NJ - 1)]
    zt = 7.0 if i == 2 else U(5.6, 6.8)
    fr = [(max(-1.5, -1.5 + j * 0.24 + U(-0.05, 0.35)), zs[j]) for j in range(NJ - 1)] + [(-0.5 + U(-0.2, 0.2), zt)]
    bk = [(min(1.5, 1.5 - j * 0.17 - U(-0.05, 0.3)), zs[j]) for j in range(NJ - 1)] + [(0.55 + U(-0.2, 0.2), zt - U(0.2, 0.9))]
    fr[0], bk[0] = (-1.5, 0), (1.5, 0)
    return fr, bk


_cols = [_cliff_col(i) for i in range(NX)]
_cols.append(_cols[0])
b.sheet([[(_xs[i], _cols[i][0][j][0], _cols[i][0][j][1]) for i in range(NX + 1)] for j in range(NJ)], CLIFF)
b.sheet([[(_xs[i], _cols[i][1][j][0], _cols[i][1][j][1]) for i in range(NX, -1, -1)] for j in range(NJ)], CLIFF)
b.sheet([[(_xs[i], _cols[i][0][NJ - 1][0], _cols[i][0][NJ - 1][1]) for i in range(NX + 1)],
         [(_xs[i], _cols[i][1][NJ - 1][0], _cols[i][1][NJ - 1][1]) for i in range(NX + 1)]], MOSS)
_side = [(y, z) for y, z in _cols[0][0]] + [(y, z) for y, z in reversed(_cols[0][1])]
b.poly([(-4, y, z) for y, z in _side], CLIFF)
b.poly([(4, y, z) for y, z in reversed(_side)], CLIFF)
b.done()

b = B('grass')  # one tuft, 21 triangles, single material
for i in range(7):
    a = i * 0.9 + U(0, 0.5)
    d, ln = 0.03 + 0.025 * (i % 3), U(0.05, 0.15)
    spike(b, d * math.cos(a), d * math.sin(a), 0, U(0.24, 0.38), 0.024, GRASS, ln * math.cos(a), ln * math.sin(a), 3, a)
b.done()

b = B('reeds')
for i in range(8):
    a = i * 0.8
    d = 0.06 + 0.07 * (i % 3)
    x, y, h = d * math.cos(a), d * math.sin(a), 1.0 + (i * 5 % 4) * 0.16
    spike(b, x, y, 0, h, 0.022, STEM, 0.1 * math.cos(a), 0.1 * math.sin(a), 3, a)
    if i % 3 == 0:
        k = 0.82
        b.loft([(h * k - 0.12, 0.034, 0.034), (h * k + 0.1, 0.034, 0.034)], BARK, 4, (x + 0.1 * k * math.cos(a), y + 0.1 * k * math.sin(a), 0))
b.done()

b = B('mushroom')  # glowing cluster
for x, y, h, r in ((0, 0, 0.3, 0.16), (0.17, 0.08, 0.2, 0.11), (-0.14, 0.12, 0.16, 0.09), (-0.05, -0.16, 0.12, 0.075), (0.16, -0.13, 0.09, 0.06)):
    b.loft([(0, r * 0.3, r * 0.3), (h, r * 0.22, r * 0.22)], BONE, 4, (x, y, 0), caps='')
    b.loft([(h - r * 0.1, r, r), (h + r * 0.55, 0, 0)], GLOWCAP, 6, (x, y, 0), caps='b')
b.done()

b = B('vervain')  # purple flower spikes
for i in range(7):
    a = i * 0.9
    d = 0.2 * (i % 3) / 2 + 0.03
    x, y, h = d * math.cos(a), d * math.sin(a), 0.6 + (i % 3) * 0.1
    lx, ly = 0.06 * math.cos(a), 0.06 * math.sin(a)
    spike(b, x, y, 0, h, 0.022, STEM, lx, ly, 3, a)
    b.loft([(h - 0.06, 0, 0), (h + 0.08, 0.07, 0.07), (h + 0.42, 0, 0)], VERV, 4, (x + lx, y + ly, 0))
for i in range(5):
    a = 0.5 + i * 1.26
    spike(b, 0.05 * math.cos(a), 0.05 * math.sin(a), 0, 0.2, 0.05, STEM, 0.26 * math.cos(a), 0.26 * math.sin(a), 3, a)
b.done()

b = B('wolfsbane')  # yellow hooded flowers
for i in range(5):
    a = i * 1.26 + 0.3
    d = 0.14 if i else 0.0
    x, y, h = d * math.cos(a), d * math.sin(a), 0.72 + (i % 2) * 0.14
    spike(b, x, y, 0, h, 0.022, STEM, 0, 0, 3, a)
    for k in range(3):
        aa, zz = a + k * 2.1, h * (0.58 + k * 0.17)
        spike(b, x + 0.045 * math.cos(aa), y + 0.045 * math.sin(aa), zz, 0.13, 0.05, WOLFSBANE, 0.04 * math.cos(aa), 0.04 * math.sin(aa), 4, aa)
    spike(b, x, y, 0.02, 0.16, 0.06, STEM, 0.24 * math.cos(a + 1), 0.24 * math.sin(a + 1), 3, a)
b.done()

b = B('sage')  # grey-green herb with small white flowers
for i in range(10):
    a = i * 0.63
    d = 0.05 + 0.06 * (i % 2)
    spike(b, d * math.cos(a), d * math.sin(a), 0, 0.3 + (i % 3) * 0.06, 0.05, SAGE, 0.16 * math.cos(a), 0.16 * math.sin(a), 3, a)
for i in range(5):
    a = 0.4 + i * 1.26
    x, y, h = 0.07 * math.cos(a), 0.07 * math.sin(a), 0.44 + (i % 2) * 0.08
    spike(b, x, y, 0, h, 0.018, SAGE, 0.04 * math.cos(a), 0.04 * math.sin(a), 3, a)
    b.loft([(h - 0.03, 0, 0), (h + 0.03, 0.035, 0.035), (h + 0.11, 0, 0)], SAGE_F, 4, (x + 0.04 * math.cos(a), y + 0.04 * math.sin(a), 0))
b.done()

b = B('campfire')
for i in range(7):
    a = i * 2 * PI / 7
    b.box((0.3, 0.24, 0.2), (0.82 * math.cos(a), 0.82 * math.sin(a), 0.08), STONE_D if i % 2 else STONE, rot=(0.1, 0, a + 0.3 * (i % 3)), top=(0.7, 0.7), skip='b')
for i in range(4):
    a = i * PI / 2 + 0.4
    b.loft([(0, 0.085, 0.085), (0.95, 0.07, 0.07)], BARK, 5, (0.6 * math.cos(a), 0.6 * math.sin(a), 0.06), (0, -0.95, a), capm=WOOD_L)
b.loft([(0.08, 0.36, 0.36), (0.5, 0.24, 0.24, 0.04, 0.02), (1.05, 0, 0, -0.03, 0.03)], FLAME, 6, caps='')
b.loft([(0.1, 0.18, 0.18), (0.72, 0, 0, 0.03, -0.02)], LANTERN, 5, caps='')
b.done()

b = B('tent')  # ridge along X (2.6 long), 3.2 wide, 1.7 tall; entrance on the +X end
b.prism([(-1.6, 0), (1.6, 0), (0, 1.7)], 2.6, CANVAS, 'x', caps=(True, True))
b.poly([(1.305, -0.55, 0), (1.305, 0.55, 0), (1.305, 0, 1.2)], VOID)
b.poly([(1.31, 0.12, 0), (1.31, 0.75, 0), (1.31, 0.04, 1.25)], HAY)
b.box((2.84, 0.06, 0.06), (0, 0, 1.69), WOOD)
b.poly([(-0.7, -1.02, 0.63), (0.1, -1.02, 0.63), (0.1, -0.64, 1.04), (-0.7, -0.64, 1.04)], HAY)
for sx in (-1, 1):
    for sy in (-1, 1):
        b.loft([(0, 0.03, 0.03), (0.22, 0.03, 0.03)], WOOD, 3, (sx * 1.2, sy * 1.57, 0), (0, 0, 0), caps='t')
b.done()

b = B('standingstone')  # 2.6 m menhir with a faint rune inlay on the front
b.loft([(0, 0.52, 0.34), (0.9, 0.47, 0.3, 0.03, 0), (1.9, 0.37, 0.24, 0.07, 0), (2.45, 0.2, 0.15, 0.1, 0.02), (2.6, 0, 0, 0.13, 0.03)], STONE_D, 5, caps='')
yf = lambda z: -0.243 + (z - 0.9) * 0.049 - 0.012
for x0, z0, x1, z1 in ((0.05, 1.0, 0.05, 1.82), (0.05, 1.56, 0.19, 1.74), (0.05, 1.56, -0.09, 1.74), (0.05, 1.3, 0.17, 1.14), (0.05, 1.3, -0.07, 1.14)):
    dx, dz = x1 - x0, z1 - z0
    ln = math.hypot(dx, dz)
    nx, nz = -dz / ln * 0.025, dx / ln * 0.025
    b.poly([(x0 - nx, yf(z0), z0 - nz), (x1 - nx, yf(z1), z1 - nz), (x1 + nx, yf(z1), z1 + nz), (x0 + nx, yf(z0), z0 + nz)], RUNE)
b.box((0.5, 0.2, 0.3), (-0.2, -0.3, 0.14), MOSS, top=(0.6, 0.5), skip='b')
b.done()

# ======================================================================================================
# PICKUPS
# ======================================================================================================
B('lapis').loft([(-0.42, 0, 0), (0.1, 0.25, 0.25), (0.3, 0.14, 0.14), (0.42, 0, 0)], LAPIS, 6).done()  # origin = gem centre (floats)
B('moonstone').loft([(0, 0.09, 0.06), (0.07, 0.2, 0.14), (0.17, 0.2, 0.14), (0.25, 0.11, 0.075), (0.28, 0, 0)], MOONSTONE, 6, caps='b').done()
b = B('lootbag')
b.loft([(0, 0.12, 0.12), (0.08, 0.2, 0.2), (0.21, 0.19, 0.19), (0.3, 0.07, 0.07), (0.36, 0.11, 0.11), (0.4, 0.09, 0.09)], CANVAS, 6)
b.loft([(0.285, 0.085, 0.085), (0.32, 0.085, 0.085)], HAY, 6, caps='')
b.done()
b = B('coin')
b.loft([(0, 0.125, 0.125), (0.025, 0.125, 0.125)], GOLD, 8)
b.loft([(0.025, 0.07, 0.07), (0.04, 0, 0)], GOLD, 4, caps='')
b.done()
b = B('vial')
b.loft([(0, 0.05, 0.05), (0.025, 0.07, 0.07), (0.16, 0.07, 0.07), (0.2, 0.03, 0.03)], BLOOD, 6, caps='b')
b.loft([(0.2, 0.03, 0.03), (0.26, 0.032, 0.032)], GLASS, 6, caps='')
b.loft([(0.25, 0.038, 0.038), (0.3, 0.032, 0.032)], WOOD_L, 5)
b.done()
b = B('book')  # closed grimoire lying flat, spine toward -X
b.box((0.27, 0.35, 0.014), (0, 0, 0.007), LEATHER).box((0.27, 0.35, 0.014), (0, 0, 0.073), LEATHER)
b.box((0.024, 0.35, 0.08), (-0.135, 0, 0.04), LEATHER)
b.box((0.245, 0.33, 0.052), (0.005, 0, 0.04), PAPER, skip='tbl')
b.box((0.05, 0.07, 0.086), (0.125, 0, 0.04), RUNE)
b.poly([(-0.06, 0, 0.082), (0, -0.08, 0.082), (0.06, 0, 0.082), (0, 0.08, 0.082)], RUNE)
b.done()
b = B('beartrap')  # 0.7 m, jaws open
b.box((0.72, 0.07, 0.03), (0, 0, 0.015), IRON)
b.loft([(0.03, 0.1, 0.1), (0.045, 0.1, 0.1)], STEEL, 6, caps='t')
for sy in (-1, 1):
    arc = [(0.3 * math.cos(PI * i / 5), sy * 0.3 * math.sin(PI * i / 5) * 0.9, 0.035 + 0.3 * math.sin(PI * i / 5) * 0.42) for i in range(6)]
    b.tube(arc, [0.018] * 6, IRON, 3, caps='')
    for i in range(1, 5):
        spike(b, arc[i][0], arc[i][1], arc[i][2], 0.09, 0.02, STEEL, 0, -sy * 0.03, 3)
for sx in (-1, 1):
    b.box((0.08, 0.2, 0.04), (sx * 0.33, 0, 0.04), IRON, top=(0.6, 0.5))
b.done()
# ======================================================================================================
# EXPORT: one GLB (Y up for three.js) + the same file base64-wrapped as assets/models.js
# ======================================================================================================
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
glb = os.path.join(out, 'models.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True, export_yup=True)
with open(glb, 'rb') as fh, open(os.path.join(out, 'models.js'), 'w') as js:
    js.write('window.HM_MODELS="' + base64.b64encode(fh.read()).decode() + '";\n')


# ---- report: world-space bounds, triangle and material counts per model; pivots of articulated parts ----
def _tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons) if ob.type == 'MESH' else 0


def _inverted(ob):
    """Counts closed-ish shells whose faces point inward (signed volume < 0): a modelling mistake."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    seen, bad = set(), 0
    for f0 in bm.faces:
        if f0.index in seen:
            continue
        isl, st = [], [f0]
        seen.add(f0.index)
        while st:
            f = st.pop()
            isl.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        seen.add(g.index)
                        st.append(g)
        if len(isl) < 4 or any(len(e.link_faces) != 2 for f in isl for e in f.edges):
            continue
        c = sum((f.calc_center_median() for f in isl), Vector()) / len(isl)
        vol = sum(f.calc_area() * f.normal.dot(f.calc_center_median() - c) for f in isl)
        if vol < 0:
            bad += 1
    bm.free()
    return bad


tot = 0
print('%-14s %7s %7s %7s  %7s %7s %7s  %5s %s' % ('MODEL', 'minx', 'miny', 'minz', 'maxx', 'maxy', 'maxz', 'tris', 'mats'))
for ob in sorted((o for o in bpy.data.objects if o.parent is None), key=lambda o: o.name.lower()):
    fam = [ob] + list(ob.children_recursive)
    pts = [o.matrix_world @ v.co for o in fam if o.type == 'MESH' for v in o.data.vertices]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    n = sum(_tris(o) for o in fam)
    tot += n
    nm = max(len(o.data.materials) for o in fam if o.type == 'MESH')
    inv = sum(_inverted(o) for o in fam if o.type == 'MESH')
    print('%-14s %7.2f %7.2f %7.2f  %7.2f %7.2f %7.2f  %5d %d%s%s' % (ob.name, *lo, *hi, n, nm, '  !!>6 materials' if nm > 6 else '',
                                                                     '  !!%d inverted shells' % inv if inv else ''))
    for c in ob.children:
        print('    %-16s pivot (%.2f, %.2f, %.2f)  tris %d' % (c.name, *c.location, _tris(c)))
print('models:', sum(1 for o in bpy.data.objects if o.parent is None), ' objects:', len(bpy.data.objects), ' tris:', tot,
      ' GLB bytes:', os.path.getsize(glb), ' materials:', len(bpy.data.materials))

/* Hollow Moon — world: areas, collision, the overworld, the Tomb generator, sky, weather. */
const HASH = 16, CHUNK = 48, WS = 300;
let BA = null;                     // area under construction
function mkArea(id) { return { id, group: new T.Group(), boxes: [], circ: [], los: [], hash: new Map(), chunks: new Map(), lights: [], inter: [], glows: [], fade: [], bounds: [-WS + 4, -WS + 4, WS - 4, WS - 4], anim: [] }; }
function addBox(b, los) { BA.boxes.push(b); if (los) BA.los.push(b); }
function addCirc(x, z, r) { BA.circ.push([x, z, r]); }
function hashArea(a) {
  a.hash.clear(); const put = (k, v) => { let l = a.hash.get(k); if (!l) a.hash.set(k, l = []); l.push(v); };
  for (const b of a.boxes) for (let i = Math.floor(b[0] / HASH); i <= Math.floor(b[2] / HASH); i++) for (let j = Math.floor(b[1] / HASH); j <= Math.floor(b[3] / HASH); j++) put(i + ',' + j, b);
  for (const c of a.circ) for (let i = Math.floor((c[0] - c[2]) / HASH); i <= Math.floor((c[0] + c[2]) / HASH); i++) for (let j = Math.floor((c[1] - c[2]) / HASH); j <= Math.floor((c[1] + c[2]) / HASH); j++) put(i + ',' + j, c);
}
function collide(e) {
  const a = RT.area, r = e.r, i0 = Math.floor((e.x - r) / HASH), i1 = Math.floor((e.x + r) / HASH), j0 = Math.floor((e.z - r) / HASH), j1 = Math.floor((e.z + r) / HASH); let hit = false;
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = a.hash.get(i + ',' + j); if (!l) continue;
    for (const b of l) { if (b.length === 4) { if (e.x > b[0] - r && e.x < b[2] + r && e.z > b[1] - r && e.z < b[3] + r) { const L = e.x - (b[0] - r), Rr = b[2] + r - e.x, Tt = e.z - (b[1] - r), Bb = b[3] + r - e.z, m = Math.min(L, Rr, Tt, Bb); if (m === L) e.x = b[0] - r; else if (m === Rr) e.x = b[2] + r; else if (m === Tt) e.z = b[1] - r; else e.z = b[3] + r; hit = true; } }
      else { const dx = e.x - b[0], dz = e.z - b[1], d = hyp(dx, dz), m = b[2] + r; if (d < m && d > 1e-4) { e.x = b[0] + dx / d * m; e.z = b[1] + dz / d * m; hit = true; } } } }
  const B = a.bounds; if (e.x < B[0]) e.x = B[0]; if (e.x > B[2]) e.x = B[2]; if (e.z < B[1]) e.z = B[1]; if (e.z > B[3]) e.z = B[3]; return hit;
}
function solidAt(x, z) { const l = RT.area.hash.get(Math.floor(x / HASH) + ',' + Math.floor(z / HASH)); if (!l) return false; for (const b of l) if (b.length === 4 && b.los !== 0 && x > b[0] && x < b[2] && z > b[1] && z < b[3]) return true; return false; }
function los(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const q of RT.area.los) { let t0 = 0, t1 = 1, ok = true;
    if (Math.abs(dx) < 1e-6) { if (a.x < q[0] || a.x > q[2]) continue; } else { let u = (q[0] - a.x) / dx, v = (q[2] - a.x) / dx; if (u > v) { const w = u; u = v; v = w; } t0 = u > t0 ? u : t0; t1 = v < t1 ? v : t1; if (t0 > t1) continue; }
    if (Math.abs(dz) < 1e-6) { if (a.z < q[1] || a.z > q[3]) continue; } else { let u = (q[1] - a.z) / dz, v = (q[3] - a.z) / dz; if (u > v) { const w = u; u = v; v = w; } t0 = u > t0 ? u : t0; t1 = v < t1 ? v : t1; if (t0 > t1) continue; }
    if (ok) return false; }
  return true;
}
/* instanced scatter, bucketed into chunks so far-away props are skipped entirely */
function scatter(name, list, o = {}) {
  if (!list.length) return; const src = MODELS[name]; if (!src) { console.warn('missing model', name); return; }
  const M = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), p = new T.Vector3(), sc = new T.Vector3(), buckets = new Map();
  for (const t of list) { const k = Math.floor(t[0] / CHUNK) + ',' + Math.floor(t[1] / CHUNK); let l = buckets.get(k); if (!l) buckets.set(k, l = []); l.push(t); }
  src.updateMatrixWorld(true); const inv = new T.Matrix4().copy(src.matrixWorld).invert(), prims = []; src.traverse(m => { if (m.isMesh) prims.push([m, new T.Matrix4().multiplyMatrices(inv, m.matrixWorld)]); });
  for (const [k, l] of buckets) { let g = BA.chunks.get(k); if (!g) { g = new T.Group(); const [cx, cz] = k.split(',').map(Number); g.userData.c = [(cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK]; BA.chunks.set(k, g); BA.group.add(g); }
    for (const [m, rel] of prims) { const im = new T.InstancedMesh(m.geometry, m.material, l.length);
      l.forEach((t, i) => { q.setFromAxisAngle(up, t[2] || 0); M.compose(p.set(t[0], t[4] || 0, t[1]), q, sc.setScalar(t[3] || 1)).multiply(rel); im.setMatrixAt(i, M); });
      im.castShadow = o.shadow !== false; im.receiveShadow = true; im.frustumCulled = false; g.add(im); } }
}
function updChunks() { const a = RT.area, R0 = 118; for (const g of a.chunks.values()) { const c = g.userData.c; g.visible = Math.abs(c[0] - pl.x) < R0 && Math.abs(c[1] - pl.z) < R0; } }
function building(name, x, z, r, w, d, glow = 0xff9a40) {
  const o = place(name, x, z, r, 1, BA.group); o.traverse(m => { if (m.isMesh) m.material = m.material.clone(); });
  if (Math.abs(Math.sin(r)) > 0.5) { const t = w; w = d; d = t; }
  addBox([x - w / 2, z - d / 2, x + w / 2, z + d / 2], true); BA.fade.push({ o, x, z, w, d, a: 1, name, home: /^house|^boarding|^manor|^cabin/.test(name) });
  if (glow) BA.glows.push([x + Math.sin(r) * (d / 2 + 2.2), z + Math.cos(r) * (d / 2 + 2.2), 9, glow]); return o;
}
function fenceLine(x1, z1, x2, z2, out) { const l = hyp(x2 - x1, z2 - z1), n = Math.max(1, Math.round(l / 4)), r = Math.abs(x2 - x1) > Math.abs(z2 - z1) ? 0 : PI / 2;
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; out.push([lerp(x1, x2, t), lerp(z1, z2, t), r]); } const b = [Math.min(x1, x2) - 0.15, Math.min(z1, z2) - 0.15, Math.max(x1, x2) + 0.15, Math.max(z1, z2) + 0.15]; b.los = 0; addBox(b, false); }
function segD(px, pz, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz), 0, 1); return hyp(px - a[0] - dx * t, pz - a[1] - dz * t); }
function buildGlows(a) {
  if (!a.glows.length) return; const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gg = gc.getContext('2d'), grd = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,.3)'); grd.addColorStop(0.4, 'rgba(255,255,255,.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); gg.fillStyle = grd; gg.fillRect(0, 0, 128, 128);
  const im = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-PI / 2), new T.MeshBasicMaterial({ map: new T.CanvasTexture(gc), transparent: true, blending: T.AdditiveBlending, depthWrite: false }), a.glows.length), M = new T.Matrix4(), col = new T.Color();
  a.glows.forEach((g, i) => { M.makeScale(g[2], 1, g[2]).setPosition(g[0], 0.07 + (i % 7) * 0.002, g[1]); im.setMatrixAt(i, M); im.setColorAt(i, col.setHex(g[3])); }); im.instanceColor.needsUpdate = true; im.frustumCulled = false; a.group.add(im); a.glowMesh = im;
}
function lamp(x, z, c = 0xffa050, i = 1.1, d = 18, y = 3.6) { BA.lights.push({ x, y, z, c, i, d }); }
function addInter(o) { (BA || RT.area).inter.push(o); return o; }

/* ---------------- overworld ---------------- */
const ROADS = [
  [6, [[-30, 8], [-70, 20], [-104, 40]]], [6, [[30, -14], [80, -14], [130, -28], [190, -40], [216, -40], [240, -50]]], [5, [[12, -30], [12, -62], [4, -110], [0, -150], [-10, -200], [-20, -228]]],
  [4, [[4, -110], [-60, -132], [-112, -150], [-130, -156]]], [4, [[0, -150], [70, -170], [130, -196], [176, -204]]], [6, [[0, 28], [0, 120], [10, 170], [22, 198]]], [4, [[0, 120], [60, 140], [110, 160], [136, 172]]],
  [4, [[-70, 20], [-84, 80], [-100, 130], [-116, 158]]], [4, [[-70, 20], [-120, -20], [-180, -52], [-214, -66]]], [4, [[203, 150], [240, 150], [262, 120]]], [3, [[-104, 40], [-170, 40]]],
];
const RIVER = [196, 210], LAKE = [-170, 196, 40], POOL = [203, -236, 13], CEM = [-190, 5, -110, 75];
const EXR = [[-36, -62, 70, 46], [-24, 46, 24, 116], CEM, [RIVER[0] - 3, -290, RIVER[1] + 3, 290], [226, -82, 278, -18], [-4, 196, 86, 260]], EXC = [[-130, -170, 17], [-20, -245, 15], [LAKE[0], LAKE[1], LAKE[2] + 3], [POOL[0], POOL[1], POOL[2] + 4], [150, 186, 30], [-230, -70, 16], [168, -222, 9], [-118, 166, 9]];
let WORLDMAP = null, WORLD = null;
function freeSpot(x, z, m = 0) {
  if (Math.abs(x) > WS - 6 || Math.abs(z) > WS - 6) return false;
  for (const r of EXR) if (x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m) return false;
  for (const c of EXC) if (hyp(x - c[0], z - c[1]) < c[2] + m) return false;
  for (const [w, p] of ROADS) for (let i = 0; i < p.length - 1; i++) if (segD(x, z, p[i], p[i + 1]) < w * 0.5 + 2 + m) return false;
  for (const b of BA.boxes) if (x > b[0] - 2 && x < b[2] + 2 && z > b[1] - 2 && z < b[3] + 2) return false;
  return true;
}
function groundTex(rnd) {
  const N = 2048, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), k = N / (WS * 2), X = x => (x + WS) * k;
  g.fillStyle = '#3f5b3d'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 2600; i++) { g.fillStyle = ['rgba(46,70,48,.5)', 'rgba(78,104,66,.4)', 'rgba(52,80,58,.5)', 'rgba(90,100,62,.25)'][i & 3]; const r = 6 + rnd() * 36; g.beginPath(); g.ellipse(rnd() * N, rnd() * N, r, r * (0.5 + rnd() * 0.6), rnd() * 3, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(30,54,44,.55)'; g.fillRect(0, 0, X(196), X(-64));                                   // deep woods
  g.fillStyle = '#3a4d40'; g.fillRect(X(CEM[0]), X(CEM[1]), (CEM[2] - CEM[0]) * k, (CEM[3] - CEM[1]) * k);
  g.fillStyle = '#6a6458'; g.beginPath(); g.arc(X(150), X(186), 34 * k, 0, 7); g.fill(); g.fillStyle = '#585448'; g.beginPath(); g.arc(X(152), X(190), 22 * k, 0, 7); g.fill();   // quarry
  g.fillStyle = '#4a4a44'; g.beginPath(); g.arc(X(-130), X(-170), 15 * k, 0, 7); g.fill(); g.fillStyle = '#3a3640'; g.beginPath(); g.arc(X(-20), X(-245), 14 * k, 0, 7); g.fill();
  for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#6b5f3a' : '#7a6c40'; g.fillRect(X(28), X(222 + i * 4), 54 * k, 4 * k); }                                  // farm rows
  g.lineCap = g.lineJoin = 'round';
  for (const pass of [0, 1]) for (const [w, p] of ROADS) { g.strokeStyle = pass ? '#7d6a50' : '#4f4536'; g.lineWidth = (w + (pass ? 0 : 1.6)) * k; g.beginPath(); p.forEach((q, i) => i ? g.lineTo(X(q[0]), X(q[1])) : g.moveTo(X(q[0]), X(q[1]))); g.stroke(); }
  g.fillStyle = '#62626c'; g.fillRect(X(-31), X(-29), 62 * k, 58 * k); g.fillRect(X(-5), X(28), 10 * k, 90 * k);
  g.fillStyle = '#655c48'; g.fillRect(X(RIVER[0] - 3), X(-226), (RIVER[1] - RIVER[0] + 6) * k, N); g.beginPath(); g.arc(X(LAKE[0]), X(LAKE[1]), (LAKE[2] + 3) * k, 0, 7); g.fill(); g.beginPath(); g.arc(X(POOL[0]), X(POOL[1]), (POOL[2] + 3) * k, 0, 7); g.fill();
  g.fillStyle = '#122436'; g.fillRect(X(RIVER[0]), X(-226), (RIVER[1] - RIVER[0]) * k, N); g.beginPath(); g.arc(X(LAKE[0]), X(LAKE[1]), LAKE[2] * k, 0, 7); g.fill(); g.beginPath(); g.arc(X(POOL[0]), X(POOL[1]), POOL[2] * k, 0, 7); g.fill();
  g.fillStyle = '#3a5a66'; g.fillRect(X(RIVER[0]), X(146), (RIVER[1] - RIVER[0]) * k, 8 * k);                                                               // the ford
  WORLDMAP = c; const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8; return t;
}
function detailTex(dark) { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#a0a0a0'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 7000; i++) { const v = 90 + Math.random() * 150 | 0; g.fillStyle = `rgba(${v},${v},${v},.6)`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3); } const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; }
function detailMat(map, rep, extra) { const m = new T.MeshStandardMaterial(Object.assign({ map, roughness: 1 }, extra)), det = detailTex(); m.onBeforeCompile = sh => { sh.uniforms.det = { value: det }; sh.fragmentShader = sh.fragmentShader.replace('uniform float opacity;', 'uniform float opacity; uniform sampler2D det;').replace('#include <map_fragment>', `#include <map_fragment>\n diffuseColor.rgb *= texture2D(det, vUv * ${rep.toFixed(1)}).rgb * 1.55;`); }; return m; }
function cobbleTex() { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#2a2a30'; g.fillRect(0, 0, 256, 256); for (let j = 0; j < 8; j++) for (let i = -1; i < 8; i++) { const v = 74 + Math.random() * 40 | 0; g.fillStyle = `rgb(${v},${v},${v + 7})`; const x = i * 32 + (j % 2) * 16 + 2, y = j * 32 + 2, w = 28, h = 28; g.beginPath(); g.moveTo(x + 5, y); g.lineTo(x + w - 5, y); g.quadraticCurveTo(x + w, y, x + w, y + 5); g.lineTo(x + w, y + h - 5); g.quadraticCurveTo(x + w, y + h, x + w - 5, y + h); g.lineTo(x + 5, y + h); g.quadraticCurveTo(x, y + h, x, y + h - 5); g.lineTo(x, y + 5); g.quadraticCurveTo(x, y, x + 5, y); g.fill(); if (i === 7 && j % 2) { g.fillRect(2 - 16, y, 12, h); } }
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; t.anisotropy = 8; return t; }
function paved(x1, z1, x2, z2, tex) { const w = x2 - x1, d = z2 - z1, t = tex.clone(); t.needsUpdate = true; t.repeat.set(w / 5, d / 5); const m = new T.Mesh(new T.PlaneGeometry(w, d).rotateX(-PI / 2), new T.MeshStandardMaterial({ map: t, roughness: 0.92 })); m.position.set((x1 + x2) / 2, 0.035, (z1 + z2) / 2); m.receiveShadow = true; BA.group.add(m); }
/* open water lies flat under the whole sky and the sun, and the picture is shown without tone mapping: a mid blue with a glossy surface came out pale and blooming at noon. Darker, and rougher, it reads as deep water by day and by night. */
function waterMat() { return new T.MeshStandardMaterial({ color: 0x12293e, roughness: 0.78, metalness: 0.12, transparent: true, opacity: 0.9 }); }

function buildWorld() {
  const a = BA = mkArea('world'), rnd = mkRng(4242), rr = (x, y) => x + rnd() * (y - x), G = a.group;
  const gm = new T.Mesh(new T.PlaneGeometry(WS * 2, WS * 2).rotateX(-PI / 2), detailMat(groundTex(rnd), 110)); gm.receiveShadow = true; G.add(gm);
  const wm = waterMat(), river = new T.Mesh(new T.PlaneGeometry(RIVER[1] - RIVER[0], 516).rotateX(-PI / 2), wm); river.position.set(203, 0.04, 32); G.add(river);
  const lake = new T.Mesh(new T.CircleGeometry(LAKE[2], 40).rotateX(-PI / 2), wm); lake.position.set(LAKE[0], 0.04, LAKE[1]); G.add(lake); const pool = new T.Mesh(new T.CircleGeometry(POOL[2], 28).rotateX(-PI / 2), wm); pool.position.set(POOL[0], 0.05, POOL[1]); G.add(pool);
  addCirc(LAKE[0], LAKE[1], LAKE[2] - 0.5); addCirc(POOL[0], POOL[1], POOL[2] - 0.5);
  for (const b of [[RIVER[0], -224, RIVER[1], -43.2], [RIVER[0], -36.8, RIVER[1], 146], [RIVER[0], 154, RIVER[1], 290]]) { b.los = 0; addBox(b, false); }
  // waterfall
  const fc = document.createElement('canvas'); fc.width = 64; fc.height = 256; const fg = fc.getContext('2d'); fg.fillStyle = '#7fb2d8'; fg.fillRect(0, 0, 64, 256); for (let i = 0; i < 90; i++) { fg.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.5})`; fg.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 3, 20 + Math.random() * 60); }
  const ft = new T.CanvasTexture(fc); ft.wrapS = ft.wrapT = T.RepeatWrapping; ft.encoding = T.sRGBEncoding; const fall = new T.Mesh(new T.PlaneGeometry(12, 9), new T.MeshBasicMaterial({ map: ft, transparent: true, opacity: 0.85 })); fall.position.set(203, 4.2, -249.2); G.add(fall); a.anim.push(dt => { ft.offset.y += dt * 0.9; if (pl && d2(pl, { x: 203, z: -246 }) < 60 && chance(0.5)) puff(203 + R(-5, 5), 0.6, -246, 1, { c: [0.8, 0.9, 1], add: 0.6, sp: 1.2, up: 1.5, life: 1.2, size: 0.5, grav: 1 }); });
  const cl = []; for (let x = 150; x <= 262; x += 8) cl.push([x, -253, 0, 1 + ((x * 7) % 5) * 0.05]); for (let z = -245; z <= -205; z += 8) cl.push([268, z, -PI / 2, 1]); scatter('cliff', cl); addBox([146, -256, 270, -250.5], true); addBox([265, -250, 271, -202], true);
  // quarry walls
  const qc = []; for (let x = 122; x <= 178; x += 8) qc.push([x, 156, 0, 1]); for (let z = 160; z <= 208; z += 8) qc.push([182, z, -PI / 2, 1]); scatter('cliff', qc); addBox([118, 153, 182, 158.5], true); addBox([179.5, 156, 185, 212], true);
  // ---- town ----
  const cob = cobbleTex(); paved(-31, -29, 31, 29, cob); paved(-5, 29, 5, 118, cob); paved(31, -18, 80, -10, cob); paved(9, -62, 15, -29, cob);
  building('shop', -20, -35, 0, 9, 7); building('grill', 0, -35.5, 0, 12, 8); building('houseB', 24, -35, 0, 9, 7); building('hall', 42, 10, -PI / 2, 14, 9); building('church', 58, -44, 0, 10, 18);
  building('boarding', -46, -8, PI / 2, 14, 10); building('houseA', -20, 37, PI, 8, 7); building('houseC', 20, 37.5, PI, 10, 8); building('houseB', 42, 37, PI, 9, 7); building('tower', -16, -16, 0, 4.2, 4.2, 0);
  building('houseA', -15, 60, PI / 2, 8, 7); building('houseB', 15, 62, -PI / 2, 9, 7); building('houseC', -16, 83, PI / 2, 10, 8); building('houseA', 15, 85, -PI / 2, 8, 7); building('houseB', -15, 106, PI / 2, 9, 7); building('houseA', 15, 107, -PI / 2, 8, 7);
  building('houseA', -52, 22, PI / 2, 8, 7); building('shed', -56, -26, 0, 4, 3, 0);
  place('fountain', 0, 0, 0, 1, G); addCirc(0, 0, 2.3); place('gazebo', 17, 12, 0, 1, G); for (let i = 0; i < 8; i++) addCirc(17 + Math.cos(i * PI / 4 + PI / 8) * 2.9, 12 + Math.sin(i * PI / 4 + PI / 8) * 2.9, 0.2);
  place('board', 8.5, -30.4, 0, 1, G); addCirc(8.5, -30.4, 0.6); place('stall', -18, 14, PI / 2, 1, G); place('stall', -18, 20, PI / 2, 1, G); addBox([-19.2, 12.4, -16.8, 21.6], false);
  const lamps = [[-28, -26], [28, -26], [-28, 26], [28, 26], [4.6, -26.6] /* beside the Grill's door, not on the spot where you stand to talk to Marnie */, [-28, 0], [29, -8], [-9, -9], [9, 9], [-9, 9], [9, -9], [5, 50], [-5, 72], [5, 94], [-5, 114], [-50, 14], [-88, 30], [60, -16], [110, -22], [160, -34], [12, -58], [-40, -22], [48, 22]];
  lamps.forEach(l => { addCirc(l[0], l[1], 0.25); a.glows.push([l[0], l[1], 12, 0xff9a40]); lamp(l[0], l[1]); }); scatter('lamp', lamps);
  scatter('bench', [[-8, 8, 0], [8, -8, PI], [-10, -20, 0], [22, 20, -PI / 2], [-26, 10, PI / 2]]); scatter('car', [[9, 56, 0], [-9, 78, PI], [9, 100, 0], [34, -22, PI / 2]]); scatter('truck', [[-9, 96, PI], [52, 28, PI / 2]]);
  for (const c of [[9, 56, 0], [-9, 78, 0], [9, 100, 0], [-9, 96, 0]]) addBox([c[0] - 1, c[1] - 2.4, c[0] + 1, c[1] + 2.4], false); addBox([31.6, -23, 36.4, -21], false); addBox([49.4, 27, 54.6, 29], false);
  scatter('mailbox', [[-9.5, 62, PI / 2], [9.5, 64, -PI / 2], [-9.5, 85, PI / 2], [9.5, 87, -PI / 2]]); scatter('barrel', [[-6, -31, 0], [-7, -30.6, 0], [-38, -14, 0], [36, 16, 0]]); scatter('crate', [[-26, -31, 0.3], [-25, -30.4, 0], [38, 3, 0.2]]);
  // ---- cemetery ----
  const fences = []; fenceLine(CEM[0], CEM[1], CEM[2], CEM[1], fences); fenceLine(CEM[0], CEM[3], CEM[2], CEM[3], fences); fenceLine(CEM[0], CEM[1], CEM[0], CEM[3], fences); fenceLine(CEM[2], CEM[1], CEM[2], 37.6, fences); fenceLine(CEM[2], 42.4, CEM[2], CEM[3], fences);
  place('gate', CEM[2], 40, PI / 2, 1, G); addCirc(CEM[2], 37.6, 0.5); addCirc(CEM[2], 42.4, 0.5); building('crypt', -170, 20, 0, 5, 6, 0x2a3a66); building('crypt', -128, 64, PI, 5, 6, 0x2a3a66); place('angel', -150, 56, 0.4, 1, G); addCirc(-150, 56, 1); place('statue', -176, 62, 1, 1, G); addCirc(-176, 62, 0.8);
  const gr = [[], [], []], dead = [];
  for (let x = CEM[0] + 5; x <= CEM[2] - 5; x += 5) for (let z = CEM[1] + 5; z <= CEM[3] - 5; z += 5.5) { if (Math.abs(z - 40) < 3.4 || hyp(x + 170, z - 22) < 8 || hyp(x + 128, z - 62) < 8 || hyp(x + 150, z - 56) < 3 || rnd() < 0.22) continue; const gx = x + rr(-0.8, 0.8), gz = z + rr(-0.6, 0.6); gr[Math.floor(rnd() * 3)].push([gx, gz, rr(-0.25, 0.25), rr(0.9, 1.15)]); addCirc(gx, gz, 0.5); }
  gr.forEach((l, i) => scatter('grave' + (i + 1), l)); for (let i = 0; i < 14; i++) { const x = rr(CEM[0] + 3, CEM[2] - 3), z = rr(CEM[1] + 3, CEM[3] - 3); if (Math.abs(z - 40) < 4) continue; dead.push([x, z, rr(0, 6), rr(0.9, 1.4)]); addCirc(x, z, 0.5); }
  // ---- chapel ruins + tomb mouth ----
  const RU = { x: -130, z: -170 }; place('ruin', RU.x, RU.z, 0, 1, G);
  for (const b of [[-6.45, -9.45, 6.45, -8.55], [-6.45, -8.4, -5.55, 4.5], [5.55, -8.4, 6.45, 4.5], [-6.1, 4.5, -3.1, 7.5]]) addBox([RU.x + b[0], RU.z + b[1], RU.x + b[2], RU.z + b[3]], true);
  place('stairs', RU.x, RU.z - 5.4, 0, 1, G); addBox([RU.x - 2, RU.z - 6.2, RU.x + 2, RU.z - 4.9], true); a.glows.push([RU.x, RU.z - 3, 9, 0x6a4cff]); lamp(RU.x, RU.z - 3.5, 0x7a5cff, 1.6, 16, 2.5);
  scatter('brazier', [[RU.x - 4, RU.z + 2, 0], [RU.x + 4, RU.z + 2, 0]]); lamp(RU.x - 4, RU.z + 2, 0xff7a2a, 1.6, 14, 1.8); lamp(RU.x + 4, RU.z + 2, 0xff7a2a, 1.6, 14, 1.8); a.glows.push([RU.x - 4, RU.z + 2, 8, 0xff7a2a], [RU.x + 4, RU.z + 2, 8, 0xff7a2a]);
  addInter({ id: 'tomb', x: RU.x, z: RU.z - 3.6, r: 3, label: () => 'Descend into the Tomb', act: () => tombMenu() });
  // ---- coven hollow ----
  const stones = []; for (let i = 0; i < 9; i++) { const an = i * TAU / 9, x = -20 + Math.cos(an) * 10, z = -245 + Math.sin(an) * 10; stones.push([x, z, an, rr(0.9, 1.3)]); addCirc(x, z, 0.7); } scatter('standingstone', stones);
  place('altar', -20, -245, 0, 1, G); addBox([-21.3, -245.8, -18.7, -244.2], false); a.glows.push([-20, -245, 14, 0x6a4cff]); lamp(-20, -245, 0x8a6cff, 1.3, 18, 2);
  // ---- falls den, hunters' camp, lake, farm, manor, quarry ----
  const bl = []; for (let i = 0; i < 7; i++) { const an = 0.6 + i * 0.75, x = 168 + Math.cos(an) * 8, z = -222 + Math.sin(an) * 8; bl.push([x, z, an, rr(0.9, 1.4)]); addCirc(x, z, 1.5); } scatter('bones', [[166, -222, 0], [170, -224, 1], [169, -219, 2]]);
  scatter('tent', [[-236, -76, 0.4], [-226, -78, -0.3], [-238, -64, 1.2]]); [[-236, -76], [-226, -78], [-238, -64]].forEach(t => addCirc(t[0], t[1], 1.7)); place('campfire', -230, -70, 0, 1, G); addCirc(-230, -70, 0.9); lamp(-230, -70, 0xff7a2a, 2, 20, 1.5); a.glows.push([-230, -70, 13, 0xff7a2a]);
  scatter('crate', [[-224, -66, 0.2], [-223, -67.2, 0.5], [-224.4, -64.8, 0]]); place('scarecrow', -222, -76, -0.6, 1, G); addCirc(-222, -76, 0.4);
  building('cabin', -118, 166, -PI / 2, 6, 5); place('dock', -170, 238, PI, 1, G); place('boat', -165, 232, 0.5, 1, G); place('campfire', -112, 172, 0, 1, G); addCirc(-112, 172, 0.9); lamp(-112, 172, 0xff7a2a, 1.8, 18, 1.5); a.glows.push([-112, 172, 12, 0xff7a2a]);
  building('barn', 44, 212, PI, 10, 8, 0); building('houseA', 16, 213, PI, 8, 7); const wf = []; fenceLine(28, 220, 84, 220, wf); fenceLine(28, 258, 84, 258, wf); fenceLine(84, 220, 84, 258, wf); fenceLine(28, 228, 28, 258, wf); scatter('woodfence', wf);
  scatter('haybale', [[36, 204, 0], [38.2, 205, 1], [52, 218.6, 0.4], [70, 240, 0], [46, 236, 1]]); [[36, 204], [38.2, 205], [70, 240], [46, 236]].forEach(h => addCirc(h[0], h[1], 0.8)); place('scarecrow', 60, 238, 0.2, 1, G); addCirc(60, 238, 0.4); place('well', 26, 204, 0, 1, G); addCirc(26, 204, 1); place('cart', 30, 216, 0.4, 1, G);
  building('manor', 252, -50, -PI / 2, 24, 14, 0xff5a40); fenceLine(228, -80, 276, -80, fences); fenceLine(228, -20, 276, -20, fences); fenceLine(276, -80, 276, -20, fences); fenceLine(228, -80, 228, -53, fences); fenceLine(228, -47, 228, -20, fences);
  place('gate', 228, -50, PI / 2, 1, G); place('fountain', 236, -66, 0, 1, G); addCirc(236, -66, 2.3); scatter('statue', [[234, -40, PI / 2], [234, -60, PI / 2]]); addCirc(234, -40, 0.8); addCirc(234, -60, 0.8);
  [[231, -46], [231, -54], [244, -30], [244, -70]].forEach(l => { a.glows.push([l[0], l[1], 10, 0xff5a40]); lamp(l[0], l[1], 0xff6a50, 1.3, 15); addCirc(l[0], l[1], 0.25); }); scatter('lamp', [[231, -46], [231, -54], [244, -30], [244, -70]]);
  /* the pale planks and rails share the model's light wood, which goes near-white and blooms on a deck lying flat under the noon sun: this bridge gets its own darker copy, a shade off the brown planks */
  place('bridge', 203, -40, 0, 1, G).traverse(m => { if (m.isMesh && m.material && m.material.name === 'woodLight') { m.material = m.material.clone(); m.material.color.setHex(0x4a301c); } }); scatter('fence', fences);
  scatter('coffin', [[150, 196, 0.4], [156, 200, 1.2], [162, 192, -0.3], [146, 188, 2]]); scatter('bones', [[152, 190, 0], [160, 198, 1], [144, 196, 2], [166, 186, 3]]); scatter('torch', [[142, 182, 0], [166, 204, 0]]); lamp(142, 182, 0xff7a2a, 1.5, 15, 2); lamp(166, 204, 0xff7a2a, 1.5, 15, 2); a.glows.push([142, 182, 8, 0xff7a2a], [166, 204, 8, 0xff7a2a]);
  // ---- waypoints, chests, herbs ----
  const sp = []; for (const p of POI) { sp.push([p.x, p.z, 0]); addCirc(p.x, p.z, 0.3); a.glows.push([p.x, p.z, 6, 0xffc070]); addInter({ id: 'wp_' + p.id, x: p.x, z: p.z, r: 2.6, label: () => 'Waypoint: ' + p.n + ' (travel)', act: () => openMenu('map') }); } scatter('signpost', sp);
  const CH = [[-176, 26, 2], [-134, -177, 6], [-12, -253, 12], [234, -228, 10], [170, -229, 10], [162, 200, 14], [140, 204, 14], [-206, 214, 8], [66, 248, 3], [-244, -82, 5], [264, -30, 16], [250, 150, 16], [-250, 120, 5], [-262, -240, 8], [100, -272, 7], [272, -272, 12], [-60, 252, 4], [92, 62, 3], [-150, -60, 5], [60, -122, 5], [-182, 66, 3], [240, 240, 17], [-270, 10, 6], [130, -110, 6]];
  CH.forEach((c, i) => mkChest(c[0], c[1], 'c' + i, c[2]));
  const herbs = { vervain: [], wolfsbane: [], sage: [] }; let hid = 0;
  const herbZone = (kind, n, x1, z1, x2, z2) => { for (let i = 0, t = 0; i < n && t < 400; t++) { const x = rr(x1, x2), z = rr(z1, z2); if (!freeSpot(x, z, 1)) continue; i++; const id = 'h' + (hid++); herbs[kind].push([x, z, rr(0, 6), 1.2, 0, id]); } };
  herbZone('vervain', 16, -280, -280, 190, -70); herbZone('vervain', 5, -100, 86, 180, 280); herbZone('wolfsbane', 10, 100, -280, 190, -120); herbZone('wolfsbane', 8, -280, 100, -90, 280); herbZone('sage', 12, -90, 120, 180, 280); herbZone('sage', 8, 70, -60, 190, 130);
  for (const kind in herbs) for (const h of herbs[kind]) { const m = place(kind, h[0], h[1], h[2], 1.25, G), id = h[5]; a.glows.push([h[0], h[1], 2.6, kind === 'vervain' ? 0x9a5cff : kind === 'wolfsbane' ? 0xffe060 : 0xd0ffe0]);
    const it = addInter({ id, x: h[0], z: h[1], r: 2.2, m, label: () => m.visible ? 'Gather ' + CONS[kind].n : null, act: () => { m.visible = false; S.gath[id] = S.day; const n = 1 + (sk('w_herb') > 0 ? 1 : 0) + (chance(0.3) ? 1 : 0); addCons(kind, n); sfx('loot'); herbBurn(kind, n); puff(h[0], 0.6, h[1], 8, { c: GREEN, add: 0.7, sp: 1.5, up: 2, life: 0.6, size: 0.2, grav: 2 }); qEvent('gather', kind, n); } }); a.herbs = a.herbs || []; a.herbs.push(it); }
  // ---- wilderness ----
  const tr = { pine: [], pineTall: [], oak: [], birch: [], willow: [] }, bushes = [], rocks = [], boulders = [], stumps = [], logs = [], shrooms = [], grass = [], reeds = [];
  for (let i = 0; i < 3400; i++) { const x = rr(-WS + 6, WS - 6), z = rr(-WS + 6, WS - 6), north = z < -64 && x < 196, east = x > 212; if (!freeSpot(x, z)) continue; if (!north && !east && rnd() < 0.62) continue;
    const k = north ? (rnd() < 0.5 ? 'pine' : rnd() < 0.7 ? 'pineTall' : rnd() < 0.6 ? 'oak' : 'birch') : east ? (rnd() < 0.6 ? 'pineTall' : 'oak') : (rnd() < 0.4 ? 'oak' : rnd() < 0.6 ? 'birch' : 'pine'); tr[k].push([x, z, rr(0, 6), rr(0.85, 1.35)]); addCirc(x, z, k === 'oak' ? 0.6 : 0.45); }
  for (let i = 0; i < 16; i++) { const an = rnd() * TAU, d = LAKE[2] + rr(4, 9), x = LAKE[0] + Math.cos(an) * d, z = LAKE[1] + Math.sin(an) * d; if (hyp(x + 118, z - 166) > 9) { tr.willow.push([x, z, rr(0, 6), rr(0.9, 1.2)]); addCirc(x, z, 0.6); } const d2_ = LAKE[2] + rr(0.5, 2); reeds.push([LAKE[0] + Math.cos(an + 1) * d2_, LAKE[1] + Math.sin(an + 1) * d2_, 0, rr(0.9, 1.4)]); }
  for (let i = 0; i < 26; i++) { const x = rr(-60, 20), z = rr(-285, -205); if (hyp(x + 20, z + 245) > 13 && freeSpot(x, z, -4)) { dead.push([x, z, rr(0, 6), rr(1, 1.6)]); addCirc(x, z, 0.5); } }
  for (const k in tr) scatter(k, tr[k]); scatter('deadtree', dead);
  for (let i = 0; i < 900; i++) { const x = rr(-WS + 6, WS - 6), z = rr(-WS + 6, WS - 6); if (!freeSpot(x, z, -1)) continue; const q = rnd(); if (q < 0.45) bushes.push([x, z, rr(0, 6), rr(0.6, 1.3)]); else if (q < 0.7) rocks.push([x, z, rr(0, 6), rr(0.6, 1.3)]); else if (q < 0.78) { boulders.push([x, z, rr(0, 6), rr(0.7, 1.2)]); addCirc(x, z, 1.3); } else if (q < 0.86) { stumps.push([x, z, rr(0, 6), 1]); addCirc(x, z, 0.4); } else if (q < 0.92) logs.push([x, z, rr(0, 6), 1]); else shrooms.push([x, z, rr(0, 6), rr(0.8, 1.4)]); }
  boulders.push(...bl); for (let i = 0; i < 14; i++) { const an = rnd() * TAU, d = rr(8, 26); boulders.push([150 + Math.cos(an) * d, 186 + Math.sin(an) * d * 0.8, rr(0, 6), rr(0.6, 1.3)]); addCirc(boulders[boulders.length - 1][0], boulders[boulders.length - 1][1], 1.3); }
  shrooms.forEach(s => a.glows.push([s[0], s[1], 2.4, 0x40ffd0]));
  for (let i = 0; i < 5200; i++) { const x = rr(-WS + 6, WS - 6), z = rr(-WS + 6, WS - 6); if (freeSpot(x, z, -2.5)) grass.push([x, z, rr(0, 6), rr(0.8, 1.6)]); }
  scatter('bush', bushes); scatter('rock', rocks); scatter('boulder', boulders); scatter('stump', stumps); scatter('log', logs); scatter('mushroom', shrooms, { shadow: false }); scatter('grass', grass, { shadow: false }); scatter('reeds', reeds, { shadow: false });
  // fireflies
  const fp = new Float32Array(700 * 3); for (let i = 0; i < 700; i++) { fp[i * 3] = rr(-WS, WS); fp[i * 3 + 1] = rr(0.5, 3.2); fp[i * 3 + 2] = rr(-WS, WS); }
  const fgeo = new T.BufferGeometry(); fgeo.setAttribute('position', new T.BufferAttribute(fp, 3)); a.flies = new T.Points(fgeo, new T.PointsMaterial({ color: 0xd8ff9a, size: 0.24, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false })); G.add(a.flies);
  buildGlows(a); hashArea(a); BA = null; return a;
}
/* vervain burns a vampire's skin and wolfsbane a werewolf's, even to pick; a hybrid is hurt by both */
function herbBurn(kind, n) {
  const v = kind === 'vervain' && isVamp(), w = kind === 'wolfsbane' && isWolf(); if (!v && !w) return;
  pl.hp = Math.max(1, pl.hp - P.maxHp * 0.05 * n); pl.fx[v ? 'verv' : 'wolfsbane'] = Math.max(pl.fx[v ? 'verv' : 'wolfsbane'] || 0, 4); pl.flash = 0.1; RT.hurtV = Math.max(RT.hurtV, 0.4); sfx('hurt'); puff(pl.x, 1.1, pl.z, 6, { c: v ? VERV : SPARK, add: 1, sp: 1.5, up: 1.5, life: 0.5, size: 0.16, grav: 0 });
  toast(v ? 'The vervain blisters your fingers to the bone. You pick it anyway.' : 'The wolfsbane raises welts wherever it touches you.');
}
function mkChest(x, z, id, lvl, big) {
  const rig = mkRig('chest', {}, big ? 1.4 : 1.15); rig.g.position.set(x, 0, z); rig.g.rotation.y = (x * 13 + z * 7) % 6; shadowed(rig.g); BA.group.add(rig.g); addCirc(x, z, 0.7); BA.glows.push([x, z, 4, big ? 0xffc040 : 0xb0a060]);
  const c = addInter({ id, x, z, r: 2.4, rig, lvl, big, open: false, label: () => c.open || !c.rig.g.visible ? null : 'Open the chest', act: () => openChest(c) }); (BA.chests = BA.chests || []).push(c); return c;
}
function setChest(c, open) { c.open = open; const lid = c.rig.P.Lid; if (lid) lid.rotation.x = open ? 1.9 : 0; }
function openChest(c) {
  setChest(c, true); sfx('open'); storyChest(c); if (RT.area.id === 'world') S.opened[c.id] = S.day;
  const lv = RT.area.id === 'tomb' ? RT.area.lvl : Math.max(c.lvl, Math.floor(c.lvl * 0.5 + S.lvl * 0.6)); dropLoot(c.x, c.z, lv, { n: c.big ? 4 : 2, bias: c.big ? 1.2 : 0.5, gold: (8 + lv * 5) * (c.big ? 3 : 1) }); puff(c.x, 1, c.z, 14, { c: HOLY, add: 0.9, sp: 2, up: 3, life: 0.7, size: 0.22, grav: 3 });
}
function refreshWorld() {   // respawn chests after 3 days and herbs next morning
  if (!WORLD) return; for (const c of WORLD.chests) setChest(c, S.opened[c.id] != null && S.day - S.opened[c.id] < 3); for (const h of WORLD.herbs) h.m.visible = !(S.gath[h.id] != null && S.day <= S.gath[h.id]);
}

/* ---------------- the Tomb: procedural floors ---------------- */
const TC = 4;  // cell size
function stoneTex() { const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); g.fillStyle = '#2c2c34'; g.fillRect(0, 0, 512, 512); const used = {}; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { if (used[i + ',' + j]) continue; const wide = i < 7 && !used[(i + 1) + ',' + j] && Math.random() < 0.3, tall = !wide && j < 7 && Math.random() < 0.2; if (wide) used[(i + 1) + ',' + j] = 1; if (tall) used[i + ',' + (j + 1)] = 1; const v = 96 + Math.random() * 50 | 0; g.fillStyle = `rgb(${v},${v},${v + 10})`; g.fillRect(i * 64 + 3, j * 64 + 3, (wide ? 128 : 64) - 6, (tall ? 128 : 64) - 6); }
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.22})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 3, 2); } g.strokeStyle = 'rgba(10,10,14,.6)'; g.lineWidth = 2; for (let i = 0; i < 12; i++) { let x = Math.random() * 512, y = Math.random() * 512; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); } const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; return t; }
let stoneT = null;
const TOMBMODS = [{ n: 'Swarm', d: 'half again as many, each a little weaker.', count: 1.6, hp: 0.7 }, { n: 'Champions', d: 'many of the dead here kept their names.', elite: 0.3 }, { n: 'Vault', d: 'more chests, and stronger guards.', chest: 0.4, lvl: 2 }, { n: 'Blood Moon', d: 'they hit harder. They are worth more.', dmg: 1.25, xp: 1.6 }, { n: 'Ossuary', d: 'tougher dead, by a third.', hp: 1.35, xp: 1.3 }];
/* Floors 1 to 4 are the tomb of 1864: the vampires a Thorne witch sealed under Fell's Church, starved grey and still waiting. The older prison lies below.
   Its keepers: the Warden on 5, Corvin on 10, the Sleeper and the Cure on 20. A keeper who has truly died does not come back; a nameless elder takes the floor.
   Only the Warden is ever lent to another keeper floor: the people of the surface stories (Mother Lenore of the quarry, the Hundred of Coven Hollow) belong where their quests are, and killing a copy down here would settle those quests.
   Nothing in wolf form is ever down here. There is no moon underground. */
const TOMBKEEP = { 5: 'warden', 10: 'corvin', 20: 'sleeper' }, TOMBROTA = ['warden'];
function tombBoss(d) { const sl = S.flags.slain || {}, fate = S.flags.corvinFate, ok = t => t && EN[t] && !sl[t] && !lineDead(EN[t]) && !(t === 'corvin' && (fate === 'desic' || fate === 'bargain')); let t = ok(TOMBKEEP[d]) ? TOMBKEEP[d] : null; for (let i = 0; i < TOMBROTA.length && !t; i++) { const c = TOMBROTA[(d / 5 + i) % TOMBROTA.length]; if (ok(c)) t = c; } return t || 'elder'; }
function tombTable(d) {
  const t = d < 5 ? ['tombvamp'] : d < 10 ? ['stalker', 'cultist', 'thrall', 'warlock', 'shade'] : d < 15 ? ['stalker', 'elder', 'warlock', 'shade', 'cultist'] : ['elder', 'warlock', 'hybrid', 'stalker', 'shade', 'elder'];
  const ok = t.filter(k => EN[k] && !EN[k].boss && !EN[k].full && !(EN[k].fam === 'wolf' && EN[k].rig !== 'human') && needOk(EN[k], true) && !lineDead(EN[k])); return ok.length ? ok : [EN.feral ? 'feral' : Object.keys(EN)[0]];
}
function genTomb(depth) {
  const a = BA = mkArea('tomb'), rnd = mkRng((S.seed * 7919 + depth * 104729 + S.runs * 31) | 0), rr = (x, y) => x + rnd() * (y - x), ri = (x, y) => Math.floor(rr(x, y + 1)), N = 44, grid = new Uint8Array(N * N), boss = depth % 5 === 0;
  a.depth = depth; a.lvl = 2 + Math.floor(depth * 1.7); a.boss = boss; a.spawns = []; a.cleared = false; const G = a.group, rooms = [];
  const mod = a.mod = !boss && depth >= 3 && rnd() < 0.4 ? TOMBMODS[Math.floor(rnd() * TOMBMODS.length)] : null; if (mod && mod.lvl) a.lvl += mod.lvl;
  const carve = (x1, z1, x2, z2) => { for (let x = x1; x <= x2; x++) for (let z = z1; z <= z2; z++) if (x > 0 && z > 0 && x < N - 1 && z < N - 1) grid[x + z * N] = 1; };
  if (boss) { rooms.push({ x: 15, z: 26, w: 5, h: 4 }, { x: 11, z: 9, w: 12, h: 12 }); carve(15, 26, 19, 29); carve(16, 21, 18, 26); carve(11, 9, 22, 20); }
  else { const want = Math.min(9, 5 + Math.floor(depth / 3)); for (let t = 0; rooms.length < want && t < 300; t++) { const w = ri(4, 7), h = ri(4, 7), x = ri(2, N - w - 3), z = ri(2, N - h - 3); if (rooms.some(r => x < r.x + r.w + 2 && x + w + 2 > r.x && z < r.z + r.h + 2 && z + h + 2 > r.z)) continue; rooms.push({ x, z, w, h }); }
    rooms.sort((p, q) => (p.x + p.z) - (q.x + q.z)); for (const r of rooms) carve(r.x, r.z, r.x + r.w - 1, r.z + r.h - 1);
    for (let i = 1; i < rooms.length; i++) { const p = rooms[i - 1], q = rooms[i], px = Math.floor(p.x + p.w / 2), pz = Math.floor(p.z + p.h / 2), qx = Math.floor(q.x + q.w / 2), qz = Math.floor(q.z + q.h / 2); if (rnd() < 0.5) { carve(Math.min(px, qx), pz, Math.max(px, qx), pz + 1); carve(qx, Math.min(pz, qz), qx + 1, Math.max(pz, qz)); } else { carve(px, Math.min(pz, qz), px + 1, Math.max(pz, qz)); carve(Math.min(px, qx), qz, Math.max(px, qx), qz + 1); } } }
  const W = c => (c - N / 2 + 0.5) * TC, walls = [], isF = (x, z) => x >= 0 && z >= 0 && x < N && z < N && grid[x + z * N];
  for (let z = 0; z < N; z++) { let run = null; for (let x = 0; x < N; x++) { let wall = false; if (!grid[x + z * N]) for (let i = -1; i <= 1 && !wall; i++) for (let j = -1; j <= 1; j++) if (isF(x + i, z + j)) { wall = true; break; }
      if (wall) { walls.push([W(x), W(z), 0, 1]); if (run) run[2] = W(x) + TC / 2; else { run = [W(x) - TC / 2, W(z) - TC / 2, W(x) + TC / 2, W(z) + TC / 2]; addBox(run, true); } } else run = null; } }
  scatter('tombwall', walls); a.bounds = [-N * TC / 2, -N * TC / 2, N * TC / 2, N * TC / 2];
  stoneT = stoneT || stoneTex(); const ft = stoneT.clone(); ft.needsUpdate = true; ft.repeat.set(N * TC / 8, N * TC / 8); const tint = [0x8a8aa0, 0x7a9a8a, 0xa08878, 0x9a7a9a][Math.floor((depth - 1) / 5) % 4];
  const fl = new T.Mesh(new T.PlaneGeometry(N * TC, N * TC).rotateX(-PI / 2), new T.MeshStandardMaterial({ map: ft, roughness: 0.95, color: tint })); fl.receiveShadow = true; G.add(fl);
  const rc = r => ({ x: W(r.x) + (r.w - 1) * TC / 2, z: W(r.z) + (r.h - 1) * TC / 2 }), rp = (r, m = 1.2) => ({ x: rr(W(r.x) - TC / 2 + m, W(r.x + r.w - 1) + TC / 2 - m), z: rr(W(r.z) - TC / 2 + m, W(r.z + r.h - 1) + TC / 2 - m) });
  const braz = [], pil = [], cof = [], sar = [], bon = [], rub = [], stat = [];
  rooms.forEach((r, i) => { const x1 = W(r.x) - TC / 2 + 1.1, x2 = W(r.x + r.w - 1) + TC / 2 - 1.1, z1 = W(r.z) - TC / 2 + 1.1, z2 = W(r.z + r.h - 1) + TC / 2 - 1.1;
    for (const c of [[x1, z1], [x2, z2], ...(r.w * r.h > 30 ? [[x2, z1], [x1, z2]] : [])]) { braz.push([c[0], c[1], 0, 1]); addCirc(c[0], c[1], 0.5); lamp(c[0], c[1], 0xff7a2a, 1.7, 17, 1.8); a.glows.push([c[0], c[1], 9, 0xff7a2a]); }
    if (boss && i === 1) for (const c of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = rc(r); pil.push([p.x + c[0] * 11, p.z + c[1] * 11, 0, 1.2]); addCirc(p.x + c[0] * 11, p.z + c[1] * 11, 0.9); BA.los.push([p.x + c[0] * 11 - 0.7, p.z + c[1] * 11 - 0.7, p.x + c[0] * 11 + 0.7, p.z + c[1] * 11 + 0.7]); }
    if (!boss) { const n = ri(1, 4); for (let k = 0; k < n; k++) { const p = rp(r, 2), q = rnd(); if (hyp(p.x - rc(r).x, p.z - rc(r).z) < 2.5) continue; if (q < 0.25) { cof.push([p.x, p.z, rr(0, 6), 1]); addCirc(p.x, p.z, 0.9); } else if (q < 0.4) { sar.push([p.x, p.z, ri(0, 1) * PI / 2, 1]); addCirc(p.x, p.z, 1.2); } else if (q < 0.5) { stat.push([p.x, p.z, rr(0, 6), 1]); addCirc(p.x, p.z, 0.8); } else if (q < 0.6) { pil.push([p.x, p.z, 0, 1]); addCirc(p.x, p.z, 0.8); } else if (q < 0.8) bon.push([p.x, p.z, rr(0, 6), 1]); else rub.push([p.x, p.z, rr(0, 6), 1]); } } });
  scatter('brazier', braz); scatter('tombpillar', pil); scatter('coffin', cof); scatter('sarcophagus', sar); scatter('bones', bon); scatter('rubble', rub); scatter('statue', stat);
  const st = rc(rooms[0]), ex = rc(rooms[rooms.length - 1]); a.start = st; a.exit = boss ? { x: ex.x, z: ex.z - 20 } : ex;
  place('portal', st.x, st.z + (boss ? 3 : 0), 0, 0.8, G); a.glows.push([st.x, st.z + (boss ? 3 : 0), 7, 0x6a4cff]);
  addInter({ x: st.x, z: st.z + (boss ? 3 : 0), r: 2.4, label: () => 'Return to the surface', act: () => leaveTomb() });
  const sx = a.exit.x, sz = a.exit.z; a.stairs = place('stairs', sx, sz, 0, 1, G); addBox([sx - 2, sz - 0.9, sx + 2, sz + 0.5], true); lamp(sx, sz + 2, 0x7a5cff, 1.4, 14, 2.5); a.glows.push([sx, sz + 2.5, 8, 0x6a4cff]);
  addInter({ x: sx, z: sz + 1.8, r: 3, label: () => a.cleared ? 'Descend to floor ' + (depth + 1) : (boss ? 'Sealed until its keeper falls' : `Sealed: ${Math.max(0, a.need - a.killed)} more must fall`), act: () => { if (a.cleared) descend(); else { sfx('deny'); toast('The seal feeds on the dead. It is not satisfied yet.'); } } });
  // enemies and chests
  const table = tombTable(depth);
  if (boss) { const p = rc(rooms[1]), kt = tombBoss(depth); a.keeper = kt; a.spawns.push({ x: p.x, z: p.z - 4, type: kt, boss: 1, elite: !EN[kt].boss }); a.need = 1; mkChest(p.x + 5, p.z - 19, 'bc', a.lvl, true); a.chests[0].locked = true; a.chests[0].rig.g.visible = false;
    if (kt === 'sleeper') {   // the Sleeper's door: sealed by a witch two thousand years ago, and it opens for a witch of the Thorne line or for Odette's talisman
      const dz = W(23), box = [W(16) - TC / 2, dz - TC / 2, W(18) + TC / 2, dz + TC / 2], slabs = [16, 17, 18].map(c => place('tombwall', W(c), dz, 0, 1, G)); addBox(box, true); a.glows.push([W(17), dz + 3.2, 9, 0x6a4cff]); lamp(W(17), dz + 3.4, 0x7a5cff, 1.5, 15, 2.6);
      const door = addInter({ x: W(17), z: dz + 3, r: 6, open: false, label: () => door.open ? null : 'A sealed door, far older than the church', act: () => { let can = false; try { can = !!canOpenSleeper(); } catch (er) { can = false; }
        if (!can) { sfx('deny'); return toast('The stone does not move. A witch sealed this door, and it wants a witch of the Thorne line, or her talisman.'); }
        door.open = true; for (const m of slabs) G.remove(m); for (const l of [a.boxes, a.los]) { const i = l.indexOf(box); if (i >= 0) l.splice(i, 1); } hashArea(a); sfx('open'); sfx('boom'); RT.shake = Math.max(RT.shake, 0.5); ringFx(W(17), dz, 0x8a6cff, 9, 1); puff(W(17), 1.5, dz, 40, { c: ASH, add: 0.1, sp: 3, up: 2, life: 1.2, size: 0.4, grav: 2, spread: 4 }); toast('The seal knows what you carry. Stone grinds on stone, and the air that comes out is two thousand years old.'); } }); a.door = door; } }
  else { let font = depth >= 2 && rnd() < 0.55; rooms.forEach((r, i) => { if (i === 0) return; const n = Math.round(Math.min(7, 1 + Math.floor(r.w * r.h / 11) + Math.floor(depth / 6)) * (mod && mod.count || 1)); for (let k = 0; k < n; k++) { const p = rp(r, 2.5); a.spawns.push({ x: p.x, z: p.z, type: table[Math.floor(rnd() * table.length)], elite: rnd() < Math.min(0.45, 0.04 + depth * 0.012) + (mod && mod.elite || 0) }); }
      if (i > 0 && i < rooms.length - 1 && rnd() < 0.42 + (mod && mod.chest || 0)) { const p = rp(r, 2.2); mkChest(p.x, p.z, 'tc' + i, a.lvl, rnd() < 0.15 + (mod && mod.chest ? 0.2 : 0)); }
      if (font && i >= 2 && i < rooms.length - 1) { font = false; const p = rc(r); place('fountain', p.x, p.z, 0, 0.7, G); addCirc(p.x, p.z, 1.7); a.glows.push([p.x, p.z, 9, 0xb01020]); lamp(p.x, p.z, 0xff2030, 1.2, 14, 1.5); const f = addInter({ x: p.x, z: p.z, r: 3.2, used: false, label: () => f.used ? null : 'Drink from the blood font', act: () => { f.used = true; heal(P.maxHp); if (S.origin !== 'siphoner') pl.foc = P.maxFoc; if (isVamp()) pl.blood = P.maxBlood; sfx('heal'); ringFx(p.x, p.z, 0xff2030, 5, 0.7); toast(venomed() ? 'Old blood, kept warm by something. It fills you, and it closes nothing while the venom is in you.' : isVamp() ? 'Old blood, kept warm by something. You are whole.' : 'It is only water, here. Somehow. You are whole.'); } }); } }); a.need = Math.ceil(a.spawns.length * 0.7); }
  a.killed = 0; a.fog = [0x05060a, 0x050a08, 0x0a0606, 0x08050a][Math.floor((depth - 1) / 5) % 4]; buildGlows(a); hashArea(a); BA = null; return a;
}
function disposeArea(a) { a.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); scene.remove(a.group); }

/* ---------------- time, sky, weather ---------------- */
const moonDay = () => S.clock < 6 ? S.day - 1 : S.day;   // a night keeps the moon it rose with: past midnight, until dawn
const isNight = () => S.clock >= 20 || S.clock < 6, sunUp = () => S.clock >= 6.5 && S.clock < 19.5, moonPhase = () => (moonDay() + 2) % 8, fullMoon = () => moonPhase() === 4;
/* out of the sun: close under the eaves of any building. Being let across a threshold is another matter (the invitation rule lives with the people who own the doors). */
function shelterAt(x, z) { const a = RT.area; if (!a || a.id !== 'world') return null; for (const b of a.fade) if (Math.abs(x - b.x) < b.w / 2 + 2.2 && Math.abs(z - b.z) < b.d / 2 + 2.2) return b; return null; }
const fmtClock = c => { const h24 = Math.floor(c) % 24, m = Math.floor((c % 1) * 60), h = h24 % 12 || 12; return h + ':' + String(m).padStart(2, '0') + (h24 >= 12 ? ' PM' : ' AM'); };
const SKY = [ // [hour, fog, hemiSky, hemiGround, sun, hemiI, sunI]
  [0, 0x0a1120, 0x6a88cc, 0x1a2130, 0xa6bdf2, 0.72, 1.0], [5, 0x0a1120, 0x6a88cc, 0x1a2130, 0xa6bdf2, 0.72, 1.0], [6.3, 0x6b4a52, 0xe09a8a, 0x3a2a30, 0xff9a5a, 0.85, 1.25], [8, 0x9fb6c9, 0xcfe0ff, 0x5a5a48, 0xfff0d8, 0.95, 1.45],
  [17, 0x9fb6c9, 0xcfe0ff, 0x5a5a48, 0xfff0d8, 0.95, 1.45], [19, 0x7a4a3a, 0xf0a070, 0x3a2a28, 0xff7a3a, 0.85, 1.3], [20.3, 0x0a1120, 0x6a88cc, 0x1a2130, 0xa6bdf2, 0.72, 1.0], [24, 0x0a1120, 0x6a88cc, 0x1a2130, 0xa6bdf2, 0.72, 1.0]];
const cA = new T.Color(), cB = new T.Color(), GREY = new T.Color(0x56607a);
let weatherT = 0, boltT = 0;
function updSky(dt) {
  const u = mFinal.uniforms, a = RT.area;
  if (a.id === 'tomb') { scene.fog.color.setHex(a.fog); scene.fog.near = 22; scene.fog.far = 62; scene.background.copy(scene.fog.color); hemi.color.setHex(0x5a5a78); hemi.groundColor.setHex(0x101014); hemi.intensity = 0.5; sun.color.setHex(0x8088b0); sun.intensity = 0.55; u.bloom.value = 1.15; }
  else { let i = 0; while (i < SKY.length - 2 && S.clock >= SKY[i + 1][0]) i++; const p = SKY[i], q = SKY[i + 1], t = sstep(p[0], q[0], S.clock), mix = (k, out) => out.copy(cA.setHex(p[k])).lerp(cB.setHex(q[k]), t);
    mix(1, scene.fog.color); mix(2, hemi.color); mix(3, hemi.groundColor); mix(4, sun.color); hemi.intensity = lerp(p[5], q[5], t); sun.intensity = lerp(p[6], q[6], t);
    const w = S.weather, wet = w === 'rain' || w === 'storm'; if (wet) { scene.fog.color.multiplyScalar(0.72); hemi.intensity *= 0.85; sun.intensity *= 0.6; }
    scene.fog.near = w === 'fog' ? 12 : 36; scene.fog.far = w === 'fog' ? 52 : wet ? 74 : 94; scene.background.copy(scene.fog.color); u.bloom.value = isNight() ? 1.0 : 0.55;
    if (a.flies) { a.flies.material.opacity = isNight() && !wet ? 0.9 : 0; a.flies.position.y = Math.sin(RT.time * 0.6) * 0.3; }
    if (wet && !RT.paused) { for (let k = 0; k < (w === 'storm' ? 14 : 8); k++) puff(pl.x + R(-26, 26), R(8, 14), pl.z + R(-20, 22), 1, { c: [0.6, 0.7, 0.9], add: 0.5, sp: 0, up: -16, vx: -3, life: 0.7, size: 0.1, grav: 30, spread: 0 });
      if (w === 'storm') { boltT -= dt; if (boltT <= 0) { boltT = R(6, 18); RT.flashV = 0.5; setTimeout(() => sfx('thunder'), R(200, 1200)); } } }
    weatherT -= dt; if (weatherT <= 0) { weatherT = R(150, 420); const r = Math.random(); S.weather = r < 0.55 ? 'clear' : r < 0.75 ? 'fog' : r < 0.93 ? 'rain' : 'storm'; } }
  // moods
  if (pl) RT.indoors = a.id === 'world' && !!shelterAt(pl.x, pl.z);
  const off = pl && !!S.switchOff && S.species !== 'human', wolf = pl && pl.wolf, charm = pl && pl.fx.charm > 0, sick = pl && RT.sick > 0, glare = pl && RT.glare > 0, pulse = 0.5 + Math.sin(RT.time * 2.3) * 0.5;
  u.sat.value = lerp(u.sat.value, off ? 0.35 : charm ? 0.55 : wolf ? 0.82 : sick ? 0.8 + pulse * 0.5 : 1.08, 0.08);
  u.tint.value.lerp(off ? cA.setRGB(1.1, 0.92, 0.92) : charm ? cA.setRGB(1.02, 0.9, 1.16) : glare ? cA.setRGB(1.3, 1.24, 1.08) : sick ? cA.setRGB(0.92 + pulse * 0.1, 1.06, 0.84) : wolf ? cA.setRGB(1.06, 1, 0.9) : cA.setRGB(1, 1, 1), 0.08);
  if (glare) { u.bloom.value = 1.5; RT.flashV = Math.max(RT.flashV, 0.05 + pulse * 0.04); }   // in transition the daylight only hurts the eyes
  RT.hurtV = Math.max(0, RT.hurtV - dt * 1.6); RT.flashV = Math.max(0, RT.flashV - dt * 2.2); u.hurt.value = Math.max(RT.hurtV, pl && pl.hp < P.maxHp * 0.25 && !pl.dead ? 0.35 + Math.sin(RT.time * 5) * 0.12 : 0, pl && pl.burning ? 0.5 : 0); u.flash.value = RT.flashV;
  for (const f of a.anim) f(dt);
}
/* four real point lights follow whichever light sources are closest to the player */
function updLights() {
  const L = RT.area.lights, best = []; for (const l of L) { const d = hyp(l.x - pl.x, l.z - pl.z); if (d < 46) best.push([d, l]); } best.sort((p, q) => p[0] - q[0]);
  const night = RT.area.id === 'tomb' ? 1 : isNight() ? 1 : S.clock > 18.5 || S.clock < 7.5 ? 0.6 : 0;
  for (let i = 0; i < 4; i++) { const pL = plights[i], b = best[i]; if (!b || !night) { pL.intensity = 0; continue; } const l = b[1]; pL.position.set(l.x, l.y, l.z); pL.color.setHex(l.c); pL.distance = l.d; pL.intensity = l.i * night * (0.9 + Math.sin(RT.time * 9 + i * 2) * 0.06 + Math.sin(RT.time * 23 + i) * 0.04); }
  if (RT.area.glowMesh) RT.area.glowMesh.material.opacity = RT.area.id === 'tomb' ? 1 : lerp(0.12, 1, night); if (RT.area.id === 'tomb') { aura.intensity = 1.5 + Math.sin(RT.time * 10) * 0.08; aura.distance = 20; aura.color.setHex(0xffc890); } else { aura.intensity = night ? 0.4 : 0; aura.distance = 12; aura.color.setHex(0x9fb4ff); }
}
const zoneAt = (x, z) => { for (const q of ZONES) { if (q.r ? (x > q.r[0] && x < q.r[2] && z > q.r[1] && z < q.r[3]) : hyp(x - q.c[0], z - q.c[1]) < q.c[2]) return q; } return ZONES[ZONES.length - 1]; };

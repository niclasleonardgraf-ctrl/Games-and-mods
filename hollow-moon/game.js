/* Hollow Moon — game logic. Models come from Blender (tools/build_models.py -> assets/models.js). */
(() => { 'use strict';
const T = THREE, $ = id => document.getElementById(id), PI = Math.PI, hyp = Math.hypot;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
let seed = 4242;
const rnd = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const rr = (a, b) => a + rnd() * (b - a), R = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
const d2 = (a, b) => hyp(a.x - b.x, a.z - b.z);
const angd = (a, b) => { let d = (a - b) % (2 * PI); if (d > PI) d -= 2 * PI; if (d < -PI) d += 2 * PI; return d; };

/* ---------------- state ---------------- */
const S = { stage: 0, clock: 21, sus: 0, hum: 80, off: false, offKills: 0, locked: false, blood: 30, hp: 100, kills: 0, feeds: 0, clean: 0,
  hunterKills: 0, lapis: false, verv: false, ring: '', paused: true, over: false, senses: false, fight: false, dawned: false, day: 0, time: 0 };
const F = {};                       // one-shot flags
const ents = [], bodies = [], shots = [], fxs = [], BOX = [], LOSB = [], CIRC = [], FADE = [], GLOWS = [], MODELS = {};
const RU = { x: -40, z: -74 }, CR = { x: -82, z: 48 }, BR = { x: 93, z: -30 };
const ROADS = [[[-36, 60], [-10, 40], [6, 36]], [[22, 0], [22, -24], [-10, -46], [-40, -60]], [[54, 2], [70, -22], [80, -30]], [[30, 46], [30, 118]]];
const ZONES = [[60, -3, 77, 10], [-48, -85, -32, -64]];   // Council ground: garden, chapel
let pl, witch, sire, captain, keeper, lapisM, vervM, touch = false, shake = 0;

/* ---------------- renderer ---------------- */
const ren = new T.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
ren.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); ren.outputEncoding = T.sRGBEncoding;
ren.toneMapping = T.ACESFilmicToneMapping; ren.toneMappingExposure = 1.25;
ren.shadowMap.enabled = true; ren.shadowMap.type = T.PCFSoftShadowMap;
const scene = new T.Scene(); scene.background = new T.Color(0x0b1220); scene.fog = new T.Fog(0x0b1220, 34, 86);
const cam = new T.PerspectiveCamera(42, 1, 1, 260);
const hemi = new T.HemisphereLight(0x6f8fd0, 0x1b2230, 0.8); scene.add(hemi);
const moon = new T.DirectionalLight(0xa9c0f5, 1.15); moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 1, far: 160 }); moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.04;
scene.add(moon, moon.target);
const aura = new T.PointLight(0x9fb4ff, 0.4, 12, 1.6); scene.add(aura);
const fire = new T.PointLight(0xff7a2a, 2.2, 22, 1.8); fire.position.set(-5, 1.6, -46); scene.add(fire);
function resize() { const w = innerWidth, h = innerHeight; ren.setSize(w, h, false); cam.aspect = w / h; cam.fov = w < h ? 58 : 42; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

/* ---------------- audio (all synthesised) ---------------- */
let AC, master;
function audio() {
  if (AC) return; try {
    AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = 0.7; master.connect(AC.destination);
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170; const g = AC.createGain(); g.gain.value = 0.11; lp.connect(g); g.connect(master);
    for (const f of [55, 55.7, 82.4]) { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); }
    const buf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = AC.createBufferSource(); n.buffer = buf; n.loop = true; const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    const ng = AC.createGain(); ng.gain.value = 0.035; n.connect(bp); bp.connect(ng); ng.connect(master); n.start();
    const l = AC.createOscillator(); l.frequency.value = 0.13; const lg = AC.createGain(); lg.gain.value = 240; l.connect(lg); lg.connect(bp.frequency); l.start();
  } catch (e) { AC = null; }
}
function tone(f, dur, type = 'sine', vol = 0.2, slide = 0) {
  if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime; o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
const beat = v => { tone(58, 0.16, 'sine', v); setTimeout(() => tone(48, 0.2, 'sine', v * 0.7), 140); };
let beatT = 0;

/* ---------------- text ---------------- */
const DIARY = {
  wake: ["I died tonight. I remember Wickery Bridge, a man called Ambrose, his wrist against my mouth, and then the sound my own neck made. I woke in a crypt with a heartbeat in my ears that is not mine. It belongs to the groundskeeper outside. I have never been this hungry. The sun comes up at six.", "Woke up dead. Hungry."],
  fed_clean: ["I stopped. I actually stopped. His pulse was fluttering against my teeth and I let go. If I look him in the eyes and tell him he tripped, he will believe me. Is that mercy, or only a neater kind of theft?", "Fed. Left it breathing. Habit, I suppose."],
  fed_kill: ["The heart stuttered and I kept going. There was a child's drawing folded in the jacket pocket. I am writing that down so I can never pretend I did not see it.", "Another one. They are so loud, right up until they aren't."],
  compel: ["My voice goes somewhere behind their eyes and rearranges the furniture. Unless they have vervain in them. I can smell it now if I listen properly, purple and bitter under the blood.", "They do what I say. Convenient."],
  witch: ["Odette Thorne keeps the apothecary on the square and knew what I was before the door closed. She will bind the sun into a ring: lapis lazuli from under the old chapel, fresh vervain from the Council's own garden. She says she will know what I have done tonight. She says she does not hand daylight to monsters.", "The witch wants a stone and a weed. Fine."],
  lapis: ["The stone was on the altar under the chapel, colder than I am. The founders buried more than their dead up here. Their grandchildren still guard it with crossbows.", "Got the stone."],
  verv: ["Vervain. It is eating through my coat pocket like a coal, and while I carry it nobody will hold my gaze. Odette said a spell like this ought to cost something.", "The weed burns. Everything burns. So what."],
  ring_witch: ["She held my hand over the candle until the lapis drank the flame, and then she let go fast, as if I might be catching. It holds as long as she lives. I intend to be very kind to her. Ambrose is waiting on the bridge to see what he made.", "Ring. Now the bridge."],
  refused: ["She could hear them in me, every heart I stopped tonight, and she shut the door. Captain Hale of the Council wears a daylight ring he cut from a vampire's hand. If I want the morning, I will have to take it the way he did.", "The witch said no. The captain has a ring. He won't need the hand."],
  ring_captain: ["Hale's ring fits. It was still warm. He hunted things like me for thirty years and I understood him completely, right up until I didn't stop.", "Took the captain's ring. Took the captain."],
  hunter: ["They come with oak and vervain and flashlights, ordinary men doing the bravest thing they know. I broke one of them tonight like kindling.", "Hunters break like anyone."],
  off: ["I turned it off. It is so quiet. Why did I ever believe all that noise was me?", "Off."],
  on: ["It came back all at once. Every one of them has a face.", "On."],
  dawn: ["The sky over the Falls is going grey at the edges. I had forgotten how fast the night goes when you are counting it.", "Sun soon."],
  sunrise: ["It touched my face and I waited to burn. I didn't. I had forgotten the sun has a smell: cut grass, warm stone.", "Daylight. It's just light."],
};
const ENDS = {
  mercy: ['Daylight', "Dear Diary. He knelt on the planks where he killed me and I walked past him. He called after me that I would be back, that they always come back. Maybe. But this morning I stood in the square while the bakery opened, wearing a witch's ring and my own conscience, and nobody screamed. Odette nodded at me through the glass. It is not forgiveness. It is a first day."],
  stake: ['The Last of Ambrose', "Dear Diary. I broke a rail off Wickery Bridge and put it through the man who made me. He looked relieved. A hundred and sixty years, and I think I was the first one who said no. The sun came up over the river and I watched all of it. I am what he made, and I am not what he wanted. I will have to decide the rest myself."],
  ripper: ['Ripper', "Dear Diary. Ambrose is finished and the ring is mine and the sun is only weather now. I counted them on the walk back into town and lost count, and found I did not mind. The Council will hang vervain on every door. Let them. Doors open. They will tell stories about this night in Mystic Falls for a hundred years, and I will be there to hear them."],
  shadow: ["The Sire's Shadow", "Dear Diary. I took his hand. The switch went over like a light going out in another room, and everything that hurt simply stopped. We left by the bridge before the town woke. He says the first decade is the best one. I am told I used to keep a diary. I cannot think what I found to write."],
  ash: ['Ash', "The last page is scorched at the edges. The sun came up over Mystic Falls at six, the way it always does, and found something on the road that should have been in the ground. The Council swept the square before the bakery opened. Nobody wrote down a name."],
  crypt: ['Another Night', "Dear Diary. I am writing this in the dark with a stone door between me and the morning. I can hear the town waking up without me, birds, a delivery truck, somebody laughing. No ring. No answers from Ambrose. But I am not ash, and the sun goes down at eight. I will be faster tomorrow."],
};

/* ---------------- ui helpers ---------------- */
const fmtClock = c => { const h24 = Math.floor(c) % 24, m = Math.floor((c % 1) * 60); const h = h24 % 12 || 12; return h + ':' + String(m).padStart(2, '0') + (h24 >= 12 ? ' PM' : ' AM'); };
function toast(t) { const box = $('toasts'); if (box.lastChild && box.lastChild.textContent === t) return; const d = document.createElement('div'); d.textContent = t; box.appendChild(d); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => d.remove(), 5000); }
const entries = [];
function diary(k, open) { if (F['d_' + k]) return; F['d_' + k] = 1; const cold = S.off && k !== 'on'; entries.push({ t: fmtClock(S.clock), x: DIARY[k][cold ? 1 : 0], cold }); if (open) openDiary(); else toast('The diary has a new page.'); }
function openDiary() { if (dq || S.over) return; $('dlist').innerHTML = ''; for (const e of entries) { const p = document.createElement('p'); if (e.cold) p.className = 'cold'; const s = document.createElement('small'); s.textContent = e.t; p.append(s, e.x); $('dlist').appendChild(p); } $('diary').hidden = false; S.paused = true; const pp = $('diary').firstElementChild; pp.scrollTop = pp.scrollHeight; }
function closeDiary() { $('diary').hidden = true; S.paused = false; if (!F.tut) { F.tut = 1; toast(touch ? 'Hold BITE beside someone to feed. Let go before the heart stops.' : 'Hold E beside someone to feed. Let go before the heart stops.'); setTimeout(() => toast(touch ? 'COMPEL calms them first, or makes them forget after.' : 'Q compels: calm them first, or make them forget after.'), 5200); setTimeout(() => toast(touch ? 'SENSE shows heartbeats. Purple means vervain.' : 'F: heightened senses. Purple means vervain.'), 10400); } }
let dq = null;
function say(lines, choices, done) { dq = { lines, i: 0, choices, done }; S.paused = true; for (const k in K) K[k] = false; showDlg(); }
function showDlg() { const l = dq.lines[dq.i], last = dq.i === dq.lines.length - 1; $('dlg').hidden = false; $('dwho').textContent = l[0]; $('dtext').textContent = l[1]; const c = $('dch'); c.innerHTML = ''; $('dnext').hidden = last && !!dq.choices;
  if (last && dq.choices) dq.choices.forEach(ch => { const b = document.createElement('button'); b.className = 'choice'; b.type = 'button'; b.textContent = ch[0]; b.onclick = ev => { ev.stopPropagation(); dq = null; $('dlg').hidden = true; S.paused = false; ch[1](); }; c.appendChild(b); }); }
function advDlg() { if (!dq) return; if (dq.i < dq.lines.length - 1) { dq.i++; showDlg(); tone(300, 0.05, 'triangle', 0.05); } else if (!dq.choices) { const d = dq.done; dq = null; $('dlg').hidden = true; S.paused = false; d && d(); } }
$('dlg').onclick = advDlg; $('dclose').onclick = closeDiary; $('tDiary').onclick = openDiary; $('tSwitch').onclick = () => press('h');
const OBJ = { 0: 'Feed. There is a heartbeat outside the crypt.', 1: 'Find the witch. Thorne Apothecary, on the town square.', 3: 'Bring the stone and the vervain to Odette.', 4: 'Ambrose is waiting on Wickery Bridge.', 5: 'Captain Hale wears a daylight ring. Take it.' };
function setObj() { const o = $('obj'); o.innerHTML = '<small>Tonight</small>'; o.append(S.stage === 2 ? (S.lapis ? '✓ ' : '') + 'Lapis lazuli: the altar of the old chapel, north woods.' : OBJ[S.stage]); if (S.stage === 2) { o.append(document.createElement('br'), (S.verv ? '✓ ' : '') + 'Vervain: the Council Hall garden. Fetch it last.'); } }
function stage(n) { S.stage = n; setObj(); tone(196, 0.5, 'triangle', 0.12); setTimeout(() => tone(294, 0.7, 'triangle', 0.1), 180); }
function hum(d) { S.hum = clamp(S.hum + d, 0, 100); if (S.hum <= 0 && S.off && !S.locked) { S.locked = true; toast('There is nothing left to turn back on.'); } }
function sus(n, msg) { S.sus = clamp(S.sus + n, 0, 100); if (msg) toast(msg); }

/* ---------------- collision ---------------- */
function collide(e) {
  const r = e.r;
  for (const b of BOX) if (e.x > b[0] - r && e.x < b[2] + r && e.z > b[1] - r && e.z < b[3] + r) {
    const l = e.x - (b[0] - r), ri = b[2] + r - e.x, t = e.z - (b[1] - r), bo = b[3] + r - e.z, m = Math.min(l, ri, t, bo);
    if (m === l) e.x = b[0] - r; else if (m === ri) e.x = b[2] + r; else if (m === t) e.z = b[1] - r; else e.z = b[3] + r;
  }
  for (const c of CIRC) { const dx = e.x - c[0], dz = e.z - c[1], d = hyp(dx, dz), m = c[2] + r; if (d < m && d > 1e-4) { e.x = c[0] + dx / d * m; e.z = c[1] + dz / d * m; } }
  e.x = clamp(e.x, -112, 108); e.z = clamp(e.z, -112, 112);
}
function los(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const q of LOSB) { let t0 = 0, t1 = 1, ok = true;
    for (const [p, d, lo, hi] of [[a.x, dx, q[0], q[2]], [a.z, dz, q[1], q[3]]]) {
      if (Math.abs(d) < 1e-6) { if (p < lo || p > hi) { ok = false; break; } } else { let u = (lo - p) / d, v = (hi - p) / d; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) { ok = false; break; } }
    }
    if (ok) return false; }
  return true;
}
const inZone = p => ZONES.some(z => p.x > z[0] && p.x < z[2] && p.z > z[1] && p.z < z[3]);
const onBridge = e => e.x > 80 && e.x < 106 && Math.abs(e.z - BR.z) < 3.4;
function go(e, tx, tz, sp, dt) { const dx = tx - e.x, dz = tz - e.z, l = hyp(dx, dz); if (l < 0.05) { e.sp = 0; return; } e.x += dx / l * sp * dt; e.z += dz / l * sp * dt; collide(e); e.sp = sp; e.rot = Math.atan2(dx, dz); }
const face = (e, t) => { e.rot = Math.atan2(t.x - e.x, t.z - e.z); };

/* ---------------- world ---------------- */
function shadowed(o, cast = true) { o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = true; } }); return o; }
function place(name, x, z, r = 0, s = 1) { const o = shadowed(MODELS[name].clone(true)); o.position.set(x, 0, z); o.rotation.y = r; o.scale.setScalar(s); scene.add(o); return o; }
function building(name, x, z, r, w, d) {
  const o = place(name, x, z, r); o.traverse(m => { if (m.isMesh) m.material = m.material.clone(); });
  if (Math.abs(Math.sin(r)) > 0.5) [w, d] = [d, w];
  const b = [x - w / 2, z - d / 2, x + w / 2, z + d / 2]; BOX.push(b); LOSB.push(b); FADE.push({ o, x, z, w, d, a: 1 });
  if (name !== 'tower') GLOWS.push([x + Math.sin(r) * (d / 2 + 2), z + Math.cos(r) * (d / 2 + 2), name === 'crypt' ? 5 : 9, name === 'crypt' ? 0x2a3a66 : 0xff9a40]);
}
function scatter(name, list) {
  if (!list.length) return; const src = MODELS[name], M = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), p = new T.Vector3(), sc = new T.Vector3();
  src.updateMatrixWorld(true); const inv = new T.Matrix4().copy(src.matrixWorld).invert();
  src.traverse(m => { if (!m.isMesh) return; const rel = new T.Matrix4().multiplyMatrices(inv, m.matrixWorld), im = new T.InstancedMesh(m.geometry, m.material, list.length);
    list.forEach((t, i) => { q.setFromAxisAngle(up, t[2] || 0); M.compose(p.set(t[0], 0, t[1]), q, sc.setScalar(t[3] || 1)).multiply(rel); im.setMatrixAt(i, M); });
    im.castShadow = im.receiveShadow = true; im.frustumCulled = false; scene.add(im); });
}
function fenceLine(x1, z1, x2, z2, out) { const l = hyp(x2 - x1, z2 - z1), n = Math.round(l / 4), r = Math.abs(x2 - x1) > Math.abs(z2 - z1) ? 0 : PI / 2;
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; out.push([lerp(x1, x2, t), lerp(z1, z2, t), r]); }
  BOX.push([Math.min(x1, x2) - 0.15, Math.min(z1, z2) - 0.15, Math.max(x1, x2) + 0.15, Math.max(z1, z2) + 0.15]); }
function segD(px, pz, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz), 0, 1); return hyp(px - a[0] - dx * t, pz - a[1] - dz * t); }
function free(x, z, m = 0) {
  if (x > 4 - m && x < 56 + m && z > -12 - m && z < 58 + m) return false;
  if (x > -98 - m && x < -34 + m && z > 32 - m && z < 88 + m) return false;
  if (x > 83 - m && x < 103 + m) return false;
  if (x > 56 && x < 80 && z > -6 && z < 32) return false;
  if (hyp(x - RU.x, z - RU.z) < 17 + m || hyp(x + 5, z + 47) < 8 + m) return false;
  for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) if (segD(x, z, r[i], r[i + 1]) < 4.5 + m) return false;
  for (const b of BOX) if (x > b[0] - 2 && x < b[2] + 2 && z > b[1] - 2 && z < b[3] + 2) return false;
  return true;
}
function groundTex() {
  const c = document.createElement('canvas'); c.width = c.height = 2048; const g = c.getContext('2d'), k = 2048 / 240, X = x => (x + 120) * k;
  g.fillStyle = '#3d5a3c'; g.fillRect(0, 0, 2048, 2048);
  for (let i = 0; i < 60000; i++) { g.fillStyle = ['#38543a', '#43603f', '#324d38', '#48653f'][i & 3]; g.fillRect(rnd() * 2048, rnd() * 2048, 1 + rnd() * 4, 1 + rnd() * 4); }
  g.fillStyle = '#35493c'; g.fillRect(X(-96), X(34), 60 * k, 52 * k);
  g.fillStyle = '#4a4a44'; g.beginPath(); g.arc(X(RU.x), X(RU.z), 15 * k, 0, 7); g.fill();
  g.lineCap = g.lineJoin = 'round';
  for (const [w, col] of [[6.5, '#4c4334'], [5, '#74624a']]) { g.strokeStyle = col; g.lineWidth = w * k; for (const r of ROADS) { g.beginPath(); r.forEach((p, i) => i ? g.lineTo(X(p[0]), X(p[1])) : g.moveTo(X(p[0]), X(p[1]))); g.stroke(); }
    g.beginPath(); g.moveTo(X(-36), X(60)); g.lineTo(X(-82), X(60)); g.lineTo(X(-82), X(53)); g.stroke(); }
  g.fillStyle = '#5d5d67'; g.fillRect(X(5), X(-1), 50 * k, 48 * k); g.strokeStyle = '#4a4a54'; g.lineWidth = 2;
  for (let i = 0; i <= 25; i++) { g.beginPath(); g.moveTo(X(5 + i * 2), X(-1)); g.lineTo(X(5 + i * 2), X(47)); g.stroke(); g.beginPath(); g.moveTo(X(5), X(-1 + i * 2)); g.lineTo(X(55), X(-1 + i * 2)); g.stroke(); }
  g.fillStyle = '#3f5a4a'; g.fillRect(X(60), X(-3), 17 * k, 13 * k);
  g.fillStyle = '#5a5444'; g.fillRect(X(84), 0, 18 * k, 2048); g.fillStyle = '#0d1b2c'; g.fillRect(X(86), 0, 14 * k, 2048);
  const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8; return t;
}
function buildWorld() {
  const gm = new T.Mesh(new T.PlaneGeometry(240, 240).rotateX(-PI / 2), new T.MeshStandardMaterial({ map: groundTex(), roughness: 1 })); gm.receiveShadow = true; scene.add(gm);
  const river = new T.Mesh(new T.PlaneGeometry(14, 240).rotateX(-PI / 2), new T.MeshStandardMaterial({ color: 0x1a3550, roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.85 })); river.position.set(93, 0.03, 0); scene.add(river);
  // town
  building('shop', 14, -6, 0, 9, 7); building('grill', 32, -6.5, 0, 12, 8); building('houseB', 49, -6, 0, 9, 7);
  building('hall', 68, 22, -PI / 2, 14, 9); building('houseA', 14, 52, PI, 8, 7); building('houseB', 30, 53, PI, 9, 7); building('houseA', 46, 52, PI, 8, 7);
  building('houseA', -2, 14, PI / 2, 8, 7); building('houseB', -16, 26, 0, 9, 7); building('houseA', 62, 46, -PI / 2, 8, 7); building('tower', 30, 22, 0, 4.2, 4.2);
  building('crypt', CR.x, CR.z, 0, 5, 6);
  place('ruin', RU.x, RU.z); place('bridge', BR.x, BR.z); place('campfire', -5, -46); place('tent', -10, -51, 0.5); place('gate', -36, 60, PI / 2);
  place('angel', -64, 72, 0.4); CIRC.push([-64, 72, 1], [-5, -46, 0.9], [-10, -51, 1.6], [-36, 57.6, 0.5], [-36, 62.4, 0.5]);
  for (const b of [[-6.45, -9.45, 6.45, -8.55], [-6.45, -8.4, -5.55, 4.5], [5.55, -8.4, 6.45, 4.5], [-6.1, 4.5, -3.1, 7.5], [-1.3, -7.6, 1.3, -6]]) { const q = [RU.x + b[0], RU.z + b[1], RU.x + b[2], RU.z + b[3]]; BOX.push(q); LOSB.push(q); }
  BOX.push([86, -112, 100, BR.z - 3.2], [86, BR.z + 3.2, 100, 112]);
  GLOWS.push([-5, -46, 13, 0xff7a2a], [RU.x, RU.z - 6.8, 6, 0x3a6cff]);
  const fences = [];
  fenceLine(-96, 34, -36, 34, fences); fenceLine(-96, 86, -36, 86, fences); fenceLine(-96, 34, -96, 86, fences); fenceLine(-36, 34, -36, 57.6, fences); fenceLine(-36, 62.4, -36, 86, fences);
  fenceLine(60, -3, 77, -3, fences); fenceLine(77, -3, 77, 10, fences); fenceLine(60, 10, 77, 10, fences); fenceLine(60, -3, 60, 1.5, fences); fenceLine(60, 6, 60, 10, fences);
  scatter('fence', fences);
  const lamps = [[8, 2], [30, 3], [52, 2], [8, 44], [52, 44], [8, 23], [52, 26], [-12, 43], [-33, 56], [58, 13], [76, -27], [22, -14], [30, 60]];
  lamps.forEach(l => { CIRC.push([l[0], l[1], 0.25]); GLOWS.push([l[0], l[1], 12, 0xff9a40]); }); scatter('lamp', lamps);
  scatter('bench', [[24, 15, 0], [36, 29, PI], [20, 30, PI / 2], [-20, 44, 0.3]]);
  // cemetery
  const gr = [[], [], []], dead = [];
  for (let x = -92; x <= -42; x += 5) for (let z = 39; z <= 82; z += 5.5) { if (hyp(x - CR.x, z - CR.z - 3) < 8 || Math.abs(z - 60) < 3.2 || (Math.abs(x + 82) < 3 && z < 60) || rnd() < 0.22 || hyp(x + 64, z - 72) < 3) continue;
    const gx = x + rr(-0.8, 0.8), gz = z + rr(-0.6, 0.6); gr[Math.floor(rnd() * 3)].push([gx, gz, rr(-0.25, 0.25), rr(0.9, 1.15)]); CIRC.push([gx, gz, 0.5]); }
  gr.forEach((l, i) => scatter('grave' + (i + 1), l));
  for (let i = 0; i < 9; i++) { const x = rr(-94, -40), z = rr(36, 84); if (Math.abs(z - 60) < 4 || hyp(x - CR.x, z - CR.z) < 9) continue; dead.push([x, z, rr(0, 6), rr(0.9, 1.4)]); CIRC.push([x, z, 0.5]); }
  for (let i = 0; i < 12; i++) { const x = rr(-110, 80), z = rr(-108, 108); if (free(x, z, 1)) { dead.push([x, z, rr(0, 6), rr(0.9, 1.5)]); CIRC.push([x, z, 0.5]); } }
  scatter('deadtree', dead);
  // woods
  const tr = { pine: [], pineTall: [], oak: [] }, bushes = [], rocks = [];
  for (let i = 0; i < 620; i++) { const x = rr(-116, 112), z = rr(-116, 116), north = z < -16; if (!free(x, z) || (!north && rnd() < 0.5)) continue;
    const k = north ? (rnd() < 0.55 ? 'pine' : rnd() < 0.8 ? 'pineTall' : 'oak') : (rnd() < 0.5 ? 'oak' : 'pine'); tr[k].push([x, z, rr(0, 6), rr(0.85, 1.35)]); CIRC.push([x, z, k === 'oak' ? 0.6 : 0.45]); }
  for (const k in tr) scatter(k, tr[k]);
  for (let i = 0; i < 150; i++) { const x = rr(-112, 82), z = rr(-112, 112); if (free(x, z, -1)) (rnd() < 0.6 ? bushes : rocks).push([x, z, rr(0, 6), rr(0.6, 1.3)]); }
  for (let i = 0; i < 10; i++) bushes.push([rr(61, 76), rr(-2, 9), rr(0, 6), rr(0.5, 0.8)]);
  scatter('bush', bushes); scatter('rock', rocks);
  const vv = []; for (let i = 0; i < 9; i++) vv.push([72 + rr(-1.6, 1.6), 1 + rr(-1.4, 1.4), rr(0, 6), rr(0.8, 1.2)]); scatter('vervain', vv);
  vervM = { x: 72, z: 1 }; lapisM = shadowed(MODELS.lapis.clone(true)); lapisM.position.set(RU.x, 1.75, RU.z - 6.8); scene.add(lapisM); lapisM.x = RU.x; lapisM.z = RU.z - 6.0;
  // light pools
  const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gg = gc.getContext('2d'), grd = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,.55)'); grd.addColorStop(0.4, 'rgba(255,255,255,.2)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); gg.fillStyle = grd; gg.fillRect(0, 0, 128, 128);
  const gim = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-PI / 2), new T.MeshBasicMaterial({ map: new T.CanvasTexture(gc), transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: true }), GLOWS.length);
  const M = new T.Matrix4(), col = new T.Color(); GLOWS.forEach((g, i) => { M.makeScale(g[2], 1, g[2]).setPosition(g[0], 0.06 + i * 0.001, g[1]); gim.setMatrixAt(i, M); gim.setColorAt(i, col.setHex(g[3])); }); gim.instanceColor.needsUpdate = true; gim.frustumCulled = false; scene.add(gim);
  // fireflies
  const fp = new Float32Array(240 * 3); for (let i = 0; i < 240; i++) { fp[i * 3] = rr(-110, 84); fp[i * 3 + 1] = rr(0.6, 3.2); fp[i * 3 + 2] = rr(-110, 110); }
  const fg = new T.BufferGeometry(); fg.setAttribute('position', new T.BufferAttribute(fp, 3)); flies = new T.Points(fg, new T.PointsMaterial({ color: 0xd8ff9a, size: 0.22, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false })); scene.add(flies);
}
let flies;

/* ---------------- characters ---------------- */
const ringTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 24, 0, 7); g.stroke(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(32, 32, 9, 0, 7); g.fill(); return new T.CanvasTexture(c); })();
const ringMat = c => new T.SpriteMaterial({ map: ringTex, color: c, depthTest: false, transparent: true, blending: T.AdditiveBlending, fog: false });
const RM = { npc: ringMat(0xff3344), verv: ringMat(0xb070ff), hunter: ringMat(0xffb040), witch: ringMat(0x66aaff), goal: ringMat(0xffd070) };
const CLOTH = [0x8a3f3f, 0x3f6690, 0x7a7a3f, 0x86609a, 0x9a9a9a, 0x3a7a66, 0xb07840, 0x6a3555], HAIRS = [0x1a1210, 0x4a2f1a, 0x9a7a44, 0x2a2a2a, 0x8a2f1a, 0xc0b4a0], SKINS = [0xd3a48a, 0xa5714e, 0xe8c2a4, 0x70492f];
function human(kind, x, z, o = {}) {
  const g = MODELS.human.clone(true), mats = {};
  const tint = m => { if (!m.isMesh) return; const n = m.material.name; if (!mats[n]) { mats[n] = m.material.clone(); if (o[n] != null) mats[n].color.setHex(o[n]).convertSRGBToLinear(); } m.material = mats[n]; m.castShadow = true; };
  g.traverse(tint); const P = {}; for (const n of ['Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR']) P[n] = g.getObjectByName('h' + n);
  const add = (name, par) => { const a = MODELS[name].clone(true); a.traverse(tint); par.add(a); return a; };
  if (o.coat) add('coat', g); if (o.hat) add('hat', P.Head); if (o.long) add('longhair', P.Head); if (o.bow) add('crossbow', P.ArmR).position.set(0, -0.62, 0.12);
  g.scale.setScalar(o.s || 1.3); g.rotation.order = 'YXZ'; scene.add(g);
  const e = { kind, g, P, x, z, rot: o.rot || 0, vr: o.rot || 0, ph: Math.random() * 6, sp: 0, r: 0.5, hp: o.hp || 40, dead: false, fall: 0, state: o.state || 'wander', t: 0, wait: R(0, 3), stuck: 0, blood: 100, verv: !!o.verv, wps: o.wps, pose: null, atkT: 0, hitT: 0 };
  if (kind !== 'player') { e.ring = new T.Sprite(kind === 'hunter' ? RM.hunter : kind === 'witch' || kind === 'sire' ? RM.witch : e.verv ? RM.verv : RM.npc); e.ring.position.y = 1.1; e.ring.visible = false; e.ring.renderOrder = 9; g.add(e.ring); }
  ents.push(e); return e;
}
function hunter(x, z, route, o = {}) {
  const h = human('hunter', x, z, Object.assign({ cloth: 0x4a4230, pants: 0x1c1a16, hat: 1, bow: 1, verv: 1, hp: 70, hair: 0x2a2a2a, skin: pick(SKINS) }, o));
  Object.assign(h, { route, ri: 0, alert: 0, hostile: false, cd: 1, lost: 0, wind: 0, n: 0, last: { x, z } });
  h.cone = new T.Mesh(new T.CircleGeometry(12, 16, -PI / 2 - 0.7, 1.4).rotateX(-PI / 2), new T.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.1, depthWrite: false, blending: T.AdditiveBlending }));
  h.cone.position.y = 0.09 / 1.3; h.cone.scale.setScalar(1 / (o.s || 1.3)); h.g.add(h.cone); return h;
}
function spawn() {
  pl = human('player', CR.x, CR.z + 5.5, { cloth: 0x231a22, pants: 0x101016, hair: 0x15100e, skin: 0xe6cdb8, coat: 1, s: 1.36 });
  Object.assign(pl, { dashT: 0, dashCd: 0, atkCd: 0, act: 0, stun: 0, vervT: 0, inv: 0, feed: null, fed: 0, dvx: 0, dvz: 0 });
  const civ = (x, z, o = {}) => human('npc', x, z, Object.assign({ cloth: pick(CLOTH), hair: pick(HAIRS), skin: pick(SKINS), pants: pick([0x1a1c26, 0x2a2420, 0x30343c]), long: Math.random() < 0.45, verv: rnd() < 0.25 }, o));
  const TOWN = [[12, 8], [48, 8], [12, 40], [48, 40], [22, 22], [38, 22], [30, 34], [30, 10], [-6, 38], [56, 36], [22, -12], [40, 44], [16, 30], [44, 16]];
  keeper = civ(-70, 58, { verv: false, cloth: 0x5a5a3a, hat: 1, long: false, wps: [[-70, 58], [-52, 60], [-60, 66], [-76, 66], [-46, 52]] });
  for (let i = 0; i < 10; i++) { const w = TOWN[i]; civ(w[0], w[1], { wps: TOWN }); }
  civ(-7.4, -45, { state: 'idle', rot: 2, verv: true }); civ(-3, -47.6, { state: 'idle', rot: -1, verv: false, long: true });
  civ(30, 70, { wps: [[30, 60], [30, 100], [30, 48]], verv: false }); civ(-20, 46, { wps: [[-20, 46], [-8, 40], [-30, 55]], verv: false });
  witch = human('witch', 14, 0.6, { cloth: 0x4f2f72, hair: 0x0c0808, skin: 0x7a5236, pants: 0x1a1020, long: 1, coat: 1, verv: 1, state: 'idle' });
  sire = human('sire', BR.x, BR.z, { cloth: 0x6a1019, hair: 0xc9c2b0, skin: 0xeadccb, pants: 0x0c0c10, coat: 1, s: 1.46, hp: 300, state: 'wait', rot: -PI / 2, verv: 1 });
  sire.g.visible = false; sire.r = 0.6;
  sire.line = new T.Mesh(new T.PlaneGeometry(0.5, 13).rotateX(-PI / 2).translate(0, 0, 6.5), new T.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.45, depthWrite: false })); sire.line.position.y = 0.1; sire.line.scale.setScalar(1 / 1.46); sire.line.visible = false; sire.g.add(sire.line);
  hunter(RU.x - 3, RU.z + 2, [[-43, -72], [-37, -72], [-37, -78], [-43, -78]]); hunter(-52, -60, [[-52, -60], [-28, -60]]);
  hunter(64, 0, [[64, 0], [74, 0], [74, 7], [64, 7]]); hunter(10, 6, [[10, 6], [50, 6], [50, 42], [10, 42]]); hunter(-28, 52, [[-28, 52], [0, 38]]);
  captain = hunter(58, 16, [[58, 16], [58, 30]], { cloth: 0x2a3a5c, hp: 150, s: 1.42 }); captain.cap = true;
}

/* ---------------- effects ---------------- */
const fxGeo = new T.RingGeometry(0.82, 1, 28).rotateX(-PI / 2);
function fx(x, z, col, size = 3, dur = 0.5) { const m = new T.Mesh(fxGeo, new T.MeshBasicMaterial({ color: col, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); m.position.set(x, 0.15, z); scene.add(m); fxs.push({ m, t: 0, dur, size }); }
let beam = [];
function setBeams(list) { beam.forEach(b => scene.remove(b)); beam = list.map(t => { const b = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 26, 8, 1, true), new T.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.22, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })); b.position.set(t.x, 13, t.z); scene.add(b); return b; }); }
function targets() { switch (S.stage) { case 0: return keeper.dead ? [] : [keeper]; case 1: case 3: return [witch]; case 2: return [!S.lapis && lapisM, !S.verv && vervM].filter(Boolean); case 5: return [captain]; case 4: return [sire]; } return []; }

/* ---------------- actions ---------------- */
function witnesses(src, rad) { for (const n of ents) if (n.kind === 'npc' && !n.dead && n !== src && (n.state === 'wander' || n.state === 'idle') && d2(n, src) < rad && los(n, src)) flee(n); }
function flee(n) { n.state = 'flee'; n.t = 11; n.pose = null; }
function kill(e) {
  if (e.dead) return; e.dead = true; e.pose = null; e.sp = 0; if (e.cone) e.cone.visible = false; e.ring.visible = false; bodies.push(e); tone(90, 0.4, 'sawtooth', 0.12, -50);
  if (e.kind === 'npc') { S.kills++; hum(-14); if (S.off) S.offKills++; sus(3); witnesses(e, 9); diary('fed_kill'); }
  else if (e.kind === 'hunter') { S.hunterKills++; hum(e.cap ? -18 : -5); if (S.off) S.offKills++; diary('hunter');
    if (e.cap && !S.ring) { S.ring = 'captain'; diary('ring_captain'); toast("You take the daylight ring from Hale's hand."); sire.g.visible = true; stage(4); } }
}
function startFeed(v) {
  const p = pl;
  if (v.kind === 'witch') { S.hp -= 18; p.stun = 1.2; shake = 0.6; toast("Odette's stare splits your skull. Do not try that again."); tone(1200, 0.5, 'sawtooth', 0.1, -900); return; }
  if (v.verv) { S.hp -= 14; p.stun = 0.6; shake = 0.4; v.vk = true; toast('Vervain in the blood. It burns your mouth.'); tone(700, 0.3, 'square', 0.08, -400); if (v.kind === 'hunter') aggro(v); else { flee(v); sus(8); } return; }
  p.feed = v; p.fed = 0; if (v.state !== 'compelled' && v.state !== 'dazed') { toast('They scream.'); tone(900, 0.5, 'sawtooth', 0.06, 500); sus(6); witnesses(v, 11); }
  v.state = 'held'; v.pose = 'held'; p.pose = 'feed'; face(p, v); v.rot = p.rot; tone(180, 0.25, 'sawtooth', 0.15, -80); fx(v.x, v.z, 0xff2040, 2);
}
function endFeed() {
  const p = pl, v = p.feed; if (!v) return; p.feed = null; p.pose = null; $('feed').hidden = true;
  if (!v.dead) { v.state = 'dazed'; v.t = 5.5; v.pose = 'dazed'; S.feeds++; diary('fed_clean'); toast(S.verv ? 'They are dazed, and you cannot compel while you carry vervain.' : touch ? 'COMPEL now, and they will forget.' : 'Press Q now, and they will forget.'); }
  if (S.stage === 0 && p.fed > 8) stage(1);
}
function compel() {
  const p = pl; if (p.feed || p.stun > 0) return;
  if (p.vervT > 0 || (S.verv && S.stage < 4)) return toast('Vervain. Your eyes will not hold anyone.');
  if (S.blood < 6) return toast('Too hungry to compel.');
  let best = null, bd = 5; for (const e of ents) { if (e.dead || e === p || e.kind === 'sire' || e.kind === 'witch' || e.state === 'held') continue; const d = d2(p, e); if (d < bd) { bd = d; best = e; } }
  if (!best) return; S.blood -= 6; p.act = 0.8; face(p, best); fx(best.x, best.z, 0xb070ff, 2.4, 0.7); tone(520, 0.6, 'sine', 0.12, 260);
  if (best.verv) { best.vk = true; toast('Vervain. They see exactly what you are.'); if (best.kind === 'hunter') aggro(best); else { flee(best); sus(8); } return; }
  if (best.state === 'dazed') { best.state = 'wander'; best.pose = null; best.wait = 3; S.clean++; hum(3); toast('"You tripped. You had a pleasant evening." They believe you.'); diary('compel'); }
  else { best.state = 'compelled'; best.t = 14; best.pose = 'dazed'; toast('They go still, waiting for your voice.'); diary('compel'); }
}
function dash() {
  const p = pl; if (p.dashCd > 0 || p.feed || p.stun > 0 || p.vervT > 0) return; if (S.blood < 5) return toast('Too hungry to run like that.');
  let ix = mvx, iz = mvz; if (hyp(ix, iz) < 0.2) { ix = Math.sin(p.rot); iz = Math.cos(p.rot); } const l = hyp(ix, iz);
  p.dvx = ix / l * 58; p.dvz = iz / l * 58; p.dashT = 0.16; p.dashCd = 0.7; p.inv = 0.25; p.act = 1.2; S.blood -= 5; fx(p.x, p.z, 0x9fb4ff, 2.2, 0.35); tone(240, 0.22, 'sawtooth', 0.07, 700);
}
function attack() {
  const p = pl; if (p.atkCd > 0 || p.feed || p.stun > 0) return; p.atkCd = 0.42; p.atkT = 0.22; tone(140, 0.12, 'square', 0.08, -60);
  let best = null, bd = 3.1; for (const e of ents) { if (e.dead || (e.kind !== 'hunter' && !(e.kind === 'sire' && S.fight))) continue; const d = d2(p, e); if (d < bd) { bd = d; best = e; } }
  if (!best) return; p.act = 1.2; face(p, best); shake = 0.25; fx(best.x, best.z, 0xff5060, 1.6, 0.25);
  if (best.kind === 'hunter' && !best.hostile && Math.abs(angd(Math.atan2(p.x - best.x, p.z - best.z), best.rot)) > 2) { toast('One twist. He never turns around.'); return kill(best); }
  best.hp -= 34 * (S.off ? 1.5 : 1) * (best.state === 'rest' ? 1.5 : 1); best.hitT = 0.15; const l = bd || 1; best.x += (best.x - p.x) / l * 0.7; best.z += (best.z - p.z) / l * 0.7; collide(best); tone(80, 0.15, 'sawtooth', 0.14);
  if (best.kind === 'hunter') { aggro(best); if (best.hp <= 0) kill(best); } else if (best.hp <= 0) sireDown();
}
function hurt(d, why) { if (pl.inv > 0 || S.over) return; S.hp -= d; pl.hitT = 0.2; shake = 0.5; tone(110, 0.2, 'sawtooth', 0.16, -40); if (pl.feed) { const v = pl.feed; endFeed(); if (!v.dead) flee(v); } if (S.hp <= 0) downed(why); }
let aggroT = 0;
function aggro(h) { if (h.hostile || h.dead) return; h.hostile = true; h.alert = 1; h.cd = 0.7; h.lost = 0; h.last = { x: pl.x, z: pl.z }; if (S.time - aggroT > 3) { toast('A hunter has made you.'); aggroT = S.time; tone(660, 0.12, 'square', 0.08); sus(4); }
  for (const o of ents) if (o.kind === 'hunter' && !o.dead && !o.hostile && d2(o, h) < 20) { o.hostile = true; o.alert = 1; o.cd = 1.2; o.lost = 0; o.last = { x: pl.x, z: pl.z }; } }
function toggleSwitch() {
  if (S.over || dq) return; if (S.off && S.locked) return toast('You reach for the switch. There is nothing there.');
  if (!S.off) say([['The switch', 'Everything you feel can simply stop. You will be faster and stronger, and feeding will come easy. Your humanity will bleed away while it is off, and hunters will know you on sight.']],
    [['Turn it off.', () => { S.off = true; document.body.classList.add('off'); diary('off'); tone(880, 1.2, 'sine', 0.12, -820); if (pl.feed) endFeed(); }], ['Not yet.', () => {}]]);
  else say([['The switch', 'Turn it back on, and everything you did while it was off arrives at once.']],
    [['Turn it back on.', () => { S.off = false; document.body.classList.remove('off'); const g = Math.min(S.hp - 5, 10 + S.offKills * 14); S.hp -= Math.max(0, g); pl.stun = 1.6; shake = 0.8; S.offKills = 0; diary('on'); tone(60, 1.2, 'sine', 0.2, 500); }], ['Leave it off.', () => {}]]);
}
function downed(why) {
  S.paused = true; S.hp = 0; pl.feed = null; const b = $('black'); b.textContent = why === 'sire' ? 'Ambrose leaves you broken on the planks. "Again," he says. "I have all night. You do not."' : 'Oak through the ribs, a breath from the heart. You wake with the splinters working their way out. Time has passed.'; b.classList.add('on');
  setTimeout(() => { S.clock += 0.55; S.hp = 60; S.blood = Math.max(S.blood, 28); S.sus = Math.max(0, S.sus - 12); pl.stun = 0; pl.pose = null; shots.forEach(s => scene.remove(s.m)); shots.length = 0;
    const sp = why === 'sire' ? [72, -22] : S.stage <= 1 ? [CR.x, CR.z + 6] : [22, -22]; pl.x = sp[0]; pl.z = sp[1];
    for (const h of ents) if (h.kind === 'hunter') { h.hostile = false; h.alert = 0; }
    if (S.fight) { S.fight = false; sire.hp = 300; sire.state = 'wait'; sire.x = BR.x; sire.z = BR.z; sire.line.visible = false; }
    b.classList.remove('on'); S.paused = false; }, 3400);
}
function end(k) {
  if (S.over) return; S.over = true; S.paused = true; $('hudwrap').hidden = true; $('dlg').hidden = true; const e = ENDS[k]; $('etitle').textContent = e[0]; $('etext').textContent = e[1];
  $('estats').textContent = `Fed ${S.feeds + S.kills} · Killed ${S.kills} · Made to forget ${S.clean} · Hunters ${S.hunterKills} · Humanity ${Math.round(S.hum)}${S.off ? ' (off)' : ''} · ${fmtClock(S.clock)}`; $('end').hidden = false;
}
$('again').onclick = () => location.reload();

/* ---------------- story ---------------- */
function talkWitch() {
  const O = 'Odette Thorne';
  if (S.stage === 0) return say([[O, 'You have not even fed. Come back when you can think past your own teeth.']]);
  if (S.stage === 1) return say([[O, 'Close the door, you are letting the cold in. ...And you are dead. Newly, by the smell of the grave dirt.'],
    [O, 'Ambrose made you. He makes one every few decades and waits on the bridge to see whether it burns or begs. I am tired of sweeping up his ashes.'],
    [O, 'I can bind the sun into a stone. I need lapis lazuli. The founders hid a piece on the altar of the old chapel, north through the woods. The Council still guards it.'],
    [O, 'And vervain, fresh, from the Council Hall garden. It will burn you to carry and you will not be able to compel a soul while you hold it. Good. Fetch it last.'],
    [O, 'One more thing. I will know what you did tonight. I do not hand daylight to monsters.']], null, () => { diary('witch'); stage(2); setBeams(targets()); });
  if (S.stage === 4) return say([[O, 'Go. He is waiting, and the night is not.']]);
  if (S.stage === 2 && !(S.lapis && S.verv)) return say([[O, S.lapis ? 'The stone, yes. Now the vervain. The garden behind the Council Hall.' : 'The chapel, north through the woods. Bring me the stone first.']]);
  if (S.off) return say([[O, 'There is nobody home behind those eyes. Come back when you have turned it on again. If you still can.']]);
  if (S.hum >= 45) return say([[O, 'Lapis. Vervain. And you still flinch when you count them. Good. Give me your hand.'],
    [O, 'It holds as long as I am alive, so be very kind to me. Now go. Ambrose is on Wickery Bridge, waiting to see what he made.']], null, () => { S.ring = 'witch'; S.verv = false; diary('ring_witch'); sire.g.visible = true; stage(4); setBeams(targets()); fx(pl.x, pl.z, 0x4f7df0, 5, 1.2); });
  say([[O, `I can hear them in you. ${S.kills === 1 ? 'A heart' : 'Hearts'} that stopped tonight, and you barely slowed down. No.`],
    [O, 'Captain Hale wears a daylight ring he cut from a vampire\'s hand. If you want the morning that badly, go and be what you are. Or come back when you have remembered how to stop.']], null, () => { diary('refused'); if (S.stage !== 5) stage(5); setBeams(targets()); });
}
function talkSire() {
  const A = 'Ambrose', dark = S.ring === 'captain' || S.kills >= 3 || S.off;
  if (F.metSire) return say([[A, 'Again? Good. I was beginning to think I had made another disappointment.']], null, startFight);
  F.metSire = 1;
  say([[A, 'There you are. Do you know how many of mine never reach this bridge by morning?'],
    [A, dark ? 'And look at you. Blood to the elbows. I knew it was in you when I picked you.' : 'Still wearing your conscience like a wet coat. It will drown you.'],
    [A, 'A hundred and sixty years I have walked alone, because everyone I turn either burns or bores me. Turn it off. Come with me. No grief. No hunger you cannot feed. Forever.']],
    [['Take his hand.', () => { S.off = true; end('shadow'); }], ['"You killed me on this bridge."', startFight]]);
}
function startFight() { S.fight = true; sire.state = 'stalk'; sire.t = 1.2; toast(touch ? 'He telegraphs every rush. DASH aside, then STRIKE while he recovers.' : 'He telegraphs every rush. Dash aside, then strike while he recovers.'); }
function sireDown() {
  S.fight = false; sire.state = 'down'; sire.pose = 'dazed'; sire.line.visible = false; sire.sp = 0;
  setTimeout(() => say([['Ambrose', 'Well. ...Well. Nobody has put me on my knees since Gettysburg.'], ['Ambrose', 'Finish it, then. Break the rail. It is good oak.']],
    [['Break the rail. Stake him.', () => { sire.dead = true; end(S.off || S.hum < 30 || S.ring === 'captain' ? 'ripper' : 'stake'); }],
     ['"I am not you." Walk away.', () => end(S.off || S.hum < 30 ? 'ripper' : 'mercy')]]), 900);
}
function interact() {
  const p = pl; if (p.stun > 0 || p.feed) return;
  if (d2(p, witch) < 3.6) return talkWitch();
  if (S.stage === 4 && !S.fight && sire.state === 'wait' && d2(p, sire) < 4.5) return talkSire();
  if (!S.lapis && S.stage >= 2 && d2(p, lapisM) < 2.6) { S.lapis = true; lapisM.visible = false; diary('lapis'); tone(660, 0.8, 'sine', 0.12, 300); return afterPick(); }
  if (!S.verv && S.stage === 2 && d2(p, vervM) < 2.8) { S.verv = true; diary('verv'); toast('It burns through your coat. You cannot compel while you carry it.'); return afterPick(); }
  if (!S.ring && S.clock > 28.5 && d2(p, { x: CR.x, z: CR.z + 3.5 }) < 3) return end('crypt');
  let best = null, bd = 2.1; for (const e of ents) { if (e.dead || e === p || e.kind === 'sire' || e.state === 'held') continue; const d = d2(p, e); if (d < bd) { bd = d; best = e; } }
  if (best) startFeed(best);
}
function afterPick() { if (S.lapis && S.verv) stage(3); else setObj(); setBeams(targets()); }

/* ---------------- input ---------------- */
const K = {}, J = { x: 0, y: 0, id: null, ox: 0, oy: 0 }; let mvx = 0, mvz = 0;
function press(k) {
  if (!pl) return; audio();
  if (dq) { if (k === 'e' || k === 'enter' || k === ' ') advDlg(); return; }
  if (!$('diary').hidden) { if (k === 'tab' || k === 'escape' || k === 'e' || k === 'enter') closeDiary(); return; }
  if (S.paused || S.over) return;
  if (k === 'e') interact(); else if (k === 'q') compel(); else if (k === ' ' || k === 'shift') dash(); else if (k === 'j' || k === 'k') attack();
  else if (k === 'f') { if (pl.vervT > 0) toast('Vervain dulls everything.'); else { S.senses = !S.senses; document.body.classList.toggle('sense', S.senses); tone(S.senses ? 330 : 220, 0.3, 'sine', 0.08); } }
  else if (k === 'h') toggleSwitch(); else if (k === 'tab') openDiary();
}
addEventListener('keydown', e => { const k = e.key.toLowerCase(); if ([' ', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault(); if (!K[k]) { K[k] = true; press(k); } });
addEventListener('keyup', e => { K[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in K) K[k] = false; });
$('c').addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && !S.paused) attack(); });
function enableTouch() { if (touch) return; touch = true; $('touch').hidden = false; }
if (matchMedia('(pointer:coarse)').matches) enableTouch(); addEventListener('touchstart', enableTouch, { once: true, passive: true });
document.querySelectorAll('.pad').forEach(b => { const k = b.dataset.k;
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); K[k] = true; press(k); });
  const up = () => { b.classList.remove('on'); K[k] = false; }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); });
const joy = $('joy'), stick = $('stick');
joy.addEventListener('pointerdown', e => { joy.setPointerCapture(e.pointerId); J.id = e.pointerId; J.ox = e.clientX; J.oy = e.clientY; stick.hidden = false; stick.style.left = J.ox + 'px'; stick.style.top = J.oy + 'px'; stick.firstChild.style.transform = ''; });
joy.addEventListener('pointermove', e => { if (e.pointerId !== J.id) return; let dx = e.clientX - J.ox, dy = e.clientY - J.oy; const l = hyp(dx, dy), m = 46; if (l > m) { dx *= m / l; dy *= m / l; } J.x = dx / m; J.y = dy / m; stick.firstChild.style.transform = `translate(${dx}px,${dy}px)`; });
const jend = e => { if (e.pointerId !== J.id) return; J.id = null; J.x = J.y = 0; stick.hidden = true; }; joy.addEventListener('pointerup', jend); joy.addEventListener('pointercancel', jend);

/* ---------------- updates ---------------- */
function updPlayer(dt) {
  const p = pl; let ix = (K.d || K.arrowright ? 1 : 0) - (K.a || K.arrowleft ? 1 : 0) + J.x, iz = (K.s || K.arrowdown ? 1 : 0) - (K.w || K.arrowup ? 1 : 0) + J.y; const il = hyp(ix, iz); if (il > 1) { ix /= il; iz /= il; } mvx = ix; mvz = iz;
  for (const k of ['dashCd', 'atkCd', 'act', 'stun', 'vervT', 'inv', 'atkT', 'hitT']) p[k] = Math.max(0, p[k] - dt);
  if (p.feed) { const v = p.feed; p.sp = 0; p.act = 1;
    if (!K.e || p.stun > 0) endFeed(); else { const rate = S.off || S.blood < 12 ? 36 : 20, am = Math.min(v.blood, rate * dt); v.blood -= am; p.fed += am; S.blood = Math.min(100, S.blood + am * 0.55 * (S.off ? 1.3 : 1)); S.hp = Math.min(100, S.hp + am * 0.3);
      $('feed').hidden = false; $('feed').querySelector('u').style.width = v.blood + '%'; if (v.blood <= 0) { kill(v); endFeed(); } }
  } else if (p.stun > 0) p.sp = 0;
  else if (p.dashT > 0) { p.dashT -= dt; for (let i = 0; i < 3; i++) { p.x += p.dvx * dt / 3; p.z += p.dvz * dt / 3; collide(p); } p.sp = 12; }
  else { const sp = 7 * (S.off ? 1.25 : 1) * (p.vervT > 0 ? 0.6 : 1); p.x += ix * sp * dt; p.z += iz * sp * dt; collide(p); p.sp = Math.min(1, il) * sp; if (il > 0.15) p.rot = Math.atan2(ix, iz); }
  // hunger, healing, the switch, the vervain in your pocket
  S.blood = Math.max(0, S.blood - dt * (0.36 * (S.off ? 0.7 : 1) + (S.senses ? 0.4 : 0)));
  if (S.blood <= 0) { S.hp -= dt * 2.5; if (!F.starve || S.time - F.starve > 12) { F.starve = S.time; toast('You are starving. Feed.'); } if (S.hp <= 0) downed('hunger'); }
  const carrying = S.verv && S.stage < 4;
  if (S.blood > 25 && S.hp < 100 && !carrying) { S.hp = Math.min(100, S.hp + dt * 2); S.blood -= dt * 0.5; }
  if (carrying) { S.hp -= dt * 0.8; if (S.hp <= 0) downed('vervain'); }
  if (S.off) hum(-dt * 0.6);
  if (p.vervT > 0 && S.senses) { S.senses = false; document.body.classList.remove('sense'); }
  if (inZone(p) && !F.zone) { F.zone = 1; toast('Council ground. Here the hunters will challenge anyone they see.'); }
}
function updNpc(n, dt) {
  const p = pl;
  switch (n.state) {
    case 'held': n.sp = 0; return;
    case 'compelled': n.sp = 0; n.t -= dt; face(n, p); if (n.t <= 0) { n.state = n.wps ? 'wander' : 'idle'; n.pose = null; } return;
    case 'dazed': n.sp = 0; n.t -= dt; if (n.t <= 0) { flee(n); toast('They remember. They run.'); } return;
    case 'flee': { n.t -= dt; const ax = n.x - p.x, az = n.z - p.z, l = hyp(ax, az) || 1; go(n, n.x + ax / l * 5, n.z + az / l * 5, 5.2, dt);
      if (n.t <= 0 || l > 46) { n.state = n.wps ? 'wander' : 'idle'; n.verv = true; n.ring.material = RM.verv; sus(12, 'Someone reached the Council. The town knows something is feeding.'); } return; }
    case 'idle': n.sp = 0; break;
    default: if (n.wait > 0) { n.wait -= dt; n.sp = 0; } else { if (!n.tg || hyp(n.x - n.tg[0], n.z - n.tg[1]) < 1.2 || n.stuck > 2.5) { n.tg = pick(n.wps); n.wait = n.stuck > 2.5 ? 0 : R(0, 4); n.stuck = 0; } else { const ox = n.x, oz = n.z; go(n, n.tg[0], n.tg[1], 2.1, dt); if (hyp(n.x - ox, n.z - oz) < 1.2 * dt) n.stuck += dt; } }
  }
  for (const b of bodies) if (!b.found && d2(n, b) < 6) { b.found = true; flee(n); sus(10, 'A body has been found.'); }
}
function shoot(h) { h.n++; const verv = h.n % 3 === 0, m = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.8), new T.MeshBasicMaterial({ color: verv ? 0xb070ff : 0xe8c890 }));
  const l = d2(h, pl) || 1, tx = pl.x + Math.sin(pl.rot) * pl.sp * l / 26 * 0.6, tz = pl.z + Math.cos(pl.rot) * pl.sp * l / 26 * 0.6, a = Math.atan2(tx - h.x, tz - h.z);
  m.rotation.y = a; scene.add(m); shots.push({ m, x: h.x, z: h.z, vx: Math.sin(a) * 26, vz: Math.cos(a) * 26, t: 0, verv }); h.atkT = 0.2; tone(verv ? 520 : 320, 0.1, 'square', 0.06, -200); }
function updHunter(h, dt) {
  const p = pl, d = d2(h, p), ang = Math.abs(angd(Math.atan2(p.x - h.x, p.z - h.z), h.rot)), rng = h.hostile ? 22 : 12;
  const see = d < rng && (ang < 0.7 || d < 2 || (h.hostile && ang < 1.7)) && los(h, p);
  const tres = inZone(p), hot = p.act > 0 || S.sus >= 50 || S.off || !!p.feed;
  h.pose = h.hostile ? 'aim' : null;
  if (!h.hostile) {
    if (see && (tres || hot)) h.alert += dt * (hot ? 1.7 : 0.75) * (1.35 - d / rng); else h.alert = Math.max(0, h.alert - dt * 0.22);
    if (S.sus >= 80 && d < 30) h.alert = 1;
    if (h.alert >= 1) aggro(h); else if (h.alert > 0.3 && see) { h.sp = 0; face(h, p); }
    else { const w = h.route[h.ri]; if (hyp(h.x - w[0], h.z - w[1]) < 0.8) { h.ri = (h.ri + 1) % h.route.length; h.wait = 1.5; } if (h.wait > 0) { h.wait -= dt; h.sp = 0; h.rot += Math.sin(S.time * 0.9 + h.ph) * dt * 0.8; } else go(h, w[0], w[1], 2.5, dt); }
    for (const b of bodies) if (!b.found && d2(h, b) < 12 && los(h, b) && Math.abs(angd(Math.atan2(b.x - h.x, b.z - h.z), h.rot)) < 0.7) { b.found = true; h.alert = Math.max(h.alert, 0.5); sus(15, 'A hunter has found a body.'); }
  } else {
    if (see) { h.last = { x: p.x, z: p.z }; h.lost = 0; } else h.lost += dt;
    if (h.lost > 7) { h.hostile = false; h.alert = 0.3; return; }
    h.cd -= dt;
    if (h.wind > 0) { h.wind -= dt; h.sp = 0; if (h.wind <= 0 && d < 2.9) hurt(24, 'hunter'); }
    else if (see && d < 2.3) { h.wind = 0.45; h.atkT = 0.45; face(h, p); }
    else if (see && d < 9.5 && d > 3.8) { h.sp = 0; face(h, p); if (h.cd <= 0) { shoot(h); h.cd = 1.6; } }
    else { go(h, h.last.x, h.last.z, 5.8, dt); if (see && h.cd <= 0 && d < 15) { shoot(h); h.cd = 1.8; } }
  }
  h.cone.material.color.setHex(h.hostile ? 0xff2a2a : h.alert > 0.3 ? 0xff9a30 : 0xffe9a0); h.cone.material.opacity = 0.09 + 0.2 * h.alert;
}
function updSire(s, dt) {
  const p = pl, d = d2(s, p), fast = s.hp < 150;
  if (s.state === 'wait' || s.state === 'down') { s.sp = 0; if (s.state === 'wait') s.rot = -PI / 2; return; }
  s.t -= dt;
  if (s.state === 'stalk') { const a = Math.atan2(s.x - p.x, s.z - p.z) + 0.9 * dt * (s.dir || 1), tx = p.x + Math.sin(a) * 7, tz = p.z + Math.cos(a) * 7; go(s, tx, tz, 5, dt); face(s, p); if (s.t <= 0) { s.state = 'tele'; s.t = fast ? 0.42 : 0.6; s.line.visible = true; tone(880, 0.3, 'sine', 0.07, 400); } }
  else if (s.state === 'tele') { s.sp = 0; if (s.t > 0.15) face(s, p); if (s.t <= 0) { s.state = 'rush'; s.t = 0.38; s.hit = false; s.line.visible = false; tone(200, 0.3, 'sawtooth', 0.09, 600); } }
  else if (s.state === 'rush') { for (let i = 0; i < 3; i++) { s.x += Math.sin(s.rot) * 34 * dt / 3; s.z += Math.cos(s.rot) * 34 * dt / 3; collide(s); } s.sp = 12; if (!s.hit && d < 1.7) { s.hit = true; hurt(26, 'sire'); p.x += Math.sin(s.rot) * 2.5; p.z += Math.cos(s.rot) * 2.5; collide(p); }
    if (s.t <= 0) { if (fast && !s.again) { s.again = true; s.state = 'tele'; s.t = 0.36; s.line.visible = true; } else { s.again = false; s.state = 'rest'; s.t = fast ? 0.85 : 1.1; } } }
  else if (s.state === 'rest') { s.sp = 0; if (s.t <= 0) { s.state = 'stalk'; s.t = R(0.9, 1.8); s.dir = Math.random() < 0.5 ? 1 : -1; } }
  s.pose = s.state === 'rest' ? 'dazed' : s.state === 'tele' ? 'aim' : null;
}
function anim(e, dt) {
  const P = e.P, g = e.g, by = onBridge(e) ? 0.28 : 0;
  e.vr += angd(e.rot, e.vr) * Math.min(1, dt * 14);
  if (e.dead) { e.fall = Math.min(1, e.fall + dt * 3); g.rotation.set(-PI / 2 * e.fall, e.vr, 0); g.position.set(e.x, by + 0.2 * e.fall, e.z); return; }
  e.ph += dt * e.sp * 1.7; const a = Math.min(1, e.sp / 3) * 0.8, s = Math.sin(e.ph);
  P.LegL.rotation.x = s * a; P.LegR.rotation.x = -s * a; P.ArmL.rotation.x = -s * a * 0.8; P.ArmR.rotation.x = s * a * 0.8; P.Head.rotation.set(0, 0, 0); P.Torso.rotation.x = e.sp > 8 ? 0.35 : 0; let tilt = 0;
  if (e.pose === 'feed') { P.ArmL.rotation.x = P.ArmR.rotation.x = -1.3; P.Head.rotation.x = 0.5; tilt = 0.18; }
  else if (e.pose === 'held') { P.Head.rotation.z = 0.6; P.ArmL.rotation.x = 0.2; tilt = -0.12; }
  else if (e.pose === 'dazed') { P.Head.rotation.x = 0.35; P.Head.rotation.z = Math.sin(S.time * 2 + e.ph) * 0.15; }
  else if (e.pose === 'aim') P.ArmR.rotation.x = -1.5;
  if (e.atkT > 0) { e.atkT -= e === pl ? 0 : dt; P.ArmR.rotation.x = -2.2 + e.atkT * 4; P.ArmL.rotation.x = -1.2; }
  g.rotation.set(tilt, e.vr, 0); g.position.set(e.x, by + Math.abs(s) * a * 0.06, e.z); g.visible = e !== sire ? true : g.visible;
  if (e.ring) { const show = S.senses && d2(e, pl) < 48 && g.visible; e.ring.visible = show; if (show) { if (e.verv && e.kind === 'npc') e.vk = true; const hb = Math.pow(Math.abs(Math.sin(S.time * 3.2 + e.ph)), 6); e.ring.scale.setScalar(1.5 + hb * 0.7); } }
}
const N = { fog: new T.Color(0x0b1220), sky: new T.Color(0x6f8fd0), gnd: new T.Color(0x1b2230), sun: new T.Color(0xa9c0f5) },
  D = { fog: new T.Color(0x70494f), sky: new T.Color(0xe09a8a), gnd: new T.Color(0x3a2a30), sun: new T.Color(0xff9a5a) },
  M = { fog: new T.Color(0xa9bfd4), sky: new T.Color(0xcfe2ff), gnd: new T.Color(0x6a6a58), sun: new T.Color(0xfff0d0) }, GREY = new T.Color(0x56607a);
function updSky(dt) {
  const t = clamp((S.clock - 28.4) / 1.6, 0, 1), k = t * t * (3 - 2 * t); if (S.dawned && S.ring) S.day = Math.min(1, S.day + dt / 20);
  const mix = (key, out) => out.copy(N[key]).lerp(D[key], k).lerp(M[key], S.day);
  mix('fog', scene.fog.color); scene.background.copy(scene.fog.color); mix('sky', hemi.color); mix('gnd', hemi.groundColor); mix('sun', moon.color);
  hemi.intensity = lerp(0.8, 1.25, S.day); moon.intensity = lerp(1.15, 1.7, Math.max(k * 0.5, S.day));
  if (S.senses) { hemi.color.lerp(GREY, 0.85); moon.color.lerp(GREY, 0.85); hemi.intensity *= 0.6; scene.fog.color.multiplyScalar(0.55); scene.background.copy(scene.fog.color); }
  flies.material.opacity = 0.9 * (1 - Math.max(k, S.day)); flies.position.y = Math.sin(S.time * 0.6) * 0.3;
  fire.intensity = 2 + Math.sin(S.time * 11) * 0.3 + Math.sin(S.time * 23) * 0.2;
}
const camT = new T.Vector3(), look = new T.Vector3(), v3 = new T.Vector3();
function updCam(dt, snap) {
  const tall = innerWidth < innerHeight; camT.set(pl.x, tall ? 25 : 22, pl.z + (tall ? 16 : 15));
  if (snap) { cam.position.copy(camT); look.set(pl.x, 1, pl.z); } else { cam.position.lerp(camT, 1 - Math.exp(-dt * 7)); look.lerp(v3.set(pl.x, 1, pl.z), 1 - Math.exp(-dt * 9)); }
  shake = Math.max(0, shake - dt * 1.6); cam.position.x += (Math.random() - 0.5) * shake; cam.position.y += (Math.random() - 0.5) * shake; cam.lookAt(look);
  moon.position.set(pl.x - 26, 48, pl.z - 20); moon.target.position.set(pl.x, 0, pl.z); aura.position.set(pl.x, 2.4, pl.z + 0.5);
  for (const b of FADE) { const hide = pl.z < b.z + b.d / 2 && pl.z > b.z - b.d / 2 - 9 && Math.abs(pl.x - b.x) < b.w / 2 + 2.5, a = lerp(b.a, hide ? 0.22 : 1, Math.min(1, dt * 8));
    if (Math.abs(a - b.a) > 0.001 || (hide && b.a === 1)) { const tr = a < 0.99; b.o.traverse(m => { if (m.isMesh) { if (m.material.transparent !== tr) { m.material.transparent = tr; m.material.needsUpdate = true; } m.material.opacity = a; m.castShadow = !hide; } }); b.a = a > 0.995 ? 1 : a; } }
}
const ARW = [$('a0'), $('a1')];
function updHud() {
  const set = (id, v) => { $(id).querySelector('u').style.width = clamp(v, 0, 100) + '%'; };
  set('bBlood', S.blood); set('bHp', S.hp); set('bHum', S.hum); set('sus', S.sus);
  $('vBlood').textContent = Math.round(S.blood); $('vHp').textContent = Math.max(0, Math.round(S.hp)); $('vHum').textContent = S.off ? 'OFF' : Math.round(S.hum); $('clock').textContent = fmtClock(S.clock);
  document.body.classList.toggle('hurt', pl.hitT > 0 || S.blood <= 0 || (S.verv && S.stage < 4)); $('tSwitch').textContent = touch ? 'Switch' : 'Switch (H)'; $('tDiary').textContent = touch ? 'Diary' : 'Diary (Tab)';
  // prompt
  const p = pl, E = touch ? 'BITE' : 'E', Q = touch ? 'COMPEL' : 'Q'; let t = '';
  if (p.feed) t = '';
  else if (d2(p, witch) < 3.6) t = `${E}: speak with Odette`;
  else if (S.stage === 4 && sire.state === 'wait' && d2(p, sire) < 4.5) t = `${E}: face Ambrose`;
  else if (!S.lapis && S.stage >= 2 && d2(p, lapisM) < 2.6) t = `${E}: take the lapis lazuli`;
  else if (!S.verv && S.stage === 2 && d2(p, vervM) < 2.8) t = `${E}: cut the vervain`;
  else if (!S.ring && S.clock > 28.5 && d2(p, { x: CR.x, z: CR.z + 3.5 }) < 3) t = `${E}: seal yourself in the crypt until nightfall`;
  else { let best = null, bd = 5; for (const e of ents) { if (e.dead || e === p || e.kind === 'sire' || e.kind === 'witch') continue; const d = d2(p, e); if (d < bd) { bd = d; best = e; } }
    if (best) { const vv = best.vk ? ' (vervain)' : ''; if (best.kind === 'hunter') t = bd < 3.1 ? (touch ? 'STRIKE' : 'J') + (best.hostile ? ': strike' : ': strike. From behind it is silent') : '';
      else if (best.state === 'dazed') t = `${Q}: make them forget`; else if (bd < 2.1) t = `Hold ${E}: feed${best.state === 'compelled' ? '' : ' (they will scream)'}${vv}`; else if (best.state !== 'compelled' && best.state !== 'flee') t = `${Q}: compel${vv}`; } }
  $('prompt').hidden = !t; if (t) $('prompt').textContent = t;
  // objective arrows
  const tg = targets(); for (let i = 0; i < 2; i++) { const a = ARW[i], o = tg[i]; if (!o || d2(o, p) < 13) { a.hidden = true; continue; } const an = Math.atan2(-(o.z - p.z), o.x - p.x); a.hidden = false; a.style.left = 50 + Math.cos(an) * 40 + '%'; a.style.top = 50 - Math.sin(an) * 34 + '%'; a.firstChild.style.transform = `rotate(${PI / 2 - an}rad)`; a.lastChild.textContent = Math.round(d2(o, p)) + ' m'; }
}
function updWorld(dt) {
  S.time += dt; S.clock += dt * 0.0105;
  if (S.sus >= 30 && !F.s30) { F.s30 = 1; let n = 0; for (const e of ents) if (e.kind === 'npc' && !e.dead && !e.verv && e !== keeper && n < 3) { e.verv = true; e.ring.material = RM.verv; n++; } toast('The Council is slipping vervain into the town\'s coffee.'); }
  if (S.sus >= 50 && !F.s50) { F.s50 = 1; hunter(62, 20, [[30, 5], [30, 42]]); hunter(62, 24, [[8, 23], [52, 23]]); toast('Armed patrols on the square. They will know you on sight.'); }
  if (S.sus >= 80 && !F.s80) { F.s80 = 1; toast('Lockdown. Every hunter in Mystic Falls is looking for you.'); }
  if (!ents.some(e => e.hostile)) S.sus = Math.max(0, S.sus - dt * 0.1);
  if (S.clock >= 28.5 && !F.dawn) { F.dawn = 1; diary('dawn'); if (!S.ring) toast('The sky is turning. Find a ring, or be underground by six.'); }
  if (S.clock >= 30 && !S.dawned) { S.dawned = true; if (S.ring) diary('sunrise'); else { document.body.classList.add('sun'); toast('THE SUN.'); } }
  if (S.dawned && !S.ring) { S.hp -= dt * 16; shake = 0.3; fx(pl.x + R(-0.5, 0.5), pl.z + R(-0.5, 0.5), 0xffa040, 1.2, 0.3); if (S.hp <= 0) return end('ash'); }
  updPlayer(dt);
  for (const e of ents) { if (!e.dead && e !== pl) { if (e.kind === 'npc') updNpc(e, dt); else if (e.kind === 'hunter') updHunter(e, dt); else if (e.kind === 'sire') updSire(e, dt); } anim(e, dt); }
  for (let i = shots.length - 1; i >= 0; i--) { const s = shots[i]; s.x += s.vx * dt; s.z += s.vz * dt; s.t += dt; s.m.position.set(s.x, 1.5, s.z); let gone = s.t > 1.5 || !los(s, { x: s.x + 0.01, z: s.z + 0.01 });
    if (!gone && hyp(s.x - pl.x, s.z - pl.z) < 0.85 && pl.inv <= 0) { gone = true; hurt(s.verv ? 8 : 17, 'hunter'); if (s.verv) { pl.vervT = 5; toast('Vervain dart. Your gifts gutter out.'); } } if (gone) { scene.remove(s.m); shots.splice(i, 1); } }
  for (let i = fxs.length - 1; i >= 0; i--) { const f = fxs[i]; f.t += dt; const k = f.t / f.dur; f.m.scale.setScalar(0.3 + k * f.size); f.m.material.opacity = 1 - k; if (k >= 1) { scene.remove(f.m); fxs.splice(i, 1); } }
  lapisM.rotation.y += dt * 1.5; lapisM.position.y = 1.75 + Math.sin(S.time * 2) * 0.1;
  // heartbeat
  beatT -= dt; if (beatT <= 0) { if (pl.feed) { beat(0.3); beatT = lerp(1.25, 0.42, pl.feed.blood / 100); } else if (S.senses) { let near = 99; for (const e of ents) if (e.kind === 'npc' && !e.dead) near = Math.min(near, d2(e, pl)); if (near < 20) beat(0.22 * (1 - near / 20)); beatT = 0.85; } else beatT = 0.3; }
}
let lastT = 0;
function loop(ts) {
  requestAnimationFrame(loop); const dt = Math.min(0.05, (ts - lastT) / 1000 || 0.016); lastT = ts;
  if (!S.paused && !S.over) updWorld(dt); else if (pl) for (const e of ents) anim(e, 0);
  if (pl) { updSky(dt); updCam(dt); if (!S.over) updHud(); }
  ren.render(scene, cam);
}

/* ---------------- boot ---------------- */
function b64buf(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }
new T.GLTFLoader().parse(b64buf(window.HM_MODELS), '', g => {
  for (const c of g.scene.children.slice()) MODELS[c.name] = c;
  buildWorld(); spawn(); setObj(); setBeams(targets()); updCam(0, true);
  const b = $('begin'); b.disabled = false; b.textContent = 'Wake up';
  b.onclick = () => { audio(); $('title').hidden = true; $('hudwrap').hidden = false; diary('wake', true); };
  window.HM = { S, pl, ents, press, K, F, end, stage };
  requestAnimationFrame(loop);
}, e => { $('begin').textContent = 'The models failed to load'; console.error(e); });
})();

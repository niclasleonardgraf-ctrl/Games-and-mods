/* Hollow Moon — core: helpers, renderer + post-processing, input, audio, particles, model rigs. */
const T = THREE, $ = id => document.getElementById(id), PI = Math.PI, TAU = PI * 2, hyp = Math.hypot;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t, sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function mkRng(s) { return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = (a, b) => a + Math.random() * (b - a), RI = (a, b) => Math.floor(R(a, b + 1)), pick = a => a[Math.floor(Math.random() * a.length)], chance = p => Math.random() < p;
const d2 = (a, b) => hyp(a.x - b.x, a.z - b.z), dirTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const angd = (a, b) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* runtime (never saved) */
const RT = { area: null, paused: true, started: false, time: 0, hitstop: 0, shake: 0, touch: false, menu: null, boss: null, combatT: 0, quality: 'high', zoom: 1, lights: [], hurtV: 0, flashV: 0, zone: null };
let S = null;      // save state (see 40-systems.js newGame)
let pl = null;     // player actor
let P = {};        // derived player stats
const MODELS = {}, actors = [], shots = [], zonesFx = [], decals = [], trails = [], floats = [];

/* ---------------- renderer + post ---------------- */
const canvas = $('c');
const ren = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
ren.outputEncoding = T.LinearEncoding; ren.toneMapping = T.NoToneMapping; ren.shadowMap.enabled = true; ren.shadowMap.type = T.PCFSoftShadowMap; ren.autoClear = true;
const scene = new T.Scene(); scene.background = new T.Color(0x0b1220); scene.fog = new T.Fog(0x0b1220, 36, 92);
const cam = new T.PerspectiveCamera(40, 1, 1, 320);
const hemi = new T.HemisphereLight(0x6f8fd0, 0x1b2230, 0.8), sun = new T.DirectionalLight(0xa9c0f5, 1.1);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 170 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
scene.add(hemi, sun, sun.target);
const plights = []; for (let i = 0; i < 4; i++) { const l = new T.PointLight(0xff8a3a, 0, 20, 1.7); scene.add(l); plights.push(l); }
const aura = new T.PointLight(0x9fb4ff, 0.35, 12, 1.6); scene.add(aura);

const postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), postScene = new T.Scene(), postQuad = new T.Mesh(new T.PlaneGeometry(2, 2)); postQuad.frustumCulled = false; postScene.add(postQuad);
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const shader = (fs, u) => new T.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
const mBright = shader('uniform sampler2D t; uniform vec2 px; uniform float thr; varying vec2 vUv; void main(){ vec3 c = (texture2D(t, vUv + px * vec2(-1., -1.)).rgb + texture2D(t, vUv + px * vec2(1., -1.)).rgb + texture2D(t, vUv + px * vec2(-1., 1.)).rgb + texture2D(t, vUv + px * vec2(1., 1.)).rgb) * .25; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(thr, thr + .22, l), 1.); }', { t: { value: null }, px: { value: new T.Vector2() }, thr: { value: 0.72 } });
const mBlur = shader('uniform sampler2D t; uniform vec2 d; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb * .227; c += (texture2D(t, vUv + d * 1.38).rgb + texture2D(t, vUv - d * 1.38).rgb) * .316; c += (texture2D(t, vUv + d * 3.23).rgb + texture2D(t, vUv - d * 3.23).rgb) * .07; gl_FragColor = vec4(c, 1.); }', { t: { value: null }, d: { value: new T.Vector2() } });
const mFinal = shader(`uniform sampler2D t, b; uniform float bloom, sat, vig, time, hurt, grain, flash; uniform vec3 tint; varying vec2 vUv;
void main(){ vec3 c = texture2D(t, vUv).rgb; c += texture2D(b, vUv).rgb * bloom; c = mix(c, c * c * (3. - 2. * c), .3);
float l = dot(c, vec3(.299, .587, .114)); c = mix(vec3(l), c, sat) * tint; vec2 q = vUv - .5; float v = smoothstep(.9, .25, length(q) * 1.2);
c *= mix(1. - vig, 1., v); c = mix(c, vec3(.5, .02, .05), hurt * (1. - v)); c += flash;
c += (fract(sin(dot(vUv * vec2(1920., 1080.) + time, vec2(12.9898, 78.233))) * 43758.5453) - .5) * grain; gl_FragColor = vec4(c, 1.); }`,
  { t: { value: null }, b: { value: null }, bloom: { value: 0.9 }, sat: { value: 1.08 }, vig: { value: 0.55 }, time: { value: 0 }, hurt: { value: 0 }, grain: { value: 0.035 }, flash: { value: 0 }, tint: { value: new T.Color(1, 1, 1) } });
let rtMain, rtA, rtB;
function setupRT() {
  const w = canvas.width, h = canvas.height, o = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat };
  for (const r of [rtMain, rtA, rtB]) r && r.dispose();
  rtMain = ren.capabilities.isWebGL2 && RT.quality !== 'low' ? new T.WebGLMultisampleRenderTarget(w, h, o) : new T.WebGLRenderTarget(w, h, o);
  if (rtMain.isWebGLMultisampleRenderTarget) rtMain.samples = 4; rtMain.texture.encoding = T.sRGBEncoding;
  const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2); rtA = new T.WebGLRenderTarget(bw, bh, Object.assign({ depthBuffer: false }, o)); rtB = new T.WebGLRenderTarget(bw, bh, Object.assign({ depthBuffer: false }, o));
  mBright.uniforms.px.value.set(1 / w, 1 / h);
}
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, RT.quality === 'high' ? 2 : RT.quality === 'med' ? 1.5 : 1), w = innerWidth, h = innerHeight;
  ren.setPixelRatio(dpr); ren.setSize(w, h, false); cam.aspect = w / h; cam.fov = w < h ? 54 : 40; cam.updateProjectionMatrix(); setupRT();
  const f = $('fxc'); f.width = w * Math.min(dpr, 1.5); f.height = h * Math.min(dpr, 1.5);
}
function setQuality(q) { RT.quality = q; const sh = q === 'low' ? 0 : q === 'med' ? 1024 : 2048; ren.shadowMap.enabled = sh > 0; sun.castShadow = sh > 0; if (sh) { sun.shadow.mapSize.set(sh, sh); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); resize(); }
function pass(mat, target) { postQuad.material = mat; ren.setRenderTarget(target); ren.render(postScene, postCam); }
function renderFrame() {
  ren.setRenderTarget(rtMain); ren.render(scene, cam); RT.tris = ren.info.render.triangles; RT.calls = ren.info.render.calls;
  mBright.uniforms.t.value = rtMain.texture; pass(mBright, rtA);
  for (let i = 0; i < 2; i++) { const k = 1 + i * 1.4; mBlur.uniforms.t.value = rtA.texture; mBlur.uniforms.d.value.set(k / rtA.width, 0); pass(mBlur, rtB); mBlur.uniforms.t.value = rtB.texture; mBlur.uniforms.d.value.set(0, k / rtA.height); pass(mBlur, rtA); }
  const u = mFinal.uniforms; u.t.value = rtMain.texture; u.b.value = rtA.texture; u.time.value = RT.time % 100; pass(mFinal, null);
}
addEventListener('resize', resize);

/* ---------------- input ---------------- */
const K = {}, J = { x: 0, y: 0, id: null, ox: 0, oy: 0 }, mouse = { x: 0, y: 0, l: false, r: false, lt: 0, wx: 0, wz: 0, used: false };
const keyHandlers = [];           // fn(key) -> true if consumed
function press(k) { for (const h of keyHandlers) if (h(k)) return; }
addEventListener('keydown', e => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase(); if ([' ', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault(); if (!K[k]) { K[k] = true; press(k); } });
addEventListener('keyup', e => { K[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in K) K[k] = false; mouse.l = mouse.r = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.used = true; } });
canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; mouse.x = e.clientX; mouse.y = e.clientY; mouse.used = true; audioInit(); if (e.button === 0) { mouse.l = true; mouse.lt = RT.time; press('mouse0'); } else if (e.button === 2) { mouse.r = true; press('mouse2'); } });
addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') return; if (e.button === 0) { mouse.l = false; press('mouse0up'); } else if (e.button === 2) mouse.r = false; });
const ray = new T.Raycaster(), ndc = new T.Vector2(), gplane = new T.Plane(new T.Vector3(0, 1, 0), 0), v3 = new T.Vector3(), v3b = new T.Vector3();
function updMouseWorld() { ndc.set(mouse.x / innerWidth * 2 - 1, -(mouse.y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam); if (ray.ray.intersectPlane(gplane, v3)) { mouse.wx = v3.x; mouse.wz = v3.z; } }
function toScreen(x, y, z) { v3b.set(x, y, z).project(cam); return { x: (v3b.x + 1) / 2 * innerWidth, y: (1 - v3b.y) / 2 * innerHeight, ok: v3b.z < 1 && Math.abs(v3b.x) < 1.1 && Math.abs(v3b.y) < 1.1 }; }

/* ---------------- audio: everything is synthesised ---------------- */
let AC = null, master = null, musicG = null, noiseBuf = null, combatG = null;
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = 0.8; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    musicG = AC.createGain(); musicG.gain.value = 0.5; musicG.connect(master); combatG = AC.createGain(); combatG.gain.value = 0; combatG.connect(master);
    const wind = AC.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true; const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.5; const wg = AC.createGain(); wg.gain.value = 0.03; wind.connect(bp); bp.connect(wg); wg.connect(master); wind.start();
    const lfo = AC.createOscillator(); lfo.frequency.value = 0.11; const lg = AC.createGain(); lg.gain.value = 200; lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
    musicLoop(); combatLoop();
  } catch (e) { AC = null; }
}
function tone(f, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0, dest) {
  if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + delay; o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, freq, q = 1, vol = 0.2, slide = 0, delay = 0, type = 'bandpass') {
  if (!AC) return; const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), t = AC.currentTime + delay; s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.03);
}
const SFX = {
  swing: () => noise(0.16, 900, 0.8, 0.12, 1600), heavy: () => { noise(0.28, 500, 0.7, 0.18, 1200); tone(90, 0.2, 'sine', 0.12, -40); },
  hit: () => { noise(0.09, 1400, 1.2, 0.2, -900); tone(140, 0.1, 'square', 0.1, -70); }, crit: () => { noise(0.14, 2200, 1.5, 0.25, -1500); tone(220, 0.16, 'sawtooth', 0.12, -150); tone(880, 0.2, 'triangle', 0.06, 400); },
  hurt: () => { tone(120, 0.22, 'sawtooth', 0.18, -50); noise(0.12, 600, 1, 0.16, -300); }, block: () => { tone(520, 0.08, 'square', 0.1, -200); noise(0.07, 2600, 3, 0.16); },
  parry: () => { tone(1320, 0.3, 'triangle', 0.18, 300); tone(1980, 0.4, 'sine', 0.1, 0, 0.02); noise(0.08, 4000, 4, 0.2); }, dodge: () => noise(0.22, 500, 0.6, 0.1, 900),
  blur: () => { noise(0.2, 300, 0.5, 0.14, 2200); tone(200, 0.2, 'sawtooth', 0.05, 700); }, shoot: () => { noise(0.07, 1800, 2, 0.2, -1200); tone(300, 0.1, 'square', 0.08, -180); },
  gun: () => { noise(0.2, 900, 0.5, 0.35, -700); tone(110, 0.14, 'square', 0.2, -60); }, magic: () => { tone(520, 0.35, 'sine', 0.12, 500); tone(780, 0.3, 'triangle', 0.07, 600, 0.03); },
  fire: () => noise(0.5, 700, 0.4, 0.22, -400), zap: () => { noise(0.25, 3000, 0.3, 0.22, -2500); tone(1400, 0.12, 'sawtooth', 0.08, -1100); }, heal: () => { tone(523, 0.3, 'sine', 0.1); tone(659, 0.3, 'sine', 0.1, 0, 0.08); tone(784, 0.5, 'sine', 0.1, 0, 0.16); },
  bite: () => { tone(170, 0.25, 'sawtooth', 0.16, -90); noise(0.15, 500, 2, 0.14); }, die: () => { tone(110, 0.5, 'sawtooth', 0.14, -70); noise(0.4, 300, 0.6, 0.14, -200); },
  ash: () => noise(0.7, 2400, 0.4, 0.14, -2000), coin: () => { tone(1568, 0.09, 'square', 0.06); tone(2093, 0.2, 'square', 0.06, 0, 0.07); }, loot: () => { tone(784, 0.12, 'triangle', 0.1); tone(1175, 0.25, 'triangle', 0.1, 0, 0.09); },
  rare: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.5, 'triangle', 0.1, 0, i * 0.09)), level: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.6, 'triangle', 0.14, 0, i * 0.1)),
  quest: () => { tone(294, 0.6, 'triangle', 0.12); tone(440, 0.9, 'triangle', 0.1, 0, 0.18); }, ui: () => tone(660, 0.05, 'triangle', 0.06), deny: () => tone(140, 0.14, 'square', 0.08, -30), open: () => { noise(0.2, 400, 1, 0.12, 300); tone(196, 0.3, 'triangle', 0.08, 100); },
  howl: () => { tone(330, 1.6, 'sine', 0.1, 190); tone(332, 1.6, 'triangle', 0.05, 180, 0.05); }, thunder: () => { noise(2.6, 140, 0.3, 0.5, -90, 0, 'lowpass'); }, growl: () => tone(70, 0.5, 'sawtooth', 0.14, 30),
  step: () => noise(0.05, 220, 1, 0.03), tele: () => tone(980, 0.25, 'sine', 0.05, 350), boom: () => { noise(0.6, 220, 0.4, 0.5, -150, 0, 'lowpass'); tone(60, 0.5, 'sine', 0.3, -30); }, turn: () => { tone(60, 2.5, 'sine', 0.3, 20); tone(880, 2.2, 'sine', 0.08, -800); },
  heart: () => { tone(58, 0.16, 'sine', 0.3); tone(48, 0.2, 'sine', 0.2, 0, 0.14); },
};
const sfx = (n) => { if (AC && SFX[n]) SFX[n](); };
/* generative score: slow minor pads, a pulse that fades in during combat */
const CHORDS = [[110, 130.8, 164.8], [87.3, 110, 130.8], [130.8, 164.8, 196], [98, 123.5, 146.8], [110, 130.8, 164.8], [73.4, 110, 146.8], [82.4, 123.5, 164.8], [82.4, 103.8, 123.5]];
let chordI = 0;
function musicLoop() {
  if (!AC) return; const ch = CHORDS[chordI++ % CHORDS.length], t = AC.currentTime, day = S && !isNight(), dng = RT.area && RT.area.id === 'tomb';
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(day ? 900 : 480, t); lp.Q.value = 0.6; lp.connect(musicG);
  ch.forEach((f, i) => { for (const det of [0, 0.4]) { const o = AC.createOscillator(), g = AC.createGain(); o.type = i === 0 ? 'sawtooth' : 'triangle'; o.frequency.value = (dng ? f * 0.5 : f) * (1 + det / 100); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(i === 0 ? 0.035 : 0.05, t + 2.5); g.gain.linearRampToValueAtTime(0.0001, t + 8.6); o.connect(g); g.connect(lp); o.start(t); o.stop(t + 9); } });
  for (let i = 0; i < 3; i++) if (chance(0.6)) { const f = pick(ch) * pick([2, 4, 4, 8]) * (day ? 1 : 1); tone(f, 2.2, 'sine', 0.035, 0, R(0.5, 7), musicG); }
  setTimeout(musicLoop, 7600);
}
function combatLoop() {
  if (!AC) return; const want = RT.combatT > 0 && !RT.paused ? (RT.boss ? 0.5 : 0.32) : 0; combatG.gain.setTargetAtTime(want, AC.currentTime, 0.6);
  for (let i = 0; i < 8; i++) { const d = i * 0.25; tone(i % 4 === 0 ? 55 : 49, 0.16, 'sine', i % 2 ? 0.25 : 0.5, -18, d, combatG); if (i % 2) tone(RT.boss ? 220 : 165, 0.08, 'sawtooth', 0.05, -40, d + 0.125, combatG); }
  setTimeout(combatLoop, 2000);
}

/* ---------------- particles ---------------- */
const PMAX = 1600, pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 4), pSize = new Float32Array(PMAX), pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX), pMax = new Float32Array(PMAX), pGrav = new Float32Array(PMAX), pBase = new Float32Array(PMAX);
const pGeo = new T.BufferGeometry(); pGeo.setAttribute('position', new T.BufferAttribute(pPos, 3)); pGeo.setAttribute('pc', new T.BufferAttribute(pCol, 4)); pGeo.setAttribute('ps', new T.BufferAttribute(pSize, 1));
const pMat = new T.ShaderMaterial({ uniforms: { sc: { value: 600 } }, transparent: true, depthWrite: false, blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor,
  vertexShader: 'attribute vec4 pc; attribute float ps; uniform float sc; varying vec4 vc; void main(){ vc = pc; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = ps * sc / -mv.z; gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'varying vec4 vc; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .12, d); gl_FragColor = vec4(vc.rgb * a, a * (1. - vc.a)); }' });
const pPts = new T.Points(pGeo, pMat); pPts.frustumCulled = false; pPts.renderOrder = 5; scene.add(pPts);
let pNext = 0;
/* puff(x,y,z,count,{c:[r,g,b],add:0..1,sp:speed,up:upward speed,life,size,grav,spread}) */
function puff(x, y, z, n, o) {
  const c = o.c || [1, 1, 1], sp = o.sp || 2, spread = o.spread == null ? 0.2 : o.spread;
  for (let i = 0; i < n; i++) { const k = pNext; pNext = (pNext + 1) % PMAX; const a = Math.random() * TAU, e = R(0.2, 1) * sp, j = k * 3;
    pPos[j] = x + R(-spread, spread); pPos[j + 1] = y + R(-spread, spread); pPos[j + 2] = z + R(-spread, spread);
    pVel[j] = Math.cos(a) * e + (o.vx || 0); pVel[j + 1] = (o.up || 0) + R(-0.3, 1) * sp * 0.6; pVel[j + 2] = Math.sin(a) * e + (o.vz || 0);
    const v = R(0.75, 1.1); pCol[k * 4] = c[0] * v; pCol[k * 4 + 1] = c[1] * v; pCol[k * 4 + 2] = c[2] * v; pCol[k * 4 + 3] = o.add == null ? 1 : o.add;
    pLife[k] = pMax[k] = (o.life || 0.6) * R(0.6, 1.2); pBase[k] = (o.size || 0.25) * R(0.6, 1.3); pGrav[k] = o.grav == null ? 6 : o.grav; }
}
function updParticles(dt) {
  for (let k = 0; k < PMAX; k++) { if (pLife[k] <= 0) { pSize[k] = 0; continue; } pLife[k] -= dt; const j = k * 3; pVel[j + 1] -= pGrav[k] * dt; pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += pVel[j + 2] * dt;
    if (pPos[j + 1] < 0.05 && pGrav[k] > 0) { pPos[j + 1] = 0.05; pVel[j] *= 0.5; pVel[j + 2] *= 0.5; pVel[j + 1] = 0; } const t = Math.max(0, pLife[k] / pMax[k]); pSize[k] = pBase[k] * Math.min(1, t * 2.5); }
  pGeo.attributes.position.needsUpdate = pGeo.attributes.pc.needsUpdate = pGeo.attributes.ps.needsUpdate = true; pMat.uniforms.sc.value = canvas.height * 0.9;
}
const BLOOD = [0.5, 0.02, 0.04], ASH = [0.35, 0.33, 0.32], SPARK = [1, 0.75, 0.3], MAGIC = [0.55, 0.45, 1], FIRE = [1, 0.45, 0.1], HOLY = [1, 0.95, 0.7], VERV = [0.7, 0.4, 1], ICE = [0.5, 0.8, 1], GREEN = [0.4, 1, 0.5];

/* ground decals (telegraphs, rings) and weapon trails */
function ringFx(x, z, col, size = 3, dur = 0.5, y = 0.12) { const m = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: col, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); m.position.set(x, y, z); areaAdd(m); decals.push({ m, t: 0, dur, size, kind: 'ring' }); }
const ringGeo = new T.RingGeometry(0.8, 1, 32).rotateX(-PI / 2);
/* telegraph: shape 'circle' {r} | 'arc' {r, arc} | 'line' {len, w}; fills over `dur` then calls nothing (logic lives with the attack) */
function telegraph(x, z, rot, shape, dur, col = 0xff2030) {
  let geo; if (shape.kind === 'circle') geo = new T.CircleGeometry(shape.r, 28).rotateX(-PI / 2); else if (shape.kind === 'arc') geo = new T.CircleGeometry(shape.r, 20, PI / 2 - shape.arc / 2 - PI, shape.arc).rotateX(-PI / 2).rotateY(PI); else geo = new T.PlaneGeometry(shape.w, shape.len).rotateX(-PI / 2).translate(0, 0, shape.len / 2);
  const g = new T.Group(), a = new T.Mesh(geo, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false })), b = new T.Mesh(geo, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, depthWrite: false, blending: T.AdditiveBlending }));
  g.add(a, b); g.position.set(x, 0.1, z); g.rotation.y = rot; b.scale.setScalar(0.01); areaAdd(g); const d = { m: g, fill: b, t: 0, dur, kind: 'tele', line: shape.kind === 'line' }; decals.push(d); return d;
}
function updDecals(dt) {
  for (let i = decals.length - 1; i >= 0; i--) { const d = decals[i]; d.t += dt; const k = d.t / d.dur;
    if (d.kind === 'ring') { d.m.scale.setScalar(0.25 + k * d.size); d.m.material.opacity = 1 - k; } else if (d.line) d.fill.scale.set(1, 1, Math.min(1, k)); else d.fill.scale.setScalar(Math.min(1, k));
    if (k >= 1 || d.kill) { d.m.parent && d.m.parent.remove(d.m); d.m.traverse(o => { if (o.geometry && o.geometry !== ringGeo) o.geometry.dispose(); if (o.material) o.material.dispose(); }); decals.splice(i, 1); } }
  for (let i = trails.length - 1; i >= 0; i--) { const t = trails[i]; t.t += dt; const k = t.t / t.dur; t.m.material.opacity = (1 - k) * t.a; t.m.rotation.y = t.r0 + t.sweep * Math.min(1, k * 1.6); if (k >= 1) { t.m.parent && t.m.parent.remove(t.m); t.m.geometry.dispose(); t.m.material.dispose(); trails.splice(i, 1); } }
}
function trail(a, range, arc, col = 0xdfe8ff, dir = 1, y = 1.15) {
  const geo = new T.RingGeometry(range * 0.45, range, 18, 1, -arc * 0.25, arc * 0.5).rotateX(-PI / 2).rotateY(PI / 2), m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
  m.position.set(a.x, y, a.z); const r0 = a.rot - dir * arc * 0.3; m.rotation.y = r0; areaAdd(m); trails.push({ m, t: 0, dur: 0.2, a: 0.7, r0, sweep: dir * arc * 0.6 });
}
function floatText(x, y, z, txt, col = '#fff', size = 16) { floats.push({ x, y, z, txt, col, size, t: 0, vx: R(-0.4, 0.4) }); if (floats.length > 60) floats.shift(); }

/* ---------------- models & rigs ---------------- */
function shadowed(o, cast = true) { o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = true; } }); return o; }
const phGeo = new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), phMat = new T.MeshStandardMaterial({ color: 0x55506a, roughness: 1 });
function model(name) { const m = MODELS[name]; if (m) return m.clone(true); const p = new T.Mesh(phGeo, phMat); p.name = name; return p; }
function place(name, x, z, r = 0, s = 1, parent) { const o = shadowed(model(name)); o.position.set(x, 0, z); o.rotation.y = r; o.scale.setScalar(s); (parent || RT.area.group).add(o); return o; }
/* rig: clone an articulated model, give it private materials (tints by material name), index parts by suffix */
function mkRig(name, tints = {}, scale = 1) {
  const g = model(name), mats = {}, parts = {};
  const tint = m => { if (!m.isMesh) return; const n = m.material.name; if (!mats[n]) { mats[n] = m.material.clone(); if (tints[n] != null) mats[n].color.setHex(tints[n]).convertSRGBToLinear(); } m.material = mats[n]; m.castShadow = true; };
  g.traverse(tint); for (const c of g.children) { const n = c.name.includes('_') ? c.name.split('_').pop() : c.name.replace(/^h/, ''); parts[n] = c; c.userData.rest = c.rotation.clone(); }
  g.scale.setScalar(scale); g.rotation.order = 'YXZ';
  return { g, P: parts, mats, scale, attach(n, to, pos) { if (!MODELS[n]) return null; const a = MODELS[n].clone(true); a.traverse(tint); (to || g).add(a); if (pos) a.position.set(pos[0], pos[1], pos[2]); return a; } };
}
function flashRig(a, k) { for (const n in a.rig.mats) { const m = a.rig.mats[n]; if (m.emissive && !m.userData.glow) m.emissive.setScalar(k); } }
function areaAdd(o) { (RT.area ? RT.area.group : scene).add(o); }

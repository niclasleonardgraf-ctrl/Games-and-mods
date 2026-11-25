/* Hollow Moon — built from src/ by tools/build.sh. Edit the sources, not this file. */
(() => { 'use strict';
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
/* Hollow Moon — data: items, affixes, skills, enemies, zones. Balance lives here. */
const RAR = [{ n: 'Common', c: '#b8b2a6', m: 1, aff: 0 }, { n: 'Uncommon', c: '#6fbf73', m: 1.12, aff: 1 }, { n: 'Rare', c: '#5b9cf0', m: 1.26, aff: 2 }, { n: 'Epic', c: '#b678f0', m: 1.42, aff: 3 }, { n: 'Legendary', c: '#f0a13c', m: 1.62, aff: 4 }, { n: 'Relic', c: '#e2334a', m: 1.8, aff: 0 }];
const lvlScale = l => (1 + 0.14 * (l - 1)) * Math.pow(1.028, l - 1);          // item + enemy damage curve
const hpScale = l => (1 + 0.2 * (l - 1)) * Math.pow(1.04, l - 1);             // enemy health curve
const xpNeed = l => Math.floor(70 * Math.pow(l, 1.65));

const BASES = {
  stake: { n: 'Oak Stake', slot: 'weapon', cls: 'fast', dmg: 8, mat: 'wood', model: 'wStake' }, dagger: { n: 'Hunting Knife', slot: 'weapon', cls: 'fast', dmg: 9, mat: 'steel', model: 'wDagger' },
  silverd: { n: 'Silver Dagger', slot: 'weapon', cls: 'fast', dmg: 8.5, mat: 'silver', model: 'wDagger', min: 5 }, bat: { n: 'Ash Bat', slot: 'weapon', cls: 'med', dmg: 12, mat: 'wood', model: 'wBat' },
  sword: { n: 'Sabre', slot: 'weapon', cls: 'med', dmg: 13, mat: 'steel', model: 'wSword', min: 3 }, silvers: { n: 'Silvered Blade', slot: 'weapon', cls: 'med', dmg: 12.5, mat: 'silver', model: 'wSword', min: 8 },
  axe: { n: "Woodsman's Axe", slot: 'weapon', cls: 'slow', dmg: 18, mat: 'steel', model: 'wAxe', min: 2 }, great: { n: 'Greatsword', slot: 'weapon', cls: 'slow', dmg: 21, mat: 'steel', model: 'wGreat', min: 9 },
  maul: { n: 'Ironwood Maul', slot: 'weapon', cls: 'slow', dmg: 20, mat: 'wood', model: 'wBat', min: 7 }, staff: { n: 'Hawthorn Staff', slot: 'weapon', cls: 'staff', dmg: 10, mat: 'magic', model: 'wStaff' },
  xbow: { n: 'Crossbow', slot: 'ranged', dmg: 17, cd: 1.3, mat: 'wood', model: 'crossbow', pspd: 36 }, revolver: { n: 'Revolver', slot: 'ranged', dmg: 11, cd: 0.62, mat: 'wood', model: 'revolver', pspd: 52, min: 5 },
  knives: { n: 'Throwing Knives', slot: 'ranged', dmg: 7.5, cd: 0.38, mat: 'steel', model: 'wDagger', pspd: 30 },
  jacket: { n: 'Leather Jacket', slot: 'armor', def: 7, hp: 12 }, coat: { n: 'Long Coat', slot: 'armor', def: 5, hp: 8, st: 12 }, vest: { n: "Hunter's Vest", slot: 'armor', def: 10, hp: 18, min: 4 },
  robe: { n: 'Coven Robe', slot: 'armor', def: 4, hp: 6, fo: 22 }, mail: { n: 'Council Mail', slot: 'armor', def: 15, hp: 26, min: 9 },
  ring: { n: 'Ring', slot: 'ring' }, signet: { n: 'Signet', slot: 'ring' }, band: { n: 'Iron Band', slot: 'ring' }, amulet: { n: 'Amulet', slot: 'amulet' }, locket: { n: 'Locket', slot: 'amulet' }, talisman: { n: 'Talisman', slot: 'amulet' },
};
const CLS = {   // melee move sets: [duration, damage mult] per combo hit; heavy attack
  fast: { hits: [[0.24, 0.8], [0.24, 0.8], [0.32, 1.25]], range: 2.5, arc: 1.5, heavy: { kind: 'lunge', dur: 0.5, mult: 2.1, st: 22 }, poise: 12, st: 0 },
  med: { hits: [[0.34, 1], [0.34, 1], [0.46, 1.5]], range: 3.0, arc: 2.1, heavy: { kind: 'over', dur: 0.7, mult: 2.5, st: 28 }, poise: 22, st: 0 },
  slow: { hits: [[0.48, 1.3], [0.48, 1.3], [0.62, 1.9]], range: 3.5, arc: 2.6, heavy: { kind: 'spin', dur: 0.8, mult: 2.2, st: 34 }, poise: 38, st: 0 },
  staff: { hits: [[0.36, 1], [0.36, 1], [0.48, 1.4]], range: 3.0, arc: 2.0, heavy: { kind: 'blast', dur: 0.75, mult: 2.4, st: 20 }, poise: 14, st: 0, bolt: true },
};
/* affixes: [key, label, min, max, perLevelGrowth, slots] */
const AFF = [
  ['dmg', 'Savage', 3, 7, 0.06, 'weapon ranged ring amulet'], ['crit', 'Keen', 2, 5, 0.03, 'weapon ranged ring amulet'], ['critd', 'Cruel', 8, 18, 0.25, 'weapon ranged ring'],
  ['hp', 'Stalwart', 8, 18, 1.6, 'armor ring amulet'], ['st', 'Tireless', 6, 14, 0.5, 'armor ring'], ['fo', 'Arcane', 8, 16, 0.6, 'armor amulet weapon'],
  ['def', 'Warded', 3, 7, 0.5, 'armor ring'], ['ls', 'Leeching', 1, 2.5, 0.02, 'weapon ring'], ['spd', 'Fleet', 2, 5, 0.03, 'armor amulet'], ['as', 'Quick', 3, 7, 0.04, 'weapon ring'],
  ['cdr', 'Focused', 3, 6, 0.04, 'amulet ring weapon'], ['xp', 'Learned', 4, 8, 0.05, 'amulet ring'], ['gold', 'Gilded', 8, 16, 0.2, 'amulet ring armor'], ['mf', 'Fortunate', 5, 10, 0.15, 'amulet ring'],
  ['regen', 'Mending', 0.3, 0.7, 0.03, 'armor amulet'], ['vsV', 'Slaying', 8, 16, 0.15, 'weapon ranged'], ['vsW', 'Moonbane', 8, 16, 0.15, 'weapon ranged'], ['vsS', 'Hallowed', 8, 16, 0.15, 'weapon ranged amulet'],
  ['spell', 'Witching', 5, 10, 0.12, 'weapon amulet ring armor'], ['burn', 'Smouldering', 3, 6, 0.5, 'weapon ranged'], ['thorns', 'Barbed', 3, 6, 0.6, 'armor'],
  ['mig', 'of Might', 1, 3, 0.12, 'weapon armor ring amulet'], ['fin', 'of Finesse', 1, 3, 0.12, 'weapon ranged armor ring amulet'], ['vig', 'of Vigor', 1, 3, 0.12, 'armor ring amulet'], ['wil', 'of Will', 1, 3, 0.12, 'weapon armor ring amulet'],
];
const AFFD = { dmg: '+{v}% damage', crit: '+{v}% critical chance', critd: '+{v}% critical damage', hp: '+{v} health', st: '+{v} stamina', fo: '+{v} focus', def: '+{v} armour', ls: '{v}% life steal', spd: '+{v}% movement speed', as: '+{v}% attack speed', cdr: '{v}% faster cooldowns', xp: '+{v}% experience', gold: '+{v}% gold found', mf: '+{v}% better loot', regen: '+{v} health per second', vsV: '+{v}% damage to vampires', vsW: '+{v}% damage to wolves', vsS: '+{v}% damage to spirits', spell: '+{v}% spell power', burn: '{v} fire damage on hit', thorns: '{v} damage to attackers', mig: '+{v} Might', fin: '+{v} Finesse', vig: '+{v} Vigor', wil: '+{v} Will' };
const UNIQ = {
  daylight: { n: 'Daylight Ring', base: 'ring', aff: [['hp', 30], ['regen', 1]], d: 'A vampire who wears it may walk in the sun.' },
  whiteoak: { n: 'White Oak Stake', base: 'stake', mult: 1.5, aff: [['vsV', 100], ['crit', 10]], d: 'Cut from the one tree that can end anything.' },
  compass: { n: "Founder's Compass", base: 'amulet', aff: [['mf', 25], ['crit', 6]], d: 'The needle swings toward anything that hunts. Enemies show on your map.' },
  moonstone: { n: 'Moonstone Pendant', base: 'amulet', aff: [['vsW', 40], ['def', 15], ['hp', 40]], d: 'Under a full moon, all your damage rises by a quarter.' },
  halebow: { n: "Hale's Crossbow", base: 'xbow', mult: 1.4, aff: [['vsV', 30], ['crit', 8]], d: 'Thirty years of practice in the stock. Bolts pierce.' },
  corvin: { n: "Corvin's Signet", base: 'signet', aff: [['ls', 6], ['dmg', 18], ['critd', 30]], d: 'It remembers the first night. A fifth more damage after dark.' },
  wardblade: { n: "Warden's Oath", base: 'great', mult: 1.35, aff: [['def', 20], ['dmg', 12]], d: 'Heavy blows send a shockwave through the stone.' },
  grimoire: { n: 'Thorne Grimoire', base: 'talisman', aff: [['spell', 35], ['fo', 40], ['cdr', 12]], d: 'Nine generations of marginalia.' },
  ripper: { n: "Ripper's Band", base: 'band', aff: [['dmg', 10], ['ls', 3]], d: 'Two percent more damage for every ten humanity you have lost.' },
  alphafang: { n: "Alpha's Fang", base: 'dagger', mult: 1.3, aff: [['as', 15], ['crit', 12], ['burn', 0]], d: 'Still warm. Strikes cause bleeding.' },
};
const CONS = {
  draught: { n: 'Healing Draught', d: 'Restores 40% of your health.', price: 28, icon: '✚' }, tonic: { n: 'Focus Tonic', d: 'Restores 60% of your focus.', price: 30, icon: '✦' },
  bloodbag: { n: 'Blood Bag', d: 'Vampires only. Restores 50 blood and a quarter of your health.', price: 40, icon: '♥' }, burger: { n: 'Grill Special', d: 'A minute of steady healing. Humans only.', price: 12, icon: '◉' },
  vervain: { n: 'Vervain Sprig', d: 'Coat your weapon: +35% damage to vampires for 90 seconds. Burns a vampire who uses it.', price: 14, icon: '❋' },
  wolfsbane: { n: 'Wolfsbane', d: 'Coat your weapon: +35% damage to wolves for 90 seconds.', price: 14, icon: '❋' }, sage: { n: 'White Sage', d: 'Burn it: restores health slowly and lifts every affliction.', price: 10, icon: '❋' },
  scrap: { n: 'Scrap', d: 'Salvage. The Council armourer uses it to reforge gear.', price: 3, icon: '▣' }, vblood: { n: 'Vial of Vampire Blood', d: 'Heals you completely. If you die with it in your veins, you come back. Changed.', price: 0, icon: '♦', quest: 1 },
  cure: { n: 'The Cure', d: 'One dose. Makes a vampire human again.', price: 0, icon: '♦', quest: 1 }, lapisq: { n: 'Lapis Lazuli', d: 'A witch can bind the sun into it.', price: 0, icon: '◆', quest: 1 },
  elderblood: { n: 'Blood of the First', d: "Corvin's blood. It hums. Several people want it.", price: 0, icon: '♦', quest: 1 }, locket: { n: 'Tarnished Locket', d: 'Engraved: E.F., 1864.', price: 0, icon: '◆', quest: 1 },
};

/* ---------------- skills ---------------- */
const SK = {
  h_weapon: { tree: 'hunter', n: 'Weapon Training', max: 5, req: 0, d: r => `+${6 * r}% melee damage.` },
  h_marks: { tree: 'hunter', n: 'Marksman', max: 5, req: 0, d: r => `+${8 * r}% ranged damage, ${5 * r}% faster reload.` },
  h_cond: { tree: 'hunter', n: 'Conditioning', max: 5, req: 0, d: r => `+${10 * r} stamina, +${8 * r}% stamina recovery.` },
  h_parry: { tree: 'hunter', n: 'Riposte', max: 3, req: 2, d: r => `A wider parry window. Your next hit after a parry deals +${50 * r}% damage.` },
  h_gren: { tree: 'hunter', n: 'Vervain Grenade', max: 3, req: 3, act: 1, cd: 14, cost: { st: 20 }, d: r => `Throw a grenade: ${120 + 40 * r}% weapon damage in an area. Vampires are stunned for ${1 + r} seconds.` },
  h_heart: { tree: 'hunter', n: 'Heartseeker', max: 3, req: 5, act: 1, cd: 10, cost: { st: 25 }, d: r => `Lunge and strike for ${260 + 40 * r}%. Kills ordinary enemies below ${15 + 5 * r}% health outright.` },
  h_whirl: { tree: 'hunter', n: 'Whirlwind', max: 3, req: 8, act: 1, cd: 9, cost: { st: 30 }, d: r => `Spin, hitting everything around you ${2 + r} times for 80% weapon damage.` },
  h_volley: { tree: 'hunter', n: 'Volley', max: 3, req: 10, act: 1, cd: 11, cost: { st: 22 }, d: r => `Loose ${3 + 2 * r} shots in a fan.` },
  h_second: { tree: 'hunter', n: 'Second Wind', max: 3, req: 12, d: r => `Falling below 30% health heals ${10 + 10 * r}% once every 90 seconds.` },
  h_slayer: { tree: 'hunter', n: "Slayer's Momentum", max: 5, req: 15, d: r => `Each kill grants +${2 + r}% damage for 10 seconds, stacking five times.` },
  h_five: { tree: 'hunter', n: 'Brotherhood', max: 1, req: 25, d: () => '+25% damage to vampires, wolves and spirits. Compulsion and stuns last half as long on you.' },
  w_attune: { tree: 'witch', n: 'Attunement', max: 5, req: 0, d: r => `+${8 * r}% spell power, +${10 * r} focus.` },
  w_chan: { tree: 'witch', n: 'Channeling', max: 5, req: 0, d: r => `+${12 * r}% focus recovery.` },
  w_incend: { tree: 'witch', n: 'Incendia', max: 5, req: 0, act: 1, cd: 6, cost: { fo: 22 }, d: r => `A cone of fire for ${140 + 30 * r}% spell damage. Sets enemies and the ground alight.` },
  w_aneur: { tree: 'witch', n: 'Aneurysm', max: 3, req: 3, act: 1, cd: 12, cost: { fo: 30 }, d: r => `Every enemy near you is stunned for ${1.5 + 0.5 * r}s and takes ${80 + 30 * r}% spell damage.` },
  w_ward: { tree: 'witch', n: 'Ward', max: 3, req: 5, act: 1, cd: 16, cost: { fo: 25 }, d: r => `A barrier that absorbs damage equal to ${20 + 10 * r}% of your health for 8 seconds.` },
  w_mend: { tree: 'witch', n: 'Mend', max: 3, req: 5, act: 1, cd: 18, cost: { fo: 30 }, d: r => `Heal ${20 + 10 * r}% of your health over 4 seconds.` },
  w_temp: { tree: 'witch', n: 'Tempest', max: 3, req: 10, act: 1, cd: 9, cost: { fo: 34 }, d: r => `Lightning leaps between ${3 + r} enemies for ${150 + 30 * r}% spell damage.` },
  w_herb: { tree: 'witch', n: 'Herbalist', max: 3, req: 4, d: r => `Draughts, tonics and herbs are ${15 * r}% stronger. Herb patches yield one more.` },
  w_spirit: { tree: 'witch', n: 'Ancestral Favour', max: 5, req: 12, d: r => `+${3 * r}% critical chance with spells. Kills restore ${3 * r} focus.` },
  w_express: { tree: 'witch', n: 'Expression', max: 1, req: 25, d: () => '+30% spell power. With no focus left, spells are paid for in health.' },
  v_pred: { tree: 'vampire', n: 'Predator', max: 5, req: 0, d: r => `+${5 * r}% melee damage, ${r}% life steal.` },
  v_heal: { tree: 'vampire', n: 'Healing Factor', max: 5, req: 0, d: r => `Regenerate ${(0.4 * r).toFixed(1)}% of your health every second while you have blood.` },
  v_blur: { tree: 'vampire', n: 'Blur', max: 3, req: 0, d: r => `Your dodge travels ${20 * r}% further${r >= 3 ? ' and cuts everything you pass through' : ''}.` },
  v_frenzy: { tree: 'vampire', n: 'Feeding Frenzy', max: 3, req: 0, act: 1, cd: 8, cost: {}, d: r => `Leap onto an enemy and feed: ${180 + 40 * r}% damage, heals you and restores ${20 + 5 * r} blood.` },
  v_compel: { tree: 'vampire', n: 'Compulsion', max: 3, req: 3, act: 1, cd: 22, cost: { bl: 18 }, d: r => `An enemy fights for you for ${8 + 4 * r} seconds. Bosses are stunned briefly instead. Vervain protects.` },
  v_step: { tree: 'vampire', n: 'Shadow Step', max: 3, req: 6, act: 1, cd: 9, cost: { bl: 12 }, d: r => `Vanish, reappear behind your target and strike for ${220 + 60 * r}%, always critical.` },
  v_ripper: { tree: 'vampire', n: 'The Switch', max: 3, req: 10, act: 1, cd: 40, cost: { bl: 10 }, d: r => `Turn it off for 12 seconds: +${30 + 15 * r}% damage, +25% speed, +5% life steal. Costs 2 humanity.` },
  v_sense: { tree: 'vampire', n: "Predator's Senses", max: 3, req: 4, d: r => `+${4 * r}% critical chance. You hear heartbeats: enemies show on your map.` },
  v_night: { tree: 'vampire', n: 'Nightwalker', max: 5, req: 12, d: r => `After dark: +${4 * r}% damage and +${2 * r}% speed.` },
  v_elder: { tree: 'vampire', n: 'Elder Blood', max: 5, req: 25, d: r => `+${6 * r}% health, damage and blood.` },
};
const TREES = { hunter: { n: 'Hunter', d: 'Steel, oak and nerve. Open to anyone.' }, witch: { n: 'Witch', d: "The Thorne line's craft. Lost to those who turn, unless they find another way." }, vampire: { n: 'Vampire', d: 'Only the dead may learn this.' } };
const ASC = { pow: { n: 'Power', d: '+2% damage per rank' }, vit: { n: 'Vitality', d: '+2% health per rank' }, swi: { n: 'Swiftness', d: '+1% cooldown recovery and attack speed per rank' }, fort: { n: 'Fortune', d: '+2% better loot and gold per rank' } };
const ascCost = r => 4 + r * 3 + Math.floor(r * r * 0.35);

/* ---------------- enemies ---------------- */
/* attacks: kind melee|lunge|slam|shoot|nova|blink|summon. dmg is a multiplier of the enemy's damage. */
const ATK = {
  slash: { kind: 'melee', range: 2.6, arc: 1.7, wind: 0.5, rec: 0.6, dmg: 1, cd: 1.3 }, claw: { kind: 'melee', range: 2.4, arc: 1.6, wind: 0.34, rec: 0.25, dmg: 0.7, cd: 1.2, reps: 2 },
  claw3: { kind: 'melee', range: 2.6, arc: 1.8, wind: 0.3, rec: 0.2, dmg: 0.7, cd: 1.6, reps: 3 }, touch: { kind: 'melee', range: 2.2, arc: 2.2, wind: 0.6, rec: 0.7, dmg: 1, cd: 1.5 },
  bite: { kind: 'lunge', range: 6.5, min: 2, dist: 6, w: 1.3, wind: 0.42, rec: 0.7, dmg: 1, cd: 2.2 }, lunge: { kind: 'lunge', range: 10, min: 3.5, dist: 10, w: 1.5, wind: 0.5, rec: 0.8, dmg: 1.3, cd: 3.4 },
  charge: { kind: 'lunge', range: 16, min: 5, dist: 17, w: 2.4, wind: 0.85, rec: 1.2, dmg: 1.5, cd: 6 }, leap: { kind: 'slam', range: 11, min: 4, r: 3.4, wind: 0.75, rec: 0.9, dmg: 1.4, cd: 5, jump: 1 },
  slam: { kind: 'slam', range: 3.6, r: 4.6, wind: 0.8, rec: 0.9, dmg: 1.3, cd: 4.5 }, quake: { kind: 'slam', range: 14, r: 3.2, wind: 0.9, rec: 0.6, dmg: 1.2, cd: 7, multi: 4 },
  gslash: { kind: 'melee', range: 4.4, arc: 2.4, wind: 0.6, rec: 0.6, dmg: 1.1, cd: 1.6 }, bolt: { kind: 'shoot', range: 15, min: 3, wind: 0.5, rec: 0.5, dmg: 0.9, cd: 2.2, n: 1, spd: 15, col: 0x9a6bff },
  bolt3: { kind: 'shoot', range: 15, min: 2, wind: 0.6, rec: 0.6, dmg: 0.8, cd: 3.2, n: 3, spread: 0.24, spd: 15, col: 0x9a6bff }, xbolt: { kind: 'shoot', range: 17, min: 4, wind: 0.55, rec: 0.6, dmg: 1, cd: 2, n: 1, spd: 30, col: 0xe8c890, wood: 1 },
  fan: { kind: 'shoot', range: 16, wind: 0.7, rec: 0.6, dmg: 0.8, cd: 5, n: 7, spread: 0.2, spd: 13, col: 0xff3050 }, nova: { kind: 'nova', range: 14, wind: 0.9, rec: 0.8, dmg: 0.9, cd: 8, n: 16, spd: 10, col: 0xff3050 },
  blink: { kind: 'blink', range: 16, min: 5, wind: 0.25, rec: 0.15, cd: 5 }, summon: { kind: 'summon', range: 30, wind: 1, rec: 0.6, cd: 16, n: 2 }, stab: { kind: 'melee', range: 2.3, arc: 1.2, wind: 0.4, rec: 0.5, dmg: 1.1, cd: 1.4 },
  howl: { kind: 'summon', range: 30, wind: 1.1, rec: 0.5, cd: 20, n: 3 },
};
const EN = {
  robber: { n: 'Grave Robber', rig: 'human', fam: 'human', hp: 36, dmg: 8, spd: 4.6, xp: 10, poise: 20, atk: ['slash'], look: { cloth: 0x5a5040, pants: 0x2a2620, hat: 1, w: 'wBat' }, gold: 1.5 },
  wolf: { n: 'Timber Wolf', rig: 'wolf', fam: 'wolf', hp: 28, dmg: 9, spd: 7.4, xp: 9, poise: 14, atk: ['bite'], strafe: 1, r: 0.6, tint: { fur: 0x6a6a70, furDark: 0x3a3a40 } },
  feral: { n: 'Feral Vampire', rig: 'human', fam: 'vampire', hp: 46, dmg: 11, spd: 6.1, xp: 14, poise: 22, atk: ['claw'], look: { cloth: 0x3a3a44, pants: 0x1a1a20, skin: 0xb8b0a8, hair: 0x201818, w: 'wClaws', torn: 1 } },
  stalker: { n: 'Night Stalker', rig: 'human', fam: 'vampire', hp: 64, dmg: 14, spd: 6.8, xp: 20, poise: 30, atk: ['lunge', 'claw'], strafe: 1, look: { cloth: 0x1c1c26, pants: 0x101014, skin: 0xc8c0b8, hair: 0x101010, coat: 1, w: 'wClaws' } },
  elder: { n: 'Elder Vampire', rig: 'human', fam: 'vampire', hp: 125, dmg: 19, spd: 6.6, xp: 40, poise: 60, atk: ['lunge', 'claw3', 'blink'], strafe: 1, scale: 1.1, look: { cloth: 0x4a0f18, pants: 0x101014, skin: 0xd8d0c8, hair: 0xc8c0b0, cape: 1, w: 'wSword' }, gold: 2 },
  cultist: { n: 'Hollow Cultist', rig: 'human', fam: 'human', hp: 40, dmg: 12, spd: 4.2, xp: 15, poise: 16, atk: ['bolt'], ranged: 1, look: { cloth: 0x2a2038, pants: 0x18141c, hood: 1, w: 'wStaff' } },
  warlock: { n: 'Coven Warlock', rig: 'human', fam: 'human', hp: 76, dmg: 16, spd: 4.2, xp: 30, poise: 26, atk: ['bolt3', 'slam', 'blink'], ranged: 1, look: { cloth: 0x501828, pants: 0x18141c, hood: 1, w: 'wStaff' }, gold: 2 },
  shade: { n: 'Shade', rig: 'shade', fam: 'spirit', hp: 38, dmg: 12, spd: 5.2, xp: 16, poise: 10, atk: ['touch'], float: 1 },
  werewolf: { n: 'Werewolf', rig: 'beast', fam: 'wolf', hp: 170, dmg: 23, spd: 7.6, xp: 60, poise: 80, atk: ['claw', 'leap'], strafe: 1, r: 0.8, gold: 2 },
  hunter: { n: 'Council Hunter', rig: 'human', fam: 'human', hp: 74, dmg: 14, spd: 5, xp: 22, poise: 34, atk: ['xbolt', 'stab'], ranged: 1, look: { cloth: 0x4a4230, pants: 0x1c1a16, hat: 1, w: 'crossbow', armor: 1 }, verv: 1 },
  thrall: { n: 'Blood Thrall', rig: 'human', fam: 'vampire', hp: 34, dmg: 9, spd: 6.4, xp: 8, poise: 12, atk: ['claw'], look: { cloth: 0x302830, pants: 0x1a1a20, skin: 0xa8a098, w: 'wClaws' } },
  deer: { n: 'Deer', rig: 'deer', fam: 'animal', hp: 20, dmg: 0, spd: 8, xp: 3, poise: 5, atk: [], peaceful: 1, r: 0.6 },
  /* bosses */
  warden: { n: 'The Warden', boss: 1, rig: 'human', fam: 'vampire', hp: 620, dmg: 20, spd: 5, xp: 400, poise: 160, scale: 1.7, atk: ['gslash', 'slam', 'charge'], look: { cloth: 0x2a2c34, pants: 0x14161c, skin: 0x9a9690, hair: 0x101010, armor: 1, w: 'wGreat', crown: 1 }, r: 0.9, sub: 'Jailer of the First Tomb' },
  corvin: { n: 'Corvin, First of the Line', boss: 1, rig: 'human', fam: 'vampire', hp: 820, dmg: 22, spd: 6.4, xp: 900, poise: 140, scale: 1.35, atk: ['lunge', 'claw3', 'fan', 'nova', 'blink', 'summon'], add: 'thrall', look: { cloth: 0x5a0a14, pants: 0x0c0c10, skin: 0xe0d8d0, hair: 0xe8e4dc, cape: 1, crown: 1, w: 'wClaws' }, sub: 'Nine centuries hungry' },
  alpha: { n: 'Old Tobias, the Alpha', boss: 1, rig: 'beast', fam: 'wolf', hp: 560, dmg: 20, spd: 7.8, xp: 500, poise: 150, scale: 1.3, atk: ['claw3', 'leap', 'charge', 'howl'], add: 'wolf', r: 1, sub: 'The Falls pack' },
  ambrose: { n: 'Ambrose Varga', boss: 1, rig: 'human', fam: 'vampire', hp: 700, dmg: 21, spd: 6.8, xp: 700, poise: 130, scale: 1.2, atk: ['lunge', 'claw3', 'blink', 'fan'], look: { cloth: 0x6a1019, pants: 0x0c0c10, skin: 0xeadccb, hair: 0xc9c2b0, coat: 1, w: 'wSword' }, sub: 'Your would-be sire' },
  lenore: { n: 'Mother Lenore', boss: 1, rig: 'human', fam: 'vampire', hp: 600, dmg: 19, spd: 6.2, xp: 520, poise: 120, scale: 1.25, atk: ['claw3', 'nova', 'summon', 'blink'], add: 'feral', look: { cloth: 0x1a2a22, pants: 0x101014, skin: 0xd0d8c8, hair: 0x808880, long: 1, cape: 1, w: 'wClaws' }, sub: 'Matron of the Quarry nest' },
  matriarch: { n: 'The Hollow Matriarch', boss: 1, rig: 'shade', fam: 'spirit', hp: 640, dmg: 21, spd: 5.4, xp: 600, poise: 100, scale: 1.7, atk: ['bolt3', 'nova', 'summon', 'blink', 'quake'], add: 'shade', float: 1, sub: 'A hundred witches, one voice' },
};
const WEAK = { vampire: { wood: 1.5, fire: 1.3, silver: 1 }, wolf: { silver: 1.6, wood: 1 }, spirit: { magic: 1.4, silver: 1.25, wood: 0.8, steel: 0.8 }, human: {}, animal: {} };
const ELITE = [['Swift', e => { e.spdM = 1.3; }], ['Hulking', e => { e.maxHp *= 1.8; e.hp = e.maxHp; e.rig.g.scale.multiplyScalar(1.18); }], ['Vicious', e => { e.dmgM = 1.35; }], ['Vampiric', e => { e.leech = 0.5; }], ['Unyielding', e => { e.maxPoise *= 3; e.poise = e.maxPoise; }], ['Volatile', e => { e.volatile = 1; }]];

/* ---------------- geography ---------------- */
const POI = [
  { id: 'town', n: 'Mystic Falls', x: -6, z: 22 }, { id: 'cem', n: 'Old Cemetery', x: -104, z: 40 }, { id: 'chapel', n: 'Fell Chapel', x: -130, z: -146 }, { id: 'hollow', n: 'Coven Hollow', x: -20, z: -226 },
  { id: 'falls', n: 'The Falls', x: 178, z: -200 }, { id: 'bridge', n: 'Wickery Bridge', x: 186, z: -40 }, { id: 'manor', n: 'Varga Manor', x: 221, z: -45 }, { id: 'quarry', n: 'Blackridge Quarry', x: 128, z: 168 },
  { id: 'farm', n: 'Abel Farm', x: 14, z: 196 }, { id: 'lake', n: 'Dunham Lake', x: -118, z: 160 }, { id: 'camp', n: "Hunters' Camp", x: -214, z: -70 },
];
const ZONES = [
  { id: 'town', n: 'Mystic Falls', lvl: 1, r: [-72, -62, 82, 128], safe: 1 }, { id: 'camp', n: "Hunters' Camp", lvl: 5, c: [-230, -70, 24], safe: 1 },
  { id: 'cem', n: 'Old Cemetery', lvl: 2, r: [-196, -2, -104, 82], day: ['robber'], night: ['feral', 'feral', 'shade'], max: 5 },
  { id: 'chapel', n: 'Fell Chapel Ruins', lvl: 6, c: [-130, -170, 36], day: ['cultist', 'robber'], night: ['cultist', 'shade', 'feral'], max: 5 },
  { id: 'hollow', n: 'Coven Hollow', lvl: 12, c: [-20, -245, 36], day: ['shade', 'cultist'], night: ['shade', 'warlock', 'shade'], max: 6 },
  { id: 'falls', n: 'The Falls', lvl: 9, c: [190, -226, 52], day: ['wolf', 'wolf', 'deer'], night: ['wolf', 'stalker'], full: ['werewolf', 'wolf'], max: 5 },
  { id: 'quarry', n: 'Blackridge Quarry', lvl: 14, c: [150, 185, 50], day: ['robber', 'stalker'], night: ['stalker', 'elder', 'feral'], max: 7 },
  { id: 'lake', n: 'Dunham Lake', lvl: 7, c: [-170, 190, 78], day: ['wolf', 'robber', 'deer'], night: ['feral', 'stalker', 'wolf'], max: 5 },
  { id: 'farm', n: 'Abel Farm', lvl: 3, r: [-24, 168, 92, 262], day: ['deer'], night: ['wolf', 'feral'], max: 4 },
  { id: 'manor', n: 'Varga Manor', lvl: 16, r: [214, -96, 288, -4], safe: 1 },
  { id: 'east', n: 'The East Bank', lvl: 16, r: [212, -292, 292, 292], day: ['wolf', 'stalker'], night: ['elder', 'stalker', 'warlock'], full: ['werewolf', 'werewolf', 'elder'], max: 6 },
  { id: 'woods', n: 'Whispering Woods', lvl: 4, r: [-292, -292, 196, -64], day: ['wolf', 'deer', 'deer'], night: ['feral', 'wolf', 'stalker'], full: ['werewolf', 'wolf'], max: 6 },
  { id: 'wild', n: 'The Outskirts', lvl: 2, r: [-999, -999, 999, 999], day: ['deer', 'wolf', 'deer'], night: ['feral', 'wolf'], full: ['wolf', 'werewolf'], max: 4 },
];
const MOON = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
const TITLES = [[1, 'Newcomer'], [5, 'Local'], [10, 'Night Owl'], [15, 'Hunter'], [20, 'Slayer'], [30, 'Legend of the Falls'], [40, 'Nightmare'], [50, 'Apex'], [75, 'Myth'], [100, 'First of a New Line']];
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
  addBox([x - w / 2, z - d / 2, x + w / 2, z + d / 2], true); BA.fade.push({ o, x, z, w, d, a: 1 });
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
function waterMat() { return new T.MeshStandardMaterial({ color: 0x1f4666, roughness: 0.5, metalness: 0.12, transparent: true, opacity: 0.9 }); }

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
  const lamps = [[-28, -26], [28, -26], [-28, 26], [28, 26], [0, -27], [-28, 0], [29, -8], [-9, -9], [9, 9], [-9, 9], [9, -9], [5, 50], [-5, 72], [5, 94], [-5, 114], [-50, 14], [-88, 30], [60, -16], [110, -22], [160, -34], [12, -58], [-40, -22], [48, 22]];
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
  place('bridge', 203, -40, 0, 1, G); scatter('fence', fences);
  scatter('coffin', [[150, 196, 0.4], [156, 200, 1.2], [162, 192, -0.3], [146, 188, 2]]); scatter('bones', [[152, 190, 0], [160, 198, 1], [144, 196, 2], [166, 186, 3]]); scatter('torch', [[142, 182, 0], [166, 204, 0]]); lamp(142, 182, 0xff7a2a, 1.5, 15, 2); lamp(166, 204, 0xff7a2a, 1.5, 15, 2); a.glows.push([142, 182, 8, 0xff7a2a], [166, 204, 8, 0xff7a2a]);
  // ---- waypoints, chests, herbs ----
  const sp = []; for (const p of POI) { sp.push([p.x, p.z, 0]); addCirc(p.x, p.z, 0.3); a.glows.push([p.x, p.z, 6, 0xffc070]); addInter({ id: 'wp_' + p.id, x: p.x, z: p.z, r: 2.6, label: () => 'Waypoint: ' + p.n + ' (travel)', act: () => openMenu('map') }); } scatter('signpost', sp);
  const CH = [[-176, 26, 2], [-134, -177, 6], [-12, -253, 12], [234, -228, 10], [170, -229, 10], [162, 200, 14], [140, 204, 14], [-206, 214, 8], [66, 248, 3], [-244, -82, 5], [264, -30, 16], [250, 150, 16], [-250, 120, 5], [-262, -240, 8], [100, -272, 7], [272, -272, 12], [-60, 252, 4], [92, 62, 3], [-150, -60, 5], [60, -122, 5], [-182, 66, 3], [240, 240, 17], [-270, 10, 6], [130, -110, 6]];
  CH.forEach((c, i) => mkChest(c[0], c[1], 'c' + i, c[2]));
  const herbs = { vervain: [], wolfsbane: [], sage: [] }; let hid = 0;
  const herbZone = (kind, n, x1, z1, x2, z2) => { for (let i = 0, t = 0; i < n && t < 400; t++) { const x = rr(x1, x2), z = rr(z1, z2); if (!freeSpot(x, z, 1)) continue; i++; const id = 'h' + (hid++); herbs[kind].push([x, z, rr(0, 6), 1.2, 0, id]); } };
  herbZone('vervain', 16, -280, -280, 190, -70); herbZone('vervain', 5, -100, 86, 180, 280); herbZone('wolfsbane', 10, 100, -280, 190, -120); herbZone('wolfsbane', 8, -280, 100, -90, 280); herbZone('sage', 12, -90, 120, 180, 280); herbZone('sage', 8, 70, -60, 190, 130);
  for (const kind in herbs) for (const h of herbs[kind]) { const m = place(kind, h[0], h[1], h[2], 1.25, G), id = h[5]; a.glows.push([h[0], h[1], 2.6, kind === 'vervain' ? 0x9a5cff : kind === 'wolfsbane' ? 0xffe060 : 0xd0ffe0]);
    const it = addInter({ id, x: h[0], z: h[1], r: 2.2, m, label: () => m.visible ? 'Gather ' + CONS[kind].n : null, act: () => { m.visible = false; S.gath[id] = S.day; const n = 1 + (sk('w_herb') > 0 ? 1 : 0) + (chance(0.3) ? 1 : 0); addCons(kind, n); sfx('loot'); puff(h[0], 0.6, h[1], 8, { c: GREEN, add: 0.7, sp: 1.5, up: 2, life: 0.6, size: 0.2, grav: 2 }); qEvent('gather', kind, n); } }); a.herbs = a.herbs || []; a.herbs.push(it); }
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
const tombBoss = d => ['warden', 'corvin', 'matriarch', 'alpha', 'lenore', 'ambrose'][(d / 5 - 1) % 6];
function tombTable(d) { return d < 5 ? ['feral', 'feral', 'shade', 'cultist', 'thrall'] : d < 10 ? ['stalker', 'cultist', 'shade', 'warlock', 'feral'] : d < 15 ? ['stalker', 'elder', 'warlock', 'shade', 'cultist'] : ['elder', 'warlock', 'werewolf', 'stalker', 'shade', 'elder']; }
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
  if (boss) { const p = rc(rooms[1]); a.spawns.push({ x: p.x, z: p.z - 4, type: tombBoss(depth), boss: 1 }); a.need = 1; mkChest(p.x, p.z - 21, 'bc', a.lvl, true); a.chests[0].locked = true; a.chests[0].rig.g.visible = false; }
  else { let font = depth >= 2 && rnd() < 0.55; rooms.forEach((r, i) => { if (i === 0) return; const n = Math.round(Math.min(7, 1 + Math.floor(r.w * r.h / 11) + Math.floor(depth / 6)) * (mod && mod.count || 1)); for (let k = 0; k < n; k++) { const p = rp(r, 2.5); a.spawns.push({ x: p.x, z: p.z, type: table[Math.floor(rnd() * table.length)], elite: rnd() < Math.min(0.45, 0.04 + depth * 0.012) + (mod && mod.elite || 0) }); }
      if (i > 0 && i < rooms.length - 1 && rnd() < 0.42 + (mod && mod.chest || 0)) { const p = rp(r, 2.2); mkChest(p.x, p.z, 'tc' + i, a.lvl, rnd() < 0.15 + (mod && mod.chest ? 0.2 : 0)); }
      if (font && i >= 2 && i < rooms.length - 1) { font = false; const p = rc(r); place('fountain', p.x, p.z, 0, 0.7, G); addCirc(p.x, p.z, 1.7); a.glows.push([p.x, p.z, 9, 0xb01020]); lamp(p.x, p.z, 0xff2030, 1.2, 14, 1.5); const f = addInter({ x: p.x, z: p.z, r: 3.2, used: false, label: () => f.used ? null : 'Drink from the blood font', act: () => { f.used = true; heal(P.maxHp); pl.foc = P.maxFoc; if (S.species === 'vampire') pl.blood = P.maxBlood; sfx('heal'); ringFx(p.x, p.z, 0xff2030, 5, 0.7); toast(S.species === 'vampire' ? 'Old blood, still warm. You are whole.' : 'It is only water, here. Somehow. You are whole.'); } }); } }); a.need = Math.ceil(a.spawns.length * 0.7); }
  a.killed = 0; a.fog = [0x05060a, 0x050a08, 0x0a0606, 0x08050a][Math.floor((depth - 1) / 5) % 4]; buildGlows(a); hashArea(a); BA = null; return a;
}
function disposeArea(a) { a.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); scene.remove(a.group); }

/* ---------------- time, sky, weather ---------------- */
const isNight = () => S.clock >= 20 || S.clock < 6, sunUp = () => S.clock >= 6.5 && S.clock < 19.5, moonPhase = () => (S.day + 2) % 8, fullMoon = () => moonPhase() === 4;
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
  const off = pl && pl.buff.ripper > 0; u.sat.value = lerp(u.sat.value, off ? 0.35 : 1.08, 0.08); u.tint.value.lerp(cA.setRGB(off ? 1.1 : 1, off ? 0.92 : 1, off ? 0.92 : 1), 0.08);
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
/* Hollow Moon — actors: rigs, animation, the damage pipeline, enemy AI, projectiles, hazards, spawning. */
let AID = 1;
const dScale = l => (1 + 0.1 * (l - 1)) * Math.pow(1.018, l - 1);            // enemy damage curve
function dress(rig, L) {
  const H = rig.P.Head; if (L.coat) rig.attach('coat'); if (L.cape) rig.attach('cape'); if (L.armor) rig.attach('armor');
  if (H) { if (L.hat) rig.attach('hat', H); if (L.hood) rig.attach('hood', H); if (L.long) rig.attach('longhair', H); if (L.crown) rig.attach('crown', H); }
  if (L.w && rig.P.ArmR) rig.wpn = rig.attach(L.w, rig.P.ArmR, [0, -0.62, 0.06]);
}
function mkBody(def) {
  let rig; const sc = def.scale || 1;
  if (def.rig === 'human') { const L = def.look || {}; rig = mkRig('human', { cloth: L.cloth, pants: L.pants, skin: L.skin, hair: L.hair }, sc * 1.28); dress(rig, L); }
  else if (def.rig === 'beast') rig = mkRig('beast', def.tint || {}, sc * 1.05); else if (def.rig === 'shade') { rig = mkRig('shade', {}, sc * 1.15); for (const k in rig.mats) { rig.mats[k].transparent = true; rig.mats[k].opacity = 0.82; } }
  else rig = mkRig(def.rig, def.tint || {}, sc * 1.25);
  for (const k of ['ArmL', 'ArmR']) if (rig.P[k]) rig.P[k].rotation.order = 'YXZ';
  for (const k in rig.mats) { const m = rig.mats[k]; if (m.emissive && m.emissive.getHex() !== 0) m.userData.glow = 1; }
  rig.kind = def.rig === 'human' || def.rig === 'beast' ? 'biped' : def.rig === 'shade' ? 'shade' : 'quad'; return rig;
}
function baseActor(kind, def, rig, x, z) { return { id: AID++, kind, def, fam: def.fam || 'human', name: def.n, rig, x, z, rot: R(0, TAU), vr: 0, r: def.r || 0.5, sp: 0, ph: R(0, 6), kx: 0, kz: 0, y: 0, fx: {}, sw: null, flash: 0, flinch: 0, inv: 0, dead: false, deadT: 0, spdM: 1, dmgM: 1, team: 2 }; }
function spawnEnemy(type, x, z, lvl, o = {}) {
  const def = EN[type], rig = mkBody(def), e = baseActor('enemy', def, rig, x, z); areaAdd(rig.g); e.type = type; e.lvl = lvl; e.team = def.peaceful ? 2 : 1;
  e.maxHp = def.hp * hpScale(lvl) * (def.boss ? 1.6 : def.peaceful ? 1 : 3); e.dmg = def.dmg * dScale(lvl) * 1.3; e.maxPoise = def.poise * (1 + lvl * 0.05) * 3; e.xp = def.xp * (1 + 0.3 * (lvl - 1)) * 1.4;
  e.ai = { home: { x, z }, cd: {}, gcd: R(0.3, 1.2), t: R(0, 3), aggro: false, cur: null, strafe: chance(0.5) ? 1 : -1, wt: null, spawned: !!o.spawned };
  if (o.elite && !def.boss && !def.peaceful) { const n = lvl > 22 ? 2 : 1, picks = []; e.maxHp *= 2.2; e.dmgM = 1.2; e.xp *= 2.6; rig.g.scale.multiplyScalar(1.1); while (picks.length < n) { const p = pick(ELITE); if (!picks.includes(p)) picks.push(p); } e.elite = picks.map(p => p[0]).join(' '); e.hp = e.maxHp; picks.forEach(p => p[1](e)); e.name = e.elite + ' ' + def.n; }
  if (def.boss) { e.maxHp *= 1 + Math.max(0, lvl - 10) * 0.012; e.r = def.r || 0.7; }
  if (o.name) e.name = o.name; e.hp = e.maxHp; e.poise = e.maxPoise; e.tag = o.tag; actors.push(e); pose(e, 0); return e;
}
function removeActor(a) { const i = actors.indexOf(a); if (i >= 0) actors.splice(i, 1); if (a.ai && a.ai.cur && a.ai.cur.tele) a.ai.cur.tele.kill = 1; a.rig.g.parent && a.rig.g.parent.remove(a.rig.g); for (const k in a.rig.mats) a.rig.mats[k].dispose(); }
const hostile = (a, b) => a.team !== b.team && a.team !== 2 && b.team !== 2 && !a.dead && !b.dead && b.kind !== 'npc';
function foes(a) { const l = []; for (const b of actors) if (hostile(a, b)) l.push(b); if (a !== pl && a.team === 1 && !pl.dead) l.push(pl); return l; }
function nearestFoe(a, max = 1e9, from) { let best = null, bd = max; const p = from || a; for (const b of foes(a)) { const d = d2(p, b); if (d < bd) { bd = d; best = b; } } return best; }

/* ---------------- animation ---------------- */
const ez = k => 1 - (1 - k) * (1 - k);
function pose(a, dt) {
  const g = a.rig.g, P = a.rig.P; a.vr += angd(a.rot, a.vr) * Math.min(1, dt * 16); a.flinch = Math.max(0, a.flinch - dt); if (a.flash > 0) { a.flash -= dt; flashRig(a, a.flash > 0 ? 0.55 : 0); }
  if (a.dead) return poseDead(a, dt);
  a.ph += dt * a.sp * 1.55; const amp = Math.min(1, a.sp / 4.5) * 0.8, s = Math.sin(a.ph); let tilt = 0, twist = 0, y = a.y || 0, roll = 0;
  if (a.rig.kind === 'biped') {
    P.LegL.rotation.x = s * amp; P.LegR.rotation.x = -s * amp; P.ArmL.rotation.set(-s * amp * 0.7, 0, 0); P.ArmR.rotation.set(s * amp * 0.7 - (a.rig.wpn ? 0.25 : 0), 0, 0); P.Head.rotation.set(0, 0, 0); P.Torso.rotation.set(Math.min(0.28, a.sp * 0.025), 0, 0); y += Math.abs(s) * amp * 0.06;
    const w = a.sw;
    if (w) { w.t += dt; const k = Math.min(1, w.t / w.dur), e = ez(k);
      switch (w.kind) {
        case 'slashR': P.ArmR.rotation.set(-1.5 + Math.sin(k * PI) * 0.4, lerp(1.5, -1.2, e), 0); twist = lerp(0.55, -0.55, e); tilt = 0.14; break;
        case 'slashL': P.ArmR.rotation.set(-1.5 + Math.sin(k * PI) * 0.4, lerp(-1.3, 1.4, e), 0); twist = lerp(-0.55, 0.55, e); tilt = 0.14; break;
        case 'over': P.ArmR.rotation.set(lerp(-3.1, -0.5, e), 0, 0); P.ArmL.rotation.set(lerp(-3.0, -0.6, e), 0, 0); tilt = lerp(-0.15, 0.4, e); break;
        case 'stab': P.ArmR.rotation.set(lerp(-0.6, -1.6, e), 0, 0); tilt = 0.3; break;
        case 'spin': twist = k * TAU * (w.turns || 1); P.ArmR.rotation.set(-1.5, 1.3, 0); P.ArmL.rotation.set(-1.2, -1.3, 0); break;
        case 'cast': P.ArmR.rotation.set(lerp(-2.7, -1.4, e), 0.3, 0); P.ArmL.rotation.set(lerp(-2.7, -1.4, e), -0.3, 0); P.Head.rotation.x = -0.2; break;
        case 'shoot': P.ArmR.rotation.set(-1.55, 0, 0); P.ArmL.rotation.set(-1.3, -0.5, 0); break;
        case 'bite': P.ArmR.rotation.set(-1.4, -0.3, 0); P.ArmL.rotation.set(-1.4, 0.3, 0); P.Head.rotation.x = 0.5; tilt = 0.25; break;
        case 'claw': P.ArmR.rotation.set(lerp(-2.6, -0.4, e), lerp(0.8, -0.8, e), 0); P.ArmL.rotation.set(lerp(-0.6, -2.2, e), 0, 0); twist = lerp(0.4, -0.4, e); tilt = 0.2; break;
        case 'slam': P.ArmR.rotation.set(lerp(-3.1, -0.2, e * e), 0, 0); P.ArmL.rotation.set(lerp(-3.1, -0.2, e * e), 0, 0); tilt = lerp(-0.2, 0.5, e * e); y += Math.sin(k * PI) * (w.jump || 0); break;
        case 'wind': P.ArmR.rotation.set(-2.6, 0.9, 0); tilt = -0.12; twist = 0.4; break;
        case 'howl': P.Head.rotation.x = -0.8; P.ArmL.rotation.set(0, 0, -0.6); P.ArmR.rotation.set(0, 0, 0.6); tilt = -0.2; break;
      } if (k >= 1 && !w.hold) a.sw = null; }
    else if (a.block) { P.ArmL.rotation.set(-1.5, -0.7, 0); P.ArmR.rotation.set(-1.35, 0.5, 0); tilt = 0.08; }
    if (a.fx.stun > 0) { P.Head.rotation.set(0.4, 0, Math.sin(RT.time * 9) * 0.2); tilt = 0.15; }
    if (a.pose === 'held') { P.Head.rotation.z = 0.6; tilt = -0.15; } else if (a.pose === 'sit') { P.LegL.rotation.x = P.LegR.rotation.x = -1.4; y -= 0.45; }
    if (a.roll > 0) { roll = (1 - a.roll) * TAU; y += Math.sin((1 - a.roll) * PI) * 0.5; P.LegL.rotation.x = P.LegR.rotation.x = -1.6; P.ArmL.rotation.x = P.ArmR.rotation.x = -1.2; }
  } else if (a.rig.kind === 'quad') {
    const A = s * amp * 0.9; if (P.LegFL) { P.LegFL.rotation.x = A; P.LegBR.rotation.x = A; P.LegFR.rotation.x = -A; P.LegBL.rotation.x = -A; } if (P.Tail) P.Tail.rotation.z = Math.sin(RT.time * 5 + a.ph) * 0.3; if (P.Head) P.Head.rotation.x = 0;
    y += Math.abs(s) * amp * 0.08; const w = a.sw; if (w) { w.t += dt; const k = Math.min(1, w.t / w.dur); if (w.kind === 'howl') { if (P.Head) P.Head.rotation.x = 0.9; tilt = -0.25; } else if (w.kind === 'wind') { tilt = -0.2; } else { tilt = 0.25; if (P.Head) P.Head.rotation.x = -0.3 - Math.sin(k * PI) * 0.4; y += Math.sin(k * PI) * 0.35; } if (k >= 1 && !w.hold) a.sw = null; }
    if (a.fx.stun > 0 && P.Head) P.Head.rotation.x = -0.5;
  } else { y += 0.25 + Math.sin(RT.time * 2 + a.ph) * 0.18; tilt = Math.min(0.3, a.sp * 0.04); const w = a.sw; if (w) { w.t += dt; const k = Math.min(1, w.t / w.dur); g.scale.setScalar(a.rig.scale * (1 + Math.sin(k * PI) * 0.18)); if (k >= 1 && !w.hold) { a.sw = null; g.scale.setScalar(a.rig.scale); } } }
  if (a.flinch > 0) tilt -= a.flinch * 1.2;
  g.rotation.set(tilt + roll, a.vr + twist, 0); g.position.set(a.x, y + (RT.area.id === 'world' && a.x > 190 && a.x < 216 && Math.abs(a.z + 40) < 3.4 ? 0.28 : 0), a.z);
}
function poseDead(a, dt) {
  const g = a.rig.g; a.deadT += dt; const k = Math.min(1, a.deadT * 3);
  if (a.rig.kind === 'shade') { g.scale.setScalar(a.rig.scale * Math.max(0.01, 1 - a.deadT * 2)); if (a.deadT > 0.5) a.gone = true; return; }
  if (a.rig.kind === 'quad') g.rotation.set(0, a.vr, PI / 2 * k); else g.rotation.set(-PI / 2 * k, a.vr, 0); g.position.set(a.x, 0.18 * k, a.z);
  if (a.fam === 'vampire' && a.kind === 'enemy') { for (const n in a.rig.mats) a.rig.mats[n].color.lerp(cA.setRGB(0.18, 0.17, 0.17), Math.min(1, dt * 3)); if (a.deadT > 1.1 && !a.ashed) { a.ashed = true; puff(a.x, 0.4, a.z, 34, { c: ASH, add: 0.1, sp: 1.6, up: 1.6, life: 1.4, size: 0.34, grav: 0.8, spread: 0.6 }); puff(a.x, 0.4, a.z, 10, { c: FIRE, add: 1, sp: 1, up: 2, life: 0.7, size: 0.16, grav: -1 }); sfx('ash'); a.gone = true; } }
  else if (a.deadT > 7) { g.position.y -= (a.deadT - 7) * 0.5; if (a.deadT > 9) a.gone = true; }
}

/* ---------------- damage ---------------- */
const FAMFX = { vampire: BLOOD, human: BLOOD, wolf: BLOOD, animal: BLOOD, spirit: ICE };
function hit(src, tgt, o) {
  if (!tgt || tgt.dead || o.dmg == null) return 0; let d = o.dmg, crit = false; const fromP = src === pl;
  if (tgt === pl) return hitPlayer(src, o);
  if (tgt.kind === 'npc') return 0;
  if (fromP) {
    const w = WEAK[tgt.fam] || {}; d *= w[o.mat] || 1; const eq = S.eq, u = n => Object.values(eq).some(i => i && i.uniq === n);
    if (tgt.fam === 'vampire') d *= 1 + (P.vsV + (pl.buff.coatV > 0 ? 35 : 0)) / 100; else if (tgt.fam === 'wolf') d *= 1 + (P.vsW + (pl.buff.coatW > 0 ? 35 : 0)) / 100; else if (tgt.fam === 'spirit') d *= 1 + P.vsS / 100;
    if (sk('h_five') && tgt.fam !== 'human' && tgt.fam !== 'animal') d *= 1.25; if (u('moonstone') && fullMoon() && isNight()) d *= 1.25; if (u('corvin') && isNight()) d *= 1.2; if (u('ripper')) d *= 1 + (100 - S.humanity) / 10 * 0.02;
    if (pl.buff.slayer > 0) d *= 1 + pl.buff.slayerN * (2 + sk('h_slayer')) / 100; if (pl.buff.ripper > 0) d *= 1 + (30 + 15 * sk('v_ripper')) / 100; if (pl.buff.riposte > 0 && !o.spell) { d *= 1 + 0.5 * Math.max(1, sk('h_parry')); pl.buff.riposte = 0; crit = true; }
    if (!o.noCrit && (o.crit || crit || Math.random() * 100 < P.crit + (o.spell ? P.spellCrit : 0))) { crit = true; d *= P.critMult; }
    if (tgt.fx.stun > 0) d *= 1.15;
  } else if (src && src.dmgM) d *= src.dmgM;
  if (tgt.fx.mark > 0) d *= 1.25; d = Math.max(1, d);
  tgt.hp -= d; tgt.flash = 0.12; tgt.flinch = 0.18; tgt.hpShow = 4;
  const c = FAMFX[tgt.fam] || BLOOD; puff(tgt.x, 1.2, tgt.z, crit ? 12 : 6, { c, add: tgt.fam === 'spirit' ? 0.9 : 0.05, sp: 3, up: 1.5, life: 0.5, size: 0.2 }); if (crit) puff(tgt.x, 1.2, tgt.z, 6, { c: SPARK, add: 1, sp: 5, life: 0.25, size: 0.14, grav: 0 });
  floatText(tgt.x, 2.2, tgt.z, fmt(d), crit ? '#ffd24a' : fromP ? '#ffffff' : '#c8d0ff', crit ? 22 : 15);
  if (tgt.ai) { if (!tgt.ai.aggro) aggro(tgt); if (fromP || (src && src.team === 0)) RT.combatT = 6; }
  if (o.poise && tgt.maxPoise) { tgt.poise -= o.poise; if (tgt.poise <= 0) stagger(tgt, tgt.def.boss ? 1.6 : 1.0); }
  if (o.kb && !tgt.def.boss) { const a = o.dir != null ? o.dir : src ? dirTo(src, tgt) : 0; tgt.kx += Math.sin(a) * o.kb; tgt.kz += Math.cos(a) * o.kb; }
  if (fromP) { { const ls = P.ls + (pl.buff.ripper > 0 ? 5 : 0); if (ls > 0 && !o.noLs) heal(d * ls / 100, true); } if (P.burn > 0 && !o.dot) addFx(tgt, 'burn', 3, P.burn * 0.5); if (Object.values(S.eq).some(i => i && i.uniq === 'alphafang')) addFx(tgt, 'bleed', 4, d * 0.12); RT.hitstop = Math.max(RT.hitstop, crit ? 0.07 : o.heavy ? 0.06 : 0.035); RT.shake = Math.max(RT.shake, crit || o.heavy ? 0.35 : 0.14); sfx(crit ? 'crit' : 'hit'); }
  if (tgt.leech && src && src !== pl) { /* nothing */ }
  if (tgt.hp <= 0) die(tgt, src); return d;
}
function hitPlayer(src, o) {
  if (pl.dead || pl.inv > 0 || RT.paused) return 0; let d = o.dmg * (src && src.dmgM ? src.dmgM : 1);
  const from = src || o.at, ang = from ? Math.abs(angd(dirTo(pl, from), pl.rot)) : 0;
  if (pl.block && !o.unblock && ang < 1.9) {
    if (pl.blockT < P.parryWin) { sfx('parry'); puff(pl.x + Math.sin(pl.rot), 1.3, pl.z + Math.cos(pl.rot), 16, { c: SPARK, add: 1, sp: 6, life: 0.3, size: 0.16, grav: 0 }); floatText(pl.x, 2.6, pl.z, 'PARRY', '#ffe9a0', 20); RT.hitstop = 0.09; RT.flashV = 0.12; pl.buff.riposte = 3; pl.sta = Math.min(P.maxSta, pl.sta + 15); qEvent('parry');
      if (o.proj) { const p = o.proj; p.team = 0; p.owner = pl; p.vx = -p.vx * 1.3; p.vz = -p.vz * 1.3; p.dmg = o.dmg * 2.5; p.life = 2; p.keep = true; } else if (src && src.kind === 'enemy') { if (src.def.boss) { src.poise -= src.maxPoise * 0.45; if (src.poise <= 0) stagger(src, 1.6); } else stagger(src, 1.5); } return 0; }
    d *= 0.22; pl.sta -= Math.min(45, 10 + o.dmg / P.maxHp * 110); sfx('block'); puff(pl.x + Math.sin(pl.rot) * 0.7, 1.2, pl.z + Math.cos(pl.rot) * 0.7, 6, { c: SPARK, add: 1, sp: 3, life: 0.2, size: 0.12, grav: 0 });
    if (pl.sta <= 0) { pl.sta = 0; pl.fx.stun = 0.9; pl.block = false; floatText(pl.x, 2.6, pl.z, 'GUARD BROKEN', '#ff8080', 16); }
  }
  d *= 1 - P.mit; if (S.species === 'vampire' && o.mat === 'wood') d *= 1.25; if (o.verv && S.species === 'vampire') { pl.fx.verv = 6; floatText(pl.x, 2.9, pl.z, 'VERVAIN', '#c090ff', 15); }
  if (pl.buff.ward > 0) { const ab = Math.min(pl.buff.ward, d); pl.buff.ward -= ab; d -= ab; puff(pl.x, 1.2, pl.z, 6, { c: MAGIC, add: 1, sp: 3, life: 0.3, size: 0.2, grav: 0 }); if (d <= 0.5) return 0; }
  d = Math.max(1, d); pl.hp -= d; RT.hurtV = Math.min(1, 0.35 + d / P.maxHp * 2.5); RT.shake = Math.max(RT.shake, 0.3 + d / P.maxHp * 2); sfx('hurt'); floatText(pl.x, 2.4, pl.z, '-' + fmt(d), '#ff5a5a', 17); pl.flinch = 0.2; pl.flash = 0.1; RT.combatT = 6;
  puff(pl.x, 1.2, pl.z, 6, { c: BLOOD, add: 0.05, sp: 3, up: 1.5, life: 0.5, size: 0.2 }); if (pl.feed) endFeed(true);
  if (o.kb) { const a = from ? dirTo(from, pl) : 0; pl.kx += Math.sin(a) * o.kb; pl.kz += Math.cos(a) * o.kb; }
  if (P.thorns > 0 && src && src.kind === 'enemy' && !src.dead) { src.hp -= P.thorns; src.flash = 0.1; if (src.hp <= 0) die(src, pl); }
  if (src && src.leech) src.hp = Math.min(src.maxHp, src.hp + d * src.leech * 4);
  const sw = sk('h_second'); if (sw && pl.hp > 0 && pl.hp < P.maxHp * 0.3 && pl.buff.second <= 0) { pl.buff.second = 90; heal(P.maxHp * (0.1 + 0.1 * sw)); floatText(pl.x, 3, pl.z, 'SECOND WIND', '#9effa0', 16); }
  if (pl.hp <= 0) playerDeath(src); return d;
}
function heal(n, quiet) { if (pl.dead) return; const b = pl.hp; pl.hp = Math.min(P.maxHp, pl.hp + n); if (!quiet && pl.hp - b > 1) { floatText(pl.x, 2.6, pl.z, '+' + fmt(pl.hp - b), '#7dff8a', 15); puff(pl.x, 1, pl.z, 8, { c: GREEN, add: 0.9, sp: 1, up: 2.5, life: 0.7, size: 0.18, grav: -1 }); } }
function addFx(a, k, t, v) { if (a.dead) return; if (k === 'stun' && a.def && a.def.boss) t *= 0.4; if (a === pl && sk('h_five') && (k === 'stun' || k === 'charm')) t *= 0.5; a.fx[k] = Math.max(a.fx[k] || 0, t); if (v != null) a.fx[k + 'D'] = Math.max(a.fx[k + 'D'] || 0, v); }
function stagger(e, t) { e.poise = e.maxPoise; e.fx.stun = Math.max(e.fx.stun || 0, t); if (e.ai && e.ai.cur) { if (e.ai.cur.tele) e.ai.cur.tele.kill = 1; e.ai.cur = null; e.sw = null; e.y = 0; } floatText(e.x, 2.8, e.z, 'STAGGERED', '#ffe9a0', 14); puff(e.x, 2, e.z, 8, { c: SPARK, add: 1, sp: 2, life: 0.4, size: 0.14, grav: 0 }); }
function aggro(e) { if (e.def.peaceful || e.ai.aggro) return; e.ai.aggro = true; e.ai.gcd = Math.max(e.ai.gcd, 0.35); if (e.def.boss && e.team === 1) { RT.boss = e; showBoss(e); sfx('growl'); } for (const o of actors) if (o.kind === 'enemy' && o !== e && !o.dead && o.team === e.team && !o.ai.aggro && !o.def.peaceful && d2(o, e) < 13) { o.ai.aggro = true; o.ai.gcd = R(0.3, 0.9); } }
function tickFx(a, dt) {
  const f = a.fx; for (const k of ['stun', 'slow', 'mark', 'charm', 'verv', 'root']) if (f[k] > 0) f[k] -= dt;
  for (const [k, c] of [['burn', FIRE], ['bleed', BLOOD]]) if (f[k] > 0) { f[k] -= dt; f[k + 'T'] = (f[k + 'T'] || 0) - dt; if (f[k + 'T'] <= 0) { f[k + 'T'] = 0.5; const d = (f[k + 'D'] || 1) * 0.5; if (a === pl) { pl.hp -= d; if (pl.hp <= 0) playerDeath(null); } else { a.hp -= d; a.hpShow = 3; floatText(a.x, 2, a.z, fmt(d), k === 'burn' ? '#ff9a3a' : '#d04050', 12); if (a.hp <= 0) die(a, pl); } puff(a.x, 1.2, a.z, 3, { c, add: k === 'burn' ? 1 : 0.05, sp: 1, up: 2, life: 0.5, size: 0.2, grav: k === 'burn' ? -2 : 6 }); } if (f[k] <= 0) f[k + 'D'] = 0; }
  if (a.kind === 'enemy' && f.charm <= 0 && a.team === 0 && !a.ally) a.team = 1;
}
function die(e, src) {
  if (e.dead) return; e.dead = true; e.hp = 0; e.sw = null; if (e.ai && e.ai.cur && e.ai.cur.tele) e.ai.cur.tele.kill = 1; sfx('die'); if (RT.boss === e) { RT.boss = null; hideBoss(); }
  if (e.kind !== 'enemy') return; const byP = src === pl || (src && src.team === 0) || !src;
  if (e.volatile) hazard(e.x, e.z, 3.6, 0.8, e.dmg * 1.3, { team: 1, mat: 'fire', col: 0xff7a20 });
  if (byP && !e.noLoot) { const diff = clamp(1 + (e.lvl - S.lvl) * 0.08, 0.3, 2); gainXp(e.xp * diff); S.kills[e.type] = (S.kills[e.type] || 0) + 1; S.stats.kills++;
    if (!e.def.peaceful) { const boss = e.def.boss; dropLoot(e.x, e.z, e.lvl, { n: boss ? 4 : e.elite ? 2 : 1, chance: boss || e.elite ? 1 : 0.22, bias: boss ? 1.6 : e.elite ? 0.9 : 0, gold: (3 + e.lvl * 1.6) * (e.def.gold || 1) * (boss ? 12 : e.elite ? 3 : 1), fam: e.fam, boss }); }
    if (sk('h_slayer')) { pl.buff.slayer = 10; pl.buff.slayerN = Math.min(5, (pl.buff.slayerN || 0) + 1); } if (sk('w_spirit')) pl.foc = Math.min(P.maxFoc, pl.foc + 3 * sk('w_spirit'));
    qEvent('kill', e); if (RT.area.id === 'tomb' && !e.ai.summoned) { const a = RT.area; a.killed++; if (!a.cleared && a.killed >= a.need) clearFloor(); } }
}

/* ---------------- projectiles and hazards ---------------- */
const shotGeo = new T.BoxGeometry(0.12, 0.12, 0.9), orbGeo = new T.SphereGeometry(0.28, 8, 6);
function shoot(owner, x, z, rot, o) {
  const orb = !!o.orb, m = new T.Mesh(orb ? orbGeo : shotGeo, new T.MeshBasicMaterial({ color: o.col || 0xe8c890 })); m.rotation.y = rot; m.position.set(x, 1.3, z); if (o.size) m.scale.setScalar(o.size); areaAdd(m);
  const p = Object.assign({ m, x, z, vx: Math.sin(rot) * o.spd, vz: Math.cos(rot) * o.spd, t: 0, life: (o.range || 22) / o.spd, team: owner.team === 2 ? 1 : owner.team, owner, r: 0.5, hitIds: {} }, o); shots.push(p); return p;
}
function updShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) { const p = shots[i]; p.t += dt; p.x += p.vx * dt; p.z += p.vz * dt; p.m.position.set(p.x, 1.3, p.z); p.m.rotation.y = Math.atan2(p.vx, p.vz); let gone = p.t > p.life || solidAt(p.x, p.z);
    if (p.orb && chance(0.6)) puff(p.x, 1.3, p.z, 1, { c: p.pc || MAGIC, add: 1, sp: 0.4, life: 0.35, size: 0.22, grav: 0, spread: 0.1 });
    if (!gone) { const targets = p.team === 0 ? actors.filter(a => a.team === 1 && !a.dead && a.kind === 'enemy') : [pl, ...actors.filter(a => a.team === 0 && !a.dead && a.kind === 'enemy')];
      for (const a of targets) { if (a.dead || p.hitIds[a.id] || hyp(a.x - p.x, a.z - p.z) > p.r + a.r) continue; p.hitIds[a.id] = 1; p.keep = false; const got = hit(p.owner, a, { dmg: p.dmg, mat: p.mat, proj: p, verv: p.verv, kb: 2, poise: p.poise || 6, spell: p.spell, at: p, dir: Math.atan2(p.vx, p.vz) }); if (p.keep) { p.hitIds = {}; p.t = 0; break; } if (a === pl && got === 0 && pl.inv > 0) { delete p.hitIds[a.id]; continue; } if (p.onHit) p.onHit(a); if (!p.pierce) { gone = true; break; } } }
    if (gone) { puff(p.x, 1.3, p.z, 5, { c: p.pc || SPARK, add: 1, sp: 2, life: 0.25, size: 0.14, grav: 0 }); p.m.parent && p.m.parent.remove(p.m); p.m.material.dispose(); shots.splice(i, 1); } }
}
/* hazard: a delayed circular blast (or lingering pool). o: team, mat, col, linger seconds, tick, onHit, src */
function hazard(x, z, r, delay, dmg, o = {}) { const h = Object.assign({ x, z, r, delay, dmg, t: 0, team: 1, done: false, linger: 0, tickT: 0 }, o); if (delay > 0.05) h.tele = telegraph(x, z, 0, { kind: 'circle', r }, delay + 0.02, o.col || 0xff2030); zonesFx.push(h); return h; }
function hazardHit(h, dmg) { const targets = h.team === 0 ? actors.filter(a => a.team === 1 && !a.dead && a.kind === 'enemy') : [pl, ...actors.filter(a => a.team === 0 && !a.dead && a.kind === 'enemy')]; for (const a of targets) if (hyp(a.x - h.x, a.z - h.z) < h.r + a.r * 0.5) { const got = hit(h.src || null, a, { dmg, mat: h.mat, at: h, unblock: h.unblock, kb: h.kb || 0, poise: h.poise || 0, spell: h.spell, dot: h.linger > 0, noCrit: h.linger > 0 && h.done }); if (got && h.onHit) h.onHit(a); } }
function updHazards(dt) {
  for (let i = zonesFx.length - 1; i >= 0; i--) { const h = zonesFx[i]; h.t += dt;
    if (!h.done && h.t >= h.delay) { h.done = true; hazardHit(h, h.dmg); const c = h.pc || (h.mat === 'fire' ? FIRE : h.mat === 'magic' ? MAGIC : h.mat === 'verv' ? VERV : SPARK); puff(h.x, 0.5, h.z, Math.min(40, 10 + h.r * 6), { c, add: 1, sp: h.r * 1.6, up: 2.5, life: 0.5, size: 0.3, grav: 2, spread: h.r * 0.4 }); ringFx(h.x, h.z, h.col || 0xffa040, h.r * 1.2, 0.35); if (h.r > 2.5) { sfx('boom'); if (d2(pl, h) < 16) RT.shake = Math.max(RT.shake, 0.4); } if (h.after) h.after(); }
    if (h.done) { if (h.linger > 0) { h.linger -= dt; h.tickT -= dt; if (h.tickT <= 0) { h.tickT = 0.5; hazardHit(h, h.tick || h.dmg * 0.25); } if (chance(0.7)) puff(h.x + R(-h.r, h.r) * 0.7, 0.2, h.z + R(-h.r, h.r) * 0.7, 1, { c: h.pc || FIRE, add: 1, sp: 0.4, up: 2.2, life: 0.6, size: 0.3, grav: -1 }); } if (h.linger <= 0) zonesFx.splice(i, 1); } }
}

/* ---------------- enemy AI ---------------- */
function mv(e, tx, tz, sp, dt, faceIt = true) { const dx = tx - e.x, dz = tz - e.z, l = hyp(dx, dz); if (l < 0.08) { e.sp = 0; return; } const s = sp * e.spdM * (e.fx.slow > 0 ? 0.55 : 1); e.x += dx / l * s * dt; e.z += dz / l * s * dt; collide(e); e.sp = s; if (faceIt) e.rot = Math.atan2(dx, dz); }
function startAtk(e, name, tgt) {
  const A = ATK[name], ai = e.ai, c = ai.cur = { name, A, t: 0, ph: 'wind', rep: 0, tgt, wind: A.wind * (e.enraged ? 0.82 : 1) }; e.rot = dirTo(e, tgt); c.tx = tgt.x; c.tz = tgt.z; sfx(A.kind === 'shoot' || A.kind === 'nova' ? 'tele' : 'tele');
  const k = A.kind; e.sw = { kind: k === 'melee' ? (e.rig.kind === 'biped' ? (A.arc > 2 ? 'wind' : 'wind') : 'wind') : k === 'slam' ? 'slam' : k === 'summon' ? 'howl' : k === 'shoot' || k === 'nova' ? 'cast' : 'wind', t: 0, dur: c.wind, hold: true, jump: A.jump ? 2.4 : 0 };
  if (k === 'melee') c.tele = telegraph(e.x, e.z, e.rot, { kind: 'arc', r: A.range + e.r, arc: A.arc }, c.wind); else if (k === 'lunge') c.tele = telegraph(e.x, e.z, e.rot, { kind: 'line', len: A.dist, w: A.w * 2 }, c.wind);
  else if (k === 'slam') { if (!A.jump) { c.tx = e.x; c.tz = e.z; } c.tele = telegraph(c.tx, c.tz, 0, { kind: 'circle', r: A.r }, c.wind); } else if (k === 'nova') c.tele = telegraph(e.x, e.z, 0, { kind: 'circle', r: 3 }, c.wind, 0xff3050);
  if (k === 'summon') { sfx(e.fam === 'wolf' ? 'howl' : 'magic'); } if (k === 'blink') puff(e.x, 1.2, e.z, 18, { c: [0.1, 0.05, 0.12], add: 0.2, sp: 2, life: 0.5, size: 0.4, grav: 0 });
}
function resolveAtk(e, c) {
  const A = c.A, dmg = e.dmg * (A.dmg || 1), mat = e.fam === 'spirit' || A.kind === 'shoot' && !A.wood ? 'magic' : A.wood ? 'wood' : 'phys';
  switch (A.kind) {
    case 'melee': e.sw = { kind: e.rig.kind === 'biped' ? (e.rig.wpn && !/Claws/.test(e.def.look && e.def.look.w || '') ? (c.rep % 2 ? 'slashL' : 'slashR') : 'claw') : 'bite', t: 0, dur: 0.22 }; trail(e, A.range + e.r, A.arc, e.fam === 'vampire' ? 0xff5060 : 0xffe0b0, c.rep % 2 ? -1 : 1); sfx('swing');
      for (const t of foes(e)) if (d2(e, t) < A.range + e.r + t.r && Math.abs(angd(dirTo(e, t), e.rot)) < A.arc / 2) hit(e, t, { dmg, mat, kb: 3, poise: 10 }); break;
    case 'lunge': c.ph = 'dash'; c.t = 0; c.left = A.dist; c.hitIds = {}; e.sw = { kind: e.rig.kind === 'biped' ? 'stab' : 'bite', t: 0, dur: A.dist / 28, hold: true }; sfx('blur'); return;
    case 'slam': if (A.jump) { e.x = c.tx; e.z = c.tz; collide(e); } hazard(c.tx, c.tz, A.r, 0, dmg, { team: e.team, src: e, mat, kb: 6, poise: 20 });
      if (A.multi) for (let i = 0; i < A.multi; i++) { const t = c.tgt, a = R(0, TAU), d = i === 0 ? 0 : R(2, 7); hazard(t.x + Math.sin(a) * d, t.z + Math.cos(a) * d, A.r, 0.7 + i * 0.35, dmg, { team: e.team, src: e, mat: 'magic', pc: MAGIC, col: 0x8a5cff }); } break;
    case 'shoot': { const base = dirTo(e, c.tgt), n = A.n || 1; for (let i = 0; i < n; i++) shoot(e, e.x + Math.sin(base) * 0.8, e.z + Math.cos(base) * 0.8, base + (i - (n - 1) / 2) * (A.spread || 0), { spd: A.spd, dmg, mat, col: A.col, orb: !A.wood, pc: A.wood ? SPARK : [((A.col >> 16) & 255) / 255, ((A.col >> 8) & 255) / 255, (A.col & 255) / 255], verv: A.wood && e.def.verv && chance(0.35), range: 26 }); sfx(A.wood ? 'shoot' : 'magic'); e.sw = { kind: 'shoot', t: 0, dur: 0.25 }; break; }
    case 'nova': for (let i = 0; i < A.n; i++) shoot(e, e.x, e.z, i * TAU / A.n + c.rep * 0.2, { spd: A.spd, dmg, mat: 'magic', col: A.col, orb: true, pc: [1, 0.2, 0.3], range: 24 }); sfx('zap'); RT.shake = Math.max(RT.shake, 0.3); break;
    case 'blink': { const t = c.tgt, a = t.rot + PI + R(-0.8, 0.8); e.x = t.x + Math.sin(a) * 3; e.z = t.z + Math.cos(a) * 3; collide(e); e.rot = dirTo(e, t); puff(e.x, 1.2, e.z, 18, { c: [0.1, 0.05, 0.12], add: 0.2, sp: 2, life: 0.5, size: 0.4, grav: 0 }); sfx('blur'); e.ai.gcd = 0.25; break; }
    case 'summon': { const adds = actors.filter(a => a.ai && a.ai.summoned && !a.dead).length; for (let i = 0; i < A.n && adds + i < 6; i++) { const a = R(0, TAU), s = spawnEnemy(e.def.add || 'thrall', e.x + Math.sin(a) * 4, e.z + Math.cos(a) * 4, Math.max(1, e.lvl - 2)); s.ai.summoned = true; s.noLoot = true; s.team = e.team; collide(s); aggro(s); puff(s.x, 1, s.z, 14, { c: [0.3, 0.05, 0.1], add: 0.4, sp: 2, up: 2, life: 0.6, size: 0.35, grav: 0 }); } break; }
  }
  c.ph = 'rec'; c.t = 0;
}
function updAtk(e, dt) {
  const ai = e.ai, c = ai.cur, A = c.A; c.t += dt;
  if (c.ph === 'wind') { if (c.tgt && !c.tgt.dead && c.t < c.wind - 0.14 && A.kind !== 'slam') { e.rot += angd(dirTo(e, c.tgt), e.rot) * Math.min(1, dt * 6); if (c.tele) c.tele.m.rotation.y = e.rot; } if (c.tele && A.kind !== 'slam') c.tele.m.position.set(e.x, 0.1, e.z); if (c.t >= c.wind) { if (c.tele) { c.tele.kill = 1; c.tele = null; } resolveAtk(e, c); } }
  else if (c.ph === 'dash') { const step = Math.min(c.left, 28 * dt); for (let i = 0; i < 3; i++) { e.x += Math.sin(e.rot) * step / 3; e.z += Math.cos(e.rot) * step / 3; if (collide(e)) c.left = 0; } c.left -= step; e.sp = 12; if (chance(0.5)) puff(e.x, 1, e.z, 1, { c: [0.2, 0.2, 0.3], add: 0.3, sp: 0.5, life: 0.3, size: 0.35, grav: 0 });
    for (const t of foes(e)) if (!c.hitIds[t.id || 'p'] && d2(e, t) < A.w + t.r) { c.hitIds[t.id || 'p'] = 1; hit(e, t, { dmg: e.dmg * A.dmg, mat: e.fam === 'spirit' ? 'magic' : 'phys', kb: 7, poise: 16 }); } if (c.left <= 0) { c.ph = 'rec'; c.t = 0; e.sw = null; } }
  else if (c.t >= A.rec * (e.enraged ? 0.75 : 1)) { if (A.reps && c.rep < A.reps - 1 && c.tgt && !c.tgt.dead && d2(e, c.tgt) < A.range + 2.5) { c.rep++; c.ph = 'wind'; c.t = 0; c.wind = A.wind * 0.72; e.rot = dirTo(e, c.tgt); e.sw = { kind: 'wind', t: 0, dur: c.wind, hold: true }; if (A.kind === 'melee') c.tele = telegraph(e.x, e.z, e.rot, { kind: 'arc', r: A.range + e.r, arc: A.arc }, c.wind); } else { ai.cd[c.name] = A.cd * R(0.8, 1.2) * (e.enraged ? 0.7 : 1); ai.gcd = e.def.boss ? R(0.25, 0.6) : R(0.5, 1.1); ai.cur = null; e.sw = null; } }
}
function updEnemy(e, dt) {
  const ai = e.ai, def = e.def; tickFx(e, dt); if (e.dead) return; e.hpShow = Math.max(0, (e.hpShow || 0) - dt); e.poise = Math.min(e.maxPoise, e.poise + dt * e.maxPoise * 0.12);
  if (Math.abs(e.kx) + Math.abs(e.kz) > 0.05) { e.x += e.kx * dt; e.z += e.kz * dt; collide(e); const f = Math.pow(0.002, dt); e.kx *= f; e.kz *= f; }
  if (e.fx.stun > 0) { e.sp = 0; return; } for (const k in ai.cd) ai.cd[k] -= dt; ai.gcd -= dt; ai.t -= dt;
  if (def.boss && !e.enraged && e.hp < e.maxHp * 0.5) { e.enraged = true; e.spdM *= 1.15; floatText(e.x, 3.4, e.z, 'ENRAGED', '#ff4050', 20); sfx('growl'); ringFx(e.x, e.z, 0xff2030, 9, 0.7); RT.shake = 0.5; }
  if (ai.cur) return updAtk(e, dt);
  if (def.peaceful) { const d = d2(e, pl); if (d < 10 || e.hp < e.maxHp) { ai.flee = 3; } if (ai.flee > 0) { ai.flee -= dt; const a = dirTo(pl, e); mv(e, e.x + Math.sin(a) * 5, e.z + Math.cos(a) * 5, def.spd, dt); } else wander(e, dt, 2); return; }
  const tgt = nearestFoe(e, 60); if (!tgt) { e.sp = 0; if (e.team === 0) mv(e, pl.x + 2, pl.z + 2, def.spd, dt); return; } const d = d2(e, tgt);
  if (!ai.aggro) { if (d < (def.boss ? 16 : (isNight() ? 15 : 12)) && los(e, tgt)) aggro(e); else return wander(e, dt, 1.8); }
  if (e.team === 1 && RT.area.id === 'world' && !def.boss && d2(e, ai.home) > 70) { ai.aggro = false; e.hp = e.maxHp; return; }
  if (e.team === 1 && tgt === pl) RT.combatT = Math.max(RT.combatT, 3);
  if (ai.gcd <= 0) { const sees = d < 6 || los(e, tgt), opts = def.atk.filter(n => { const A = ATK[n]; return !(ai.cd[n] > 0) && d <= A.range + (A.kind === 'melee' ? e.r + tgt.r - 0.4 : 0) && d >= (A.min || 0) && sees; });
    if (opts.length) { opts.sort((p, q) => ATK[q].cd - ATK[p].cd); return startAtk(e, chance(0.65) ? opts[0] : pick(opts), tgt); } }
  // movement between attacks
  const want = def.ranged ? 9 : 1.9 + e.r; if (def.ranged && d < 5) { const a = dirTo(tgt, e); mv(e, e.x + Math.sin(a) * 4, e.z + Math.cos(a) * 4, def.spd, dt, false); e.rot = dirTo(e, tgt); }
  else if (d > want + 0.4) { if (def.strafe && d < 8 && ai.gcd > 0) { const a = dirTo(tgt, e) + ai.strafe * 0.9 * dt * (def.spd / d); mv(e, tgt.x + Math.sin(a) * d, tgt.z + Math.cos(a) * d, def.spd * 0.8, dt, false); e.rot = dirTo(e, tgt); if (ai.t <= 0) { ai.t = R(1, 2.5); ai.strafe *= -1; } } else mv(e, tgt.x, tgt.z, def.spd, dt); }
  else { e.sp = 0; e.rot += angd(dirTo(e, tgt), e.rot) * Math.min(1, dt * 8); if (def.ranged && ai.gcd > 0) { const a = dirTo(tgt, e) + ai.strafe * dt * 0.5; mv(e, tgt.x + Math.sin(a) * d, tgt.z + Math.cos(a) * d, def.spd * 0.5, dt, false); e.rot = dirTo(e, tgt); } }
}
function wander(e, dt, sp) { const ai = e.ai; if (ai.t <= 0 || !ai.wt) { ai.t = R(2, 6); const a = R(0, TAU), d = R(0, 7); ai.wt = chance(0.45) ? null : { x: ai.home.x + Math.sin(a) * d, z: ai.home.z + Math.cos(a) * d }; } if (ai.wt && hyp(ai.wt.x - e.x, ai.wt.z - e.z) > 0.6) mv(e, ai.wt.x, ai.wt.z, sp, dt); else e.sp = 0; }

/* ---------------- people ---------------- */
const TOWNLOOK = { cloth: [0x8a3f3f, 0x3f6690, 0x7a7a3f, 0x86609a, 0x9a9a9a, 0x3a7a66, 0xb07840, 0x6a3555], hair: [0x1a1210, 0x4a2f1a, 0x9a7a44, 0x2a2a2a, 0x8a2f1a, 0xc0b4a0], skin: [0xd3a48a, 0xa5714e, 0xe8c2a4, 0x70492f], pants: [0x1a1c26, 0x2a2420, 0x30343c] };
function spawnNpc(o) {
  const L = Object.assign({ cloth: pick(TOWNLOOK.cloth), hair: pick(TOWNLOOK.hair), skin: pick(TOWNLOOK.skin), pants: pick(TOWNLOOK.pants), long: chance(0.45) }, o.look || {}), def = { n: o.n, rig: 'human', fam: 'human', look: L, scale: o.scale || 1 }, rig = mkBody(def), n = baseActor('npc', def, rig, o.x, o.z);
  areaAdd(rig.g); Object.assign(n, { npc: o, rot: o.rot || 0, vr: o.rot || 0, hp: 50, maxHp: 50, blood: 100, wps: o.wps, wait: R(0, 4), stuck: 0, pose: o.pose || null, r: 0.5 }); actors.push(n); pose(n, 0); return n;
}
function updNpc(n, dt) {
  if (n.dead) return; if (n.held) { n.sp = 0; return; }
  if (n.fleeT > 0) { n.fleeT -= dt; const a = dirTo(pl, n); mv(n, n.x + Math.sin(a) * 5, n.z + Math.cos(a) * 5, 5.2, dt); return; }
  if (n.dazed > 0) { n.dazed -= dt; n.sp = 0; n.fx.stun = 0.2; return; }
  if (!n.wps) { n.sp = 0; if (n.npc.talk && d2(n, pl) < 7 && !n.npc.still) n.rot += angd(dirTo(n, pl), n.rot) * Math.min(1, dt * 4); else if (n.npc.rot != null) n.rot = n.npc.rot; return; }
  if (n.wait > 0) { n.wait -= dt; n.sp = 0; return; }
  if (!n.tg || hyp(n.x - n.tg[0], n.z - n.tg[1]) < 1.2 || n.stuck > 2.5) { n.tg = pick(n.wps); n.wait = n.stuck > 2.5 ? 0 : R(0, 5); n.stuck = 0; return; }
  const ox = n.x, oz = n.z; mv(n, n.tg[0], n.tg[1], 2.1, dt); if (hyp(n.x - ox, n.z - oz) < 1.2 * dt) n.stuck += dt;
}

/* ---------------- overworld spawning ---------------- */
let spawnT = 0, squadT = 20;
function updSpawns(dt) {
  if (RT.area.id !== 'world') return; spawnT -= dt; if (spawnT > 0) return; spawnT = 1.6;
  for (let i = actors.length - 1; i >= 0; i--) { const e = actors[i]; if (e.kind === 'enemy' && e.ai.spawned && !e.def.boss && (d2(e, pl) > 100 || (e.dead && e.gone))) removeActor(e); }
  const z = zoneAt(pl.x, pl.z); if (z !== RT.zone) { RT.zone = z; zoneBanner(z); }
  const night = isNight(), table = night ? (fullMoon() && z.full ? z.full.concat(z.night || []) : z.night) : z.day;
  if (!z.safe && table && table.length && !(z.id === 'cem' && S.quests.q_bump)) { let n = 0; for (const e of actors) if (e.kind === 'enemy' && e.ai.spawned && !e.dead && d2(e, pl) < 75) n++;
    if (n < (z.max || 4) + (night ? 1 : 0)) for (let t = 0; t < 6; t++) { const a = R(0, TAU), d = R(40, 58), x = pl.x + Math.sin(a) * d, zz = pl.z + Math.cos(a) * d, zq = zoneAt(x, zz); if (zq.safe || Math.abs(x) > WS - 8 || Math.abs(zz) > WS - 8 || solidAt(x, zz)) continue; const probe = { x, z: zz, r: 0.6 }; collide(probe); if (hyp(probe.x - x, probe.z - zz) > 1.5) continue;
        const type = pick(table), lvl = Math.max(1, zq.lvl + Math.max(0, Math.floor((S.lvl - zq.lvl) * 0.65)) + (night ? 1 : 0) + RI(-1, 1)), pack = type === 'wolf' ? RI(2, 3) : type === 'deer' ? RI(1, 3) : type === 'feral' && night ? RI(1, 2) : 1;
        for (let k = 0; k < pack; k++) { const e = spawnEnemy(type, x + R(-2, 2) * k, zz + R(-2, 2) * k, lvl, { spawned: true, elite: k === 0 && chance(night ? 0.09 : 0.05) }); collide(e); } break; } }
  // a vampire who has been seen is hunted
  if (S.species === 'vampire' && S.exposure >= 50) { squadT -= 1.6; if (squadT <= 0 && actors.filter(e => e.type === 'hunter' && !e.dead).length < 4) { squadT = 45; const a = R(0, TAU); for (let k = 0; k < 2; k++) { const e = spawnEnemy('hunter', pl.x + Math.sin(a) * 42 + k * 2, pl.z + Math.cos(a) * 42, Math.max(3, S.lvl + RI(-1, 1)), { spawned: true }); collide(e); aggro(e); } toast('The Council has your description. Hunters are closing in.'); } }
  worldEvents();
}
/* Hollow Moon — the player: controls, melee combos, ranged, dodge, parry, abilities, feeding, camera. */
let mvx = 0, mvz = 0, wardMesh = null;
function mkPlayer(x, z) {
  const L = S.look, def = { n: 'You', rig: 'human', fam: 'human', look: { cloth: L.coat, pants: 0x15151d, skin: L.skin, hair: L.hair, long: L.long, coat: 1 }, scale: 1.04 }, rig = mkBody(def);
  if (pl) scene.remove(pl.rig.g); scene.add(rig.g); pl = baseActor('player', def, rig, x, z); pl.team = 0; pl.rot = pl.vr = 0;
  Object.assign(pl, { hp: S.hp, sta: 100, foc: S.foc, blood: S.blood, act: null, combo: 0, comboT: 0, buf: null, bufT: 0, dodgeCd: 0, block: false, blockT: 0, cds: {}, rangedCd: 0, healCd: 0, staT: 0, moveT: 0, atkHeld: 0, heavyUsed: false, feed: null, burning: false, roll: 0,
    buff: { ripper: 0, ward: 0, wardT: 0, coatV: 0, coatW: 0, mend: 0, mendV: 0, burger: 0, slayer: 0, slayerN: 0, riposte: 0, second: 0, sage: 0 } });
  wardMesh = new T.Mesh(new T.SphereGeometry(1.5, 16, 12), new T.MeshBasicMaterial({ color: 0x6a8cff, transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false })); wardMesh.position.y = 1.1; wardMesh.visible = false; rig.g.add(wardMesh);
  recalc(); refreshGear(); pl.hp = Math.min(P.maxHp, pl.hp || P.maxHp); pl.sta = P.maxSta; return pl;
}
function refreshGear() {
  const rig = pl.rig; if (rig.wpn) { rig.wpn.parent.remove(rig.wpn); rig.wpn = null; } const w = S.eq.weapon, name = w ? BASES[w.base].model : S.species === 'vampire' ? 'wClaws' : null; if (name) rig.wpn = rig.attach(name, rig.P.ArmR, [0, -0.62, 0.06]);
  if (rig.mats.skin) { rig.mats.skin.color.setHex(S.look.skin).convertSRGBToLinear(); if (S.species === 'vampire') rig.mats.skin.color.lerp(cA.setRGB(0.75, 0.74, 0.76), 0.45); }
  const heavy = S.eq.armor && /vest|mail/.test(S.eq.armor.base); if (heavy && !rig.arm) rig.arm = rig.attach('armor'); else if (!heavy && rig.arm) { rig.arm.parent.remove(rig.arm); rig.arm = null; }
}
const weaponCls = () => S.eq.weapon ? BASES[S.eq.weapon.base].cls : 'fast';
const plTargets = () => actors.filter(a => a.kind === 'enemy' && !a.dead && a.team !== 0);
const canAct = () => pl && !pl.dead && !RT.paused && !(pl.fx.stun > 0) && !pl.feed;
function assistTarget(maxD = 13) { let best = null, bs = 1e9; const md = hyp(mvx, mvz) > 0.2 ? Math.atan2(mvx, mvz) : pl.rot; for (const e of plTargets()) { if (e.def.peaceful) continue; const d = d2(pl, e); if (d > maxD) continue; const s = d + Math.abs(angd(dirTo(pl, e), md)) * 3; if (s < bs) { bs = s; best = e; } } return best; }
function aimDir() { if (!RT.touch && mouse.used) return Math.atan2(mouse.wx - pl.x, mouse.wz - pl.z); const t = assistTarget(); return t ? dirTo(pl, t) : hyp(mvx, mvz) > 0.2 ? Math.atan2(mvx, mvz) : pl.rot; }
function aimPoint(maxD) { if (!RT.touch && mouse.used) { let dx = mouse.wx - pl.x, dz = mouse.wz - pl.z; const l = hyp(dx, dz); if (l > maxD) { dx *= maxD / l; dz *= maxD / l; } return { x: pl.x + dx, z: pl.z + dz }; } const t = assistTarget(maxD); if (t) return { x: t.x, z: t.z }; const a = aimDir(); return { x: pl.x + Math.sin(a) * Math.min(6, maxD), z: pl.z + Math.cos(a) * Math.min(6, maxD) }; }
function aimTarget(maxD) { if (!RT.touch && mouse.used) { let best = null, bd = 5; const m = { x: mouse.wx, z: mouse.wz }; for (const e of plTargets()) { if (e.def.peaceful || d2(pl, e) > maxD) continue; const d = d2(m, e); if (d < bd) { bd = d; best = e; } } if (best) return best; } return assistTarget(maxD); }

/* ---------------- attacks ---------------- */
function meleeHit(range, arc, mult, o = {}) { const dmg = P.wdmg * mult * P.meleeM * pl.starve; let n = 0; for (const e of plTargets()) if (d2(pl, e) < range + e.r && (arc > 6 || Math.abs(angd(dirTo(pl, e), pl.rot)) < arc / 2)) { hit(pl, e, Object.assign({ dmg, mat: P.wmat }, o)); n++; } return n; }
function startLight() {
  const cls = weaponCls(), c = CLS[cls], i = (pl.comboT > 0 ? pl.combo : 0) % c.hits.length, h = c.hits[i], d = h[0] / P.as; pl.rot = aimDir();
  pl.act = { type: 'atk', i, t: 0, dur: d, hitAt: d * 0.42, mult: h[1], done: false }; pl.combo = i + 1; pl.comboT = d + 0.5; pl.block = false;
  pl.sw = { kind: cls === 'staff' ? 'cast' : i === 2 ? (cls === 'slow' ? 'over' : 'slashR') : i % 2 ? 'slashL' : 'slashR', t: 0, dur: d }; pl.kx += Math.sin(pl.rot) * 4.5; pl.kz += Math.cos(pl.rot) * 4.5; sfx(cls === 'staff' ? 'magic' : 'swing');
}
function startHeavy() {
  const cls = weaponCls(), h = CLS[cls].heavy; if (pl.sta < h.st * 0.6) { sfx('deny'); return; } if (h.kind === 'blast' && pl.foc < 12) { sfx('deny'); floatText(pl.x, 2.6, pl.z, 'No focus', '#9ab0ff', 13); return; }
  pl.sta = Math.max(0, pl.sta - h.st); pl.staT = 0.8; if (h.kind === 'blast') pl.foc -= 12; pl.rot = aimDir(); const d = h.dur / P.as; pl.heavyUsed = true; pl.combo = 0; pl.block = false;
  pl.act = { type: 'atk', heavy: h.kind, t: 0, dur: d, hitAt: d * 0.55, mult: h.mult, done: false, n: 0, pt: aimPoint(10) }; pl.sw = { kind: h.kind === 'lunge' ? 'stab' : h.kind === 'over' ? 'over' : h.kind === 'spin' ? 'spin' : 'cast', t: 0, dur: d }; sfx('heavy');
}
function plResolve() {
  const a = pl.act, cls = weaponCls(), c = CLS[cls], col = P.wmat === 'silver' ? 0xdfe8ff : P.wmat === 'wood' ? 0xffd9a0 : 0xe8f0ff;
  if (!a.heavy) { if (c.bolt) { shoot(pl, pl.x + Math.sin(pl.rot) * 0.9, pl.z + Math.cos(pl.rot) * 0.9, pl.rot, { spd: 24, dmg: P.spellBase * 0.5 * a.mult * pl.starve, mat: 'magic', col: 0x9a8cff, orb: true, spell: true, range: 20, poise: 8 }); return; }
    trail(pl, c.range, c.arc, col, a.i % 2 ? -1 : 1); meleeHit(c.range, c.arc, a.mult, { poise: c.poise * (a.i === 2 ? 1.7 : 1), kb: 2 + a.i * 1.5 }); return; }
  if (a.heavy === 'lunge') { trail(pl, c.range + 1, 1.2, col); meleeHit(c.range + 1.2, 1.3, a.mult, { poise: 45, kb: 5, heavy: 1 }); }
  else if (a.heavy === 'over') { trail(pl, c.range + 0.8, 1.6, col); meleeHit(c.range + 0.9, 1.5, a.mult, { poise: 70, kb: 6, heavy: 1 }); const fx_ = pl.x + Math.sin(pl.rot) * 2.4, fz = pl.z + Math.cos(pl.rot) * 2.4, ward = S.eq.weapon && S.eq.weapon.uniq === 'wardblade'; hazard(fx_, fz, ward ? 5 : 2.6, 0, P.wdmg * P.meleeM * (ward ? 1.2 : 0.5), { team: 0, src: pl, mat: P.wmat, poise: 30 }); }
  else if (a.heavy === 'spin') { trail(pl, c.range + 0.5, 6.2, col); meleeHit(c.range + 0.6, 7, a.mult * 0.6, { poise: 40, kb: 5, heavy: 1 }); sfx('swing'); }
  else if (a.heavy === 'blast') hazard(a.pt.x, a.pt.z, 3.4, 0.12, P.spellBase * a.mult * pl.starve, { team: 0, src: pl, mat: 'magic', pc: MAGIC, col: 0x8a7cff, spell: 1, poise: 40, kb: 4 });
}
function tryAttack() { if (!canAct()) return; const a = pl.act; if (!a) return startLight(); if (a.type === 'atk' && !a.heavy && a.done && a.t > a.dur * 0.9) return startLight(); pl.buf = 'atk'; pl.bufT = 0.32; }
function tryHeavy() { if (!canAct()) return; if (pl.act) { pl.buf = 'heavy'; pl.bufT = 0.3; return; } startHeavy(); }
function tryShoot() {
  const it = S.eq.ranged; if (!it) { if (!RT.noRanged) { RT.noRanged = 1; toast('You have no ranged weapon equipped.'); } return; } if (!canAct() || pl.rangedCd > 0) return; if (pl.act) { if (pl.act.type !== 'atk' || !pl.act.done) { pl.buf = 'shoot'; pl.bufT = 0.25; return; } }
  pl.rot = aimDir(); pl.act = { type: 'shoot', t: 0, dur: 0.24, done: false, it }; pl.sw = { kind: 'shoot', t: 0, dur: 0.3 }; pl.rangedCd = BASES[it.base].cd * P.reload; pl.block = false;
}
function tryDodge() {
  if (!pl || pl.dead || RT.paused || pl.fx.stun > 0 || pl.dodgeCd > 0) return; if (pl.feed) endFeed(false); const vamp = S.species === 'vampire', cost = vamp ? 14 : 22; if (pl.sta < cost) { sfx('deny'); return; }
  pl.sta -= cost; pl.staT = 0.7; const a = hyp(mvx, mvz) > 0.2 ? Math.atan2(mvx, mvz) : pl.rot, dist = (vamp ? 7.5 : 5.2) * (1 + 0.2 * (vamp ? sk('v_blur') : 0)), dur = vamp ? 0.2 : 0.34;
  pl.act = { type: 'dodge', t: 0, dur, vx: Math.sin(a) * dist / dur, vz: Math.cos(a) * dist / dur, hitIds: {} }; pl.inv = dur * 0.85 + 0.06; pl.rot = a; pl.dodgeCd = dur + 0.2; pl.sw = null; pl.block = false; pl.roll = vamp ? 0 : 1; sfx(vamp ? 'blur' : 'dodge');
}

/* ---------------- abilities ---------------- */
const skDmg = () => P.wdmg * P.meleeM * pl.starve, spDmg = () => P.spellBase * pl.starve;
function dashTo(x, z) { const steps = 8, dx = (x - pl.x) / steps, dz = (z - pl.z) / steps; for (let i = 0; i < steps; i++) { pl.x += dx; pl.z += dz; collide(pl); if (i % 2) puff(pl.x, 1.1, pl.z, 2, { c: [0.25, 0.2, 0.35], add: 0.4, sp: 0.5, life: 0.35, size: 0.4, grav: 0 }); } }
const ABIL = {
  h_gren(r) { const p = aimPoint(13); pl.sw = { kind: 'slashR', t: 0, dur: 0.3 }; sfx('swing'); hazard(p.x, p.z, 4.4, 0.55, skDmg() * (1.2 + 0.4 * r), { team: 0, src: pl, mat: 'verv', pc: VERV, col: 0xa070ff, poise: 40, onHit: e => { if (e.fam === 'vampire') addFx(e, 'stun', 1 + r); addFx(e, 'slow', 3); } }); },
  h_heart(r) { const t = aimTarget(9); if (t) pl.rot = dirTo(pl, t); else pl.rot = aimDir(); const a = pl.rot, d = t ? Math.max(0, d2(pl, t) - 1.6) : 6; dashTo(pl.x + Math.sin(a) * d, pl.z + Math.cos(a) * d); pl.sw = { kind: 'stab', t: 0, dur: 0.3 }; pl.inv = Math.max(pl.inv, 0.3); trail(pl, 3.4, 1.2, 0xfff0c0); sfx('heavy');
    for (const e of plTargets()) if (d2(pl, e) < 3.6 + e.r && Math.abs(angd(dirTo(pl, e), pl.rot)) < 0.9) { if (!e.def.boss && e.hp / e.maxHp < 0.15 + 0.05 * r) { floatText(e.x, 3, e.z, 'HEARTSEEKER', '#ffd24a', 18); hit(pl, e, { dmg: e.hp + 1, mat: P.wmat, noCrit: 1, heavy: 1 }); } else hit(pl, e, { dmg: skDmg() * (2.6 + 0.4 * r), mat: P.wmat, poise: 60, kb: 5, heavy: 1 }); } },
  h_whirl(r) { const n = 2 + r; pl.act = { type: 'skill', kind: 'whirl', t: 0, dur: 0.24 * n, n, k: 0 }; pl.sw = { kind: 'spin', t: 0, dur: 0.24 * n, turns: n }; },
  h_volley(r) { const it = S.eq.ranged, n = 3 + 2 * r, b = it ? BASES[it.base] : null, dmg = it ? it.dmg * P.rangedM : skDmg() * 0.6; pl.rot = aimDir(); pl.sw = { kind: 'shoot', t: 0, dur: 0.35 }; sfx(b && it.base === 'revolver' ? 'gun' : 'shoot');
    for (let i = 0; i < n; i++) shoot(pl, pl.x, pl.z, pl.rot + (i - (n - 1) / 2) * 0.13, { spd: b ? b.pspd : 30, dmg: dmg * 0.8 * pl.starve, mat: b ? b.mat : 'wood', range: 26, poise: 10, pierce: it && it.uniq === 'halebow' }); },
  w_incend(r) { pl.rot = aimDir(); pl.sw = { kind: 'cast', t: 0, dur: 0.4 }; sfx('fire'); const a = pl.rot; for (let i = 0; i < 46; i++) { const b = a + R(-0.55, 0.55), s = R(8, 20); puff(pl.x + Math.sin(a) * 0.8, 1.2, pl.z + Math.cos(a) * 0.8, 1, { c: FIRE, add: 1, sp: 0.5, vx: Math.sin(b) * s, vz: Math.cos(b) * s, up: 0.5, life: 0.45, size: 0.45, grav: -1, spread: 0.1 }); }
    for (const e of plTargets()) if (d2(pl, e) < 9 + e.r && Math.abs(angd(dirTo(pl, e), a)) < 0.62) { hit(pl, e, { dmg: spDmg() * (1.4 + 0.3 * r), mat: 'fire', spell: 1, poise: 20, kb: 3 }); addFx(e, 'burn', 4, spDmg() * 0.35); }
    hazard(pl.x + Math.sin(a) * 5, pl.z + Math.cos(a) * 5, 2.8, 0, 0, { team: 0, src: pl, mat: 'fire', spell: 1, linger: 3.5, tick: spDmg() * 0.3 }); },
  w_aneur(r) { pl.sw = { kind: 'cast', t: 0, dur: 0.5 }; sfx('zap'); ringFx(pl.x, pl.z, 0xa080ff, 10, 0.5); RT.shake = 0.3; for (const e of plTargets()) if (d2(pl, e) < 10) { addFx(e, 'stun', 1.5 + 0.5 * r); hit(pl, e, { dmg: spDmg() * (0.8 + 0.3 * r), mat: 'magic', spell: 1 }); puff(e.x, 2, e.z, 8, { c: MAGIC, add: 1, sp: 1.5, life: 0.5, size: 0.22, grav: 0 }); } },
  w_ward(r) { pl.buff.ward = P.maxHp * (0.2 + 0.1 * r); pl.buff.wardT = 8; pl.sw = { kind: 'cast', t: 0, dur: 0.3 }; sfx('magic'); ringFx(pl.x, pl.z, 0x6a8cff, 3, 0.5); },
  w_mend(r) { pl.buff.mend = 4; pl.buff.mendV = P.maxHp * (0.2 + 0.1 * r) * (1 + 0.15 * sk('w_herb')) / 4; pl.sw = { kind: 'cast', t: 0, dur: 0.3 }; sfx('heal'); },
  w_temp(r) { pl.rot = aimDir(); pl.sw = { kind: 'cast', t: 0, dur: 0.35 }; let from = { x: pl.x, z: pl.z }, cur = aimTarget(13); if (!cur) { sfx('deny'); return false; } const done = {}; sfx('zap'); RT.flashV = 0.08;
    for (let i = 0; i < 3 + r && cur; i++) { done[cur.id] = 1; bolt(from, cur); hit(pl, cur, { dmg: spDmg() * (1.5 + 0.3 * r) * Math.pow(0.9, i), mat: 'magic', spell: 1, poise: 25 }); from = cur; let nx = null, bd = 9; for (const e of plTargets()) if (!done[e.id] && !e.def.peaceful) { const d = d2(from, e); if (d < bd) { bd = d; nx = e; } } cur = nx; } },
  v_frenzy(r) { const t = aimTarget(10); if (!t) { sfx('deny'); return false; } const a = dirTo(pl, t); dashTo(t.x - Math.sin(a) * (1.2 + t.r), t.z - Math.cos(a) * (1.2 + t.r)); pl.rot = a; pl.inv = Math.max(pl.inv, 0.5); pl.sw = { kind: 'bite', t: 0, dur: 0.45 }; pl.act = { type: 'skill', kind: 'lock', t: 0, dur: 0.4 }; sfx('bite');
    hit(pl, t, { dmg: skDmg() * (1.8 + 0.4 * r), mat: 'bite', poise: 50, noLs: 1 }); if (t.fam === 'spirit') floatText(pl.x, 2.8, pl.z, 'Nothing to drink', '#a0b0c0', 13); else { heal(P.maxHp * 0.14); pl.blood = Math.min(P.maxBlood, pl.blood + 20 + 5 * r); puff(t.x, 1.5, t.z, 16, { c: BLOOD, add: 0.05, sp: 3, life: 0.6, size: 0.24 }); } },
  v_compel(r) { const t = aimTarget(11); if (!t) { sfx('deny'); return false; } pl.sw = { kind: 'cast', t: 0, dur: 0.35 }; ringFx(t.x, t.z, 0xb070ff, 3, 0.6); sfx('magic');
    if (t.def.verv || t.fam === 'spirit' || t.fam === 'wolf' && t.def.rig === 'beast') { floatText(t.x, 2.8, t.z, t.def.verv ? 'VERVAIN' : 'IMMUNE', '#c090ff', 15); return; } if (t.def.boss) { addFx(t, 'stun', 5 + r); return; } t.team = 0; t.fx.charm = 8 + 4 * r; t.ai.cur = null; t.ai.aggro = true; floatText(t.x, 2.8, t.z, 'COMPELLED', '#c090ff', 15); },
  v_step(r) { const t = aimTarget(15); if (!t) { sfx('deny'); return false; } puff(pl.x, 1.2, pl.z, 20, { c: [0.08, 0.05, 0.12], add: 0.2, sp: 2, life: 0.5, size: 0.45, grav: 0 }); const a = t.rot + PI; pl.x = t.x + Math.sin(a) * (1.4 + t.r); pl.z = t.z + Math.cos(a) * (1.4 + t.r); collide(pl); pl.rot = pl.vr = dirTo(pl, t); pl.inv = Math.max(pl.inv, 0.35); sfx('blur');
    puff(pl.x, 1.2, pl.z, 20, { c: [0.08, 0.05, 0.12], add: 0.2, sp: 2, life: 0.5, size: 0.45, grav: 0 }); pl.sw = { kind: 'slashR', t: 0, dur: 0.25 }; trail(pl, 3, 2, 0xff4060); hit(pl, t, { dmg: skDmg() * (2.2 + 0.6 * r), mat: P.wmat, crit: 1, poise: 60, heavy: 1 }); },
  v_ripper(r) { pl.buff.ripper = 12; S.humanity = Math.max(0, S.humanity - 2); sfx('turn'); ringFx(pl.x, pl.z, 0xff2030, 6, 0.6); RT.flashV = 0.15; floatText(pl.x, 2.8, pl.z, 'IT IS OFF', '#ff5060', 18); },
};
function bolt(a, b) { const pts = [], n = 7; for (let i = 0; i <= n; i++) pts.push(new T.Vector3(lerp(a.x, b.x, i / n) + (i % n ? R(-0.5, 0.5) : 0), 1.4 + (i % n ? R(-0.4, 0.4) : 0), lerp(a.z, b.z, i / n) + (i % n ? R(-0.5, 0.5) : 0))); const l = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: 0xcfd8ff })); areaAdd(l); setTimeout(() => { l.parent && l.parent.remove(l); l.geometry.dispose(); }, 130); puff(b.x, 1.4, b.z, 8, { c: [0.8, 0.85, 1], add: 1, sp: 3, life: 0.25, size: 0.2, grav: 0 }); }
const treeOpen = t => t === 'hunter' || (t === 'witch' ? !!S.flags.witch && (S.species === 'human' || S.heretic) : S.species === 'vampire');
function castSkill(slot) {
  const id = S.bar[slot]; if (!id || !canAct()) return; const d = SK[id], r = sk(id); if (!r) return; if (!treeOpen(d.tree)) { sfx('deny'); toast(d.tree === 'witch' ? 'The magic does not answer the dead.' : 'You are not what that requires.'); return; }
  if (pl.cds[id] > 0) { sfx('deny'); return; } if (pl.fx.verv > 0 && d.tree === 'vampire') { sfx('deny'); floatText(pl.x, 2.6, pl.z, 'Vervain', '#c090ff', 13); return; } if (pl.act && pl.act.type !== 'atk') return;
  const c = d.cost || {}; if (c.st && pl.sta < c.st * 0.5) { sfx('deny'); return; } if (c.bl && pl.blood < c.bl) { sfx('deny'); floatText(pl.x, 2.6, pl.z, 'Not enough blood', '#ff7080', 13); return; }
  if (c.fo && pl.foc < c.fo) { if (sk('w_express') && pl.hp > P.maxHp * 0.15) pl.hp -= P.maxHp * 0.08; else { sfx('deny'); floatText(pl.x, 2.6, pl.z, 'No focus', '#9ab0ff', 13); return; } } else if (c.fo) pl.foc -= c.fo;
  pl.act = null; pl.block = false; if (ABIL[id](r) === false) { if (c.fo) pl.foc = Math.min(P.maxFoc, pl.foc + c.fo); return; } if (c.st) { pl.sta = Math.max(0, pl.sta - c.st); pl.staT = 0.8; } if (c.bl) pl.blood -= c.bl; pl.cds[id] = d.cd * (1 - P.cdr); RT.combatT = Math.max(RT.combatT, 2);
}

/* ---------------- feeding (vampires) ---------------- */
function startFeed(n) {
  pl.feed = { v: n }; n.held = true; n.pose = 'held'; pl.rot = dirTo(pl, n); n.rot = pl.rot; pl.sw = { kind: 'bite', t: 0, dur: 9, hold: true }; sfx('bite'); puff(n.x, 1.5, n.z, 8, { c: BLOOD, add: 0.05, sp: 2, life: 0.5, size: 0.2 });
  let seen = 0; for (const o of actors) if (o.kind === 'npc' && o !== n && !o.dead && o.rig.g.visible && d2(o, n) < 12 && los(o, n)) { seen++; o.fleeT = 6; } if (seen) { S.exposure = Math.min(100, S.exposure + 14 + seen * 8); toast('Someone saw you.'); }
}
function endFeed(interrupted) { const f = pl.feed; if (!f) return; const n = f.v; pl.feed = null; pl.sw = null; n.held = false; n.pose = null; $('feed').hidden = true; if (n.dead) return; n.dazed = 5; n.fedDay = S.day; if (!interrupted) { S.humanity = Math.min(100, S.humanity + 1); toast('They will remember a dizzy spell and nothing else.'); } S.stats.feeds++; }
function updFeed(dt) {
  const n = pl.feed.v; pl.sp = 0; if (!K.e || n.dead) return endFeed(false); const am = Math.min(n.blood, 24 * dt); n.blood -= am; pl.blood = Math.min(P.maxBlood, pl.blood + am * 0.6); heal(P.maxHp * 0.035 * dt, true); $('feed').hidden = false; $('feedfill').style.width = n.blood + '%'; pl.hbT = (pl.hbT || 0) - dt; if (pl.hbT <= 0) { sfx('heart'); pl.hbT = lerp(1.2, 0.42, n.blood / 100); }
  if (n.blood <= 0) { n.dead = true; n.held = false; n.pose = null; S.humanity = Math.max(0, S.humanity - 12); S.exposure = Math.min(100, S.exposure + 30); S.stats.murders++; sfx('die'); toast('The heart stops. You did not let go.'); diary('murder'); endFeed(true); qEvent('murder'); }
}
function biteEnemy(e) { pl.rot = dirTo(pl, e); pl.sw = { kind: 'bite', t: 0, dur: 0.5 }; pl.act = { type: 'skill', kind: 'lock', t: 0, dur: 0.45 }; pl.inv = Math.max(pl.inv, 0.45); sfx('bite'); puff(e.x, 1.4, e.z, 14, { c: BLOOD, add: 0.05, sp: 3, life: 0.6, size: 0.22 }); pl.blood = Math.min(P.maxBlood, pl.blood + (e.def.peaceful ? 30 : 25)); heal(P.maxHp * 0.1); hit(pl, e, { dmg: e.def.peaceful ? e.hp + 1 : e.maxHp * 0.4, mat: 'bite', noCrit: 1, noLs: 1 }); S.stats.feeds++; }

/* ---------------- per-frame ---------------- */
function updPlayer(dt) {
  const p = pl, b = p.buff; let ix = (K.d || K.arrowright ? 1 : 0) - (K.a || K.arrowleft ? 1 : 0) + J.x, iz = (K.s || K.arrowdown ? 1 : 0) - (K.w || K.arrowup ? 1 : 0) + J.y; const il = hyp(ix, iz); if (il > 1) { ix /= il; iz /= il; } mvx = ix; mvz = iz;
  for (const k of ['dodgeCd', 'rangedCd', 'healCd', 'inv', 'comboT', 'bufT', 'staT']) p[k] = Math.max(0, p[k] - dt); for (const k in p.cds) if (p.cds[k] > 0) p.cds[k] -= dt * (1 + 0);
  for (const k of ['ripper', 'wardT', 'coatV', 'coatW', 'mend', 'burger', 'slayer', 'riposte', 'second', 'sage']) if (b[k] > 0) b[k] -= dt; if (b.wardT <= 0) b.ward = 0; if (b.slayer <= 0) b.slayerN = 0; wardMesh.visible = b.ward > 0; tickFx(p, dt); if (p.dead) return;
  RT.combatT = Math.max(0, RT.combatT - dt); const combat = RT.combatT > 0, vamp = S.species === 'vampire'; p.starve = vamp && p.blood <= 0 ? 0.7 : 1;
  // resources
  if (p.staT <= 0 && !p.block) p.sta = Math.min(P.maxSta, p.sta + P.staRegen * dt); p.foc = Math.min(P.maxFoc, p.foc + P.focRegen * dt);
  if (b.mend > 0) heal(b.mendV * dt, true); if (b.burger > 0 && !vamp) heal(P.maxHp * 0.012 * dt, true); if (b.sage > 0) heal(P.maxHp * 0.02 * dt, true); if (P.regen > 0) heal(P.regen * dt, true);
  if (vamp) { p.blood = Math.max(0, p.blood - dt * 0.07); const rate = (sk('v_heal') * 0.004 + (combat ? 0 : 0.01)) * P.maxHp; if (p.hp < P.maxHp && p.blood > 0 && rate > 0) { heal(rate * dt, true); p.blood = Math.max(0, p.blood - dt * 0.35); } } else if (!combat && p.hp < P.maxHp) heal(P.maxHp * 0.02 * dt, true);
  if (b.ripper > 0) { p.blood = Math.max(0, p.blood - dt * 3); if (chance(0.3)) puff(p.x, 1.5, p.z, 1, { c: [0.6, 0.02, 0.05], add: 0.6, sp: 0.6, up: 1, life: 0.5, size: 0.25, grav: 0 }); }
  S.exposure = Math.max(0, S.exposure - dt * 0.06);
  // sunlight
  p.burning = vamp && RT.area.id === 'world' && sunUp() && !Object.values(S.eq).some(i => i && i.uniq === 'daylight') && !RT.indoors;
  if (p.burning) { const wet = S.weather === 'storm' || S.weather === 'rain' || S.weather === 'fog'; p.hp -= P.maxHp * (wet ? 0.02 : 0.05) * dt; puff(p.x + R(-0.3, 0.3), 1.4, p.z + R(-0.3, 0.3), 2, { c: FIRE, add: 1, sp: 0.6, up: 2.5, life: 0.5, size: 0.3, grav: -2 }); p.sunT = (p.sunT || 0) - dt; if (p.sunT <= 0) { p.sunT = 6; toast('The sun is burning you. Get home, or underground.'); sfx('fire'); } if (p.hp <= 0) return playerDeath('sun'); }
  if (Math.abs(p.kx) + Math.abs(p.kz) > 0.05) { p.x += p.kx * dt; p.z += p.kz * dt; collide(p); const f = Math.pow(0.0006, dt); p.kx *= f; p.kz *= f; }
  // held-attack → heavy
  const atkDown = mouse.l || K.j; if (atkDown) p.atkHeld += dt; else { p.atkHeld = 0; p.heavyUsed = false; }
  if (p.feed) return updFeed(dt); if (p.fx.stun > 0) { p.sp = 0; p.act = null; p.block = false; return; }
  const a = p.act;
  if (a) { a.t += dt;
    if (a.type === 'atk') { if (a.heavy === 'lunge' && a.t > a.dur * 0.25 && a.t < a.hitAt) { for (let i = 0; i < 2; i++) { p.x += Math.sin(p.rot) * 19 * dt / 2; p.z += Math.cos(p.rot) * 19 * dt / 2; collide(p); } }
      if (!a.done && a.t >= a.hitAt) { a.done = true; plResolve(); } if (a.heavy === 'spin' && a.done && a.n === 0 && a.t >= a.dur * 0.82) { a.n = 1; plResolve(); }
      p.sp = 0; if (a.t >= a.dur) { p.act = null; if (!a.heavy && atkDown && p.atkHeld > 0.3 && !p.heavyUsed) startHeavy(); } }
    else if (a.type === 'dodge') { for (let i = 0; i < 3; i++) { p.x += a.vx * dt / 3; p.z += a.vz * dt / 3; collide(p); } p.roll = vamp ? 0 : Math.max(0.001, 1 - a.t / a.dur); p.sp = 10;
      if (vamp) { puff(p.x, 1.1, p.z, 2, { c: [0.3, 0.3, 0.5], add: 0.5, sp: 0.4, life: 0.3, size: 0.5, grav: 0 }); if (sk('v_blur') >= 3) for (const e of plTargets()) if (!a.hitIds[e.id] && d2(p, e) < 1.6 + e.r) { a.hitIds[e.id] = 1; hit(p, e, { dmg: skDmg() * 0.8, mat: P.wmat, poise: 10 }); } }
      if (a.t >= a.dur) { p.act = null; p.roll = 0; } }
    else if (a.type === 'shoot') { p.sp = 0; if (!a.done && a.t >= a.dur * 0.45) { a.done = true; const it = a.it, bs = BASES[it.base]; shoot(p, p.x + Math.sin(p.rot) * 0.8, p.z + Math.cos(p.rot) * 0.8, p.rot, { spd: bs.pspd, dmg: it.dmg * P.rangedM * p.starve, mat: bs.mat, range: 30, poise: 12, pierce: it.uniq === 'halebow', col: bs.mat === 'steel' ? 0xd0d8e8 : 0xe8c890 }); sfx(it.base === 'revolver' ? 'gun' : 'shoot'); p.kx -= Math.sin(p.rot) * 1.5; p.kz -= Math.cos(p.rot) * 1.5; } if (a.t >= a.dur) p.act = null; }
    else if (a.type === 'skill') { if (a.kind === 'whirl') { const sp = P.spd * 0.6; p.x += ix * sp * dt; p.z += iz * sp * dt; collide(p); if (a.t >= (a.k + 0.5) * 0.24 && a.k < a.n) { a.k++; trail(p, 3.8, 6.2, 0xffe0b0); meleeHit(3.8, 7, 0.8, { poise: 20, kb: 2 }); sfx('swing'); } } p.sp = 0; if (a.t >= a.dur) p.act = null; }
  }
  if (!p.act) {
    if (p.buf && p.bufT > 0) { const bf = p.buf; p.buf = null; if (bf === 'atk') startLight(); else if (bf === 'heavy') startHeavy(); else if (bf === 'shoot') tryShoot(); }
    else if (atkDown && p.atkHeld > 0.34 && !p.heavyUsed && canAct()) startHeavy();
  }
  if (!p.act) {
    const want = (mouse.r || K.shift || K.l) && p.sta > 0; if (want && !p.block) { p.block = true; p.blockT = 0; } else if (!want) p.block = false; if (p.block) { p.blockT += dt; p.rot = aimDir(); }
    if (il > 0.1 && !combat) p.moveT += dt; else if (il <= 0.1 || combat) p.moveT = combat ? 0 : Math.max(0, p.moveT - dt * 3);
    const sp = P.spd * (p.block ? 0.45 : 1) * (p.moveT > 1.4 ? 1.35 : 1) * (p.fx.slow > 0 ? 0.6 : 1) * (p.fx.verv > 0 ? 0.8 : 1) * (b.ripper > 0 ? 1.25 : 1) * (p.starve < 1 ? 0.85 : 1);
    p.x += ix * sp * dt; p.z += iz * sp * dt; if (il > 0.05) collide(p); p.sp = Math.min(1, il) * sp; if (il > 0.15 && !p.block) p.rot = Math.atan2(ix, iz);
    if (p.sp > 2) { p.stepT = (p.stepT || 0) - dt * p.sp; if (p.stepT <= 0) { p.stepT = 3.4; sfx('step'); } }
  }
}
const camT = new T.Vector3(), look = new T.Vector3();
function updCam(dt, snap) {
  const tall = innerWidth < innerHeight, z = RT.started ? RT.zoom * (RT.area.id === 'tomb' ? 0.92 : 1) : 0.5; let lx = pl.x, lz = pl.z - (RT.started ? 0 : tall ? 3.2 : 2.6);
  if (!RT.touch && mouse.used && !RT.paused) { lx += clamp((mouse.wx - pl.x) * 0.13, -3.5, 3.5); lz += clamp((mouse.wz - pl.z) * 0.13, -3, 3); } if (RT.boss && !RT.boss.dead && d2(RT.boss, pl) < 26) { lx = lerp(lx, RT.boss.x, 0.22); lz = lerp(lz, RT.boss.z, 0.22); }
  camT.set(lx, (tall ? 24.5 : 23.5) * z, lz + (tall ? 15 : 15.5) * z);
  if (snap) { cam.position.copy(camT); look.set(lx, 1, lz); } else { cam.position.lerp(camT, 1 - Math.exp(-dt * 6)); look.lerp(v3.set(lx, 1, lz), 1 - Math.exp(-dt * 8)); }
  RT.shake = Math.max(0, RT.shake - dt * 1.8); cam.position.x += (Math.random() - 0.5) * RT.shake; cam.position.y += (Math.random() - 0.5) * RT.shake; cam.lookAt(look); cam.updateMatrixWorld();
  if (RT.area.id === 'world' && !isNight()) { const an = (S.clock - 6) / 14 * PI; sun.position.set(pl.x + Math.cos(an) * 42, 24 + Math.sin(an) * 34, pl.z - 20); } else sun.position.set(pl.x - 26, 48, pl.z - 20); sun.target.position.set(pl.x, 0, pl.z); aura.position.set(pl.x, 2.4, pl.z + 0.5);
  for (const b of RT.area.fade) { const hide = pl.z < b.z + b.d / 2 && pl.z > b.z - b.d / 2 - 10 && Math.abs(pl.x - b.x) < b.w / 2 + 2.5, a = lerp(b.a, hide ? 0.2 : 1, Math.min(1, dt * 8));
    if (Math.abs(a - b.a) > 0.001 || (hide && b.a === 1)) { const tr = a < 0.99; b.o.traverse(m => { if (m.isMesh) { if (m.material.transparent !== tr) { m.material.transparent = tr; m.material.needsUpdate = true; } m.material.opacity = a; m.castShadow = !hide; } }); b.a = a > 0.995 ? 1 : a; } }
}
addEventListener('wheel', e => { if (!RT.menu) RT.zoom = clamp(RT.zoom + Math.sign(e.deltaY) * 0.08, 0.7, 1.4); }, { passive: true });
/* Hollow Moon — systems: stats, items, loot, levelling, quests, bounties, areas, saving. */
let UID = 1; const drops = [];
function newGame(look) {
  S = { v: 2, seed: Math.floor(Math.random() * 1e9), species: 'human', heretic: false, lvl: 1, xp: 0, ap: 0, sp: 0, attr: { mig: 0, fin: 0, vig: 0, wil: 0 }, skills: {}, asc: { pow: 0, vit: 0, swi: 0, fort: 0 }, sigils: 0,
    hp: 100, foc: 50, blood: 60, humanity: 100, exposure: 0, gold: 20, inv: [], eq: { weapon: null, ranged: null, armor: null, ring: null, amulet: null }, cons: { draught: 2, burger: 1 }, bar: [null, null, null, null],
    quests: {}, done: {}, bounties: [], bountyDay: 0, flags: {}, diary: [], day: 1, clock: 16.5, weather: 'clear', area: 'world', pos: { x: -37, z: -8 }, disc: { town: 1 }, deepest: 0, runs: 0, kills: {}, stats: { kills: 0, feeds: 0, murders: 0, deaths: 0, floors: 0, played: 0 }, opened: {}, gath: {}, look, vendors: {}, ts: 0 };
  S.eq.weapon = genItem(1, { base: 'bat', rar: 0 }); S.eq.armor = genItem(1, { base: 'jacket', rar: 0 });
}
const sk = id => S.skills[id] || 0, treePts = t => Object.keys(S.skills).reduce((n, k) => n + (SK[k].tree === t ? S.skills[k] : 0), 0);
const hasUniq = k => Object.values(S.eq).some(i => i && i.uniq === k), up = (it, v) => v * (1 + 0.08 * (it.up || 0));
function recalc() {
  const a = Object.assign({}, S.attr), st = { dmg: 0, crit: 0, critd: 0, hp: 0, st: 0, fo: 0, def: 0, ls: 0, spd: 0, as: 0, cdr: 0, xp: 0, gold: 0, mf: 0, regen: 0, vsV: 0, vsW: 0, vsS: 0, spell: 0, burn: 0, thorns: 0 };
  for (const k in S.eq) { const it = S.eq[k]; if (!it) continue; for (const f of ['def', 'hp', 'st', 'fo']) if (it[f]) st[f] += up(it, it[f]); for (const [key, v] of it.aff) { if (key in a) a[key] += v; else st[key] = (st[key] || 0) + v; } }
  const L = S.lvl, vamp = S.species === 'vampire', elder = vamp ? sk('v_elder') : 0, nightB = vamp && S.area === 'world' && isNight() ? sk('v_night') : vamp && S.area === 'tomb' ? sk('v_night') : 0, w = S.eq.weapon, wb = w && BASES[w.base], hs = vamp ? 0 : 1, witch = treeOpen('witch') ? 1 : 0;
  P.attr = a; P.maxHp = (100 + 12 * (L - 1) + a.vig * 10 + st.hp) * (1 + S.asc.vit * 0.02) * (vamp ? 1.15 : 1) * (1 + 0.06 * elder);
  P.maxSta = 100 + a.vig * 2 + st.st + sk('h_cond') * 10 + (vamp ? 20 : 0); P.maxFoc = 50 + a.wil * 4 + st.fo + witch * sk('w_attune') * 10; P.maxBlood = (100 + L) * (1 + 0.06 * elder);
  P.staRegen = 24 * (1 + 0.08 * sk('h_cond')) * (vamp ? 1.2 : 1); P.focRegen = (2.5 + a.wil * 0.08) * (1 + 0.12 * witch * sk('w_chan'));
  P.wdmg = w ? up(w, w.dmg) : (vamp ? 9 : 5) * lvlScale(L); P.wmat = w ? wb.mat : 'steel'; const ascP = 1 + S.asc.pow * 0.02;
  P.meleeM = (1 + a.mig * 0.02 + st.dmg / 100 + 0.06 * sk('h_weapon') + (vamp ? 0.1 + 0.05 * sk('v_pred') + 0.04 * nightB + 0.06 * elder : 0)) * ascP;
  P.rangedM = (1 + a.fin * 0.02 + st.dmg / 100 + 0.08 * sk('h_marks') + 0.06 * elder) * ascP;
  P.spellBase = (7 * lvlScale(L) + (wb && wb.cls === 'staff' ? up(w, w.dmg) * 0.7 : 0)) * (1 + a.wil * 0.025 + st.spell / 100 + witch * (0.08 * sk('w_attune') + (sk('w_express') ? 0.3 : 0))) * ascP;
  P.crit = 5 + a.fin * 0.4 + st.crit + (vamp ? 4 * sk('v_sense') : 0); P.spellCrit = witch * 3 * sk('w_spirit'); P.critMult = 1.6 + st.critd / 100; P.as = 1 + a.fin * 0.004 + st.as / 100 + S.asc.swi * 0.01 + (vamp ? 0.08 : 0);
  P.cdr = Math.min(0.6, st.cdr / 100 + S.asc.swi * 0.01); P.def = st.def; P.mit = Math.min(0.75, P.def / (P.def + 60 + 9 * L)); P.ls = st.ls + (vamp ? sk('v_pred') : 0);
  P.spd = (6.4 + (vamp ? 1.3 : 0)) * (1 + st.spd / 100 + 0.02 * nightB); P.reload = (1 - 0.05 * sk('h_marks')) / (1 + st.as / 200); P.parryWin = 0.2 + 0.035 * sk('h_parry');
  P.xpM = 1 + st.xp / 100; P.goldM = 1 + st.gold / 100 + S.asc.fort * 0.02; P.mf = st.mf + S.asc.fort * 2; P.regen = st.regen; P.vsV = st.vsV; P.vsW = st.vsW; P.vsS = st.vsS; P.burn = st.burn; P.thorns = st.thorns;
  P.power = Math.round((P.wdmg * P.meleeM * (1 + P.crit / 100 * (P.critMult - 1)) * P.as * 3 + P.maxHp / (1 - P.mit) * 0.25 + P.spellBase * 2) / 4);
  if (pl) { pl.hp = Math.min(pl.hp, P.maxHp); pl.sta = Math.min(pl.sta, P.maxSta); pl.foc = Math.min(pl.foc, P.maxFoc); pl.blood = Math.min(pl.blood, P.maxBlood); }
}
const title = () => { let t = TITLES[0][1]; for (const [l, n] of TITLES) if (S.lvl >= l) t = n; return t; };

/* ---------------- items ---------------- */
function genItem(lvl, o = {}) {
  lvl = Math.max(1, Math.round(lvl)); const roll = Math.random() * 100 / (1 + (P.mf || 0) / 100 + (o.bias || 0)); let rar = o.rar != null ? o.rar : roll < 0.7 ? 4 : roll < 4 ? 3 : roll < 15 ? 2 : roll < 44 ? 1 : 0;
  let base = o.base; if (!base) { const slot = o.slot || (() => { const r = Math.random(); return r < 0.3 ? 'weapon' : r < 0.42 ? 'ranged' : r < 0.66 ? 'armor' : r < 0.83 ? 'ring' : 'amulet'; })(); const pool = Object.keys(BASES).filter(k => BASES[k].slot === slot && (BASES[k].min || 1) <= lvl + 1); base = pick(pool); }
  const b = BASES[base], m = RAR[rar].m * R(0.95, 1.06), it = { id: UID++, base, slot: b.slot, rar, lvl, up: 0, aff: [] };
  if (b.dmg) it.dmg = b.dmg * lvlScale(lvl) * m; if (b.def) it.def = b.def * (1 + 0.13 * (lvl - 1)) * m; if (b.hp) it.hp = b.hp * (1 + 0.2 * (lvl - 1)) * m; if (b.st) it.st = b.st * (1 + 0.04 * lvl); if (b.fo) it.fo = b.fo * (1 + 0.05 * lvl);
  const pool = AFF.filter(a => a[5].split(' ').includes(b.slot)); let n = RAR[rar].aff + (b.slot === 'ring' || b.slot === 'amulet' ? (rar === 0 ? 1 : 0) : 0);
  while (n-- > 0 && pool.length) { const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; let v = R(a[2], a[3]) + a[4] * lvl; v = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10; it.aff.push([a[0], v]); }
  it.name = itemGenName(it); return it;
}
function itemGenName(it) { const b = BASES[it.base]; let pre = '', suf = ''; for (const [k] of it.aff) { const lab = AFF.find(a => a[0] === k)[1]; if (lab.startsWith('of ')) { if (!suf) suf = ' ' + lab; } else if (!pre) pre = lab + ' '; } return pre + b.n + suf; }
function mkUniq(key, lvl) { const u = UNIQ[key], b = BASES[u.base], it = { id: UID++, base: u.base, slot: b.slot, rar: 5, lvl, up: 0, uniq: key, name: u.n, aff: u.aff.map(a => [a[0], a[1] + (['hp', 'def'].includes(a[0]) ? lvl * 2 : 0)]) }, m = RAR[5].m * (u.mult || 1);
  if (b.dmg) it.dmg = b.dmg * lvlScale(lvl) * m; if (b.def) it.def = b.def * (1 + 0.13 * (lvl - 1)) * m; if (b.hp) it.hp = b.hp * (1 + 0.2 * (lvl - 1)) * m; return it; }
const itemValue = it => Math.round((6 + it.lvl * 3.2) * Math.pow(1.75, Math.min(it.rar, 5)) * (1 + 0.15 * (it.up || 0)));
function itemLines(it) { const b = BASES[it.base], l = []; if (it.dmg) l.push(`${Math.round(up(it, it.dmg))} damage` + (b.slot === 'weapon' ? ` · ${b.cls === 'fast' ? 'fast' : b.cls === 'med' ? 'balanced' : b.cls === 'slow' ? 'heavy' : 'casts bolts'} · ${b.mat}` : ` · ${b.mat} · ${b.cd}s reload`));
  if (it.def) l.push(`${Math.round(up(it, it.def))} armour`); if (it.hp) l.push(`+${Math.round(up(it, it.hp))} health`); if (it.st) l.push(`+${Math.round(up(it, it.st))} stamina`); if (it.fo) l.push(`+${Math.round(up(it, it.fo))} focus`);
  for (const [k, v] of it.aff) if (v) l.push(AFFD[k].replace('{v}', v)); if (it.uniq) l.push(UNIQ[it.uniq].d); return l; }
function addItem(it, quiet) { if (S.inv.length >= 60) { toast('Your pack is full.'); return false; } S.inv.push(it); if (!quiet) lootToast(it.name + (it.up ? ' +' + it.up : ''), RAR[it.rar].c); sfx(it.rar >= 3 ? 'rare' : 'loot'); return true; }
function addCons(k, n = 1, quiet) { S.cons[k] = (S.cons[k] || 0) + n; if (!quiet) lootToast(CONS[k].n + (n > 1 ? ' ×' + n : ''), '#d8d0c0'); }
function equip(it) { const i = S.inv.indexOf(it); if (i < 0) return; if (it.lvl > S.lvl + 3) { toast(`You need to be level ${it.lvl - 3} to use that.`); sfx('deny'); return; } S.inv.splice(i, 1); const old = S.eq[it.slot]; if (old) S.inv.push(old); S.eq[it.slot] = it; recalc(); refreshGear(); sfx('ui'); }
function unequip(slot) { const it = S.eq[slot]; if (!it || S.inv.length >= 60) return; S.eq[slot] = null; S.inv.push(it); recalc(); refreshGear(); sfx('ui'); }
function salvage(it) { const i = S.inv.indexOf(it); if (i < 0) return; S.inv.splice(i, 1); const n = 1 + it.rar * 2 + Math.floor(it.lvl / 8); addCons('scrap', n, true); toast(`Salvaged for ${n} scrap.`); sfx('ui'); }
const upCost = it => ({ gold: Math.round(18 * it.lvl * Math.pow((it.up || 0) + 1, 1.5)), scrap: 2 + (it.up || 0) * 2 });
function upgrade(it) { const c = upCost(it); if ((it.up || 0) >= 10) return toast('It cannot be improved further.'); if (S.gold < c.gold || (S.cons.scrap || 0) < c.scrap) { sfx('deny'); return toast('Not enough gold or scrap.'); } S.gold -= c.gold; S.cons.scrap -= c.scrap; it.up = (it.up || 0) + 1; recalc(); sfx('parry'); toast(`${it.name} is now +${it.up}.`); }
function useCons(k) {
  if (!(S.cons[k] > 0) || !pl || pl.dead) return false; const vamp = S.species === 'vampire', herb = 1 + 0.15 * (treeOpen('witch') ? sk('w_herb') : 0);
  switch (k) {
    case 'draught': if (pl.hp >= P.maxHp || pl.healCd > 0) return false; heal(P.maxHp * 0.4 * herb); pl.healCd = 6; sfx('heal'); break;
    case 'tonic': if (pl.foc >= P.maxFoc) return false; pl.foc = Math.min(P.maxFoc, pl.foc + P.maxFoc * 0.6 * herb); sfx('heal'); break;
    case 'bloodbag': if (!vamp) { toast('You could not stomach that. Not yet.'); return false; } pl.blood = Math.min(P.maxBlood, pl.blood + 50); heal(P.maxHp * 0.25); pl.healCd = 4; sfx('bite'); break;
    case 'burger': if (vamp) { toast('It tastes like ash now.'); return false; } pl.buff.burger = 60; sfx('ui'); toast('Marnie makes a good burger.'); break;
    case 'vervain': if (vamp) { pl.hp -= P.maxHp * 0.1; pl.fx.verv = 6; toast('It burns your hand to the bone.'); sfx('hurt'); break; } pl.buff.coatV = 90; sfx('magic'); toast('Your weapon is slick with vervain.'); break;
    case 'wolfsbane': pl.buff.coatW = 90; sfx('magic'); toast('Your weapon is dusted with wolfsbane.'); break;
    case 'sage': pl.buff.sage = 10 * herb; pl.fx.burn = pl.fx.bleed = pl.fx.slow = pl.fx.verv = 0; sfx('heal'); break;
    case 'vblood': if (vamp) return false; heal(P.maxHp); S.flags.vblood = 1; S.flags.vbloodT = 300; sfx('bite'); toast('It heals everything. For the next few minutes, dying would not be the end.'); diary('vblood'); break;
    case 'cure': if (!vamp) { toast('You are already human.'); return false; } S.cons[k]--; cureVampire(); return true;
    default: return false;
  } S.cons[k]--; return true;
}
function quickHeal() { const vamp = S.species === 'vampire'; if (vamp && S.cons.bloodbag > 0 && (pl.blood < P.maxBlood * 0.5 || !(S.cons.draught > 0))) { if (useCons('bloodbag')) return; } if (!useCons('draught')) { if (!(S.cons.draught > 0)) toast('No healing draughts left.'); sfx('deny'); } }

/* ---------------- loot on the ground ---------------- */
function mkDrop(x, z, kind, v, col) {
  const g = new T.Group(), m = shadowed(model(kind === 'gold' ? 'coin' : kind === 'cons' ? 'vial' : 'lootbag'), false); m.scale.setScalar(kind === 'gold' ? 1.3 : 1.5); g.add(m);
  const ring = new T.Mesh(new T.CircleGeometry(0.9, 16).rotateX(-PI / 2), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false })); ring.position.y = 0.06; g.add(ring);
  if (kind === 'item' && v.rar >= 2) { const beam = new T.Mesh(new T.CylinderGeometry(0.08, 0.16, 7, 6, 1, true), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })); beam.position.y = 3.5; g.add(beam); }
  const a = R(0, TAU), d = R(0.4, 1.6), p = { x: x + Math.sin(a) * d, z: z + Math.cos(a) * d, r: 0.3 }; collide(p); g.position.set(p.x, 0, p.z); areaAdd(g); drops.push({ x: p.x, z: p.z, kind, v, g, m, t: 0 });
}
function dropLoot(x, z, lvl, o = {}) {
  if (o.gold) mkDrop(x, z, 'gold', Math.max(1, Math.round(o.gold * R(0.7, 1.3) * P.goldM)), 0xffd060);
  for (let i = 0; i < (o.n || 1); i++) if (chance(o.chance == null ? 1 : o.chance)) { const it = genItem(lvl + (o.boss ? 1 : 0), { bias: (o.bias || 0) + (i === 0 && o.boss ? 3 : 0), rar: i === 0 && o.boss ? Math.max(2, RI(2, 3)) : undefined }); mkDrop(x, z, 'item', it, new T.Color(RAR[it.rar].c).getHex()); }
  if (chance(o.boss ? 1 : 0.16)) { const vamp = S.species === 'vampire', k = chance(0.5) ? 'draught' : vamp && o.fam !== 'spirit' ? 'bloodbag' : pick(['tonic', 'vervain', 'wolfsbane', 'sage', 'scrap', 'scrap']); mkDrop(x, z, 'cons', [k, k === 'scrap' ? RI(1, 3) : 1], 0xd8d0c0); }
}
function updDrops(dt) {
  for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.t += dt; d.m.position.y = 0.25 + Math.sin(d.t * 3) * 0.1; d.m.rotation.y += dt * 1.5; const dist = hyp(d.x - pl.x, d.z - pl.z);
    if (dist < 3.2 && d.t > 0.4 && !pl.dead) { const a = Math.atan2(pl.x - d.x, pl.z - d.z); d.x += Math.sin(a) * dt * 9; d.z += Math.cos(a) * dt * 9; d.g.position.set(d.x, 0, d.z); }
    if (dist < 1.1 && d.t > 0.4 && !pl.dead) { let ok = true; if (d.kind === 'gold') { S.gold += d.v; sfx('coin'); floatText(pl.x, 2.4, pl.z, '+' + d.v + ' gold', '#ffd060', 13); } else if (d.kind === 'cons') { addCons(d.v[0], d.v[1]); sfx('loot'); } else ok = addItem(d.v); if (ok) { d.g.parent && d.g.parent.remove(d.g); drops.splice(i, 1); } else d.t = -3; } }
}

/* ---------------- levelling ---------------- */
function gainXp(n) {
  S.xp += n * P.xpM; let up_ = false; while (S.xp >= xpNeed(S.lvl)) { S.xp -= xpNeed(S.lvl); S.lvl++; S.ap += 3; S.sp += 1; up_ = true; }
  if (up_) { recalc(); pl.hp = P.maxHp; pl.sta = P.maxSta; pl.foc = P.maxFoc; sfx('level'); banner('LEVEL ' + S.lvl, title() + ' · 3 attribute points, 1 skill point'); ringFx(pl.x, pl.z, 0xffd070, 8, 0.9); puff(pl.x, 1, pl.z, 40, { c: HOLY, add: 1, sp: 3, up: 5, life: 1, size: 0.25, grav: 2 }); RT.flashV = 0.2; qEvent('level', S.lvl); }
}
function learn(id) { const d = SK[id], r = sk(id); if (S.sp < 1 || r >= d.max || treePts(d.tree) < d.req || !treeOpen(d.tree)) { sfx('deny'); return; } S.sp--; S.skills[id] = r + 1; if (d.act && r === 0) { const i = S.bar.indexOf(null); if (i >= 0 && !S.bar.includes(id)) S.bar[i] = id; } recalc(); sfx('quest'); }
function refundTree(t) { let n = 0; for (const k in S.skills) if (SK[k].tree === t) { n += S.skills[k]; delete S.skills[k]; } S.bar = S.bar.map(b => b && SK[b].tree === t ? null : b); S.sp += n; return n; }

/* ---------------- becoming something else ---------------- */
function blackout(lines, fn, hold = 2600) { if (RT.menu) closeMenu(); RT.blk = true; const b = $('black'); b.innerHTML = ''; lines.forEach(l => b.appendChild(el('p', '', l))); b.classList.add('on'); setTimeout(() => { fn && fn(); b.classList.remove('on'); RT.blk = false; }, hold + lines.length * 900); }
function turnVampire(how) {
  sfx('turn'); blackout(how === 'ambrose' ? ['His wrist against your mouth. Copper and old wine.', 'Then his hands, either side of your jaw.', 'You wake after dark with a heartbeat in your ears that is not yours.'] : ['The blood in your veins will not let you stay dead.', 'It is quiet for a while.', 'You wake after dark with a heartbeat in your ears that is not yours.'], () => {
    S.species = 'vampire'; S.flags.vblood = 0; S.flags.turned = S.day; const back = refundTree('witch'); S.sp += 2; if (S.clock < 20.5 && S.clock >= 6) S.clock = 20.6; S.exposure = 0;
    if (S.area !== 'world') enterArea('world', { x: -37, z: -8 }); pl.dead = false; pl.deadT = 0; recalc(); pl.hp = P.maxHp; pl.blood = 35; refreshGear(); diary('turned'); qEvent('turned');
    toast('You are a vampire. Feed. Until a witch makes you a daylight ring, the sun will burn you.'); if (back) setTimeout(() => toast(`The magic has left you. ${back} skill points returned.`), 5200); setTimeout(() => toast('The Vampire skill tree is open. Sleep through the day at the boarding house.'), 10400); save();
  });
}
function cureVampire() { blackout(['It tastes of nothing at all.', 'Then everything hurts, the ordinary way.', 'The sun comes through the window and you let it.'], () => { S.species = 'human'; S.heretic = false; const back = refundTree('vampire'); S.humanity = 100; S.exposure = 0; recalc(); pl.hp = P.maxHp; refreshGear(); diary('cured'); toast(`You are human again. ${back} skill points returned.`); save(); }); }

/* ---------------- quests ---------------- */
function startQuest(id) { if (S.quests[id] || S.done[id] || !QUESTS[id]) return; S.quests[id] = { step: 0, n: 0 }; sfx('quest'); banner(QUESTS[id].n, 'New quest'); const s = QUESTS[id].steps[0]; if (s.on) s.on(); checkHave(); }
function advQuest(id) {
  const q = QUESTS[id], st = S.quests[id]; st.step++; st.n = 0;
  if (st.step >= q.steps.length) { delete S.quests[id]; S.done[id] = 1; const r = q.rew || {}; if (r.xp) gainXp(r.xp * (1 + S.lvl * 0.12)); if (r.gold) { S.gold += r.gold; } if (r.sp) S.sp += r.sp; if (r.item) addItem(r.item()); if (r.cons) for (const k in r.cons) addCons(k, r.cons[k]);
    sfx('level'); banner(q.n, 'Quest complete' + (r.gold ? ` · ${r.gold} gold` : '') + (r.sp ? ` · ${r.sp} skill point${r.sp > 1 ? 's' : ''}` : '')); if (q.end) q.end(); if (q.next) [].concat(q.next).forEach(n => startQuest(n)); save(); }
  else { sfx('quest'); const s = q.steps[st.step]; toast('Quest updated: ' + s.d); if (s.on) s.on(); checkHave(); }
}
function qEvent(type, a, b) {
  for (const id in S.quests) { const st = S.quests[id], s = QUESTS[id].steps[st.step]; if (!s || s.t !== type) continue; let ok = false;
    if (type === 'kill') ok = (!s.type || [].concat(s.type).includes(a.type)) && (!s.fam || s.fam === a.fam) && (!s.tag || s.tag === a.tag) && (!s.night || isNight()) && (!s.zone || zoneAt(a.x, a.z).id === s.zone) && (!s.tomb || RT.area.id === 'tomb');
    else if (type === 'talk' || type === 'reach' || type === 'flag') ok = s.id === a; else if (type === 'gather') { if (s.item === a) { st.n += (b || 1) - 1; ok = true; } } else if (type === 'floor') { if (a >= s.n) { st.n = s.n; ok = true; } else continue; } else if (type === 'level') { if (a >= s.n) { st.n = s.n; ok = true; } else continue; } else ok = true;
    if (ok) { st.n++; if (st.n >= (type === 'floor' || type === 'level' ? s.n : s.n || 1)) advQuest(id); } }
  for (const bq of S.bounties) { if (!bq.acc || bq.done) continue; if (type === 'kill' && ((bq.k === 'kill' && a.type === bq.type) || (bq.k === 'elite' && a.tag === bq.id))) { bq.prog++; if (bq.prog >= bq.n) { bq.done = true; toast('Bounty fulfilled. Collect at the board.'); sfx('quest'); } } else if (type === 'floor' && bq.k === 'floor' && a >= bq.n) { bq.prog = bq.n; bq.done = true; toast('Bounty fulfilled. Collect at the board.'); } }
  storyEvent(type, a, b);
}
function checkHave() { for (const id in S.quests) { const st = S.quests[id], s = QUESTS[id].steps[st.step]; if (s && s.t === 'have' && (S.cons[s.item] || 0) >= (s.n || 1)) advQuest(id); } }
const qAt = (id, step) => S.quests[id] && (step == null || S.quests[id].step === step);
function qTarget(s) { if (s.at) return s.at; if (s.t === 'talk') { const n = NPCS.find(n => n.id === s.id); if (n) { const act = actors.find(a => a.npc && a.npc.id === s.id); return act ? act : { x: n.x, z: n.z }; } } if (s.t === 'reach') { const p = POI.find(p => p.id === s.id); if (p) return p; } return null; }
function genBounties() {
  if (S.bountyDay === S.day && S.bounties.length) return; S.bountyDay = S.day; S.bounties = S.bounties.filter(b => b.acc && !b.paid); const L = S.lvl;
  const zs = ZONES.filter(z => !z.safe && z.night && z.lvl <= L + 6); let guard = 0;
  while (S.bounties.length < 4 && guard++ < 30) { const k = chance(0.5) ? 'kill' : chance(0.6) ? 'elite' : 'floor', z = pick(zs), type = pick((z.night || []).concat(z.day || []).filter(t => !EN[t].peaceful)), id = 'b' + S.day + '_' + guard, lv = Math.max(z.lvl, Math.round(L * 0.9));
    if (k === 'floor' && S.deepest < 1 && !S.done.q_tomb) continue; const n = k === 'kill' ? RI(5, 9) : k === 'floor' ? S.deepest + RI(1, 2) : 1, mult = k === 'kill' ? 1 : k === 'elite' ? 1.6 : 1.4;
    S.bounties.push({ id, k, type, zone: z.id, zn: z.n, n, prog: 0, acc: false, done: false, lvl: lv, gold: Math.round((24 + L * 11) * mult), xp: Math.round(xpNeed(L) * 0.14 * mult),
      text: k === 'kill' ? `Put down ${n} ${EN[type].n}s. They have been seen around ${z.n}.` : k === 'elite' ? `Something worse than usual is loose at ${z.n}. End it.` : `The Council wants eyes on floor ${n} of the Tomb. Clear it.`, title: k === 'kill' ? `Cull: ${EN[type].n}` : k === 'elite' ? `Hunt at ${z.n}` : `Survey: floor ${n}` }); }
}
function acceptBounty(b) { b.acc = true; sfx('quest'); if (b.k === 'elite') b.spawn = true; toast('Bounty accepted: ' + b.title); }
function payBounty(b) { b.paid = true; S.gold += b.gold; gainXp(b.xp); sfx('coin'); if (b.k !== 'kill') dropLoot(pl.x, pl.z, S.lvl, { n: 1, bias: 1 }); S.bounties = S.bounties.filter(x => x !== b); toast(`Bounty paid: ${b.gold} gold.`); S.flags.bounties = (S.flags.bounties || 0) + 1; }

/* ---------------- vendors ---------------- */
const VEND = { odette: { n: 'Thorne Apothecary', cons: ['draught', 'tonic', 'sage', 'vervain', 'wolfsbane'], slots: ['weapon:staff', 'armor:robe', 'amulet', 'ring', 'amulet'] }, hale: { n: 'Council Armoury', cons: ['draught', 'vervain'], slots: ['weapon', 'weapon', 'weapon', 'ranged', 'ranged', 'armor', 'armor'], forge: 1, hunter: 1 },
  marnie: { n: 'The Mystic Grill', cons: ['burger', 'draught'], slots: [] }, gault: { n: "Gault's Cellar", cons: ['bloodbag', 'draught'], slots: ['weapon:sword', 'ring', 'ring', 'amulet', 'armor:coat'] }, bex: { n: "Quartermaster's Tent", cons: ['draught', 'vervain', 'wolfsbane'], slots: ['ranged', 'ranged', 'weapon:stake', 'weapon:silverd', 'armor:vest', 'ring'], forge: 1, hunter: 1 },
  wren: { n: "Wren's Shelf", cons: ['sage', 'wolfsbane', 'tonic'], slots: ['amulet', 'amulet', 'weapon:staff', 'ring'] } };
function vendorStock(id) { let v = S.vendors[id]; if (!v || v.day !== S.day) { const d = VEND[id]; v = S.vendors[id] = { day: S.day, items: d.slots.map(s => { const [slot, base] = s.split(':'); return genItem(Math.max(1, S.lvl + RI(-1, 1)), { slot, base: base && (BASES[base].min || 1) <= S.lvl + 2 ? base : undefined, bias: 0.6 }); }) }; } return v; }
const buyPrice = it => Math.round(itemValue(it) * 2.4), sellPrice = it => Math.round(itemValue(it) * 0.35);

/* ---------------- areas ---------------- */
function clearDynamic() { for (const a of actors.slice()) removeActor(a); actors.length = 0; for (const p of shots) p.m.parent && p.m.parent.remove(p.m); shots.length = 0; zonesFx.length = 0; for (const d of decals) d.kill = 1; updDecals(0); for (const d of drops) d.g.parent && d.g.parent.remove(d.g); drops.length = 0; RT.boss = null; hideBoss(); }
function enterArea(id, o = {}) {
  clearDynamic(); if (RT.area) { scene.remove(RT.area.group); if (RT.area.id === 'tomb') disposeArea(RT.area); }
  if (id === 'world') { if (!WORLD) WORLD = buildWorld(); RT.area = WORLD; refreshWorld(); } else RT.area = genTomb(o.depth);
  scene.add(RT.area.group); S.area = id; S.depth = o.depth || 0; const a = RT.area; pl.x = o.x != null ? o.x : a.start.x; pl.z = o.z != null ? o.z : a.start.z + (a.boss ? 4.5 : 1.5); pl.kx = pl.kz = 0; pl.act = null; pl.feed = null; collide(pl);
  if (id === 'world') spawnWorldNpcs(); else { const m = a.mod; for (const s of a.spawns) { const e = spawnEnemy(s.type, s.x, s.z, a.lvl + (s.boss ? 1 : 0), { elite: s.elite }); collide(e); if (m && m.hp) { e.maxHp *= m.hp; e.hp = e.maxHp; } if (m && m.dmg) e.dmgM *= m.dmg; if (m && m.xp) e.xp *= m.xp; } banner(a.boss ? 'Floor ' + a.depth + ': a keeper waits' : 'The Tomb · Floor ' + a.depth, (m ? m.n + ' · ' : '') + 'Enemy level ' + a.lvl); if (m) setTimeout(() => toast(m.n + ': ' + m.d), 1200); }
  RT.zone = null; recalc(); updCam(0, true); updChunks();
}
function tombMenu() {
  const opts = [['Floor 1', () => goTomb(1)]]; for (let f = 6; f <= S.deepest + 1; f += 5) opts.push([`Floor ${f} (past the keeper of floor ${f - 1})`, () => goTomb(f)]); while (opts.length > 5) opts.splice(1, 1);
  say([['The Tomb', `Stairs go down into the dark under Fell Chapel. ${S.deepest ? 'Deepest floor cleared: ' + S.deepest + '.' : 'The air coming up is cold and smells of iron.'}`]], opts.concat([['Not yet.', () => { }]]));
}
function goTomb(d) { S.runs++; blackout(['Down.'], () => { enterArea('tomb', { depth: d }); save(); }, 500); }
function clearFloor() { const a = RT.area; a.cleared = true; sfx('quest'); toast(a.boss ? 'The keeper is dead. The seal breaks.' : 'Enough have fallen. The seal breaks.'); ringFx(a.exit.x, a.exit.z + 2, 0x8a6cff, 8, 1); if (a.boss && a.chests) { const c = a.chests[0]; c.rig.g.visible = true; } }
function descend() {
  const a = RT.area, d = a.depth, first = d > S.deepest, sig = d * (a.boss ? 3 : 1) + (first ? d : 0); S.sigils += sig; S.stats.floors++; S.deepest = Math.max(S.deepest, d); qEvent('floor', d); toast(`+${sig} sigils${first ? ' (first descent)' : ''}.`);
  blackout(['Deeper.'], () => { enterArea('tomb', { depth: d + 1 }); save(); }, 400);
}
function leaveTomb() { blackout(['Up, into the air.'], () => { enterArea('world', { x: -130, z: -164 }); save(); }, 400); }
function fastTravel(p) { if (RT.combatT > 0) { sfx('deny'); return toast('Not while something is hunting you.'); } closeMenu(); blackout([p.n + '.'], () => { S.clock += 0.5; enterArea('world', { x: p.x + 1.5, z: p.z + 2 }); save(); }, 300); }
function sleepUntil(h) { blackout([h < 12 ? 'You sleep. Morning comes.' : 'You sleep through the day.'], () => { if (S.clock >= h) newDay(); S.clock = h; pl.hp = P.maxHp; pl.foc = P.maxFoc; pl.sta = P.maxSta; if (S.species === 'vampire') pl.blood = Math.max(0, pl.blood - 8); S.exposure = Math.max(0, S.exposure - 20); enterArea('world', { x: -37, z: -8 }); save(); toast('Rested.'); }, 900); }
function newDay() { S.day++; refreshWorld(); genBounties(); if (S.flags.vbloodT) S.flags.vbloodT = 0; }
function tickClock(dt) { S.clock += dt / 60; S.stats.played += dt; if (S.clock >= 24) { S.clock -= 24; newDay(); toast(`Day ${S.day}. ${MOON[moonPhase()]}.`); } if (S.flags.vbloodT > 0) { S.flags.vbloodT -= dt; if (S.flags.vbloodT <= 0) { S.flags.vblood = 0; toast('The vampire blood has left your system.'); } } }
function playerDeath(src) {
  if (pl.dead) return; if (S.species === 'human' && S.flags.vblood) { pl.dead = true; pl.hp = 1; return turnVampire('blood'); }
  pl.dead = true; pl.hp = 0; pl.act = null; pl.sw = null; pl.block = false; if (pl.feed) endFeed(true); S.stats.deaths++; sfx('die'); const lost = Math.floor(S.gold * 0.1); S.gold -= lost; RT.shake = 0.8;
  setTimeout(() => { const vamp = S.species === 'vampire'; $('deathtxt').textContent = src === 'sun' ? 'The sun found you. What is left of you is carried home in a coat.' : vamp ? 'Oak, a breath from the heart. You wake at home with the splinters working their way out.' : 'Somebody drags you back to the boarding house. Mrs. Pruitt does not ask questions.'; $('deathsub').textContent = lost ? `You lost ${lost} gold.` : ''; $('death').hidden = false; RT.paused = true; }, 1400);
}
function respawn() { $('death').hidden = true; const vamp = S.species === 'vampire', h = vamp ? 20.6 : 8; if (S.clock >= h || (vamp && S.clock < 6)) { if (!(vamp && S.clock < 6)) newDay(); } if (!(vamp && (S.clock >= 20.6 || S.clock < 5))) S.clock = h; pl.dead = false; pl.deadT = 0; pl.fx = {}; pl.rig.g.rotation.set(0, 0, 0); recalc(); pl.hp = P.maxHp; pl.sta = P.maxSta; if (vamp) pl.blood = Math.max(pl.blood, 30); S.exposure = Math.max(0, S.exposure - 25); enterArea('world', { x: -37, z: -8 }); RT.paused = false; save(); }

/* ---------------- saving: this browser, plus the artifact's per-person cloud store when there is one ---------------- */
let cloud = null, cloudT = 0;
function snapshot() { if (pl) { S.hp = pl.hp; S.foc = pl.foc; S.blood = pl.blood; if (S.area === 'world') S.pos = { x: pl.x, z: pl.z }; } S.ts = Date.now(); S.uid = UID; return JSON.stringify(S); }
function save(forceCloud) { if (!S || !pl || pl.dead) return; const j = snapshot(); try { localStorage.setItem('hollowmoon.save', j); } catch (e) { } if (cloud && (forceCloud || Date.now() - cloudT > 45000)) { cloudT = Date.now(); cloud.set({ json: j, ts: S.ts }).catch(() => { }); } }
function readLocal() { try { const j = localStorage.getItem('hollowmoon.save'); return j ? JSON.parse(j) : null; } catch (e) { return null; } }
function applySave(o) { if (!o || o.v !== 2) return false; S = o; UID = (o.uid || 1) + 1000; S.flags = S.flags || {}; S.asc = Object.assign({ pow: 0, vit: 0, swi: 0, fort: 0 }, S.asc); return true; }
async function initCloud(onNewer) { try { if (!window.claude || !window.claude.use) return; const db = await window.claude.use('db'), user = await window.claude.use('user'); if (!db || !user) return; const id = await user.id(); if (!id) return; cloud = db.doc('data/users/' + id + '/save'); const snap = await cloud.get(); if (snap && snap.exists) { const d = snap.data(); if (d && d.json) onNewer(JSON.parse(d.json)); } } catch (e) { cloud = null; } }
function exportSave() { return btoa(unescape(encodeURIComponent(snapshot()))); }
function importSave(txt) { try { const o = JSON.parse(decodeURIComponent(escape(atob(txt.trim())))); if (o.v !== 2) throw 0; localStorage.setItem('hollowmoon.save', JSON.stringify(o)); return true; } catch (e) { return false; } }
/* Hollow Moon — story: people, dialogue, quests, the diary, world events. */
const DIARY = {
  arrive: "Aunt Elspeth left me a room at the Pruitt boarding house, a box of letters I have not opened, and a town I had never seen. Mystic Falls. It is pretty the way a held breath is pretty. Everyone here drinks the same bitter coffee and nobody walks home alone.",
  ferals: "It had been the delivery boy. It was wearing his jacket. It came at me across the graves on all fours and I hit it until it stopped, and then it went grey and fell apart like a burnt log. I am writing this with both hands.",
  hale: "Vampires. Captain Hale said the word the way other people say 'weather'. The Founders' Council has kept it quiet since 1864, and I am a Fell, so apparently it is my inheritance. He gave me a stake and a crossbow and told me to count.",
  witch: "Odette Thorne put her hands over mine and it felt like remembering my own name. The candle on her counter lit itself. She says the craft runs in the Fell line and that it dies if I do, even if I get back up afterwards.",
  ambrose: "Ambrose Varga has stood on Wickery Bridge since 1863. He knew my jaw. He offered to kill me, kindly, and make me into what he is, because something under Fell Chapel is waking and he does not think a living person can stop it. The offer stands, he says. It always will.",
  vblood: "I drank it. It tasted like a coin held under the tongue. Every bruise I own closed up. For a few minutes, dying would not be the end of me. I could just stay careful and let it pass.",
  turned: "I died tonight. I know because there is a heartbeat in my ears and it is not mine; it belongs to the woman two rooms down. I am faster than I can think. I am so hungry. The sun comes up in a few hours and I understand, now, why that is a threat.",
  murder: "I did not let go. I felt the heart stutter and I kept going, and now there is one less person in Mystic Falls and I am the reason. I am writing it down so I can never pretend I did not notice.",
  tomb: "There are stairs under the chapel altar and they go down a long way. The founders did not build this. They found it, and built a church on top, and hoped.",
  warden: "The Warden was not keeping the dead in. He was a jailer. Nine floors of locks, and one prisoner below.",
  corvin: "Corvin, first of the line. He was polite. He asked what year it was and laughed at the answer. I have his blood in a jar and three people who want it, and I can feel it humming through the glass.",
  daylight: "Odette tied the sun into a stone and the stone into a ring. I stood in the square at noon and nothing happened. Children went past. I had forgotten the sun has a smell: cut grass, warm brick.",
  cured: "I took the Cure. I am cold and tired and my knee hurts where I fell on it when I was nine. I had forgotten that knee. I cried in the square like an idiot.",
  heretic: "The hundred let me through. I am dead and the craft still answers. There is not supposed to be a word for that, but there is, and it is not a kind one.",
  alpha: "Old Tobias went down under the full moon and for a second, at the end, he was just an old man by a waterfall, looking surprised. The pack will choose another. They always do.",
  matriarch: "A hundred witches burned in one night and never stopped screaming. They are quiet now. The stones at the Hollow have gone cold.",
  deeper: "There is always another floor. I have stopped expecting a bottom. I have started wondering what is counting how far I get.",
};
function diary(k) { if (S.flags['d_' + k] || !DIARY[k]) return; S.flags['d_' + k] = 1; S.diary.push({ t: `Day ${S.day}, ${fmtClock(S.clock)}`, x: DIARY[k] }); toast('The diary has a new page.'); }
const RUMOURS = ['Wood ends a vampire faster than steel. Silver is for wolves. Neither does much to a spirit; you want magic for those.', 'Block at the last instant and you turn the blow aside. They stagger. Hit them while they do.', 'Hold your attack and you commit to a heavy blow. It breaks a guard. It also empties your lungs.', 'Chests around the county fill up again after three days. I do not ask who fills them.', 'On a full moon, stay out of the woods by the Falls. Or do not, if you want a fur coat.',
  'The stairs under Fell Chapel never end, they say. The sigils you bring back up can be spent in your journal. They make you more.', 'Vervain grows in the north woods. Rub it on a blade. If you are one of them, do not touch it.', 'A signpost with a lantern will take you to any other you have found. Saves on boots.', 'Hale will reforge anything for gold and scrap. Break down what you do not need.', 'Something lives in the old quarry. It has children.', 'Sleep at Pruitt\'s. If you have gone pale lately, sleep through the day.'];
const hasCons = k => (S.cons[k] || 0) > 0, shop = id => ['Trade.', () => openVendor(id)], bye = ['Leave.', () => { }];
const NPCS = [
  { id: 'marnie', n: 'Marnie', x: 0, z: -30, rot: 0, look: { cloth: 0x8a4a3a, hair: 0x8a2f1a, long: 1 }, talk() { const M = 'Marnie';
    if (qAt('q_arrive', 0)) return say([[M, "You are Elspeth's. Niece, nephew, whichever. You have her jaw."], [M, "She said you would come when the letters stopped. There is a room at Pruitt's, paid through the winter. West side of the square."], [M, 'You want work? Take this next door to Odette Thorne. Do not open it, do not sniff it, and do not let her read your palm.']], null, () => qEvent('talk', 'marnie'));
    if (qAt('q_arrive', 2)) return say([[M, 'She took it? Good. Here, eat something. You look like a ghost.'], [M, 'One more thing. My delivery boy went up the cemetery road last night and did not come back. If you are out after dark... no. Never mind.'], [M, '...Fine. If you are out after dark, look. West road, through the iron gate. But you stay on the path.']], null, () => qEvent('talk', 'marnie'));
    say([[M, pick(["Burger's good. Coffee's better than it used to be. Hale had us start putting something in it.", 'You look less like a ghost. Or more. Hard to say with you.', 'Board by the door has work on it, if you have the stomach.'])]], [shop('marnie'), ['Heard anything?', () => say([[M, pick(RUMOURS)]])], ['The notice board.', () => openMenu('bounty')], bye]); } },
  { id: 'odette', n: 'Odette Thorne', x: -20, z: -30, rot: 0, look: { cloth: 0x4f2f72, hair: 0x0c0808, skin: 0x7a5236, pants: 0x1a1020, long: 1, coat: 1 }, talk() { const O = 'Odette Thorne', vamp = S.species === 'vampire';
    if (qAt('q_arrive', 1)) return say([[O, 'From Marnie. Set it down.'], [O, "You are a Fell on your mother's side. It is in how you stand in a doorway, as if you were asking the house."], [O, 'Come back when the town has introduced itself to you. It will. It does that at night.']], null, () => qEvent('talk', 'odette'));
    if (qAt('q_witch', 0)) return say([[O, 'You saw one. Do not tell me what; I can smell the grave on your boots.'], [O, "Your aunt and I had an understanding. She kept this town's worst secret, and I kept her alive past seventy. I would offer you the same."], [O, 'Bring me vervain, three sprigs, and two heads of wolfsbane. Vervain grows in the woods north of town, wolfsbane by the Falls and the lake. If the plants let you pick them, you have the blood for the craft.']], null, () => qEvent('talk', 'odette'));
    if (qAt('q_witch', 3)) return say(vamp ? [[O, 'They came up easy for you. They would have. But you are dead now, and the craft does not answer the dead.'], [O, 'I cannot teach you. Not unless you find another road. Take this for the herbs.']] : [[O, 'They came up easy for you. I thought so.'], [O, 'Hold out your hands. This is going to feel like remembering something.']], null, () => { if (!vamp) { diary('witch'); addItem(genItem(Math.max(2, S.lvl), { base: 'staff', rar: 1 })); } S.flags.witch = 1; qEvent('talk', 'odette'); if (!vamp) toast('The Witch skill tree is open. A staff casts bolts instead of swinging.'); });
    if (qAt('q_daylight', 0)) return say([[O, 'So he got to you. Or you went to him.'], [O, 'I can bind the sun into lapis lazuli. The founders buried theirs with their dead. The keepers under Fell Chapel still wear it, and the chests down there sometimes hold a piece.'], [O, S.humanity < 50 ? 'I can hear what you have done. One more and I close this door for good.' : 'Bring me a stone. I will know what you do while you wear it.']], null, () => qEvent('talk', 'odette'));
    if (qAt('q_daylight', 2)) return say([[O, 'Lapis. Give me your hand. Do not flinch, you will ruin the knot.'], [O, 'It holds as long as I am alive. So be very kind to me.']], null, () => { S.cons.lapisq = 0; addItem(mkUniq('daylight', S.lvl)); diary('daylight'); qEvent('talk', 'odette'); });
    if (qAt('q_warden', 1)) return say([[O, 'The Warden. Then it is true, and the first tomb is open.'], [O, 'He was not guarding the dead from us. He was guarding us from one of them. Corvin, first of the line that made Ambrose. Tenth floor.'], [O, 'Go armed. Go soon.']], null, () => qEvent('talk', 'odette'));
    const opts = [shop('odette')]; if (qAt('q_first', 2) && hasCons('elderblood')) opts.push(["Give her Corvin's blood.", () => say([[O, 'Good. Under salt and iron, where nobody drinks it. Take this. It was my grandmother\'s, and hers.']], null, () => { S.cons.elderblood = 0; S.flags.bloodTo = 'odette'; addItem(mkUniq('grimoire', S.lvl)); qEvent('flag', 'blood'); })]);
    if (S.done.q_witch && S.lvl >= 9 && !S.quests.q_hollow && !S.done.q_hollow) opts.push(['"Is there more I can do?"', () => say([[O, 'North, past the chapel road, is a place where a hundred of us burned in one night. They never left, and they have stopped being separate people.'], [O, 'Lay your hand on the altar after dark and she will come. Put her to rest.']], null, () => startQuest('q_hollow'))]);
    opts.push(bye); say([[O, vamp ? pick(['You are letting the cold in. You are the cold.', 'I still sell to you. Think about why.']) : pick(['The kettle is on. It is not for drinking.', 'Your aunt stood exactly there. Same frown.'])]], opts); } },
  { id: 'hale', n: 'Captain Hale', x: 35.5, z: 10, rot: -PI / 2, look: { cloth: 0x2a3a5c, hair: 0x6a6a6a, pants: 0x1a1c26, hat: 1, armor: 1 }, scale: 1.08, talk() { const H = 'Captain Hale', vamp = S.species === 'vampire';
    if (qAt('q_bump', 2)) return say([[H, 'Sit. No, stand. You will want to be standing.'], [H, 'What you killed up there was a person a week ago. Now it is a vampire: fast, strong, and dead by any measure that matters. Wood through the heart ends them. Fire and sunlight too.'], [H, 'Vervain burns them. Drink it, and they cannot get inside your head. That is what is in the coffee.'], [H, "The Founders' Council has kept this quiet since 1864. You are a Fell. That makes it your inheritance. Take these, and look at the board outside the Grill when you want work."]], null, () => { diary('hale'); qEvent('talk', 'hale'); });
    if (qAt('q_council', 1)) return say([[H, 'Six. You counted? I counted. Here.'], [H, "There is a man on Wickery Bridge every night. Has been since my grandfather's time. He has never crossed into town and we have never been able to make him leave."], [H, 'Go east along the road after dark and look at him. Do not get close.']], null, () => qEvent('talk', 'hale'));
    if (vamp && S.exposure >= 50) return say([[H, 'I know what you are. Walk away while I am still deciding.']]);
    const opts = [shop('hale')]; if (qAt('q_first', 2) && hasCons('elderblood')) opts.push(["Give him Corvin's blood.", () => say([[H, 'Into the furnace, with my own hands. You did right. This was cut from the last white oak in the county. I have been saving it.']], null, () => { S.cons.elderblood = 0; S.flags.bloodTo = 'hale'; addItem(mkUniq('whiteoak', S.lvl)); qEvent('flag', 'blood'); })]);
    if (S.done.q_council && S.lvl >= 10 && !S.quests.q_quarry && !S.done.q_quarry) opts.push(['"Anything bigger?"', () => say([[H, 'Blackridge Quarry, south-east. There is a nest. A matron and everything she has made. We lost four men finding that out.'], [H, 'She only comes up after dark. Bring fire.']], null, () => startQuest('q_quarry'))]);
    opts.push(bye); say([[H, vamp ? pick(['You smell different. Like the cold. ...Tell me I am wrong.', 'The first body, and it will not matter whose kin you were.']) : pick(['Keep your stakes dry.', 'You are still alive. That puts you ahead of most volunteers.'])]], opts); } },
  { id: 'pruitt', n: 'Mrs. Pruitt', x: -37.6, z: -3.5, rot: PI / 2, look: { cloth: 0x7a6a5a, hair: 0xc0b4a0, long: 1 }, talk() { const Pn = 'Mrs. Pruitt', opts = [];
    if (!S.quests.q_locket && !S.done.q_locket && S.done.q_arrive) opts.push(['"Did you know my aunt?"', () => say([[Pn, 'Forty years. They buried her with the wrong locket. Hers went into the Fell crypt by mistake in 1994, with her mother.'], [Pn, 'It is in a chest at the back of the old cemetery, behind the mausoleum, if nobody has robbed it. I would like you to have it.']], null, () => startQuest('q_locket'))]);
    if (qAt('q_locket', 1)) return say([[Pn, 'That is the one. E.F. She would want you to wear something of hers. Here, this was in her room.']], null, () => { S.cons.locket = 0; qEvent('talk', 'pruitt'); });
    opts.push(['Sleep until morning.', () => sleepUntil(8)], ['Sleep until dusk.', () => sleepUntil(20.5)], bye); say([[Pn, pick(['Breakfast is at seven. I do not care what you are after dark as long as you wipe your feet.', 'Your room is as she left it. I dusted.', 'You have her way of coming in late.'])]], opts); } },
  { id: 'ambrose', n: 'Ambrose Varga', x: 203, z: -40, rot: -PI / 2, look: { cloth: 0x6a1019, hair: 0xc9c2b0, skin: 0xeadccb, pants: 0x0c0c10, coat: 1 }, scale: 1.12, when: () => isNight() && !(S.flags.ambroseDay === S.day), talk(n) { const A = 'Ambrose', vamp = S.species === 'vampire';
    const turnOpt = ['"Do it."', () => { if (qAt('q_bridge', 1)) qEvent('talk', 'ambrose'); turnVampire('ambrose'); }];
    if (qAt('q_bridge', 1)) return say([[A, 'A Fell. I would know that jaw anywhere. I knew the first woman who wore it.'], [A, 'I am Ambrose Varga. I died in 1863, and I have stood on this bridge, on and off, ever since, waiting for one of you to be interesting.'], [A, 'Under Fell Chapel there is a door your family locked. It is opening. What lies behind it made the one who made me, and it will not be content with rabbits.'],
      [A, vamp ? 'But you are already one of us. Somebody was careless, or you were. Then go down, and see what we come from.' : 'You will not stop it as you are. Let me give you what I have. One night of dying, and then you need never fear the dark again, because you will be the thing in it.']],
      vamp ? null : [turnOpt, ['"No."', () => say([[A, 'Then take this. My blood. If you change your mind, drink it and find a way to die. That is not difficult here. The offer stands.']], null, () => { addCons('vblood', 1); diary('ambrose'); qEvent('talk', 'ambrose'); })]], vamp ? () => { diary('ambrose'); qEvent('talk', 'ambrose'); } : null);
    const opts = []; if (!vamp) opts.push(['"Turn me."', () => say([[A, 'You are certain. Good. Certainty is the only thing that makes it bearable.']], [turnOpt, ['"Not tonight."', () => { }]])]);
    if (qAt('q_first', 2) && hasCons('elderblood')) opts.push(["Give him Corvin's blood.", () => say([[A, 'A hundred and sixty years of his voice in my veins, and now I get to answer.'], [A, 'For a moment he looks thirty. Then he presses something into your hand and will not meet your eyes.']], null, () => { S.cons.elderblood = 0; S.flags.bloodTo = 'ambrose'; addItem(genItem(S.lvl + 2, { slot: 'ring', rar: 4 })); S.sp += 2; qEvent('flag', 'blood'); })]);
    if (S.lvl >= 12) opts.push(['"Fight me."', () => say([[A, vamp ? 'I wondered when you would ask. Try not to disappoint me twice.' : 'I have not been struck by the living in sixty years. Please.']], null, () => { const e = spawnEnemy('ambrose', n.x, n.z, Math.max(14, S.lvl + 1)); e.rot = n.rot; S.flags.ambroseDay = S.day; n.rig.g.visible = false; aggro(e); })]);
    opts.push(bye); say([[A, vamp ? pick(['How does it feel? No, do not tell me. I remember.', 'You feed carefully. I was the same, for a decade or so.', 'Gault keeps my cellar, at the manor. Tell him I sent you.']) : pick(['The offer stands.', 'You are getting faster. For one of the living.'])]], opts); } },
  { id: 'gault', n: 'Mr. Gault', x: 240, z: -45, rot: -PI / 2, look: { cloth: 0x1a1a1e, hair: 0x2a2a2a, pants: 0x101012, coat: 1 }, talk() { say(S.species === 'vampire' ? [['Mr. Gault', 'Master Varga keeps a cellar. Everything in it was given willingly. I checked.']] : [['Mr. Gault', 'Deliveries at the rear. No, you may not come in.']], S.species === 'vampire' ? [shop('gault'), bye] : null); } },
  { id: 'abel', n: 'Farmer Abel', x: 22, z: 206, rot: PI, look: { cloth: 0x7a6a3a, hair: 0x9a7a44, hat: 1, pants: 0x3a3020 }, talk() { const F = 'Abel';
    if (!S.quests.q_farm && !S.done.q_farm) return say([[F, 'Something has been at my herd. Comes out of the tree line after dark, takes one, and leaves the rest standing there too scared to low.'], [F, 'Wolves, mostly. Lately not only wolves. I will pay for five dead, any kind, on my land at night.']], [['"I will do it."', () => startQuest('q_farm')], bye]);
    if (qAt('q_farm', 1)) return say([[F, 'Five. I heard it from the porch. Here, and take the old silver knife. My father swore by it.']], null, () => qEvent('talk', 'abel'));
    say([[F, pick(['Deer come down to the south field at dawn. Easy meat, if you need it.', 'Rain soon. My knee says so.'])]]); } },
  { id: 'wren', n: 'Old Wren', x: -113, z: 168, rot: -PI / 2, look: { cloth: 0x4a5a3a, hair: 0xe0d8c8, long: 1, hood: 0 }, talk() { const W = 'Old Wren';
    if (!S.quests.q_wren && !S.done.q_wren) return say([[W, 'Sit by the fire. You have the look of someone who has learned something this month.'], [W, 'There is a pack at the Falls. Good people, twenty-seven nights in twenty-eight. Their alpha is Old Tobias, and he stopped trying to chain himself a long time ago.'], [W, 'On the full moon he comes down to the pool. End him, and bring me word. I will give you the stone his grandmother wore. It is wasted in my drawer.']], [['"On the full moon."', () => startQuest('q_wren')], shop('wren'), bye]);
    if (qAt('q_wren', 1)) return say([[W, 'It is done. I felt the pack go quiet. Here. Wear it under your collar.']], null, () => { addItem(mkUniq('moonstone', S.lvl)); qEvent('talk', 'wren'); });
    say([[W, pick([`The moon is ${MOON[moonPhase()].toLowerCase()}. ${fullMoon() ? 'Tonight, then.' : 'Not tonight.'}`, 'Wolfsbane by the water. Sage in the south fields. I buy both.'])]], [shop('wren'), bye]); } },
  { id: 'bex', n: 'Quartermaster Bex', x: -227, z: -66, rot: PI / 2, look: { cloth: 0x4a4230, hair: 0x1a1210, hat: 1, armor: 1, pants: 0x1c1a16 }, talk() { const B = 'Bex';
    if (S.species === 'vampire') return say([[B, S.exposure >= 30 ? 'Camp is closed to your kind. Walk.' : 'You are quiet. And cold. I am not selling you anything pointed.']]);
    if (!S.quests.q_bex && !S.done.q_bex) return say([[B, "Hale's new Fell. Everyone can swing. Show me you can wait."], [B, 'Block at the last instant, when the blow is already coming, and you turn it. Do that five times, on anything, and I will open the good crate.']], [['"Five."', () => startQuest('q_bex')], shop('bex'), bye]);
    if (qAt('q_bex', 1)) return say([[B, 'Five. I can tell from how you are standing. Take it.']], null, () => qEvent('talk', 'bex'));
    say([[B, pick(['Bolts are free. Dying is not.', 'Silver for the Falls. Oak for the graves.'])]], [shop('bex'), bye]); } },
];
const TOWNIE_BARKS = ['Evening. You are the Fell kid, right?', 'Do not stay out late.', 'Coffee at the Grill tastes like weeds lately.', 'They never did find the delivery boy.', 'My dog will not go near the cemetery road.', 'Founders\' Day is coming. They are hanging the bunting.', 'You look pale. Are you eating?', 'Lock your windows. I am just saying.'];
const QUESTS = {
  q_arrive: { n: 'New in Town', steps: [{ t: 'talk', id: 'marnie', d: 'Find Marnie at the Mystic Grill, on the north side of the square.' }, { t: 'talk', id: 'odette', d: "Carry Marnie's parcel to Odette Thorne at the apothecary next door." }, { t: 'talk', id: 'marnie', d: 'Tell Marnie it is done.' }], rew: { xp: 60, gold: 25, cons: { burger: 2 } }, next: 'q_bump' },
  q_bump: { n: 'Things That Go Bump', steps: [{ t: 'reach', id: 'cem', night: 1, d: 'After dark, look for the delivery boy at the Old Cemetery, west of town.', on() { if (!isNight()) toast('Night falls at eight. You can sleep at the boarding house, or explore until then.'); } }, { t: 'kill', fam: 'vampire', n: 2, d: 'Something is feeding among the graves. Survive it.', on() { diary('ferals'); for (let i = 0; i < 2; i++) { const e = spawnEnemy('feral', -122 - i * 5, 36 + i * 7, 1); aggro(e); } toast('They were not looking for the boy. They are what is left of him.'); } }, { t: 'talk', id: 'hale', d: 'Captain Hale wants a word. Council Hall, east side of the square.' }],
    rew: { xp: 120, gold: 40, item: () => genItem(2, { base: 'stake', rar: 1 }) }, end() { addItem(genItem(2, { base: 'xbow', rar: 0 })); toast('Equip the crossbow in your pack, then fire it with F.'); }, next: ['q_council', 'q_witch'] },
  q_council: { n: "The Council's Errand", steps: [{ t: 'kill', fam: 'vampire', n: 6, d: 'Destroy six vampires. They come out after dark: the cemetery, the woods.' }, { t: 'talk', id: 'hale', d: 'Report to Captain Hale.' }], rew: { xp: 220, gold: 90, sp: 1, item: () => genItem(S.lvl, { base: 'vest', rar: 2 }) }, next: 'q_bridge' },
  q_witch: { n: "A Witch's Price", steps: [{ t: 'talk', id: 'odette', d: 'Odette Thorne asked to see you.' }, { t: 'gather', item: 'vervain', n: 3, d: 'Gather three sprigs of vervain in the Whispering Woods, north of town.' }, { t: 'gather', item: 'wolfsbane', n: 2, d: 'Gather two heads of wolfsbane, near the Falls or Dunham Lake.' }, { t: 'talk', id: 'odette', d: 'Bring the herbs to Odette.' }], rew: { xp: 200, sp: 2, cons: { tonic: 2 } } },
  q_bridge: { n: 'The Man on the Bridge', steps: [{ t: 'reach', id: 'bridge', night: 1, d: 'After dark, follow the east road to Wickery Bridge.' }, { t: 'talk', id: 'ambrose', d: 'Speak with the man on the bridge.' }], rew: { xp: 260 }, next: 'q_tomb' },
  q_tomb: { n: 'Under the Chapel', steps: [{ t: 'reach', id: 'chapel', d: 'Find the ruins of Fell Chapel, north-west through the woods.' }, { t: 'floor', n: 3, d: 'Descend into the Tomb and clear three floors.', on() { diary('tomb'); } }], rew: { xp: 400, gold: 150, sp: 1 }, next: 'q_warden' },
  q_warden: { n: 'The Warden', steps: [{ t: 'kill', type: 'warden', d: 'Something keeps the fifth floor of the Tomb. Kill it.' }, { t: 'talk', id: 'odette', d: 'Tell Odette what was guarding the fifth floor.', on() { diary('warden'); } }], rew: { xp: 700, sp: 2, gold: 250 }, next: 'q_first' },
  q_first: { n: 'First of the Line', steps: [{ t: 'floor', n: 9, d: 'Clear the Tomb down to the ninth floor.' }, { t: 'kill', type: 'corvin', d: 'Corvin is awake on the tenth floor. End him.' }, { t: 'flag', id: 'blood', d: "Decide what becomes of Corvin's blood. Hale, Odette and Ambrose each want it. A vampire could simply drink it.", on() { diary('corvin'); } }], rew: { xp: 1500, sp: 3, gold: 600 }, next: 'q_deeper' },
  q_deeper: { n: 'Deeper', steps: [{ t: 'floor', n: 20, d: 'They say the Cure lies with the keeper of the twentieth floor.', on() { diary('deeper'); } }], rew: { xp: 5000, sp: 3, cons: { cure: 1 } }, next: 'q_abyss' },
  q_abyss: { n: 'No Bottom', steps: [{ t: 'floor', n: 50, d: 'Fifty floors. Nobody has ever come back from that far to say what is there.' }], rew: { xp: 40000, sp: 5, item: () => genItem(S.lvl + 3, { rar: 4 }) } },
  q_daylight: { n: 'Daylight', steps: [{ t: 'talk', id: 'odette', d: 'Ask Odette Thorne about the sun.' }, { t: 'have', item: 'lapisq', d: 'Find lapis lazuli in the Tomb. Chests hold it, and the keeper of the fifth floor wears it.' }, { t: 'talk', id: 'odette', d: 'Bring the lapis lazuli to Odette.' }], rew: { xp: 500, sp: 1 } },
  q_locket: { n: "Elspeth's Locket", steps: [{ t: 'have', item: 'locket', d: 'Open the chest behind the mausoleum, at the back of the Old Cemetery.' }, { t: 'talk', id: 'pruitt', d: 'Show Mrs. Pruitt the locket.' }], rew: { xp: 150, gold: 60, item: () => genItem(Math.max(3, S.lvl), { slot: 'amulet', rar: 2 }) } },
  q_farm: { n: 'Night on the Farm', steps: [{ t: 'kill', n: 5, night: 1, zone: 'farm', d: 'Kill five predators on Abel Farm after dark.' }, { t: 'talk', id: 'abel', d: 'Tell Abel his herd is safe.' }], rew: { xp: 200, gold: 110, item: () => genItem(Math.max(5, S.lvl), { base: 'silverd', rar: 2 }) } },
  q_wren: { n: 'The Alpha of the Falls', steps: [{ t: 'kill', type: 'alpha', d: 'On a full moon night, kill Old Tobias at the pool below the Falls.' }, { t: 'talk', id: 'wren', d: 'Bring word to Old Wren at Dunham Lake.', on() { diary('alpha'); } }], rew: { xp: 900, gold: 300, sp: 1 } },
  q_bex: { n: 'Wait For It', steps: [{ t: 'parry', n: 5, d: 'Parry five attacks: block at the last instant.' }, { t: 'talk', id: 'bex', d: "Return to Bex at the Hunters' Camp." }], rew: { xp: 250, sp: 1, item: () => genItem(Math.max(4, S.lvl), { slot: 'ranged', rar: 2 }) } },
  q_quarry: { n: 'The Nest', steps: [{ t: 'kill', type: 'lenore', d: 'After dark, kill the matron of the Blackridge Quarry nest.' }, { t: 'talk', id: 'hale', d: 'Report to Captain Hale.' }], rew: { xp: 1200, gold: 500, sp: 1, item: () => mkUniq('halebow', S.lvl) } },
  q_hollow: { n: 'A Hundred Voices', steps: [{ t: 'kill', type: 'matriarch', d: 'After dark, lay a hand on the altar at Coven Hollow, and put what answers to rest.' }], rew: { xp: 1400, sp: 2 }, end() { diary('matriarch'); } },
};
const BOSSUNIQ = { warden: 'wardblade', corvin: 'corvin', alpha: 'alphafang', lenore: 'ripper', matriarch: 'grimoire', ambrose: 'compass' };
function storyEvent(type, a) {
  if (type === 'turned' && !S.done.q_daylight) startQuest('q_daylight');
  if (type !== 'kill' || !a.def.boss) return; const t = a.type, u = BOSSUNIQ[t];
  if (u && (!S.flags['u_' + t] || chance(0.08))) { S.flags['u_' + t] = 1; mkDrop(a.x, a.z, 'item', mkUniq(u, a.lvl), 0xe2334a); }
  S.sigils += Math.ceil(a.lvl / 2); if (t === 'warden' && qAt('q_daylight', 1) && !hasCons('lapisq')) { addCons('lapisq'); checkHave(); } if (t === 'corvin' && !S.flags.bloodTo && !hasCons('elderblood')) addCons('elderblood');
  if (t === 'alpha') S.flags.alphaDay = S.day; if (t === 'lenore') S.flags.lenoreDay = S.day; if (t === 'matriarch') { S.flags.matriarch = 1; S.flags.matDay = S.day; }
  if (t === 'ambrose') toast('Ambrose laughs, bleeding, and is gone before you can blink. He will be back on his bridge tomorrow.');
  if (RT.area.id === 'tomb' && RT.area.depth === 20 && !S.flags.cure20) { S.flags.cure20 = 1; if (!S.done.q_deeper && !S.quests.q_deeper) addCons('cure'); }
  banner(a.def.n.split(',')[0] + ' has fallen', 'Level ' + a.lvl);
}
function storyChest(c) { if (c.id === 'c0' && qAt('q_locket', 0)) { addCons('locket'); checkHave(); } if (RT.area.id === 'tomb' && qAt('q_daylight', 1) && !hasCons('lapisq') && chance(0.45)) { addCons('lapisq'); checkHave(); } }
function storyUse(k) { if (k === 'elderblood') { if (S.species !== 'vampire') { toast('It would kill you. Slowly, and then not at all.'); return false; } S.cons.elderblood--; S.flags.bloodTo = 'self'; S.sp += 3; S.humanity = Math.max(0, S.humanity - 10); sfx('turn'); RT.flashV = 0.3; toast('Nine hundred years go down like a lit match. Three skill points.'); qEvent('flag', 'blood'); return true; } return false; }
function hollowAltar() {
  const vamp = S.species === 'vampire';
  if (S.flags.matriarch && vamp && S.flags.witch && !S.heretic) return say([['The altar', `The stones are cold now, and listening. A dead thing that still remembers the craft could ask them for it back. They will want paying: 60 sigils. You have ${S.sigils}.`]], [['Pay the hundred.', () => { if (S.sigils < 60) { sfx('deny'); return toast('Not enough sigils.'); } S.sigils -= 60; S.heretic = true; recalc(); diary('heretic'); sfx('turn'); RT.flashV = 0.3; banner('Heretic', 'The Witch tree answers you again'); }], ['Step back.', () => { }]]);
  if (!isNight()) return toast('The altar is only stone by daylight.'); if (S.flags.matDay != null && S.day - S.flags.matDay < 3) return toast('The Hollow is quiet. Give it a few nights.'); if (actors.some(e => e.type === 'matriarch' && !e.dead)) return;
  sfx('howl'); RT.flashV = 0.2; toast('A hundred voices answer at once.'); const e = spawnEnemy('matriarch', -20, -238, Math.max(12, S.lvl)); aggro(e);
}
/* periodic world checks: discovery, timed bosses, who is standing where */
function worldEvents() {
  for (const p of POI) { const d = hyp(p.x - pl.x, p.z - pl.z); if (d < 18) { if (!S.disc[p.id]) { S.disc[p.id] = 1; banner(p.n, 'Discovered · waypoint unlocked'); gainXp(20 + S.lvl * 8); sfx('quest'); } for (const id in S.quests) { const st = S.quests[id], s = QUESTS[id].steps[st.step]; if (s && s.t === 'reach' && s.id === p.id && (!s.night || isNight())) advQuest(id); } } }
  for (const n of actors) if (n.kind === 'npc') { const w = n.npc.when; n.rig.g.visible = w ? w() : n.npc.townie ? (!isNight() || n.npc.owl) : true; }
  const night = isNight(), has = t => actors.some(e => e.type === t && !e.dead);
  if (night && fullMoon() && S.flags.alphaDay !== S.day && !has('alpha') && d2(pl, { x: 168, z: -222 }) < 70) { spawnEnemy('alpha', 172, -218, Math.max(10, S.lvl)); toast('Something very large is moving by the Falls.'); sfx('howl'); }
  if (night && (S.flags.lenoreDay == null || S.day - S.flags.lenoreDay >= 4) && !has('lenore') && d2(pl, { x: 152, z: 190 }) < 70 && (S.quests.q_quarry || S.done.q_quarry)) spawnEnemy('lenore', 156, 196, Math.max(14, S.lvl));
  for (const b of S.bounties) if (b.spawn && b.acc && !b.done) { const z = ZONES.find(q => q.id === b.zone), c = z.c ? { x: z.c[0], z: z.c[1] } : { x: (z.r[0] + z.r[2]) / 2, z: (z.r[1] + z.r[3]) / 2 }; if (d2(pl, c) < 62) { b.spawn = false; const e = spawnEnemy(b.type, c.x + R(-8, 8), c.z + R(-8, 8), Math.max(b.lvl, S.lvl), { elite: true, tag: b.id }); collide(e); e.maxHp *= 1.5; e.hp = e.maxHp; toast('Your quarry is close: ' + e.name + '.'); } }
}
function spawnWorldNpcs() {
  RT.area.inter = RT.area.inter.filter(i => !i.temp); for (const d of NPCS) spawnNpc(d);
  const W = [[-22, -22], [22, -20], [-22, 20], [20, 22], [-8, 10], [10, -10], [0, 40], [0, 70], [0, 100], [-34, 8], [30, -14], [12, -44], [-4, -20], [24, 4]];
  for (let i = 0; i < 12; i++) { const w = W[i]; spawnNpc({ n: 'Townsperson', x: w[0], z: w[1], wps: W, townie: 1, owl: i < 3 }); }
  for (const d of [[-60, 16, [[-60, 16], [-30, 8], [-88, 30]]], [50, -14, [[50, -14], [30, -14], [80, -14]]]]) spawnNpc({ n: 'Deputy', x: d[0], z: d[1], wps: d[2], look: { cloth: 0x2a3a5c, hat: 1, pants: 0x1a1c26, long: 0 } });
  addInter({ temp: 1, x: -20, z: -245, r: 2.8, label: () => 'Touch the altar', act: hollowAltar });
  addInter({ temp: 1, x: 8.5, z: -29.2, r: 2.4, label: () => S.done.q_bump ? 'Read the notice board' : null, act: () => openMenu('bounty') });
  addInter({ temp: 1, x: -38.4, z: -8, r: 2.4, label: () => 'Your room: rest', act: () => say([['Your room', "Elspeth's bed, Elspeth's lamp, a box of letters. The window faces east."]], [['Sleep until morning.', () => sleepUntil(8)], ['Sleep until dusk.', () => sleepUntil(20.5)], ['Not now.', () => { }]]) });
}
/* Hollow Moon — interface: HUD, minimap, dialogue, menus, vendors, touch controls. */
const GLYPH = { h_gren: '✺', h_heart: '➹', h_whirl: '⟳', h_volley: '⋙', w_incend: '♨', w_aneur: '✹', w_ward: '◈', w_mend: '✚', w_temp: 'ϟ', v_frenzy: '♥', v_compel: '◉', v_step: '⤳', v_ripper: '☾' };
function toast(t) { const box = $('toasts'); if (box.lastChild && box.lastChild.textContent === t) return; const d = el('div', '', t); box.appendChild(d); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => d.remove(), 5200); }
function lootToast(t, col) { const box = $('loot'), d = el('div', '', t); d.style.color = col; box.appendChild(d); while (box.children.length > 5) box.firstChild.remove(); setTimeout(() => d.remove(), 4200); }
let bannerT = 0; function banner(t, s) { $('bannerT').textContent = t; $('bannerS').textContent = s || ''; const b = $('banner'); b.hidden = false; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go'); clearTimeout(bannerT); bannerT = setTimeout(() => b.hidden = true, 3600); }
function zoneBanner(z) { $('zone').textContent = z.n + (z.safe ? '' : ' · Lv ' + z.lvl); if (!z.safe && z.id !== 'wild') banner(z.n, 'Enemy level ' + z.lvl + '+'); }
function showBoss(e) { $('bossbar').hidden = false; $('bossname').textContent = e.name; $('bosssub').textContent = e.def.sub || ''; } function hideBoss() { $('bossbar').hidden = true; }

/* ---------------- dialogue ---------------- */
let dq = null;
function say(lines, choices, done) { dq = { lines, i: 0, choices, done }; for (const k in K) K[k] = false; mouse.l = mouse.r = false; J.x = J.y = 0; showDlg(); }
function showDlg() { const l = dq.lines[dq.i], last = dq.i === dq.lines.length - 1; $('dlg').hidden = false; $('dwho').textContent = l[0]; $('dtext').textContent = l[1]; const c = $('dch'); c.innerHTML = ''; $('dnext').hidden = last && !!dq.choices;
  if (last && dq.choices) dq.choices.forEach((ch, i) => { const b = el('button', 'choice', (RT.touch ? '' : (i + 1) + '. ') + ch[0]); b.type = 'button'; b.onclick = ev => { ev.stopPropagation(); pickChoice(i); }; c.appendChild(b); }); }
function pickChoice(i) { if (!dq || !dq.choices || dq.i < dq.lines.length - 1 || !dq.choices[i]) return; const fn = dq.choices[i][1]; dq = null; $('dlg').hidden = true; sfx('ui'); fn(); }
function advDlg() { if (!dq) return; if (dq.i < dq.lines.length - 1) { dq.i++; showDlg(); sfx('ui'); } else if (!dq.choices) { const d = dq.done; dq = null; $('dlg').hidden = true; RT.dlgT = performance.now(); d && d(); } }
$('dlg').onclick = advDlg;

/* ---------------- interaction ---------------- */
function findInteract() {
  if (!pl || pl.dead || pl.feed) return null; let best = null, bd = 1e9;
  for (const it of RT.area.inter) { const d = hyp(it.x - pl.x, it.z - pl.z); if (d < it.r && d < bd) { const l = it.label(); if (l) { bd = d; best = { label: l, act: it.act }; } } }
  const vamp = S.species === 'vampire';
  for (const n of actors) { if (n.dead || !n.rig.g.visible) continue; const d = d2(pl, n);
    if (n.kind === 'npc' && d < 3.2) { if (n.npc.talk && d - 1.5 < bd) { bd = d - 1.5; best = { label: 'Talk to ' + n.name, act: () => n.npc.talk(n) }; } else if (!n.npc.talk && d < 2.5 && d - 1 < bd) { if (vamp && n.npc.townie && n.fedDay !== S.day) { bd = d - 1; best = { label: 'Feed (hold, and let go in time)', act: () => startFeed(n) }; } else if (!n.dazed) { bd = d - 1; best = { label: 'Talk', act: () => say([[n.name, pick(TOWNIE_BARKS)]]) }; } } }
    else if (n.kind === 'enemy' && vamp && d < 2.5 + n.r && (n.def.peaceful || (n.fx.stun > 0 && !n.def.boss && n.fam !== 'spirit'))) { bd = -9; best = { label: n.def.peaceful ? 'Feed on the ' + n.name.toLowerCase() : 'Feed on the staggered ' + n.name, act: () => biteEnemy(n) }; } }
  return best;
}

/* ---------------- HUD ---------------- */
const bar = (id, v, m, txt) => { const b = $(id); b.firstElementChild.style.width = clamp(v / m * 100, 0, 100) + '%'; b.lastElementChild.textContent = txt != null ? txt : Math.max(0, Math.ceil(v)) + ' / ' + Math.round(m); };
const ARW = [$('a0'), $('a1'), $('a2')]; let hudT = 0, miniT = 0, curInt = null;
function updHud(dt) {
  const vamp = S.species === 'vampire'; bar('bHp', pl.hp, P.maxHp); bar('bSt', pl.sta, P.maxSta, ''); $('bRes').className = 'bar ' + (vamp ? 'blood' : 'focus'); if (vamp && !S.heretic) bar('bRes', pl.blood, P.maxBlood, Math.ceil(pl.blood) + ' blood'); else bar('bRes', pl.foc, P.maxFoc, Math.ceil(pl.foc) + ' focus');
  $('bRes2').hidden = !(vamp && S.heretic); if (vamp && S.heretic) bar('bRes2', pl.blood, P.maxBlood, Math.ceil(pl.blood) + ' blood');
  $('xpfill').style.width = S.xp / xpNeed(S.lvl) * 100 + '%'; if (RT.boss) $('bossfill').style.width = clamp(RT.boss.hp / RT.boss.maxHp * 100, 0, 100) + '%';
  hudT -= dt; if (hudT > 0) return; hudT = 0.12;
  $('lvl').textContent = S.lvl; $('clock').textContent = fmtClock(S.clock); $('daymoon').textContent = RT.area.id === 'tomb' ? 'The Tomb · Floor ' + RT.area.depth : `Day ${S.day} · ${MOON[moonPhase()]}`; if (RT.area.id === 'tomb') $('zone').textContent = RT.area.cleared ? 'Seal broken' : RT.area.boss ? 'A keeper waits' : `${Math.max(0, RT.area.need - RT.area.killed)} to break the seal`;
  $('gold').textContent = fmt(S.gold) + ' gold' + (S.sigils ? ' · ' + S.sigils + ' sigils' : ''); $('pts').hidden = !(S.ap || S.sp); $('pts').textContent = (S.ap ? S.ap + ' attribute' : '') + (S.ap && S.sp ? ' · ' : '') + (S.sp ? S.sp + ' skill' : '') + ' points to spend';
  // status line
  const b = pl.buff, st = []; if (vamp) { if (pl.burning) st.push('BURNING'); if (pl.blood <= 0) st.push('Starving'); if (S.exposure >= 50) st.push('Hunted'); else if (S.exposure >= 20) st.push('Suspected'); } if (S.flags.vblood) st.push('Vampire blood ' + Math.ceil(S.flags.vbloodT) + 's');
  if (b.coatV > 0) st.push('Vervain ' + Math.ceil(b.coatV)); if (b.coatW > 0) st.push('Wolfsbane ' + Math.ceil(b.coatW)); if (b.ward > 0) st.push('Ward ' + Math.round(b.ward)); if (b.ripper > 0) st.push('Switch off ' + Math.ceil(b.ripper)); if (b.slayerN) st.push('Momentum ×' + b.slayerN); if (b.riposte > 0) st.push('Riposte'); if (pl.fx.verv > 0) st.push('Vervained'); if (pl.fx.burn > 0) st.push('On fire'); if (b.burger > 0) st.push('Fed');
  $('status').textContent = st.join(' · ');
  // ability bar
  for (let i = 0; i < 4; i++) { const s = $('s' + i), id = S.bar[i]; s.classList.toggle('empty', !id); s.querySelector('b').textContent = id ? GLYPH[id] || '?' : ''; const cd = id ? (pl.cds[id] || 0) : 0; s.querySelector('u').style.height = id && cd > 0 ? clamp(cd / (SK[id].cd * (1 - P.cdr)) * 100, 0, 100) + '%' : '0'; s.title = id ? SK[id].n : ''; const p = $('p' + i); if (p) { p.hidden = !id; p.textContent = id ? GLYPH[id] : ''; p.classList.toggle('cd', cd > 0); } }
  const rg = S.eq.ranged; $('sR').classList.toggle('empty', !rg); $('sR').querySelector('u').style.height = rg && pl.rangedCd > 0 ? clamp(pl.rangedCd / (BASES[rg.base].cd * P.reload) * 100, 0, 100) + '%' : '0';
  const heals = (S.cons.draught || 0) + (vamp ? (S.cons.bloodbag || 0) : 0); $('sH').querySelector('i').textContent = heals; $('sH').classList.toggle('empty', !heals); if ($('pR')) $('pR').textContent = heals ? '✚' + heals : '✚';
  // quest tracker
  const qb = $('quests'); qb.innerHTML = ''; const tg = []; let n = 0;
  for (const id in S.quests) { if (n++ >= 3) break; const q = QUESTS[id], st_ = S.quests[id], s = q.steps[st_.step]; const d = el('div', 'q'); d.appendChild(el('b', '', q.n)); d.appendChild(el('span', '', s.d + ((s.n || 1) > 1 ? ` (${Math.min(st_.n, s.n)}/${s.n})` : ''))); qb.appendChild(d); const t = qTarget(s); if (t && RT.area.id === 'world') tg.push(t); }
  for (const bq of S.bounties) if (bq.acc && n++ < 4) { const d = el('div', 'q'); d.appendChild(el('b', '', 'Bounty · ' + bq.title)); d.appendChild(el('span', '', bq.done ? 'Collect at the notice board.' : `${bq.prog}/${bq.n}`)); qb.appendChild(d); }
  RT.targets = tg; for (let i = 0; i < 3; i++) { const a = ARW[i], o = tg[i]; if (!o || d2(o, pl) < 14 || RT.menu) { a.hidden = true; continue; } const an = Math.atan2(-(o.z - pl.z), o.x - pl.x); a.hidden = false; a.style.left = 50 + Math.cos(an) * 38 + '%'; a.style.top = 50 - Math.sin(an) * 32 + '%'; a.firstChild.style.transform = `rotate(${PI / 2 - an}rad)`; a.lastChild.textContent = Math.round(d2(o, pl)) + ' m'; }
  // prompt
  curInt = RT.paused ? null : findInteract(); const pr = $('prompt'); pr.hidden = !curInt; if (curInt) pr.textContent = (RT.touch ? '' : 'E · ') + curInt.label; const pe = $('pE'); if (pe) pe.classList.toggle('hot', !!curInt);
  miniT -= 0.12; if (miniT <= 0) { miniT = 0.2; drawMini(); }
}
function drawMini() {
  const c = $('mini'), g = c.getContext('2d'), N = c.width, span = RT.area.id === 'tomb' ? 90 : 150, k = N / span; g.fillStyle = '#0a0e16'; g.fillRect(0, 0, N, N); const X = x => (x - pl.x) * k + N / 2, Z = z => (z - pl.z) * k + N / 2;
  if (RT.area.id === 'world' && WORLDMAP) { const s = WORLDMAP.width / (WS * 2); g.globalAlpha = isNight() ? 0.75 : 1; g.drawImage(WORLDMAP, (pl.x - span / 2 + WS) * s, (pl.z - span / 2 + WS) * s, span * s, span * s, 0, 0, N, N); g.globalAlpha = 1; g.fillStyle = 'rgba(20,16,14,.85)'; for (const b of RT.area.los) if (Math.abs(b[0] - pl.x) < span && Math.abs(b[1] - pl.z) < span) g.fillRect(X(b[0]), Z(b[1]), (b[2] - b[0]) * k, (b[3] - b[1]) * k);
    for (const p of POI) if (S.disc[p.id]) { g.fillStyle = '#ffc870'; g.fillRect(X(p.x) - 2, Z(p.z) - 2, 4, 4); } }
  else { g.fillStyle = '#3a3a48'; for (const b of RT.area.boxes) if (b.length === 4 && Math.abs(b[0] - pl.x) < span && Math.abs(b[1] - pl.z) < span) g.fillRect(X(b[0]), Z(b[1]), (b[2] - b[0]) * k, (b[3] - b[1]) * k); const a = RT.area; g.fillStyle = a.cleared ? '#a08cff' : '#5a4c90'; g.fillRect(X(a.exit.x) - 3, Z(a.exit.z) - 3, 6, 6); g.fillStyle = '#6a8cff'; g.fillRect(X(a.start.x) - 2, Z(a.start.z) - 2, 4, 4); }
  const sense = hasUniq('compass') || (S.species === 'vampire' && sk('v_sense')) || RT.area.id === 'tomb' && RT.area.killed >= RT.area.need * 0.6;
  for (const a of actors) { if (a.dead || !a.rig.g.visible) continue; if (a.kind === 'npc' && a.npc.talk) { g.fillStyle = '#7ab0ff'; g.fillRect(X(a.x) - 2, Z(a.z) - 2, 4, 4); } else if (a.kind === 'enemy' && !a.def.peaceful && (sense || a.ai.aggro)) { g.fillStyle = a.team === 0 ? '#b080ff' : a.def.boss ? '#ff3050' : '#e04050'; const r = a.def.boss ? 3 : 2; g.fillRect(X(a.x) - r, Z(a.z) - r, r * 2, r * 2); } }
  for (const t of RT.targets || []) { let x = X(t.x), z = Z(t.z); const dx = x - N / 2, dz = z - N / 2, l = hyp(dx, dz), m = N / 2 - 6; if (l > m) { x = N / 2 + dx / l * m; z = N / 2 + dz / l * m; } g.fillStyle = '#ffe040'; g.beginPath(); g.arc(x, z, 3.5, 0, 7); g.fill(); }
  g.save(); g.translate(N / 2, N / 2); g.rotate(-pl.rot + PI); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5); g.fill(); g.restore();
}
/* floating numbers, enemy health bars, name tags: one 2D canvas over the scene */
function drawOverlay(dt) {
  const c = $('fxc'), g = c.getContext('2d'), s = c.width / innerWidth; g.setTransform(s, 0, 0, s, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight); if (!pl) return; g.textAlign = 'center';
  for (const a of actors) { if (a.dead || !a.rig.g.visible) continue; const d = d2(a, pl); if (d > 34) continue;
    if (a.kind === 'enemy' && !a.def.peaceful && (a.hpShow > 0 || a.elite || a.ai.aggro) && !a.def.boss) { const p = toScreen(a.x, 2.5 * a.rig.g.scale.y / 1.28 + (a.rig.kind === 'quad' ? -0.9 : 0), a.z); if (!p.ok) continue; const w = a.elite ? 56 : 42; g.fillStyle = 'rgba(8,10,16,.75)'; g.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, 6); g.fillStyle = a.team === 0 ? '#b080ff' : a.elite ? '#f0a13c' : '#d8354a'; g.fillRect(p.x - w / 2, p.y, w * clamp(a.hp / a.maxHp, 0, 1), 4);
      g.font = '600 11px "Barlow Condensed",sans-serif'; g.fillStyle = a.elite ? '#f0c060' : a.lvl > S.lvl + 3 ? '#ff7070' : '#d8d0c0'; g.fillText(`${a.lvl} ${a.name}`, p.x, p.y - 5); if (a.fx.stun > 0) { g.fillStyle = '#ffe9a0'; g.fillText('✦ staggered ✦', p.x, p.y - 18); } }
    else if (a.kind === 'npc' && a.npc.talk && d < 12) { const p = toScreen(a.x, 2.75, a.z); if (!p.ok) continue; g.font = 'italic 14px "IM Fell English",serif'; g.fillStyle = '#e6b86c'; g.fillText(a.name, p.x, p.y); if (hasQuestFor(a.npc.id)) { g.font = '700 20px "Barlow Condensed",sans-serif'; g.fillStyle = '#ffe040'; g.fillText('!', p.x, p.y - 16); } } }
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; if (f.t > 0.9) { floats.splice(i, 1); continue; } const p = toScreen(f.x + f.vx * f.t, f.y + f.t * 1.6, f.z); if (!p.ok) continue; g.globalAlpha = Math.min(1, (0.9 - f.t) * 3); g.font = `700 ${f.size * (1 + Math.max(0, 0.15 - f.t) * 3)}px "Barlow Condensed",sans-serif`; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(f.txt, p.x, p.y); g.fillStyle = f.col; g.fillText(f.txt, p.x, p.y); } g.globalAlpha = 1;
}
function hasQuestFor(id) { for (const q in S.quests) { const s = QUESTS[q].steps[S.quests[q].step]; if (s && s.t === 'talk' && s.id === id) return true; } return false; }

/* ---------------- menus ---------------- */
const TABS = [['char', 'Character'], ['inv', 'Pack'], ['skills', 'Skills'], ['journal', 'Journal'], ['map', 'Map'], ['system', 'System']];
let selItem = null, vendId = null;
function openMenu(tab) { if (dq || !RT.started || pl.dead) return; RT.menu = tab || RT.menu || 'inv'; $('menu').hidden = false; for (const k in K) K[k] = false; mouse.l = mouse.r = false; J.x = J.y = 0; selItem = null; sfx('ui'); renderMenu(); }
function closeMenu() { RT.menu = null; vendId = null; $('menu').hidden = true; $('tip').hidden = true; save(); }
function openVendor(id) { vendId = id; openMenu('vendor'); }
const H = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const itemCard = (it, extra = '') => `<button type="button" class="item r${it.rar}${selItem === it ? ' sel' : ''}" data-item="${it.id}"><b>${H(it.name)}${it.up ? ' +' + it.up : ''}</b><span>Lv ${it.lvl} · ${it.dmg ? Math.round(up(it, it.dmg)) + ' dmg' : it.def ? Math.round(up(it, it.def)) + ' armour' : cap(it.slot)}${extra}</span></button>`;
const findItem = id => S.inv.find(i => i.id == id) || Object.values(S.eq).find(i => i && i.id == id) || (vendId && vendorStock(vendId).items.find(i => i.id == id));
function itemDetail(it, mode) {
  if (!it) return '<p class="dim">Select an item.</p>'; const owned = S.inv.includes(it), worn = Object.values(S.eq).includes(it), cur = S.eq[it.slot]; let h = `<h3 class="r${it.rar}">${H(it.name)}${it.up ? ' +' + it.up : ''}</h3><p class="dim">${RAR[it.rar].n} ${H(BASES[it.base].n)} · level ${it.lvl}</p><ul>${itemLines(it).map(l => `<li>${H(l)}</li>`).join('')}</ul>`;
  if (cur && cur !== it && !worn) h += `<p class="dim">Equipped: <span class="r${cur.rar}">${H(cur.name)}</span> · ${cur.dmg ? Math.round(up(cur, cur.dmg)) + ' dmg' : cur.def ? Math.round(up(cur, cur.def)) + ' armour' : ''}</p>`;
  h += '<div class="row">'; if (mode === 'buy') h += `<button type="button" class="btn" data-act="buy">Buy · ${buyPrice(it)} gold</button>`; else { if (owned) h += '<button type="button" class="btn" data-act="equip">Equip</button>'; if (worn) h += '<button type="button" class="btn" data-act="unequip">Unequip</button>'; if (owned && mode === 'sell') h += `<button type="button" class="btn" data-act="sell">Sell · ${sellPrice(it)} gold</button>`; if (owned && !mode) h += '<button type="button" class="btn ghost" data-act="salvage">Salvage</button>';
    if ((owned || worn) && mode === 'sell' && VEND[vendId].forge && (it.dmg || it.def)) { const c = upCost(it); h += (it.up || 0) >= 10 ? '' : `<button type="button" class="btn" data-act="forge">Reforge to +${(it.up || 0) + 1} · ${c.gold} gold, ${c.scrap} scrap</button>`; } }
  return h + '</div>';
}
function renderMenu() {
  const t = RT.menu, body = $('mbody'), vamp = S.species === 'vampire'; $('mtabs').innerHTML = (t === 'vendor' || t === 'bounty' ? `<span class="tab on">${t === 'vendor' ? H(VEND[vendId].n) : 'Notice board'}</span>` : TABS.map(([k, n]) => `<button type="button" class="tab${k === t ? ' on' : ''}" data-tab="${k}">${n}${k === 'char' && S.ap ? ' •' : k === 'skills' && S.sp ? ' •' : ''}</button>`).join('')) + `<span class="purse">${fmt(S.gold)} gold · ${S.cons.scrap || 0} scrap · ${S.sigils} sigils</span>`;
  let h = '';
  if (t === 'char') { const A = [['mig', 'Might', '+2% melee damage'], ['fin', 'Finesse', '+2% ranged damage, +0.4% critical chance'], ['vig', 'Vigor', '+10 health, +2 stamina'], ['wil', 'Will', '+2.5% spell power, +4 focus']];
    h = `<div class="cols"><section><h2>${title()}</h2><p class="dim">Level ${S.lvl} ${vamp ? (S.heretic ? 'heretic' : 'vampire') : S.flags.witch ? 'witch' : 'human'} · power ${fmt(P.power)} · ${Math.floor(S.xp)} / ${xpNeed(S.lvl)} xp</p><h3>Attributes <small>${S.ap} to spend</small></h3>` + A.map(([k, n, d]) => `<div class="stat"><b>${n} ${P.attr[k]}</b><span>${d}</span><button type="button" class="btn sm" data-attr="${k}" ${S.ap ? '' : 'disabled'}>+</button></div>`).join('') +
      (vamp ? `<h3>The dead</h3><div class="stat"><b>Humanity ${Math.round(S.humanity)}</b><span>Falls when you kill the people you feed on.</span></div><div class="stat"><b>Exposure ${Math.round(S.exposure)}</b><span>At 50 the Council hunts you. Fades with time and sleep.</span></div>` : '') + '</section><section><h3>Numbers</h3><ul class="nums">' +
      [['Health', Math.round(P.maxHp)], ['Stamina', Math.round(P.maxSta)], [vamp ? 'Blood' : 'Focus', Math.round(vamp ? P.maxBlood : P.maxFoc)], ['Weapon damage', Math.round(P.wdmg * P.meleeM)], ['Ranged damage', S.eq.ranged ? Math.round(S.eq.ranged.dmg * P.rangedM) : '—'], ['Spell damage', Math.round(P.spellBase)], ['Critical', P.crit.toFixed(1) + '% for ×' + P.critMult.toFixed(2)], ['Attack speed', '×' + P.as.toFixed(2)], ['Armour', Math.round(P.def) + ' (' + Math.round(P.mit * 100) + '% less damage)'], ['Life steal', P.ls.toFixed(1) + '%'], ['Movement', P.spd.toFixed(1)], ['Cooldowns', Math.round(P.cdr * 100) + '% faster'], ['Better loot', '+' + Math.round(P.mf) + '%']].map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join('') +
      `</ul><h3>Record</h3><ul class="nums"><li><span>Kills</span><b>${S.stats.kills}</b></li><li><span>Deepest floor</span><b>${S.deepest}</b></li><li><span>Deaths</span><b>${S.stats.deaths}</b></li><li><span>Time</span><b>${Math.floor(S.stats.played / 3600)}h ${Math.floor(S.stats.played / 60) % 60}m</b></li></ul></section></div>`; }
  else if (t === 'inv' || t === 'vendor') { const sell = t === 'vendor', st = sell ? vendorStock(vendId) : null, vd = sell ? VEND[vendId] : null;
    const eqh = ['weapon', 'ranged', 'armor', 'ring', 'amulet'].map(s => { const it = S.eq[s]; return it ? itemCard(it, ' · worn') : `<div class="item none"><b>${cap(s)}</b><span>empty</span></div>`; }).join('');
    const cons = Object.keys(S.cons).filter(k => S.cons[k] > 0).map(k => `<button type="button" class="item cons" data-cons="${k}" title="${H(CONS[k].d)}"><b>${CONS[k].icon} ${H(CONS[k].n)} ×${S.cons[k]}</b><span>${sell && !CONS[k].quest ? 'Sell · ' + Math.max(1, Math.round(CONS[k].price * 0.4)) + ' gold' : H(CONS[k].d)}</span></button>`).join('');
    const inv = S.inv.slice().sort((a, b) => b.rar - a.rar || b.lvl - a.lvl).map(it => itemCard(it)).join('') || '<p class="dim">Nothing but lint.</p>';
    h = '<div class="cols">' + (sell ? `<section><h3>For sale</h3><div class="grid">${st.items.map(it => itemCard(it, ' · ' + buyPrice(it) + 'g')).join('') || ''}${vd.cons.map(k => `<button type="button" class="item cons" data-buycons="${k}" title="${H(CONS[k].d)}"><b>${CONS[k].icon} ${H(CONS[k].n)}</b><span>${CONS[k].price} gold</span></button>`).join('')}</div></section>` : '') +
      `<section><h3>Worn</h3><div class="grid">${eqh}</div><h3>Pack <small>${S.inv.length}/60</small>${sell ? '' : ' <button type="button" class="btn sm ghost" data-act="salvageall">Salvage all common</button>'}</h3><div class="grid">${inv}</div><h3>Supplies</h3><div class="grid">${cons || '<p class="dim">None.</p>'}</div></section><section class="detail">${itemDetail(selItem, sell ? (st.items.includes(selItem) ? 'buy' : 'sell') : null)}</section></div>`; }
  else if (t === 'skills') { h = `<p class="dim">${S.sp} skill point${S.sp === 1 ? '' : 's'} to spend. Assign learned abilities to keys 1–4.</p><div class="cols three">` + Object.keys(TREES).map(tr => { const open = treeOpen(tr), pts = treePts(tr);
      return `<section class="${open ? '' : 'shut'}"><h2>${TREES[tr].n} <small>${pts} points</small></h2><p class="dim">${open ? TREES[tr].d : tr === 'witch' ? (S.flags.witch ? 'The craft does not answer the dead.' : 'Odette Thorne could teach you.') : 'Only the dead may learn this.'}</p>` + Object.keys(SK).filter(k => SK[k].tree === tr).map(k => { const d = SK[k], r = sk(k), can = open && S.sp > 0 && r < d.max && pts >= d.req;
        return `<div class="skill${r ? ' known' : ''}${pts < d.req ? ' locked' : ''}"><div><b>${d.act ? GLYPH[k] + ' ' : ''}${d.n}</b> <small>${r}/${d.max}${pts < d.req ? ' · needs ' + d.req + ' points' : ''}${d.act ? ' · ' + d.cd + 's' : ''}</small><span>${H(d.d(Math.max(1, r)))}${r && r < d.max ? '<br><i>Next: ' + H(d.d(r + 1)) + '</i>' : ''}</span></div><div class="row">${d.act && r ? [0, 1, 2, 3].map(i => `<button type="button" class="btn sm${S.bar[i] === k ? '' : ' ghost'}" data-bind="${k}:${i}">${i + 1}</button>`).join('') : ''}<button type="button" class="btn sm" data-learn="${k}" ${can ? '' : 'disabled'}>+</button></div></div>`; }).join('') + '</section>'; }).join('') +
      `</div><h2>Ascension <small>${S.sigils} sigils, earned in the Tomb</small></h2><div class="cols">` + Object.keys(ASC).map(k => `<div class="skill known"><div><b>${ASC[k].n}</b> <small>rank ${S.asc[k]}</small><span>${ASC[k].d}</span></div><div class="row"><button type="button" class="btn sm" data-asc="${k}" ${S.sigils >= ascCost(S.asc[k]) ? '' : 'disabled'}>${ascCost(S.asc[k])} sigils</button></div></div>`).join('') + '</div>'; }
  else if (t === 'journal') { h = '<div class="cols"><section><h2>Quests</h2>' + (Object.keys(S.quests).map(id => { const q = QUESTS[id], st = S.quests[id]; return `<div class="quest"><b>${q.n}</b>` + q.steps.map((s, i) => i <= st.step ? `<span class="${i < st.step ? 'done' : ''}">${i < st.step ? '✓ ' : ''}${H(s.d)}${i === st.step && (s.n || 1) > 1 ? ` (${Math.min(st.n, s.n)}/${s.n})` : ''}</span>` : '').join('') + '</div>'; }).join('') || '<p class="dim">Nothing asked of you just now. The notice board by the Grill always has work, and the Tomb always has another floor.</p>') +
      `<h3>Done</h3><p class="dim">${Object.keys(S.done).map(id => QUESTS[id] ? QUESTS[id].n : '').filter(Boolean).join(' · ') || 'Nothing yet.'}</p></section><section class="paper"><h2>Dear Diary,</h2>${S.diary.map(e => `<p><small>${H(e.t)}</small>${H(e.x)}</p>`).join('')}</section></div>`; }
  else if (t === 'map') { const near = POI.find(p => S.disc[p.id] && d2(p, pl) < 5 && RT.area.id === 'world'); h = `<p class="dim">${RT.area.id !== 'world' ? 'You are under the ground.' : near ? 'Choose a waypoint you have found to travel there.' : 'Stand at a waypoint signpost to travel between the ones you have found.'}</p><div class="mapwrap"><canvas id="bigmap" width="900" height="900"></canvas>` + POI.filter(p => S.disc[p.id]).map(p => `<button type="button" class="pin" style="left:${(p.x + WS) / (WS * 2) * 100}%;top:${(p.z + WS) / (WS * 2) * 100}%" data-poi="${p.id}" ${near ? '' : 'disabled'}>${H(p.n)}</button>`).join('') + '</div>'; }
  else if (t === 'bounty') { genBounties(); h = '<p class="dim">Paid by the Founders\' Council. New notices go up each morning.</p>' + (S.bounties.map(b => `<div class="skill known"><div><b>${H(b.title)}</b> <small>${b.gold} gold · ${fmt(b.xp)} xp${b.acc ? ' · ' + b.prog + '/' + b.n : ''}</small><span>${H(b.text)}</span></div><div class="row"><button type="button" class="btn sm" data-bounty="${b.id}">${b.done ? 'Collect' : b.acc ? 'Accepted' : 'Accept'}</button></div></div>`).join('') || '<p>Nothing posted.</p>'); }
  else if (t === 'system') { h = `<div class="cols"><section><h2>System</h2><div class="row">${['low', 'med', 'high'].map(q => `<button type="button" class="btn${RT.quality === q ? '' : ' ghost'}" data-q="${q}">Graphics: ${q}</button>`).join('')}</div><div class="row"><button type="button" class="btn" data-act="save">Save now</button><button type="button" class="btn ghost" data-act="export">Copy save code</button><button type="button" class="btn ghost" data-act="import">Load save code</button></div><textarea id="savecode" rows="3" placeholder="A save code appears here, or paste one and press Load."></textarea><p class="dim">The game saves on its own to this browser${cloud ? ' and to your Claude account' : ''}. A save code moves a character between devices.</p><div class="row"><button type="button" class="btn ghost" data-act="wipe">Start over…</button></div></section>
      <section><h2>Controls</h2><ul class="nums"><li><span>Move</span><b>WASD</b></li><li><span>Attack · hold for heavy</span><b>Left mouse / J</b></li><li><span>Block · tap just in time to parry</span><b>Right mouse / Shift</b></li><li><span>Dodge</span><b>Space</b></li><li><span>Ranged shot</span><b>F</b></li><li><span>Abilities</span><b>1 2 3 4</b></li><li><span>Heal</span><b>R</b></li><li><span>Use · talk · feed</span><b>E</b></li><li><span>Menu · map</span><b>Tab · M</b></li><li><span>Zoom</span><b>Mouse wheel</b></li></ul></section></div>`; }
  body.innerHTML = h; if (t === 'map') drawBigMap();
}
function drawBigMap() { const c = $('bigmap'), g = c.getContext('2d'); if (WORLDMAP) g.drawImage(WORLDMAP, 0, 0, c.width, c.height); const k = c.width / (WS * 2); g.fillStyle = 'rgba(8,10,16,.25)'; g.fillRect(0, 0, c.width, c.height); if (RT.area.id === 'world') { g.fillStyle = '#fff'; g.beginPath(); g.arc((pl.x + WS) * k, (pl.z + WS) * k, 6, 0, 7); g.fill(); g.strokeStyle = '#b3122a'; g.lineWidth = 3; g.stroke(); } for (const t of RT.targets || []) { g.fillStyle = '#ffe040'; g.beginPath(); g.arc((t.x + WS) * k, (t.z + WS) * k, 7, 0, 7); g.fill(); } }
$('menu').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
  if (b.id === 'mclose') return closeMenu(); if (d.tab) { RT.menu = d.tab; selItem = null; sfx('ui'); }
  else if (d.item) { selItem = findItem(d.item); sfx('ui'); } else if (d.attr) { if (S.ap > 0) { S.ap--; S.attr[d.attr]++; recalc(); sfx('ui'); } } else if (d.learn) learn(d.learn); else if (d.bind) { const [k, i] = d.bind.split(':'); S.bar = S.bar.map(x => x === k ? null : x); S.bar[+i] = k; sfx('ui'); }
  else if (d.asc) { const c = ascCost(S.asc[d.asc]); if (S.sigils >= c) { S.sigils -= c; S.asc[d.asc]++; recalc(); sfx('quest'); } } else if (d.poi) return fastTravel(POI.find(p => p.id === d.poi)); else if (d.q) { setQuality(d.q); try { localStorage.setItem('hollowmoon.q', d.q); } catch (er) { } }
  else if (d.cons) { if (RT.menu === 'vendor') { if (!CONS[d.cons].quest) { S.cons[d.cons]--; S.gold += Math.max(1, Math.round(CONS[d.cons].price * 0.4)); sfx('coin'); } } else if (!useCons(d.cons) && !storyUse(d.cons)) sfx('deny'); }
  else if (d.buycons) { const p = CONS[d.buycons].price; if (S.gold >= p) { S.gold -= p; addCons(d.buycons, 1, true); sfx('coin'); } else sfx('deny'); }
  else if (d.bounty) { const bq = S.bounties.find(x => x.id === d.bounty); if (bq.done) payBounty(bq); else if (!bq.acc) acceptBounty(bq); }
  else if (d.act) { const it = selItem;
    if (d.act === 'equip' && it) { equip(it); selItem = null; } else if (d.act === 'unequip' && it) { unequip(it.slot); selItem = null; } else if (d.act === 'salvage' && it) { salvage(it); selItem = null; } else if (d.act === 'salvageall') { S.inv.filter(i => i.rar === 0).forEach(salvage); }
    else if (d.act === 'sell' && it) { S.inv.splice(S.inv.indexOf(it), 1); S.gold += sellPrice(it); selItem = null; sfx('coin'); } else if (d.act === 'buy' && it) { const p = buyPrice(it); if (S.gold >= p && S.inv.length < 60) { S.gold -= p; const st = vendorStock(vendId); st.items.splice(st.items.indexOf(it), 1); S.inv.push(it); selItem = null; sfx('coin'); } else sfx('deny'); }
    else if (d.act === 'forge' && it) upgrade(it); else if (d.act === 'save') { save(true); toast('Saved.'); } else if (d.act === 'export') { const c = exportSave(); $('savecode').value = c; if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => toast('Save code copied.'), () => { $('savecode').select(); }); return; }
    else if (d.act === 'import') { if (importSave($('savecode').value)) location.reload(); else toast('That is not a save code.'); return; } else if (d.act === 'wipe') { if (b.dataset.sure) { try { localStorage.removeItem('hollowmoon.save'); } catch (er) { } if (cloud) cloud.delete().catch(() => { }).then(() => location.reload()); else location.reload(); } else { b.dataset.sure = 1; b.textContent = 'Press again to erase this character'; } return; } }
  renderMenu();
});

/* ---------------- touch ---------------- */
function enableTouch() { if (RT.touch) return; RT.touch = true; document.body.classList.add('touch'); $('touch').hidden = false; }
if (matchMedia('(pointer:coarse)').matches) enableTouch(); addEventListener('touchstart', enableTouch, { once: true, passive: true });
document.querySelectorAll('.pad').forEach(b => { const k = b.dataset.k; b.addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); try { b.setPointerCapture(e.pointerId); } catch (er) { } b.classList.add('on'); K[k] = true; press(k); }); const upf = () => { b.classList.remove('on'); K[k] = false; if (k === 'j') press('mouse0up'); }; b.addEventListener('pointerup', upf); b.addEventListener('pointercancel', upf); });
const joy = $('joy'), stick = $('stick');
joy.addEventListener('pointerdown', e => { audioInit(); try { joy.setPointerCapture(e.pointerId); } catch (er) { } J.id = e.pointerId; J.ox = e.clientX; J.oy = e.clientY; stick.hidden = false; stick.style.left = J.ox + 'px'; stick.style.top = J.oy + 'px'; stick.firstChild.style.transform = ''; });
joy.addEventListener('pointermove', e => { if (e.pointerId !== J.id) return; let dx = e.clientX - J.ox, dy = e.clientY - J.oy; const l = hyp(dx, dy), m = 48; if (l > m) { dx *= m / l; dy *= m / l; } J.x = dx / m; J.y = dy / m; stick.firstChild.style.transform = `translate(${dx}px,${dy}px)`; });
const jend = e => { if (e.pointerId !== J.id) return; J.id = null; J.x = J.y = 0; stick.hidden = true; }; joy.addEventListener('pointerup', jend); joy.addEventListener('pointercancel', jend);
/* Hollow Moon — boot, input routing, the frame loop. */
const LOOKS = { skin: [0xe6cdb8, 0xd3a48a, 0xa5714e, 0x70492f], hair: [0x15100e, 0x4a2f1a, 0x9a7a44, 0x8a2f1a, 0xc0b4a0, 0x2a3a5a], coat: [0x231a22, 0x3a2418, 0x1c2a3a, 0x40181c, 0x2a3324, 0x4a4a52] };
let lookI = { skin: 0, hair: 0, coat: 0, long: 0 };
const curLook = () => ({ skin: LOOKS.skin[lookI.skin], hair: LOOKS.hair[lookI.hair], coat: LOOKS.coat[lookI.coat], long: !!lookI.long });
keyHandlers.push(k => {
  audioInit();
  if (dq) { if (k === 'e' || k === 'enter' || k === ' ') advDlg(); else if (k.length === 1 && '123456'.includes(k)) pickChoice(+k - 1); return true; }
  if (!RT.started || RT.blk) return true;
  if (RT.menu) { if (k === 'tab' || k === 'escape' || k === 'i') closeMenu(); else if (k === 'm' && RT.menu !== 'vendor') { RT.menu = 'map'; renderMenu(); } return true; }
  if (k === 'tab' || k === 'i') { openMenu(); return true; } if (k === 'm') { openMenu('map'); return true; } if (k === 'escape') { openMenu('system'); return true; }
  if (RT.paused || !pl || pl.dead) return true;
  if (k === 'mouse0' || k === 'j') tryAttack(); else if (k === 'k') tryHeavy(); else if (k === ' ') tryDodge(); else if (k === 'f') tryShoot(); else if (k === 'r') quickHeal(); else if (k === 'e') { if (performance.now() - (RT.dlgT || 0) < 450) return true; const it = findInteract(); if (it) it.act(); } else if (k.length === 1 && '1234'.includes(k)) castSkill(+k - 1);
  return true;
});
let lastT = 0, saveT = 40, slowT = 0, frame = 0;
function loop(ts) {
  requestAnimationFrame(loop); const dt = Math.min(0.05, (ts - lastT) / 1000 || 0.016); lastT = ts; frame++;
  if (!pl || !RT.area) return; RT.paused = !!(dq || RT.menu || !RT.started || RT.blk || !$('death').hidden); updMouseWorld();
  if (!RT.paused) {
    RT.time += dt; let g = dt; if (RT.hitstop > 0) { RT.hitstop -= dt; g = dt * 0.05; }
    tickClock(g); updPlayer(g);
    for (let i = actors.length - 1; i >= 0; i--) { const a = actors[i]; if (a.kind === 'enemy') { if (!a.dead) updEnemy(a, g); } else if (a.kind === 'npc') updNpc(a, g); if (a.rig.g.visible) pose(a, g); if (a.gone) removeActor(a); }
    pose(pl, g); updShots(g); updHazards(g); updDrops(g); updSpawns(g); updDecals(g); updParticles(dt);
    slowT -= dt; if (slowT <= 0) { slowT = 2; recalc(); } saveT -= dt; if (saveT <= 0 && RT.combatT <= 0) { saveT = 40; save(); }
  } else if (!RT.started) { pl.rot += dt * 0.5; pose(pl, dt); }
  updSky(dt); updLights(); if (frame % 10 === 0) updChunks(); updCam(dt, !RT.started);
  if (RT.started) { updHud(dt); drawOverlay(RT.paused ? 0 : dt); }
  renderFrame();
}
function begin(fresh, data) {
  audioInit(); if (fresh) newGame(curLook()); else applySave(data);
  mkPlayer(S.pos.x, S.pos.z); const inTomb = S.area === 'tomb'; enterArea('world', inTomb ? { x: -130, z: -164 } : { x: S.pos.x, z: S.pos.z });
  RT.started = true; $('title').hidden = true; $('hud').hidden = false; genBounties();
  if (fresh) { startQuest('q_arrive'); diary('arrive'); say([['', 'The bus lets you off on Main Street at half past four and does not wait.'], ['', "Mystic Falls, Virginia. Your aunt Elspeth's letter said: find Marnie at the Grill, north side of the square. It also said: be indoors by dark. It did not say why."]], null, () => { toast(RT.touch ? 'Left thumb moves. ATTACK strikes; hold it for a heavy blow.' : 'WASD to move. Left mouse attacks; hold it for a heavy blow.'); setTimeout(() => toast(RT.touch ? 'DODGE rolls through attacks. Hold BLOCK, or tap it just in time to parry.' : 'Space dodges. Right mouse blocks; tap it just in time to parry.'), 5400); setTimeout(() => toast(RT.touch ? 'USE talks and opens. The top-right button opens your pack and skills.' : 'E talks and opens. Tab opens your pack, skills and map.'), 10800); }); }
  else toast(`Day ${S.day}. ${MOON[moonPhase()]}. Welcome back.`);
}
function b64buf(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }
let bestSave = null;
function offerSave(o) { if (!o || o.v !== 2 || RT.started) return; if (!bestSave || (o.ts || 0) > (bestSave.ts || 0)) bestSave = o; const c = $('continue'); c.hidden = false; c.textContent = `Continue · level ${bestSave.lvl} ${bestSave.species}, day ${bestSave.day}`; }
function boot() {
  let q = null; try { q = localStorage.getItem('hollowmoon.q'); } catch (e) { } RT.quality = q || (matchMedia('(pointer:coarse)').matches ? 'med' : 'high'); setQuality(RT.quality);
  new T.GLTFLoader().parse(b64buf(window.HM_MODELS), '', g => {
    for (const c of g.scene.children.slice()) MODELS[c.name] = c;
    newGame(curLook()); mkPlayer(-4, 12); enterArea('world', { x: -4, z: 12 }); S.clock = 21.5; pl.rot = 0.4;
    const b = $('begin'); b.disabled = false; b.textContent = 'New game'; b.onclick = () => { if (bestSave && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Start over? Press again'; return; } begin(true); };
    $('continue').onclick = () => begin(false, bestSave); $('respawn').onclick = respawn; $('mclose').onclick = closeMenu; $('tMenu').onclick = () => RT.menu ? closeMenu() : openMenu();
    document.querySelectorAll('[data-look]').forEach(bt => bt.onclick = () => { const k = bt.dataset.look; lookI[k] = (lookI[k] + 1) % (k === 'long' ? 2 : LOOKS[k].length); S.look = curLook(); const r = pl.rot; mkPlayer(pl.x, pl.z); pl.rot = pl.vr = r; sfx('ui'); });
    offerSave(readLocal()); initCloud(offerSave);
    requestAnimationFrame(loop);
  }, e => { $('begin').textContent = 'The models failed to load'; console.error(e); });
}
addEventListener('visibilitychange', () => { if (document.hidden && RT.started) save(true); });
try { if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => { if (RT.started) save(true); return {}; }); } catch (e) { }
window.HM = { get S() { return S; }, get pl() { return pl; }, get P() { return P; }, get RT() { return RT; }, actors, press, K, spawnEnemy, enterArea, genItem, addItem, gainXp, startQuest, qEvent, mkUniq, recalc, save, hit, drops, get area() { return RT.area; }, get info() { return ren.info.render; } };
boot();
})();

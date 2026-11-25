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
addEventListener('keydown', e => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase(); if ([' ', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault(); if (e.repeat) { K[k] = true; return; } if (!K[k]) { K[k] = true; press(k); } });
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
/* Hollow Moon — data: origins, items, affixes, skills, enemies, zones. Balance lives here. Canon rules: see SPEC.md. */
const RAR = [{ n: 'Common', c: '#b8b2a6', m: 1, aff: 0 }, { n: 'Uncommon', c: '#6fbf73', m: 1.12, aff: 1 }, { n: 'Rare', c: '#5b9cf0', m: 1.26, aff: 2 }, { n: 'Epic', c: '#b678f0', m: 1.42, aff: 3 }, { n: 'Legendary', c: '#f0a13c', m: 1.62, aff: 4 }, { n: 'Relic', c: '#e2334a', m: 1.8, aff: 0 }];
const lvlScale = l => (1 + 0.14 * (l - 1)) * Math.pow(1.028, l - 1);          // item + enemy damage curve
const hpScale = l => (1 + 0.2 * (l - 1)) * Math.pow(1.04, l - 1);             // enemy health curve
const xpNeed = l => Math.floor(70 * Math.pow(l, 1.65));

/* ---------------- bloodlines: chosen at character creation, never changed. start = the kit newGame hands out ---------------- */
const ORIGINS = {
  human: { n: 'Human', d: "An ordinary Fell, with nothing in the blood but the family name. The Brotherhood of the Five takes its hunters from people like you, and a Founder's Ring only works on them.", start: { weapon: 'bat', armor: 'jacket', cons: { draught: 2, burger: 1, coffee: 1 } } },
  witch: { n: 'Witch', d: "Thorne blood on your mother's side, the town's old witch line. The craft is asleep in you until a Thorne wakes it, and it is gone for good if you ever become a vampire.", start: { weapon: 'bat', armor: 'coat', cons: { draught: 2, burger: 1, sage: 2 } } },
  siphoner: { n: 'Siphoner', d: 'Born to a coven that calls your kind an abomination. You make no magic of your own: you take it by touch from anything that has some, and you would keep that even as a vampire.', start: { weapon: 'dagger', armor: 'coat', cons: { draught: 2, burger: 1 }, skills: { w_siphon: 1 } } },
  wolf: { n: 'Werewolf gene', d: "Lockwood blood on your father's side: you carry the werewolf curse, asleep. It wakes the first time you take a human life and never sleeps again, so until you choose otherwise you only knock people out.", start: { weapon: 'bat', armor: 'jacket', cons: { draught: 1, burger: 3 } } },
};

/* silver does nothing to anyone in this town: there are no silver weapons. mat is the damage type (see WEAK). */
const BASES = {
  stake: { n: 'Oak Stake', slot: 'weapon', cls: 'fast', dmg: 8, mat: 'wood', model: 'wStake' }, dagger: { n: 'Hunting Knife', slot: 'weapon', cls: 'fast', dmg: 9, mat: 'steel', model: 'wDagger' },
  stiletto: { n: 'Stiletto', slot: 'weapon', cls: 'fast', dmg: 9.6, mat: 'steel', model: 'wDagger', min: 5 }, bat: { n: 'Ash Bat', slot: 'weapon', cls: 'med', dmg: 12, mat: 'wood', model: 'wBat' },
  sword: { n: 'Sabre', slot: 'weapon', cls: 'med', dmg: 13, mat: 'steel', model: 'wSword', min: 3 }, cavalry: { n: 'Cavalry Sabre', slot: 'weapon', cls: 'med', dmg: 13.8, mat: 'steel', model: 'wSword', min: 8 },
  axe: { n: "Woodsman's Axe", slot: 'weapon', cls: 'slow', dmg: 18, mat: 'steel', model: 'wAxe', min: 2 }, great: { n: 'Greatsword', slot: 'weapon', cls: 'slow', dmg: 21, mat: 'steel', model: 'wGreat', min: 9 },
  maul: { n: 'Ironwood Maul', slot: 'weapon', cls: 'slow', dmg: 20, mat: 'wood', model: 'wBat', min: 7 }, staff: { n: 'Hawthorn Staff', slot: 'weapon', cls: 'staff', dmg: 10, mat: 'magic', model: 'wStaff' },
  xbow: { n: 'Crossbow', slot: 'ranged', dmg: 17, cd: 1.3, mat: 'wood', model: 'crossbow', pspd: 36 }, revolver: { n: 'Revolver', slot: 'ranged', dmg: 11, cd: 0.62, mat: 'wood', model: 'revolver', pspd: 52, min: 5 },
  knives: { n: 'Throwing Knives', slot: 'ranged', dmg: 7.5, cd: 0.38, mat: 'steel', model: 'wDagger', pspd: 30 },
  jacket: { n: 'Leather Jacket', slot: 'armor', def: 7, hp: 12 }, coat: { n: 'Long Coat', slot: 'armor', def: 5, hp: 8, st: 12 }, vest: { n: "Hunter's Vest", slot: 'armor', def: 10, hp: 18, min: 4 },
  robe: { n: 'Coven Robe', slot: 'armor', def: 4, hp: 6, fo: 22 }, mail: { n: 'Council Mail', slot: 'armor', def: 15, hp: 26, min: 9 },
  ring: { n: 'Ring', slot: 'ring' }, signet: { n: 'Signet', slot: 'ring' }, band: { n: 'Iron Band', slot: 'ring' }, amulet: { n: 'Amulet', slot: 'amulet' }, locket: { n: 'Locket', slot: 'amulet' }, talisman: { n: 'Talisman', slot: 'amulet' },
};
/* melee move sets: [duration, damage mult] per combo hit; heavy attack. The player's current set is P.wcls (recalc): 'wolf' in wolf form, and a staff in hands
   that hold no magic swings like 'med'. wolf = bite, bite, maul; heavy = pounce (a leap of up to 8 m onto the aim point). Wolf hits are mat 'bite'. */
const CLS = {
  fast: { hits: [[0.24, 0.8], [0.24, 0.8], [0.32, 1.25]], range: 2.5, arc: 1.5, heavy: { kind: 'lunge', dur: 0.5, mult: 2.1, st: 22 }, poise: 12, st: 0 },
  med: { hits: [[0.34, 1], [0.34, 1], [0.46, 1.5]], range: 3.0, arc: 2.1, heavy: { kind: 'over', dur: 0.7, mult: 2.5, st: 28 }, poise: 22, st: 0 },
  slow: { hits: [[0.48, 1.3], [0.48, 1.3], [0.62, 1.9]], range: 3.5, arc: 2.6, heavy: { kind: 'spin', dur: 0.8, mult: 2.2, st: 34 }, poise: 38, st: 0 },
  staff: { hits: [[0.36, 1], [0.36, 1], [0.48, 1.4]], range: 3.0, arc: 2.0, heavy: { kind: 'blast', dur: 0.75, mult: 2.4, st: 20 }, poise: 14, st: 0, bolt: true },
  wolf: { hits: [[0.27, 0.9], [0.27, 0.9], [0.42, 1.7]], range: 2.7, arc: 1.8, heavy: { kind: 'pounce', dur: 0.55, mult: 2.4, st: 24, dist: 8 }, poise: 24, st: 0, mat: 'bite' },
};
/* affixes: [key, label, min, max, perLevelGrowth, slots]. vsV counts against fam vampire, hybrid and original; vsW against fam wolf and hybrid; vsS against spirits. */
const AFF = [
  ['dmg', 'Savage', 3, 7, 0.06, 'weapon ranged ring amulet'], ['crit', 'Keen', 2, 5, 0.03, 'weapon ranged ring amulet'], ['critd', 'Cruel', 8, 18, 0.25, 'weapon ranged ring'],
  ['hp', 'Stalwart', 8, 18, 1.6, 'armor ring amulet'], ['st', 'Tireless', 6, 14, 0.5, 'armor ring'], ['fo', 'Arcane', 8, 16, 0.6, 'armor amulet weapon'],
  ['def', 'Warded', 3, 7, 0.5, 'armor ring'], ['ls', 'Leeching', 1, 2.5, 0.02, 'weapon ring'], ['spd', 'Fleet', 2, 5, 0.03, 'armor amulet'], ['as', 'Quick', 3, 7, 0.04, 'weapon ring'],
  ['cdr', 'Focused', 3, 6, 0.04, 'amulet ring weapon'], ['xp', 'Learned', 4, 8, 0.05, 'amulet ring'], ['gold', 'Gilded', 8, 16, 0.2, 'amulet ring armor'], ['mf', 'Fortunate', 5, 10, 0.15, 'amulet ring'],
  ['regen', 'Mending', 0.3, 0.7, 0.03, 'armor amulet'], ['vsV', 'Slaying', 8, 16, 0.15, 'weapon ranged'], ['vsW', 'Wolfsbane-laced', 8, 16, 0.15, 'weapon ranged'], ['vsS', 'Veil-touched', 8, 16, 0.15, 'weapon ranged amulet'],
  ['spell', 'Witching', 5, 10, 0.12, 'weapon amulet ring armor'], ['burn', 'Smouldering', 3, 6, 0.5, 'weapon ranged'], ['thorns', 'Barbed', 3, 6, 0.6, 'armor'],
  ['mig', 'of Might', 1, 3, 0.12, 'weapon armor ring amulet'], ['fin', 'of Finesse', 1, 3, 0.12, 'weapon ranged armor ring amulet'], ['vig', 'of Vigor', 1, 3, 0.12, 'armor ring amulet'], ['wil', 'of Will', 1, 3, 0.12, 'weapon armor ring amulet'],
];
const AFFD = { dmg: '+{v}% damage', crit: '+{v}% critical chance', critd: '+{v}% critical damage', hp: '+{v} health', st: '+{v} stamina', fo: '+{v} focus', def: '+{v} armour', ls: '{v}% life steal', spd: '+{v}% movement speed', as: '+{v}% attack speed', cdr: '{v}% faster cooldowns', xp: '+{v}% experience', gold: '+{v}% gold found', mf: '+{v}% better loot', regen: '+{v} health per second', vsV: '+{v}% damage to vampires and hybrids', vsW: '+{v}% damage to werewolves and hybrids', vsS: '+{v}% damage to spirits', spell: '+{v}% spell power', burn: '{v} fire damage on hit', thorns: '{v} damage to attackers', mig: '+{v} Might', fin: '+{v} Finesse', vig: '+{v} Vigor', wil: '+{v} Will' };
/* relics. bound: cannot be sold or salvaged (see isBound). The effects in d are implemented in recalc / daylightSafe / immuneCompel / playerDeath unless noted. */
const UNIQ = {
  daylight: { n: 'Daylight Ring', base: 'ring', bound: 1, aff: [['hp', 30]], d: 'Lapis lazuli, spelled by a witch for one vampire. While you wear it the sun does not burn you. It cannot be sold, and the witch who made it can unmake it from anywhere.' },
  moonring: { n: 'Moonlight Ring', base: 'band', aff: [['hp', 40], ['def', 12]], d: "Black kyanite. A werewolf who wears it is not forced to turn on the full moon and may choose to. On that night the wolf's strength and its venom are yours in either shape." },
  whiteoak: { n: 'White Oak Stake', base: 'stake', mult: 1.25, aff: [['crit', 10]], d: 'Carved from the old Wickery Bridge sign. Against anything else it is only wood. Through the heart of a downed Original it is the end of him, and of everyone he ever made. It burns up when it is used that way.' },
  watch: { n: "Founder's Pocket Watch", base: 'amulet', aff: [['mf', 25], ['crit', 6]], d: 'A compass spelled into a watch case in 1864. Vampires and hybrids show on your map. If you are one, the needle only spins.' },
  vlocket: { n: "Elspeth's Vervain Locket", base: 'locket', aff: [['hp', 30], ['wil', 3]], d: 'Packed with vervain. Whoever wears it cannot be compelled. It burns a vampire who tries to put it on.' },
  fring: { n: "Founder's Ring", base: 'signet', aff: [['hp', 25], ['def', 8]], d: 'Brings back an ordinary human killed by something supernatural. It does nothing for a witch, a werewolf, a hunter of the Five or the dead, and nothing against an ordinary death. Each time it keeps a little of you: 2% of your health, for good.' },
  halebow: { n: "Hale's Crossbow", base: 'xbow', mult: 1.4, aff: [['vsV', 30], ['crit', 8]], d: 'Thirty years of practice in the stock. Its wooden bolts pierce.' },
  corvin: { n: "Corvin's Signet", base: 'signet', aff: [['ls', 6], ['dmg', 18], ['critd', 30]], d: 'A thousand years on one hand. On a vampire it adds 1% damage for every night since they turned, up to 20%.' },
  wardblade: { n: "Warden's Oath", base: 'great', mult: 1.35, aff: [['def', 20], ['dmg', 12]], d: 'Heavy blows send a shockwave through the stone. A heavy blade takes heads.' },
  grimoire: { n: 'Thorne Grimoire', base: 'talisman', aff: [['spell', 35], ['fo', 40], ['cdr', 12]], d: 'Nine generations of marginalia.' },
  ripper: { n: "Ripper's Band", base: 'band', aff: [['dmg', 10], ['ls', 3]], d: 'Two percent more damage for every ten humanity you have lost.' },
  alphafang: { n: "Alpha's Fang", base: 'dagger', mult: 1.3, aff: [['as', 15], ['crit', 12]], d: 'Still wet. Werewolf venom: a vampire it cuts loses 60% of the blow again every second for 6 seconds and cannot heal. It does nothing extra to anything else, and an Original only sickens.' },
};
/* supplies. quest: cannot be sold. useCons (40-systems) implements every effect written here; quest items with no direct use fall through to storyUse. */
const CONS = {
  draught: { n: 'Healing Draught', d: 'Restores 40% of your health.', price: 28, icon: '✚' }, tonic: { n: 'Focus Tonic', d: 'Restores 60% of your focus. A siphoner has nothing for it to wake.', price: 30, icon: '✦' },
  bloodbag: { n: 'Blood Bag', d: 'Human blood, given willingly. A vampire: 50 blood and a quarter of your health. In transition: drinking it completes the change.', price: 40, icon: '♥' },
  burger: { n: 'Grill Special', d: 'A minute of steady healing for the living. A vampire can eat it. It just does not help.', price: 12, icon: '◉' },
  bourbon: { n: 'Bourbon', d: "Takes the edge off the craving: a vampire's blood drains at half speed for three minutes.", price: 15, icon: '◉' },
  coffee: { n: 'Vervain Coffee', d: "The Grill's bitter coffee. Nobody can compel the living for a day after a cup. It burns a vampire all the way down.", price: 8, icon: '◉' },
  vervain: { n: 'Vervain Sprig', d: 'Coat your weapon: +50% damage to vampires and hybrids for 90 seconds, and each hit leaves them weakened. Burns a vampire who touches it.', price: 14, icon: '❋' },
  wolfsbane: { n: 'Wolfsbane', d: 'Coat your weapon: +60% damage to werewolves and hybrids for 90 seconds, and each hit leaves them weakened. Burns a werewolf who touches it. An ordinary animal does not care.', price: 14, icon: '❋' },
  sage: { n: 'White Sage', d: 'Burn it: for 20 seconds nothing short of a witch or a spirit can overhear or track you. Enemies lose you and suspicion fades. Striking or casting clears the smoke.', price: 10, icon: '❋' },
  scrap: { n: 'Scrap', d: 'Salvage. The Council armourer uses it to reforge gear.', price: 3, icon: '▣' },
  vblood: { n: 'Vial of Vampire Blood', d: 'Heals you completely and stays in you for a day. Die in that day and you wake in transition. It does nothing more for someone who has taken the Cure.', price: 0, icon: '♦', quest: 1 },
  hblood: { n: 'Blood of the First', d: "Corvin's blood. It heals, and it is the only cure for a werewolf bite. For a day after drinking it: a werewolf who dies wakes in transition to a hybrid, a human to a vampire of his line.", price: 0, icon: '♦', quest: 1 },
  dblood: { n: "Doppelgänger's Blood", d: "Elise Gilroy's blood, drawn while she is human. The only thing that completes a hybrid's transition.", price: 0, icon: '♦', quest: 1 },
  ashdagger: { n: 'White Oak Ash Dagger', d: 'A silver dagger dipped in white oak ash. In the heart of an Original it holds him as dead until it is drawn out. It kills any ordinary vampire who uses it, and it does nothing at all to a hybrid.', price: 0, icon: '◆', quest: 1 },
  oakwood: { n: 'Wickery Bridge Sign', d: 'The sign from the old bridge. White oak, like the rest of it was. Someone who knows wood could carve a stake from this.', price: 0, icon: '◆', quest: 1 },
  kyanite: { n: 'Black Kyanite', d: 'A witch can spell it into a moonlight ring.', price: 0, icon: '◆', quest: 1 }, moonstone: { n: 'Moonstone', d: 'It gives its holder nothing. It binds a curse, and it is one part of the ritual that breaks one.', price: 0, icon: '◆', quest: 1 },
  talisman: { n: 'Thorne Talisman', d: "Emeline Thorne's crystal. It opens what she sealed.", price: 0, icon: '◆', quest: 1 },
  cure: { n: 'The Cure', d: 'One dose. Makes a vampire human for good: whoever takes it can never be turned again.', price: 0, icon: '♦', quest: 1 }, lapisq: { n: 'Lapis Lazuli', d: 'A witch can bind the sun into it.', price: 0, icon: '◆', quest: 1 },
  locket: { n: 'Tarnished Locket', d: 'Engraved: E.F., 1864. It smells faintly of vervain.', price: 0, icon: '◆', quest: 1 },
};

/* ---------------- skills ----------------
   cost keys: st stamina, fo focus, bl blood, rg rage, hp fraction of max health. ok() is an extra requirement beyond the tree being open (learn/canLearn check it; okD says why not).
   Passive numbers are applied in recalc (40-systems) and must not be applied again elsewhere. Notes after "//" are for whoever implements ABIL. */
const SK = {
  h_weapon: { tree: 'hunter', n: 'Weapon Training', max: 5, req: 0, d: r => `+${6 * r}% melee damage.` },
  h_marks: { tree: 'hunter', n: 'Marksman', max: 5, req: 0, d: r => `+${8 * r}% ranged damage, ${5 * r}% faster reload.` },
  h_cond: { tree: 'hunter', n: 'Conditioning', max: 5, req: 0, d: r => `+${10 * r} stamina, +${8 * r}% stamina recovery.` },
  h_parry: { tree: 'hunter', n: 'Riposte', max: 3, req: 2, d: r => `A wider parry window. Your next hit after a parry deals +${50 * r}% damage.` },
  // h_gren: hazard at aimPoint(13), r 4.4, fuse 0.55 s, mat 'verv' (WEAK does the 60% / 30%). On fam vampire|hybrid|original: stun, fx.burn 4 s, fx.verv 6 s (fx.verv on an enemy = deals 25% less, no healing).
  h_gren: { tree: 'hunter', n: 'Vervain Grenade', max: 3, req: 3, act: 1, cd: 14, cost: { st: 20 }, d: r => `Throw a vervain grenade: ${120 + 40 * r}% weapon damage as vervain in a 4.4 metre circle. Vervain does 60% more to vampires and hybrids, burns them, stuns them for ${1 + r} seconds and leaves them weakened for 6. Anyone else takes a 30% concussion and nothing more.` },
  // h_wgren: same throw, mat 'wolfsbane', on fam wolf|hybrid: stun, fx.burn 4 s, fx.wolfsbane 6 s (deals 25% less, no healing, slowed).
  h_wgren: { tree: 'hunter', n: 'Wolfsbane Grenade', max: 3, req: 4, act: 1, cd: 14, cost: { st: 20 }, d: r => `Throw a wolfsbane grenade: ${120 + 40 * r}% weapon damage as wolfsbane in a 4.4 metre circle. Wolfsbane does 60% more to werewolves and 50% more to hybrids, burns them, stuns them for ${1 + r} seconds and leaves them weak and slow for 6. Anyone else takes a 30% concussion. A timber wolf is only a wolf.` },
  // h_heart: the blow is mat 'wood' whatever is equipped ('whiteoak' with the White Oak Stake). "Staked for good" = permanent kill of fam vampire. Never finishes fam hybrid or original.
  h_heart: { tree: 'hunter', n: 'Heartseeker', max: 3, req: 5, act: 1, cd: 10, cost: { st: 25 }, d: r => `Lunge up to 9 metres and drive wood at the heart for ${260 + 40 * r}%. A vampire that is downed, staggered or below ${20 + 5 * r}% health is staked for good; a keeper has to be down, or at half that. Any other ordinary enemy below ${15 + 5 * r}% dies outright. A hybrid only falls over, and an Original gets up again.` },
  h_whirl: { tree: 'hunter', n: 'Whirlwind', max: 3, req: 8, act: 1, cd: 9, cost: { st: 30 }, d: r => `Spin, hitting everything around you ${2 + r} times for 80% weapon damage.` },
  h_volley: { tree: 'hunter', n: 'Volley', max: 3, req: 10, act: 1, cd: 11, cost: { st: 22 }, d: r => `Loose ${3 + 2 * r} shots in a fan.` },
  h_second: { tree: 'hunter', n: 'Second Wind', max: 3, req: 12, d: r => `Falling below 30% health heals ${10 + 10 * r}% once every 90 seconds.` },
  h_slayer: { tree: 'hunter', n: "Slayer's Momentum", max: 5, req: 15, d: r => `Each kill grants +${2 + r}% damage for 10 seconds, stacking five times.` },
  // h_device: affects enemies of fam vampire|hybrid|original (Originals for 60% of the time) and fam wolf (either shape); never fam human|witch|animal|spirit. If isVamp() || isWolf() || S.origin === 'wolf' the player is stunned for the same time.
  h_device: { tree: 'hunter', n: "The Founders' Device", max: 3, req: 18, act: 1, cd: 240, cost: { st: 40 }, d: r => `Wind the Device. Every vampire, hybrid and werewolf within 30 metres drops, helpless, for ${4 + r} seconds; an Original is up again a little sooner. Humans and witches hear nothing. If you are one of them, or only carry the wolf gene, it drops you too.` },
  // h_five: immunity lives in immuneCompel(); the damage is folded into P.vsV by recalc (do not multiply again in hit); S.flags.mark is counted in qEvent('kill').
  h_five: { tree: 'hunter', n: 'Brotherhood of the Five', max: 1, req: 25, ok: () => S.origin === 'human' && S.species === 'human' && !S.transition, okD: 'Only an ordinary human can carry the mark.', d: () => `Nobody can compel you, not even an Original. The Hunter's Mark grows up your arm: +10% damage to vampires, hybrids and Originals, and 1% more for every two you kill, up to +50%. A Founder's Ring stops working for you. If you ever turn, the mark is gone.` },

  w_attune: { tree: 'witch', n: 'Attunement', max: 5, req: 0, d: r => `+${8 * r}% spell power, +${10 * r} focus.` },
  w_chan: { tree: 'witch', n: 'Channeling', max: 5, req: 0, d: r => `+${12 * r}% focus recovery. On a full-moon night, and inside Coven Hollow, you draw on something larger: +${6 * r}% spell power, and focus comes back twice as fast.` },
  w_incend: { tree: 'witch', n: 'Incendia', max: 5, req: 0, act: 1, cd: 6, cost: { fo: 22 }, d: r => `A cone of fire 9 metres long for ${140 + 30 * r}% spell damage. Enemies burn for 4 seconds and the ground for 3.5. Fire is one of the things that ends a vampire for good.` },
  // w_aneur: fam vampire|hybrid|wolf full effect; fam original half the stun; fam human|witch|animal the lesser effect; fam spirit nothing at all (show "NO BLOOD").
  w_aneur: { tree: 'witch', n: 'Pain Infliction', max: 3, req: 3, act: 1, cd: 12, cost: { fo: 30 }, d: r => `Burst the blood vessels of everything within 10 metres. Vampires, hybrids and werewolves drop for ${2 + 0.5 * r} seconds and take ${110 + 30 * r}% spell damage; they heal, so you can do it again. Originals shake it off in half the time. The living are stunned for 1 second and take ${50 + 15 * r}%. A spirit has no blood to burst.` },
  w_ward: { tree: 'witch', n: 'Protection Spell', max: 3, req: 5, act: 1, cd: 16, cost: { fo: 25 }, d: r => `A barrier that absorbs damage equal to ${20 + 10 * r}% of your health for 8 seconds.` },
  // w_cloak: pl.buff.cloak = duration. While > 0 enemies cannot target the player (drop aggro, walk home); any attack or other cast by the player ends it.
  w_cloak: { tree: 'witch', n: 'Cloaking Spell', max: 3, req: 5, act: 1, cd: 20, cost: { fo: 28 }, d: r => `For ${4 + 2 * r} seconds nothing can see or hear you, except a witch or a spirit. Enemies lose you and go back to what they were doing. Striking or casting ends it.` },
  // w_motus: target = aimTarget(13). Bosses: no throw, poise damage 80 instead.
  w_motus: { tree: 'witch', n: 'Motus', max: 3, req: 8, act: 1, cd: 9, cost: { fo: 34 }, d: r => `Throw an enemy within 13 metres without touching it: ${150 + 30 * r}% spell damage, hurled 8 metres and stunned for 1.5 seconds. Everything within 3 metres of where it lands takes half. Keepers are too heavy to throw; they stagger.` },
  // w_bound: circle r 5 at aimPoint(12). Enemies inside get fx.root (cannot leave the circle; they can still attack inside it) and fx.slow for the duration. Bosses and Originals are held too.
  w_bound: { tree: 'witch', n: 'Boundary Spell', max: 3, req: 10, act: 1, cd: 22, cost: { fo: 36 }, d: r => `Draw a circle 10 metres across at a point within 12 metres. For ${5 + r} seconds no enemy inside can leave it, and they move slowly. It holds anything. It held an Original once.` },
  w_herb: { tree: 'witch', n: 'Herbalist', max: 3, req: 4, d: r => `Draughts, tonics and burning sage are ${15 * r}% stronger. Herb patches yield one more.` },
  // w_spirit: recalc gives P.spellCrit and P.spiritFoc (focus per kill); both are 0 with Expression, and for a Heretic.
  w_spirit: { tree: 'witch', n: "Spirits' Favour", max: 5, req: 12, d: r => `The dead witches of the Hollow lean in: +${3 * r}% critical chance with spells, and each kill restores ${3 * r} focus. They turn their backs on Expression, and on the dead.` },
  // w_siphon: needs a target within 3 m of fam vampire|hybrid|original|wolf|witch|spirit, or an active enemy ward/boundary, or the Hollow altar (fills focus). Red glow on the hand.
  //           fam vampire target ending below 15% health -> desiccated: permanently down, grey (Originals: stunned 4 s instead). With no target a Heretic turns 12 blood into the same focus.
  //           If S.venomUntil is set and S.heretic: call cureVenom('siphon') instead of anything else.
  w_siphon: { tree: 'witch', n: 'Siphon', max: 3, req: 0, act: 1, cd: 5, cost: {}, ok: () => S.origin === 'siphoner', okD: 'Only a born siphoner can do this.', d: r => `Lay a hand on something supernatural within 3 metres and take its magic: ${22 + 8 * r} focus, and ${60 + 20 * r}% spell damage to it. Vampires, hybrids, werewolves, witches, spirits and wards all hold some; people and animals hold none. A vampire drained below 15% health desiccates and stays down. A Heretic with nothing to touch draws on her own vampirism, 12 blood at a time, and can siphon werewolf venom out of herself.` },
  // w_desic: target within 3 m, fam vampire|hybrid|original, and (stunned | rooted | downed | below 35% health), else refuse and refund. Ordinary: permanent kill, grey corpse.
  //          fam original: desiccated = out of the fight (counts as defeated, not as killed by white oak; the sire line lives).
  w_desic: { tree: 'witch', n: 'Desiccation', max: 1, req: 18, act: 1, cd: 90, cost: { fo: 50, hp: 0.35 }, d: () => `Stop a vampire's heart with your hand on it. The balance is a living heart, and you pay it yourself: 35% of your health. It only takes on a vampire within 3 metres that is stunned, held in a Boundary, downed or below 35% health. An ordinary vampire or hybrid greys and never gets up. An Original lies desiccated until someone feeds him, and his line lives.` },
  // w_express: every living witch may cast with too little focus by paying 10% of max health (nosebleed); Expression makes that 5%. A siphoner with no focus cannot cast at all.
  w_express: { tree: 'witch', n: 'Expression', max: 1, req: 25, d: () => `Magic that answers to no spirit and no balance. +30% spell power. Casting with no focus left costs 5% of your health instead of the usual 10%. Spirits' Favour stops working.` },

  l_might: { tree: 'wolf', n: 'Might', max: 5, req: 0, d: r => `+${3 * r}% health in either shape. As a person, +${4 * r}% melee damage. As a wolf, +${8 * r}% bite damage.` },
  l_regen: { tree: 'wolf', n: 'Quick Healing', max: 5, req: 0, d: r => `You heal ${(0.2 * r).toFixed(1)}% of your health every second, half as much again as a wolf. Slower than a vampire, and wolfsbane stops it.` },
  l_senses: { tree: 'wolf', n: 'Senses', max: 3, req: 2, d: r => `+${4 * r}% critical chance. You smell them first: everything within ${20 + 10 * r} metres shows on your map.` },
  // l_rage: pl.buff.fury = duration, then recalc(). pl.rage (0-100) fills from hits dealt (+3) and taken (+6), times P.rageGain; drains 2 per second out of combat. Yellow eyes while fury > 0; no stagger or stun on the player.
  l_rage: { tree: 'wolf', n: 'Fury', max: 3, req: 3, act: 1, cd: 20, cost: { rg: 30 }, d: r => `Let the anger out for ${6 + 2 * r} seconds: +${20 + 10 * r}% damage, +15% speed, your eyes go yellow and nothing can stagger you. Costs 30 rage. Rage builds as you hit and are hit, faster near the full moon, and even unspent it adds up to 15% damage.` },
  // l_pounce: target aimTarget(10); land on it. mat 'bite' in wolf form, else the weapon. Venom per P.venom when it is > 0.
  l_pounce: { tree: 'wolf', n: 'Pounce', max: 3, req: 5, act: 1, cd: 8, cost: { st: 20 }, d: r => `Leap up to 10 metres onto an enemy: ${200 + 50 * r}% damage, and it is knocked flat for ${1 + 0.5 * r} seconds. As a wolf it is a bite, and carries your venom.` },
  // l_howl: enemies within 12 m: fx.slow; non-boss fam human|animal flee for the duration. With l_alpha: also spawn 2 'wolf' allies at the player's level for 30 s (team 0, no loot).
  l_howl: { tree: 'wolf', n: 'Howl', max: 3, req: 8, act: 1, cd: 30, cost: { st: 15 }, d: r => `Every enemy within 12 metres is slowed for ${3 + r} seconds, and ordinary people and animals break and run. You gain ${15 + 5 * r} rage.` },
  // l_venom: P.venom (recalc) is the fraction of the bite dealt again each second for 8 s, as mat 'venom', to fam vampire (no healing meanwhile). 0 = not venomous right now.
  //          fam original: fx.slow and deals 20% less for 8 s, no damage. Nothing on any other family. Without this skill a bite in wolf form still carries 30%.
  l_venom: { tree: 'wolf', n: 'Werewolf Venom', max: 3, req: 10, d: r => `Your bite poisons vampires: ${40 + 20 * r}% of the bite again every second for 8 seconds, and they cannot heal. It is slow death to an ordinary vampire and only a fever to an Original. A werewolf is venomous only as a wolf. A hybrid, or the wearer of a moonlight ring on the full moon, is venomous in either shape.` },
  l_moon: { tree: 'wolf', n: 'Moonblood', max: 5, req: 12, d: r => `Your strength follows the moon. At the full moon: +${6 * r}% damage and +${2 * r}% speed on top of what the moon already gives you. At the new moon, nothing.` },
  // l_bones: recalc gives P.shiftT (seconds of helpless change) and P.shiftHp (fraction of max health it costs). Forced full-moon changes cost nothing.
  l_bones: { tree: 'wolf', n: 'Broken In', max: 3, req: 6, d: r => `Every bone breaks each time. You are getting used to it: a willing change takes ${(3 - 0.8 * r).toFixed(1)} seconds instead of 3 and costs ${12 - 3 * r}% of your health instead of 12%.` },
  // l_alpha: enemies of type 'wolf', 'packrunner' and non-boss 'werewolf' are neutral to the player unless struck.
  l_alpha: { tree: 'wolf', n: 'Alpha', max: 1, req: 25, d: () => `Timber wolves and the Falls pack no longer attack you unless you strike first. Your Howl calls two wolves, who fight beside you for 30 seconds.` },

  v_pred: { tree: 'vampire', n: 'Predator', max: 5, req: 0, d: r => `+${5 * r}% melee damage, ${r}% life steal.` },
  // v_heal: rate = sk('v_heal') * 0.004 * P.healM of max health per second while blood > 0 (P.healM is 0 with wood lodged, vervain or venom in you; 0.5 on animal blood).
  v_heal: { tree: 'vampire', n: 'Healing Factor', max: 5, req: 0, d: r => `Regenerate ${(0.4 * r).toFixed(1)}% of your health every second while you have blood. Half as fast on animal blood. It stops while wood is lodged in you, and under vervain or werewolf venom.` },
  v_blur: { tree: 'vampire', n: 'Blur', max: 3, req: 0, d: r => `Your dodge travels ${20 * r}% further${r >= 3 ? ' and strikes everything you pass through' : ''}.` },
  // v_frenzy: fam human|witch: full; fam animal|wolf|hybrid: half heal and blood, and S.diet = 'animal' for fam animal; fam vampire|original|spirit: damage only. def.verv target: no blood, player takes 10% max health and fx.verv 6 s.
  v_frenzy: { tree: 'vampire', n: 'Feeding Frenzy', max: 3, req: 0, act: 1, cd: 8, cost: {}, d: r => `Leap up to 10 metres onto an enemy and feed: ${180 + 40 * r}% damage. Human blood heals 14% of your health and restores ${20 + 5 * r} blood. Animal and werewolf blood gives half. Vampires and spirits give nothing, and vervain in the blood burns you instead.` },
  // v_compel: allowed only on fam human without def.verv / def.five. With S.original && sk('o_compel'): also fam vampire|hybrid without fx.verv, for half the time; never fam original. Everything else: float "IMMUNE" (or "VERVAIN") and refund.
  v_compel: { tree: 'vampire', n: 'Compulsion', max: 3, req: 3, act: 1, cd: 22, cost: { bl: 18 }, d: r => `Catch the eye of a human within 11 metres and they fight for you for ${8 + 4 * r} seconds, half that if you live on animal blood. It fails on anyone with vervain in them, and it has never worked on witches, werewolves, the Five, spirits or other vampires. A keeper only stands still for 3 seconds.` },
  // v_step: a straight dash (collide() each step, a streak not smoke); target aimTarget(15).
  v_step: { tree: 'vampire', n: 'Vamp Speed', max: 3, req: 6, act: 1, cd: 9, cost: { bl: 12 }, d: r => `A rush too fast to follow, up to 15 metres in a straight line, ending in a blow for ${220 + 60 * r}% that always lands critically. Everything in your path takes 60%. It is speed, not vanishing: a wall stops you.` },
  // v_ripper: a toggle, not a buff: call flipSwitch(); it sets S.switchOff, applies the guilt and recalcs. The bonuses are in recalc. Colour drain on screen while S.switchOff.
  v_ripper: { tree: 'vampire', n: 'The Switch', max: 3, req: 10, act: 1, cd: 4, cost: {}, d: r => `Your humanity is a switch, and this turns it off or back on. Off: +${15 + 5 * r}% damage, +10% speed, +3% life steal, and killing costs you nothing. But humanity cannot rise and drains by 1 every minute. Turning it back on brings all of it back at once: 20 seconds dealing 30% less, and 5 seconds more for every kill you made while it was off.` },
  v_sense: { tree: 'vampire', n: "Predator's Senses", max: 3, req: 4, d: r => `+${4 * r}% critical chance. You hear heartbeats: everything living shows on your map.` },
  // v_snap: target aimTarget(8), dash behind it. Non-elite fam human|witch: dies. fam vampire|hybrid: downed for the time given, then rises (not a kill). fam wolf: executes below the threshold, else damage.
  //         Bosses, elites and fam original: only if stunned, and then 2 s more stun plus the damage. fam spirit|animal: plain damage. Killing fam human|witch this way: S.humanity -5 unless S.switchOff.
  v_snap: { tree: 'vampire', n: 'Neck Snap', max: 3, req: 8, act: 1, cd: 14, cost: { bl: 10 }, d: r => `Blur behind a target within 8 metres and break its neck. A person dies. A vampire or hybrid drops for ${4 + 2 * r} seconds and then gets back up. A werewolf below ${20 + 10 * r}% health dies; above that it takes ${200 + 50 * r}%. Keepers, champions and Originals can only be caught while staggered, and only lose 2 seconds. Killing a person this way costs 5 humanity.` },
  // v_heart: target within 3 m. If downed | stunned | below the threshold: permanent kill of any fam except original (and bosses must be downed or below the threshold). fam original: goes down as from any "death". fam spirit: no heart, refuse.
  v_heart: { tree: 'vampire', n: 'Heart Extraction', max: 3, req: 14, act: 1, cd: 16, cost: { bl: 14 }, d: r => `Reach into a target within 3 metres that is downed, staggered or below ${20 + 5 * r}% health and take the heart. It ends anything that can die: vampires, hybrids, werewolves, witches, people. On anything healthier it is a blow for ${240 + 40 * r}%. An Original gets up again regardless.` },
  v_fed: { tree: 'vampire', n: 'Well Fed', max: 5, req: 12, d: r => `While your blood is above 70% and it is human blood: +${4 * r}% damage and +${2 * r}% speed.` },
  v_elder: { tree: 'vampire', n: 'Age', max: 5, req: 25, d: r => `A vampire grows stronger with every year. +${6 * r}% health, damage and blood.` },

  o_might: { tree: 'original', n: 'First Blood', max: 5, req: 0, d: r => `Stronger and faster than any vampire, whatever its age. +${8 * r}% damage, +${4 * r}% health, +${3 * r}% speed.` },
  // o_compel: see v_compel.
  o_compel: { tree: 'original', n: 'Compel the Dead', max: 1, req: 2, d: () => `Your Compulsion also takes vampires and hybrids, for half as long; a keeper among them stands still for 3 seconds. Vervain still blocks it, and no Original can compel another.` },
  // o_undying: handled in playerDeath (40-systems).
  o_undying: { tree: 'original', n: 'Undying', max: 3, req: 4, d: r => `Nothing but white oak ends you. When you would die you lie grey where you fell for four seconds, then rise with ${30 + 10 * r}% of your health. It cannot happen again for ${5 - r} hours of the clock; fall sooner and you wake at home like anyone else.` },
  // o_sire: in v_compel, a compelled fam vampire|hybrid below 50% health becomes e.ally = 1 (team 0 for good, follows the player) while fewer than r allies live.
  o_sire: { tree: 'original', n: 'Sire', max: 3, req: 6, d: r => `A vampire or hybrid you compel while it is below half health is yours for good: it follows you and fights for you until it dies. You can keep ${r}.` },
};
/* d: shown when the tree is open. shut(): why it is closed, for this character. */
const TREES = {
  hunter: { n: 'Hunter', d: 'Stakes, vervain and nerve. Open to anyone.', shut: () => '' },
  witch: { n: 'Witch', d: 'Spells cost focus. Cast with too little and it comes out of you instead, starting with the nose.', shut: () => S.origin === 'siphoner' ? 'You became a vampire without your siphoning. That should not be possible.' : S.origin !== 'witch' ? 'Magic is inherited. It is not in your blood.' : S.species !== 'human' ? 'A witch who becomes a vampire loses her magic for good.' : 'The craft is asleep in you. Odette Thorne could wake it.' },
  wolf: { n: 'Werewolf', d: "Strength, speed and healing below a vampire's, rising with the moon and with rage. The wolf comes out on the full moon whether you like it or not. G changes your shape when you are allowed to choose.", shut: () => S.origin !== 'wolf' ? 'The curse is inherited. A bite does not pass it on.' : S.species === 'vampire' ? 'The gene never woke, and now it never will.' : 'The curse is asleep. It wakes with the first human life you take.' },
  vampire: { n: 'Vampire', d: 'Blood is strength. Wood, fire, vervain and the sun are the price.', shut: () => S.transition ? 'You are in transition. Nothing here is yours until you feed.' : S.flags.cured ? 'You took the Cure. You can never be turned again.' : 'Only the dead may learn this.' },
  original: { n: 'Original', d: 'The first of a line. Only white oak ends you.', shut: () => 'There were only ever a handful of these, and all of them are a thousand years old.' },
};
const ASC = { pow: { n: 'Power', d: '+2% damage per rank' }, vit: { n: 'Vitality', d: '+2% health per rank' }, swi: { n: 'Swiftness', d: '+1% cooldown recovery and attack speed per rank' }, fort: { n: 'Fortune', d: '+2% better loot and gold per rank' } };
const ascCost = r => 4 + r * 3 + Math.floor(r * r * 0.35);

/* ---------------- enemies ---------------- */
/* attacks: kind melee|lunge|slam|shoot|nova|blink|summon. dmg is a multiplier of the enemy's damage. New attacks use the old kinds, so they work as plain blows even
   where a flag is ignored; flags ask for the canon behaviour:
   mat      damage type of the blow (default: steel, magic for orbs and spirits, wood for xbolt)
   venom    a werewolf bite: on a vampire player call envenom(e)
   grab     grab-and-feed: on hit root the player for `root` seconds and heal the attacker `heal` x its max health
   snap     neck-snap grab: on hit stun the player for `stun` seconds (a human player takes dmg x 1.6 instead)
   gaze     telegraphed compulsion, no damage: if the player is inside the cone, facing the attacker and !immuneCompel(e.def.original), set pl.fx.charm = `charm` seconds
   tk       telekinetic throw: an unseen shove; knock the player back `kb` metres
   far      slam centred on the target's position instead of the attacker's
   boundary a circle the player cannot leave for `root` seconds if still inside when it closes; no damage
   aneurysm pain infliction: on hit stun `stun` seconds; on a vampire, hybrid or werewolf player also lock that tree's skills for the stun; fam spirit attackers use it only on vampires
   vs       only chosen when S.species is in the list
   Vampires, hybrids and Originals have no magic: no orbs, no blinks. claw / claw3 are bare-handed flurries (no claws on the model). */
const ATK = {
  slash: { kind: 'melee', range: 2.6, arc: 1.7, wind: 0.5, rec: 0.6, dmg: 1, cd: 1.3 }, claw: { kind: 'melee', range: 2.4, arc: 1.6, wind: 0.34, rec: 0.25, dmg: 0.7, cd: 1.2, reps: 2 },
  claw3: { kind: 'melee', range: 2.6, arc: 1.8, wind: 0.3, rec: 0.2, dmg: 0.7, cd: 1.6, reps: 3 }, touch: { kind: 'melee', range: 2.2, arc: 2.2, wind: 0.6, rec: 0.7, dmg: 1, cd: 1.5 },
  bite: { kind: 'lunge', range: 6.5, min: 2, dist: 6, w: 1.3, wind: 0.42, rec: 0.7, dmg: 1, cd: 2.2, mat: 'bite' }, lunge: { kind: 'lunge', range: 10, min: 3.5, dist: 10, w: 1.5, wind: 0.5, rec: 0.8, dmg: 1.3, cd: 3.4 },
  charge: { kind: 'lunge', range: 16, min: 5, dist: 17, w: 2.4, wind: 0.85, rec: 1.2, dmg: 1.5, cd: 6 }, leap: { kind: 'slam', range: 11, min: 4, r: 3.4, wind: 0.75, rec: 0.9, dmg: 1.4, cd: 5, jump: 1 },
  slam: { kind: 'slam', range: 3.6, r: 4.6, wind: 0.8, rec: 0.9, dmg: 1.3, cd: 4.5 }, quake: { kind: 'slam', range: 14, r: 3.2, wind: 0.9, rec: 0.6, dmg: 1.2, cd: 7, multi: 4 },
  gslash: { kind: 'melee', range: 4.4, arc: 2.4, wind: 0.6, rec: 0.6, dmg: 1.1, cd: 1.6 }, bolt: { kind: 'shoot', range: 15, min: 3, wind: 0.5, rec: 0.5, dmg: 0.9, cd: 2.2, n: 1, spd: 15, col: 0x9a6bff },
  bolt3: { kind: 'shoot', range: 15, min: 2, wind: 0.6, rec: 0.6, dmg: 0.8, cd: 3.2, n: 3, spread: 0.24, spd: 15, col: 0x9a6bff }, xbolt: { kind: 'shoot', range: 17, min: 4, wind: 0.55, rec: 0.6, dmg: 1, cd: 2, n: 1, spd: 30, col: 0xe8c890, wood: 1 },
  fan: { kind: 'shoot', range: 16, wind: 0.7, rec: 0.6, dmg: 0.8, cd: 5, n: 7, spread: 0.2, spd: 13, col: 0x8a6cff }, nova: { kind: 'nova', range: 14, wind: 0.9, rec: 0.8, dmg: 0.9, cd: 8, n: 16, spd: 10, col: 0x8a6cff },
  blink: { kind: 'blink', range: 16, min: 5, wind: 0.25, rec: 0.15, cd: 5 }, summon: { kind: 'summon', range: 30, wind: 1, rec: 0.6, cd: 16, n: 2 }, stab: { kind: 'melee', range: 2.3, arc: 1.2, wind: 0.4, rec: 0.5, dmg: 1.1, cd: 1.4 },
  howl: { kind: 'summon', range: 30, wind: 1.1, rec: 0.5, cd: 24, n: 2 },
  /* werewolves */
  wbite: { kind: 'lunge', range: 7, min: 1.5, dist: 7, w: 1.4, wind: 0.4, rec: 0.7, dmg: 1.15, cd: 2.4, mat: 'bite', venom: 1 }, pounce: { kind: 'slam', range: 11, min: 4, r: 3, wind: 0.7, rec: 0.9, dmg: 1.4, cd: 5.5, jump: 1, mat: 'bite', venom: 1 },
  /* vampires, hybrids, Originals: speed, hands, teeth, eyes */
  gaze: { kind: 'melee', range: 8, arc: 1.1, wind: 1.1, rec: 0.8, dmg: 0.01, cd: 14, gaze: 1, charm: 3 }, grab: { kind: 'melee', range: 2.6, arc: 1.6, wind: 0.55, rec: 0.9, dmg: 1.2, cd: 7, mat: 'bite', grab: 1, root: 1.2, heal: 0.06 },
  snap: { kind: 'melee', range: 2.4, arc: 1.4, wind: 0.65, rec: 1, dmg: 0.8, cd: 12, snap: 1, stun: 2.2 }, debris: { kind: 'shoot', range: 16, min: 5, wind: 0.6, rec: 0.6, dmg: 1.1, cd: 5, n: 1, spd: 24, col: 0x8a8478, mat: 'steel', solid: 1 },
  dashchain: { kind: 'lunge', range: 12, min: 3, dist: 9, w: 1.4, wind: 0.36, rec: 0.18, dmg: 0.8, cd: 6.5, reps: 3 },
  /* witches: fire, telekinesis, boundary, pain */
  firebolt: { kind: 'shoot', range: 15, min: 3, wind: 0.5, rec: 0.5, dmg: 0.9, cd: 2.2, n: 1, spd: 15, col: 0xff7a20, mat: 'fire', burn: 2 }, tk: { kind: 'shoot', range: 12, min: 2, wind: 0.6, rec: 0.7, dmg: 1.1, cd: 6, n: 1, spd: 34, col: 0xb0a8ff, mat: 'magic', tk: 1, kb: 9 },
  boundary: { kind: 'slam', range: 13, min: 3, r: 3.2, wind: 0.9, rec: 0.7, dmg: 0.01, cd: 14, mat: 'magic', far: 1, boundary: 1, root: 3 }, aneurysm: { kind: 'melee', range: 11, arc: 0.5, wind: 0.9, rec: 0.9, dmg: 0.7, cd: 11, mat: 'magic', aneurysm: 1, stun: 1.2 },
};
/* def flags: fam (see WEAK) · onlyVs:[species] hostile only to a player of those species, otherwise neutral unless struck · ring wears a daylight ring (survives sunrise, drops inert lapis)
   · full exists only while fullMoon() && isNight() · need: an S.flags key that must be set before the type may spawn · venom its bite is werewolf venom · original ordinary "death" only
   desiccates it; only a White Oak Stake kills · hybrid werewolf and vampire both (no sun damage, wolfsbane hurts too) · line: the Original whose death kills it · five one of the Brotherhood
   (cannot be compelled; a vampire who kills one is cursed) · verv vervain in the blood (cannot be compelled, burns a feeder) · eyes emissive eye colour · desic lies desiccated until someone living
   comes close · addHp/addDmg scale what its summon calls · pl plural for notices. Vampire looks carry no weapon: hands and teeth. */
const EN = {
  robber: { n: 'Grave Robber', rig: 'human', fam: 'human', hp: 36, dmg: 8, spd: 4.6, xp: 10, poise: 20, atk: ['slash'], look: { cloth: 0x5a5040, pants: 0x2a2620, hat: 1, w: 'wBat' }, gold: 1.5 },
  wolf: { n: 'Timber Wolf', pl: 'Timber Wolves', rig: 'wolf', fam: 'animal', hp: 28, dmg: 9, spd: 7.4, xp: 9, poise: 14, atk: ['bite'], strafe: 1, r: 0.6, tint: { fur: 0x6a6a70, furDark: 0x3a3a40 } },
  deer: { n: 'Deer', pl: 'Deer', rig: 'deer', fam: 'animal', hp: 20, dmg: 0, spd: 8, xp: 3, poise: 5, atk: [], peaceful: 1, r: 0.6 },
  feral: { n: 'Newborn Vampire', rig: 'human', fam: 'vampire', line: 'corvin', hp: 46, dmg: 11, spd: 6.1, xp: 14, poise: 22, atk: ['claw', 'grab'], look: { cloth: 0x3a3a44, pants: 0x1a1a20, skin: 0xb8b0a8, hair: 0x201818, torn: 1 } },
  tombvamp: { n: 'Tomb Vampire', rig: 'human', fam: 'vampire', hp: 50, dmg: 11, spd: 5.4, xp: 15, poise: 26, atk: ['grab', 'claw'], desic: 1, look: { cloth: 0x4a4438, pants: 0x2a2620, skin: 0x8c8880, hair: 0x4a4640, torn: 1, long: 1 } },
  stalker: { n: 'Nest Vampire', rig: 'human', fam: 'vampire', line: 'corvin', hp: 64, dmg: 14, spd: 6.8, xp: 20, poise: 30, atk: ['lunge', 'claw', 'grab'], strafe: 1, look: { cloth: 0x1c1c26, pants: 0x101014, skin: 0xc8c0b8, hair: 0x101010, coat: 1 } },
  elder: { n: 'Elder Vampire', rig: 'human', fam: 'vampire', ring: 1, hp: 125, dmg: 19, spd: 6.6, xp: 40, poise: 60, atk: ['dashchain', 'claw3', 'snap', 'gaze'], strafe: 1, scale: 1.1, look: { cloth: 0x4a0f18, pants: 0x101014, skin: 0xd8d0c8, hair: 0xc8c0b0, cape: 1 }, gold: 2 },
  thrall: { n: 'Sired Fledgling', rig: 'human', fam: 'vampire', line: 'corvin', hp: 34, dmg: 9, spd: 6.4, xp: 8, poise: 12, atk: ['claw'], look: { cloth: 0x302830, pants: 0x1a1a20, skin: 0xa8a098 } },
  cultist: { n: 'Hollow Cultist', rig: 'human', fam: 'witch', hp: 40, dmg: 12, spd: 4.2, xp: 15, poise: 16, atk: ['firebolt'], ranged: 1, look: { cloth: 0x2a2038, pants: 0x18141c, hood: 1, w: 'wStaff' } },
  warlock: { n: 'Coven Warlock', rig: 'human', fam: 'witch', hp: 76, dmg: 16, spd: 4.2, xp: 30, poise: 26, atk: ['firebolt', 'tk', 'boundary', 'aneurysm'], ranged: 1, look: { cloth: 0x501828, pants: 0x18141c, hood: 1, w: 'wStaff' }, gold: 2 },
  shade: { n: 'Shade', rig: 'shade', fam: 'spirit', hp: 38, dmg: 12, spd: 5.2, xp: 16, poise: 10, atk: ['touch'], float: 1 },
  werewolf: { n: 'Werewolf', pl: 'Werewolves', rig: 'wolf', fam: 'wolf', full: 1, venom: 1, eyes: 0xffd040, hp: 170, dmg: 23, spd: 8.2, xp: 60, poise: 80, atk: ['wbite', 'pounce', 'charge'], strafe: 1, r: 0.85, scale: 1.5, tint: { fur: 0x3c3834, furDark: 0x1c1a18 }, gold: 2 },
  packrunner: { n: 'Falls Pack Runner', rig: 'human', fam: 'wolf', onlyVs: ['vampire', 'hybrid'], eyes: 0xffd040, hp: 68, dmg: 14, spd: 5.8, xp: 22, poise: 36, atk: ['slash', 'lunge'], strafe: 1, look: { cloth: 0x5a3a2a, pants: 0x2a3040, hair: 0x2a1c12, w: 'wAxe' }, gold: 1.5 },
  hybrid: { n: 'Sired Hybrid', rig: 'human', fam: 'hybrid', hybrid: 1, venom: 1, need: 'corvinAwake', line: 'corvin', eyes: 0xffc020, hp: 110, dmg: 18, spd: 6.8, xp: 44, poise: 50, atk: ['wbite', 'claw3', 'lunge'], strafe: 1, look: { cloth: 0x2a3a2a, pants: 0x14161a, skin: 0xcabcae, hair: 0x2a1c12, coat: 1 }, gold: 2 },
  hunter: { n: 'Council Hunter', rig: 'human', fam: 'human', onlyVs: ['vampire', 'hybrid'], verv: 1, hp: 74, dmg: 14, spd: 5, xp: 22, poise: 34, atk: ['xbolt', 'stab'], ranged: 1, look: { cloth: 0x4a4230, pants: 0x1c1a16, hat: 1, w: 'crossbow', armor: 1 } },
  fivehunter: { n: 'Hunter of the Five', pl: 'Hunters of the Five', rig: 'human', fam: 'human', five: 1, verv: 1, onlyVs: ['vampire', 'hybrid'], hp: 140, dmg: 19, spd: 6, xp: 70, poise: 70, atk: ['xbolt', 'stab', 'lunge'], ranged: 1, scale: 1.06, look: { cloth: 0x2c2c2c, pants: 0x1a1a1a, hair: 0x15100e, w: 'crossbow', armor: 1 }, gold: 3 },
  /* bosses */
  warden: { n: 'The Warden', boss: 1, rig: 'human', fam: 'vampire', ring: 1, hp: 620, dmg: 20, spd: 5, xp: 400, poise: 160, scale: 1.7, atk: ['gslash', 'slam', 'charge', 'grab'], look: { cloth: 0x2a2c34, pants: 0x14161c, skin: 0x9a9690, hair: 0x101010, armor: 1, w: 'wGreat' }, r: 0.9, sub: "Sealed under Fell's Church since 1864" },
  corvin: { n: 'Corvin, the First', boss: 1, rig: 'human', fam: 'original', original: 1, hybrid: 1, venom: 1, weak: { wolfsbane: 1.3 }, eyes: 0xffc020, hp: 900, dmg: 23, spd: 6.8, xp: 900, poise: 160, scale: 1.35, atk: ['dashchain', 'claw3', 'wbite', 'grab', 'gaze', 'debris', 'summon'], add: 'thrall', look: { cloth: 0x5a0a14, pants: 0x0c0c10, skin: 0xe0d8d0, hair: 0xb89a5a, coat: 1 }, sub: 'The Original hybrid. A thousand years old' },
  alpha: { n: 'Old Tobias, the Alpha', boss: 1, rig: 'wolf', fam: 'wolf', full: 1, venom: 1, eyes: 0xffd040, hp: 560, dmg: 20, spd: 7.8, xp: 500, poise: 150, scale: 1.9, atk: ['wbite', 'pounce', 'charge', 'howl'], add: 'werewolf', addHp: 0.35, addDmg: 0.7, r: 1.1, tint: { fur: 0x8a8680, furDark: 0x4a4844 }, sub: 'Alpha of the Falls pack' },
  ambrose: { n: 'Ambrose Varga', boss: 1, rig: 'human', fam: 'vampire', line: 'corvin', hp: 700, dmg: 21, spd: 6.8, xp: 700, poise: 130, scale: 1.2, atk: ['dashchain', 'claw3', 'snap', 'grab'], look: { cloth: 0x6a1019, pants: 0x0c0c10, skin: 0xeadccb, hair: 0xc9c2b0, coat: 1 }, sub: "Turned in 1864. Of Corvin's line" },
  lenore: { n: 'Mother Lenore', boss: 1, rig: 'human', fam: 'vampire', line: 'corvin', hp: 600, dmg: 19, spd: 6.2, xp: 520, poise: 120, scale: 1.25, atk: ['claw3', 'grab', 'dashchain', 'debris', 'summon'], add: 'feral', look: { cloth: 0x1a2a22, pants: 0x101014, skin: 0xd0d8c8, hair: 0x808880, long: 1, cape: 1 }, sub: 'Matron of the quarry nest' },
  matriarch: { n: 'The Hundred', boss: 1, rig: 'shade', fam: 'spirit', despell: 1, hp: 640, dmg: 21, spd: 5.4, xp: 600, poise: 100, scale: 1.7, atk: ['bolt3', 'nova', 'summon', 'blink', 'quake', 'aneurysm'], add: 'shade', float: 1, sub: 'A hundred burned witches, one voice' },
  sleeper: { n: 'The Sleeper', boss: 1, rig: 'human', fam: 'original', original: 1, desic: 1, hp: 1000, dmg: 25, spd: 5.6, xp: 1600, poise: 180, scale: 1.3, atk: ['grab', 'claw3', 'slam', 'debris', 'gaze', 'dashchain'], look: { cloth: 0x3a3630, pants: 0x24211c, skin: 0x7c7870, hair: 0x5a564e, long: 1, torn: 1 }, sub: 'Sealed in with the Cure. Two thousand years without a drop' },
  casimir: { n: 'Casimir', boss: 1, rig: 'human', fam: 'original', original: 1, ring: 1, hp: 950, dmg: 24, spd: 7, xp: 1200, poise: 170, scale: 1.3, atk: ['dashchain', 'claw3', 'snap', 'grab', 'gaze', 'debris'], look: { cloth: 0x1a1c24, pants: 0x0e0e12, skin: 0xe2d6c8, hair: 0x2a1c12, coat: 1 }, sub: "An Original. Corvin's elder brother" },
};
/* damage multipliers by enemy family and damage type (o.mat); anything missing is 1. Silver is not a type: it does nothing to anyone. 'wolfsbane' is the tenth type, for the
   wolfsbane grenade. No entry is 0 (hit() treats 0 as "missing"); 0.05 means "as good as nothing". Killing rules (a stake through the heart, fire, a head, a heart) are not
   multipliers: see SPEC rule 3. whiteoak is ordinary wood to everything except an Original. A def may override with def.weak. */
const WEAK = {
  human: { verv: 0.3, wolfsbane: 0.3, venom: 0.05 },
  witch: { verv: 0.3, wolfsbane: 0.3, venom: 0.05 },
  animal: { verv: 0.3, wolfsbane: 0.3, venom: 0.05 },
  vampire: { wood: 1.5, whiteoak: 1.5, fire: 1.4, verv: 1.6, venom: 1.5, wolfsbane: 0.3 },
  original: { wood: 1.15, whiteoak: 2, fire: 1.15, verv: 1.3, ash: 1.5, venom: 0.05, wolfsbane: 0.3 },
  wolf: { wolfsbane: 1.6, verv: 0.3, venom: 0.05 },
  hybrid: { verv: 1.6, wolfsbane: 1.5, wood: 1.15, whiteoak: 1.15, fire: 1.2, venom: 0.05 },
  spirit: { magic: 1.4, wood: 0.8, whiteoak: 0.8, steel: 0.8, ash: 0.8, bite: 0.8, fire: 0.8, venom: 0.05, verv: 0.05, wolfsbane: 0.05 },
};
const ELITE = [['Swift', e => { e.spdM = 1.3; }], ['Hulking', e => { e.maxHp *= 1.8; e.hp = e.maxHp; e.rig.g.scale.multiplyScalar(1.18); }], ['Vicious', e => { e.dmgM = 1.35; }], ['Ravenous', e => { e.leech = 0.5; }], ['Unyielding', e => { e.maxPoise *= 3; e.poise = e.maxPoise; }], ['Volatile', e => { e.volatile = 1; }]];

/* ---------------- geography ---------------- */
const POI = [
  { id: 'town', n: 'Mystic Falls', x: -6, z: 22 }, { id: 'cem', n: 'Old Cemetery', x: -104, z: 40 }, { id: 'chapel', n: 'Fell Chapel', x: -130, z: -146 }, { id: 'hollow', n: 'Coven Hollow', x: -20, z: -226 },
  { id: 'falls', n: 'The Falls', x: 178, z: -200 }, { id: 'bridge', n: 'Wickery Bridge', x: 186, z: -40 }, { id: 'manor', n: 'Varga Manor', x: 221, z: -45 }, { id: 'quarry', n: 'Blackridge Quarry', x: 128, z: 168 },
  { id: 'farm', n: 'Abel Farm', x: 14, z: 196 }, { id: 'lake', n: 'Dunham Lake', x: -118, z: 160 }, { id: 'camp', n: "Hunters' Camp", x: -214, z: -70 },
];
/* spawn tables. day: no vampire is ever out in the sun (hybrids are, once Corvin has made some). night: after dark. full: the whole table on a full-moon night, replacing night
   (the Falls pack has all turned). spawnTable(zone) in 40-systems picks the right one and filters by def.full and def.need. */
const ZONES = [
  { id: 'town', n: 'Mystic Falls', lvl: 1, r: [-72, -62, 82, 128], safe: 1 }, { id: 'camp', n: "Hunters' Camp", lvl: 5, c: [-230, -70, 24], safe: 1 },
  { id: 'cem', n: 'Old Cemetery', lvl: 2, r: [-196, -2, -104, 82], day: ['robber'], night: ['feral', 'feral', 'shade'], max: 5 },
  { id: 'chapel', n: 'Fell Chapel Ruins', lvl: 6, c: [-130, -170, 36], day: ['cultist', 'robber'], night: ['cultist', 'shade', 'tombvamp', 'feral'], max: 5 },
  { id: 'hollow', n: 'Coven Hollow', lvl: 12, c: [-20, -245, 36], day: ['shade', 'cultist'], night: ['shade', 'warlock', 'shade'], max: 6 },
  { id: 'falls', n: 'The Falls', lvl: 9, c: [190, -226, 52], day: ['wolf', 'deer', 'packrunner'], night: ['packrunner', 'wolf', 'packrunner'], full: ['werewolf', 'werewolf', 'wolf'], max: 5 },
  { id: 'quarry', n: 'Blackridge Quarry', lvl: 14, c: [150, 185, 50], day: ['robber'], night: ['stalker', 'elder', 'feral'], max: 7 },
  { id: 'lake', n: 'Dunham Lake', lvl: 7, c: [-170, 190, 78], day: ['wolf', 'robber', 'deer'], night: ['feral', 'stalker', 'wolf'], max: 5 },
  { id: 'farm', n: 'Abel Farm', lvl: 3, r: [-24, 168, 92, 262], day: ['deer'], night: ['wolf', 'feral'], max: 4 },
  { id: 'manor', n: 'Varga Manor', lvl: 16, r: [214, -96, 288, -4], safe: 1 },
  { id: 'east', n: 'The East Bank', lvl: 16, r: [212, -292, 292, 292], day: ['wolf', 'deer', 'hybrid'], night: ['elder', 'stalker', 'warlock', 'hybrid'], full: ['werewolf', 'werewolf', 'elder', 'hybrid'], max: 6 },
  { id: 'woods', n: 'Whispering Woods', lvl: 4, r: [-292, -292, 196, -64], day: ['wolf', 'deer', 'deer'], night: ['feral', 'wolf', 'stalker'], full: ['werewolf', 'wolf', 'feral'], max: 6 },
  { id: 'wild', n: 'The Outskirts', lvl: 2, r: [-999, -999, 999, 999], day: ['deer', 'wolf', 'deer'], night: ['feral', 'wolf'], full: ['wolf', 'werewolf', 'feral'], max: 4 },
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
   Its keepers: the Warden on 5, Corvin on 10, the Sleeper and the Cure on 20. A keeper who has truly died does not come back; another takes the floor.
   Nothing in wolf form is ever down here. There is no moon underground. */
const TOMBKEEP = { 5: 'warden', 10: 'corvin', 20: 'sleeper' }, TOMBROTA = ['matriarch', 'warden', 'lenore'];
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
  if (boss) { const p = rc(rooms[1]), kt = tombBoss(depth); a.keeper = kt; a.spawns.push({ x: p.x, z: p.z - 4, type: kt, boss: 1, elite: !EN[kt].boss }); a.need = 1; mkChest(p.x, p.z - 21, 'bc', a.lvl, true); a.chests[0].locked = true; a.chests[0].rig.g.visible = false;
    if (kt === 'sleeper') {   // the Sleeper's door: sealed by a witch two thousand years ago, and it opens for a witch of the Thorne line or for Odette's talisman
      const dz = W(23), box = [W(16) - TC / 2, dz - TC / 2, W(18) + TC / 2, dz + TC / 2], slabs = [16, 17, 18].map(c => place('tombwall', W(c), dz, 0, 1, G)); addBox(box, true); a.glows.push([W(17), dz + 3.2, 9, 0x6a4cff]); lamp(W(17), dz + 3.4, 0x7a5cff, 1.5, 15, 2.6);
      const door = addInter({ x: W(17), z: dz + 3, r: 6, open: false, label: () => door.open ? null : 'A sealed door, far older than the church', act: () => { let can = false; try { can = !!canOpenSleeper(); } catch (er) { can = false; }
        if (!can) { sfx('deny'); return toast('The stone does not move. A witch sealed this door, and it wants a witch of the Thorne line, or her talisman.'); }
        door.open = true; for (const m of slabs) G.remove(m); for (const l of [a.boxes, a.los]) { const i = l.indexOf(box); if (i >= 0) l.splice(i, 1); } hashArea(a); sfx('open'); sfx('boom'); RT.shake = Math.max(RT.shake, 0.5); ringFx(W(17), dz, 0x8a6cff, 9, 1); puff(W(17), 1.5, dz, 40, { c: ASH, add: 0.1, sp: 3, up: 2, life: 1.2, size: 0.4, grav: 2, spread: 4 }); toast('The seal knows what you carry. Stone grinds on stone, and the air that comes out is two thousand years old.'); } }); a.door = door; } }
  else { let font = depth >= 2 && rnd() < 0.55; rooms.forEach((r, i) => { if (i === 0) return; const n = Math.round(Math.min(7, 1 + Math.floor(r.w * r.h / 11) + Math.floor(depth / 6)) * (mod && mod.count || 1)); for (let k = 0; k < n; k++) { const p = rp(r, 2.5); a.spawns.push({ x: p.x, z: p.z, type: table[Math.floor(rnd() * table.length)], elite: rnd() < Math.min(0.45, 0.04 + depth * 0.012) + (mod && mod.elite || 0) }); }
      if (i > 0 && i < rooms.length - 1 && rnd() < 0.42 + (mod && mod.chest || 0)) { const p = rp(r, 2.2); mkChest(p.x, p.z, 'tc' + i, a.lvl, rnd() < 0.15 + (mod && mod.chest ? 0.2 : 0)); }
      if (font && i >= 2 && i < rooms.length - 1) { font = false; const p = rc(r); place('fountain', p.x, p.z, 0, 0.7, G); addCirc(p.x, p.z, 1.7); a.glows.push([p.x, p.z, 9, 0xb01020]); lamp(p.x, p.z, 0xff2030, 1.2, 14, 1.5); const f = addInter({ x: p.x, z: p.z, r: 3.2, used: false, label: () => f.used ? null : 'Drink from the blood font', act: () => { f.used = true; heal(P.maxHp); if (S.origin !== 'siphoner') pl.foc = P.maxFoc; if (isVamp()) pl.blood = P.maxBlood; sfx('heal'); ringFx(p.x, p.z, 0xff2030, 5, 0.7); toast(isVamp() ? 'Old blood, kept warm by something. You are whole.' : 'It is only water, here. Somehow. You are whole.'); } }); } }); a.need = Math.ceil(a.spawns.length * 0.7); }
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
/* Hollow Moon — actors: rigs, animation, the damage pipeline, enemy AI, projectiles, hazards, spawning. */
let AID = 1;
const dScale = l => (1 + 0.1 * (l - 1)) * Math.pow(1.018, l - 1);            // enemy damage curve
function dress(rig, L) {
  const H = rig.P.Head; if (L.coat) rig.attach('coat'); if (L.cape) rig.attach('cape'); if (L.armor) rig.attach('armor');
  if (H) { if (L.hat) rig.attach('hat', H); if (L.hood) rig.attach('hood', H); if (L.long) rig.attach('longhair', H); if (L.crown) rig.attach('crown', H); }
  if (L.w && rig.P.ArmR) rig.wpn = rig.attach(L.w, rig.P.ArmR, [0, -0.62, 0.06]);
}
/* the eyes of a human rig. 0 = its own; 1 = werewolf gold (a hybrid's face, or a wolf's temper showing); 2 = the dark, blood-shot vampire face */
function rigEyes(rig, mode, hex) {
  const m = rig.mats.eye; mode = mode || 0; if (!m || (rig.eyeMode || 0) === mode) return; rig.eyeMode = mode; if (!rig.eye0) rig.eye0 = m.color.clone();
  if (mode === 1) { m.color.setHex(hex || rig.eyeHex || 0xffd040).convertSRGBToLinear(); m.emissive.copy(m.color).multiplyScalar(0.9); } else if (mode === 2) { m.color.setRGB(0.42, 0.02, 0.03); m.emissive.setRGB(0.3, 0, 0.01); } else { m.color.copy(rig.eye0); m.emissive.setRGB(0, 0, 0); }
  m.userData.glow = mode ? 1 : 0;
}
function mkBody(def) {
  let rig; const sc = def.scale || 1, were = def.rig === 'beast' || (def.rig === 'wolf' && def.fam === 'wolf');   // a werewolf is a real wolf, half again the size of a natural one
  if (def.rig === 'human') { const L = def.look || {}; rig = mkRig('human', { cloth: L.cloth, pants: L.pants, skin: L.skin, hair: L.hair }, sc * 1.28); dress(rig, L); }
  else if (def.rig === 'shade') { rig = mkRig('shade', {}, sc * 1.15); for (const k in rig.mats) { rig.mats[k].transparent = true; rig.mats[k].opacity = 0.82; } }
  else if (were) { rig = mkRig('wolf', def.tint || { fur: 0x3d3833, furDark: 0x1b1917 }, Math.max(1.5, sc) * 1.25); const ey = rig.mats.eyeGlow; if (ey && def.eyes) { ey.color.setHex(def.eyes).convertSRGBToLinear(); ey.emissive.copy(ey.color); } }
  else { rig = mkRig(def.rig, def.tint || {}, sc * 1.25); const ey = rig.mats.eyeGlow; if (ey) { ey.color.setRGB(0.2, 0.15, 0.05); ey.emissive.setRGB(0, 0, 0); } }   // only a werewolf's eyes burn
  for (const k of ['ArmL', 'ArmR']) if (rig.P[k]) rig.P[k].rotation.order = 'YXZ';
  for (const k in rig.mats) { const m = rig.mats[k]; if (m.emissive && m.emissive.getHex() !== 0) m.userData.glow = 1; }
  rig.kind = def.rig === 'human' ? 'biped' : def.rig === 'shade' ? 'shade' : 'quad'; rig.eyeHex = def.eyes; return rig;
}
function baseActor(kind, def, rig, x, z) { return { id: AID++, kind, def, fam: def.fam || 'human', name: def.n, rig, x, z, rot: R(0, TAU), vr: 0, r: def.r || 0.5, sp: 0, ph: R(0, 6), kx: 0, kz: 0, y: 0, fx: {}, sw: null, flash: 0, flinch: 0, inv: 0, dead: false, deadT: 0, spdM: 1, dmgM: 1, team: 2 }; }

/* families. The undead (vampire, hybrid, Original) only stay dead for the right reasons: see fall(). */
const isOrig = e => e.fam === 'original' || !!e.def.original, isHyb = e => e.fam === 'hybrid' || !!e.def.hybrid;
const undead = e => e.fam === 'vampire' || e.fam === 'hybrid' || e.fam === 'original';
const baneHurts = e => e.fam === 'wolf' || isHyb(e), mortalPerson = e => e.fam === 'human' || e.fam === 'witch', wolfShape = e => e.fam === 'wolf' && e.rig.kind === 'quad';
const personLife = e => mortalPerson(e) || e.fam === 'wolf';   // a human life, for the curse's purposes: a werewolf is a person, in either shape. The dead do not count.
const moonNight = () => fullMoon() && isNight();
/* an untriggered carrier of the werewolf gene pulls the killing blow on people, unless the player has chosen otherwise */
const mercy = () => S.origin === 'wolf' && S.species === 'human' && S.flags.mercy !== 0 && S.flags.mercy !== false;
/* vervain in the player's own blood (the Grill's coffee): a vampire who bites them is burned */
const vervDosed = () => (S.flags.vervUntil || 0) > absHours();
const DESIC = new T.Color(0.2, 0.2, 0.225), CHAR = new T.Color(0.05, 0.045, 0.04);
/* desiccation: the skin and hair go the grey of old stone, and the colour drains half out of everything else. k is how far to move this frame (1 = all at once). */
function greyRig(a, k) { const r = a.rig; if (!r.base) { r.base = {}; for (const n in r.mats) r.base[n] = r.mats[n].color.clone(); } if (!r.grey) { r.grey = {}; for (const n in r.mats) r.grey[n] = n === 'skin' || n === 'hair' ? DESIC.clone() : r.base[n].clone().lerp(DESIC, 0.55); }
  for (const n in r.mats) r.mats[n].color.lerp(a.burnt ? CHAR : r.grey[n], k); if (r.eyeMode) rigEyes(r, 0); }
function ungreyRig(a) { const r = a.rig; if (r.base) for (const n in r.mats) r.mats[n].color.copy(r.base[n]); if (isHyb(a) && r.kind === 'biped') { r.eye0 = null; rigEyes(r, 1); } }

function spawnEnemy(type, x, z, lvl, o = {}) {
  let def = EN[type]; if (!def) { console.warn('unknown enemy type', type); type = EN.robber ? 'robber' : Object.keys(EN)[0]; def = EN[type]; }
  const rig = mkBody(def), e = baseActor('enemy', def, rig, x, z); areaAdd(rig.g); e.type = type; e.lvl = lvl; e.team = def.peaceful ? 2 : 1;
  e.maxHp = def.hp * hpScale(lvl) * (def.boss ? 1.6 : def.peaceful ? 1 : 3); e.dmg = def.dmg * dScale(lvl) * 1.3; e.maxPoise = def.poise * (1 + lvl * 0.05) * 3; e.xp = def.xp * (1 + 0.3 * (lvl - 1)) * 1.4;
  e.ai = { home: { x, z }, cd: {}, gcd: R(0.3, 1.2), t: R(0, 3), aggro: false, cur: null, strafe: chance(0.5) ? 1 : -1, wt: null, spawned: !!o.spawned };
  if (o.elite && !def.boss && !def.peaceful) { const n = lvl > 22 ? 2 : 1, picks = []; e.maxHp *= 2.2; e.dmgM = 1.2; e.xp *= 2.6; rig.g.scale.multiplyScalar(1.1); while (picks.length < n) { const p = pick(ELITE); if (!picks.includes(p)) picks.push(p); } e.elite = picks.map(p => p[0]).join(' '); e.hp = e.maxHp; picks.forEach(p => p[1](e)); e.name = e.elite + ' ' + def.n; }
  if (def.boss) { e.maxHp *= 1 + Math.max(0, lvl - 10) * 0.012; e.r = def.r || 0.7; }
  if (o.name) e.name = o.name; e.hp = e.maxHp; e.poise = e.maxPoise; e.tag = o.tag; e.ring = !!(def.ring || o.ring || (o.elite && def.fam === 'vampire')); if (isHyb(e) && rig.kind === 'biped') rigEyes(rig, 1);
  if (o.phantom) { e.phantom = true; e.noLoot = true; e.lifeT = 18; e.ai.aggro = e.ai.provoked = true; for (const k in rig.mats) { rig.mats[k].transparent = true; rig.mats[k].opacity = 0.62; } }
  // the tomb vampires of 1864 lie starved and grey where they fell, until someone walks close or blood is spilled near them
  else if (o.dormant || (def.desic && !o.spawned && !o.awake && RT.area && RT.area.id === 'tomb' && (def.boss || chance(0.7)))) { e.dormant = true; e.lieK = 1; greyRig(e, 1); }
  actors.push(e); pose(e, 0); return e;
}
function dropAtk(e) { const c = e.ai && e.ai.cur; if (!c) return; if (c.tele) c.tele.kill = 1; if (c.ph === 'hold' && pl && pl.pose === 'held') pl.pose = null; e.ai.cur = null; }
function removeActor(a) { const i = actors.indexOf(a); if (i >= 0) actors.splice(i, 1); dropAtk(a); a.rig.g.parent && a.rig.g.parent.remove(a.rig.g); for (const k in a.rig.mats) a.rig.mats[k].dispose(); }
/* def.onlyVs: hostile to those player species only. Anyone else is left alone until they start something. */
function neutralTo(e) {
  const ai = e.ai; if (!ai || ai.provoked || e.phantom || e.team !== 1) return false;
  if ((e.type === 'wolf' || e.type === 'packrunner' || e.type === 'werewolf') && !e.def.boss && sk('l_alpha') && isWolf()) return true;   // timber wolves and the Falls pack know an alpha
  const ov = e.def.onlyVs; if (!ov) return false; const sp = S.species;
  return !(ov.includes(sp) || (sp === 'werewolf' && ov.includes('wolf')) || (pl.wolf && (ov.includes('werewolf') || ov.includes('wolf'))) || (S.heretic && ov.includes('heretic')) || (S.original && ov.includes('original')));
}
const lying = b => b.downed || b.ko || b.dormant;
const hostile = (a, b) => a.team !== b.team && a.team !== 2 && b.team !== 2 && !a.dead && !b.dead && b.kind !== 'npc' && !lying(b);
function foes(a) { const l = []; for (const b of actors) if (hostile(a, b) && !(a.team === 0 && neutralTo(b))) l.push(b); /* your allies leave alone whoever is leaving you alone */ if (a !== pl && a.team === 1 && !pl.dead && !neutralTo(a) && !(pl.buff.cloak > 0 && a.fam !== 'witch' && a.fam !== 'spirit')) l.push(pl); return l; }
function nearestFoe(a, max = 1e9, from) { let best = null, bd = max; const p = from || a; for (const b of foes(a)) { const d = d2(p, b); if (d < bd) { bd = d; best = b; } } return best; }

/* ---------------- animation ---------------- */
const ez = k => 1 - (1 - k) * (1 - k);
function pose(a, dt) {
  const g = a.rig.g, P = a.rig.P; a.vr += angd(a.rot, a.vr) * Math.min(1, dt * 16); a.flinch = Math.max(0, a.flinch - dt); if (a.flash > 0) { a.flash -= dt; flashRig(a, a.flash > 0 ? 0.55 : 0); }
  if (a.dead) return poseDead(a, dt); if (lying(a)) return poseDown(a, dt);
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
        case 'gaze': P.Head.rotation.x = 0.12; P.ArmR.rotation.set(-0.5, 0.2, 0); tilt = 0.1; break;                                      // leaning in, eyes on yours
        case 'throw': P.ArmR.rotation.set(lerp(-3.0, -0.9, e), 0.2, 0); P.ArmL.rotation.set(-0.8, -0.4, 0); twist = lerp(0.5, -0.3, e); tilt = lerp(-0.1, 0.25, e); break;
        case 'kneel': P.LegL.rotation.x = -1.3; P.LegR.rotation.x = 0.5; P.Head.rotation.x = 0.45; P.ArmR.rotation.set(-0.9, -0.3, 0); P.ArmL.rotation.set(-0.9, 0.3, 0); tilt = 0.35; y -= 0.42; break;
      } if (k >= 1 && !w.hold) a.sw = null; }
    else if (a.block) { P.ArmL.rotation.set(-1.5, -0.7, 0); P.ArmR.rotation.set(-1.35, 0.5, 0); tilt = 0.08; }
    if (a.fx.stun > 0) { P.Head.rotation.set(0.4, 0, Math.sin(RT.time * 9) * 0.2); tilt = 0.15; }
    if (a.pose === 'held') { P.Head.rotation.z = 0.6; tilt = -0.15; } else if (a.pose === 'sit') { P.LegL.rotation.x = P.LegR.rotation.x = -1.4; y -= 0.45; }
    if (a.roll > 0) { roll = (1 - a.roll) * TAU; y += Math.sin((1 - a.roll) * PI) * 0.5; P.LegL.rotation.x = P.LegR.rotation.x = -1.6; P.ArmL.rotation.x = P.ArmR.rotation.x = -1.2; }
  } else if (a.rig.kind === 'quad') {
    const A = s * amp * 0.9; if (P.LegFL) { P.LegFL.rotation.x = A; P.LegBR.rotation.x = A; P.LegFR.rotation.x = -A; P.LegBL.rotation.x = -A; } if (P.Tail) P.Tail.rotation.z = Math.sin(RT.time * 5 + a.ph) * 0.3; if (P.Head) P.Head.rotation.x = 0;
    y += Math.abs(s) * amp * 0.08; const w = a.sw; if (w) { w.t += dt; const k = Math.min(1, w.t / w.dur); if (w.kind === 'howl') { if (P.Head) P.Head.rotation.x = 0.9; tilt = -0.25; } else if (w.kind === 'wind') { tilt = -0.2; } else if (w.kind === 'spin') { twist = k * TAU * (w.turns || 1); } else { tilt = 0.25; if (P.Head) P.Head.rotation.x = -0.3 - Math.sin(k * PI) * 0.4; y += Math.sin(k * PI) * (w.jump || 0.35); } if (k >= 1 && !w.hold) a.sw = null; }
    if (a.fx.stun > 0 && P.Head) P.Head.rotation.x = -0.5;
  } else { y += 0.25 + Math.sin(RT.time * 2 + a.ph) * 0.18; tilt = Math.min(0.3, a.sp * 0.04); const w = a.sw; if (w) { w.t += dt; const k = Math.min(1, w.t / w.dur); g.scale.setScalar(a.rig.scale * (1 + Math.sin(k * PI) * 0.18)); if (k >= 1 && !w.hold) { a.sw = null; g.scale.setScalar(a.rig.scale); } } }
  if (a.flinch > 0) tilt -= a.flinch * 1.2;
  g.rotation.set(tilt + roll, a.vr + twist, 0); g.position.set(a.x, y + (RT.area.id === 'world' && a.x > 190 && a.x < 216 && Math.abs(a.z + 40) < 3.4 ? 0.28 : 0), a.z);
}
/* flat on the ground but not dead: a downed vampire going grey, a tomb vampire that never got up, someone knocked cold */
function poseDown(a, dt) {
  const g = a.rig.g, k = a.lieK = Math.min(1, (a.lieK || 0) + dt * 3.5); if (a.rig.kind === 'shade') return;
  if (a.rig.kind === 'quad') g.rotation.set(0, a.vr, PI / 2 * k); else g.rotation.set(-PI / 2 * k, a.vr, 0); g.position.set(a.x, 0.18 * k, a.z); if (a.downed) greyRig(a, Math.min(1, dt * 2.5));
}
function poseDead(a, dt) {
  const g = a.rig.g; a.deadT += dt; const k = Math.min(1, Math.max(a.lieK || 0, a.deadT * 3));
  if (a.rig.kind === 'shade') { g.scale.setScalar(a.rig.scale * Math.max(0.01, 1 - a.deadT * 2)); if (a.deadT > 0.5) a.gone = true; return; }
  if (a.rig.kind === 'quad') g.rotation.set(0, a.vr, PI / 2 * k); else g.rotation.set(-PI / 2 * k, a.vr, 0); g.position.set(a.x, 0.18 * k, a.z);
  // a dead vampire does not crumble. It lies there grey, veins standing out like roots, looking a hundred years dead. Fire and sunlight leave less.
  const corpse = a.kind === 'enemy' && undead(a); if (corpse && a.deadT < 3) { greyRig(a, Math.min(1, dt * 3)); if (a.burnt && chance(0.5)) puff(a.x + R(-0.5, 0.5), 0.4, a.z + R(-0.5, 0.5), 1, { c: chance(0.5) ? FIRE : ASH, add: 0.8, sp: 0.5, up: 1.8, life: 0.7, size: 0.26, grav: -1 }); }
  const stay = corpse ? 14 : 7; if (a.deadT > stay) { g.position.y -= (a.deadT - stay) * 0.5; if (a.deadT > stay + 2) a.gone = true; }
}

/* ---------------- damage ---------------- */
const FAMFX = { vampire: BLOOD, original: BLOOD, hybrid: BLOOD, human: BLOOD, witch: BLOOD, wolf: BLOOD, animal: BLOOD, spirit: ICE };
/* does this blow end one of the undead for good? A vampire: wood in the heart, fire, the sun, the head, the heart torn out, werewolf venom.
   A hybrid: the head or the heart, nothing else. An Original: white oak through the heart, and that is the whole list. */
function lethalTo(e, o) {
  const m = o.mat, L = o.lethal; if (isOrig(e)) return L === 'whiteoak';
  if (L === 'heart' || L === 'head' || L === 'desic') return true; if (isHyb(e)) return !!o.heavy && m === 'steel';
  return L === 'stake' || L === 'whiteoak' || m === 'wood' || m === 'whiteoak' || m === 'fire' || m === 'sun' || m === 'venom' || (!!o.heavy && m === 'steel');
}
function hit(src, tgt, o) {
  if (!tgt || tgt.dead || o.dmg == null) return 0;
  if (tgt === pl) return src && src.phantom ? 0 : hitPlayer(src, o);
  if (tgt.kind === 'npc' || tgt.ko || (src && src.phantom)) return 0;
  const fromP = src === pl, ours = fromP || !src || src.team === 0;
  if (tgt.phantom) { if (ours) vanish(tgt, true); return 0; }
  if (tgt.downed) { if (ours && lethalTo(tgt, o)) { trueDeath(tgt, src, o); return o.dmg; } if (fromP && !o.dot && RT.time - (tgt.hintAt || -9) > 1.6) { tgt.hintAt = RT.time; floatText(tgt.x, 1.7, tgt.z, isOrig(tgt) ? 'Only white oak' : isHyb(tgt) ? 'The head or the heart' : 'Wood, fire or the head', '#b8c0d0', 12); } return 0; }
  // a hybrid made from his blood cannot raise a hand to the sire until a hundred willing turns have broken the bond
  if (fromP && isHybrid() && S.sire && tgt.type === S.sire && !((S.flags.shifts || 0) >= 100)) { if (RT.time - (RT.sireAt || -9) > 2.5) { RT.sireAt = RT.time; floatText(pl.x, 2.9, pl.z, 'SIRED', '#ffd24a', 16); toast('Your hand will not finish the blow. You owe him the end of the pain, and the debt holds you.'); } return 0; }
  let d = o.dmg, crit = false; const fam = tgt.fam, W = WEAK[fam] || {}, dw = tgt.def.weak, m = o.mat, vv = undead(tgt), bw = baneHurts(tgt), wpn = !o.spell && !o.dot;
  d *= dw && dw[m] ? dw[m] : W[m] ? W[m] : m === 'whiteoak' ? W.wood || 1 : m === 'verv' ? (vv ? 1.6 : 0.3) : m === 'wolfsbane' ? (bw ? 1.6 : 0.3) : 1;   // white oak is only wood to anything that is not an Original; the herbs are only a bang to anything they are not poison to
  if (fromP) {
    const cv = wpn && pl.buff.coatV > 0, cw = wpn && pl.buff.coatW > 0;   // passive bonuses (the Mark, the Switch, Fury, rage, relics) are already in P: see recalc
    if (vv) d *= 1 + ((P.vsV || 0) + (cv ? 50 : 0)) / 100; if (bw) d *= 1 + ((P.vsW || 0) + (cw ? 60 : 0)) / 100; if (fam === 'spirit') d *= 1 + (P.vsS || 0) / 100;
    if (pl.buff.slayer > 0) d *= 1 + pl.buff.slayerN * (2 + sk('h_slayer')) / 100;
    if (pl.buff.riposte > 0 && !o.spell) { d *= 1 + 0.5 * Math.max(1, sk('h_parry')); pl.buff.riposte = 0; crit = true; }
    if (!o.noCrit && (o.crit || crit || Math.random() * 100 < P.crit + (o.spell ? P.spellCrit : 0))) { crit = true; d *= P.critMult; }
    if (tgt.fx.stun > 0) d *= 1.15;
  } else if (src && src.dmgM) d *= src.dmgM;
  if (tgt.fx.mark > 0) d *= 1.25; d = Math.max(1, d); if (tgt.dormant) wakeDormant(tgt);
  tgt.hp -= d; tgt.flash = 0.12; tgt.flinch = 0.18; tgt.hpShow = 4;
  const c = FAMFX[fam] || BLOOD; puff(tgt.x, 1.2, tgt.z, crit ? 12 : 6, { c, add: fam === 'spirit' ? 0.9 : 0.05, sp: 3, up: 1.5, life: 0.5, size: 0.2 }); if (crit) puff(tgt.x, 1.2, tgt.z, 6, { c: SPARK, add: 1, sp: 5, life: 0.25, size: 0.14, grav: 0 });
  floatText(tgt.x, 2.2, tgt.z, fmt(d), crit ? '#ffd24a' : fromP ? '#ffffff' : '#c8d0ff', crit ? 22 : 15);
  if (fam !== 'spirit' && !o.dot) for (const a of actors) if (a.dormant && d2(a, tgt) < 9) wakeDormant(a);                       // blood spilled close by wakes the starved
  if (tgt.ai) { if (ours) tgt.ai.provoked = true; if (!tgt.ai.aggro) aggro(tgt, ours); if (ours) RT.combatT = 6; }
  if (o.poise && tgt.maxPoise) { tgt.poise -= o.poise; if (tgt.poise <= 0) stagger(tgt, tgt.def.boss ? 1.6 : 1.0); }
  if (o.kb && !tgt.def.boss) { const a = o.dir != null ? o.dir : src ? dirTo(src, tgt) : 0; tgt.kx += Math.sin(a) * o.kb; tgt.kz += Math.cos(a) * o.kb; }
  // vervain weakens a vampire, a hybrid or an Original and nothing else; wolfsbane burns, weakens and slows a werewolf or a hybrid and nothing else
  if (vv && (m === 'verv' || o.verv || (fromP && wpn && pl.buff.coatV > 0))) { if (!(tgt.fx.verv > 0)) floatText(tgt.x, 2.9, tgt.z, 'VERVAIN', '#c090ff', 13); addFx(tgt, 'verv', 6); addFx(tgt, 'sear', 3, d * 0.1); }
  if (bw && (m === 'wolfsbane' || o.bane || (fromP && wpn && pl.buff.coatW > 0))) { if (!(tgt.fx.wolfsbane > 0)) floatText(tgt.x, 2.9, tgt.z, 'WOLFSBANE', '#ffe060', 13); addFx(tgt, 'wolfsbane', 6); addFx(tgt, 'sear', 3, d * 0.1); }
  // werewolf venom: an enemy's venomous bite; the player's bite whenever P.venom says it carries any (a wolf, a hybrid, a moonlight ring on the full moon); the Alpha's Fang
  if (o.venom) venomOn(tgt, d * 0.3, 8); else if (fromP && wpn) { if (m === 'bite') { if (P.venom > 0) venomOn(tgt, d * P.venom, 8); } else if (o.melee && !pl.wolf && S.eq.weapon && S.eq.weapon.uniq === 'alphafang') venomOn(tgt, d * 0.6, 6); }
  if (fromP) {
    const ls = P.ls || 0; if (ls > 0 && !o.noLs && !noMend()) heal(d * ls / 100, true); if (P.burn > 0 && !o.dot) addFx(tgt, 'burn', 3, P.burn * 0.5);
    if (P.rageGain > 0 && wpn) pl.rage = Math.min(100, (pl.rage || 0) + 3 * P.rageGain); if (pl.buff.cloak > 0 && !o.dot) pl.buff.cloak = 0;
    RT.hitstop = Math.max(RT.hitstop, crit ? 0.07 : o.heavy ? 0.06 : 0.035); RT.shake = Math.max(RT.shake, crit || o.heavy ? 0.35 : 0.14); sfx(crit ? 'crit' : 'hit');
  }
  if (tgt.hp <= 0) fall(tgt, src, o); return d;
}
function venomOn(e, dps, t) {   // slow death to an ordinary vampire (dps a second, and nothing heals); a fever that passes for an Original; nothing at all to a hybrid or the living
  if (e.dead || !undead(e) || isHyb(e)) return; if (isOrig(e)) { if (!(e.fx.sick > 0)) floatText(e.x, 3, e.z, 'FEVER', '#9ae060', 13); addFx(e, 'sick', 8); return; }
  if (!(e.fx.venom > 0)) floatText(e.x, 3, e.z, 'VENOM', '#9ae060', 14); addFx(e, 'venom', t, dps);
}
/* nothing closes while vervain or werewolf venom is in a vampire's blood */
const noMend = () => isVamp() && (pl.fx.verv > 0 || (!isHybrid() && !S.original && (S.venomUntil || 0) > absHours()));
/* at zero health: who dies, who only drops, who is spared */
function fall(e, src, o) {
  const ours = src === pl || !src || src.team === 0;
  if (undead(e)) { if (lethalTo(e, o)) trueDeath(e, src, o); else if (e.downed) e.hp = 1; else downEnemy(e, src); return; }
  if (ours && personLife(e) && !e.phantom && mercy() && !S.flags[e.type + 'Oath']) return knockOut(e, src);   // ...unless the story has had the player swear to this one death (S.flags.alphaOath)
  die(e, src);
}
function trueDeath(e, src, o) {
  const m = o.mat, L = o.lethal; e.burnt = m === 'fire' || m === 'sun' || (L === 'whiteoak' && isOrig(e));
  if (L === 'whiteoak' && isOrig(e)) { const w = S.eq.weapon; RT.flashV = 0.4; RT.shake = 0.8; sfx('fire'); sfx('boom'); ringFx(e.x, e.z, 0xffb060, 10, 1); puff(e.x, 1, e.z, 60, { c: FIRE, add: 1, sp: 4, up: 5, life: 1.1, size: 0.4, grav: -1, spread: 0.6 });
    if (w && w.uniq === 'whiteoak' && !w.indestructible) { S.eq.weapon = null; recalc(); refreshGear(); toast('The white oak catches with him and burns to nothing in your hand.'); } }
  else if (e.burnt) { puff(e.x, 1, e.z, 26, { c: FIRE, add: 1, sp: 2.5, up: 3.5, life: 0.8, size: 0.34, grav: -1, spread: 0.4 }); sfx('fire'); }
  else if (!L) floatText(e.x, 3, e.z, m === 'venom' ? 'THE VENOM TAKES IT' : m === 'steel' ? 'BEHEADED' : 'STAKED', '#ffd24a', 15);
  if (e.def.boss) (S.flags.slain = S.flags.slain || {})[e.type] = S.day;
  die(e, src);
  // when an Original dies, every vampire he ever made dies with him. The player's own unlinking (S.unlinked) spares the player and nobody else; Ambrose can be cut loose separately
  if (L === 'whiteoak' && isOrig(e)) storyEvent('slain', e);
  if (L === 'whiteoak' && isOrig(e)) for (const a of actors.slice()) if (a.kind === 'enemy' && !a.dead && !a.phantom && a.def.line === e.type && !(a.type === 'ambrose' && S.flags.ambroseFree)) { a.paid = true; a.downed = false; tombFell(a); floatText(a.x, 2.9, a.z, 'THE LINE DIES', '#b8c0d0', 13); puff(a.x, 1.5, a.z, 8, { c: BLOOD, add: 0.05, sp: 1.5, life: 0.6, size: 0.2 }); die(a, null); }
}
const lineDead = d => !!(d.line && S.flags.slain && S.flags.slain[d.line]);   // nothing of a dead Original's line is left to meet
/* a vampire, hybrid or Original with nothing left only goes grey and lies still for a while. Finish it (finishDowned, or the right kind of blow) or it gets up. */
function downEnemy(e, src) {
  const orig = isOrig(e), first = !e.downN; e.downed = true; e.downN = (e.downN || 0) + 1; e.hp = 1; e.sw = null; e.lieK = 0; e.sp = 0; e.kx = e.kz = 0; e.y = 0; e.poise = e.maxPoise; e.fx.stun = e.fx.charm = e.fx.bleed = 0; if (e.team === 0 && !e.ally) e.team = 1; dropAtk(e);
  e.downT = e.downFor || (orig ? 150 : isHyb(e) ? 4.5 : e.def.boss ? 9 : 7); e.downFor = 0; sfx('die'); floatText(e.x, 2.9, e.z, orig ? 'DESICCATED' : 'DOWN', '#b8c0d0', orig ? 20 : 15); puff(e.x, 1, e.z, 12, { c: ASH, add: 0.1, sp: 1.5, up: 1, life: 0.8, size: 0.3, grav: 1 });
  if (RT.boss === e) { RT.boss = null; hideBoss(); }
  if (first && (!e.def.boss || orig)) tombFell(e);
  if (orig) { if (first) payout(e, src); storyEvent('downed', e); }                                                         // an Original does not die of this. It counts as beaten all the same.
  else if (!RT.downTip) { RT.downTip = 1; toast(isHyb(e) ? 'A hybrid only stays down for a moment. Take the head or the heart before it gets up.' : 'It is down, not dead. Wood through the heart, fire, or the head, before it gets up.'); }
}
function riseEnemy(e) {
  e.downed = false; e.lieK = 0; e.hp = e.riseHp > 0 ? Math.min(e.maxHp, e.riseHp) : e.maxHp * (isOrig(e) ? 0.6 : e.def.boss ? 0.3 : 0.4); e.riseHp = 0; ungreyRig(e); e.ai.gcd = 1; e.ai.aggro = true; e.fx.stun = 0.5; e.poise = e.maxPoise; floatText(e.x, 2.9, e.z, 'RISES', '#ff8080', 15); sfx('growl');
  if (e.def.boss && e.team === 1 && !pl.dead && d2(e, pl) < 40) { RT.boss = e; showBoss(e); }
}
function wakeDormant(e) { if (!e.dormant) return; e.dormant = false; e.lieK = 0; ungreyRig(e); for (const n in e.rig.mats) e.rig.mats[n].color.lerp(DESIC, 0.4); e.fx.stun = 0.9; e.ai.gcd = 1.2; aggro(e); floatText(e.x, 2.8, e.z, 'WAKES', '#ff8080', 13); sfx('growl'); }
function knockOut(e, src) {
  e.ko = true; e.koT = 50; e.hp = 1; e.team = 2; e.sw = null; e.lieK = 0; e.sp = 0; e.kx = e.kz = 0; e.fx = {}; dropAtk(e); if (RT.boss === e) { RT.boss = null; hideBoss(); } floatText(e.x, 2.8, e.z, 'OUT COLD', '#d8d0c0', 14); sfx('die'); payout(e, src);
  if (!S.flags.mercyTip) { S.flags.mercyTip = 1; toast('You pulled the blow. They are out cold, not dead. If you ever kill a person, the curse in your blood wakes.'); }
}
function tombFell(e) { if (e.fell || RT.area.id !== 'tomb' || e.ai.summoned || e.noLoot) return; e.fell = true; const a = RT.area; a.killed++; if (!a.cleared && a.killed >= a.need) clearFloor(); }
/* experience, loot and quest credit: once per enemy, whether it died, was knocked cold, or (an Original) was only dropped */
function payout(e, src) {
  if (e.paid || e.noLoot || e.phantom) return; e.paid = true; const diff = clamp(1 + (e.lvl - S.lvl) * 0.08, 0.3, 2); gainXp(e.xp * diff); S.kills[e.type] = (S.kills[e.type] || 0) + 1; S.stats.kills++;
  if (!e.def.peaceful) { const boss = e.def.boss; dropLoot(e.x, e.z, e.lvl, { n: boss ? 4 : e.elite ? 2 : 1, chance: boss || e.elite ? 1 : 0.22, bias: boss ? 1.6 : e.elite ? 0.9 : 0, gold: (3 + e.lvl * 1.6) * (e.def.gold || 1) * (boss ? 12 : e.elite ? 3 : 1), fam: e.fam, boss }); }
  if (sk('h_slayer')) { pl.buff.slayer = 10; pl.buff.slayerN = Math.min(5, (pl.buff.slayerN || 0) + 1); } if (P.spiritFoc > 0) pl.foc = Math.min(P.maxFoc, pl.foc + P.spiritFoc);
  qEvent('kill', e); tombFell(e);
}
function hitPlayer(src, o) {
  if (pl.dead || pl.inv > 0 || RT.paused) return 0; let d = o.dmg * (src && src.dmgM ? src.dmgM : 1); if (src && src.fx && (src.fx.verv > 0 || src.fx.wolfsbane > 0 || src.fx.venom > 0 || src.fx.sick > 0)) d *= src.fx.sick > 0 && !(src.fx.verv > 0) ? 0.8 : 0.75;
  const from = src || o.at, ang = from ? Math.abs(angd(dirTo(pl, from), pl.rot)) : 0, vamp = isVamp(), wolf = isWolf(), m = o.mat;
  if (pl.block && !o.unblock && ang < 1.9) {
    if (pl.blockT < P.parryWin) { sfx('parry'); puff(pl.x + Math.sin(pl.rot), 1.3, pl.z + Math.cos(pl.rot), 16, { c: SPARK, add: 1, sp: 6, life: 0.3, size: 0.16, grav: 0 }); floatText(pl.x, 2.6, pl.z, 'PARRY', '#ffe9a0', 20); RT.hitstop = 0.09; RT.flashV = 0.12; pl.buff.riposte = 3; pl.sta = Math.min(P.maxSta, pl.sta + 15); qEvent('parry');
      if (o.proj) { const p = o.proj; p.team = 0; p.owner = pl; p.vx = -p.vx * 1.3; p.vz = -p.vz * 1.3; p.dmg = o.dmg * 2.5; p.life = 2; p.keep = true; } else if (src && src.kind === 'enemy') { if (src.def.boss) { src.poise -= src.maxPoise * 0.45; if (src.poise <= 0) stagger(src, 1.6); } else stagger(src, 1.5); } return 0; }
    d *= 0.22; pl.sta -= Math.min(45, 10 + o.dmg / P.maxHp * 110); sfx('block'); puff(pl.x + Math.sin(pl.rot) * 0.7, 1.2, pl.z + Math.cos(pl.rot) * 0.7, 6, { c: SPARK, add: 1, sp: 3, life: 0.2, size: 0.12, grav: 0 });
    if (pl.sta <= 0) { pl.sta = 0; addFx(pl, 'stun', 0.9); pl.block = false; floatText(pl.x, 2.6, pl.z, 'GUARD BROKEN', '#ff8080', 16); }
  }
  d *= 1 - P.mit; if (vamp) { if (m === 'wood') d *= 1.25; else if (m === 'fire') d *= 1.3; }
  if (o.verv && vamp) { d *= 1.15; pl.fx.verv = Math.max(pl.fx.verv || 0, 6); floatText(pl.x, 2.9, pl.z, 'VERVAIN', '#c090ff', 15); }
  if (o.bane && wolf) { d *= 1.15; pl.fx.wolfsbane = Math.max(pl.fx.wolfsbane || 0, 6); pl.fx.slow = Math.max(pl.fx.slow || 0, 3); floatText(pl.x, 2.9, pl.z, 'WOLFSBANE', '#ffe060', 15); }
  if (pl.buff.ward > 0) { const ab = Math.min(pl.buff.ward, d); pl.buff.ward -= ab; d -= ab; puff(pl.x, 1.2, pl.z, 6, { c: MAGIC, add: 1, sp: 3, life: 0.3, size: 0.2, grav: 0 }); if (d <= 0.5) return 0; }
  d = Math.max(1, d); pl.hp -= d; RT.hurtV = Math.min(1, 0.35 + d / P.maxHp * 2.5); RT.shake = Math.max(RT.shake, 0.3 + d / P.maxHp * 2); sfx('hurt'); floatText(pl.x, 2.4, pl.z, '-' + fmt(d), '#ff5a5a', 17); pl.flinch = 0.2; pl.flash = 0.1; RT.combatT = 6;
  puff(pl.x, 1.2, pl.z, 6, { c: BLOOD, add: 0.05, sp: 3, up: 1.5, life: 0.5, size: 0.2 }); if (pl.feed) endFeed(true); if (pl.pull) pl.pull = 0;
  for (const a of actors) if (a.dormant && d2(a, pl) < 9) wakeDormant(a);
  // wood stays in a vampire. Nothing closes around a bolt or a wooden bullet until it is pulled out.
  if (vamp && m === 'wood' && o.proj && pl.hp > 0) { const first = !(pl.fx.lodged > 0); pl.fx.lodged = Math.min(4, (pl.fx.lodged || 0) + 1); if (first) recalc(); floatText(pl.x, 3.1, pl.z, 'LODGED', '#e8c890', 14); if (!RT.lodgeTip) { RT.lodgeTip = 1; toast(RT.touch ? 'The bolt is still in you. Nothing heals until it is out: hold USE to pull it.' : 'The bolt is still in you. Nothing heals until it is out: hold E to pull it.'); } }
  // a werewolf's bite, or a hybrid's: death in a day for an ordinary vampire, a fever for an Original, nothing to a hybrid or the living
  if (o.venom && vamp && !isHybrid() && pl.hp > 0) envenom(src);
  if (P.rageGain > 0) pl.rage = Math.min(100, (pl.rage || 0) + 6 * P.rageGain);
  if (o.kb) { const a = from ? dirTo(from, pl) : 0; pl.kx += Math.sin(a) * o.kb; pl.kz += Math.cos(a) * o.kb; }
  if (P.thorns > 0 && src && src.kind === 'enemy' && !src.dead && !lying(src) && !src.phantom) { src.hp -= P.thorns; src.flash = 0.1; if (src.hp <= 0) fall(src, pl, { mat: 'steel' }); }
  if (src && src.leech && !src.dead && !(src.fx.verv > 0)) src.hp = Math.min(src.maxHp, src.hp + d * src.leech * 4);
  const sw = sk('h_second'); if (sw && pl.hp > 0 && pl.hp < P.maxHp * 0.3 && pl.buff.second <= 0) { pl.buff.second = 90; heal(P.maxHp * (0.1 + 0.1 * sw)); floatText(pl.x, 3, pl.z, 'SECOND WIND', '#9effa0', 16); }
  if (pl.hp <= 0) playerDeath(src, o); return d;
}
function heal(n, quiet) { if (pl.dead || (pl.fx.lodged > 0 && isVamp())) return; const b = pl.hp; pl.hp = Math.min(P.maxHp, pl.hp + n); if (!quiet && pl.hp - b > 1) { floatText(pl.x, 2.6, pl.z, '+' + fmt(pl.hp - b), '#7dff8a', 15); puff(pl.x, 1, pl.z, 8, { c: GREEN, add: 0.9, sp: 1, up: 2.5, life: 0.7, size: 0.18, grav: -1 }); } }
function addFx(a, k, t, v) { if (a.dead || (a !== pl && lying(a) && k !== 'venom' && k !== 'burn')) return; if (a === pl && k === 'stun' && pl.buff.fury > 0) return; if (k === 'stun' && a.def) { if (a.def.boss) t *= 0.4; else if (isOrig(a)) t *= 0.6; } a.fx[k] = Math.max(a.fx[k] || 0, t); if (v != null) a.fx[k + 'D'] = Math.max(a.fx[k + 'D'] || 0, v); }
function stagger(e, t) { if (e.dead || lying(e)) return; e.poise = e.maxPoise; e.fx.stun = Math.max(e.fx.stun || 0, t); if (e.ai && e.ai.cur) { dropAtk(e); e.sw = null; e.y = 0; } floatText(e.x, 2.8, e.z, 'STAGGERED', '#ffe9a0', 14); puff(e.x, 2, e.z, 8, { c: SPARK, add: 1, sp: 2, life: 0.4, size: 0.14, grav: 0 }); }
function aggro(e, prov) { if (e.def.peaceful || e.ai.aggro) return; e.ai.aggro = true; e.ai.gcd = Math.max(e.ai.gcd, 0.35); if (e.def.boss && e.team === 1) { RT.boss = e; showBoss(e); sfx('growl'); } for (const o of actors) if (o.kind === 'enemy' && o !== e && !o.dead && !lying(o) && o.team === e.team && !o.def.peaceful && d2(o, e) < 13) { if (prov && o.fam === e.fam) o.ai.provoked = true; if (!o.ai.aggro) { o.ai.aggro = true; o.ai.gcd = R(0.3, 0.9); } } }   // strike one of a pack, or one of the Council's men, and the rest of them take it personally
function tickFx(a, dt) {
  const f = a.fx; for (const k of ['stun', 'slow', 'mark', 'charm', 'verv', 'root', 'wolfsbane', 'aneur', 'sick']) if (f[k] > 0) f[k] -= dt;
  for (const [k, c, m] of [['burn', FIRE, 'fire'], ['bleed', BLOOD, 'steel'], ['venom', GREEN, 'venom'], ['sear', VERV, 'verv']]) if (f[k] > 0) { f[k] -= dt; f[k + 'T'] = (f[k + 'T'] || 0) - dt; if (f[k + 'T'] <= 0) { f[k + 'T'] = 0.5; const d = (f[k + 'D'] || 1) * 0.5; if (a === pl) { pl.hp -= d; if (pl.hp <= 0) playerDeath(null, { mat: m, dot: 1 }); } else { a.hp -= d; a.hpShow = 3; floatText(a.x, 2, a.z, fmt(d), k === 'burn' ? '#ff9a3a' : k === 'venom' ? '#9ae060' : k === 'sear' ? '#c090ff' : '#d04050', 12); if (a.hp <= 0) fall(a, pl, { mat: m, dot: 1 }); } puff(a.x, 1.2, a.z, 3, { c, add: k === 'bleed' ? 0.05 : 1, sp: 1, up: 2, life: 0.5, size: 0.2, grav: k === 'bleed' ? 6 : -2 }); } if (f[k] <= 0) f[k + 'D'] = 0; }
  if (a.kind === 'enemy' && !(f.charm > 0) && a.team === 0 && !a.ally) a.team = 1;
}
function die(e, src) {
  if (e.dead) return; e.dead = true; e.hp = 0; e.sw = null; e.downed = false; dropAtk(e); sfx('die'); if (RT.boss === e) { RT.boss = null; hideBoss(); }
  if (e.kind !== 'enemy') return; const byP = src === pl || (src && src.team === 0) || !src;
  if (e.volatile) hazard(e.x, e.z, 3.6, 0.8, e.dmg * 1.3, { team: 1, mat: 'fire', col: 0xff7a20 });
  if (!byP || e.phantom) return; payout(e, src);
  if (undead(e) && e.ring && !e.def.boss && !hasUniq('daylight') && !(S.cons.lapisq > 0) && chance(0.4)) mkDrop(e.x, e.z, 'cons', ['lapisq', 1], 0x4a6ae0);   // its daylight ring was spelled for it alone, but the lapis can be spelled again
  if (personLife(e) && S.origin === 'wolf' && S.species === 'human') triggerCurse();   // a human life taken wakes the gene. Mercy (see fall) is what keeps this from happening by accident.
  if ((e.def.five || e.type === 'fivehunter') && isVamp()) hunterCurse();                 // the Hunter's Curse falls on a vampire who kills one of the Five
}

/* ---------------- projectiles and hazards ---------------- */
const shotGeo = new T.BoxGeometry(0.12, 0.12, 0.9), orbGeo = new T.SphereGeometry(0.28, 8, 6);
function shoot(owner, x, z, rot, o) {
  const orb = !!o.orb, m = new T.Mesh(orb ? orbGeo : shotGeo, new T.MeshBasicMaterial({ color: o.col || 0xe8c890 })); m.rotation.y = rot; m.position.set(x, 1.3, z); if (o.size) m.scale.setScalar(o.size); areaAdd(m);
  const p = Object.assign({ m, x, z, vx: Math.sin(rot) * o.spd, vz: Math.cos(rot) * o.spd, t: 0, life: (o.range || 22) / o.spd, team: owner.team === 2 ? 1 : owner.team, owner, r: 0.5, hitIds: {} }, o); shots.push(p); return p;
}
function updShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) { const p = shots[i]; p.t += dt; p.x += p.vx * dt; p.z += p.vz * dt; p.m.position.set(p.x, 1.3, p.z); p.m.rotation.y = Math.atan2(p.vx, p.vz); if (p.tumble) p.m.rotation.x += dt * 9; let gone = p.t > p.life || solidAt(p.x, p.z);
    if (p.orb && chance(0.6)) puff(p.x, 1.3, p.z, 1, { c: p.pc || MAGIC, add: 1, sp: 0.4, life: 0.35, size: 0.22, grav: 0, spread: 0.1 });
    if (!gone) { const targets = p.team === 0 ? actors.filter(a => a.team === 1 && !a.dead && a.kind === 'enemy' && !a.ko) : [pl, ...actors.filter(a => a.team === 0 && !a.dead && a.kind === 'enemy' && !lying(a))];
      for (const a of targets) { if (a.dead || p.hitIds[a.id] || hyp(a.x - p.x, a.z - p.z) > p.r + a.r) continue; p.hitIds[a.id] = 1; p.keep = false; const got = hit(p.owner, a, { dmg: p.dmg, mat: p.mat, proj: p, verv: p.verv, bane: p.bane, venom: p.venom, kb: p.kb != null ? p.kb : 2, poise: p.poise || 6, spell: p.spell, at: p, dir: Math.atan2(p.vx, p.vz) }); if (p.keep) { p.hitIds = {}; p.t = 0; break; } if (a === pl && got === 0 && pl.inv > 0) { delete p.hitIds[a.id]; continue; } if (p.onHit && got) p.onHit(a); if (!p.pierce) { gone = true; break; } } }
    if (gone) { puff(p.x, 1.3, p.z, 5, { c: p.pc || SPARK, add: 1, sp: 2, life: 0.25, size: 0.14, grav: 0 }); p.m.parent && p.m.parent.remove(p.m); p.m.material.dispose(); shots.splice(i, 1); } }
}
/* hazard: a delayed circular blast (or lingering pool). o: team, mat, col, linger seconds, tick, onHit, src */
function hazard(x, z, r, delay, dmg, o = {}) { const h = Object.assign({ x, z, r, delay, dmg, t: 0, team: 1, done: false, linger: 0, tickT: 0 }, o); if (delay > 0.05) h.tele = telegraph(x, z, 0, { kind: 'circle', r }, delay + 0.02, o.col || 0xff2030); zonesFx.push(h); return h; }
function hazardHit(h, dmg) { const targets = h.team === 0 ? actors.filter(a => a.team === 1 && !a.dead && a.kind === 'enemy' && !a.ko) : [pl, ...actors.filter(a => a.team === 0 && !a.dead && a.kind === 'enemy' && !lying(a))]; for (const a of targets) if (a !== h.skip && hyp(a.x - h.x, a.z - h.z) < h.r + a.r * 0.5) { const got = hit(h.src || null, a, { dmg, mat: h.mat, at: h, unblock: h.unblock, kb: h.kb || 0, poise: h.poise || 0, spell: h.spell, verv: h.verv, bane: h.bane, venom: h.venom, dot: h.linger > 0, noCrit: h.linger > 0 && h.done }); if (got && h.onHit) h.onHit(a); } }
function updHazards(dt) {
  for (let i = zonesFx.length - 1; i >= 0; i--) { const h = zonesFx[i]; h.t += dt;
    if (!h.done && h.t >= h.delay) { h.done = true; hazardHit(h, h.dmg); const c = h.pc || (h.mat === 'fire' ? FIRE : h.mat === 'magic' ? MAGIC : h.mat === 'verv' ? VERV : h.mat === 'wolfsbane' ? HOLY : SPARK); puff(h.x, 0.5, h.z, Math.min(40, 10 + h.r * 6), { c, add: 1, sp: h.r * 1.6, up: 2.5, life: 0.5, size: 0.3, grav: 2, spread: h.r * 0.4 }); ringFx(h.x, h.z, h.col || 0xffa040, h.r * 1.2, 0.35); if (h.r > 2.5) { sfx('boom'); if (d2(pl, h) < 16) RT.shake = Math.max(RT.shake, 0.4); } if (h.after) h.after(); }
    if (h.done) { if (h.linger > 0) { h.linger -= dt; h.tickT -= dt; if (h.tickT <= 0) { h.tickT = 0.5; hazardHit(h, h.tick || h.dmg * 0.25); } if (chance(0.7)) puff(h.x + R(-h.r, h.r) * 0.7, 0.2, h.z + R(-h.r, h.r) * 0.7, 1, { c: h.pc || FIRE, add: 1, sp: 0.4, up: 2.2, life: 0.6, size: 0.3, grav: -1 }); } if (h.linger <= 0) zonesFx.splice(i, 1); } }
  updCircles(dt);
}
/* boundary spells: whoever stood inside when the circle closed cannot cross it until it fades, or until the witch who cast it falls */
const circles = [];
function addCircle(x, z, r, t, team, by) {
  const m = new T.Mesh(new T.RingGeometry(r - 0.2, r + 0.08, 56).rotateX(-PI / 2), new T.MeshBasicMaterial({ color: team === 0 ? 0x8a9cff : 0xff5a6a, transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending })); m.position.set(x, 0.14, z); areaAdd(m);
  const c = { x, z, r, t, t0: t, team, by, m, held: [], pl: false, area: RT.area };
  if (team === 0) { for (const a of actors) if (a.kind === 'enemy' && a.team === 1 && !a.dead && hyp(a.x - x, a.z - z) < r) c.held.push(a); } else c.pl = hyp(pl.x - x, pl.z - z) < r;
  circles.push(c); ringFx(x, z, team === 0 ? 0x8a9cff : 0xff5a6a, r * 1.15, 0.6); return c;
}
function clampIn(a, c) { const dx = a.x - c.x, dz = a.z - c.z, l = hyp(dx, dz), m = Math.max(0.5, c.r - a.r - 0.15); if (l > m) { a.x = c.x + dx / l * m; a.z = c.z + dz / l * m; a.kx = a.kz = 0; if (chance(0.3)) puff(a.x, 1, a.z, 2, { c: c.team === 0 ? MAGIC : [1, 0.35, 0.4], add: 1, sp: 1.5, up: 1.5, life: 0.35, size: 0.16, grav: 0 }); return true; } return false; }
function endCircle(c) { c.t = 0; }
function updCircles(dt) {
  for (let i = circles.length - 1; i >= 0; i--) { const c = circles[i]; c.t -= dt; if (c.area !== RT.area || (c.by && c.by !== pl && (c.by.dead || lying(c.by))) || (c.team === 0 && pl.dead)) c.t = 0;
    if (c.t <= 0) { c.m.parent && c.m.parent.remove(c.m); c.m.geometry.dispose(); c.m.material.dispose(); circles.splice(i, 1); continue; }
    c.m.material.opacity = (0.55 + Math.sin(RT.time * 6) * 0.2) * Math.min(1, c.t * 2); if (c.pl && !pl.dead) clampIn(pl, c);
    for (const a of c.held) if (!a.dead) { clampIn(a, c); a.fx.root = Math.max(a.fx.root || 0, 0.25); a.fx.slow = Math.max(a.fx.slow || 0, 0.25); } }   // it holds anything: it held an Original once
}

/* ---------------- enemy AI ---------------- */
function mv(e, tx, tz, sp, dt, faceIt = true) { const dx = tx - e.x, dz = tz - e.z, l = hyp(dx, dz); if (l < 0.08) { e.sp = 0; return; } const f = e.fx, s = sp * e.spdM * (f.slow > 0 || f.wolfsbane > 0 || f.sick > 0 ? 0.55 : f.verv > 0 || f.venom > 0 ? 0.8 : 1); e.x += dx / l * s * dt; e.z += dz / l * s * dt; collide(e); e.sp = s; if (faceIt) e.rot = Math.atan2(dx, dz); }
/* Attacks. Most go by ATK[name].kind. The canon ones are picked out by their flag in the table (or their name) and resolved here, whatever kind the table falls back to:
   gaze (compulsion), grab (grab and feed), snap (broken neck), tk (telekinetic throw), boundary (a circle you cannot leave), aneurysm (pain infliction), dashchain. */
const ATKNAME = { gaze: 1, grab: 1, snap: 1, tk: 1, boundary: 1, aneurysm: 1, dashchain: 1 }, ATKKIND = { melee: 1, lunge: 1, slam: 1, shoot: 1, nova: 1, blink: 1, summon: 1 }, ATKFALL = { wbite: 'lunge', pounce: 'slam', firebolt: 'shoot', debris: 'shoot', bite: 'lunge' };
const akind = (n, A) => A.gaze ? 'gaze' : A.grab ? 'grab' : A.snap ? 'snap' : A.tk ? 'tk' : A.boundary ? 'boundary' : A.aneurysm ? 'aneurysm' : ATKNAME[n] ? n : ATKKIND[A.kind] ? A.kind : ATKFALL[n] || 'melee';
const isBite = (n, A) => !!A.venom || A.mat === 'bite' || n === 'wbite' || n === 'bite' || n === 'pounce', venomous = e => !e.phantom && (isHyb(e) || wolfShape(e) || !!e.def.venom);
const grabDist = A => A.dist || Math.max(3.2, (A.range || 2.6) + 1.2);
function startAtk(e, name, tgt) {
  const A = ATK[name], ai = e.ai, k = akind(name, A), c = ai.cur = { name, A, k, t: 0, ph: 'wind', rep: 0, tgt, wind: (A.wind || 0.6) * (e.enraged ? 0.82 : 1) }; e.rot = dirTo(e, tgt); c.tx = tgt.x; c.tz = tgt.z; sfx('tele');
  const jump = A.jump || name === 'pounce';
  e.sw = { kind: k === 'slam' ? 'slam' : k === 'summon' ? 'howl' : k === 'shoot' || k === 'nova' || k === 'tk' || k === 'boundary' || k === 'aneurysm' ? (name === 'debris' ? 'wind' : 'cast') : k === 'gaze' ? 'gaze' : 'wind', t: 0, dur: c.wind, hold: true, jump: jump ? 2.4 : 0 };
  if (k === 'melee') c.tele = telegraph(e.x, e.z, e.rot, { kind: 'arc', r: A.range + e.r, arc: A.arc }, c.wind); else if (k === 'lunge' || k === 'dashchain') c.tele = telegraph(e.x, e.z, e.rot, { kind: 'line', len: A.dist || 7, w: (A.w || 1.4) * 2 }, c.wind);
  else if (k === 'grab') c.tele = telegraph(e.x, e.z, e.rot, { kind: 'line', len: grabDist(A), w: (A.w || 1.2) * 2 }, c.wind, 0xb01030);
  else if (k === 'snap') c.tele = telegraph(e.x, e.z, e.rot, { kind: 'arc', r: (A.range || 2.6) + e.r, arc: A.arc || 1.4 }, c.wind, 0xff8a20);
  else if (k === 'gaze') { c.tele = telegraph(e.x, e.z, e.rot, { kind: 'arc', r: (A.range || 9) + e.r, arc: A.arc || 1 }, c.wind, 0xb070ff); if (tgt === pl && !e.phantom) floatText(e.x, 3.1, e.z, 'Look away', '#c090ff', 13); }
  else if (k === 'slam') { if (!jump && !A.far) { c.tx = e.x; c.tz = e.z; } c.tele = telegraph(c.tx, c.tz, 0, { kind: 'circle', r: A.r || 3 }, c.wind); } else if (k === 'nova') c.tele = telegraph(e.x, e.z, 0, { kind: 'circle', r: 3 }, c.wind, 0xff3050);
  else if (k === 'tk') c.tele = telegraph(c.tx, c.tz, 0, { kind: 'circle', r: A.r || 2.8 }, c.wind, 0x8a7cff); else if (k === 'boundary') c.tele = telegraph(c.tx, c.tz, 0, { kind: 'circle', r: A.r || 5 }, c.wind, 0xff5a6a);
  else if (k === 'aneurysm') c.tele = telegraph(e.x, e.z, e.rot, { kind: 'line', len: Math.min(A.range || 12, d2(e, tgt) + 1), w: 0.7 }, c.wind, 0xc090ff);
  if (k === 'summon') { sfx(e.fam === 'wolf' ? 'howl' : 'magic'); } if (k === 'blink') puff(e.x, 1.2, e.z, 18, { c: [0.1, 0.05, 0.12], add: 0.2, sp: 2, life: 0.5, size: 0.4, grav: 0 });
}
function resolveAtk(e, c) {
  const A = c.A, k = c.k, name = c.name, dmg = e.dmg * (A.dmg || 1), ghost = !!e.phantom, bite = isBite(name, A), ven = bite && venomous(e), rock = name === 'debris' || !!A.solid, mat = A.mat || (bite ? 'bite' : e.fam === 'spirit' || k === 'shoot' && !A.wood && !rock ? (name === 'firebolt' ? 'fire' : 'magic') : A.wood ? 'wood' : 'steel');
  switch (k) {
    case 'melee': e.sw = { kind: e.rig.kind === 'biped' ? (e.rig.wpn && !/Claws/.test(e.def.look && e.def.look.w || '') ? (c.rep % 2 ? 'slashL' : 'slashR') : 'claw') : 'bite', t: 0, dur: 0.22 }; trail(e, A.range + e.r, A.arc, undead(e) ? 0xff5060 : 0xffe0b0, c.rep % 2 ? -1 : 1); sfx('swing');
      for (const t of foes(e)) if (d2(e, t) < A.range + e.r + t.r && Math.abs(angd(dirTo(e, t), e.rot)) < A.arc / 2) hit(e, t, { dmg, mat, kb: 3, poise: 10, venom: ven }); break;
    case 'lunge': case 'dashchain': c.ph = 'dash'; c.t = 0; c.left = A.dist || 7; c.hitIds = {}; e.sw = { kind: e.rig.kind === 'biped' ? (bite ? 'bite' : 'stab') : 'bite', t: 0, dur: (A.dist || 7) / 28, hold: true }; sfx('blur'); return;
    case 'grab': c.ph = 'dash'; c.t = 0; c.left = grabDist(A); c.hitIds = {}; e.sw = { kind: 'bite', t: 0, dur: 0.3, hold: true }; sfx('blur'); return;
    case 'slam': if (A.jump || name === 'pounce') { e.x = c.tx; e.z = c.tz; collide(e); } hazard(c.tx, c.tz, A.r || 3, 0, dmg, { team: e.team, src: e, mat, kb: 6, poise: 20, venom: ven, onHit: t => { if (name === 'pounce' && t === pl) addFx(pl, 'stun', 0.45); } });
      if (A.multi) for (let i = 0; i < A.multi; i++) { const t = c.tgt, a = R(0, TAU), d = i === 0 ? 0 : R(2, 7); hazard(t.x + Math.sin(a) * d, t.z + Math.cos(a) * d, A.r, 0.7 + i * 0.35, dmg, { team: e.team, src: e, mat: 'magic', pc: MAGIC, col: 0x8a5cff }); } break;
    case 'shoot': { const base = dirTo(e, c.tgt), n = A.n || 1, fire = mat === 'fire', col = A.col || (fire ? 0xff7a20 : rock ? 0x8a8478 : 0x9a6bff), hunted = A.wood && (e.def.verv || e.def.bane);
      for (let i = 0; i < n; i++) { const p = shoot(e, e.x + Math.sin(base) * 0.8, e.z + Math.cos(base) * 0.8, base + (i - (n - 1) / 2) * (A.spread || 0), { spd: A.spd || 15, dmg, mat, col, orb: A.orb != null ? !!A.orb : !(A.wood || rock), tumble: rock, r: rock ? 0.8 : 0.5, kb: rock ? 8 : 2, poise: rock ? 30 : 6, pc: A.wood || rock ? SPARK : fire ? FIRE : [((col >> 16) & 255) / 255, ((col >> 8) & 255) / 255, (col & 255) / 255],
        verv: hunted && isVamp() && chance(0.4), bane: hunted && isWolf() && chance(0.4), range: 26, onHit: fire && !ghost ? t => { addFx(t, 'burn', A.burn || 3, dmg * 0.22); } : null }); if (rock) p.m.scale.set(5, 4.5, 0.75); }
      sfx(A.wood ? 'shoot' : fire ? 'fire' : rock ? 'heavy' : 'magic'); e.sw = { kind: rock ? 'throw' : 'shoot', t: 0, dur: 0.25 }; break; }
    case 'nova': for (let i = 0; i < A.n; i++) shoot(e, e.x, e.z, i * TAU / A.n + c.rep * 0.2, { spd: A.spd, dmg, mat: 'magic', col: A.col, orb: true, pc: [1, 0.2, 0.3], range: 24 }); sfx('zap'); RT.shake = Math.max(RT.shake, 0.3); break;
    case 'blink': { const t = c.tgt, a = t.rot + PI + R(-0.8, 0.8); e.x = t.x + Math.sin(a) * 3; e.z = t.z + Math.cos(a) * 3; collide(e); e.rot = dirTo(e, t); puff(e.x, 1.2, e.z, 18, { c: [0.1, 0.05, 0.12], add: 0.2, sp: 2, life: 0.5, size: 0.4, grav: 0 }); sfx('blur'); e.ai.gcd = 0.25; break; }
    case 'summon': { const adds = actors.filter(a => a.ai && a.ai.summoned && !a.dead).length; let add = e.def.add && EN[e.def.add] ? e.def.add : EN.thrall ? 'thrall' : e.type;
        const moonAdd = RT.area.id === 'world' && moonNight(); if (add === 'werewolf' && !moonAdd && EN.packrunner) add = 'packrunner'; else if (add === 'packrunner' && moonAdd && EN.werewolf) add = 'werewolf';   // the pack answers a howl as wolves under the full moon, on two legs otherwise
        for (let i = 0; i < (A.n || 2) && adds + i < 6; i++) { const a = R(0, TAU), s = spawnEnemy(add, e.x + Math.sin(a) * 4, e.z + Math.cos(a) * 4, Math.max(1, e.lvl - 2), { awake: 1 }); s.ai.summoned = true; s.noLoot = true; s.team = e.team; if (wolfShape(s)) s.rig.g.scale.multiplyScalar(0.82); s.maxHp *= e.def.addHp || (wolfShape(s) ? 0.5 : 1); s.hp = s.maxHp; s.dmgM *= e.def.addDmg || 1; collide(s); aggro(s); puff(s.x, 1, s.z, 14, { c: e.fam === 'wolf' ? [0.2, 0.2, 0.22] : [0.3, 0.05, 0.1], add: 0.4, sp: 2, up: 2, life: 0.6, size: 0.35, grav: 0 }); } break; }
    case 'gaze': {   // compulsion: eye contact and a word. Turn away, break the line of sight, or have vervain in you.
      const t = c.tgt; sfx('magic'); e.sw = { kind: 'gaze', t: 0, dur: 0.35 }; if (t !== pl || ghost || pl.dead) break;
      const met = pl.inv <= 0 && d2(e, pl) < (A.range || 9) + e.r + 0.5 && Math.abs(angd(dirTo(e, pl), e.rot)) < (A.arc || 1) / 2 + 0.05 && Math.abs(angd(dirTo(pl, e), pl.rot)) < 1.7 && los(e, pl);
      if (!met) { floatText(pl.x, 2.9, pl.z, 'You looked away', '#c8c0e0', 13); break; }
      if (pl.wolf || immuneCompel(isOrig(e))) { floatText(pl.x, 2.9, pl.z, 'RESISTED', '#c090ff', 16); e.ai.noGaze = true; ringFx(pl.x, pl.z, 0xb070ff, 2.5, 0.4); break; }
      addFx(pl, 'charm', A.charm || A.dur || 2.6); pl.charmBy = e; pl.act = null; pl.block = false; pl.buf = null; if (pl.feed) endFeed(true); floatText(pl.x, 2.9, pl.z, 'COMPELLED', '#c090ff', 18); RT.flashV = 0.12; ringFx(pl.x, pl.z, 0xb070ff, 3, 0.6); break; }
    case 'snap': {  // a broken neck: the end of a human, a few lost seconds to a vampire
      e.sw = { kind: 'claw', t: 0, dur: 0.25 }; sfx('swing'); trail(e, (A.range || 2.6) + e.r, A.arc || 1.4, 0xff8a20);
      for (const t of foes(e)) if (d2(e, t) < (A.range || 2.6) + e.r + t.r && Math.abs(angd(dirTo(e, t), e.rot)) < (A.arc || 1.4) / 2) { if (t !== pl) { hit(e, t, { dmg: dmg * 1.6, mat: 'steel', kb: 4, poise: 30 }); continue; }
          const und = isVamp(), got = hit(e, pl, { dmg: dmg * (und ? 1 : 1.6), mat: 'steel', unblock: 1, kb: 2 }); if (got && !pl.dead) { sfx('crit'); if (und) { addFx(pl, 'stun', A.stun || 2.2); floatText(pl.x, 2.9, pl.z, 'NECK SNAPPED', '#ff8080', 17); } } } break; }
    case 'tk': e.sw = { kind: 'cast', t: 0, dur: 0.3 }; sfx('zap'); hazard(c.tx, c.tz, A.r || 2.8, 0, dmg, { team: e.team, src: e, mat: 'magic', pc: MAGIC, col: 0x8a7cff, kb: (A.kb || 9) * 7.4, unblock: 1, onHit: t => { if (t === pl) addFx(pl, 'stun', 0.5); } }); break;
    case 'boundary': e.sw = { kind: 'cast', t: 0, dur: 0.4 }; sfx('magic'); if (!ghost && !pl.dead && hyp(pl.x - c.tx, pl.z - c.tz) < (A.r || 5)) { addCircle(c.tx, c.tz, A.r || 5, A.root || A.dur || 5, 1, e); floatText(pl.x, 2.9, pl.z, 'BOUND', '#ff9090', 17); } else ringFx(c.tx, c.tz, 0xff5a6a, (A.r || 5) * 1.1, 0.4); break;
    case 'aneurysm': {   // pain infliction: the blood vessels in the head burst, and in a vampire they heal, and burst again
      const t = c.tgt; e.sw = { kind: 'cast', t: 0, dur: 0.4 }; sfx('zap'); if (ghost || t.dead || d2(e, t) > (A.range || 12) + 2 || !los(e, t)) break;
      const st = A.stun || 1.2; if (t !== pl) { hit(e, t, { dmg, mat: 'magic' }); addFx(t, 'stun', st); break; }
      const sup = isVamp() || isWolf(), sip = S.origin === 'siphoner' && canMagic(), got = hit(e, pl, { dmg: dmg * (sup ? 1 : 0.6) * (sip ? 0.5 : 1), mat: 'magic', unblock: 1 }); if (!got || pl.dead) break;
      puff(pl.x, 2.1, pl.z, 10, { c: MAGIC, add: 1, sp: 1.5, life: 0.5, size: 0.2, grav: 0 }); if (sip) { pl.foc = Math.min(P.maxFoc, pl.foc + 12); floatText(pl.x, 3.1, pl.z, 'SIPHONED', '#ff7080', 14); }   // a siphoner drinks half of any spell thrown straight at her
      addFx(pl, 'stun', sup ? st : st * 0.5); floatText(pl.x, 2.9, pl.z, 'PAIN', '#c090ff', 17); if (sup) pl.fx.aneur = Math.max(pl.fx.aneur || 0, st + 1.5); break; }
  }
  c.ph = 'rec'; c.t = 0;
}
function updAtk(e, dt) {
  const ai = e.ai, c = ai.cur, A = c.A, k = c.k; c.t += dt;
  if (c.ph === 'wind') { const fixed = k === 'slam' || k === 'tk' || k === 'boundary'; if (c.tgt && !c.tgt.dead && c.t < c.wind - 0.14 && !fixed) { e.rot += angd(dirTo(e, c.tgt), e.rot) * Math.min(1, dt * 6); if (c.tele) c.tele.m.rotation.y = e.rot; } if (c.tele && !fixed) c.tele.m.position.set(e.x, 0.1, e.z); if (c.t >= c.wind) { if (c.tele) { c.tele.kill = 1; c.tele = null; } resolveAtk(e, c); } }
  else if (c.ph === 'dash') { const spd = k === 'dashchain' ? 36 : 28, step = Math.min(c.left, spd * dt); for (let i = 0; i < 3; i++) { e.x += Math.sin(e.rot) * step / 3; e.z += Math.cos(e.rot) * step / 3; if (collide(e)) c.left = 0; } c.left -= step; e.sp = 12; if (chance(k === 'dashchain' ? 1 : 0.5)) puff(e.x, 1, e.z, 1, { c: [0.2, 0.2, 0.3], add: 0.3, sp: 0.5, life: 0.3, size: 0.35, grav: 0 });
    const bite = isBite(c.name, A);
    for (const t of foes(e)) if (!c.hitIds[t.id || 'p'] && d2(e, t) < (A.w || 1.4) + t.r) { c.hitIds[t.id || 'p'] = 1;
      if (k === 'grab' && t === pl) { if (e.phantom || pl.inv > 0) continue; if (pl.wolf || pl.buff.fury > 0 || RT.time < (pl.grabT || 0)) { hit(e, pl, { dmg: e.dmg * (A.dmg || 1), mat: 'bite', kb: 6, venom: venomous(e) }); continue; } c.ph = 'hold'; c.t = 0; c.tick = 0.15; c.holdT = A.root || A.hold || 1.5; e.sp = 0; e.sw = { kind: 'bite', t: 0, dur: c.holdT, hold: true }; pl.act = null; pl.block = false; pl.buf = null; if (pl.feed) endFeed(true); pl.pose = 'held'; pl.fx.stun = Math.max(pl.fx.stun || 0, 0.3); e.rot = dirTo(e, pl); pl.rot = e.rot; floatText(pl.x, 2.9, pl.z, 'SEIZED', '#ff8080', 16); sfx('bite'); return; }
      hit(e, t, { dmg: e.dmg * (A.dmg || 1), mat: A.mat || (bite ? 'bite' : e.fam === 'spirit' ? 'magic' : 'steel'), kb: 7, poise: 16, venom: bite && k !== 'grab' && venomous(e) }); }
    if (c.left <= 0) { c.ph = 'rec'; c.t = 0; e.sw = null; } }
  else if (c.ph === 'hold') {   // grab and feed: your blood heals it, unless there is vervain in you
    e.sp = 0; c.tick -= dt; let free = c.t >= c.holdT || pl.dead; if (!free) pl.fx.stun = Math.max(pl.fx.stun || 0, 0.15);
    if (!free && vervDosed() && !isVamp()) { free = true; e.hp = Math.max(1, e.hp - e.maxHp * 0.08); e.hpShow = 3; addFx(e, 'verv', 6); floatText(e.x, 2.9, e.z, 'VERVAIN', '#c090ff', 16); puff(e.x, 1.6, e.z, 12, { c: VERV, add: 1, sp: 2, life: 0.5, size: 0.2, grav: 0 }); sfx('fire'); c.burned = 1; }
    else if (!free && c.tick <= 0) { c.tick = 0.4; const inv = pl.inv; pl.inv = 0; const d = hitPlayer(e, { dmg: e.dmg * (A.dmg || 1) * 0.3, mat: 'bite', unblock: 1, venom: venomous(e) }); pl.inv = inv; if (d > 0 && !isVamp() && !(e.fx.verv > 0)) { e.hp = Math.min(e.maxHp, e.hp + (A.heal ? e.maxHp * A.heal / Math.max(1, Math.round(c.holdT / 0.4)) : d * 3)); e.hpShow = 3; puff(e.x, 1.6, e.z, 5, { c: BLOOD, add: 0.05, sp: 1.5, life: 0.5, size: 0.2 }); } if (ai.cur !== c) return; }
    if (free) { pl.pose = null; pl.grabT = RT.time + 3.5; pl.fx.stun = Math.min(pl.fx.stun || 0, 0.25); const a = dirTo(e, pl); pl.kx += Math.sin(a) * 6; pl.kz += Math.cos(a) * 6; c.ph = 'rec'; c.t = 0; e.sw = null; if (c.burned) stagger(e, 1.4); } }
  else if (c.t >= (A.rec || 0.6) * (e.enraged ? 0.75 : 1)) { const reps = A.reps || (k === 'dashchain' ? A.n || 3 : 0);
    if (reps && c.rep < reps - 1 && c.tgt && !c.tgt.dead && !lying(c.tgt) && d2(e, c.tgt) < (A.range || 8) + 2.5) { c.rep++; c.ph = 'wind'; c.t = 0; c.wind = k === 'dashchain' ? 0.28 : (A.wind || 0.6) * 0.72; e.rot = dirTo(e, c.tgt); e.sw = { kind: 'wind', t: 0, dur: c.wind, hold: true }; if (k === 'melee') c.tele = telegraph(e.x, e.z, e.rot, { kind: 'arc', r: A.range + e.r, arc: A.arc }, c.wind); else if (k === 'lunge' || k === 'dashchain') c.tele = telegraph(e.x, e.z, e.rot, { kind: 'line', len: A.dist || 7, w: (A.w || 1.4) * 2 }, c.wind); }
    else { ai.cd[c.name] = (A.cd || 3) * R(0.8, 1.2) * (e.enraged ? 0.7 : 1); ai.gcd = e.def.boss ? R(0.25, 0.6) : R(0.5, 1.1); ai.cur = null; e.sw = null; } }
}
function atkFits(e, n, tgt, d, sees) {
  const A = ATK[n], ai = e.ai; if (!A || ai.cd[n] > 0 || !sees) return false; const k = akind(n, A);
  if (A.vs && !(tgt === pl && A.vs.includes(S.species))) return false;
  if (k === 'gaze') { if (tgt !== pl || ai.noGaze || pl.wolf || pl.fx.charm > 0 || e.phantom) return false; }
  else if ((k === 'boundary' || k === 'grab') && tgt !== pl) return false; else if (k === 'boundary' && circles.some(q => q.team === 1)) return false;
  else if (k === 'aneurysm' && e.fam === 'spirit' && !(tgt === pl && isVamp())) return false;                                 // the dead witches save that for vampires
  return d <= (A.range || (k === 'snap' ? 2.6 : 9)) + (k === 'melee' || k === 'snap' || k === 'grab' ? e.r + tgt.r - 0.4 : 0) && d >= (A.min || 0);
}
function updEnemy(e, dt) {
  const ai = e.ai, def = e.def; tickFx(e, dt); if (e.dead) return; e.hpShow = Math.max(0, (e.hpShow || 0) - dt);
  if (e.ko) { e.sp = 0; e.koT -= dt; if (e.koT <= 0) { e.ko = false; e.lieK = 0; e.fleeing = 14; } return; }                 // they come round, and they run
  if (e.downed) { e.sp = 0; e.downT -= dt; if (e.downT <= 0) riseEnemy(e); return; }
  if (e.dormant) { e.sp = 0; if (!pl.dead && !(pl.buff.cloak > 0) && d2(e, pl) < 5.5) wakeDormant(e); return; }
  if (e.fleeing > 0) { e.fleeing -= dt; const a = dirTo(pl, e); mv(e, e.x + Math.sin(a) * 5, e.z + Math.cos(a) * 5, def.spd * 1.1, dt); if (e.fleeing <= 0 || d2(e, pl) > 46) e.gone = true; return; }
  if (e.phantom) { e.lifeT -= dt; if (e.lifeT <= 0) return vanish(e); }
  if (e.fearT > 0) { e.fearT -= dt; if (!(e.fx.stun > 0)) { dropAtk(e); e.sw = null; const a = dirTo(pl, e); mv(e, e.x + Math.sin(a) * 5, e.z + Math.cos(a) * 5, def.spd, dt); } return; }                // a howl sent it running
  if (e.allyT > 0) { e.allyT -= dt; if (e.allyT <= 0) { puff(e.x, 1, e.z, 10, { c: [0.3, 0.3, 0.34], add: 0.3, sp: 2, life: 0.5, size: 0.3, grav: 0 }); e.gone = true; return; } }
  e.poise = Math.min(e.maxPoise, e.poise + dt * e.maxPoise * 0.12);
  if (Math.abs(e.kx) + Math.abs(e.kz) > 0.05) { e.x += e.kx * dt; e.z += e.kz * dt; collide(e); const f = Math.pow(0.002, dt); e.kx *= f; e.kz *= f; }
  // sunrise: a vampire with no daylight ring burns where it stands
  if (RT.area.id === 'world' && undead(e) && !isHyb(e) && !e.ring && !e.phantom && sunUp() && !shelterAt(e.x, e.z)) { const wet = S.weather === 'storm' || S.weather === 'rain' || S.weather === 'fog'; e.hp -= e.maxHp * (wet ? 0.06 : 0.16) * dt; e.hpShow = 2; e.fx.slow = Math.max(e.fx.slow || 0, 0.3); puff(e.x + R(-0.3, 0.3), 1.4, e.z + R(-0.3, 0.3), 2, { c: FIRE, add: 1, sp: 0.6, up: 2.5, life: 0.5, size: 0.3, grav: -2 });
    if (e.hp <= 0) { if (!ai.provoked) e.paid = true; return fall(e, null, { mat: 'sun' }); } }
  if (e.fx.stun > 0) { e.sp = 0; return; } for (const k in ai.cd) ai.cd[k] -= dt; ai.gcd -= dt; ai.t -= dt;
  if (def.boss && !e.enraged && e.hp < e.maxHp * 0.5) { e.enraged = true; e.spdM *= 1.15; floatText(e.x, 3.4, e.z, 'ENRAGED', '#ff4050', 20); sfx('growl'); ringFx(e.x, e.z, 0xff2030, 9, 0.7); RT.shake = 0.5; if (e.fam === 'wolf' && e.rig.kind === 'biped') rigEyes(e.rig, 1); }
  else if (!def.boss && !e.enraged && e.fam === 'wolf' && e.rig.kind === 'biped' && e.hp < e.maxHp * 0.6) { e.enraged = true; e.dmgM *= 1.2; e.spdM *= 1.12; rigEyes(e.rig, 1); floatText(e.x, 2.9, e.z, 'FURY', '#ffd24a', 14); sfx('growl'); }   // a werewolf's eyes go gold when the anger comes up, and the strength with them
  if (ai.cur) return updAtk(e, dt);
  if (def.peaceful) { const d = d2(e, pl); if (d < 10 || e.hp < e.maxHp) { ai.flee = 3; } if (ai.flee > 0) { ai.flee -= dt; const a = dirTo(pl, e); mv(e, e.x + Math.sin(a) * 5, e.z + Math.cos(a) * 5, def.spd, dt); } else wander(e, dt, 2); return; }
  const tgt = nearestFoe(e, 60); if (!tgt) { if (e.team === 0) { if (d2(e, pl) > 3.5) mv(e, pl.x + 2, pl.z + 2, def.spd, dt); else e.sp = 0; } else { ai.aggro = false; wander(e, dt, 1.8); } return; } const d = d2(e, tgt);
  if (!ai.aggro) { if (d < (def.boss ? 16 : (isNight() ? 15 : 12)) && los(e, tgt)) aggro(e); else return wander(e, dt, 1.8); }
  if (e.team === 1 && RT.area.id === 'world' && !def.boss && d2(e, ai.home) > 70) { ai.aggro = false; e.hp = e.maxHp; return; }
  if (e.team === 1 && tgt === pl && !e.phantom) RT.combatT = Math.max(RT.combatT, 3);
  if (ai.gcd <= 0) { const sees = d < 6 || los(e, tgt), opts = def.atk.filter(n => atkFits(e, n, tgt, d, sees));
    if (opts.length) { opts.sort((p, q) => (ATK[q].cd || 3) - (ATK[p].cd || 3)); return startAtk(e, chance(0.65) ? opts[0] : pick(opts), tgt); } }
  // movement between attacks
  const want = def.ranged ? 9 : 1.9 + e.r; if (def.ranged && d < 5) { const a = dirTo(tgt, e); mv(e, e.x + Math.sin(a) * 4, e.z + Math.cos(a) * 4, def.spd, dt, false); e.rot = dirTo(e, tgt); }
  else if (d > want + 0.4) { if (def.strafe && d < 8 && ai.gcd > 0) { const a = dirTo(tgt, e) + ai.strafe * 0.9 * dt * (def.spd / d); mv(e, tgt.x + Math.sin(a) * d, tgt.z + Math.cos(a) * d, def.spd * 0.8, dt, false); e.rot = dirTo(e, tgt); if (ai.t <= 0) { ai.t = R(1, 2.5); ai.strafe *= -1; } } else mv(e, tgt.x, tgt.z, def.spd, dt); }
  else { e.sp = 0; e.rot += angd(dirTo(e, tgt), e.rot) * Math.min(1, dt * 8); if (def.ranged && ai.gcd > 0) { const a = dirTo(tgt, e) + ai.strafe * dt * 0.5; mv(e, tgt.x + Math.sin(a) * d, tgt.z + Math.cos(a) * d, def.spd * 0.5, dt, false); e.rot = dirTo(e, tgt); } }
}
function wander(e, dt, sp) { const ai = e.ai; if (ai.t <= 0 || !ai.wt) { ai.t = R(2, 6); const a = R(0, TAU), d = R(0, 7); ai.wt = chance(0.45) ? null : { x: ai.home.x + Math.sin(a) * d, z: ai.home.z + Math.cos(a) * d }; } if (ai.wt && hyp(ai.wt.x - e.x, ai.wt.z - e.z) > 0.6) mv(e, ai.wt.x, ai.wt.z, sp, dt); else e.sp = 0; }

/* ---------------- people ---------------- */
const TOWNLOOK = { cloth: [0x8a3f3f, 0x3f6690, 0x7a7a3f, 0x86609a, 0x9a9a9a, 0x3a7a66, 0xb07840, 0x6a3555], hair: [0x1a1210, 0x4a2f1a, 0x9a7a44, 0x2a2a2a, 0x8a2f1a, 0xc0b4a0], skin: [0xd3a48a, 0xa5714e, 0xe8c2a4, 0x70492f], pants: [0x1a1c26, 0x2a2420, 0x30343c] };
let townieN = 0;
function spawnNpc(o) {
  const L = Object.assign({ cloth: pick(TOWNLOOK.cloth), hair: pick(TOWNLOOK.hair), skin: pick(TOWNLOOK.skin), pants: pick(TOWNLOOK.pants), long: chance(0.45) }, o.look || {}), def = { n: o.n, rig: 'human', fam: 'human', look: L, scale: o.scale || 1 }, rig = mkBody(def), n = baseActor('npc', def, rig, o.x, o.z);
  // the Council puts vervain in the town's coffee. Most people drink it; the night owls and one in five of the rest do not.
  const verv = o.verv != null ? !!o.verv : o.townie ? !(o.owl || townieN++ % 5 === 3) : true;
  areaAdd(rig.g); Object.assign(n, { npc: o, rot: o.rot || 0, vr: o.rot || 0, hp: 50, maxHp: 50, blood: 100, verv, wps: o.wps, wait: R(0, 4), stuck: 0, pose: o.pose || null, r: 0.5 }); actors.push(n); pose(n, 0); return n;
}
function updNpc(n, dt) {
  if (n.dead) return; if (n.held) { n.sp = 0; return; }
  if ((n.wps || n.npc.townie) && !(n.fleeT > 0) && d2(n, pl) < 11 && (pl.wolf || n.fearDay === S.day)) n.fleeT = 3;      // nobody stands and talks to a wolf, or to the thing that bit them this morning
  if (n.fleeT > 0) { n.fleeT -= dt; n.dazed = 0; const a = dirTo(pl, n); mv(n, n.x + Math.sin(a) * 5, n.z + Math.cos(a) * 5, 5.2, dt); return; }
  if (n.dazed > 0) { n.dazed -= dt; n.sp = 0; n.fx.stun = 0.2; return; }
  if (!n.wps) { n.sp = 0; if (n.npc.talk && d2(n, pl) < 7 && !n.npc.still) n.rot += angd(dirTo(n, pl), n.rot) * Math.min(1, dt * 4); else if (n.npc.rot != null) n.rot = n.npc.rot; return; }
  if (n.wait > 0) { n.wait -= dt; n.sp = 0; return; }
  if (!n.tg || hyp(n.x - n.tg[0], n.z - n.tg[1]) < 1.2 || n.stuck > 2.5) { n.tg = pick(n.wps); n.wait = n.stuck > 2.5 ? 0 : R(0, 5); n.stuck = 0; return; }
  const ox = n.x, oz = n.z; mv(n, n.tg[0], n.tg[1], 2.1, dt); if (hyp(n.x - ox, n.z - oz) < 1.2 * dt) n.stuck += dt;
}

/* ---------------- phantoms: the Hunter's Curse, and the fever of a werewolf bite ---------------- */
function haunting() { const h = absHours(); return (S.curseUntil || 0) > h ? 'curse' : (S.venomUntil || 0) > h && isVamp() && !isHybrid() ? 'venom' : null; }
function spawnPhantom(kind) {
  const types = (kind === 'curse' ? ['fivehunter', 'fivehunter', 'hunter', 'robber'] : ['robber', 'hunter', 'feral', 'cultist']).filter(t => EN[t] && !EN[t].boss); if (!types.length) return null;
  for (let t = 0; t < 6; t++) { const a = R(0, TAU), d = R(8, 13), x = pl.x + Math.sin(a) * d, z = pl.z + Math.cos(a) * d; if (solidAt(x, z)) continue; const probe = { x, z, r: 0.6 }; collide(probe); if (hyp(probe.x - x, probe.z - z) > 1.5) continue;
    const e = spawnEnemy(pick(types), x, z, S.lvl, { spawned: true, phantom: true, awake: 1 }); e.name = kind === 'curse' ? (e.type === 'fivehunter' ? 'The hunter you killed' : pick(['Someone you failed', 'A face from home'])) : pick(['Someone you bit', 'A face from home', 'Your own voice']); e.rot = dirTo(e, pl); return e; }
  return null;
}
function vanish(e, struck) { if (e.dead) return; e.dead = true; e.gone = true; dropAtk(e); puff(e.x, 1.2, e.z, 16, { c: [0.5, 0.52, 0.6], add: 0.5, sp: 1.6, up: 1, life: 0.6, size: 0.36, grav: 0 }); if (struck) { floatText(e.x, 2.6, e.z, 'Not real', '#c8c0e0', 14); sfx('tele'); } }

/* ---------------- overworld spawning ---------------- */
let spawnT = 0, squadT = 20, phantomT = 10;
/* def.need: what has to be true for this kind to be abroad. 'night', 'day', 'full' (a full-moon night), 'nofull'; anything else names a story flag or a finished quest. Underground only the story conditions count. */
function needOk(def, under) {
  const n = def.need; if (!n) return true; if (typeof n === 'function') return !!n();
  return [].concat(n).every(k => k === 'night' ? under || isNight() : k === 'day' ? under || !isNight() : k === 'full' || k === 'fullmoon' || k === 'moon' ? !under && moonNight() : k === 'nofull' ? under || !moonNight() : !!(S.flags[k] || S.done[k] || S.quests[k]));
}
/* who may walk the county right now. No vampire without a daylight ring is out by day; the Falls pack are people until the full moon and wolves under it. */
function spawnPick(table, night) {
  const full = moonNight(), out = [];
  for (let t of table) { if (t === 'werewolf' && !full) t = 'packrunner'; else if (t === 'packrunner' && full) t = 'werewolf'; const d = EN[t]; if (!d || d.boss) continue;
    if ((d.fam === 'vampire' || d.fam === 'original') && !d.ring && !night) continue; if ((d.full || (d.fam === 'wolf' && d.rig !== 'human')) && !full) continue; if (!needOk(d) || lineDead(d)) continue; out.push(t); }
  return out.length ? pick(out) : null;
}
/* the moon turns the pack whether the player is watching or not: wolves at moonrise, people again when it sets */
function turnPack() {
  const full = moonNight();
  for (const e of actors.slice()) { if (e.kind !== 'enemy' || e.dead || e.phantom || lying(e) || e.fam !== 'wolf' || e.ai.cur) continue; const quad = e.rig.kind === 'quad';
    if (quad && !full) { if (e.def.boss) { if (d2(e, pl) < 60) toast('The moon is down. ' + e.name.split(',')[0] + ' is a man again, and gone into the trees.'); if (RT.boss === e) { RT.boss = null; hideBoss(); } removeActor(e); continue; } if (EN.packrunner && e.type === 'werewolf') swapKind(e, 'packrunner'); }
    else if (!quad && full && e.type === 'packrunner' && EN.werewolf) swapKind(e, 'werewolf'); }
}
function swapKind(e, type) { const n = spawnEnemy(type, e.x, e.z, e.lvl, { spawned: e.ai.spawned, awake: 1 }); n.hp = n.maxHp * clamp(e.hp / e.maxHp, 0.1, 1); n.rot = n.vr = e.rot; n.ai.home = e.ai.home; n.ai.provoked = e.ai.provoked; n.ai.summoned = e.ai.summoned; n.noLoot = e.noLoot; n.team = e.team; n.ally = e.ally; n.allyT = e.allyT; n.fx.stun = 1.1; if (e.ai.aggro) aggro(n); puff(e.x, 1, e.z, 14, { c: [0.25, 0.22, 0.2], add: 0.2, sp: 2, up: 1.5, life: 0.6, size: 0.36, grav: 0 }); if (d2(e, pl) < 30) sfx(type === 'werewolf' ? 'howl' : 'growl'); removeActor(e); return n; }
function updSpawns(dt) {
  spawnT -= dt; if (spawnT > 0) return; spawnT = 1.6;
  // the haunted see attackers who are not there
  const hk = haunting(); RT.sick = hk === 'venom' ? 1 : 0; if (hk && !pl.dead) { phantomT -= 1.6; if (phantomT <= 0 && actors.filter(e => e.phantom && !e.dead).length < 2) { phantomT = R(12, 26); spawnPhantom(hk); } } else if (!hk) for (const e of actors) if (e.phantom && !e.dead) vanish(e);
  if (RT.area.id !== 'world') return;
  for (let i = actors.length - 1; i >= 0; i--) { const e = actors[i]; if (e.kind === 'enemy' && e.ai.spawned && !e.def.boss && (d2(e, pl) > 100 || (e.dead && e.gone))) removeActor(e); }
  turnPack();
  const z = zoneAt(pl.x, pl.z); if (z !== RT.zone) { RT.zone = z; zoneBanner(z); }
  const night = isNight(), table = typeof spawnTable === 'function' ? spawnTable(z) : night ? (moonNight() && z.full ? z.full : z.night) : z.day;
  if (!z.safe && table && table.length && !(z.id === 'cem' && S.quests.q_bump)) { let n = 0; for (const e of actors) if (e.kind === 'enemy' && e.ai.spawned && !e.dead && !e.phantom && d2(e, pl) < 75) n++;
    if (n < (z.max || 4) + (night ? 1 : 0)) for (let t = 0; t < 6; t++) { const a = R(0, TAU), d = R(40, 58), x = pl.x + Math.sin(a) * d, zz = pl.z + Math.cos(a) * d, zq = zoneAt(x, zz); if (zq.safe || Math.abs(x) > WS - 8 || Math.abs(zz) > WS - 8 || solidAt(x, zz)) continue; const probe = { x, z: zz, r: 0.6 }; collide(probe); if (hyp(probe.x - x, probe.z - zz) > 1.5) continue;
        const type = spawnPick(table, night); if (!type) break; const def = EN[type], lvl = Math.max(1, zq.lvl + Math.max(0, Math.floor((S.lvl - zq.lvl) * 0.65)) + (night ? 1 : 0) + RI(-1, 1)), pack = type === 'wolf' ? RI(2, 3) : type === 'deer' ? RI(1, 3) : type === 'packrunner' ? RI(1, 2) : (type === 'feral' || type === 'tombvamp') && night ? RI(1, 2) : 1;
        for (let k = 0; k < pack; k++) { const elite = k === 0 && chance(night ? 0.09 : 0.05), e = spawnEnemy(type, x + R(-2, 2) * k, zz + R(-2, 2) * k, lvl, { spawned: true, elite, ring: elite && def.fam === 'vampire', awake: 1 }); collide(e); } break; } }
  // anything the town has seen for what it is gets hunted: vervain, wolfsbane and wooden rounds, and now and then one of the Five
  if (S.species !== 'human' && S.exposure >= 50 && EN.hunter) { squadT -= 1.6; if (squadT <= 0 && actors.filter(e => (e.type === 'hunter' || e.type === 'fivehunter') && !e.dead && !e.phantom).length < 4) { squadT = 45; const a = R(0, TAU), five = EN.fivehunter && isVamp() && chance(0.22) && !actors.some(e => e.type === 'fivehunter' && !e.dead && !e.phantom);
      for (let k = 0; k < 2; k++) { const e = spawnEnemy(k === 0 && five ? 'fivehunter' : 'hunter', pl.x + Math.sin(a) * 42 + k * 2, pl.z + Math.cos(a) * 42, Math.max(3, S.lvl + RI(-1, 1)), { spawned: true }); collide(e); e.ai.provoked = true; aggro(e); }
      toast(five ? 'The Council has your description. One of the men coming is not Council: he moves like he was made for this.' : 'The Council has your description. Hunters are closing in.'); } }
  worldEvents();
}
/* Hollow Moon — the player: two bodies (your own, and the wolf), controls, melee combos, ranged, dodge, parry, abilities, feeding, the Use key, camera. */
let mvx = 0, mvz = 0, wardMesh = null;
const WOLFSET = { hits: [[0.27, 0.9], [0.27, 0.9], [0.42, 1.7]], range: 2.7, arc: 1.8, heavy: { kind: 'pounce', dur: 0.55, mult: 2.4, st: 24, dist: 8 }, poise: 24, st: 0, mat: 'bite' };   // used only if CLS.wolf is missing
function mkPlayer(x, z) {
  const L = S.look, def = { n: 'You', rig: 'human', fam: 'human', look: { cloth: L.coat, pants: 0x15151d, skin: L.skin, hair: L.hair, long: L.long, coat: 1 }, scale: 1.04 }, rig = mkBody(def);
  if (pl) { scene.remove(pl.rigH.g); scene.remove(pl.rigW.g); } scene.add(rig.g); pl = baseActor('player', def, rig, x, z); pl.team = 0; pl.rot = pl.vr = 0;
  // the second body: a real wolf, half again the size of a timber wolf, with gold eyes and a coat the colour of your own hair
  const fur = new T.Color(L.hair), wolf = mkBody({ rig: 'wolf', fam: 'wolf', scale: 1.5, eyes: 0xffd040, tint: { fur: fur.clone().lerp(new T.Color(0x4a4640), 0.4).getHex(), furDark: fur.clone().multiplyScalar(0.4).getHex() } });
  Object.assign(pl, { rigH: rig, rigW: wolf, wolf: false, rage: 0, shiftT: 0, shiftCd: 0, pull: 0, hp: S.hp, sta: 100, foc: S.foc, blood: S.blood, act: null, combo: 0, comboT: 0, buf: null, bufT: 0, dodgeCd: 0, block: false, blockT: 0, cds: {}, rangedCd: 0, healCd: 0, staT: 0, moveT: 0, atkHeld: 0, heavyUsed: false, feed: null, burning: false, roll: 0, starve: 1, slowT: 0,
    buff: { ward: 0, wardT: 0, coatV: 0, coatW: 0, burger: 0, slayer: 0, slayerN: 0, riposte: 0, second: 0, cloak: 0, fury: 0 } });
  wardMesh = new T.Mesh(new T.SphereGeometry(1.5, 16, 12), new T.MeshBasicMaterial({ color: 0x6a8cff, transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false })); wardMesh.position.y = 1.1; wardMesh.visible = false; rig.g.add(wardMesh);
  recalc(); refreshGear(); pl.hp = Math.min(P.maxHp, pl.hp || P.maxHp); pl.sta = P.maxSta; return pl;
}
/* what the human body is holding and wearing. A vampire's hands are only hands: no claws. Skin goes grey as a starved vampire desiccates. */
function refreshGear() {
  const rig = pl.rigH; if (rig.wpn) { rig.wpn.parent.remove(rig.wpn); rig.wpn = null; } const w = S.eq.weapon, name = w ? BASES[w.base].model : null; if (name) rig.wpn = rig.attach(name, rig.P.ArmR, [0, -0.62, 0.06]);
  if (rig.mats.skin) { rig.mats.skin.color.setHex(S.look.skin).convertSRGBToLinear(); const g = isVamp() ? [0, 0.22, 0.48, 0.8][P.desic || 0] || 0 : 0; if (g) rig.mats.skin.color.lerp(DESIC, g); } pl.greyS = P.desic || 0;
  const heavy = S.eq.armor && /vest|mail/.test(S.eq.armor.base); if (heavy && !rig.arm) rig.arm = rig.attach('armor'); else if (!heavy && rig.arm) { rig.arm.parent.remove(rig.arm); rig.arm = null; }
}
/* swap between the two bodies. willing: the player chose it (a hybrid, or a moonlight ring on the full moon): it hurts, it takes time, and it counts toward breaking a sire bond.
   Unwilling changes (the full moon, dawn, waking up somewhere) are the clock's doing: see tickClock. */
function setForm(wolf, willing) {
  wolf = !!wolf; if (!pl || !!pl.wolf === wolf) return false; if (pl.feed) endFeed(true);
  const from = pl.rig, to = wolf ? pl.rigW : pl.rigH, quiet = pl.dead || RT.blk || !RT.started; if (from.g.parent) from.g.parent.remove(from.g); scene.add(to.g); to.g.add(wardMesh); to.g.rotation.set(0, pl.vr, 0); flashRig(pl, 0);
  pl.rig = to; pl.wolf = wolf; pl.r = wolf ? 0.62 : 0.5; pl.sw = null; pl.act = null; pl.block = false; pl.buf = null; pl.combo = 0; pl.roll = 0; pl.y = 0; pl.pose = null; pl.pull = 0; wardMesh.position.y = wolf ? 0.7 : 1.1;
  if (!quiet) {   // every bone breaks, every time
    const t = willing ? (P.shiftT != null ? P.shiftT : 3) : 1.4; pl.shiftT = t; pl.shiftCd = t + 1.5; if (!willing) pl.inv = Math.max(pl.inv, t); else pl.hp = Math.max(1, pl.hp - P.maxHp * (P.shiftHp != null ? P.shiftHp : 0.12));
    sfx(wolf ? 'howl' : 'growl'); sfx('hit'); RT.shake = Math.max(RT.shake, 0.45); puff(pl.x, 1, pl.z, 22, { c: [0.22, 0.2, 0.2], add: 0.2, sp: 2.4, up: 1.6, life: 0.7, size: 0.38, grav: 0 }); ringFx(pl.x, pl.z, 0xffd040, 4, 0.6);
  }
  if (willing && wolf) { const n = S.flags.shifts || 0; qEvent('shift'); if ((S.flags.shifts || 0) === n) S.flags.shifts = n + 1; }   // the count belongs to whoever listens for 'shift'; this keeps it honest if nobody does
  recalc(); pose(pl, 0); return true;
}
/* G. A hybrid changes whenever they like. A werewolf only when a moonlight ring gives them the choice, and only on the night the moon would have taken it anyway. */
function toggleShift() {
  if (!pl || pl.dead || RT.paused || pl.feed || pl.fx.stun > 0 || pl.fx.charm > 0 || pl.shiftT > 0) return false; const why = shiftAllowed();
  if (why) { sfx('deny'); toast(why); return false; } if (pl.shiftCd > 0) { sfx('deny'); return false; }
  return setForm(!pl.wolf, true);
}
const weaponCls = () => pl.wolf ? 'wolf' : P.wcls || (S.eq.weapon ? BASES[S.eq.weapon.base].cls : 'fast'), moveSet = () => CLS[weaponCls()] || WOLFSET;
const plMat = () => pl.wolf ? 'bite' : !S.eq.weapon && !isVamp() && !isWolf() ? 'fist' : P.wmat;   // a living person's bare hands stake nothing and behead nothing
const plTargets = () => actors.filter(a => a.kind === 'enemy' && !a.dead && a.team !== 0 && !a.ko);
const canAct = () => pl && !pl.dead && !RT.paused && !(pl.fx.stun > 0) && !pl.feed && !(pl.fx.charm > 0) && !(pl.shiftT > 0);
/* what the aim snaps to: nothing peaceful, nothing lying still (unless asked), nobody who is leaving you alone */
function assistTarget(maxD = 13, lyingOk) { let best = null, bs = 1e9; const md = hyp(mvx, mvz) > 0.2 ? Math.atan2(mvx, mvz) : pl.rot; for (const e of plTargets()) { if (e.def.peaceful || (lying(e) && !(lyingOk && e.downed)) || neutralTo(e)) continue; const d = d2(pl, e); if (d > maxD) continue; const s = d + Math.abs(angd(dirTo(pl, e), md)) * 3; if (s < bs) { bs = s; best = e; } } return best; }
function aimDir() { if (!RT.touch && mouse.used) return Math.atan2(mouse.wx - pl.x, mouse.wz - pl.z); const t = assistTarget(); return t ? dirTo(pl, t) : hyp(mvx, mvz) > 0.2 ? Math.atan2(mvx, mvz) : pl.rot; }
function aimPoint(maxD) { if (!RT.touch && mouse.used) { let dx = mouse.wx - pl.x, dz = mouse.wz - pl.z; const l = hyp(dx, dz); if (l > maxD) { dx *= maxD / l; dz *= maxD / l; } return { x: pl.x + dx, z: pl.z + dz }; } const t = assistTarget(maxD); if (t) return { x: t.x, z: t.z }; const a = aimDir(); return { x: pl.x + Math.sin(a) * Math.min(6, maxD), z: pl.z + Math.cos(a) * Math.min(6, maxD) }; }
function aimTarget(maxD, lyingOk) { if (!RT.touch && mouse.used) { let best = null, bd = 5; const m = { x: mouse.wx, z: mouse.wz }; for (const e of plTargets()) { if (e.def.peaceful || (lying(e) && !(lyingOk && e.downed)) || d2(pl, e) > maxD) continue; const d = d2(m, e); if (d < bd) { bd = d; best = e; } } if (best) return best; } return assistTarget(maxD, lyingOk); }
/* the nearest enemy within arm's reach, lying down or not: for a hand on the heart */
function touchTarget(reach, ok) { let best = null, bs = 1e9; const a = aimDir(); for (const e of plTargets()) { if (e.phantom || e.def.peaceful || e.dormant || (ok && !ok(e))) continue; const d = d2(pl, e) - e.r; if (d > reach) continue; const s = d + Math.abs(angd(dirTo(pl, e), a)) * 1.2; if (s < bs) { bs = s; best = e; } } return best; }

/* ---------------- attacks ---------------- */
function meleeHit(range, arc, mult, o = {}) { const dmg = P.wdmg * mult * P.meleeM; let n = 0; for (const e of plTargets()) if (d2(pl, e) < range + e.r && (arc > 6 || Math.abs(angd(dirTo(pl, e), pl.rot)) < arc / 2)) { hit(pl, e, Object.assign({ dmg, mat: plMat(), melee: 1 }, o)); n++; } return n; }
function startLight() {
  const cls = weaponCls(), c = moveSet(), i = (pl.comboT > 0 ? pl.combo : 0) % c.hits.length, h = c.hits[i], d = h[0] / P.as; pl.rot = aimDir();
  pl.act = { type: 'atk', i, t: 0, dur: d, hitAt: d * 0.42, mult: h[1], done: false }; pl.combo = i + 1; pl.comboT = d + 0.5; pl.block = false;
  pl.sw = { kind: cls === 'wolf' ? 'bite' : c.bolt ? 'cast' : i === 2 ? (cls === 'slow' ? 'over' : 'slashR') : i % 2 ? 'slashL' : 'slashR', t: 0, dur: d, jump: i === 2 ? 0.45 : 0.2 }; pl.kx += Math.sin(pl.rot) * 4.5; pl.kz += Math.cos(pl.rot) * 4.5; sfx(c.bolt ? 'magic' : cls === 'wolf' ? 'bite' : 'swing');
}
function startHeavy() {
  const c = moveSet(), h = c.heavy; if (pl.sta < h.st * 0.6) { sfx('deny'); return; } if (h.kind === 'blast' && pl.foc < 12) { sfx('deny'); floatText(pl.x, 2.6, pl.z, 'No focus', '#9ab0ff', 13); return; }
  pl.sta = Math.max(0, pl.sta - h.st); pl.staT = 0.8; if (h.kind === 'blast') pl.foc -= 12; pl.rot = aimDir(); const d = h.dur / P.as; pl.heavyUsed = true; pl.combo = 0; pl.block = false;
  pl.act = { type: 'atk', heavy: h.kind, t: 0, dur: d, hitAt: d * (h.kind === 'pounce' ? 0.72 : 0.55), mult: h.mult, done: false, n: 0, pt: aimPoint(h.kind === 'pounce' ? h.dist || 8 : 10) };
  if (h.kind === 'pounce') { const p = pl.act.pt; pl.rot = dirTo(pl, p); pl.act.len = Math.max(0, d2(pl, p) - 1.2); pl.inv = Math.max(pl.inv, 0.2); telegraph(p.x, p.z, 0, { kind: 'circle', r: 2.4 }, pl.act.hitAt, 0xffd040); }
  pl.sw = { kind: h.kind === 'lunge' ? 'stab' : h.kind === 'over' ? 'over' : h.kind === 'spin' ? 'spin' : h.kind === 'pounce' ? 'bite' : 'cast', t: 0, dur: d, jump: 1.3 }; sfx(h.kind === 'pounce' ? 'growl' : 'heavy');
}
function plResolve() {
  const a = pl.act, c = moveSet(), m = plMat(), col = m === 'bite' ? 0xffe0a0 : m === 'wood' || m === 'whiteoak' ? 0xffd9a0 : 0xe8f0ff;
  if (!a.heavy) { if (c.bolt) { shoot(pl, pl.x + Math.sin(pl.rot) * 0.9, pl.z + Math.cos(pl.rot) * 0.9, pl.rot, { spd: 24, dmg: P.spellBase * 0.5 * a.mult, mat: 'magic', col: 0x9a8cff, orb: true, spell: true, range: 20, poise: 8 }); return; }
    trail(pl, c.range, c.arc, col, a.i % 2 ? -1 : 1, pl.wolf ? 0.8 : 1.15); meleeHit(c.range, c.arc, a.mult, { poise: c.poise * (a.i === 2 ? 1.7 : 1), kb: 2 + a.i * 1.5 }); return; }
  if (a.heavy === 'lunge') { trail(pl, c.range + 1, 1.2, col); meleeHit(c.range + 1.2, 1.3, a.mult, { poise: 45, kb: 5, heavy: 1 }); }
  else if (a.heavy === 'over') { trail(pl, c.range + 0.8, 1.6, col); meleeHit(c.range + 0.9, 1.5, a.mult, { poise: 70, kb: 6, heavy: 1 }); const fx_ = pl.x + Math.sin(pl.rot) * 2.4, fz = pl.z + Math.cos(pl.rot) * 2.4, ward = S.eq.weapon && S.eq.weapon.uniq === 'wardblade'; hazard(fx_, fz, ward ? 5 : 2.6, 0, P.wdmg * P.meleeM * (ward ? 1.2 : 0.5), { team: 0, src: pl, mat: m, poise: 30 }); }
  else if (a.heavy === 'spin') { trail(pl, c.range + 0.5, 6.2, col); meleeHit(c.range + 0.6, 7, a.mult * 0.6, { poise: 40, kb: 5, heavy: 1 }); sfx('swing'); }
  else if (a.heavy === 'pounce') { trail(pl, c.range + 0.6, 2.6, col, 1, 0.8); meleeHit(c.range + 0.9, 2.8, a.mult, { poise: 80, kb: 5, heavy: 1 }); ringFx(pl.x, pl.z, 0xffd040, 3, 0.35); sfx('bite'); RT.shake = Math.max(RT.shake, 0.3); }
  else if (a.heavy === 'blast') hazard(a.pt.x, a.pt.z, 3.4, 0.12, P.spellBase * a.mult, { team: 0, src: pl, mat: 'magic', pc: MAGIC, col: 0x8a7cff, spell: 1, poise: 40, kb: 4 });
}
function tryAttack() { if (!canAct()) return; const a = pl.act; if (!a) return startLight(); if (a.type === 'atk' && !a.heavy && a.done && a.t > a.dur * 0.9) return startLight(); pl.buf = 'atk'; pl.bufT = 0.32; }
function tryHeavy() { if (!canAct()) return; if (pl.act) { pl.buf = 'heavy'; pl.bufT = 0.3; return; } startHeavy(); }
function tryShoot() {
  if (pl && pl.wolf) { if (canAct()) { sfx('deny'); floatText(pl.x, 2.2, pl.z, 'Not with paws', '#d8d0c0', 13); } return; }
  const it = S.eq.ranged; if (!it) { if (!RT.noRanged) { RT.noRanged = 1; toast('You have no ranged weapon equipped.'); } return; } if (!canAct() || pl.rangedCd > 0) return; if (pl.act) { if (pl.act.type !== 'atk' || !pl.act.done) { pl.buf = 'shoot'; pl.bufT = 0.25; return; } }
  pl.rot = aimDir(); pl.act = { type: 'shoot', t: 0, dur: 0.24, done: false, it }; pl.sw = { kind: 'shoot', t: 0, dur: 0.3 }; pl.rangedCd = BASES[it.base].cd * P.reload; pl.block = false;
}
function tryDodge() {
  if (!pl || pl.dead || RT.paused || pl.fx.stun > 0 || pl.fx.charm > 0 || pl.fx.root > 0 || pl.shiftT > 0 || pl.dodgeCd > 0) return; if (pl.feed) endFeed(false); const vamp = isVamp(), fast = vamp || pl.wolf, cost = vamp ? 14 : pl.wolf ? 16 : 22; if (pl.sta < cost) { sfx('deny'); return; }
  pl.sta -= cost; pl.staT = 0.7; pl.pull = 0; const a = hyp(mvx, mvz) > 0.2 ? Math.atan2(mvx, mvz) : pl.rot, dist = (vamp ? 7.5 : pl.wolf ? 6.6 : 5.2) * (1 + 0.2 * (vamp ? sk('v_blur') : 0)), dur = vamp ? 0.2 : pl.wolf ? 0.24 : 0.34;
  pl.act = { type: 'dodge', t: 0, dur, vx: Math.sin(a) * dist / dur, vz: Math.cos(a) * dist / dur, hitIds: {}, blur: vamp }; pl.inv = dur * 0.85 + 0.06; pl.rot = a; pl.dodgeCd = dur + 0.2; pl.sw = pl.wolf ? { kind: 'bite', t: 0, dur, jump: 0.5 } : null; pl.block = false; pl.roll = fast ? 0 : 1; sfx(vamp ? 'blur' : 'dodge');
}

/* ---------------- abilities ---------------- */
const skDmg = () => P.wdmg * P.meleeM, spDmg = () => P.spellBase;
/* move in a straight line, a step at a time, stopping at walls. streak: the pale smear a vampire leaves when it moves too fast to follow. Returns false if something solid cut it short. */
function dashTo(x, z, streak) { const n = Math.max(4, Math.ceil(hyp(x - pl.x, z - pl.z) / 0.8)), dx = (x - pl.x) / n, dz = (z - pl.z) / n; for (let i = 0; i < n; i++) { const ox = pl.x + dx, oz = pl.z + dz; pl.x = ox; pl.z = oz; collide(pl); if (i % 2) puff(pl.x, 1.1, pl.z, 2, streak ? { c: [0.7, 0.75, 0.9], add: 0.7, sp: 0.3, life: 0.3, size: 0.5, grav: 0 } : { c: [0.3, 0.26, 0.24], add: 0.3, sp: 0.5, life: 0.35, size: 0.4, grav: 0 }); if (hyp(pl.x - ox, pl.z - oz) > 0.45) return false; } return true; }
function sayNo(t, txt) { sfx('deny'); floatText(t.x, 2.8, t.z, txt, '#c8c0e0', 14); return false; }
function grenade(r, mat) {   // vervain is poison to vampires, hybrids and Originals; wolfsbane to werewolves and hybrids. To anyone else either one is only a bang.
  const p = aimPoint(13), v = mat === 'verv'; pl.sw = { kind: 'slashR', t: 0, dur: 0.3 }; sfx('swing');
  hazard(p.x, p.z, 4.4, 0.55, skDmg() * (1.2 + 0.4 * r), { team: 0, src: pl, mat, pc: v ? VERV : HOLY, col: v ? 0xa070ff : 0xffe060, poise: 40, onHit: e => { if (v ? undead(e) : baneHurts(e)) { addFx(e, 'stun', 1 + r); addFx(e, 'sear', 4, e.maxHp * 0.012); addFx(e, v ? 'verv' : 'wolfsbane', 6); } } });
}
/* one mouthful from an enemy. Human blood is worth everything; animal, werewolf and hybrid blood half; a vampire's or a spirit's nothing; vervain in the blood burns. Returns what it was worth (0 to 1). */
function feedOn(e, blood, healF) {
  const f = e.fam; if (f === 'vampire' || f === 'original' || f === 'spirit') { floatText(pl.x, 2.8, pl.z, f === 'spirit' ? 'Nothing to drink' : 'Dead blood. Nothing in it for you', '#a0b0c0', 13); return 0; }
  if (e.def.verv) { vervBurn(); return 0; }
  const k = f === 'human' || f === 'witch' ? 1 : 0.5, diet = f === 'animal' ? 'animal' : k === 1 ? 'human' : S.diet; pl.blood = Math.min(P.maxBlood, pl.blood + blood * k); heal(P.maxHp * healF * k); puff(e.x, 1.5, e.z, 16, { c: BLOOD, add: 0.05, sp: 3, life: 0.6, size: 0.24 }); S.stats.feeds++;
  if (diet !== S.diet) { S.diet = diet; recalc(); if (diet === 'animal') toast('Animal blood. It keeps you on your feet and not much more: you are weaker on it, and slower to heal.'); } return k;
}
function vervBurn() { pl.hp = Math.max(1, pl.hp - P.maxHp * 0.1); pl.fx.verv = Math.max(pl.fx.verv || 0, 6); RT.hurtV = Math.max(RT.hurtV, 0.6); sfx('hurt'); floatText(pl.x, 2.9, pl.z, 'VERVAIN', '#c090ff', 16); puff(pl.x, 1.6, pl.z, 12, { c: VERV, add: 1, sp: 2, life: 0.5, size: 0.2, grav: 0 }); recalc(); }
/* compulsion works on a human with no vervain in them, and on nothing else: not witches, not werewolves, not the Five, not spirits, not animals. Only an Original compels vampires. */
function compelCheck(t) {
  if (t.def.verv || t.fx.verv > 0) return 'VERVAIN'; if (t.def.five || t.def.boss && t.fam === 'human') return 'IMMUNE';
  if (t.fam === 'human') return ''; if ((t.fam === 'vampire' || t.fam === 'hybrid') && !isOrig(t) && S.original && sk('o_compel')) return ''; return 'IMMUNE';
}
const ABIL = {
  h_gren(r) { grenade(r, 'verv'); },
  h_wgren(r) { grenade(r, 'wolfsbane'); },
  /* Heartseeker: wood at the heart, whatever is in your hand. Stakes a vampire that is downed, staggered or nearly finished. A hybrid only falls over; an Original gets up again. */
  h_heart(r) { const t = aimTarget(9, 1); pl.rot = t ? dirTo(pl, t) : aimDir(); const a = pl.rot, d = t ? Math.max(0, d2(pl, t) - 1.6) : 6, mat = P.wmat === 'whiteoak' ? 'whiteoak' : 'wood', vt = 0.2 + 0.05 * r, ot = 0.15 + 0.05 * r; dashTo(pl.x + Math.sin(a) * d, pl.z + Math.cos(a) * d); pl.sw = { kind: 'stab', t: 0, dur: 0.3 }; pl.inv = Math.max(pl.inv, 0.3); trail(pl, 3.4, 1.2, 0xfff0c0); sfx('heavy');
    for (const e of plTargets()) if (d2(pl, e) < 3.6 + e.r && Math.abs(angd(dirTo(pl, e), pl.rot)) < 0.9) { const low = e.hp / e.maxHp, vamp = e.fam === 'vampire' && !isHyb(e) && !isOrig(e);
      if (vamp && (e.downed || (e.def.boss ? low < vt * 0.5 : e.fx.stun > 0 || low < vt))) { floatText(e.x, 3, e.z, 'STAKED', '#ffd24a', 18); if (e.downed) trueDeath(e, pl, { mat, lethal: 'stake' }); else hit(pl, e, { dmg: e.hp + e.maxHp, mat, lethal: 'stake', noCrit: 1, heavy: 1 }); }
      else if (!undead(e) && !e.def.boss && low < ot) { floatText(e.x, 3, e.z, 'HEARTSEEKER', '#ffd24a', 18); hit(pl, e, { dmg: e.hp + e.maxHp, mat, noCrit: 1, heavy: 1 }); }
      else hit(pl, e, { dmg: skDmg() * (2.6 + 0.4 * r), mat, poise: 60, kb: 5 }); } },
  h_whirl(r) { const n = 2 + r; pl.act = { type: 'skill', kind: 'whirl', t: 0, dur: 0.24 * n, n, k: 0 }; pl.sw = { kind: 'spin', t: 0, dur: 0.24 * n, turns: n }; },
  h_volley(r) { const it = S.eq.ranged, n = 3 + 2 * r, b = it ? BASES[it.base] : null, dmg = it ? it.dmg * P.rangedM : skDmg() * 0.6; pl.rot = aimDir(); pl.sw = { kind: 'shoot', t: 0, dur: 0.35 }; sfx(b && it.base === 'revolver' ? 'gun' : 'shoot');
    for (let i = 0; i < n; i++) shoot(pl, pl.x, pl.z, pl.rot + (i - (n - 1) / 2) * 0.13, { spd: b ? b.pspd : 30, dmg: dmg * 0.8, mat: b ? b.mat : 'wood', range: 26, poise: 10, pierce: it && it.uniq === 'halebow' }); },
  /* the Founders' Device: a sound only the supernatural can hear. It drops vampires, hybrids and werewolves alike, and it does not care whose side the one winding it is on. */
  h_device(r) { const t = 4 + r; let n = 0; pl.sw = { kind: 'cast', t: 0, dur: 0.5 }; sfx('tele'); sfx('zap'); tone(3100, 1.6, 'sine', 0.12, -400); ringFx(pl.x, pl.z, 0xfff0c0, 30, 0.9); ringFx(pl.x, pl.z, 0xfff0c0, 14, 0.6); RT.flashV = 0.22; RT.shake = Math.max(RT.shake, 0.35);
    for (const e of actors.slice()) { if (e.kind !== 'enemy' || e.dead || d2(pl, e) > 30 || !(undead(e) || e.fam === 'wolf')) continue; if (e.phantom) { vanish(e); continue; } if (lying(e)) continue; n++; dropAtk(e); e.sw = null; e.fx.stun = Math.max(e.fx.stun || 0, t * (isOrig(e) ? 0.6 : 1)); if (e.ai) e.ai.provoked = true; floatText(e.x, 2.9, e.z, 'DROPS', '#fff0c0', 14); puff(e.x, 2, e.z, 8, { c: HOLY, add: 1, sp: 2, life: 0.4, size: 0.16, grav: 0 }); }
    if (isVamp() || isWolf() || S.origin === 'wolf') { pl.fx.stun = Math.max(pl.fx.stun || 0, t); pl.act = null; pl.block = false; floatText(pl.x, 2.9, pl.z, 'IT DROPS YOU TOO', '#ff8080', 16); toast(isVamp() || isWolf() ? 'The sound goes through your skull like a nail. The Device does not care who is holding it.' : 'You hear it too, and it puts you on your knees. The gene does not have to be awake for the Device to find it.'); }
    else if (!n) floatText(pl.x, 2.6, pl.z, 'Nothing here can hear it', '#d8d0c0', 13); },
  w_incend(r) { pl.rot = aimDir(); pl.sw = { kind: 'cast', t: 0, dur: 0.4 }; sfx('fire'); const a = pl.rot; for (let i = 0; i < 46; i++) { const b = a + R(-0.55, 0.55), s = R(8, 20); puff(pl.x + Math.sin(a) * 0.8, 1.2, pl.z + Math.cos(a) * 0.8, 1, { c: FIRE, add: 1, sp: 0.5, vx: Math.sin(b) * s, vz: Math.cos(b) * s, up: 0.5, life: 0.45, size: 0.45, grav: -1, spread: 0.1 }); }
    for (const e of plTargets()) if (d2(pl, e) < 9 + e.r && Math.abs(angd(dirTo(pl, e), a)) < 0.62) { hit(pl, e, { dmg: spDmg() * (1.4 + 0.3 * r), mat: 'fire', spell: 1, poise: 20, kb: 3 }); addFx(e, 'burn', 4, spDmg() * 0.35); }
    hazard(pl.x + Math.sin(a) * 5, pl.z + Math.cos(a) * 5, 2.8, 0, 0, { team: 0, src: pl, mat: 'fire', spell: 1, linger: 3.5, tick: spDmg() * 0.3 }); },
  /* Pain Infliction: the blood vessels burst. Vampires, hybrids and werewolves heal, so it can be done to them again and again. A spirit has no blood. */
  w_aneur(r) { pl.sw = { kind: 'cast', t: 0, dur: 0.5 }; sfx('zap'); ringFx(pl.x, pl.z, 0xa080ff, 10, 0.5); RT.shake = 0.3;
    for (const e of plTargets()) { if (d2(pl, e) > 10 || lying(e) || e.def.peaceful || neutralTo(e)) continue; if (e.fam === 'spirit') { floatText(e.x, 2.8, e.z, 'NO BLOOD', '#a0b0c0', 13); continue; } const sup = undead(e) || e.fam === 'wolf';
      addFx(e, 'stun', sup ? 2 + 0.5 * r : 1); hit(pl, e, { dmg: spDmg() * (sup ? 1.1 + 0.3 * r : 0.5 + 0.15 * r), mat: 'magic', spell: 1 }); puff(e.x, 2, e.z, 8, { c: MAGIC, add: 1, sp: 1.5, life: 0.5, size: 0.22, grav: 0 }); } },
  w_ward(r) { pl.buff.ward = P.maxHp * (0.2 + 0.1 * r); pl.buff.wardT = 8; pl.sw = { kind: 'cast', t: 0, dur: 0.3 }; sfx('magic'); ringFx(pl.x, pl.z, 0x6a8cff, 3, 0.5); },
  w_cloak(r) { pl.buff.cloak = Math.max(pl.buff.cloak || 0, 4 + 2 * r); pl.sw = { kind: 'cast', t: 0, dur: 0.3 }; sfx('magic'); puff(pl.x, 1.2, pl.z, 26, { c: [0.6, 0.62, 0.7], add: 0.4, sp: 1.6, up: 0.6, life: 0.8, size: 0.5, grav: 0 }); for (const e of actors) if (e.kind === 'enemy' && e.ai && e.fam !== 'witch' && e.fam !== 'spirit') e.ai.aggro = false; floatText(pl.x, 2.8, pl.z, 'CLOAKED', '#c8c0e0', 15); },
  /* Motus: thrown without being touched */
  w_motus(r) { const t = aimTarget(13); if (!t) return sayNo(pl, 'Nothing to throw'); pl.rot = dirTo(pl, t); pl.sw = { kind: 'throw', t: 0, dur: 0.35 }; sfx('zap'); const dmg = spDmg() * (1.5 + 0.3 * r), a = pl.rot; bolt(pl, t, 0xb0a8ff);
    if (t.def.boss) { hit(pl, t, { dmg, mat: 'magic', spell: 1, poise: 80 }); return; }
    const probe = { x: t.x, z: t.z, r: t.r }; for (let i = 0; i < 8; i++) { probe.x += Math.sin(a); probe.z += Math.cos(a); if (collide(probe)) break; }
    hit(pl, t, { dmg, mat: 'magic', spell: 1, poise: 30 }); if (t.dead || lying(t)) return; dropAtk(t); t.sw = null; t.kx = t.kz = 0; addFx(t, 'stun', 1.5); t.x = probe.x; t.z = probe.z; t.y = 0; puff(t.x, 1, t.z, 12, { c: ASH, add: 0.2, sp: 3, up: 2, life: 0.5, size: 0.3, grav: 4 });
    hazard(probe.x, probe.z, 3, 0, dmg * 0.5, { team: 0, src: pl, mat: 'magic', spell: 1, pc: MAGIC, col: 0x8a7cff, poise: 20, skip: t }); },
  w_bound(r) { const p = aimPoint(12), t = 5 + r; pl.sw = { kind: 'cast', t: 0, dur: 0.4 }; sfx('magic'); const c = addCircle(p.x, p.z, 5, t, 0, pl); if (c.held.length) floatText(p.x, 2.6, p.z, 'BOUND', '#9aa8ff', 16); else floatText(p.x, 2.2, p.z, 'Nothing was inside it', '#c8c0e0', 13); },
  /* Siphon: a siphoner makes no magic. She takes it, by touch, from anything that has some. */
  w_siphon(r) { const gain = 22 + 8 * r, glow = (x, z) => { puff(x, 1.4, z, 14, { c: [1, 0.15, 0.2], add: 1, sp: 1.6, life: 0.5, size: 0.22, grav: 0 }); puff(pl.x + Math.sin(pl.rot) * 0.6, 1.3, pl.z + Math.cos(pl.rot) * 0.6, 8, { c: [1, 0.15, 0.2], add: 1, sp: 0.6, life: 0.6, size: 0.2, grav: 0 }); }, take = n => { const b = pl.foc; pl.foc = Math.min(P.maxFoc, pl.foc + n); floatText(pl.x, 2.8, pl.z, '+' + Math.round(pl.foc - b) + ' focus', '#ff7080', 15); sfx('magic'); pl.sw = { kind: 'gaze', t: 0, dur: 0.4 }; };
    if (S.heretic && (S.venomUntil || 0) > absHours()) { glow(pl.x, pl.z); pl.sw = { kind: 'gaze', t: 0, dur: 0.4 }; sfx('magic'); cureVenom('siphon'); return; }                 // a Heretic can pull werewolf venom out of herself as magic
    const t = touchTarget(3, e => undead(e) || e.fam === 'wolf' || e.fam === 'witch' || e.fam === 'spirit');
    if (t) { pl.rot = dirTo(pl, t); glow(t.x, t.z); take(gain); if (t.downed) { if (t.fam === 'vampire' && t.downT < 1e8) { t.downT = 1e9; floatText(t.x, 2.6, t.z, 'DESICCATED', '#b8c0d0', 15); payout(t, pl); } return; }
      hit(pl, t, { dmg: spDmg() * (0.6 + 0.2 * r), mat: 'magic', spell: 1, noLs: 1, poise: 25 }); if (t.dead || t.downed) return;
      if (t.fam === 'vampire' && t.hp / t.maxHp < 0.15) { t.downFor = 1e9; downEnemy(t, pl); floatText(t.x, 3.3, t.z, 'DESICCATED', '#b8c0d0', 15); payout(t, pl); } else if (isOrig(t) && t.hp / t.maxHp < 0.15) t.fx.stun = Math.max(t.fx.stun || 0, 4); return; }   // vampirism is magic too: take enough of it and what is left is a grey husk
    const c = circles.find(q => q.team === 1 && q.pl); if (c) { glow(pl.x, pl.z); take(gain); endCircle(c); toast('The boundary comes apart in your hand. It was only magic.'); return; }
    if (inHollow() && d2(pl, { x: -20, z: -245 }) < 5) { glow(-20, -245); take(P.maxFoc); return; }                                                                            // a hundred dead witches left a great deal behind
    if (S.heretic && isVamp()) { if (pl.blood < 12) return sayNo(pl, 'Not enough blood'); pl.blood -= 12; glow(pl.x, pl.z); take(gain); return; }                            // a Heretic siphons her own vampirism
    return sayNo(pl, 'Nothing here holds magic'); },
  /* Desiccation: stop a vampire's heart with a hand on it. The balance is a living heart, and the caster pays it herself (the health cost is taken by castSkill). */
  w_desic() { const t = touchTarget(3, undead); if (!t) return sayNo(pl, 'No vampire within reach');
    if (!(t.downed || t.fx.stun > 0 || t.fx.root > 0 || t.hp / t.maxHp < 0.35)) return sayNo(t, 'Too strong. Stagger it, bind it or wear it down');
    pl.rot = dirTo(pl, t); pl.sw = { kind: 'gaze', t: 0, dur: 0.6 }; sfx('turn'); RT.flashV = 0.18; ringFx(t.x, t.z, 0xb8c0d0, 5, 0.8); puff(t.x, 1.3, t.z, 30, { c: ASH, add: 0.1, sp: 1.6, up: 1, life: 1, size: 0.34, grav: 0.5 }); puff(pl.x, 1.9, pl.z, 6, { c: BLOOD, add: 0.05, sp: 0.8, life: 0.6, size: 0.14 }); floatText(t.x, 3, t.z, 'DESICCATED', '#b8c0d0', 19);
    if (isOrig(t)) { if (t.downed) t.downT = 1e9; else { t.downFor = 1e9; downEnemy(t, pl); } t.desiccated = true; toast('His heart stops under your hand. He will lie there, grey, until somebody feeds him. Nobody of his line dies for this.'); }
    else if (t.downed) trueDeath(t, pl, { lethal: 'desic' }); else hit(pl, t, { dmg: t.hp + t.maxHp, mat: 'magic', spell: 1, lethal: 'desic', noCrit: 1, noLs: 1 }); },
  /* Fury: the anger let out. The numbers live in recalc; here it is the eyes, and nothing being able to stagger you. */
  l_rage(r) { pl.buff.fury = 6 + 2 * r; pl.fx.stun = 0; recalc(); sfx('growl'); ringFx(pl.x, pl.z, 0xffd040, 5, 0.5); RT.shake = Math.max(RT.shake, 0.3); floatText(pl.x, 2.8, pl.z, 'FURY', '#ffd24a', 18); rigEyes(pl.rigH, 1); },
  l_pounce(r) { const t = aimTarget(10); if (!t) return sayNo(pl, 'Nothing to leap at'); const a = dirTo(pl, t); dashTo(t.x - Math.sin(a) * (1.1 + t.r), t.z - Math.cos(a) * (1.1 + t.r)); pl.rot = a; pl.inv = Math.max(pl.inv, 0.4); pl.sw = { kind: pl.wolf ? 'bite' : 'slam', t: 0, dur: 0.4, jump: 1.3 }; pl.act = { type: 'skill', kind: 'lock', t: 0, dur: 0.35 }; sfx(pl.wolf ? 'bite' : 'heavy'); ringFx(t.x, t.z, 0xffd040, 3, 0.35);
    hit(pl, t, { dmg: skDmg() * (2 + 0.5 * r), mat: plMat(), melee: 1, poise: 80, heavy: 1 }); if (!t.dead && !lying(t)) { addFx(t, 'stun', 1 + 0.5 * r); if (!t.def.boss) floatText(t.x, 2.6, t.z, 'FLAT', '#ffe9a0', 13); } },
  l_howl(r) { const t = 3 + r; pl.sw = { kind: 'howl', t: 0, dur: 0.9 }; pl.act = { type: 'skill', kind: 'lock', t: 0, dur: 0.6 }; sfx('howl'); ringFx(pl.x, pl.z, 0xffd040, 12, 0.8); pl.rage = Math.min(100, (pl.rage || 0) + 15 + 5 * r);
    for (const e of plTargets()) { if (d2(pl, e) > 12 || lying(e) || e.phantom) continue; addFx(e, 'slow', t); if (!e.def.boss && !e.elite && (e.fam === 'human' || e.fam === 'animal') && !e.def.five) { e.fearT = t; if (e.ai) e.ai.provoked = true; floatText(e.x, 2.6, e.z, 'RUNS', '#ffe9a0', 13); } }
    if (sk('l_alpha') && EN.wolf && actors.filter(e => e.ally && !e.dead).length < 2) for (let i = 0; i < 2; i++) { const a = R(0, TAU), s = spawnEnemy('wolf', pl.x + Math.sin(a) * 4, pl.z + Math.cos(a) * 4, S.lvl, { spawned: true, awake: 1, name: 'Pack wolf' }); s.team = 0; s.ally = 1; s.allyT = 30; s.noLoot = true; s.ai.aggro = true; collide(s); puff(s.x, 1, s.z, 12, { c: [0.3, 0.3, 0.34], add: 0.3, sp: 2, life: 0.5, size: 0.3, grav: 0 }); } },
  v_frenzy(r) { const t = aimTarget(10); if (!t) return sayNo(pl, 'Nothing to feed on'); const a = dirTo(pl, t); dashTo(t.x - Math.sin(a) * (1.2 + t.r), t.z - Math.cos(a) * (1.2 + t.r), true); pl.rot = a; pl.inv = Math.max(pl.inv, 0.5); pl.sw = { kind: 'bite', t: 0, dur: 0.45 }; pl.act = { type: 'skill', kind: 'lock', t: 0, dur: 0.4 }; sfx('bite'); rigEyes(pl.rigH, isHybrid() ? 1 : 2); pl.faceT = 1.2;
    hit(pl, t, { dmg: skDmg() * (1.8 + 0.4 * r), mat: 'bite', poise: 50, noLs: 1 }); feedOn(t, 20 + 5 * r, 0.14); },
  v_compel(r) { const t = aimTarget(11); if (!t) return sayNo(pl, 'Nobody to compel'); const no = compelCheck(t); pl.rot = dirTo(pl, t); if (no) { ringFx(t.x, t.z, 0xb070ff, 2, 0.4); return sayNo(t, no); }
    pl.sw = { kind: 'gaze', t: 0, dur: 0.45 }; ringFx(t.x, t.z, 0xb070ff, 3, 0.6); sfx('magic'); const dead = t.fam !== 'human', dur = (8 + 4 * r) * (P.compelM || 1) * (dead ? 0.5 : 1); dropAtk(t); t.sw = null;
    if (t.def.boss) { t.fx.stun = Math.max(t.fx.stun || 0, 3); floatText(t.x, 2.8, t.z, 'COMPELLED', '#c090ff', 15); return; }                                                 // a keeper only stands still for a moment
    t.team = 0; t.ai.aggro = true; t.ai.provoked = true; floatText(t.x, 2.8, t.z, 'COMPELLED', '#c090ff', 15);
    if (dead && sk('o_sire') && t.hp < t.maxHp * 0.5 && actors.filter(e => e.ally && !e.allyT && !e.dead).length < sk('o_sire')) { t.ally = 1; t.fx.charm = 0; t.noLoot = true; t.name = 'Sired ' + t.def.n; floatText(t.x, 3.3, t.z, 'SIRED', '#ffd24a', 15); } else t.fx.charm = dur; },
  /* Vamp Speed: not vanishing, only too fast to follow. A straight line, and a wall stops it. */
  v_step(r) { const t = aimTarget(15); if (!t) return sayNo(pl, 'Nothing to rush'); const a = dirTo(pl, t), sx = pl.x, sz = pl.z, len = Math.max(0, d2(pl, t) - (1.3 + t.r)); pl.rot = pl.vr = a; sfx('blur'); const clear = dashTo(pl.x + Math.sin(a) * len, pl.z + Math.cos(a) * len, true); pl.inv = Math.max(pl.inv, 0.35);
    for (const e of plTargets()) if (e !== t && !lying(e) && segD(e.x, e.z, [sx, sz], [pl.x, pl.z]) < 1.3 + e.r) hit(pl, e, { dmg: skDmg() * 0.6, mat: plMat(), melee: 1, poise: 20, kb: 3 });
    if (!clear || d2(pl, t) > 3.4 + t.r) { floatText(pl.x, 2.6, pl.z, 'Stopped short', '#c8c0e0', 13); return; } pl.sw = { kind: 'slashR', t: 0, dur: 0.25 }; trail(pl, 3, 2, 0xdfe8ff); hit(pl, t, { dmg: skDmg() * (2.2 + 0.6 * r), mat: plMat(), melee: 1, crit: 1, poise: 60, heavy: 1 }); },
  v_ripper() { flipSwitch(); ringFx(pl.x, pl.z, S.switchOff ? 0xff2030 : 0xd8d0c0, 6, 0.6); },
  /* Neck Snap: the end of a person; a few seconds on the floor for a vampire or a hybrid, who can be finished while they lie there */
  v_snap(r) { const t = aimTarget(8); if (!t) return sayNo(pl, 'Nobody in reach'); const hard = t.def.boss || !!t.elite || isOrig(t); if (hard && !(t.fx.stun > 0)) return sayNo(t, 'Only while it is staggered');
    const a = t.rot + PI, dmg = skDmg() * (2 + 0.5 * r); dashTo(t.x + Math.sin(a) * (1.1 + t.r), t.z + Math.cos(a) * (1.1 + t.r), true); pl.rot = pl.vr = dirTo(pl, t); pl.inv = Math.max(pl.inv, 0.4); pl.sw = { kind: 'claw', t: 0, dur: 0.3 }; pl.act = { type: 'skill', kind: 'lock', t: 0, dur: 0.3 }; sfx('blur'); sfx('crit');
    if (hard) { t.fx.stun += 2; hit(pl, t, { dmg, mat: 'steel', poise: 0 }); return; }
    if (mortalPerson(t)) { floatText(t.x, 3, t.z, 'NECK SNAPPED', '#ffd24a', 17); hit(pl, t, { dmg: t.hp + t.maxHp, mat: 'steel', noCrit: 1, noLs: 1 }); if (t.dead && !S.switchOff) S.humanity = Math.max(0, S.humanity - 5); return; }
    if (undead(t)) { floatText(t.x, 3, t.z, 'NECK SNAPPED', '#ffd24a', 17); t.riseHp = t.hp; t.downFor = 4 + 2 * r; downEnemy(t, pl); return; }
    if (t.fam === 'wolf' && t.hp / t.maxHp < 0.2 + 0.1 * r) { floatText(t.x, 3, t.z, 'NECK SNAPPED', '#ffd24a', 17); hit(pl, t, { dmg: t.hp + t.maxHp, mat: 'steel', noCrit: 1, noLs: 1 }); return; }
    hit(pl, t, { dmg, mat: 'steel', poise: 40 }); },
  /* Heart Extraction: ends anything that can die, if it is down, staggered or nearly finished. An Original gets up again regardless. */
  v_heart(r) { const t = touchTarget(3); if (!t) return sayNo(pl, 'Nobody within reach'); if (t.fam === 'spirit') return sayNo(t, 'No heart'); const low = t.hp / t.maxHp < 0.2 + 0.05 * r, ok = t.downed || low || (!t.def.boss && t.fx.stun > 0);
    pl.rot = dirTo(pl, t); pl.sw = { kind: 'stab', t: 0, dur: 0.35 }; pl.act = { type: 'skill', kind: 'lock', t: 0, dur: 0.35 }; pl.inv = Math.max(pl.inv, 0.35); sfx('heavy');
    if (!ok) { hit(pl, t, { dmg: skDmg() * (2.4 + 0.4 * r), mat: 'steel', poise: 50 }); return; }
    puff(t.x, 1.4, t.z, 22, { c: BLOOD, add: 0.05, sp: 3.5, up: 2, life: 0.7, size: 0.26 }); sfx('crit'); RT.hitstop = Math.max(RT.hitstop, 0.08);
    if (isOrig(t)) { if (!t.downed) downEnemy(t, pl); floatText(t.x, 3.3, t.z, 'He will get up again', '#b8c0d0', 13); return; }
    floatText(t.x, 3, t.z, 'HEART', '#ffd24a', 19); if (t.downed) trueDeath(t, pl, { lethal: 'heart' }); else hit(pl, t, { dmg: t.hp + t.maxHp, mat: 'steel', lethal: 'heart', noCrit: 1, noLs: 1 }); },
};
function bolt(a, b, col = 0xcfd8ff) { const pts = [], n = 7; for (let i = 0; i <= n; i++) pts.push(new T.Vector3(lerp(a.x, b.x, i / n) + (i % n ? R(-0.5, 0.5) : 0), 1.4 + (i % n ? R(-0.4, 0.4) : 0), lerp(a.z, b.z, i / n) + (i % n ? R(-0.5, 0.5) : 0))); const l = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: col })); areaAdd(l); setTimeout(() => { l.parent && l.parent.remove(l); l.geometry.dispose(); }, 130); puff(b.x, 1.4, b.z, 8, { c: [0.8, 0.85, 1], add: 1, sp: 3, life: 0.25, size: 0.2, grav: 0 }); }
function castSkill(slot) {
  const id = S.bar[slot]; if (!id || !canAct()) return; const d = SK[id], r = sk(id), fn = ABIL[id]; if (!r || !d || !fn) return; const no = txt => { sfx('deny'); floatText(pl.x, 2.6, pl.z, txt, '#c8c0e0', 13); };
  if (!treeOpen(d.tree) || (d.ok && !d.ok())) { sfx('deny'); toast(d.tree === 'witch' ? (S.origin === 'siphoner' || S.origin === 'witch' ? 'The magic does not answer you.' : 'There is no magic in your blood.') : d.okD || 'You are not what that requires.'); return; }
  if (pl.wolf && d.tree !== 'wolf') return no('Not with paws');                                                            // no spells, no stakes, no speeches in wolf form
  if (pl.cds[id] > 0) { sfx('deny'); return; } const dead = d.tree === 'vampire' || d.tree === 'original';
  if (pl.fx.verv > 0 && dead) return no('Vervain'); if (pl.fx.wolfsbane > 0 && d.tree === 'wolf') return no('Wolfsbane'); if (pl.fx.aneur > 0 && (dead || d.tree === 'wolf')) return no('Your head is splitting');
  if (pl.act && pl.act.type !== 'atk') return;
  const c = d.cost || {}; if (c.st && pl.sta < c.st * 0.5) { sfx('deny'); return; } if (c.bl && pl.blood < c.bl) return no('Not enough blood'); if (c.rg && (pl.rage || 0) < c.rg) return no('Not enough rage'); if (c.hp && pl.hp <= P.maxHp * (c.hp + 0.05)) return no('It would kill you');
  // focus. A living witch may cast past empty and pay in blood from the nose: a tenth of her health, half that with Expression. A siphoner with nothing siphoned has nothing to cast with.
  let nose = 0; if (c.fo && pl.foc < c.fo) { if (S.origin === 'siphoner') return no(S.heretic ? 'No magic left. Siphon yourself' : 'No magic left. Siphon something'); nose = P.maxHp * (sk('w_express') ? 0.05 : 0.1) + (c.hp ? P.maxHp * c.hp : 0); if (pl.hp <= nose + P.maxHp * 0.05) return no('It would kill you'); }
  const cloak0 = pl.buff.cloak; pl.act = null; pl.block = false; if (fn(r) === false) return;
  if (c.fo) { if (nose) { pl.foc = 0; pl.hp -= P.maxHp * (sk('w_express') ? 0.05 : 0.1); RT.hurtV = Math.max(RT.hurtV, 0.35); floatText(pl.x, 3, pl.z, 'NOSEBLEED', '#ff7080', 14); puff(pl.x, 1.9, pl.z, 5, { c: BLOOD, add: 0.05, sp: 0.6, life: 0.6, size: 0.12 }); } else pl.foc = Math.max(0, pl.foc - c.fo); }
  if (c.st) { pl.sta = Math.max(0, pl.sta - c.st); pl.staT = 0.8; } if (c.bl) pl.blood = Math.max(0, pl.blood - c.bl); if (c.rg) pl.rage = Math.max(0, pl.rage - c.rg); if (c.hp) { pl.hp = Math.max(1, pl.hp - P.maxHp * c.hp); RT.hurtV = Math.max(RT.hurtV, 0.5); }
  if (id !== 'w_cloak' && cloak0 > 0) pl.buff.cloak = 0;                                                                   // casting ends a cloak
  pl.cds[id] = d.cd * (1 - P.cdr); RT.combatT = Math.max(RT.combatT, 2);
}

/* ---------------- feeding ---------------- */
/* a hand on a townsperson, teeth in their neck. Most of the town drinks vervain: their blood burns, and they remember who bit them. */
function startFeed(n) {
  if (pl.wolf || pl.feed || n.dead) return; const tr = S.transition; if (tr && tr.to !== 'vampire') { sfx('deny'); return toast("Ordinary blood will not finish what you are becoming. Only the doppelgänger's will."); }
  pl.rot = dirTo(pl, n); n.rot = pl.rot; sfx('bite'); puff(n.x, 1.5, n.z, 8, { c: BLOOD, add: 0.05, sp: 2, life: 0.5, size: 0.2 }); rigEyes(pl.rigH, 2); pl.faceT = 1.5;
  let seen = 0; for (const o of actors) if (o.kind === 'npc' && o !== n && !o.dead && o.rig.g.visible && d2(o, n) < 12 && los(o, n)) { seen++; o.fleeT = 6; } if (seen) { S.exposure = Math.min(100, S.exposure + 14 + seen * 8); toast('Someone saw you.'); }
  if (n.verv && !tr) { vervBurn(); pl.sw = { kind: 'bite', t: 0, dur: 0.4 }; n.fleeT = 8; n.fearDay = S.day; n.fedDay = S.day; S.exposure = Math.min(100, S.exposure + 25); S.stats.feeds++; toast('Vervain. It burns all the way down, you get nothing, and they will remember your face.'); codex('vervain'); return; }
  pl.feed = { v: n, got: 0, auto: !!tr }; n.held = true;                                                                 // the first mouthful in transition was agreed to in so many words: it does not also need the key held n.pose = 'held'; pl.sw = { kind: 'bite', t: 0, dur: 9, hold: true };
}
function endFeed(interrupted, quiet) {
  const f = pl.feed; if (!f) return; const n = f.v, fd = $('feed'); pl.feed = null; pl.sw = null; n.held = false; n.pose = null; if (fd) fd.hidden = true; if (n.dead) return; n.dazed = 5; n.fedDay = S.day; S.stats.feeds++;
  if (!interrupted && !quiet) { if (!S.switchOff) S.humanity = Math.min(100, S.humanity + 1); toast('You catch their eye and tell them to forget. They will remember a dizzy spell and nothing else.'); }
}
function updFeed(dt) {
  const f = pl.feed, n = f.v, fd = $('feed'), ff = $('feedfill'); pl.sp = 0; if ((!K.e && !f.auto) || n.dead) return endFeed(false); const am = Math.min(n.blood, 24 * dt); n.blood -= am; f.got += am;
  if (S.transition) { if (f.got >= 5) { endFeed(false, true); n.fearDay = S.day; n.fleeT = 6; completeTransition(); } return; }                                 // the first human blood: the change is finished
  pl.blood = Math.min(P.maxBlood, pl.blood + am * 0.6); heal(P.maxHp * 0.035 * dt, true); if (S.diet !== 'human' && f.got > 3) { S.diet = 'human'; recalc(); }
  if (fd) fd.hidden = false; if (ff) ff.style.width = n.blood + '%'; pl.hbT = (pl.hbT || 0) - dt; if (pl.hbT <= 0) { sfx('heart'); pl.hbT = lerp(1.2, 0.42, n.blood / 100); }
  if (n.blood <= 0) { n.dead = true; n.held = false; n.pose = null; if (!S.switchOff) S.humanity = Math.max(0, S.humanity - 12); else S.flags.offKills = (S.flags.offKills || 0) + 1; S.exposure = Math.min(100, S.exposure + 30); S.stats.murders++; sfx('die'); toast(S.switchOff ? 'The heart stops. You notice, and that is all.' : 'The heart stops. You did not let go.'); diary('murder'); endFeed(true); qEvent('murder'); }
}
/* teeth in an enemy: an animal, or anything staggered that has blood worth having */
function biteEnemy(e) {
  if (pl.wolf || e.dead) return; pl.rot = dirTo(pl, e); pl.sw = { kind: 'bite', t: 0, dur: 0.5 }; pl.act = { type: 'skill', kind: 'lock', t: 0, dur: 0.45 }; pl.inv = Math.max(pl.inv, 0.45); sfx('bite'); puff(e.x, 1.4, e.z, 14, { c: BLOOD, add: 0.05, sp: 3, life: 0.6, size: 0.22 }); rigEyes(pl.rigH, isHybrid() ? 1 : 2); pl.faceT = 1.2;
  if (S.transition) { hit(pl, e, { dmg: e.maxHp * 0.15, mat: 'bite', noCrit: 1, noLs: 1 }); completeTransition(); return; }
  const k = feedOn(e, e.def.peaceful ? 30 : 25, 0.1); hit(pl, e, { dmg: e.def.peaceful ? e.hp + 1 : e.maxHp * (k ? 0.4 : 0.12), mat: 'bite', noCrit: 1, noLs: 1 });
}
/* a wooden bolt or bullet stays in a vampire until it is dug out: hold Use for a second each */
function pullLodged() {
  if (!(pl.fx.lodged > 0)) return false; pl.fx.lodged = Math.max(0, pl.fx.lodged - 1); pl.pull = 0; pl.hp = Math.max(1, pl.hp - P.maxHp * 0.02); sfx('hit'); puff(pl.x, 1.3, pl.z, 8, { c: BLOOD, add: 0.05, sp: 2, up: 1, life: 0.5, size: 0.18 }); floatText(pl.x, 2.9, pl.z, pl.fx.lodged > 0 ? 'PULLED · ' + pl.fx.lodged + ' left' : 'PULLED OUT', '#e8c890', 14); if (!(pl.fx.lodged > 0)) recalc(); return true;
}

/* ---------------- the Use key on a person or a creature ---------------- */
function finishDowned(e) {   // the heart or the head, with whatever you are carrying that can do it
  if (!e || e.dead || !e.downed || !pl || pl.dead) return false; const w = S.eq.weapon, rg = S.eq.ranged, wm = pl.wolf ? 'bite' : w ? P.wmat : null, rm = !pl.wolf && rg ? BASES[rg.base].mat : null;
  const wood = wm === 'wood' || wm === 'whiteoak' || (w && BASES[w.base].cls === 'staff') || rm === 'wood', blade = wm === 'steel' || rm === 'steel', hands = pl.wolf || isVamp() || isWolf(); let how = null;
  if (isHybrid() && S.sire && e.type === S.sire && !((S.flags.shifts || 0) >= 100)) { sfx('deny'); toast('You are sired to him. Your hands will not close on anything that would end him.'); return false; }
  if (isOrig(e)) { if (pl.wolf || P.wmat !== 'whiteoak') { sfx('deny'); toast('Nothing you are carrying can end one of the first family. Only white oak, through the heart.'); return false; } how = 'whiteoak'; }
  else if (isHyb(e)) { how = blade ? 'head' : hands ? 'heart' : null; if (!how) { sfx('deny'); toast('Wood only puts a hybrid on the floor. It takes a blade for the head, or a hand that can reach the heart.'); return false; } }
  else { how = wood ? 'stake' : blade ? 'head' : hands ? 'heart' : null; if (!how) { sfx('deny'); toast('You need wood for the heart or a blade for the neck.'); return false; } }
  pl.rot = dirTo(pl, e); pl.sw = { kind: how === 'head' ? 'over' : pl.wolf ? 'bite' : 'stab', t: 0, dur: 0.4 }; pl.act = { type: 'skill', kind: 'lock', t: 0, dur: 0.4 }; pl.inv = Math.max(pl.inv, 0.4); sfx('heavy'); RT.hitstop = Math.max(RT.hitstop, 0.08); RT.shake = Math.max(RT.shake, 0.3);
  puff(e.x, 0.6, e.z, 18, { c: BLOOD, add: 0.05, sp: 3, up: 2.5, life: 0.6, size: 0.24 }); floatText(e.x, 2.4, e.z, how === 'whiteoak' ? 'WHITE OAK' : how === 'stake' ? 'STAKED' : how === 'head' ? 'BEHEADED' : pl.wolf ? 'TORN OUT' : 'HEART', '#ffd24a', 18);
  trueDeath(e, pl, { mat: how === 'whiteoak' ? 'whiteoak' : how === 'stake' ? 'wood' : 'steel', lethal: how }); return true;
}
function ashDagger(e) {   // the white-oak-ash dagger: holds a pure Original as dead while it stays in, kills an ordinary vampire who uses it, and does nothing to the Original hybrid
  if (!e || e.dead || !e.downed || !(S.cons.ashdagger > 0)) return false; S.cons.ashdagger--; pl.rot = dirTo(pl, e); pl.sw = { kind: 'stab', t: 0, dur: 0.4 }; sfx('heavy');
  if (isHyb(e)) { e.downT = Math.min(e.downT, 2.5); toast('The dagger goes in to the hilt and nothing happens. His wolf side heals from silver. He is already stirring.'); storyEvent('dagger', e, false); return true; }
  e.downT = 1e9; e.daggered = true; ringFx(e.x, e.z, 0xd8d8e0, 5, 0.7); puff(e.x, 0.6, e.z, 20, { c: ASH, add: 0.1, sp: 1.5, up: 1, life: 1, size: 0.3, grav: 0.5 }); floatText(e.x, 2.4, e.z, 'DAGGERED', '#d8d8e0', 18); toast('The ash takes him. He will lie like the dead for as long as the dagger stays where it is, and nobody of his line dies for it.'); storyEvent('dagger', e, true);
  if (isVamp() && !S.original) { toast('The dagger was made to kill any vampire who used it. You knew that.'); playerDeath(null, { mat: 'ash' }); } return true;
}
const TURNLINE = 'Human blood. Drink and you are a vampire, for good: the sun, the hunger, all of it. Walk away and the day runs out, and you die the ordinary way.';
function mercyKill(e) { if (!e || e.dead || !e.ko) return; pl.rot = dirTo(pl, e); pl.sw = { kind: 'over', t: 0, dur: 0.5 }; pl.act = { type: 'skill', kind: 'lock', t: 0, dur: 0.5 }; sfx('heavy'); puff(e.x, 0.5, e.z, 16, { c: BLOOD, add: 0.05, sp: 2.5, up: 2, life: 0.6, size: 0.24 }); e.ko = false; e.lieK = 1; e.mercyKill = true; die(e, pl); }
function siphonTouch(e) { if (pl.cds.w_siphon > 0) { sfx('deny'); return; } pl.rot = dirTo(pl, e); if (ABIL.w_siphon(Math.max(1, sk('w_siphon'))) !== false) { pl.cds.w_siphon = SK.w_siphon ? SK.w_siphon.cd * (1 - P.cdr) : 5; if (pl.buff.cloak > 0) pl.buff.cloak = 0; RT.combatT = Math.max(RT.combatT, 2); } }
/* The one place that decides what E does to an actor at distance `dist`: talk, feed, finish a downed vampire, kill someone you only knocked out, siphon. Returns { label, act } or null.
   Anything that would change what the player is (the first human blood in transition, the killing that wakes the curse, white oak in an Original) asks once more before it happens. */
function actorInteract(n, dist) {
  if (!pl || pl.dead || pl.feed || !n || n.dead || n === pl || !n.rig.g.visible || pl.shiftT > 0 || pl.fx.charm > 0) return null; const vamp = isVamp(), tr = S.transition, thirst = vamp || (tr && tr.to === 'vampire');
  if (n.kind === 'npc') {
    if (pl.wolf) return null;                                                                                                // a wolf does not talk, shop or ask nicely
    if (n.npc.talk) return dist < 3.2 ? { label: 'Talk to ' + n.name, act: () => n.npc.talk(n) } : null; if (dist >= 2.5) return null;
    if (thirst && n.fedDay !== S.day && !(n.fleeT > 0) && n.npc.feed !== 0) return tr ? { label: 'Feed (human blood finishes the change, for good)', act: () => say([['', TURNLINE]], [['Feed.', () => startFeed(n)], ['Not yet.', () => { }]]) } : { label: 'Feed (hold, and let go in time)', act: () => startFeed(n) };
    return n.dazed > 0 || n.fleeT > 0 ? null : { label: 'Talk', act: () => say([[n.name, pick(TOWNIE_BARKS)]]) };
  }
  if (n.kind !== 'enemy' || n.phantom || n.team === 0) return null; const reach = 2.6 + n.r, nm = n.def.n.split(',')[0];
  if (n.ko) return dist < reach && S.origin === 'wolf' && S.species === 'human' ? { label: `Kill the unconscious ${nm} (this wakes the curse)`, act: () => say([['', 'They are breathing. Kill them and the curse in your blood wakes for good: you will turn on every full moon for the rest of your life.']], [['Kill them.', () => mercyKill(n)], ['Leave them.', () => { }]]) } : null;
  if (n.downed) { if (dist >= reach + 0.4) return null;
    if (isOrig(n)) { if (n.fateInter) return null;                                                                           // the story is standing over this one: its own prompt decides
      if (!pl.wolf && P.wmat === 'whiteoak') return { label: `Drive the white oak through ${nm}'s heart (this ends him, and his whole line)`, act: () => say([['', `White oak through the heart is the one thing that kills ${nm}. Every vampire he ever made dies within the hour${lineLinked() ? ', and you are one of them' : ''}. The stake burns with him.`]], [['End him.', () => finishDowned(n)], ['Not like this.', () => { }]]) };
      if (!pl.wolf && S.cons.ashdagger > 0 && !n.daggered) return { label: `Use the ash dagger on ${nm}` + (vamp && !S.original ? ' (it kills a vampire who uses it)' : ''), act: () => ashDagger(n) };
      if (S.origin === 'siphoner' && canMagic() && !pl.wolf) return { label: 'Siphon ' + nm, act: () => siphonTouch(n) }; return null; }
    if (S.origin === 'siphoner' && canMagic() && !pl.wolf && n.fam === 'vampire' && n.downT < 1e8 && pl.foc < P.maxFoc * 0.5) return { label: `Siphon the ${nm} dry`, act: () => siphonTouch(n) };
    return { label: `Finish the ${nm}`, act: () => finishDowned(n) }; }
  if (n.dormant || dist >= reach) return null;
  if (thirst && !pl.wolf) { const blood = n.fam === 'human' || n.fam === 'witch' || n.fam === 'animal' || n.fam === 'hybrid' || (n.fam === 'wolf' && n.rig.kind === 'biped');
    if (tr) { if ((n.fam === 'human' || n.fam === 'witch') && n.fx.stun > 0 && !n.def.boss) return { label: `Feed on the ${nm} (human blood finishes the change, for good)`, act: () => say([['', TURNLINE]], [['Feed.', () => biteEnemy(n)], ['Not yet.', () => { }]]) }; }
    else if (n.def.peaceful && n.fam === 'animal') return { label: `Feed on the ${nm.toLowerCase()} (animal blood)`, act: () => biteEnemy(n) };
    else if (blood && n.fx.stun > 0 && !n.def.boss) return { label: `Feed on the staggered ${nm}`, act: () => biteEnemy(n) }; }
  if (S.origin === 'siphoner' && canMagic() && !pl.wolf && n.fx.stun > 0 && (undead(n) || n.fam === 'wolf' || n.fam === 'witch' || n.fam === 'spirit')) return { label: `Siphon the staggered ${nm}`, act: () => siphonTouch(n) };
  return null;
}

/* ---------------- per-frame ---------------- */
function updPlayer(dt) {
  const p = pl, b = p.buff; let ix = (K.d || K.arrowright ? 1 : 0) - (K.a || K.arrowleft ? 1 : 0) + J.x, iz = (K.s || K.arrowdown ? 1 : 0) - (K.w || K.arrowup ? 1 : 0) + J.y; const il = hyp(ix, iz); if (il > 1) { ix /= il; iz /= il; } mvx = ix; mvz = iz;
  for (const k of ['dodgeCd', 'rangedCd', 'healCd', 'inv', 'comboT', 'bufT', 'staT', 'shiftCd', 'shiftT']) p[k] = Math.max(0, (p[k] || 0) - dt); for (const k in p.cds) if (p.cds[k] > 0) p.cds[k] -= dt;
  let ended = false; for (const k in b) if (k !== 'ward' && k !== 'slayerN' && b[k] > 0) { b[k] -= dt; if (b[k] <= 0 && (k === 'fury' || k === 'cloak')) ended = true; } if (ended) recalc(); if (b.wardT <= 0) b.ward = 0; if (b.slayer <= 0) b.slayerN = 0; wardMesh.visible = b.ward > 0; tickFx(p, dt); if (p.dead) return;
  RT.combatT = Math.max(0, RT.combatT - dt); const combat = RT.combatT > 0, vamp = isVamp(), wolfK = isWolf(), world = RT.area.id === 'world'; p.starve = 1;
  // resources
  if (p.staT <= 0 && !p.block) p.sta = Math.min(P.maxSta, p.sta + P.staRegen * dt); p.foc = Math.min(P.maxFoc, p.foc + P.focRegen * dt);
  if (b.burger > 0 && !vamp) heal(P.maxHp * 0.012 * dt, true); if (P.regen > 0) heal(P.regen * dt, true);
  if (vamp) { p.blood = Math.max(0, p.blood - dt * 0.07 * (P.hunger != null ? P.hunger : 1)); const mend = noMend() || p.fx.lodged > 0 ? 0 : P.healM != null ? P.healM : 1, rate = (sk('v_heal') * 0.004 + (combat ? 0 : 0.01)) * mend * P.maxHp; if (p.hp < P.maxHp && p.blood > 0 && rate > 0) { heal(rate * dt, true); p.blood = Math.max(0, p.blood - dt * 0.35); } }
  else if (!combat && p.hp < P.maxHp && !(wolfK && p.fx.wolfsbane > 0)) heal(P.maxHp * 0.02 * dt, true);
  if (wolfK || (S.origin === 'wolf' && !vamp)) { if (!combat) p.rage = Math.max(0, (p.rage || 0) - 2 * dt); } else p.rage = 0;
  if (S.switchOff && vamp && chance(0.2)) puff(p.x, 1.5, p.z, 1, { c: [0.6, 0.02, 0.05], add: 0.6, sp: 0.6, up: 1, life: 0.5, size: 0.25, grav: 0 });
  S.exposure = Math.max(0, S.exposure - dt * 0.06);
  // the sun. In transition it only hurts the eyes. A hybrid does not care. Anyone else who is dead needs a spelled ring, and the ring does not work inside Coven Hollow.
  const sunny = world && sunUp() && !RT.indoors; RT.glare = S.transition && sunny ? 1 : 0; p.burning = vamp && sunny && !daylightSafe();
  if (p.burning) { const wet = S.weather === 'storm' || S.weather === 'rain' || S.weather === 'fog'; p.hp -= P.maxHp * (wet ? 0.02 : 0.05) * dt; puff(p.x + R(-0.3, 0.3), 1.4, p.z + R(-0.3, 0.3), 2, { c: FIRE, add: 1, sp: 0.6, up: 2.5, life: 0.5, size: 0.3, grav: -2 }); p.sunT = (p.sunT || 0) - dt; if (p.sunT <= 0) { p.sunT = 6; toast(hollowHostile() && hasUniq('daylight') ? 'Your ring is only a stone here. The dead witches of the Hollow have switched it off, and the sun is burning you.' : 'The sun is burning you. Get under a roof, or underground.'); sfx('fire'); } if (p.hp <= 0) return playerDeath('sun'); }
  // twice a second: the slower checks
  p.slowT -= dt; if (p.slowT <= 0) { p.slowT = 0.5;
    if ((P.desic || 0) !== (p.greyS || 0)) refreshGear();                                                                    // a starving vampire goes grey by stages
    if (p.faceT > 0) p.faceT -= 0.5; else if (!p.wolf) rigEyes(p.rigH, wolfK && (b.fury > 0 || (p.rage || 0) >= 60 || (isHybrid() && combat)) ? 1 : vamp && (p.feed || p.blood < P.maxBlood * 0.15) ? 2 : 0);
    // the Hundred do not suffer the dead on their ground: pain, for as long as a vampire or a hybrid stands in the Hollow, until someone they trust has spoken for you
    if (vamp && world && hollowHostile()) { p.hollowT = (p.hollowT || 0) + 0.5; if (!p.hollowTip) { p.hollowTip = 1; toast('A hundred dead witches know what you are. Inside the Hollow they will hurt you for as long as you stay.'); }
      if (p.hollowT >= 3) { p.hollowT = 0; p.hp = Math.max(1, p.hp - P.maxHp * 0.04); p.fx.slow = Math.max(p.fx.slow || 0, 1.2); p.fx.aneur = Math.max(p.fx.aneur || 0, 1.5); RT.hurtV = Math.max(RT.hurtV, 0.5); sfx('zap'); floatText(p.x, 2.9, p.z, 'PAIN', '#c090ff', 15); puff(p.x, 2, p.z, 8, { c: MAGIC, add: 1, sp: 1.5, life: 0.5, size: 0.2, grav: 0 }); } } else { p.hollowT = 0; p.hollowTip = 0; }
    if (p.fx.lodged > 0 && !vamp) p.fx.lodged = 0; }
  if (Math.abs(p.kx) + Math.abs(p.kz) > 0.05) { const n = Math.max(1, Math.ceil(hyp(p.kx, p.kz) * dt / 0.5)); for (let i = 0; i < n; i++) { p.x += p.kx * dt / n; p.z += p.kz * dt / n; if (collide(p) && n > 1) { p.kx *= 0.3; p.kz *= 0.3; break; } } const f = Math.pow(0.0006, dt); p.kx *= f; p.kz *= f; }   // thrown hard (telekinesis), you still stop at the wall
  // held-attack → heavy
  const atkDown = mouse.l || K.j; if (atkDown) p.atkHeld += dt; else { p.atkHeld = 0; p.heavyUsed = false; }
  if (p.feed) return updFeed(dt);
  if (p.shiftT > 0) { p.sp = 0; p.act = null; p.block = false; if (chance(0.5)) puff(p.x + R(-0.4, 0.4), R(0.4, 1.4), p.z + R(-0.4, 0.4), 1, { c: [0.25, 0.22, 0.2], add: 0.2, sp: 1, life: 0.4, size: 0.3, grav: 0 }); return; }   // every bone breaking: nothing to do but wait
  if (p.fx.stun > 0) { p.sp = 0; p.act = null; p.block = false; p.pull = 0; return; }
  // compelled: you walk to whoever is holding your eyes, and nothing else. It ends when they fall.
  if (p.fx.charm > 0) { const c = p.charmBy; p.act = null; p.block = false; if (!c || c.dead || lying(c)) { p.fx.charm = 0; p.charmBy = null; } else { p.rot = dirTo(p, c); if (d2(p, c) > 2.2 + c.r) { p.x += Math.sin(p.rot) * 2.4 * dt; p.z += Math.cos(p.rot) * 2.4 * dt; collide(p); p.sp = 2.4; } else p.sp = 0; return; } }
  // wood lodged in a vampire: hold Use to dig one out. Once the fighting is over there is time to get the rest.
  if (p.fx.lodged > 0) { if (K.e && !p.act) { p.pull += dt; if (chance(0.3)) puff(p.x, 1.3, p.z, 1, { c: BLOOD, add: 0.05, sp: 1, life: 0.4, size: 0.14 }); if (p.pull >= 0.9) pullLodged(); } else p.pull = 0; if (!combat) { p.calm = (p.calm || 0) + dt; if (p.calm > 3) { p.calm = 1.8; pullLodged(); } } else p.calm = 0; } else p.pull = 0;
  const a = p.act;
  if (a) { a.t += dt;
    if (a.type === 'atk') { if (a.heavy === 'lunge' && a.t > a.dur * 0.25 && a.t < a.hitAt) { for (let i = 0; i < 2; i++) { p.x += Math.sin(p.rot) * 19 * dt / 2; p.z += Math.cos(p.rot) * 19 * dt / 2; collide(p); } }
      else if (a.heavy === 'pounce' && a.t > a.dur * 0.12 && a.t < a.hitAt) { const v = a.len / (a.hitAt - a.dur * 0.12); for (let i = 0; i < 2; i++) { p.x += Math.sin(p.rot) * v * dt / 2; p.z += Math.cos(p.rot) * v * dt / 2; collide(p); } }   // the leap: up to 8 metres onto the aim point
      if (!a.done && a.t >= a.hitAt) { a.done = true; plResolve(); } if (a.heavy === 'spin' && a.done && a.n === 0 && a.t >= a.dur * 0.82) { a.n = 1; plResolve(); }
      p.sp = 0; if (a.t >= a.dur) { p.act = null; if (!a.heavy && atkDown && p.atkHeld > 0.3 && !p.heavyUsed) startHeavy(); } }
    else if (a.type === 'dodge') { for (let i = 0; i < 3; i++) { p.x += a.vx * dt / 3; p.z += a.vz * dt / 3; collide(p); } p.roll = a.blur || p.wolf ? 0 : Math.max(0.001, 1 - a.t / a.dur); p.sp = 10;
      if (a.blur) { puff(p.x, 1.1, p.z, 2, { c: [0.3, 0.3, 0.5], add: 0.5, sp: 0.4, life: 0.3, size: 0.5, grav: 0 }); if (sk('v_blur') >= 3) for (const e of plTargets()) if (!a.hitIds[e.id] && !lying(e) && !neutralTo(e) && d2(p, e) < 1.6 + e.r) { a.hitIds[e.id] = 1; hit(p, e, { dmg: skDmg() * 0.8, mat: plMat(), melee: 1, poise: 10 }); } }
      if (a.t >= a.dur) { p.act = null; p.roll = 0; } }
    else if (a.type === 'shoot') { p.sp = 0; if (!a.done && a.t >= a.dur * 0.45) { a.done = true; const it = a.it, bs = BASES[it.base]; shoot(p, p.x + Math.sin(p.rot) * 0.8, p.z + Math.cos(p.rot) * 0.8, p.rot, { spd: bs.pspd, dmg: it.dmg * P.rangedM, mat: bs.mat, range: 30, poise: 12, pierce: it.uniq === 'halebow', col: bs.mat === 'steel' ? 0xd0d8e8 : 0xe8c890 }); sfx(it.base === 'revolver' ? 'gun' : 'shoot'); p.kx -= Math.sin(p.rot) * 1.5; p.kz -= Math.cos(p.rot) * 1.5; } if (a.t >= a.dur) p.act = null; }
    else if (a.type === 'skill') { if (a.kind === 'whirl') { const sp = P.spd * 0.6; p.x += ix * sp * dt; p.z += iz * sp * dt; collide(p); if (a.t >= (a.k + 0.5) * 0.24 && a.k < a.n) { a.k++; trail(p, 3.8, 6.2, 0xffe0b0); meleeHit(3.8, 7, 0.8, { poise: 20, kb: 2 }); sfx('swing'); } } p.sp = 0; if (a.t >= a.dur) p.act = null; }
  }
  if (!p.act) {
    if (p.buf && p.bufT > 0) { const bf = p.buf; p.buf = null; if (bf === 'atk') startLight(); else if (bf === 'heavy') startHeavy(); else if (bf === 'shoot') tryShoot(); }
    else if (atkDown && p.atkHeld > 0.34 && !p.heavyUsed && canAct()) startHeavy();
  }
  if (!p.act) {
    const want = (mouse.r || K.shift || K.l) && p.sta > 0 && !p.wolf; if (want && !p.block) { p.block = true; p.blockT = 0; } else if (!want) p.block = false; if (p.block) { p.blockT += dt; p.rot = aimDir(); }   // a wolf has nothing to block with
    if (il > 0.1 && !combat) p.moveT += dt; else if (il <= 0.1 || combat) p.moveT = combat ? 0 : Math.max(0, p.moveT - dt * 3);
    const sp = p.fx.root > 0 ? 0 : P.spd * (p.block ? 0.45 : 1) * (p.moveT > 1.4 ? 1.35 : 1) * (p.fx.slow > 0 || p.fx.sick > 0 ? 0.6 : 1) * (p.fx.verv > 0 ? 0.8 : 1) * (p.pull > 0 ? 0.3 : 1);
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
  RT.shake = Math.max(0, Math.min(1.5, RT.shake) - dt * 1.8); cam.position.x += (Math.random() - 0.5) * RT.shake; cam.position.y += (Math.random() - 0.5) * RT.shake; cam.lookAt(look); cam.updateMatrixWorld();
  if (RT.area.id === 'world' && !isNight()) { const an = (S.clock - 6) / 14 * PI; sun.position.set(pl.x + Math.cos(an) * 42, 24 + Math.sin(an) * 34, pl.z - 20); } else sun.position.set(pl.x - 26, 48, pl.z - 20); sun.target.position.set(pl.x, 0, pl.z); aura.position.set(pl.x, 2.4, pl.z + 0.5);
  for (const b of RT.area.fade) { const hide = pl.z < b.z + b.d / 2 && pl.z > b.z - b.d / 2 - 10 && Math.abs(pl.x - b.x) < b.w / 2 + 2.5, a = lerp(b.a, hide ? 0.2 : 1, Math.min(1, dt * 8));
    if (Math.abs(a - b.a) > 0.001 || (hide && b.a === 1)) { const tr = a < 0.99; b.o.traverse(m => { if (m.isMesh) { if (m.material.transparent !== tr) { m.material.transparent = tr; m.material.needsUpdate = true; } m.material.opacity = a; m.castShadow = !hide; } }); b.a = a > 0.995 ? 1 : a; } }
}
addEventListener('wheel', e => { if (!RT.menu) RT.zoom = clamp(RT.zoom + Math.sign(e.deltaY) * 0.08, 0.7, 1.4); }, { passive: true });
/* Hollow Moon — systems: stats and species, items, loot, levelling, turning, quests, bounties, vendors, areas, the clock, death, saving. */
let UID = 1; const drops = [], HOME = { x: -37, z: -8 };
function newGame(look, origin) {
  const og = ORIGINS[origin] ? origin : 'human', kit = ORIGINS[og].start;
  S = { v: 3, seed: Math.floor(Math.random() * 1e9), origin: og, species: 'human', heretic: false, original: false, transition: null, sire: null, unlinked: false, venomUntil: 0, curseUntil: 0, switchOff: false, diet: 'human', codex: {},
    lvl: 1, xp: 0, ap: 0, sp: 0, attr: { mig: 0, fin: 0, vig: 0, wil: 0 }, skills: Object.assign({}, kit.skills), asc: { pow: 0, vit: 0, swi: 0, fort: 0 }, sigils: 0,
    hp: 100, foc: og === 'siphoner' ? 0 : 50, blood: 60, humanity: 100, exposure: 0, gold: 20, inv: [], eq: { weapon: null, ranged: null, armor: null, ring: null, amulet: null }, cons: Object.assign({}, kit.cons), bar: [null, null, null, null],
    quests: {}, done: {}, bounties: [], bountyDay: 0, flags: { mercy: 1 }, diary: [], day: 1, clock: 16.5, weather: 'clear', area: 'world', pos: { x: HOME.x, z: HOME.z }, disc: { town: 1 }, deepest: 0, runs: 0, kills: {}, stats: { kills: 0, feeds: 0, murders: 0, deaths: 0, floors: 0, played: 0 }, opened: {}, gath: {}, look, vendors: {}, ts: 0 };
  S.eq.weapon = genItem(1, { base: kit.weapon, rar: 0 }); S.eq.armor = genItem(1, { base: kit.armor, rar: 0 }); let i = 0; for (const k in S.skills) if (SK[k].act && i < 4) S.bar[i++] = k;
}
const sk = id => S.skills[id] || 0, treePts = t => Object.keys(S.skills).reduce((n, k) => n + (SK[k] && SK[k].tree === t ? S.skills[k] : 0), 0);
const hasUniq = k => Object.values(S.eq).some(i => i && i.uniq === k), up = (it, v) => v * (1 + 0.08 * (it.up || 0));

/* ---------------- what you are ---------------- */
const absHours = () => (S.day - 1) * 24 + S.clock;                                   // game hours since the first midnight; one game hour is one real minute
const isVamp = () => S.species === 'vampire' || S.species === 'hybrid', isWolf = () => S.species === 'werewolf' || S.species === 'hybrid', isHybrid = () => S.species === 'hybrid', inTransition = () => !!S.transition;
const canMagic = () => S.origin === 'siphoner' ? S.species === 'human' || !!S.heretic : S.origin === 'witch' && !!S.flags.witch && S.species === 'human';
function treeOpen(t) { return t === 'hunter' || (t === 'witch' ? canMagic() : t === 'wolf' ? isWolf() : t === 'vampire' ? isVamp() : t === 'original' ? isVamp() && !!S.original : false); }
const inHollow = () => S.area === 'world' && !!pl && zoneAt(pl.x, pl.z).id === 'hollow';
const moonPower = () => 1 - Math.abs(moonPhase() - 4) / 4;                            // 0 at the new moon, 1 at the full
const isBound = it => !!(it && it.uniq && UNIQ[it.uniq] && UNIQ[it.uniq].bound);       // cannot be sold or salvaged
const lineLinked = () => isVamp() && S.sire === 'corvin' && !S.unlinked && !S.original;   // dies within the hour if Corvin is truly killed
const sireBound = () => isHybrid() && S.sire === 'corvin' && !S.original && (S.flags.shifts || 0) < 100;   // a sired hybrid cannot raise a hand to Corvin
/* the sun: hybrids and anyone not (yet) a vampire are safe; a vampire needs a spelled daylight ring, and the Hundred switch it off inside Coven Hollow
   until they are at peace or a witch has vouched for you (the same flags that stop them hurting a vampire there: 35-player) */
const hollowHostile = () => inHollow() && !(S.flags.hollowPeace || S.flags.vouched || S.flags.matriarch);
function daylightSafe() { if (!isVamp() || isHybrid()) return true; const r = Object.values(S.eq).find(i => i && i.uniq === 'daylight'); return !!r && !r.despelled && !hollowHostile(); }
/* compulsion. byOriginal: the one trying is an Original. Vervain (drunk, worn or burning in you), the Five, witches, siphoners, heretics and triggered werewolves are immune to everyone;
   an ordinary vampire or a hybrid is immune to other vampires but not to an Original; Originals cannot compel each other. */
function immuneCompel(byOriginal) {
  if (S.flags.vervUntil > absHours() || hasUniq('vlocket') || (pl && pl.fx.verv > 0)) return true;
  if (S.original || S.heretic || S.species === 'werewolf') return true;
  if (isVamp()) return !byOriginal;
  return S.origin === 'witch' || S.origin === 'siphoner' || (sk('h_five') > 0 && S.origin === 'human');
}
function codex(id) { S.codex = S.codex || {}; if (S.codex[id]) return false; S.codex[id] = 1; const c = typeof CODEX !== 'undefined' && CODEX[id]; if (c) toast('Codex: ' + c.t); return true; }
/* the Sleeper's door on floor 20 was sealed by a witch: it opens to a living witch of the Thorne line, or to anyone carrying Emeline Thorne's talisman */
function canOpenSleeper() { return (S.origin === 'witch' && canMagic()) || S.cons.talisman > 0; }
/* the full moon: a triggered werewolf has no say unless ringed or chained; a hybrid always chooses */
function fullTonight() { if (S.clock < 6) return fullMoon(); const c = S.clock; S.clock = 21; const f = fullMoon(); S.clock = c; return f; }   // is the moon full on the night now running, or the one coming
const moonForced = () => S.species === 'werewolf' && !S.transition && fullMoon() && isNight() && !hasUniq('moonring') && S.flags.chained !== S.day;
function shiftAllowed() { if (!isWolf()) return S.origin === 'wolf' && S.species === 'human' ? 'The curse is asleep in you.' : 'There is no wolf in you.'; if (isHybrid()) return ''; if (!(fullMoon() && isNight())) return 'Only the full moon brings the wolf out of you.'; return hasUniq('moonring') ? '' : 'Tonight the moon decides, not you.'; }
const shiftForm = w => { if (!pl || !!pl.wolf === !!w) return; if (typeof setForm === 'function') setForm(!!w, false); else { pl.wolf = !!w; recalc(); } };

function recalc() {
  const a = Object.assign({}, S.attr), st = { dmg: 0, crit: 0, critd: 0, hp: 0, st: 0, fo: 0, def: 0, ls: 0, spd: 0, as: 0, cdr: 0, xp: 0, gold: 0, mf: 0, regen: 0, vsV: 0, vsW: 0, vsS: 0, spell: 0, burn: 0, thorns: 0 };
  for (const k in S.eq) { const it = S.eq[k]; if (!it) continue; for (const f of ['def', 'hp', 'st', 'fo']) if (it[f]) st[f] += up(it, it[f]); for (const [key, v] of it.aff) { if (key in a) a[key] += v; else st[key] = (st[key] || 0) + v; } }
  const L = S.lvl, F = S.flags, now = absHours(), dring = Object.values(S.eq).concat(S.inv).find(i => i && i.uniq === 'daylight'), fx = pl ? pl.fx : {}, bf = pl && pl.buff || {}, vamp = isVamp(), wolfK = isWolf(), hyb = isHybrid(), orig = vamp && !!S.original, wf = !!(pl && pl.wolf), tr = !!S.transition, magic = canMagic(), siph = S.origin === 'siphoner';
  const gene = S.origin === 'wolf' && !vamp, fullN = fullMoon() && isNight(), mp = wolfK ? moonPower() : 0, ringMoon = wolfK && !wf && fullN && hasUniq('moonring'), w = S.eq.weapon, wb = w && BASES[w.base], staff = !!wb && wb.cls === 'staff';
  const elder = vamp ? sk('v_elder') : 0, om = orig ? sk('o_might') : 0, might = wolfK ? sk('l_might') : 0, moonSk = wolfK ? sk('l_moon') : 0, chan = magic ? sk('w_chan') : 0, drawn = chan > 0 && (fullN || inHollow()), hundred = magic && F.hundredT > now;
  const off = vamp && !!S.switchOff, guilt = vamp && F.guiltT > now, venom = vamp && !hyb && S.venomUntil > now, vervd = vamp && fx.verv > 0, wbaned = wolfK && fx.wolfsbane > 0, animal = vamp && S.diet === 'animal', five = sk('h_five') > 0 && S.origin === 'human' && S.species === 'human' && !tr;
  const desic = vamp && pl && pl.blood <= 0 ? 1 + Math.min(2, Math.floor((pl.dryT || 0) / 60)) : 0, rage = pl && (wolfK || gene) ? clamp((pl.rage || 0) / 100, 0, 1) : 0, fury = wolfK && bf.fury > 0;
  if (dring) F.dring = dring.despelled ? 2 : 1; else if (F.dring && RT.started) { const r = mkUniq('daylight', L); if (F.dring === 2) r.despelled = true; S.inv.push(r); toast('The daylight ring is bound to you. It is back in your pocket.'); }   // bound: however it left, it comes back
  P.attr = a; P.maxBlood = (100 + L) * (1 + 0.06 * elder) * (orig ? 1.2 : 1); const fed = vamp && sk('v_fed') > 0 && !animal && pl && pl.blood > P.maxBlood * 0.7 ? sk('v_fed') : 0;
  P.maxHp = (100 + 12 * (L - 1) + a.vig * 10 + st.hp) * (1 + S.asc.vit * 0.02) * (vamp ? 1.15 : wolfK ? 1.06 : 1) * (hyb ? 1.06 : 1) * (1 + 0.06 * elder) * (1 + 0.03 * might) * (wf ? 1.2 : 1) * (orig ? 1.25 * (1 + 0.04 * om) : 1) * (1 - 0.02 * Math.min(10, F.ringDeaths || 0));
  P.maxSta = 100 + a.vig * 2 + st.st + sk('h_cond') * 10 + (vamp ? 20 : wolfK ? 10 : gene ? 5 : 0); P.maxFoc = 50 + a.wil * 4 + st.fo + (magic ? sk('w_attune') * 10 : 0);
  P.staRegen = 24 * (1 + 0.08 * sk('h_cond')) * (vamp ? 1.2 : wolfK ? 1.1 : 1); P.focRegen = siph ? 0 : (2.5 + a.wil * 0.08) * (1 + 0.12 * chan) * (drawn ? 2 : 1);   // a siphoner makes none; a Heretic's comes out of her blood (tickClock)
  /* what is in your hands. In wolf form: teeth, as dangerous as the weapon you left behind. A staff is only a stick to anyone without magic. */
  P.wcls = wf ? 'wolf' : !wb ? 'fast' : staff && !magic ? 'med' : wb.cls;
  P.wdmg = wf ? Math.max(13 * lvlScale(L), w ? up(w, w.dmg) * 0.95 : 0) : w ? up(w, w.dmg) : (vamp ? 9 : wolfK ? 7 : 5) * lvlScale(L);
  P.wmat = wf ? 'bite' : !w ? 'steel' : w.uniq === 'whiteoak' ? 'whiteoak' : staff && !magic ? 'wood' : wb.mat;
  /* damage: bonus is additive and counts for blows and shots; pen multiplies everything, spells too */
  const ascP = 1 + S.asc.pow * 0.02, signet = vamp && hasUniq('corvin') ? Math.min(20, Math.max(0, S.day - (F.turned || S.day))) / 100 : 0;
  const bonus = 0.06 * elder + (orig ? 0.2 + 0.08 * om : 0) + 0.04 * fed + (off ? 0.15 + 0.05 * sk('v_ripper') : 0) + signet + mp * (0.1 + 0.06 * moonSk) + rage * (wolfK ? 0.15 : 0.05) + (fury ? 0.2 + 0.1 * sk('l_rage') : 0) + (wf ? 0.2 + 0.15 * mp : ringMoon ? 0.2 : 0);
  const pen = (animal ? 0.9 : 1) * (1 - 0.15 * desic) * (guilt ? 0.7 : 1) * (vervd ? 0.85 : 1) * (wbaned ? 0.8 : 1) * (venom ? 0.9 - 0.25 * clamp(1 - (S.venomUntil - now) / 24, 0, 1) : 1);
  P.meleeM = (1 + a.mig * 0.02 + st.dmg / 100 + 0.06 * sk('h_weapon') + (vamp ? 0.1 + 0.05 * sk('v_pred') : 0) + (wolfK ? (vamp ? 0.04 : 0.05) + (wf ? 0.08 : 0.04) * might : gene ? 0.03 : 0) + (tr ? 0.03 : 0) + bonus) * ascP * pen;
  P.rangedM = (1 + a.fin * 0.02 + st.dmg / 100 + 0.08 * sk('h_marks') + bonus) * ascP * pen;
  P.spellBase = (7 * lvlScale(L) + (staff && magic ? up(w, w.dmg) * 0.7 : 0)) * (1 + a.wil * 0.025 + st.spell / 100 + (magic ? 0.08 * sk('w_attune') + (sk('w_express') ? 0.3 : 0) + (drawn ? 0.06 * chan : 0) + (hundred ? 1 : 0) : 0) + (off ? 0.15 + 0.05 * sk('v_ripper') : 0)) * ascP * pen;
  const favour = magic && !vamp && !sk('w_express') ? sk('w_spirit') : 0;
  P.crit = 5 + a.fin * 0.4 + st.crit + (vamp ? 4 * sk('v_sense') : 0) + (wolfK ? 4 * sk('l_senses') : 0); P.spellCrit = 3 * favour; P.spiritFoc = 3 * favour; P.critMult = 1.6 + st.critd / 100;
  P.as = 1 + a.fin * 0.004 + st.as / 100 + S.asc.swi * 0.01 + (vamp ? 0.08 : 0) + (wf ? 0.1 : 0) + (orig ? 0.05 : 0);
  P.cdr = Math.min(0.6, st.cdr / 100 + S.asc.swi * 0.01); P.def = st.def; P.mit = Math.min(0.75, P.def / (P.def + 60 + 9 * L)); P.ls = st.ls + (vamp ? sk('v_pred') : 0) + (off ? 3 : 0);
  P.spd = (6.4 + (vamp ? 1.3 : wolfK ? 0.5 : 0) + (hyb ? 0.2 : 0) + (wf ? (vamp ? 0.9 : 1.9) : 0) + (orig ? 0.5 : 0)) * (1 + st.spd / 100 + 0.02 * fed + (off ? 0.1 : 0) + 0.03 * om + mp * (0.04 + 0.02 * moonSk) + (fury ? 0.15 : 0)) * (1 - 0.1 * desic) * (venom ? 0.9 : 1) * (wbaned ? 0.8 : 1);
  P.reload = (1 - 0.05 * sk('h_marks')) / (1 + st.as / 200); P.parryWin = 0.2 + 0.035 * sk('h_parry');
  P.xpM = 1 + st.xp / 100; P.goldM = 1 + st.gold / 100 + S.asc.fort * 0.02; P.mf = st.mf + S.asc.fort * 2; P.vsW = st.vsW; P.vsS = st.vsS; P.burn = st.burn; P.thorns = st.thorns;
  P.vsV = st.vsV + (five ? 10 + Math.min(40, Math.floor((F.mark || 0) / 2)) : 0);                                    // the Hunter's Mark
  /* healing. healM scales a vampire's Healing Factor and out-of-combat mending: nothing closes round lodged wood, or under vervain, venom or starvation */
  P.healM = vamp ? (fx.lodged > 0 || vervd || venom || desic ? 0 : animal ? 0.5 : 1) : wbaned ? 0 : 1;
  P.regen = st.regen * (vamp ? P.healM : 1) + (wolfK && !wbaned ? P.maxHp * 0.002 * sk('l_regen') * (wf ? 1.5 : 1) : 0);
  /* for the other files: blood drain rate, starvation stage 0-3, moon 0-1, venom carried by your bite (fraction of the bite per second, 0 = none), shifting cost, rage gain, senses, compel length */
  P.hunger = vamp ? (F.bourbonT > now ? 0.5 : 1) : 0; P.desic = desic; P.moon = mp; P.venom = wolfK && (wf || hyb || ringMoon) ? (sk('l_venom') ? 0.4 + 0.2 * sk('l_venom') : 0.3) : 0;
  P.shiftT = Math.max(0.4, 3 - 0.8 * sk('l_bones')); P.shiftHp = hyb && (F.shifts || 0) >= 100 ? 0 : Math.max(0, 0.12 - 0.03 * sk('l_bones')); P.rageGain = (wolfK || gene) && !tr ? (wolfK ? 1 : 0.5) * (1 + moonPower()) : 0;
  P.senseR = Math.max(vamp && sk('v_sense') ? 60 : 0, wolfK && sk('l_senses') ? 20 + 10 * sk('l_senses') : 0); P.watch = hasUniq('watch') && !vamp; P.compelM = animal ? 0.5 : 1;
  P.power = Math.round((P.wdmg * P.meleeM * (1 + P.crit / 100 * (P.critMult - 1)) * P.as * 3 + P.maxHp / (1 - P.mit) * 0.25 + P.spellBase * 2) / 4);
  if (pl) { pl.hp = Math.min(pl.hp, P.maxHp); pl.sta = Math.min(pl.sta, P.maxSta); pl.foc = Math.min(pl.foc, P.maxFoc); pl.blood = Math.min(pl.blood, P.maxBlood); }
}
const title = () => { let t = TITLES[0][1]; for (const [l, n] of TITLES) if (S.lvl >= l) t = n; return t; };
/* short lines for the HUD: everything this file keeps a clock on */
function sysStatus() {
  const F = S.flags, now = absHours(), h = t => Math.max(1, Math.ceil(t - now)) + 'h', out = [];
  if (S.transition) out.push((S.transition.to === 'hybrid' ? 'In transition: needs the doppelgänger · ' : 'In transition: feed or die · ') + h(S.transition.until));
  if (F.vblood) out.push('Vampire blood ' + Math.ceil(F.vbloodT / 60) + 'h'); if (F.hblood) out.push('Blood of the First ' + Math.ceil(F.hbloodT / 60) + 'h');
  if (S.venomUntil > now) out.push((S.original ? 'Venom fever ' : 'Werewolf venom ') + h(S.venomUntil)); if (S.curseUntil > now) out.push("Hunter's Curse " + h(S.curseUntil)); if (F.lineDeathAt > now) out.push('The line is dying');
  if (pl && pl.wolf) out.push('Wolf'); if (P.desic) out.push(['', 'Starving', 'Weakening', 'Desiccating'][P.desic]); if (S.switchOff) out.push('Humanity off'); if (F.guiltT > now) out.push('Guilt');
  if (isVamp() && S.diet === 'animal') out.push('Animal blood'); if (F.bourbonT > now) out.push('Bourbon'); if (F.vervUntil > now && !isVamp()) out.push('Vervain ' + h(F.vervUntil)); if (F.sageT > now) out.push('Sage smoke'); if (F.hundredT > now) out.push('The Hundred');
  if (sireBound()) out.push('Sired · ' + (F.shifts || 0) + '/100'); if (pl && pl.fx.lodged > 0) out.push('Wood lodged'); if (pl && pl.fx.wolfsbane > 0) out.push('Wolfsbane'); const dr = Object.values(S.eq).find(i => i && i.uniq === 'daylight'); if (dr && dr.despelled) out.push('Ring unspelled');
  return out;
}

/* ---------------- items ---------------- */
function genItem(lvl, o = {}) {
  lvl = Math.max(1, Math.round(lvl)); const roll = Math.random() * 100 / (1 + (P.mf || 0) / 100 + (o.bias || 0)); let rar = o.rar != null ? o.rar : roll < 0.7 ? 4 : roll < 4 ? 3 : roll < 15 ? 2 : roll < 44 ? 1 : 0;
  let base = BASES[o.base] ? o.base : OLDID[o.base]; if (!BASES[base]) { const slot = o.slot || (() => { const r = Math.random(); return r < 0.3 ? 'weapon' : r < 0.42 ? 'ranged' : r < 0.66 ? 'armor' : r < 0.83 ? 'ring' : 'amulet'; })(); const pool = Object.keys(BASES).filter(k => BASES[k].slot === slot && (BASES[k].min || 1) <= lvl + 1); base = pick(pool); }
  const b = BASES[base], m = RAR[rar].m * R(0.95, 1.06), it = { id: UID++, base, slot: b.slot, rar, lvl, up: 0, aff: [] };
  if (b.dmg) it.dmg = b.dmg * lvlScale(lvl) * m; if (b.def) it.def = b.def * (1 + 0.13 * (lvl - 1)) * m; if (b.hp) it.hp = b.hp * (1 + 0.2 * (lvl - 1)) * m; if (b.st) it.st = b.st * (1 + 0.04 * lvl); if (b.fo) it.fo = b.fo * (1 + 0.05 * lvl);
  const pool = AFF.filter(a => a[5].split(' ').includes(b.slot)); let n = RAR[rar].aff + (b.slot === 'ring' || b.slot === 'amulet' ? (rar === 0 ? 1 : 0) : 0);
  while (n-- > 0 && pool.length) { const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; let v = R(a[2], a[3]) + a[4] * lvl; v = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10; it.aff.push([a[0], v]); }
  it.name = itemGenName(it); return it;
}
function itemGenName(it) { const b = BASES[it.base]; let pre = '', suf = ''; for (const [k] of it.aff) { const lab = AFF.find(a => a[0] === k)[1]; if (lab.startsWith('of ')) { if (!suf) suf = ' ' + lab; } else if (!pre) pre = lab + ' '; } return pre + b.n + suf; }
const OLDID = { compass: 'watch', moonstone: 'moonring', elderblood: 'hblood', silverd: 'stiletto', silvers: 'cavalry' };   // ids from before the canon rework, still honoured
function mkUniq(key, lvl) { key = UNIQ[key] ? key : OLDID[key]; if (!UNIQ[key]) { console.warn('unknown relic', key); return genItem(lvl, { rar: 4 }); } const u = UNIQ[key], b = BASES[u.base], it = { id: UID++, base: u.base, slot: b.slot, rar: 5, lvl, up: 0, uniq: key, name: u.n, aff: u.aff.map(a => [a[0], a[1] + (['hp', 'def'].includes(a[0]) ? lvl * 2 : 0)]) }, m = RAR[5].m * (u.mult || 1);
  if (b.dmg) it.dmg = b.dmg * lvlScale(lvl) * m; if (b.def) it.def = b.def * (1 + 0.13 * (lvl - 1)) * m; if (b.hp) it.hp = b.hp * (1 + 0.2 * (lvl - 1)) * m; return it; }
const itemValue = it => Math.round((6 + it.lvl * 3.2) * Math.pow(1.75, Math.min(it.rar, 5)) * (1 + 0.15 * (it.up || 0)));
function itemLines(it) { const b = BASES[it.base], l = []; if (it.dmg) l.push(`${Math.round(up(it, it.dmg))} damage` + (b.slot === 'weapon' ? ` · ${b.cls === 'fast' ? 'fast' : b.cls === 'med' ? 'balanced' : b.cls === 'slow' ? 'heavy' : 'a witch casts with it, anyone else swings it'} · ${it.uniq === 'whiteoak' ? 'white oak' : b.mat}` : ` · ${b.mat} · ${b.cd}s reload`));
  if (it.def) l.push(`${Math.round(up(it, it.def))} armour`); if (it.hp) l.push(`+${Math.round(up(it, it.hp))} health`); if (it.st) l.push(`+${Math.round(up(it, it.st))} stamina`); if (it.fo) l.push(`+${Math.round(up(it, it.fo))} focus`);
  for (const [k, v] of it.aff) if (v) l.push(AFFD[k].replace('{v}', v)); if (it.uniq) l.push(UNIQ[it.uniq].d); if (it.despelled) l.push('The spell has been taken out of it. It is only a stone until the witch who made it relents.'); return l; }
function addItem(it, quiet) { if (S.inv.length >= 60) { toast('Your pack is full.'); return false; } S.inv.push(it); if (!quiet) lootToast(it.name + (it.up ? ' +' + it.up : ''), RAR[it.rar].c); sfx(it.rar >= 3 ? 'rare' : 'loot'); return true; }
function addCons(k, n = 1, quiet) { k = CONS[k] ? k : OLDID[k]; if (!CONS[k]) { console.warn('unknown supply', k); return; } S.cons[k] = (S.cons[k] || 0) + n; if (!quiet) lootToast(CONS[k].n + (n > 1 ? ' ×' + n : ''), '#d8d0c0'); }
function equip(it) {
  const i = S.inv.indexOf(it); if (i < 0) return; if (pl.wolf) { toast('Not with paws.'); sfx('deny'); return; } if (it.lvl > S.lvl + 3) { toast(`You need to be level ${it.lvl - 3} to use that.`); sfx('deny'); return; }
  if (it.uniq === 'vlocket' && isVamp()) { pl.hp = Math.max(1, pl.hp - P.maxHp * 0.1); pl.fx.verv = Math.max(pl.fx.verv || 0, 8); sfx('hurt'); toast('The locket is packed with vervain. It burns through your fingers and you drop it.'); recalc(); return; }
  S.inv.splice(i, 1); const old = S.eq[it.slot]; if (old) S.inv.push(old); S.eq[it.slot] = it; recalc(); refreshGear(); sfx('ui');
  if (it.uniq === 'fring' && (S.origin !== 'human' || S.species !== 'human' || sk('h_five'))) toast('The ring sits on your hand and does nothing. It was made for ordinary people.'); else if (it.uniq === 'moonring' && !isWolf()) toast('Black kyanite. It is waiting for a wolf.');
}
function unequip(slot) { const it = S.eq[slot]; if (!it || S.inv.length >= 60) return; if (pl.wolf) { toast('Not with paws.'); sfx('deny'); return; } S.eq[slot] = null; S.inv.push(it); recalc(); refreshGear(); sfx('ui'); }
function salvage(it) { const i = S.inv.indexOf(it); if (i < 0) return; if (isBound(it)) { sfx('deny'); return toast('It is bound to you. It cannot be sold or broken down.'); } S.inv.splice(i, 1); const n = 1 + it.rar * 2 + Math.floor(it.lvl / 8); addCons('scrap', n, true); toast(`Salvaged for ${n} scrap.`); sfx('ui'); }
const upCost = it => ({ gold: Math.round(18 * it.lvl * Math.pow((it.up || 0) + 1, 1.5)), scrap: 2 + (it.up || 0) * 2 });
function upgrade(it) { const c = upCost(it); if ((it.up || 0) >= 10) return toast('It cannot be improved further.'); if (S.gold < c.gold || (S.cons.scrap || 0) < c.scrap) { sfx('deny'); return toast('Not enough gold or scrap.'); } S.gold -= c.gold; S.cons.scrap -= c.scrap; it.up = (it.up || 0) + 1; recalc(); sfx('parry'); toast(`${it.name} is now +${it.up}.`); }
/* the witch who spelled a daylight ring can take the spell back out, and put it back */
function despellRing(on) { const r = Object.values(S.eq).concat(S.inv).find(i => i && i.uniq === 'daylight'); if (!r || !!r.despelled === !!on) return false; r.despelled = !!on; recalc(); sfx(on ? 'deny' : 'magic'); toast(on ? 'The ring goes cold on your hand. It is only a stone now. The sun will burn you.' : 'The ring is warm again. The sun is yours.'); return true; }
/* the one irreversible sip: ask first */
function askTurn(k, line) { if (RT.menu) closeMenu(); say([['', line]], [['Drink it.', () => { if (!(S.cons[k] > 0) || !S.transition) return; S.cons[k]--; completeTransition(); }], ['Not yet.', () => { }]]); return true; }
function useCons(k) {
  if (!(S.cons[k] > 0) || !CONS[k] || !pl || pl.dead) return false; if (pl.wolf) { toast('Not with paws.'); return false; }
  const vamp = isVamp(), tr = S.transition, herb = 1 + 0.15 * (canMagic() ? sk('w_herb') : 0), scald = (f, line) => { pl.hp = Math.max(1, pl.hp - P.maxHp * 0.1); pl.fx[f] = Math.max(pl.fx[f] || 0, 8); sfx('hurt'); toast(line); recalc(); };
  switch (k) {
    case 'draught': if (pl.hp >= P.maxHp || pl.healCd > 0) return false; if (vamp && pl.fx.lodged > 0) { toast('Nothing closes while the wood is still in you. Pull it out first.'); return false; } heal(P.maxHp * 0.4 * herb); pl.healCd = 6; sfx('heal'); break;
    case 'tonic': if (S.origin === 'siphoner') { toast('There is nothing in you for it to wake. You have to take magic from something that has it.'); return false; } if (pl.foc >= P.maxFoc) return false; pl.foc = Math.min(P.maxFoc, pl.foc + P.maxFoc * 0.6 * herb); sfx('heal'); break;
    case 'bloodbag':
      if (tr) { if (tr.to === 'hybrid') { sfx('bite'); toast("You drink it and nothing changes. Only the doppelgänger's blood will finish this."); break; } return askTurn(k, 'Human blood. Drink it and you are a vampire, for good: the sun, the hunger, all of it. Leave it and the day runs out, and you die the ordinary way.'); }
      if (!vamp) { toast('You could not stomach that. Not yet.'); return false; } pl.blood = Math.min(P.maxBlood, pl.blood + 50); S.diet = 'human'; pl.dryT = 0; heal(P.maxHp * 0.25); pl.healCd = 4; sfx('bite'); recalc(); break;
    case 'burger': sfx('ui'); if (vamp) { toast('It is fine. It is just not what you want.'); break; } pl.buff.burger = 60; toast('Marnie makes a good burger.'); break;
    case 'bourbon': sfx('ui'); if (vamp) { S.flags.bourbonT = absHours() + 3; toast('It takes the edge off. For a while you can think about something other than throats.'); recalc(); } else toast(tr ? 'It dulls the ache in your gums. Not for long.' : 'It burns going down, and that is all it does.'); break;
    case 'coffee': if (vamp) { scald('verv', 'Vervain. It burns all the way down and leaves you weak.'); break; } S.flags.vervUntil = absHours() + 24; sfx('ui'); toast('Bitter as weeds. Nobody gets inside your head for a day.'); codex('vervain'); break;
    case 'vervain': if (vamp) { scald('verv', 'It burns your hand to the bone.'); break; } pl.buff.coatV = 90; sfx('magic'); toast('Your weapon is slick with vervain.'); break;
    case 'wolfsbane': if (isWolf()) { scald('wolfsbane', 'It blisters your fingers. Wolfsbane knows what you are.'); break; } pl.buff.coatW = 90; sfx('magic'); toast('Your weapon is dusted with wolfsbane.'); break;
    case 'sage': S.flags.sageT = absHours() + 20 * herb / 60; pl.buff.cloak = Math.max(pl.buff.cloak || 0, 20 * herb); for (const e of actors) if (e.kind === 'enemy' && e.ai && e.ai.aggro && !e.def.boss && !e.ai.cur) e.ai.aggro = false; sfx('magic'); toast('The smoke closes round you. Nothing can overhear you or follow you through it.'); break;
    case 'vblood':
      if (vamp) { toast("Another vampire's blood does nothing for you."); return false; } if (tr) { toast('More of that will not help. It has to be human blood now.'); return false; } heal(P.maxHp); sfx('bite');
      if (S.flags.cured) toast('It mends you, and that is all it will ever do. The Cure does not let go.'); else if (S.species === 'werewolf') toast('It mends you. Ordinary vampire blood cannot turn a werewolf, whatever happens tonight.');
      else { S.flags.vblood = 1; S.flags.vbloodT = 1440; toast('It mends everything, and it stays in you until this time tomorrow. Die before then and you will wake in transition.'); diary('vblood'); codex('vblood'); } break;
    case 'hblood': {
      if (tr) { toast('More of that will not help now.'); return false; } const bitten = S.venomUntil > 0; heal(P.maxHp); sfx('bite'); if (bitten) cureVenom('blood');
      if (vamp) { pl.blood = P.maxBlood; pl.dryT = 0; if (!bitten) toast('A thousand years in a mouthful. It heals you, and it can do nothing else for the dead.'); }
      else if (S.flags.cured) toast('It mends you, and that is all it will ever do. The Cure does not let go.');
      else { S.flags.hblood = 1; S.flags.hbloodT = 1440; toast(S.species === 'werewolf' ? "It mends everything. For a day, a wolf who dies with this in them does not stay dead: they wake needing the doppelgänger's blood." : 'It mends everything. Do not die before this time tomorrow unless you mean it.'); diary('hblood'); codex('hblood'); }
      S.cons[k]--; recalc(); qEvent('use', k); if (!(S.cons.hblood > 0) && !S.flags.bloodTo) { S.flags.bloodTo = 'self'; qEvent('flag', 'blood'); } return true; }
    case 'dblood': if (tr && tr.to === 'hybrid') return askTurn(k, "Elise Gilroy's blood. Drink it and you are a hybrid: wolf and vampire both, and sired to Corvin until you break it. There is no going back."); return false;
    case 'cure': if (tr) { toast('There is nothing to cure yet. You are not one of them until you feed.'); return false; } if (!vamp) { toast('It would do nothing to you. It is for the dead.'); return false; } if (RT.menu) closeMenu();
      say([['', `The Cure. One dose. Drink it and you are ${isHybrid() ? 'a werewolf again, and only that' : 'human again'}, for good: everything the dead can do goes with it, and no blood will ever turn you after this.`]], [['Drink it.', () => { if (!(S.cons.cure > 0) || !isVamp() || RT.blk) return; S.cons.cure--; cureVampire(); }], ['Not yet.', () => { }]]); return true;
    default: return false;
  } S.cons[k]--; qEvent('use', k); return true;
}
function quickHeal() { if (pl.wolf) { sfx('deny'); return toast('Not with paws. The wolf heals in its own time.'); } if (isVamp() && S.cons.bloodbag > 0 && (pl.blood < P.maxBlood * 0.5 || !(S.cons.draught > 0))) { if (useCons('bloodbag')) return; } if (!useCons('draught')) { if (!(S.cons.draught > 0)) toast('No healing draughts left.'); sfx('deny'); } }

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
  if (chance(o.boss ? 1 : 0.16)) { const k = chance(0.5) ? 'draught' : isVamp() && (!o.fam || o.fam === 'human' || o.fam === 'witch') ? 'bloodbag' : pick(['tonic', 'vervain', 'wolfsbane', 'sage', 'scrap', 'scrap']); mkDrop(x, z, 'cons', [k, k === 'scrap' ? RI(1, 3) : 1], 0xd8d0c0); }
}
function updDrops(dt) {
  for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.t += dt; d.m.position.y = 0.25 + Math.sin(d.t * 3) * 0.1; d.m.rotation.y += dt * 1.5; const dist = hyp(d.x - pl.x, d.z - pl.z);
    if (dist < 3.2 && d.t > 0.4 && !pl.dead) { const a = Math.atan2(pl.x - d.x, pl.z - d.z); d.x += Math.sin(a) * dt * 9; d.z += Math.cos(a) * dt * 9; d.g.position.set(d.x, 0, d.z); }
    if (dist < 1.1 && d.t > 0.4 && !pl.dead) { let ok = true; if (d.kind === 'gold') { S.gold += d.v; sfx('coin'); floatText(pl.x, 2.4, pl.z, '+' + d.v + ' gold', '#ffd060', 13); } else if (d.kind === 'cons') { addCons(d.v[0], d.v[1]); sfx('loot'); } else ok = addItem(d.v); if (ok) { d.g.parent && d.g.parent.remove(d.g); drops.splice(i, 1); } else d.t = -3; } }
}

/* ---------------- levelling ---------------- */
function gainXp(n) {
  S.xp += n * P.xpM; let up_ = false; while (S.xp >= xpNeed(S.lvl)) { S.xp -= xpNeed(S.lvl); S.lvl++; S.ap += 3; S.sp += 1; up_ = true; }
  if (up_) { recalc(); pl.hp = P.maxHp; pl.sta = P.maxSta; if (S.origin !== 'siphoner') pl.foc = P.maxFoc; sfx('level'); banner('LEVEL ' + S.lvl, title() + ' · 3 attribute points, 1 skill point'); ringFx(pl.x, pl.z, 0xffd070, 8, 0.9); puff(pl.x, 1, pl.z, 40, { c: HOLY, add: 1, sp: 3, up: 5, life: 1, size: 0.25, grav: 2 }); RT.flashV = 0.2; qEvent('level', S.lvl); }
}
function canLearn(id) { const d = SK[id]; return !!d && treeOpen(d.tree) && sk(id) < d.max && treePts(d.tree) >= d.req && (!d.ok || d.ok()); }
function learn(id) { const d = SK[id], r = sk(id); if (S.sp < 1 || !canLearn(id)) { sfx('deny'); if (d && d.ok && !d.ok() && treeOpen(d.tree)) toast(d.okD); return; } S.sp--; S.skills[id] = r + 1; if (d.act && r === 0) { const i = S.bar.indexOf(null); if (i >= 0 && !S.bar.includes(id)) S.bar[i] = id; } recalc(); sfx('quest'); }
function refundTree(t) { let n = 0; for (const k in S.skills) if (!SK[k] || SK[k].tree === t) { n += S.skills[k]; delete S.skills[k]; } S.bar = S.bar.map(b => b && SK[b] && SK[b].tree !== t ? b : null); S.sp += n; return n; }

/* ---------------- becoming something else ----------------
   Nothing here happens to the player by accident: the curse wakes only through triggerCurse (a deliberate killing), a transition starts only after they drank the blood,
   and it completes only when they choose to feed. Letting it lapse puts the story back to the hour before they died. */
function blackout(lines, fn, hold = 2600) { if (RT.menu) closeMenu(); RT.blk = true; const b = $('black'); b.innerHTML = ''; lines.forEach(l => b.appendChild(el('p', '', l))); b.classList.add('on'); setTimeout(() => { fn && fn(); b.classList.remove('on'); RT.blk = false; }, hold + lines.length * 900); }
function keepSnap(key) { const j = snapshot(); (RT.snaps = RT.snaps || {})[key] = j; try { localStorage.setItem(key, j); } catch (e) { } }
function hasSnap(key) { if (RT.snaps && RT.snaps[key]) return true; try { return !!localStorage.getItem(key); } catch (e) { return false; } }
function dropSnap(key) { if (RT.snaps) delete RT.snaps[key]; try { localStorage.removeItem(key); } catch (e) { } }
function standUp() { pl.dead = false; pl.deadT = 0; pl.fx = {}; pl.act = null; pl.sw = null; pl.block = false; pl.feed = null; pl.kx = pl.kz = 0; pl.dryT = 0; pl.rig.g.rotation.set(0, 0, 0); }
/* put the saved hour back (a true death). Returns false if there is nothing to go back to. */
function rewind(key, note) {
  let o = null; try { o = JSON.parse(localStorage.getItem(key)); } catch (e) { } if (!o && RT.snaps && RT.snaps[key]) try { o = JSON.parse(RT.snaps[key]); } catch (e) { } if (!o) return false; const deaths = S.stats.deaths + 1; if (!applySave(o)) return false; dropSnap(key);
  S.flags.vblood = S.flags.vbloodT = S.flags.hblood = S.flags.hbloodT = S.flags.lineDeathAt = 0; S.transition = null; S.stats.deaths = deaths; standUp(); shiftForm(false); skipTo(8);
  recalc(); refreshGear(); pl.hp = P.maxHp; pl.sta = P.maxSta; pl.foc = Math.min(S.foc, P.maxFoc); pl.blood = Math.min(S.blood, P.maxBlood); enterArea('world', S.area === 'tomb' ? { x: -130, z: -164 } : HOME); RT.paused = false; save(); if (note) toast(note); return true;
}
/* the werewolf curse: inherited, and woken by taking a human life. Called by the deliberate finishing blow, never by an accident. */
function triggerCurse() {
  if (S.origin !== 'wolf' || S.species !== 'human' || S.transition) return false; S.species = 'werewolf'; S.flags.triggered = S.day; S.sp += 2; if (pl) pl.rage = 100; recalc(); sfx('howl'); RT.flashV = 0.3;
  banner('The curse wakes', 'The Werewolf tree is open'); toast(`You took a life, and something in your blood has been waiting for that. ${fullTonight() ? 'The moon is full tonight.' : 'On the next full moon you will change, whether you want to or not.'}`);
  setTimeout(() => toast('Two skill points. A moonlight ring, or chains in the Lockwood cellar, are the only say you get.'), 5400); diary('triggered'); codex('werewolf'); qEvent('triggered'); save(); return true;
}
/* dying with vampire blood in you: wake in transition, after dark, with a day to decide. to: 'vampire' | 'hybrid'. how: 'vblood' | 'hblood' | 'ambrose' | anything the story likes. */
function beginTransition(to, how) {
  to = to === 'hybrid' ? 'hybrid' : 'vampire'; if (!pl || RT.blk || S.transition || isVamp()) return false;
  if (S.flags.cured) { toast('The Cure is in you. Vampire blood will never take again.'); return false; }
  if (to === 'hybrid' ? S.species !== 'werewolf' : S.species !== 'human') { toast(to === 'hybrid' ? 'Only a wolf whose curse has woken can become a hybrid.' : 'Ordinary vampire blood cannot turn a werewolf. It would take the blood of the First.'); return false; }
  keepSnap('hollowmoon.preturn'); pl.dead = true; pl.hp = 1; pl.act = null; pl.block = false; if (pl.feed) endFeed(true); sfx('turn');
  const first = how === 'ambrose' ? ['His wrist against your mouth. Copper and old wine.', 'Then his hands, either side of your jaw.'] : to === 'hybrid' ? ['The blood of the First will not let the wolf stay dead.', 'It is quiet for a while.'] : ['The blood in your veins will not let you stay dead.', 'It is quiet for a while.'];
  blackout(first.concat(to === 'hybrid' ? 'You wake after dark. Your gums ache, your eyes are wet, and the wolf in you is pacing.' : 'You wake after dark. Your gums ache. The lamp hurts. There is a heartbeat two rooms down and you can hear it.'), () => {
    S.flags.vblood = S.flags.vbloodT = S.flags.hblood = S.flags.hbloodT = 0; shiftForm(false); if (!(S.clock >= 20.5 || S.clock < 4)) skipTo(20.6);
    S.transition = { to, until: absHours() + 24, sire: 'corvin' }; S.exposure = 0; standUp(); enterArea('world', HOME); recalc(); pl.hp = P.maxHp * 0.6; diary('transition'); codex('transition'); qEvent('transition', to);
    toast(to === 'hybrid' ? "You are in transition. Only the doppelgänger's blood will finish it, and ordinary blood will not. You have until this time tomorrow." : 'You are in transition. Drink human blood before this time tomorrow and you become a vampire. Do nothing and you die, the ordinary way. Either is allowed.');
    setTimeout(() => toast(to === 'hybrid' ? 'You are not a hybrid yet. The sun only stings.' : 'You are not a vampire yet: no speed, no thirst you cannot refuse, and the sun only hurts your eyes.'), 5400); save();
  });
  return true;
}
const turnVampire = how => beginTransition('vampire', how);   // old name, kept for callers
/* the first human blood (or, for a hybrid, the doppelgänger's): the change is finished and cannot be undone except by the Cure */
function completeTransition() {
  const t = S.transition; if (!t || !pl) return false; const hyb = t.to === 'hybrid'; S.species = t.to; S.sire = t.sire || 'corvin'; S.unlinked = !!(S.flags.slain && S.flags.slain[S.sire]); S.transition = null; S.flags.turned = S.day; S.diet = 'human'; S.exposure = 0; S.switchOff = false; dropSnap('hollowmoon.preturn');
  const lost = S.origin === 'witch' ? refundTree('witch') : 0; if (S.origin === 'siphoner') S.heretic = true; if (S.skills.h_five) { S.sp += S.skills.h_five; delete S.skills.h_five; } S.flags.mark = 0; S.sp += 2;
  const lk = S.eq.amulet; if (lk && lk.uniq === 'vlocket') { S.eq.amulet = null; S.inv.push(lk); setTimeout(() => toast("Elspeth's locket burns your throat. You tear it off."), 2600); }
  recalc(); pl.hp = P.maxHp; pl.blood = Math.max(pl.blood || 0, 40); pl.dryT = 0; refreshGear(); sfx('turn'); RT.flashV = 0.35; banner(hyb ? 'Hybrid' : S.heretic ? 'Heretic' : 'Vampire', hyb ? 'Wolf and vampire both' : 'The Vampire tree is open');
  toast(hyb ? 'It is done. You are a hybrid: the sun cannot touch you, you change when you choose, and your bite is venom. You owe Corvin for it, and you will feel that.' : 'It is done. You are a vampire. Until a witch makes you a daylight ring, the sun will kill you.');
  if (lost) setTimeout(() => toast(`The magic has gone out of you for good. ${lost} skill points returned.`), 5400); else if (S.heretic) setTimeout(() => toast('You still siphon. Your spells now feed on your own blood.'), 5400);
  setTimeout(() => toast(hyb ? 'Vervain and wolfsbane both burn you now. A hundred willing changes break the sire bond.' : 'Two skill points. Sleep through the day at the boarding house, if Mrs. Pruitt asks you in.'), 10800);
  diary(hyb ? 'hybrid' : 'turned'); codex(hyb ? 'hybrid' : S.heretic ? 'heretic' : 'vampire'); qEvent('turned', t.to); save(); return true;
}
/* the day ran out, or they were killed again before feeding: a real death. The story goes back to the hour before they died. */
function failTransition(why) {
  const t = S.transition; if (!t || RT.blk || !pl) return false; pl.dead = true; pl.hp = 1; sfx('die');
  blackout(why === 'killed' ? ['You had not finished coming back.', 'This time nothing in your blood argues.'] : t.to === 'hybrid' ? ['Your eyes are bleeding. You cannot stop shaking.', 'Without her blood this was always how it ended.'] : ['The day runs out.', 'You did not feed. You knew what that meant.', 'It is an ordinary death, and it is yours.'], () => {
    if (rewind('hollowmoon.preturn', 'That road is closed. The story has gone back to the hour before you died.')) return;
    S.transition = null; S.stats.deaths++; standUp(); skipTo(8); recalc(); pl.hp = P.maxHp; enterArea('world', HOME); save(); toast('You let it pass. Morning finds you alive, and nobody can tell you how.');
  });
  return true;
}
/* the spell that made the first family: story only. A wolf whose curse has woken becomes the Original hybrid's kind; anyone else an Original vampire. */
function becomeOriginal() {
  if (S.original || S.flags.cured || !pl) return false; const was = S.species; S.original = true; S.transition = null; dropSnap('hollowmoon.preturn'); if (was === 'human') S.species = 'vampire'; else if (was === 'werewolf') S.species = 'hybrid';
  if (!isVamp()) { S.original = false; return false; } S.sire = null; S.unlinked = true; S.flags.lineDeathAt = 0; S.venomUntil = 0; if (!S.flags.turned) S.flags.turned = S.day; S.diet = 'human';
  if (was === 'human' || was === 'werewolf') { if (S.origin === 'witch') refundTree('witch'); if (S.origin === 'siphoner') S.heretic = true; if (S.skills.h_five) { S.sp += S.skills.h_five; delete S.skills.h_five; } S.flags.mark = 0; }
  S.sp += 2; recalc(); pl.hp = P.maxHp; pl.blood = P.maxBlood; refreshGear(); sfx('turn'); RT.flashV = 0.4; banner('Original', 'The first of a new line'); toast('Nothing but white oak can end you now. Wood, fire and a broken neck only put you down for a while. The sun and vervain still burn.'); diary('original'); codex('original'); qEvent('original'); save(); return true;
}
/* the Cure: human again for good (a hybrid goes back to the wolf it was). Whoever takes it can never be turned again. */
function cureVampire() {
  if (!isVamp()) return false;
  blackout(['It tastes of nothing at all.', 'Then everything hurts, the ordinary way.', 'The sun comes through the window and you let it.'], () => {
    const wolf = S.species === 'hybrid'; S.species = wolf ? 'werewolf' : 'human'; S.heretic = false; S.original = false; S.transition = null; S.sire = null; S.unlinked = false; S.switchOff = false; S.venomUntil = 0; S.curseUntil = 0; S.diet = 'human'; S.flags.cured = 1; S.flags.lineDeathAt = 0; S.flags.guiltT = 0;
    const back = refundTree('vampire') + refundTree('original'); S.humanity = 100; S.exposure = 0; if (pl.dryT) pl.dryT = 0; recalc(); pl.hp = P.maxHp; refreshGear(); diary('cured'); codex('cure');
    toast(`You are ${wolf ? 'a werewolf again, and only that' : 'human again'}. ${back} skill points returned. No blood will ever turn you now.`); if (canMagic()) setTimeout(() => toast('The craft has come back with your pulse.'), 5400); qEvent('cured'); save();
  });
  return true;
}
/* Odette's unlinking: the player's life no longer hangs on Corvin's */
function unlinkSire() { if (!isVamp() || S.unlinked) return false; S.unlinked = true; S.flags.lineDeathAt = 0; sfx('magic'); toast('Something that has been pulled tight in you since you turned goes slack. Your life is your own. Corvin can die without you.'); codex('sireline'); save(); return true; }
/* an Original has truly died (white oak): everything of the line has about an hour. Returns true if that includes the player. */
function lineDeath() { if (!lineLinked()) return false; S.flags.lineDeathAt = absHours() + 1; toast('Corvin is dead, and you are of his line. You have about an hour. The Cure, or an unlinking, are the only ways out of it.'); codex('sireline'); return true; }
/* werewolf venom: slow death to a vampire, a fever to an Original, nothing to a hybrid or the living. One game day. Only the Blood of the First (or a Heretic's siphoning) lifts it. */
function envenom(src) {
  if (!isVamp() || isHybrid() || !pl || pl.dead || S.venomUntil > absHours()) return false; S.venomUntil = absHours() + (S.original ? 4 : 24); recalc(); sfx('hurt'); floatText(pl.x, 3, pl.z, 'WEREWOLF VENOM', '#c8e060', 16);
  toast(S.original ? 'A werewolf bite. It cannot kill you. It can give you four hours of fever.' : "A werewolf bite. It will kill you by this time tomorrow. Only Corvin's blood can stop it."); diary('venom'); codex('venom'); qEvent('venom'); return true;
}
function cureVenom(how) { if (!S.venomUntil) return false; S.venomUntil = 0; recalc(); if (how !== 'quiet') toast(how === 'siphon' ? 'You pull the venom out through your own skin, as magic. The fever breaks.' : how === 'passed' ? 'The fever breaks. The venom has run its course.' : 'The bite closes. The fever breaks.'); qEvent('venomCured'); return true; }
/* a vampire who kills one of the Five is haunted for a day (the phantoms themselves are the spawner's: 30-actors). Safe to call twice for one kill. */
function hunterCurse() { if (!isVamp() || !pl || S.curseUntil > absHours() + 23.9) return false; S.curseUntil = absHours() + 24; sfx('magic'); toast('You killed one of the Five. He is not going to leave you alone. A day of this, until another hunter takes up the mark.'); diary('curse'); codex('curse'); qEvent('cursed'); return true; }
/* the humanity switch: a state, not a spell. force: true = off, false = on, omitted = toggle. */
function flipSwitch(force) {
  if (!isVamp()) return false; const off = force == null ? !S.switchOff : !!force; if (off === !!S.switchOff) return false; S.switchOff = off; sfx('turn'); RT.flashV = 0.15;
  if (off) { S.flags.offKills = 0; if (pl) floatText(pl.x, 2.8, pl.z, 'IT IS OFF', '#ff5060', 18); toast('You turn it off. Nothing they do matters, and nothing you do either.'); codex('switch'); }
  else { const n = S.flags.offKills || 0, secs = Math.min(120, 20 + 5 * n); S.flags.guiltT = absHours() + secs / 60; toast(n ? `It comes back all at once. ${n} of them, and every face.` : 'It comes back all at once.'); diary('switch'); }
  recalc(); return true;
}
/* starved to nothing: not death. Someone finds you; a day goes by. */
function desiccate() {
  if (RT.blk || !pl || pl.dead) return; sfx('die');
  blackout(['The hunger stops hurting. That is the bad sign.', 'Your hands have gone grey. They will not close.', 'Someone lifts you. It is a day before you can open your eyes.'], () => { const t0 = absHours(); skipTo(20.6); if (absHours() - t0 < 12) newDay(); standUp(); shiftForm(false); enterArea('world', { x: 236, z: -47 }); recalc(); pl.blood = 35; pl.hp = P.maxHp * 0.5; S.exposure = Math.max(0, S.exposure - 20); codex('desiccation'); save(); toast("Ambrose found you. Gault fed you from a bag, a spoonful at a time. Do not let it get that far again."); });
}
/* the Lockwood cellar: a triggered werewolf who chains up before moonrise spends the night there and hurts nobody */
function chainUp() {
  if (S.species !== 'werewolf') return toast(isHybrid() ? 'You choose when you change. The chains are for those who cannot.' : 'Old chains, bolted into the stone. They are not for you.');
  if (pl.wolf) return toast('Too late for chains. You have no hands.'); if (!fullTonight()) return toast('The moon is not full tonight. You do not need these.'); if (hasUniq('moonring')) return toast('The ring keeps the moon off you. You do not need these.');
  blackout(['You lock the chains and throw the key where hands can reach it and paws cannot.', 'Every bone. Then nothing you will remember.', 'Morning. The door is scored from the inside. Nobody is dead.'], () => { S.flags.chained = S.day; skipTo(6.6); shiftForm(false); S.flags.chained = S.day; S.flags.moons = (S.flags.moons || 0) + 1; standUp(); recalc(); pl.hp = P.maxHp * 0.7; pl.sta = P.maxSta; qEvent('chained'); save(); }, 900);
}
/* a living witch at the Hollow altar may borrow the Hundred: double spell power for 40 seconds, paid for in blood from the nose */
function channelHundred() {
  if (!canMagic() || isVamp()) { toast('The dead witches of this place have nothing to say to you.'); return false; } if (!inHollow() || S.flags.hundredT > absHours()) return false; S.flags.hundredT = absHours() + 40 / 60; if (S.origin === 'siphoner') pl.foc = P.maxFoc; recalc(); sfx('magic'); RT.flashV = 0.25;
  toast('A hundred dead witches lean on you at once. Your spells hit twice as hard. Your nose is already bleeding.'); codex('hundred'); return true;
}

/* ---------------- quests ---------------- */
function startQuest(id) { if (S.quests[id] || S.done[id] || !QUESTS[id]) return; S.quests[id] = { step: 0, n: 0 }; sfx('quest'); banner(QUESTS[id].n, 'New quest'); const s = QUESTS[id].steps[0]; if (s.on) s.on(); checkHave(); }
function advQuest(id) {
  const q = QUESTS[id], st = S.quests[id]; st.step++; st.n = 0;
  if (st.step >= q.steps.length) { delete S.quests[id]; S.done[id] = 1; const r = q.rew || {}; if (r.xp) gainXp(r.xp * (1 + S.lvl * 0.12)); if (r.gold) { S.gold += r.gold; } if (r.sp) S.sp += r.sp; if (r.item) addItem(r.item()); if (r.cons) for (const k in r.cons) addCons(k, r.cons[k]);
    sfx('level'); banner(q.n, 'Quest complete' + (r.gold ? ` · ${r.gold} gold` : '') + (r.sp ? ` · ${r.sp} skill point${r.sp > 1 ? 's' : ''}` : '')); if (q.end) q.end(); if (q.next) [].concat(q.next).forEach(n => startQuest(n)); save(); }
  else { sfx('quest'); const s = q.steps[st.step]; toast('Quest updated: ' + s.d); if (s.on) s.on(); checkHave(); }
}
/* what the species rules need to know about an event before the story hears it */
function sysEvent(type, a) {
  if (type === 'kill' && a && !a.phantom) { const fam = a.fam, dead = fam === 'vampire' || fam === 'hybrid' || fam === 'original';
    if (dead && sk('h_five') && S.species === 'human') { S.flags.mark = (S.flags.mark || 0) + 1; if (S.flags.mark % 10 === 0) toast(`The mark has grown. ${S.flags.mark} of them.`); }
    if (a.def && a.def.five && isVamp()) hunterCurse(); if (S.switchOff && !dead && fam !== 'spirit' && fam !== 'animal') S.flags.offKills = (S.flags.offKills || 0) + 1;
    if ((fam === 'human' || fam === 'witch') && a.mercyKill) triggerCurse(); }
  else if (type === 'shift' && isWolf()) { const n = S.flags.shifts = (S.flags.shifts || 0) + 1; if (isHybrid() && S.sire === 'corvin' && !S.original) { if (n === 100) { toast('A hundred times you have broken every bone on purpose. It no longer hurts, and you owe him nothing. The sire bond is gone.'); banner('Unsired', 'You can raise a hand to Corvin'); diary('unsired'); codex('sirebond'); recalc(); } else if (n % 25 === 0) toast(`${n} changes. The bond is thinner than it was.`); } }
}
function qEvent(type, a, b) {
  sysEvent(type, a);
  for (const id in S.quests) { const st = S.quests[id], s = QUESTS[id].steps[st.step]; if (!s || s.t !== type) continue; let ok = false;
    if (type === 'kill') ok = (!s.type || [].concat(s.type).includes(a.type)) && (!s.fam || [].concat(s.fam).includes(a.fam)) && (!s.tag || s.tag === a.tag) && (!s.night || isNight()) && (!s.zone || zoneAt(a.x, a.z).id === s.zone) && (!s.tomb || RT.area.id === 'tomb');
    else if (type === 'talk' || type === 'reach' || type === 'flag') ok = s.id === a; else if (type === 'gather') { if (s.item === a) { st.n += (b || 1) - 1; ok = true; } } else if (type === 'floor') { if (a >= s.n) { st.n = s.n; ok = true; } else continue; } else if (type === 'level') { if (a >= s.n) { st.n = s.n; ok = true; } else continue; } else if (type === 'use') ok = !s.item || s.item === a; else ok = true;
    if (ok) { st.n++; if (st.n >= (type === 'floor' || type === 'level' ? s.n : s.n || 1)) advQuest(id); } }
  for (const bq of S.bounties) { if (!bq.acc || bq.done) continue; if (type === 'kill' && ((bq.k === 'kill' && a.type === bq.type) || (bq.k === 'elite' && a.tag === bq.id))) { bq.prog++; if (bq.prog >= bq.n) { bq.done = true; toast('Bounty fulfilled. Collect at the board.'); sfx('quest'); } } else if (type === 'floor' && bq.k === 'floor' && a >= bq.n) { bq.prog = bq.n; bq.done = true; toast('Bounty fulfilled. Collect at the board.'); } }
  storyEvent(type, a, b);
}
function checkHave() { for (const id in S.quests) { const st = S.quests[id], s = QUESTS[id].steps[st.step]; if (s && s.t === 'have' && (S.cons[s.item] || 0) >= (s.n || 1)) advQuest(id); } }
const qAt = (id, step) => S.quests[id] && (step == null || S.quests[id].step === step);
function qTarget(s) { if (s.at) return s.at; if (s.t === 'talk') { const n = NPCS.find(n => n.id === s.id); if (n) { const act = actors.find(a => a.npc && a.npc.id === s.id); return act ? act : { x: n.x, z: n.z }; } } if (s.t === 'reach') { const p = POI.find(p => p.id === s.id); if (p) return p; } return null; }
/* which enemy types may be about in a zone right now: no vampire by day (the tables see to that), the whole pack turned on the full moon, nothing that does not exist yet */
const typeOk = t => { const d = EN[t]; return !!d && (!d.full || (fullMoon() && isNight())) && (!d.need || !!S.flags[d.need]) && !lineDead(d); };
function spawnTable(z) { const night = isNight(), t = night ? (fullMoon() && z.full ? z.full : z.night) : z.day; return (t || []).filter(typeOk); }
const plural = t => EN[t].pl || EN[t].n + 's';
function genBounties() {
  if (S.bountyDay === S.day && S.bounties.length) return; S.bountyDay = S.day; S.bounties = S.bounties.filter(b => b.acc && !b.paid); const L = S.lvl;
  /* the Council pays for monsters: nothing peaceful, nobody who leaves ordinary people alone (the pack, its own hunters), nothing that only exists under a full moon */
  const fair = z => (z.night || []).concat(z.day || []).filter(t => { const d = EN[t]; return !d.peaceful && !d.onlyVs && !d.full && (!d.need || S.flags[d.need]) && !lineDead(d); }), zs = ZONES.filter(z => !z.safe && z.night && z.lvl <= L + 6 && fair(z).length); let guard = 0;
  while (zs.length && S.bounties.length < 4 && guard++ < 30) { const k = chance(0.5) ? 'kill' : chance(0.6) ? 'elite' : 'floor', z = pick(zs), type = pick(fair(z)), id = 'b' + S.day + '_' + guard, lv = Math.max(z.lvl, Math.round(L * 0.9));
    if (k === 'floor' && S.deepest < 1 && !S.done.q_tomb) continue; const n = k === 'kill' ? RI(5, 9) : k === 'floor' ? S.deepest + RI(1, 2) : 1, mult = k === 'kill' ? 1 : k === 'elite' ? 1.6 : 1.4, dark = EN[type].fam === 'vampire';
    S.bounties.push({ id, k, type, zone: z.id, zn: z.n, n, prog: 0, acc: false, done: false, lvl: lv, gold: Math.round((24 + L * 11) * mult), xp: Math.round(xpNeed(L) * 0.14 * mult),
      text: k === 'kill' ? `Put down ${n} ${plural(type)}. They have been seen around ${z.n}${dark ? ' after dark. Wood through the heart, or fire, or they get back up' : ''}.` : k === 'elite' ? `Something worse than usual is loose at ${z.n}${dark ? ', after dark' : ''}. End it.` : `The Council wants eyes on floor ${n} of the Tomb. Clear it.`, title: k === 'kill' ? `Cull: ${plural(type)}` : k === 'elite' ? `Hunt at ${z.n}` : `Survey: floor ${n}` }); }
}
function acceptBounty(b) { b.acc = true; sfx('quest'); if (b.k === 'elite') b.spawn = true; toast('Bounty accepted: ' + b.title); }
function payBounty(b) { b.paid = true; S.gold += b.gold; gainXp(b.xp); sfx('coin'); if (b.k !== 'kill') dropLoot(pl.x, pl.z, S.lvl, { n: 1, bias: 1 }); S.bounties = S.bounties.filter(x => x !== b); toast(`Bounty paid: ${b.gold} gold.`); S.flags.bounties = (S.flags.bounties || 0) + 1; }

/* ---------------- vendors ---------------- */
const VEND = { odette: { n: 'Thorne Apothecary', cons: ['draught', 'tonic', 'sage', 'vervain', 'wolfsbane'], slots: ['weapon:staff', 'armor:robe', 'amulet', 'ring', 'amulet'] }, hale: { n: 'Council Armoury', cons: ['draught', 'vervain', 'wolfsbane'], slots: ['weapon', 'weapon', 'weapon', 'ranged', 'ranged', 'armor', 'armor'], forge: 1, hunter: 1 },
  marnie: { n: 'The Mystic Grill', cons: ['burger', 'coffee', 'bourbon', 'draught'], slots: [] }, gault: { n: "Gault's Cellar", cons: ['bloodbag', 'bourbon', 'draught'], slots: ['weapon:sword', 'ring', 'ring', 'amulet', 'armor:coat'] }, bex: { n: "Quartermaster's Tent", cons: ['draught', 'vervain', 'wolfsbane'], slots: ['ranged', 'ranged', 'weapon:stake', 'weapon:stiletto', 'armor:vest', 'ring'], forge: 1, hunter: 1 },
  wren: { n: "Wren's Shelf", cons: ['sage', 'wolfsbane', 'tonic'], slots: ['amulet', 'amulet', 'weapon:staff', 'ring'] } };
function vendorStock(id) { let v = S.vendors[id]; if (!v || v.day !== S.day) { const d = VEND[id]; v = S.vendors[id] = { day: S.day, items: d.slots.map(s => { const [slot, base] = s.split(':'); return genItem(Math.max(1, S.lvl + RI(-1, 1)), { slot, base: base && BASES[base] && (BASES[base].min || 1) <= S.lvl + 2 ? base : undefined, bias: 0.6 }); }) }; } return v; }
const buyPrice = it => Math.round(itemValue(it) * 2.4), sellPrice = it => isBound(it) ? 0 : Math.round(itemValue(it) * 0.35);

/* ---------------- areas ---------------- */
function clearDynamic() { for (const a of actors.slice()) removeActor(a); actors.length = 0; for (const p of shots) p.m.parent && p.m.parent.remove(p.m); shots.length = 0; zonesFx.length = 0; for (const d of decals) d.kill = 1; updDecals(0); for (const d of drops) d.g.parent && d.g.parent.remove(d.g); drops.length = 0; RT.boss = null; hideBoss(); }
function enterArea(id, o = {}) {
  if (id === 'tomb' && o.depth % 5 === 0 && pl && !pl.dead && RT.started && !S.flags.lineDeathAt) keepSnap('hollowmoon.preboss');   // the hour before a keeper: where a line death puts the story back to
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
function clearFloor() { const a = RT.area; a.cleared = true; sfx('quest'); toast(a.boss ? 'The keeper is down. The seal breaks.' : 'Enough have fallen. The seal breaks.'); ringFx(a.exit.x, a.exit.z + 2, 0x8a6cff, 8, 1); if (a.boss && a.chests) { const c = a.chests[0]; c.rig.g.visible = true; } }
function descend() {
  const a = RT.area, d = a.depth, first = d > S.deepest, sig = d * (a.boss ? 3 : 1) + (first ? d : 0); S.sigils += sig; S.stats.floors++; S.deepest = Math.max(S.deepest, d); qEvent('floor', d); toast(`+${sig} sigils${first ? ' (first descent)' : ''}.`);
  blackout(['Deeper.'], () => { enterArea('tomb', { depth: d + 1 }); save(); }, 400);
}
function leaveTomb() { blackout(['Up, into the air.'], () => { enterArea('world', { x: -130, z: -164 }); save(); }, 400); }
function fastTravel(p) { if (RT.combatT > 0) { sfx('deny'); return toast('Not while something is hunting you.'); } if (pl.wolf && !isHybrid()) { sfx('deny'); return toast('The wolf does not read signposts.'); } closeMenu(); blackout([p.n + '.'], () => { S.clock += 0.5; enterArea('world', { x: p.x + 1.5, z: p.z + 2 }); save(); }, 300); }

/* ---------------- the clock ---------------- */
/* jump the clock forward to hour h (tomorrow's, if that hour has passed today), keeping every window honest */
function skipTo(h) { const from = absHours(); if (S.clock >= h) newDay(); S.clock = h; const mins = (absHours() - from) * 60; for (const k of ['vbloodT', 'hbloodT']) if (S.flags[k] > 0) S.flags[k] = Math.max(0.01, S.flags[k] - mins); }
function sleepUntil(h) {
  if (pl.wolf) return toast('The wolf will not lie down indoors.');
  if (S.species === 'werewolf' && !hasUniq('moonring') && S.clock >= 6 && S.clock < 20 && fullTonight() && (h > 20 || h <= S.clock)) return toast('The moon is full tonight. You will not sleep through it. Chain yourself in the Lockwood cellar, or be somewhere there is nobody to hurt.');
  const hrs = (h - S.clock + 24) % 24 || 24, go = () => blackout([h < 12 ? 'You sleep. Morning comes.' : 'You sleep through the day.'], () => { skipTo(h); pl.hp = P.maxHp; pl.sta = P.maxSta; if (S.origin !== 'siphoner') pl.foc = P.maxFoc; if (isVamp()) pl.blood = Math.max(0, pl.blood - 8); S.exposure = Math.max(0, S.exposure - 20); enterArea('world', HOME); save(); toast('Rested.'); }, 900);
  if (S.transition && absHours() + hrs >= S.transition.until) return say([['', 'If you sleep now you will not wake. The day you were given runs out before then, and you have not fed.']], [['Sleep anyway.', go], ['Stay awake.', () => { }]]);
  if (S.venomUntil > absHours() && !S.original && absHours() + hrs >= S.venomUntil) return say([['', 'The venom will finish its work before you wake.']], [['Sleep anyway.', go], ['Stay awake.', () => { }]]);
  go();
}
function newDay() { S.day++; refreshWorld(); genBounties(); }
function tickClock(dt) {
  const F = S.flags; S.clock += dt / 60; S.stats.played += dt; if (S.clock >= 24) { S.clock -= 24; newDay(); toast(`Day ${S.day}. ${MOON[moonPhase()]}.`); } const now = absHours(), vamp = isVamp();
  /* blood in the system passes in a day */
  if (F.vblood) { F.vbloodT -= dt; if (!(F.vbloodT > 0)) { F.vblood = F.vbloodT = 0; toast('The vampire blood has left your system.'); } } if (F.hblood) { F.hbloodT -= dt; if (!(F.hbloodT > 0)) { F.hblood = F.hbloodT = 0; toast('The blood of the First has left your system.'); } }
  if (!pl || pl.dead || RT.blk) return;
  if (S.transition && now >= S.transition.until) return void failTransition('lapsed');
  if (F.slain && F.slain.corvin && !F.lineSeen) { F.lineSeen = 1; lineDeath(); }                                          // white oak has ended Corvin (30-actors records it): his line has an hour
  if (F.lineDeathAt && now >= F.lineDeathAt) { F.lineDeathAt = 0; if (lineLinked()) return playerDeath('line'); }
  /* the full moon takes a triggered wolf, and dawn gives them back */
  if (moonForced()) { if (!pl.wolf) { shiftForm(true); F.moons = (F.moons || 0) + 1; sfx('howl'); toast('The moon is up. Every bone you have breaks at once, and then you are not the one deciding.'); diary('fullmoon'); codex('fullmoon'); qEvent('fullmoon'); } }
  else if (pl.wolf && !isHybrid() && !(S.species === 'werewolf' && fullMoon() && isNight())) { shiftForm(false); if (S.species === 'werewolf') toast('Dawn. You wake in the leaves, human and cold, and not sure whose blood that is.'); }
  /* werewolf venom: the ceiling on your health comes down all day, and at the end of it you die. An Original only sweats it out. */
  if (S.venomUntil) { if (!vamp || isHybrid()) S.venomUntil = 0; else if (now >= S.venomUntil) { if (S.original) cureVenom('passed'); else return playerDeath('venom'); } else if (!S.original) { const cap = P.maxHp * lerp(0.9, 0.3, clamp(1 - (S.venomUntil - now) / 24, 0, 1)); if (pl.hp > cap) pl.hp = Math.max(cap, pl.hp - P.maxHp * 0.01 * dt); } }
  if (S.curseUntil && now >= S.curseUntil) { S.curseUntil = 0; toast('The dead hunter stops talking. Somewhere, someone else has taken up the mark.'); }
  /* no blood: weaker by the minute, then grey and still */
  if (vamp && pl.blood <= 0) { const was = Math.floor((pl.dryT || 0) / 60); if (!pl.dryT) { toast('You are out of blood. Nothing heals, and you will weaken until you feed.'); recalc(); } pl.dryT = (pl.dryT || 0) + dt; const st = Math.floor(pl.dryT / 60); if (st !== was && st < 3) { toast(st === 1 ? 'Your skin is going grey. Feed.' : 'You can barely lift your hands. Feed now, or you will desiccate.'); recalc(); } if (pl.dryT >= 180) return desiccate(); }
  else if (pl.dryT) { pl.dryT = 0; recalc(); }
  /* the switch eats at you while it is off; a Heretic's focus is siphoned from her own blood; sage smoke hides you; the Hundred take their price */
  if (S.switchOff) { if (vamp) S.humanity = Math.max(0, S.humanity - dt / 60); else S.switchOff = false; }
  if (S.heretic && vamp && pl.foc < P.maxFoc && pl.blood > P.maxBlood * 0.2) { const g = Math.min(P.maxFoc - pl.foc, 1.5 * dt); pl.foc += g; pl.blood -= g * 0.5; }
  if (F.sageT > now) S.exposure = Math.max(0, S.exposure - dt * 1.5);
  if (F.hundredT) { if (now >= F.hundredT || !inHollow()) { F.hundredT = 0; recalc(); toast('The Hundred let go of you.'); } else { pl.hp -= P.maxHp * 0.012 * dt; if (pl.hp < P.maxHp * 0.05) { pl.hp = P.maxHp * 0.05; F.hundredT = 0; recalc(); toast('They let go just before it kills you. That was all you can carry.'); } } }
}
function playerDeath(src, o) {   // src: the actor that did it, null for a lingering hurt, or 'sun' | 'venom' | 'line'. o: the blow, when there was one
  if (pl.dead) return; const fam = src && src.fam, uncanny = !src || (!!fam && fam !== 'human' && fam !== 'animal'), vamp = isVamp(), wood = !!o && (o.mat === 'wood' || o.mat === 'whiteoak'), ash = !!o && o.mat === 'ash', how = typeof src === 'string' ? src : o && o.mat === 'sun' ? 'sun' : null;
  /* blood in the system, and a choice still to make */
  if (!vamp && S.transition) return void failTransition('killed');
  if (!vamp && !S.flags.cured && S.flags.hblood && S.species === 'werewolf' && beginTransition('hybrid', 'hblood')) return;
  if (!vamp && !S.flags.cured && (S.flags.hblood || S.flags.vblood) && S.species === 'human' && beginTransition('vampire', S.flags.hblood ? 'hblood' : 'vblood')) return;
  /* an Original only goes grey for a while */
  if (vamp && S.original && how !== 'line' && sk('o_undying') && !(S.flags.undyT > absHours())) { const r = sk('o_undying'); pl.dead = true; pl.hp = 1; pl.act = null; pl.sw = null; pl.block = false; if (pl.feed) endFeed(true); S.flags.undyT = absHours() + 5 - r; sfx('die'); toast('You go grey where you fell. It will not last.');
    setTimeout(() => { if (!pl.dead || !$('death').hidden) return; standUp(); pl.hp = P.maxHp * (0.3 + 0.1 * r); pl.inv = 2; sfx('turn'); ringFx(pl.x, pl.z, 0xff2030, 6, 0.7); RT.flashV = 0.2; floatText(pl.x, 2.8, pl.z, 'UNDYING', '#ff5060', 18); }, 4000); return; }
  pl.dead = true; pl.hp = 0; pl.act = null; pl.sw = null; pl.block = false; if (pl.feed) endFeed(true); S.stats.deaths++; sfx('die'); RT.shake = 0.8; RT.deathSrc = how;
  /* a Founder's Ring brings back an ordinary human killed by something that is not */
  const ring = hasUniq('fring') && S.origin === 'human' && S.species === 'human' && !sk('h_five') && uncanny, lost = ring || how === 'line' ? 0 : Math.floor(S.gold * (how === 'venom' ? 0.25 : 0.1)); S.gold -= lost; if (ring) { S.flags.ringDeaths = (S.flags.ringDeaths || 0) + 1; codex('fring'); }
  const txt = how === 'sun' ? 'The sun found you. What is left of you is carried home in a coat.' : how === 'venom' ? "The fever takes the last of you a day after the bite. You wake at home with a stranger's blood in your mouth and no memory of who paid for it." : how === 'line' ? 'Corvin is dead, and everything he ever made dies with him. You cough blood on the hour, like the rest of his line.'
    : vamp && S.original ? 'Nothing that was done to you tonight could kill you. You lie grey where you fell until someone carries you home.' : S.species === 'hybrid' ? 'Not your head and not your heart, so not the end. You wake at home with the bones setting.' : vamp ? (ash ? 'White oak ash, through your own hand. The dagger does that to any vampire who uses it. You wake at home hours later, grey to the elbow.' : wood ? 'Oak, a breath from the heart. You wake at home hours later with the splinters working their way out.' : 'Not the heart, not the head, not fire. You wake at home hours later the way your kind does, with the bones setting.')
    : S.species === 'werewolf' ? 'A wolf heals faster than it bleeds, just. Someone from the Falls pack leaves you on the boarding house steps.' : ring ? `The ring drags you back from wherever that was. It keeps a little of you each time. That makes ${S.flags.ringDeaths}.`
    : S.origin === 'witch' || S.origin === 'siphoner' ? 'Odette Thorne finds you before the dark does. You wake at the boarding house with her stitches in you and her opinion of you unchanged.' : 'Somebody drags you back to the boarding house. Mrs. Pruitt does not ask questions.';
  const sub = how === 'line' ? (hasSnap('hollowmoon.preboss') ? 'There is no waking from this one. The story goes back to before it was done.' : '') : ring ? 'You lost nothing but 2% of your health, for good.' : lost ? `You lost ${lost} gold.` : '';
  setTimeout(() => { $('deathtxt').textContent = txt; $('deathsub').textContent = sub; $('death').hidden = false; RT.paused = true; }, 1400);
}
function respawn() {
  $('death').hidden = true; const kind = RT.deathSrc; RT.deathSrc = null;
  if (kind === 'line' && rewind('hollowmoon.preboss', 'Corvin is alive again, and so are you. Unlink the line, take the Cure, or find another way to stop him.')) return;
  if (kind === 'venom') S.venomUntil = 0; const dusk = isVamp() && !daylightSafe(); if (!dusk) skipTo(8); else if (!(S.clock >= 20.6 || S.clock < 5)) skipTo(20.6);
  standUp(); shiftForm(false); recalc(); pl.hp = P.maxHp; pl.sta = P.maxSta; if (isVamp()) pl.blood = Math.max(pl.blood, 30); S.exposure = Math.max(0, S.exposure - 25); enterArea('world', HOME); RT.paused = false; save();
}

/* ---------------- saving: this browser, plus the artifact's per-person cloud store when there is one ---------------- */
let cloud = null, cloudT = 0;
function snapshot() { if (pl) { S.hp = pl.hp; S.foc = pl.foc; S.blood = pl.blood; if (S.area === 'world') S.pos = { x: pl.x, z: pl.z }; } S.ts = Date.now(); S.uid = UID; return JSON.stringify(S); }
function save(forceCloud) { if (!S || !pl || pl.dead) return; const j = snapshot(); try { localStorage.setItem('hollowmoon.save', j); } catch (e) { } if (cloud && (forceCloud || Date.now() - cloudT > 45000)) { cloudT = Date.now(); cloud.set({ json: j, ts: S.ts }).catch(() => { }); } }
function readLocal() { try { const j = localStorage.getItem('hollowmoon.save'); return j ? JSON.parse(j) : null; } catch (e) { return null; } }
/* v2 -> v3: the old game had no bloodlines. It did have silver weapons, a compass, a moonstone pendant and witches who bought their magic back; none of those survive. */
function migrate2() {
  const ren = { w_mend: 'w_cloak', w_temp: 'w_motus', v_night: 'v_fed' }, old = S.skills || {}, base = { silverd: 'stiletto', silvers: 'cavalry' }, uq = { compass: 'watch', moonstone: 'moonring' }; S.skills = {}; S.sp = S.sp || 0;
  S.origin = S.flags.witch ? 'witch' : 'human'; S.sire = S.species === 'vampire' ? 'corvin' : null; S.heretic = false;
  for (const k in old) { const n = ren[k] || k; if (!SK[n]) { S.sp += old[k]; continue; } const r = Math.min(SK[n].max, (S.skills[n] || 0) + old[k]); S.sp += (S.skills[n] || 0) + old[k] - r; S.skills[n] = r; }
  S.bar = (S.bar || [null, null, null, null]).map(b => b && (ren[b] || b)).map(b => b && SK[b] && SK[b].act && S.skills[b] ? b : null);
  if (S.species !== 'human') { refundTree('witch'); if (S.skills.h_five) { S.sp += S.skills.h_five; delete S.skills.h_five; } }
  S.cons = S.cons || {}; if (S.cons.elderblood) { S.cons.hblood = (S.cons.hblood || 0) + S.cons.elderblood; } for (const k in S.cons) if (!CONS[k]) delete S.cons[k];
  const fix = it => { if (!it) return it; if (base[it.base]) { it.base = base[it.base]; if (!it.uniq) it.name = itemGenName(it); } if (it.uniq) { const u = uq[it.uniq] || it.uniq; if (UNIQ[u]) { const f = mkUniq(u, it.lvl); it.uniq = u; it.name = f.name; it.base = f.base; it.slot = f.slot; it.aff = f.aff; if (f.dmg) it.dmg = f.dmg; } else { delete it.uniq; it.rar = 4; it.name = itemGenName(it); } } return it; };
  S.inv = (S.inv || []).map(fix); for (const k in S.eq) { const it = fix(S.eq[k]); if (it && it.slot !== k) { S.eq[k] = null; S.inv.push(it); } }
  S.bounties = (S.bounties || []).filter(b => EN[b.type] && !EN[b.type].full); S.vendors = {}; S.v = 3;
}
function applySave(o) {
  if (!o || (o.v !== 2 && o.v !== 3)) return false; S = o; UID = (o.uid || 1) + 1000; S.flags = S.flags || {}; S.asc = Object.assign({ pow: 0, vit: 0, swi: 0, fort: 0 }, S.asc); if (S.v === 2) migrate2();
  const def = { origin: 'human', heretic: false, original: false, transition: null, sire: null, unlinked: false, venomUntil: 0, curseUntil: 0, switchOff: false, diet: 'human' }; for (const k in def) if (S[k] === undefined) S[k] = def[k];
  S.codex = S.codex || {}; if (!ORIGINS[S.origin]) S.origin = 'human'; if (S.flags.mercy == null) S.flags.mercy = 1; for (const k in S.skills) if (!SK[k]) { S.sp += S.skills[k]; delete S.skills[k]; } for (const k in S.cons) if (!CONS[k]) delete S.cons[k]; return true;
}
async function initCloud(onNewer) { try { if (!window.claude || !window.claude.use) return; const db = await window.claude.use('db'), user = await window.claude.use('user'); if (!db || !user) return; const id = await user.id(); if (!id) return; cloud = db.doc('data/users/' + id + '/save'); const snap = await cloud.get(); if (snap && snap.exists) { const d = snap.data(); if (d && d.json) onNewer(JSON.parse(d.json)); } } catch (e) { cloud = null; } }
function exportSave() { return btoa(unescape(encodeURIComponent(snapshot()))); }
function importSave(txt) { try { const o = JSON.parse(decodeURIComponent(escape(atob(txt.trim())))); if (o.v !== 2 && o.v !== 3) throw 0; localStorage.setItem('hollowmoon.save', JSON.stringify(o)); return true; } catch (e) { return false; } }
/* Hollow Moon — story: people, dialogue, quests, the diary, the codex, world events. Canon rules: see SPEC.md.
   Nothing in this file changes what the player is without asking first: every turning, every curse and every killing of an Original goes through a choice that says what it costs. */
const DIARY = {
  arrive: "Aunt Elspeth left me a room at the Pruitt boarding house, a box I have not opened, and a town I had never seen. Mystic Falls. It is pretty the way a held breath is pretty. Everyone here drinks the same bitter coffee and nobody walks home alone.",
  ferals: "It had been the delivery boy. It was wearing his jacket. It came at me across the graves and I hit it until it fell, and it got up again. It only stayed down when I finished it the way the old stories say: the heart, or the head. Then it went grey, veins standing out like roots, and lay there looking a hundred years dead. I am writing this with both hands.",
  hale: "Vampires. Captain Hale said the word the way other people say 'weather'. The Founders' Council has kept it quiet since 1864, and I am a Fell, so apparently it is my inheritance. Wood through the heart, fire, the sun, the head. Anything less and they get up again. He gave me a stake and a crossbow and told me to count.",
  witch: "Odette Thorne put her hands over mine and it felt like remembering my own name. The candle on her counter lit itself. The craft runs on the Thorne side, the side the Fells never wrote down. She says it belongs to the living: if I ever die and get back up, it will not come with me.",
  siphoner: "The candle did not light. It went out, and Odette's hand went cold in mine, and for a second I was holding something that was hers. She knew the word for me before I did. Siphoner. I make no magic. I take it. My own coven had a shorter word.",
  herbs: "Odette paid me for the herbs in coin and plain speaking. Magic is inherited, like a jaw. It is not in my blood and no amount of wanting will put it there. She says that is not the same as being helpless.",
  ambrose: "Ambrose Varga died in 1864 and has stood on Wickery Bridge every night since they built it, because the old bridge was white oak and white oak is the only thing that can kill the one his line began with. He told me how turning is done: his blood, then a death, then a day in between when I would be neither thing, and human blood before that day ran out or no waking at all. He did not push. The offer stands, he says. It always will.",
  vblood: "I drank it. It tasted like a coin held under the tongue. Every bruise I own closed up. It stays in me until this time tomorrow. If I die before then, I will not stay dead. I could just be careful and let it pass.",
  hblood: "Corvin's blood is older than the town and it does not taste like Ambrose's. It closed everything. For a day it sits in me like a second pulse. If I die with it there, I wake as something of his.",
  transition: "I died tonight, and woke. My gums ache. The lamp hurts. There is a heartbeat two rooms down and I can hear it through the wall. I am not one of them yet. I have until this time tomorrow to drink human blood, or not to, and not drinking is an answer too. The sun came round the curtain and only made my eyes water.",
  turned: "I fed. It is finished. Everything is louder, I am faster than I can think, and there are veins under my eyes when I am hungry. I looked. The sun will kill me now, properly, until a witch says otherwise. Whatever I felt before, I feel more of it.",
  heretic: "I am dead and the siphoning came with me. It should not have. There is magic in whatever keeps me walking, and I can take that the way I take anything else, so now my spells drink my own blood. The word for this is Heretic. My coven would have burned me twice.",
  triggered: "I killed someone. I meant to, at the end, and something in my blood that has waited my whole life sat up. My temper was never just temper. On the next full moon every bone I have will break, and I will be a wolf until dawn, and I will not be the one deciding anything.",
  fullmoon: "The first one took most of the night. Every bone, one at a time, and I felt each of them. After that I only remember pieces: the ground very close, the smell of everything, running. I woke in the leaves at dawn, human and cold. I checked my hands before I checked anything else.",
  cellar: "The Lockwood cellar has chains bolted into the stone and claw marks older than my grandfather. I locked myself in and threw the key where hands can reach and paws cannot. In the morning the door was scored from the inside and nobody was dead. That is what a good night looks like now.",
  hybrid: "I died with Corvin's blood in me and woke shaking, and Elise Gilroy's blood finished it. Wolf and vampire both. The moon has no say any more. I change when I choose, the sun does nothing, and my bite is poison to the dead. I am grateful to him. I did not decide to be. That is the part that frightens me.",
  unsired: "A hundred times I broke every bone on purpose. Somewhere past the eightieth it stopped hurting, and when it stopped hurting I stopped owing him. I thought about Corvin tonight and felt nothing pull. My hands are my own.",
  original: "The spell that made the first family, done again on me. Doppelgänger blood in wine, white oak burned to ash, the blood of the first, and then a hand through my chest because the spell needs a death. I woke as the first of a line. Nothing but white oak can end me now, and somewhere a tree has started growing, because nature always leaves a door.",
  venom: "A werewolf bit me. On a living person it is only a wound. On me it is a fever that will not break: the bite will not close, I am seeing people who are not here, and by this time tomorrow it kills me. Only Corvin's blood stops it. Everyone in this town seems to need that man alive.",
  curse: "I killed one of the Five and he has not left. He stands in doorways. He brings people with him, people I knew. All of them say the same thing: that I should walk into the sun. No witch can lift it. It ends when another hunter takes up the mark, and not before.",
  switch: "I turned it back on. Everything I did while it was off was waiting for me in a pile, and I felt all of it at once. It was easier off. That is exactly what is wrong with it.",
  murder: "I did not let go. I felt the heart stutter and I kept going, and now there is one less person in Mystic Falls and I am the reason. I am writing it down so I can never pretend I did not notice.",
  tomb: "There are stairs under the ruined altar of Fell's Church and they go down a long way. The first floors are 1864: twenty-seven vampires that a Thorne witch sealed in under the comet, instead of letting the Council burn them. They did not die. They dried. They are still down there, grey and waiting, and they wake when blood is spilled near them. Below that the stone is older.",
  warden: "The Warden was one of the twenty-seven, and he was not keeping the dead in. He was a jailer. Locks would never have held what is on the tenth floor. A Thorne witch stopped its heart, and a human heart stopped to pay for that, and the Warden sat on the stairs for a century and a half to see nobody fed it. Somebody has.",
  corvin: "Corvin. One of the first family, a thousand years old, vampire and wolf both. I put him on the floor and he lay there grey, and it was not death, it was a rest. He asked what year it was before he fell, and laughed at the answer. Nothing I own ends him except white oak, and everything he ever made dies if he does. I have to decide what he is worth.",
  oak: "The white oak went in and caught, and Corvin burned from the heart outwards with it. Within the hour everything of his line coughed blood and stopped. Ambrose was on his bridge. I am told he was looking at the water. I did that. I knew I was doing it.",
  oak2: "The white oak went in and caught, and Corvin burned from the heart outwards with it. Within the hour everything of his line coughed blood and stopped: the quarry, the cemetery, people in other towns I will never hear about. Ambrose was not among them. I saw to that first. It is the only part of tonight I am sure of.",
  desic: "A hand on his chest, and a living heart stopped so that his would. His skin went to grey paper and the gold went out of his eyes. Casimir carried his brother up nine flights in a coffin and thanked me, which was worse than if he had not. Nobody died. He is not dead. Somebody will feed him one day.",
  bargain: "I let him get up. He stood, set his own shoulder, and offered me his blood as if it were a business card. The only cure for a werewolf bite, the making of hybrids, and him walking out on his own feet into my town. He keeps his word, Casimir says. That is the problem with him.",
  casimir: "Casimir came to town the week the Warden fell. Corvin's elder brother, one of the first family, in a good coat. He does not want Corvin dead. He wants him in a box. He told me he could make me forget the conversation, and that vervain is the only reason I would ever know if he had.",
  elise: "Elise Gilroy has a face that is not only hers. Odette calls her a doppelgänger: a mortal copy that nature keeps making. Blood from that face was in the spell that made the first vampires, and it is the only thing that finishes a hybrid. It only works while she is human. She knows what that makes her worth, and to whom.",
  daylight: "Odette tied the sun into a stone and the stone into a ring, for me and nobody else. I stood in the square at noon and nothing happened. Children went past. I had forgotten the sun has a smell: cut grass, warm brick. She made it and she can unmake it from anywhere. She told me so twice.",
  despelled: "The ring went cold on my hand in the middle of the street. Odette did that from her shop, without looking up. She says I know why. I do. It is a stone until I have made amends.",
  cured: "I took the Cure. I am cold and tired and my knee hurts where I fell on it when I was nine. I had forgotten that knee. I cried in the square like an idiot. It is in my blood now. Nothing will ever turn me again.",
  alpha: "Old Tobias went down under the full moon. A werewolf dies like anything else that lives, and stays dead. At the end he was just an old man by a waterfall, looking surprised. The pack will choose another. They always do.",
  alphaw: "I challenged Old Tobias under the full moon, the way the pack does it, and I won. At the end he was just an old man by a waterfall, looking surprised. The others watched me afterwards, not him. Wren says that is how an alpha finds out: everyone starts waiting to see what you will do.",
  matriarch: "A hundred witches were burned at the Hollow in one night. The cultists had been pulling on them until they ran together into one voice. It is broken now. They are a hundred women again, quiet, and they let me walk out.",
  deeper: "There is always another floor. Under Corvin's the stone is older than the church and older than the town. Odette says there is a door on the twentieth that a witch sealed two thousand years ago, and one dose of something behind it.",
  sleeper: "He was shut in with the Cure two thousand years ago and has not had a drop of blood since. I put him down, which is all anyone can do to him, and took it out of his hands. One dose. It makes a vampire human for good. Whoever takes it can never be turned again.",
  five: "It came up on my hand after the kill, black, like ivy. Nobody else at the camp could see it. Bex could, nearly. The Brotherhood of the Five: five hunters, made by a dying witch nine hundred years ago. Nobody can get inside my head now. And I want to kill every vampire I meet, including the ones I like.",
  mark: "The mark is finished. It runs from my hand to my collarbone and only another hunter could see it. Odette read it with her fingers, like a page. It was never a tattoo. It is a map with a spell written round it, and it ends at a door on the twentieth floor.",
  wren: "Old Wren knew my father. He ran with the Falls pack before I was born. Lockwood blood: the curse comes down the family and sleeps until the carrier takes a human life. It has been asleep in me the whole time. My temper near the full moon was never just temper. She told me where the pack chains up, in case.",
  unlinked: "Odette cut me out of Corvin's line with his own blood, and a hundred dead women holding the knife. Something that has been pulled tight in me since I turned went slack. If he dies now, I do not.",
  invited: "I stood on the porch of my own boarding house and could not put my foot over the sill. Mrs. Pruitt looked at me for a long time. Then she said, well, come in then. It only has to be said once.",
  fring: "Elspeth's box had a ring in it, heavy, with the Fell crest. Her note says a Thorne witch spelled it in 1864: if something that is not natural kills the wearer, the wearer wakes up. Only an ordinary person. And each time, it keeps a little of you.",
  ambroseDead: "I finished Ambrose Varga on his own bridge. He asked for a fight and I gave him more than he asked for. He went grey like the rest of them. He was the only one of them who told me the truth before I needed it.",
};
function diary(k) { if (S.flags['d_' + k] || !DIARY[k]) return; S.flags['d_' + k] = 1; S.diary.push({ t: `Day ${S.day}, ${fmtClock(S.clock)}`, x: DIARY[k] }); toast('The diary has a new page.'); }

/* field notes: what the player has learned about how this town works. Every entry states a rule the game applies. codex(id) (40-systems) adds one; jot() adds several with one notice. */
const CODEX = {
  vampire: { t: 'Vampires', x: "A person who dies with vampire blood in them comes back, and becomes one of these once they feed. Stronger and faster than anyone living, and the old ones are stronger still. They have no magic of their own. Garlic, crosses and mirrors do nothing; they eat and drink like anyone, and bourbon takes the edge off the hunger." },
  killing: { t: 'Killing a vampire', x: "Wood through the heart, fire, sunlight, taking the head, or taking the heart. Anything else only drops one: it lies grey for a few seconds and gets back up. A broken neck buys time and nothing more. The corpse does not crumble. It goes grey and veined and looks a hundred years dead." },
  transition: { t: 'Transition', x: "Die with vampire blood in your system and you wake unfinished. No strength yet, the sun only hurts the eyes, and doors do not stop you. You have about a day to drink human blood. Drink and it is done for good; refuse and you die at the end of the day, which some people choose." },
  vblood: { t: 'Vampire blood', x: "Drunk by the living it only heals, and it passes out of the body in a day. Die inside that day and you wake in transition. It does nothing for another vampire, it cannot turn a werewolf, and it cannot cure a werewolf bite." },
  feeding: { t: 'Blood', x: "Human blood gives a vampire full strength. Animal blood keeps one alive, but weaker and slower to heal. Most of Mystic Falls drinks vervain, so biting the wrong neighbour burns, feeds nothing, and they remember. A vampire with no blood left weakens, goes grey, and finally desiccates." },
  vervain: { t: 'Vervain', x: "It burns a vampire's skin and weakens one that swallows it. Anyone with vervain in their blood or on their person cannot be compelled, and their blood burns whoever bites them. The Council puts it in the Grill's coffee. It does the same to a hybrid, and nothing to a wolf." },
  sun: { t: 'Sunlight and daylight rings', x: "Sunlight burns an ordinary vampire to death in moments. A ring of lapis lazuli spelled by a witch stops that, for the one vampire it was made for, while it is worn. The witch who made it can take the spell back out from anywhere. Hybrids need no ring." },
  invitation: { t: 'Invitation', x: "A vampire cannot cross the sill of a home that a living person owns until someone who lives there asks them in. Once is enough, for ever. Public places like the Grill need no invitation, and neither does a house with no living owner. Werewolves, witches and people in transition come and go as they like." },
  compulsion: { t: 'Compulsion', x: "A vampire can catch a human's eye and tell them what to do, or what to forget. It fails on anyone carrying vervain, and it has never worked on witches, werewolves or the Five. Only an Original can compel another vampire, and vervain stops even that." },
  switch: { t: 'The humanity switch', x: "Turning makes every feeling louder, and any vampire can switch the whole lot off. Off, nothing they do costs them anything. It comes back on all at once, with everything they did waiting." },
  desiccation: { t: 'Desiccation', x: "A vampire starved of blood does not die. It weakens, goes grey and stiff, and lies there for as long as it takes, a century if need be, until someone feeds it. The twenty-seven under Fell's Church have been like that since 1864." },
  sireline: { t: 'Sire lines', x: "Every vampire descends, maker by maker, from one of the first family. If that Original is truly killed, every vampire of the line dies within about an hour. Corvin's line includes Ambrose Varga, the quarry nest, and anyone turned with their blood. Daggering or desiccating him harms nobody, and a witch can cut a vampire loose from the line." },
  original: { t: 'The Originals', x: "The first vampires: one family, made a thousand years ago by their mother's spell, with doppelgänger blood, the sun and a white oak tree. Wood, fire and a broken neck only put one down for a while. They can compel other vampires. The sun and vervain still burn them, and only white oak kills." },
  whiteoak: { t: 'White oak', x: "The tree that gave the first family their immortality is the one thing that can take it away. A stake of it through the heart kills an Original for good and burns up with him. The last such tree was milled in 1912 and built into old Wickery Bridge. Against anything else it is ordinary wood." },
  dagger: { t: 'The ash dagger', x: "A silver dagger dipped in white oak ash, left in an Original's heart, holds him as dead for as long as it stays in. It kills any ordinary vampire who uses it. It does nothing to Corvin: there is wolf in him, and silver does nothing to a wolf." },
  werewolf: { t: 'Werewolves', x: "The curse is inherited. It cannot be caught from a bite. It sleeps until the carrier takes a human life, and then never sleeps again. As a person a werewolf is stronger and faster than anyone living but less than a vampire, more so near the full moon and when angry. They are mortal, cannot be compelled, need no invitation and do not mind the sun." },
  fullmoon: { t: 'The full moon', x: "On the night of the full moon a werewolf turns into a wolf: a real one, four legs, larger than natural, yellow eyes. Every bone breaks to do it. The wolf does not think like its owner, and it prefers vampires. Dawn ends it. Chains in the Lockwood cellar, or a moonlight ring, are the only say you get." },
  wolfsbane: { t: 'Wolfsbane', x: "Wolfsbane is to a werewolf what vervain is to a vampire: it burns on contact and it weakens. It hurts hybrids too. Silver does nothing at all. That part of the story is wrong." },
  venom: { t: 'Werewolf venom', x: "A werewolf's bite, in wolf form, is poison to a vampire: fever, visions, and death in about a day. A hybrid's bite carries it in either shape. Nothing cures it except the blood of the Original hybrid, though a Heretic can siphon it out of herself. To an Original it is only a bad night, and to the living only a wound." },
  moonring: { t: 'Moonlight rings', x: "Black kyanite, spelled by a witch. A werewolf who wears one is not forced to turn on the full moon and may choose to. On that night the wolf's strength and venom are theirs in either shape. Wolfsbane still burns." },
  hybrid: { t: 'Hybrids', x: "Werewolf and vampire both. A wolf whose curse has woken dies with Corvin's blood in them, wakes in transition, and must drink the human doppelgänger's blood or bleed from the eyes and die. A hybrid walks in the sun, changes at will, and has a venomous bite. Vervain and wolfsbane both burn, wood only drops one, and it takes the head or the heart to finish it." },
  sirebond: { t: 'The sire bond', x: "A hybrid made with Corvin's blood is grateful to him for ending the pain of the full moon, and cannot raise a hand to him. It is broken by changing shape willingly, about a hundred times, until the change no longer hurts and nothing is owed." },
  hblood: { t: 'Blood of the First', x: "Corvin's blood. It heals like any vampire's, and it is the only cure for a werewolf bite. A human who dies with it becomes a vampire of his line; a woken wolf who dies with it wakes in transition to a hybrid. It can only be taken while he lives." },
  doppelganger: { t: 'The doppelgänger', x: "Nature keeps making a mortal copy of one face. Elise Gilroy has it now. Blood from that face was in the spell that made the Originals, and it is the only thing that completes a hybrid. It only works while she is alive and human." },
  witch: { t: 'Witches', x: "Magic is inherited: you are born to it or you are not. Witches are mortal and heal like anyone. Spells cost focus, and casting past empty comes out of the body, starting with a nosebleed. A witch who becomes a vampire loses her magic for good." },
  siphoner: { t: 'Siphoners', x: "A witch born making no magic of her own. She takes it by touch, from vampires, werewolves, other witches, spirits and spelled things, and spends it until it is gone. Her own kind call her an abomination. Draining a vampire too far desiccates it." },
  heretic: { t: 'Heretics', x: "A siphoner who becomes a vampire keeps her siphoning, because vampirism is itself magic and she can draw on her own. No other witch keeps anything. A Heretic has every vampire weakness, and can siphon werewolf venom out of herself." },
  hundred: { t: 'The Hundred', x: "A hundred witches were burned at Coven Hollow in one night and never left. A living witch at the altar can borrow all of them at once; too long and it kills her. They hate vampires: inside the Hollow a daylight ring stops working and they hurt the dead, unless a witch they trust has spoken for you." },
  desicspell: { t: 'The desiccation spell', x: "A witch can stop a vampire's heart with her hand on it, so that it greys and lies still until fed. The balance is a living heart, stopped while the spell takes. It is the only thing short of white oak that puts an Original away, and nobody of his line dies for it." },
  council: { t: "The Founders' Council", x: "The founding families have hunted vampires in secret since 1864, behind parades and committee meetings. They drink vervain and keep heirlooms: a watch that points at vampires, rings that bring an ordinary person back, a device that drops every vampire and wolf in earshot. They fight with wooden rounds, vervain and wolfsbane." },
  five: { t: 'The Brotherhood of the Five', x: "Five hunters, made by a dying witch nine hundred years ago. When one dies, a potential somewhere wakes on a kill. They are stronger than people, cannot be compelled by anything, and want every vampire dead. The mark grows up the arm with each vampire killed, and only hunters can see it. Finished, it is a map to the Cure." },
  curse: { t: "The Hunter's Curse", x: "A vampire who kills one of the Five is haunted: the dead hunter, and faces from their own life, all telling them to die. No witch can lift it. It ends when another hunter takes up the mark." },
  cure: { t: 'The Cure', x: "One dose, made two thousand years ago by a witch to undo immortality, and sealed in with a desiccated immortal. It makes a vampire human for good, and it can be given to someone else. Whoever has taken it can never be turned again." },
  fring: { t: "The Founder's Ring", x: "Spelled in 1864 for the founding families. If something supernatural kills the wearer, the wearer wakes up. It works only for an ordinary human: not a witch, a wolf, one of the Five or the dead, and not against an ordinary death. Every return keeps a piece of you." },
  tomb: { t: "The tomb under Fell's Church", x: "In 1864 the Council meant to burn twenty-seven vampires in the church. Emeline Thorne sealed them alive in the tomb beneath it instead, under a comet. They dried out and are still there, and spilled blood wakes them. The floors below are older, and were a prison for one man." },
  cellar: { t: 'The Lockwood cellar', x: "West of the Falls den there is an iron door set into a mossy bank, with steps going down to a cellar behind it, and chains in the wall. A werewolf who locks in before moonrise spends the night as a wolf behind a door and hurts nobody." },
};
function jot(...ids) { S.codex = S.codex || {}; const t = []; for (const id of ids) if (CODEX[id] && !S.codex[id]) { S.codex[id] = 1; t.push(CODEX[id].t); } if (t.length) toast('Codex: ' + t.join(' · ')); return t.length; }

const RUMOURS = ['Wood through the heart ends a vampire. So does fire, the sun, or taking the head. Anything less and it gets back up.', "Silver is an old wives' tale. Wolfsbane is what a wolf fears.", 'Block at the last instant and you turn the blow aside. They stagger. Hit them while they do.', 'Hold your attack and you commit to a heavy blow. With a blade, a heavy blow takes a head.', 'Chests around the county fill up again after three days. I do not ask who fills them.',
  'On a full moon, stay out of the woods by the Falls. The pack are decent people every other night.', "The stairs under Fell's Church go down further than the church is old. The sigils you bring back up can be spent in your journal.", 'Vervain grows in the north woods. Rub it on a blade, or drink it in the coffee. If you are one of them, do not touch it.', 'A signpost with a lantern will take you to any other you have found. Saves on boots.', 'Hale will reforge anything for gold and scrap. Break down what you do not need.',
  'Something lives in the old quarry. It has children. None of them come out by day.', "Sleep at Pruitt's. If you have gone pale lately, she will have to ask you in first.", "There was a comet the night they burned Fell's Church, in 1864. The Council says the church was full of soldiers. It was not soldiers.", 'A dead one cannot walk into your house unless somebody living asks it in. So do not ask anyone in after dark.', 'If a neighbour will not touch the coffee, do not sit with them.'];
const hasCons = k => (S.cons[k] || 0) > 0, shop = id => ['Trade.', () => openVendor(id)], bye = ['Leave.', () => { }];
const cap6 = o => o.length > 6 ? o.slice(0, 5).concat([o[o.length - 1]]) : o;                                    // the number keys only reach six choices
const odetteSpent = () => (S.flags.odetteSpent || 0) > S.day;                                                   // the desiccation spell burns a witch out for days
const roomFor = () => S.inv.length < 60 || (toast('Your pack is full. Make room first.'), false);
const hasStake = () => Object.values(S.eq).concat(S.inv).some(i => i && i.uniq === 'whiteoak'), holdsOak = () => !!pl && !pl.wolf && P.wmat === 'whiteoak';
function jumpQuest(id, step, n) { if (S.done[id] || !QUESTS[id]) return; if (!S.quests[id]) S.quests[id] = { step: 0, n: 0 }; S.quests[id].step = step; S.quests[id].n = n || 0; }

/* ---------------- Odette Thorne ---------------- */
function odetteAmends() {
  const O = 'Odette Thorne', cost = 60 + 25 * S.lvl;
  if (S.humanity >= 40) { if (odetteSpent()) return say([[O, 'You have been trying. I can hear the difference. But I have nothing left to spell it with. Give me a few days.']]); return say([[O, 'You have been trying. I can hear the difference.'], [O, 'Hold out your hand. I made it, I unmade it, and I can do either again.']], null, () => { S.flags.ringOff = 0; S.flags.ringMurders = 0; S.flags.vouched = 1; despellRing(false); }); }
  say([[O, 'I took the spell out of it. I told you I would, and I told you why.'], [O, `I can hear what is left of you: ${Math.round(S.humanity)} in a hundred. Come back at forty or better. Feed without killing. Let them go while they can still walk.`], [O, `Or start paying for what you took. The Council keeps a fund for the families. ${cost} gold buys back a little of you, once a day. It is not forgiveness.`]],
    [[`Pay ${cost} gold to the families.`, () => { if (S.switchOff) return toast('With your humanity off, paying would change nothing. Turn it back on first.'); if (S.flags.amendDay === S.day) return toast('Once a day. It is supposed to cost you time as well.'); if (S.gold < cost) { sfx('deny'); return toast('Not enough gold.'); } S.gold -= cost; S.flags.amendDay = S.day; S.humanity = Math.min(100, S.humanity + 8); sfx('coin'); toast(`Humanity ${Math.round(S.humanity)}. ` + (S.humanity >= 40 ? 'Odette will see you now.' : 'It is a start.')); }], bye]);
}
function odetteTalk() {
  const O = 'Odette Thorne', F = S.flags, vamp = isVamp(), og = S.origin, living = S.species === 'human' && !S.transition, spent = odetteSpent(), tired = [[O, 'I have nothing left to cast with. Stopping a heart like his costs days. Come back when I can light a candle.']];
  if (qAt('q_arrive', 1)) return say([[O, 'From Marnie. Set it down.'], [O, og === 'witch' ? "You are Elspeth's. A Fell on paper. Your mother was something else, and you stand in a doorway the way she did, as if you were asking the house." : og === 'siphoner' ? "You are Elspeth's. And there is something else: the lamp dimmed when you came in. It does not do that for people." : og === 'wolf' ? "You are Elspeth's. And you have a temper you were told to grow out of. It is worse some weeks than others. I can guess which." : "You are Elspeth's. A Fell all the way through. That is rarer in this town than you would think."], [O, 'Come back when the town has introduced itself to you. It will. It does that at night.']], null, () => qEvent('talk', 'odette'));
  if (qAt('q_witch', 0)) return say([[O, 'You saw one. Do not tell me what; I can smell the grave on your boots.'], [O, "Your aunt and I had an understanding. She kept this town's worst secret, and I kept her alive past seventy. I would offer you the same."], [O, 'I need stock first. Three sprigs of vervain from the woods north of town, and two heads of wolfsbane, from the Falls or the lake. Vervain is for vampires. Wolfsbane is for what howls at the Falls. Silver is for jewellery.'], [O, og === 'witch' || og === 'siphoner' ? 'Bring them yourself. There is something I want to see when you put them in my hands.' : 'Bring them yourself. I pay fairly.']], null, () => { jot('vervain', 'wolfsbane'); qEvent('talk', 'odette'); });
  if (qAt('q_witch', 3)) { const fin = () => qEvent('talk', 'odette');
    if (og === 'witch' && S.transition) return say([[O, 'You are in between. I can hear it: there is one heart beating in this room and it is mine.'], [O, 'There is craft asleep in you, from your mother. If you feed, it dies with the rest of you. Come back to me with a pulse and I will wake it. I will not do it while you are neither thing.']]);
    if (og === 'witch' && living) return say([[O, 'Put them in my hands. No, leave yours there.'], [O, 'There. You felt that. The candle did too.'], [O, 'Your mother was a Thorne: the side of your family the Fells never wrote down. The craft comes down the blood and nowhere else. It was asleep in you. It is not now.'], [O, 'It belongs to the living. If you ever die and get back up, it will not come with you. Remember that when somebody offers you for ever.']], null, () => { F.witch = 1; recalc(); diary('witch'); jot('witch'); addItem(genItem(Math.max(2, S.lvl), { base: 'staff', rar: 1 })); addCons('tonic', 2); toast('The Witch skill tree is open. A staff casts bolts instead of swinging.'); fin(); });
    if (og === 'siphoner') return say([[O, 'Put them in my hands. No, leave yours there.'], [O, vamp ? 'The candle went out. You are dead, and it still went out. So that is what you are.' : 'The candle did not light. It went out. And my hand has gone cold where you are holding it.'], [O, 'You took that from me. You do not make magic. You take it, from anything that has some, and you spend it until it is gone.'], [O, 'Siphoner. Your own coven will have had an uglier word. I am not going to use it. Take from the things that deserve it, and ask before you touch me again.'], [O, vamp ? 'And you kept it past dying, which no witch does. That makes you a Heretic. Your spells come out of your own blood now.' : 'One more thing. A witch who turns loses everything. Your kind would not. I am telling you because somebody will, and I would rather it was me.']], null, () => { F.siphon = 1; F.witch = 1; recalc(); diary('siphoner'); jot('siphoner', 'witch'); addItem(genItem(Math.max(2, S.lvl), { base: 'staff', rar: 1 })); toast(vamp ? 'The Witch skill tree is open. Your spells feed on your own blood.' : 'The Witch skill tree is open. You have no focus of your own: siphon it from something that has magic.'); fin(); });
    if (og === 'witch') return say([[O, 'Look at your hands. You picked vervain dead. That was stubbornness, not blood.'], [O, "You had the craft in you, asleep. A Thorne on your mother's side. It went out when your heart did. A witch who turns loses her magic, and nothing gives it back."], [O, 'I am sorry. I would have liked to teach you. Take this for the herbs.']], null, () => { F.herbsPaid = 1; S.gold += 60; addCons('draught', 2); jot('witch'); fin(); });
    return say([[O, vamp ? 'Look at your hands. You picked vervain dead. That was stubbornness.' : isWolf() ? 'You picked wolfsbane and your fingers are blistered. So now I know what you are. I will not say it in the street.' : 'They came up clean. Good.'], [O, 'This was an errand, not a test. Magic is inherited, like a jaw. It is in the blood or it is not, and it is not in yours. No book and no wanting will change that.'], [O, og === 'wolf' ? 'What is in your blood is older than this town and nothing to do with me. Old Wren, out at Dunham Lake, is the one to ask.' : 'That does not make you helpless. Vervain on a blade, wolfsbane on a blade, sage smoke when you need not to be found. I sell all three.'], [O, 'Here. Fair pay.']], null, () => { F.herbsPaid = 1; S.gold += 60; addCons('draught', 2); diary('herbs'); jot('witch'); fin(); }); }
  if (qAt('q_daylight', 0)) return say([[O, 'So. You died, and you fed. I can hear that you have no pulse from here.'], [O, 'I can bind the sun into lapis lazuli. One stone, one vampire: it will work for you and nobody else, and only while it is on your hand.'], [O, "The ones who were sealed under Fell's Church in 1864 went down wearing theirs. The Warden still does. The chests down there sometimes hold a stone."], [O, S.humanity < 50 ? 'I can hear what you have done already. I made no promise to like you. Bring me a stone and we will see.' : 'Bring me a stone. And understand me: what I make, I can unmake.']], null, () => { jot('sun'); qEvent('talk', 'odette'); });
  if (qAt('q_daylight', 2)) { if (spent) return say(tired); if (!roomFor()) return;
    return say([[O, 'Lapis. Give me your hand. Do not flinch, you will ruin the knot.'], [O, 'There. It is yours and only yours. I made it, and I can unmake it from anywhere, without getting up from this chair.'], [O, 'Kill the people of this town and it goes cold on your hand at noon. I have also told the Hundred you are mine to answer for. They will leave you and the ring alone at the Hollow, for as long as I do.']], null, () => { S.cons.lapisq = Math.max(0, (S.cons.lapisq || 0) - 1); addItem(mkUniq('daylight', S.lvl)); F.vouched = 1; F.ringOff = 0; F.ringMurders = 0; recalc(); diary('daylight'); jot('sun', 'hundred'); qEvent('talk', 'odette'); }); }
  if (qAt('q_warden', 1)) { const mine = lineLinked();
    return say([[O, 'The Warden. Then the tomb of 1864 is open all the way down, and what he sat on top of is awake.'], [O, 'His name is Corvin. He is one of the first family: a thousand years old, vampire and wolf both. Every vampire in this county was made by something he made. Ambrose Varga. The nest in the quarry.' + (mine ? ' You.' : '')], [O, 'Locks never held him. A Thorne stopped his heart with her hand on his chest, and a living heart stopped to pay for it. He lay grey down there until the Hollow cultists started carrying blood to him.'],
      [O, 'Nothing kills him but white oak. And if white oak does kill him, everything of his line dies within the hour.' + (mine ? ' That means you. Hear me: if Corvin truly dies while you are tied to him, you die too. I can cut that tie, with his blood. The Cure would do it as well.' : ' Ambrose would be dead on his bridge before you had climbed back up.')], [O, 'There is another way. Put him on the floor, say my name with your hand on him, and I will come down and stop his heart again. It costs what it cost the last time. Talk to Hale about the first way. Go armed.']], null, () => { F.desicReady = 1; if (!F.corvinAwake) F.corvinAwake = S.day; jot('original', 'sireline', 'desicspell'); qEvent('talk', 'odette'); }); }
  if (qAt('q_deeper', 0)) return say([[O, 'Under his floor the stone is older than the church. My family did not build it. We inherited the key.'], [O, 'On the twentieth floor there is a door a witch sealed two thousand years ago, and behind it a man who has not had a drop of blood since. He was shut in with the one thing he did not want: a cure. One dose. It makes a vampire human, for good.'],
    [O, hasCons('talisman') ? "You carry Emeline's talisman. The door will know it." : canOpenSleeper() ? 'The seal answers Thorne blood and living craft. You have both. Put your hand on it.' : F.matriarch ? "The door opens for a living Thorne witch, or for Emeline's talisman. The Hundred have let me lift their altar stone. Here. It was under it all along." : og === 'human' && living ? "The door opens for a living Thorne witch, or for Emeline's talisman. The Hundred keep that under their altar, and they would give it up if the Hollow were at peace. Or finish a hunter's mark and let me read it: the Five were made to find that door." : "The door opens for a living Thorne witch, or for Emeline's talisman. The Hundred keep that under their altar. Give the Hollow peace and they will let me lift the stone."]], null, () => { if (F.matriarch && !hasCons('talisman') && !canOpenSleeper()) addCons('talisman'); jot('cure'); qEvent('talk', 'odette'); });
  if (qAt('q_hollow', 1)) return say([[O, 'I felt it from here. A hundred women, separate again. They have not been that since before my grandmother.'], [O, "They let me lift the altar stone tonight. This was under it: Emeline's crystal. It opens what a Thorne sealed. There is a door a long way down that will want it."]], null, () => { if (!hasCons('talisman')) addCons('talisman'); F.hollowPeace = 1; qEvent('talk', 'odette'); });
  if (qAt('q_five', 2)) return say([[O, 'Roll up your sleeve. No, I cannot see it. Put my hand on it.'], [O, 'Hand to collarbone. It is not a tattoo. It is a map, and a spell written round the map, and it was put on five men nine hundred years ago by a witch who wanted one particular door found.'], [O, "The door is under Fell's Church, twenty floors down. What is behind it is the Cure. Your mark is the way there, and this is the key: Emeline's crystal. Take it. The Five never had a witch who would hand it over."]], null, () => { if (!hasCons('talisman')) addCons('talisman'); diary('mark'); jot('five', 'cure'); qEvent('talk', 'odette'); });
  if (qAt('q_moonring', 2)) { if (spent) return say(tired); if (!roomFor()) return;
    return say([[O, 'Black kyanite. Wren sent you. She would not have, if she thought you would waste it.'], [O, 'This is an old spell and not one of ours. It does not stop the wolf. It gives you the say: on the full moon you turn if you choose to, and if you do not, you keep the wolf\'s strength standing on two feet.'], [O, 'Wolfsbane will still burn you. And take it off on the wrong night and the moon has you again.']], null, () => { S.cons.kyanite = Math.max(0, (S.cons.kyanite || 0) - 1); addItem(mkUniq('moonring', S.lvl)); recalc(); jot('moonring'); qEvent('talk', 'odette'); }); }
  if (qAt('q_unlink', 1)) { if (!hasCons('hblood')) { jumpQuest('q_unlink', 0); return say([[O, 'You had his blood and now you do not. I cannot do this with a promise. Bring me a vial.']]); } if (spent) return say(tired);
    return say([[O, 'His blood. Good. Sit. This will feel like a tooth coming out.'], [O, 'The witches who first did this cut a whole line loose at once, and it took the heart of a vampire nobody had made. I do not have one of those. I have his blood and a hundred dead women, and I can cut one thread at a time.'], [O, 'When it is done, his death is no longer yours. Everyone else he made is still tied to him. Ambrose is still tied to him.']], null, () => { S.cons.hblood--; unlinkSire(); diary('unlinked'); jot('sireline'); qEvent('talk', 'odette'); }); }
  const opts = [shop('odette')], slainC = !!(F.slain && F.slain.corvin);
  if (F.ringOff) opts.push(['"The ring has gone cold."', odetteAmends]);
  if (vamp && !S.original && !isHybrid() && S.venomUntil > absHours() && F.blood_odette === 1) opts.push(['"I have been bitten by a wolf."', () => say([[O, 'Sit down before you fall down. I kept his blood for exactly this.'], [O, 'Drink. All of it. It is the only thing there is.']], null, () => { F.blood_odette = 2; cureVenom('blood'); heal(P.maxHp * 0.5); jot('venom', 'hblood'); })]);
  if ((S.quests.q_deeper || S.deepest >= 19) && !canOpenSleeper()) opts.push(['"The door on the twentieth floor."', () => F.matriarch ? say([[O, "A Thorne sealed it, and it opens for a living Thorne witch or for Emeline's talisman. The Hundred have let me lift their altar stone. Here. It was under it all along."]], null, () => addCons('talisman')) : say([[O, "A Thorne sealed it. It opens for a living Thorne witch, or for Emeline's talisman, and the Hundred keep that under their altar."], [O, 'They are not themselves. Something at the Hollow has run them together into one voice. Break that, and they will let me lift the stone.']], null, () => { if (!S.quests.q_hollow && !S.done.q_hollow) startQuest('q_hollow'); })]);
  if (lineLinked() && S.codex.sireline && !S.quests.q_unlink && !S.done.q_unlink) opts.push(['"Cut me loose from Corvin\'s line."', () => say([[O, 'It can be done. It was done once, to a whole line at a stroke. I can manage one vampire.'], [O, 'I need his blood for it. Fresh enough to still know whose it is. He has to be alive when it is taken, so put him on the floor and take it before you decide anything else.'], [O, 'Until then, do not let anyone put white oak in him. You would be dead within the hour.']], null, () => startQuest('q_unlink'))]);
  if (S.codex.sireline && hasCons('hblood') && !F.ambroseFree && !F.ambroseDead && !slainC && !qAt('q_unlink', 1)) opts.push(['"Could you cut Ambrose out of the line?"', () => { if (spent) return say(tired); say([[O, 'With a vial of the blood, yes. One thread at a time. He would never know it had been done until the day Corvin died and he did not.'], [O, 'It uses the vial up. Are you sure that is what you want it for?']], [['"Do it."', () => { S.cons.hblood--; F.ambroseFree = 'spell'; sfx('magic'); toast("Odette cuts Ambrose Varga out of Corvin's line. Corvin's death can no longer reach him."); }], ['"Not yet."', () => { }]]); }]);
  if (hasCons('hblood') && !F.blood_odette) opts.push(["Leave a vial of Corvin's blood with her.", () => say([[O, 'Good. I will keep it under a cloaking spell, where nothing can find it by the smell.'], [O, 'It is the only cure there is for a werewolf bite. If one of them ever gets its teeth in you while you are dead, come here first. Take this for it. It was my grandmother\'s.']], null, () => { S.cons.hblood--; F.blood_odette = 1; addItem(genItem(S.lvl + 1, { base: 'talisman', rar: 3 })); jot('hblood', 'venom'); })]);
  if (S.done.q_witch && S.lvl >= 9 && !S.quests.q_hollow && !S.done.q_hollow) opts.push(['"Tell me about Coven Hollow."', () => say([[O, 'North, past the chapel road. A hundred of us were burned there in one night. They never left.'], [O, canMagic() && !vamp ? 'A living witch can lean on them. Lay a hand on the altar and they lend you all hundred at once. It comes out of you in blood, and too long would kill you.' : vamp ? 'They hate what you are. On their ground a daylight ring stops working and they will hurt you, unless a witch they trust has spoken for you.' : 'They lend their strength to living witches. They have nothing to give anyone else, and nothing against you either.'], [O, 'Lately something answers there after dark that is not a hundred women. It is one voice. The cultists at the chapel have been pulling on them until they ran together. Lay a hand on the altar at night, call it out, and break it.']], null, () => { jot('hundred'); startQuest('q_hollow'); })]);
  if (qAt('q_original', 3)) opts.push(['"The first spell. Will you cast it?"', () => say(S.heretic ? [[O, 'You do not need me. You kept your magic past dying. Say the words yourself, at the altar, after dark. I will not watch.']] : F.ringOff ? [[O, 'For you, as you are now? No. Make amends first.']] : [[O, 'Once. Because the alternative is that somebody worse does it for you and gets it wrong.'], [O, 'At the Hollow, after dark, with all three things on the altar. The Hundred will not thank me. Bring the brother, if he will come. The spell needs a death and I am not doing that part.']])]);
  if (F.casimirGone && vamp && !S.original && !F.cured && S.lvl >= 30 && !S.quests.q_original && !S.done.q_original) opts.push(['"The spell that made the first family."', () => say([[O, 'It is in the grimoire. Casimir told me what it costs before you put him away, and he was not exaggerating.'], [O, 'You die again. Nothing but white oak ends you afterwards, and nature will grow a new tree for the purpose. Everything you ever turn dies when you do. Only the Cure takes it back.'], [O, "It needs the doppelgänger's blood, white oak burned to ash, and the blood of the first family. Corvin's, since his brother is not offering."]], [['"Tell me what to bring."', () => startQuest('q_original')], ['"No."', () => { }]])]);
  opts.push(bye);
  say([[O, spent ? 'I cannot light a candle. Do not ask me for anything that needs more than a kettle.' : S.heretic ? pick(['Do not touch the stock. I can feel you taking.', 'I still sell to you. Think about why.']) : vamp ? pick(['You are letting the cold in. You are the cold.', 'I still sell to you. Think about why.']) : S.species === 'werewolf' ? pick(['Keep clear of the wolfsbane shelf. It will blister you through the paper.', 'Your aunt stood exactly there. Same frown.']) : pick(['The kettle is on. It is not for drinking.', 'Your aunt stood exactly there. Same frown.'])]], cap6(opts));
}

/* ---------------- Ambrose Varga ---------------- */
function ambroseExplain(first) {
  const A = 'Ambrose', og = S.origin, done = () => { if (first) qEvent('talk', 'ambrose'); };
  const lines = [[A, 'First my blood. It heals you, and for a day it sits in you and does nothing else.'], [A, 'Then you die. I can see to that quickly, or you can find your own way before the day is out. That is not difficult here.'], [A, 'You wake unfinished. In transition. Your gums ache, the lamp hurts, you can hear every heart in the house. You are not one of us yet, and the sun will not burn you yet.'],
    [A, 'From that waking you have one day. Drink human blood and it is finished, for good: the strength, the hunger, the sun as an enemy. Do not drink and you die at the end of the day, like anyone. People have chosen that. It is allowed.'], [A, "And know whose blood it is. I am of Corvin's line, so you would be too. If white oak ever finds his heart, everything of his line dies within the hour."]];
  if (og === 'witch') lines.push([A, 'One more thing. You have the smell of a Thorne about you. A witch who turns loses the craft, all of it, and nothing gives it back.']); else if (og === 'siphoner') lines.push([A, 'One more thing. I know what you are; the bridge lamps dim when you pass. Your kind keeps what it does. They call that a Heretic. It is not a compliment.']); else if (og === 'wolf') lines.push([A, 'One more thing. There is a wolf asleep in your blood. Turn before it wakes and it never will.']);
  jot('transition', 'vblood', 'sireline');
  say(lines, [['"Do it."', () => { done(); beginTransition('vampire', 'ambrose'); }], ['"Give me the blood. I will decide for myself."', () => say([[A, 'Sensible. It keeps in the vial, and it keeps a day in you. Drink it and die inside that day, and you wake in transition. Drink it and live, and it was only medicine.']], null, () => { addCons('vblood', 1); done(); })], ['"Not tonight."', () => say([[A, 'Then not tonight. The offer stands. It always will.']], null, done)]]);
}
function ambroseTalk(n) {
  const A = 'Ambrose', F = S.flags, vamp = isVamp(), tr = S.transition, cured = !!F.cured, human = S.species === 'human' && !tr, mortal = F.ambroseFree === 'cure';
  if (qAt('q_bridge', 1)) { const met = () => { diary('ambrose'); jot('whiteoak', 'sireline'); qEvent('talk', 'ambrose'); };
    const lines = [[A, 'A Fell. I would know that jaw anywhere. I knew the first woman who wore it.'], [A, 'I am Ambrose Varga. I died in 1864, the year this town burned its own, and I have stood on this bridge every night since they built it.'], [A, 'The timber they built it from was white oak. The sign on that rail still is. It is the only wood in the world that can kill the one my line began with, and if he dies, I die. So I watch it.'], [A, "His name is Corvin. A Thorne witch shut him under Fell's Church. Someone has been feeding him, and he is waking."]];
    if (vamp) { lines.push([A, lineLinked() ? 'And you are one of us already, and of his line, the same as I am. Hear it plainly: if Corvin is ever truly killed, you and I have about an hour. Remember that when the Council puts a stake in your hand.' : 'And you are one of us already. Then go down, and see what we come from.']); return say(lines, null, met); }
    if (tr) { lines.push([A, 'And you are in between. I can hear it. Somebody was careless, or you were. We will talk about that next.']); return say(lines, null, () => { met(); ambroseTalk(n); }); }
    if (cured) { lines.push([A, 'And you smell of nothing at all. You took the Cure. It is in you now; my blood would be wasted on you. Then you will have to stop him warm.']); return say(lines, null, met); }
    if (S.species === 'werewolf') { lines.push([A, 'And you carry the moon. Stay off this bridge when it is full: one bite from you in that shape and I am a day from dead. My blood cannot turn a wolf. Only his can, and what it makes belongs to him.']); return say(lines, null, met); }
    lines.push([A, 'You will not stop him as you are. I could give you what I have. I will tell you exactly what it is first, because nobody told me.']);
    return say(lines, [['"Tell me how it is done."', () => { diary('ambrose'); ambroseExplain(true); }], ['"No."', () => say([[A, 'Good. Say no for as long as you can. The offer stands; it always will.']], null, met)]]); }
  if (mortal) return say([[A, pick(['I ate an egg this morning. I had forgotten eggs.', 'My knees hurt. I am told that is normal. I am delighted.', 'I still come here at night. Habit. The cold is different when it can kill you.'])]]);
  const opts = [];
  if (tr && tr.to === 'vampire') opts.push(['"I woke up. What now?"', () => { jot('transition'); say([[A, 'Now you have until this time tomorrow. Human blood finishes it. Nothing else does: not an animal, not mine.'], [A, "I have a bag from Gault's cellar in my coat. It was given willingly. I will not put it in your hand unless you ask, and I will not think less of you if you do not."], [A, 'If you let the day run out, you die the ordinary way. I will sit with you, if you want company for it.']], [['"Give it to me."', () => { if (hasCons('bloodbag')) return say([[A, 'You are already carrying one. Drink it or do not.']]); addCons('bloodbag', 1); toast('A blood bag. Drinking it completes the change. It will ask you first.'); }], ['"I have not decided."', () => say([[A, 'Then do not let me decide for you. I am on this bridge until dawn.']])]]); }]);
  if (human && !cured) opts.push(['"Tell me again how it is done."', () => ambroseExplain(false)]);
  if (cured && !vamp) opts.push(['"Could you still turn me?"', () => say([[A, 'No. The Cure is in you now. My blood would heal you and that is all it would ever do. Nobody who has taken it can be turned again.']], null, () => jot('cure'))]);
  if (vamp && lineLinked()) opts.push(['"What happens to us if Corvin dies?"', () => say([[A, 'If he is staked with ordinary wood, or burned, or beheaded: nothing. He lies grey for a while and gets up angrier.'], [A, 'If white oak goes through his heart, he burns, and everything he ever made dies within the hour. Coughing blood, I am told. That is me, and it is you.'], [A, 'Two things would spare you. The Cure, if it exists. Or a witch cutting you out of the line; Odette Thorne says it can be done with his blood. Ask her before you go down there with a stake.']], null, () => jot('sireline'))]);
  if (vamp && !F.gaultIn) opts.push(['"Where does one of us sleep?"', () => say([[A, 'Nowhere a living person owns, unless they ask you in. You will have found that out on a porch by now.'], [A, "Gault holds the deed to my house. A living man's name on the paper means nothing dead crosses that sill uninvited, and that includes whatever comes up from the church. Tell him I sent you."]], null, () => { F.ambroseSent = 1; jot('invitation'); })]);
  if (hasCons('cure')) opts.push(['"I have the Cure. It is one dose."', () => say([[A, 'So it is real. Two thousand years of rumour, and it is in your pocket.'], [A, 'I have been cold since 1864. I do not know that I remember how to be anything else.'], [A, "But a living man is of nobody's line. If you mean to put white oak in Corvin, that dose is the difference between my dying on this bridge and my growing old near it."]], [['"Take it. I would rather you lived."', () => { S.cons.cure--; F.ambroseFree = 'cure'; if (!S.switchOff) S.humanity = Math.min(100, S.humanity + 10); sfx('heal'); jot('cure'); say([[A, 'It tastes of nothing.'], [A, '...I can feel the cold. I had forgotten that the cold is a thing you feel.'], ['', 'Ambrose Varga is human. Whatever happens to Corvin now, it will not reach him.']]); }], ['"Not yet."', () => { }]])]);
  if (hasCons('hblood') && !F.blood_ambrose) opts.push(["Give him a vial of Corvin's blood.", () => { if (!roomFor()) return; say([[A, 'A hundred and sixty years knowing my life hangs on his. If he dies, everything he made dies with him.'], [A, "And now I am holding a piece of him in a bottle. It changes nothing. I find I like it anyway. Take this. It was my mother's."]], null, () => { S.cons.hblood--; F.blood_ambrose = 1; addItem(genItem(S.lvl + 2, { slot: 'ring', rar: 4 })); }); }]);
  if (S.lvl >= 12 && !tr) opts.push(['"Fight me."', () => say([[A, vamp ? 'I wondered when you would ask. To the first fall. Try not to disappoint me.' : 'I have not been struck by the living in sixty years. To the first fall. Please.'], [A, 'I will yield when I have had enough. If I am on the ground and you put wood through my heart, that is not a duel any more. Mind where you put it.']], null, () => { const e = spawnEnemy('ambrose', n.x, n.z, Math.max(14, S.lvl + 1)); e.rot = n.rot; e.duel = 1; n.rig.g.visible = false; aggro(e); })]);
  opts.push(bye);
  say([[A, tr ? 'You woke. Good. Sit on the rail a moment; nobody is going to rush you.' : vamp ? pick(['How does it feel? No, do not tell me. I remember.', 'You feed carefully. I was the same, for a decade or so.', 'Gault keeps my cellar, at the manor. Everything in it was given willingly.']) : S.species === 'werewolf' ? 'Not too close, if you do not mind. I have seen what your kind\'s bite does to mine.' : cured ? 'You are warm for good now. I find I envy it.' : pick(['The offer stands.', 'You are getting faster. For one of the living.', 'I am not guarding the bridge. I am guarding what it was built from.'])]], cap6(opts));
}

/* ---------------- Old Wren ---------------- */
function wrenAlpha() {
  const W = 'Old Wren', carrier = S.origin === 'wolf' && S.species === 'human';
  const lines = [[W, 'There is a pack at the Falls. Good people, every night but one. Their alpha is Old Tobias, and he stopped chaining himself ten years ago.'], [W, 'Two campers last spring. A boy from the quarry road in the autumn. The paper said animal attack, and for once the paper was right.']];
  if (S.origin === 'wolf') { lines.push([W, 'The pack will not move against its alpha. But blood can challenge, and you have the blood. Meet him at the pool on a full-moon night. Win, and the pack answers to you.']);
    if (carrier) lines.push([W, 'Hear the price first. He will be a wolf, but he is a man, and killing him is taking a human life. The curse will wake in you. You will turn on every full moon for the rest of your life. I am not asking you to do it. I am telling you what it is.']);
    return say(lines, [[carrier ? '"I understand. I will challenge him."' : '"I will challenge him."', () => { if (carrier) S.flags.alphaOath = 1; startQuest('q_wren'); }], ['"No."', () => { }]]); }
  lines.push([W, isVamp() && !isHybrid() ? 'I would not ask one of yours if I had anyone else. His bite will kill you in a day. Do not let him land it.' : 'On the full moon he comes down to the pool as a wolf. A real one, the size of a pony. He dies like anything else that lives. He will not make it easy.'], [W, 'End it. Bring me word.']);
  say(lines, [['"On the full moon."', () => startQuest('q_wren')], ['"No."', () => { }]]);
}
function wrenTalk() {
  const W = 'Old Wren', F = S.flags, og = S.origin, were = S.species === 'werewolf', hyb = isHybrid(), vamp = isVamp() && !hyb;
  if (qAt('q_wren', 1)) return say(F.packAlpha ? [[W, 'It is done. I heard the pack go quiet, and then I heard them howl for somebody else.'], [W, 'They are yours to answer for now. That is all an alpha is: the one who answers. See that every one of them has a chain and uses it.']] : [[W, 'It is done. I felt the pack go quiet. They will choose another, and I will see that this one keeps a chain.'], [W, 'Take this. It is not what I would give a wolf, but you are not one.']], null, () => { if (!F.packAlpha && S.inv.length < 60) addItem(genItem(S.lvl + 1, { slot: 'amulet', rar: 3 })); qEvent('talk', 'wren'); });
  if (qAt('q_moonring', 1)) return say([[W, 'One moon. You have the look now. Everyone does after the first.'], [W, 'This is black kyanite, from the same seam as the one on my hand. A stone is only a stone. Take it to Odette Thorne. A witch has to spell it, and she is the only one in the county I would let near it.']], null, () => { addCons('kyanite', 1); qEvent('talk', 'wren'); });
  if (og === 'wolf' && !F.wrenTold) return say([[W, 'Sit by the fire. Let me look at you.'], [W, 'I knew your father. He ran with the Falls pack before you were born. He was a Lockwood, whatever name they put on your papers.'], [W, 'It comes down the blood. Not from a bite: that is a story. You are born carrying it, and it sleeps. It wakes the first time you take a human life, meant or not, and it never sleeps again.'],
    [W, were || hyb ? 'And yours is awake. I could smell it from the road.' : vamp ? 'Yours never woke, and now it never will. You died first. I am sorry for that, and a little relieved.' : 'Yours is asleep. That temper of yours, worse near the full moon: that is it turning over. Kill nobody and it stays asleep your whole life. Plenty of us have managed.'], [W, 'If it ever wakes, there is a low stone house west of the Falls den with our name over the door. Steps go down inside, and there are chains in the wall. Lockwoods have locked themselves in there for two hundred years. Before moonrise. Remember where I said.']], null, () => { F.wrenTold = 1; diary('wren'); jot('werewolf', 'fullmoon', 'cellar'); });
  const opts = [];
  if (!S.quests.q_wren && !S.done.q_wren && !F.alphaDead) opts.push(['"What is wrong at the Falls?"', wrenAlpha]);
  if (were && !S.quests.q_moonring && !S.done.q_moonring) opts.push(['"How do you stand it, every month?"', () => say([[W, 'I do not. Look at my hand. Black kyanite, spelled by a witch a long time ago. A moonlight ring.'], [W, 'With it the moon cannot force me. I turn if I choose, and if I do not, I keep the strength standing up. Wolfsbane still burns. It is not a cure.'], [W, 'I have one more stone. I will not give it to someone who has not been through a full moon and counted the cost. Chain up in the cellar, or run loose and live with it. Then come back.']], null, () => { jot('moonring'); startQuest('q_moonring'); })]);
  if ((were || hyb || og === 'wolf') && F.corvinAwake) opts.push(['"What do you know about hybrids?"', () => say([[W, 'That the one under the church makes them out of us. His blood, then a death, then the blood of a girl with a particular face, or you bleed from the eyes and die.'], [W, 'They do not turn with the moon. They do not hurt when they change. And they cannot lift a hand against him, because they are grateful, and he made the gratitude.'], [W, 'One of mine broke it. He went up into the hills and changed on purpose, over and over, until it stopped hurting. A hundred times, about. Then he owed nothing.']], null, () => { F.doppel = 1; jot('hybrid', 'sirebond'); })]);
  opts.push(shop('wren'), bye);
  say([[W, vamp ? 'You smell of the grave. Stay away from the Falls when the moon is full. One bite from one of us in that shape and you have a day.' : pick([`The moon is ${MOON[moonPhase()].toLowerCase()}. ${fullMoon() ? 'Tonight, then.' : 'Not tonight.'}`, 'Wolfsbane by the water. Sage in the south fields. I buy both.', 'Silver bullets. People will believe anything if it is in a film.'])]], opts);
}

/* ---------------- Casimir, and Corvin once he walks free ---------------- */
function casimirWarn() {
  const C = 'Casimir';
  say([[C, 'It can. Our mother wrote it down, and the Thorne woman can read.'], [C, 'Hear what it costs before you want it. You die again. The spell needs a death, and I would be the one to do it.'], [C, 'Nature answers every gift. The tree that makes you can unmake you, and somewhere a white oak will take root the day you rise. Somebody will find it. Somebody always does.'], [C, 'Everything you turn from then on is yours. When white oak finds you, every one of them dies inside the hour. You will be responsible for people you have never met.'],
    [C, 'The hunger does not shrink in a thousand years. The sun and vervain do not stop burning. And a curse laid on one of us does not end because we cannot die: my brother carried a hunter\'s curse for fifty-two years.'], [C, 'It needs three things. The blood of the doppelgänger. White oak, burned to ash. The blood of the first family. Then the Hollow, after dark, and a witch. Do you still want it?']], [['"Tell me where to start."', () => { jot('original', 'whiteoak', 'doppelganger'); startQuest('q_original'); }], ['"No."', () => say([[C, 'Good. That is the first sensible thing anyone has said to me in this town.']])]]);
}
function casimirTalk(n) {
  const C = 'Casimir', F = S.flags, vamp = isVamp(), fate = F.corvinFate, safe = immuneCompel(true);
  const fight = () => say([[C, 'I did wonder how long your manners would last.']], null, () => { const e = spawnEnemy('casimir', n.x, n.z, Math.max(20, S.lvl + 2)); e.rot = n.rot; F.casimirDay = S.day; n.rig.g.visible = false; aggro(e); });
  if (!F.casimirMet) return say([[C, 'You are the Fell who put the Warden down. I am Casimir. The man under your church is my brother.'], [C, 'We were made a thousand years ago, my family, by our mother, with a spell. There were no vampires before us. Every one you have met descends from one of us, and the ones in this county descend from him.'], [C, 'I do not want him dead. I want him in a box, where he has spent most of the last nine centuries, and where I can find him.'],
    [C, safe ? 'I could tell you to forget this conversation. It would not take. ' + (vamp ? 'Vervain, or something sturdier in you. I would like to know which.' : 'Vervain, or something sturdier. Sensible. Keep it up.') : vamp ? 'I could tell you to forget this conversation, and you would, dead as you are. Ordinary vampires cannot do that to each other. We can. Vervain would stop me, and it would burn you. I am choosing not to. Notice that.' : 'I could tell you to forget this conversation, and you would. You have not been drinking the coffee. I am choosing not to. Notice that, and start drinking it.'],
    [C, 'One more thing. The Gilroy girl has a face I have seen buried twice. Whatever my brother wants in this town, it starts with her blood.']], null, () => { F.casimirMet = 1; F.doppel = 1; diary('casimir'); jot('original', 'compulsion', 'doppelganger'); });
  if (fate && F.casimirSaid !== fate) { F.casimirSaid = fate;
    if (fate === 'oak') return say([[C, 'You put white oak in my brother.'], [C, 'I felt it. We always do. A thousand years, and I was not in the room.'], [C, 'He would have burned this town to the waterline and called it an afternoon. I know what he was. He was still mine.'], [C, 'I am not going to kill you. I am going to remember you, which is worse, coming from one of us. Do not let me find another of those stakes in your hand.']], [['"He left me no choice."', () => { }], ['"Come and try."', fight]]);
    if (fate === 'desic') return say([[C, 'It is done, then. I carried him up myself. He weighs nothing, like this.'], [C, 'Thank you. I do not say that often, and I have had a long time to practise not saying it.'], [C, 'I will stay a while. Somebody will try to feed him. Somebody always does. Take this. I have no use for money and you have no use for my gratitude.']], null, () => { S.gold += 400 + 40 * S.lvl; sfx('coin'); });
    return say([[C, 'You let him walk out. I watched him cross the square and tip his hat to a deputy.'], [C, 'He will keep whatever he promised you. He always keeps his word. He chooses his words so that keeping them costs him nothing.'], [C, 'When you are tired of him, put him down again and send for the witch. I will still have the coffin.']]); }
  const opts = [];
  if (!fate) opts.push(['"How do I stop your brother?"', () => say([[C, 'Three ways, and I will only help with one.'], [C, 'White oak through the heart, once he is down. It kills him. It also kills every vampire his blood ever made, inside the hour. I counted them once. I stopped counting.'], [C, 'The dagger your Council keeps: silver, dipped in the ash of the tree. It would hold me. It will not hold him. There is wolf in him, and silver is nothing to a wolf.'], [C, 'Or the Thorne woman stops his heart, the way her ancestor did. A living heart stops to pay for it. He greys, I put him in a box, and nobody dies. That is the one I will help with.']], null, () => jot('whiteoak', 'dagger', 'desicspell'))]);
  opts.push(['"What can kill you?"', () => say([[C, 'White oak. Nothing else. Stake me with anything else, burn me, break my neck: I lie grey for a while and get up, and I remember who did it.'], [C, 'The sun burns me without this ring. Vervain burns me. I need a door opened for me like any of them. Nature gave us everything and then sent the bill.'], [C, 'A werewolf bite kills the ones we made. On me it is a bad night.']], null, () => jot('original', 'venom'))]);
  if (vamp && !S.original && !F.cured && !S.quests.q_original && !S.done.q_original) opts.push(['"Could the spell that made you be done again?"', () => S.lvl >= 30 ? casimirWarn() : say([[C, 'On you? You have been dead five minutes. The spell would not kill you, it would only embarrass us both. Ask me when you have some years on you.'], ['', 'The spell is beyond you until level 30.']])]);
  if (qAt('q_original', 1) && !hasCons('hblood') && !F.casimirCup && fate !== 'oak') opts.push(['"I have none of Corvin\'s blood."', () => say([[C, 'Then it will be mine in the cup. We were made in the same hour, from the same blood. It will do.'], [C, 'I will be at the Hollow when you are ready. Somebody has to do the other part.']], null, () => { F.casimirCup = 1; })]);
  opts.push(['"I think you should leave town."', fight], bye);
  say([[C, pick(['My brother laughs when he is losing. Remember that.', 'This town puts vervain in the coffee. I have had worse welcomes.', 'I have a coffin in a truck behind the Grill. It is a good coffin.', 'You may stake me if it would make you feel better. It will not make any other difference.'])]], cap6(opts));
}
function corvinTalk(n) {
  const C = 'Corvin', F = S.flags, were = S.species === 'werewolf', bound = sireBound(), opts = [];
  if (!hasCons('hblood') && F.corvinVial !== S.day) opts.push(['"Your blood. You gave your word."', () => say([[C, 'So I did.'], [C, 'Fresh. It will close a werewolf bite, and nothing else on this earth will. It heals the living. Die with it in you and you wake up mine, one way or another.']], null, () => { F.corvinVial = S.day; addCons('hblood', 1); checkHave(); jot('hblood'); })]);
  if (were) opts.push(['"What would your blood make of a wolf?"', () => say([[C, 'What I am. No more full moons. No more waking in the leaves wondering whose blood that is. You change when you like, and it stops hurting.'], [C, 'My blood, then you die, then you wake needing the blood of the Gilroy girl before the day is out. Without hers you bleed from the eyes and that is the end. I lost a whole pack finding that out.'], [C, 'And afterwards you will be grateful to me. People call it a bond. I call it manners.']], null, () => { F.doppel = 1; jot('hybrid', 'sirebond', 'doppelganger'); if (!S.quests.q_hybrid && !S.done.q_hybrid) startQuest('q_hybrid'); })]);
  opts.push(['"What are you?"', () => say([[C, 'My mother made vampires of her children. My father was not her husband. He ran with wolves.'], [C, 'So the first time I killed, two things woke up in me instead of one. I change when I choose. The sun is nothing to me. My bite kills what my blood makes.'], [C, 'They tried a dagger on me once. Silver. My brother still has not forgiven me for laughing.']], null, () => jot('original', 'hybrid', 'dagger'))]);
  if (!bound) opts.push(['"We are not finished."', () => say([[C, 'No? Good. I was getting bored of being a guest.']], null, () => { const e = spawnEnemy('corvin', n.x, n.z, Math.max(12, S.lvl + 1)); e.rot = n.rot; F.corvinDay = S.day; n.rig.g.visible = false; aggro(e); })]);
  opts.push(bye);
  say([[C, bound ? pick(['You cannot even frown at me properly. It passes, if you work at it. About a hundred times.', 'There you are. Sit. I did you a kindness and you know it.']) : pick(['A hundred and fifty years under a church. You have put a road through my favourite field.', 'Your Council puts vervain in the coffee. I approve. It keeps the amateurs out.', 'I keep my word. Ask my brother. He will tell you it is the worst thing about me.'])]], opts);
}

/* ---------------- Corvin on the floor: the three ways it can end ---------------- */
function oakAftermath() {
  const F = S.flags; if (F.corvinFate === 'oak') return; const amb = !F.ambroseDead && !F.ambroseFree; F.corvinFate = 'oak'; F.corvinAwake = 0; if (!F.casimir) F.casimir = S.day; if (amb) F.ambroseDead = S.day; storySync();
  diary(amb ? 'oak' : 'oak2'); jot('whiteoak', 'sireline'); banner('Corvin is dead', 'His line dies with him');
  if (sk('h_five') > 0 && S.species === 'human') { F.mark = Math.max(F.mark || 0, 80); recalc(); toast('The mark runs to your collarbone in one breath. His whole line just died on your arm.'); if (qAt('q_five', 1)) advQuest('q_five'); }
  if (qAt('q_quarry', 0)) { toast('The quarry nest died with its maker. Hale will want to hear it.'); advQuest('q_quarry'); }
  if (qAt('q_first', 1)) qEvent('flag', 'corvinDown'); if (qAt('q_first', 2)) qEvent('flag', 'fate');
  setTimeout(() => toast(amb ? 'On Wickery Bridge, Ambrose Varga coughs once, looks at the water, and goes grey.' : F.ambroseFree === 'cure' ? 'On Wickery Bridge, Ambrose Varga feels nothing at all, and goes on breathing.' : "Odette's spell holds. Ambrose Varga feels the line go, and is still standing."), 5200);
}
function corvinOak(e) {
  const linked = lineLinked(), amb = !S.flags.ambroseDead && !S.flags.ambroseFree, lines = [['', 'White oak through the heart is the one thing that kills him. He burns, and the stake burns with him.'], ['', 'Everything he ever made dies within the hour: the quarry nest, every newborn in the cemetery' + (amb ? ', and Ambrose Varga on his bridge.' : '. Ambrose is out of his reach now.')]];
  if (linked) lines.push(['', "And you. You are of his line and still tied to it. Do this now and you cough blood on the hour and die with the rest. Only the Cure, or Odette's unlinking, would spare you."]); else if (isVamp() && S.sire === 'corvin') lines.push(['', 'Odette cut you out of his line. You will feel it go, and you will still be standing.']);
  lines.push(['', 'His brother Casimir will know whose hand it was.']);
  const go = () => { if (e.dead || !e.downed) return toast('He is already up.'); if (!holdsOak()) return toast('The white oak has to be in your hand.'); if (finishDowned(e)) oakAftermath(); }, no = ['Not like this.', () => { }];
  say(lines, linked ? [['Do it anyway.', () => say([['', 'This kills you too, within the hour. You are certain?']], [['I am certain.', go], ['No.', () => { }]])], no] : [['End him.', go], no]);
}
/* Corvin desiccated: nobody dies, his brother boxes him. who: 'self' the player's Desiccation skill (already paid for), 'own' the same spell chosen in the dialogue, 'you' Odette's spell on the player's heart, 'elise' on Elise's */
function corvinSleeps(e, who) {
  const F = S.flags; if (actors.includes(e)) removeActor(e); F.corvinFate = 'desic'; F.corvinAwake = 0; if (!F.casimir) F.casimir = S.day;
  if (who === 'own') pl.hp = Math.max(1, pl.hp - P.maxHp * 0.35); else if (who === 'you') { F.odetteSpent = S.day + 4; pl.hp = Math.max(1, P.maxHp * 0.2); } else if (who === 'elise') { F.odetteSpent = S.day + 4; F.eliseRest = S.day + 4; }
  addCons('hblood', 1); checkHave(); storySync(); diary('desic'); jot('desicspell', 'desiccation'); banner('Corvin sleeps', 'His brother carries him up in a coffin');
  toast(who === 'you' || who === 'elise' ? 'Odette drew one vial before his veins dried: for the bitten, she says. It is the last anyone will get from him.' : 'You drew one vial before his veins dried. It is the last anyone will get from him.'); qEvent('flag', 'fate'); save();
}
/* the Desiccation skill used on an Original in the middle of a fight is the same decision, made with the player's own hands */
function desicWatch() {
  const F = S.flags; if (RT.blk) return false; const c = actors.find(e => e.kind === 'enemy' && e.desiccated && !e.dead && e.def.original && (e.type === 'corvin' || e.type === 'casimir')); if (!c) return false;
  if (c.type === 'casimir') { if (F.casimirGone) return false; F.casimirGone = 'desic'; toast('Casimir lies grey and still. Hale will have him boxed and under the Council hall by morning, where nobody will think to feed him.'); return false; }
  if (F.corvinFate === 'desic') return false;
  blackout(['His skin goes to grey paper under your hand. The gold goes out of his eyes.', 'He is not dead. He will lie like this until someone feeds him.', 'On the stairs, a man in a good coat is waiting with a coffin.'], () => corvinSleeps(c, 'self')); return true;
}
function corvinDesic(e, own) {
  const O = 'Odette Thorne', beats = S.species === 'human' || S.species === 'werewolf', lines = [];
  if (own) { if (pl.hp < P.maxHp * 0.45) return toast('You are too hurt. The spell takes a third of you, and you have to live through it.'); lines.push(['', 'You know the spell. Your hand on his chest, and a living heart stopped to balance his. Yours is the one in the room.'], ['', 'It takes a third of your health. He will lie grey until someone feeds him, and nobody of his line dies.']); }
  else { if (odetteSpent()) return toast('Odette has nothing left to cast with. Give her a few days.');
    lines.push(['', 'You put your hand on his chest and say her name, the way she told you. A few minutes later there are footsteps on the stairs.'], [O, 'It is the spell my ancestor used on him. My hand on his heart, and his stops. The balance is a living heart, stopped for as long as it takes.'], [O, beats ? 'Yours is the one in the room. I will start it again afterwards. I have not lost one yet. I have also never done this.' : 'Yours does not beat, so it cannot pay. Elise Gilroy is at the top of the stairs. She offered before I asked.'], [O, 'It will burn me out for days. And he is not dead after it: anyone who feeds him wakes him. His brother has a coffin ready, and a promise I half believe.']); }
  say(lines, [[own ? 'Stop his heart.' : beats ? '"Stop mine."' : '"Let Elise do it."', () => { if (e.dead || !e.downed) return toast('He is already up.');
    blackout(own || beats ? ['Your heart stops. You hear it stop.', 'His skin goes to grey paper. The gold goes out of his eyes.', 'Then yours starts again, hard, like a door being kicked.'] : ['At the top of the stairs Elise Gilroy sits down very suddenly.', "His skin goes to grey paper under Odette's hand. The gold goes out of his eyes.", 'Elise breathes in. Odette does not get up for a long time.'], () => corvinSleeps(e, own ? 'own' : beats ? 'you' : 'elise')); }], ['Not this way.', () => { }]]);
}
function corvinBargain(e) {
  const C = 'Corvin', F = S.flags, were = S.species === 'werewolf';
  if (F.corvinFate === 'bargain') return say([['', 'You step back. The grey goes out of him from the chest outwards.'], [C, 'Feel better? Good. The arrangement stands. I am a patient man; I have had the practice.']], null, () => { if (!e.dead) removeActor(e); F.corvinDay = S.day; });
  say([['', 'You step back and wait. The grey goes out of him from the chest outwards. He sits up and sets his own shoulder.'], [C, 'You had me on the floor and you are still here. So you want something, or you are sentimental. I can work with either.'], [C, 'My blood closes a werewolf bite. Nothing else on this earth does. It turns a wolf into what I am. I will leave some with you now, and there is more whenever you ask.'], [C, 'In return I walk up those stairs and nobody puts white oak in my back. I have been under a church since 1864. I would like to see what you have done with the place.'],
    were ? [C, 'And you. I can smell the moon on you. Come and find me when you are tired of your bones breaking on its schedule and not yours.'] : lineLinked() ? [C, 'You are mine already, three or four makers removed. You will have noticed you were careful with me.'] : ['', 'He means it. He would be loose in the county, making more of his own.']],
    [['"Go. Keep your word."', () => { if (e.dead) return; removeActor(e); F.corvinFate = 'bargain'; if (!F.corvinAwake) F.corvinAwake = S.day; if (!F.casimir) F.casimir = S.day; F.corvinDay = S.day; addCons('hblood', 2); checkHave(); storySync(); diary('bargain'); jot('hblood', 'hybrid'); banner('Corvin walks free', 'His blood is on offer'); toast('From tomorrow he will be at Varga Manor. His hybrids will keep turning up on the East Bank.'); qEvent('flag', 'fate'); save(); }], ['"No."', () => { if (!e.dead && e.downed) e.downT = Math.min(e.downT, 0.4); toast('He is getting up, and he is no longer offering anything.'); }]]);
}
function corvinFate(e) {
  if (!e || e.dead || !e.downed || !pl || pl.dead || desicWatch()) return; const F = S.flags, bound = sireBound(), oak = holdsOak(), own = canMagic() && sk('w_desic') > 0, opts = [];
  if (oak && !bound) opts.push(['Drive the white oak through his heart.', () => corvinOak(e)]);
  if (own) opts.push(['Stop his heart yourself, with the desiccation spell.', () => corvinDesic(e, true)]); else if (F.desicReady) opts.push(["Say Odette's name. Have her stop his heart.", () => corvinDesic(e, false)]);
  opts.push([F.corvinFate === 'bargain' ? 'Step back. The bargain stands.' : 'Step back and let him wake. Hear his offer.', () => corvinBargain(e)]);
  if (!F.drewBlood) opts.push(['Take a vial of his blood and decide later.', () => { F.drewBlood = 1; addCons('hblood', 1); checkHave(); jot('hblood'); toast('A vial of the Blood of the First. He will get up in a few minutes. He will be on this floor when you come back.'); }]);
  opts.push(['Not yet.', () => { }]);
  say([['', 'Corvin lies grey on the stone, veins standing out like roots. It is not death. In a few minutes he will get up.'], ['', bound ? 'You are sired to him. Your hands will not close on anything that would end him.' : oak ? 'The white oak is in your hand. It would kill him for good, and everyone he ever made within the hour.' : hasStake() ? 'The white oak stake is in your pack, not your hand. Nothing else you own can end him.' : 'Nothing you are carrying can end him. Only white oak does that, and Hale can carve it from the old Wickery Bridge sign.']], opts);
}
function storyDowned(e) {
  const F = S.flags, t = e.type;
  if (t === 'corvin') { F.corvinDowned = (F.corvinDowned || 0) + 1; if (qAt('q_first', 1)) qEvent('flag', 'corvinDown'); banner('Corvin is down', 'It will not hold him for long'); jot('original');
    if (!e.fateInter) { e.fateInter = 1; RT.area.inter.push({ temp: 1, get x() { return e.x; }, get z() { return e.z; }, r: 3.8, label: () => e.downed && !e.dead && actors.includes(e) ? (e.desiccated ? 'Corvin lies desiccated' : 'Stand over Corvin and decide') : null, act: () => corvinFate(e) }); }
    setTimeout(() => { if (!dq && !RT.blk && !RT.menu && actors.includes(e)) corvinFate(e); }, 1300); return; }
  if (t === 'sleeper') { jot('cure', 'desiccation'); toast('The Sleeper goes still again. Nothing but white oak would end him, and he will wake hungry. What he was shut in with is yours to take.'); return; }
  if (t === 'casimir') { setTimeout(desicWatch, 1300); toast(hasCons('ashdagger') ? 'Casimir is down. He will be up in a few minutes, unless the ash dagger goes in and stays in.' : 'Casimir is down. He will be up in a few minutes, and nothing you are carrying will change that.'); }
}

/* ---------------- places ---------------- */
function originalRitual() {
  const O = 'Odette Thorne', F = S.flags, heretic = !!S.heretic, cup = hasCons('hblood') ? 'vial' : F.casimirCup ? 'brother' : null, bro = !F.casimirGone;
  if (S.original || F.cured || !isVamp()) return toast('The spell has nothing to take hold of in you.'); if (!isNight()) return toast('Not by daylight. The spell wants the dark, and the Hundred awake.');
  if (!hasCons('dblood') || !hasCons('oakwood') || !cup) return toast("The spell needs all three: the doppelgänger's blood, white oak to burn, and the blood of the first family.");
  if (!heretic && (F.ringOff || odetteSpent())) return toast(F.ringOff ? 'Odette will not cast for you until you have made amends.' : 'Odette has nothing left to cast with. Give her a few days.');
  say([[heretic ? '' : O, heretic ? 'You lay it out on the altar yourself. The words are yours to say: you kept your magic past dying, and tonight this is what it is for.' : 'I am doing this once. The Hundred will not thank me. Somebody worse would do it for you otherwise, and get it wrong.'], ['', "Wine in the cup, and Elise Gilroy's blood in the wine. White oak burned down to ash on the altar stone. " + (cup === 'vial' ? "Corvin's blood from the vial." : 'Casimir opens his own wrist over it.')], ['', 'Then you have to die again. The spell needs a death. ' + (bro ? 'Casimir has his sleeve rolled.' : 'The blade is on the stone.')], ['', 'After this, nothing but white oak ends you, and everything you ever turn dies when you do. The sun and vervain still burn. Only the Cure could take it back.']],
    [['Drink.', () => blackout(['The wine tastes of ash and of someone else\'s face.', 'A hand through your chest. It is very quick.', 'You wake on the altar stone. The Hundred are silent. Somewhere a tree has started to grow.'], () => { if (!becomeOriginal()) return toast('The spell does not take.'); S.cons.dblood--; S.cons.oakwood--; if (cup === 'vial') S.cons.hblood--; if (!heretic) F.odetteSpent = S.day + 3; qEvent('flag', 'ritual'); save(); })], ['Step back.', () => { }]]);
}
function callHundred() { if (actors.some(e => e.type === 'matriarch' && !e.dead)) return; sfx('howl'); RT.flashV = 0.2; toast('A hundred voices answer at once, and they are one voice.'); const e = spawnEnemy('matriarch', -20, -238, Math.max(12, S.lvl)); aggro(e); }
function hollowAltar() {
  const F = S.flags, vamp = isVamp(), night = isNight(), witch = canMagic() && !vamp, peace = !!F.matriarch, opts = [];
  if (qAt('q_original', 3)) opts.push(['Begin the spell that made the first family.', originalRitual]);
  if (witch && !(F.hundredT > absHours())) opts.push(['Channel the Hundred.', () => { channelHundred(); }]);
  if (!peace && night && !(F.matDay != null && S.day - F.matDay < 3) && !actors.some(e => e.type === 'matriarch' && !e.dead)) opts.push(['Call out the one voice.', callHundred]);
  const line = vamp ? (peace || F.vouched ? 'The stones know what you are. They have been told to leave you alone, and they do, barely.' : 'The stones know what you are. A hundred dead witches want you off their ground.') : witch ? `A hundred witches were burned here in one night. They are still here${peace ? ', and themselves again' : ''}. A living witch can lean on them: twice the spell power for forty seconds, paid for in blood.` : 'An altar stone, cold even at noon. Whatever is here has nothing to say to someone with no magic in their blood.';
  if (!opts.length) return toast(line + (peace || night ? '' : ' After dark, something else answers.'));
  opts.push(['Step back.', () => { }]); say([['The altar', line + (peace || night ? '' : ' After dark, something else answers.')]], opts);
}
function lockwoodCellar() {
  jot('cellar'); const head = 'The Lockwood cellar';
  if (S.species !== 'werewolf') return say([[head, 'An iron door set into the bank, with LOCKWOOD cut into the lintel. Behind it, steps go down. Chains are bolted into the far wall, and the inside of the door is scored, top to bottom, by something with claws.'], ['', isHybrid() ? 'You choose when you change. The chains are for those who cannot.' : S.origin === 'wolf' && !isVamp() ? 'They are not for you. Not unless the thing asleep in your blood wakes up.' : isVamp() ? 'It smells of wolf. Every instinct you have says to be somewhere else when the moon is full.' : 'Whoever uses this place comes here on purpose, once a month, and locks the door from the inside.']]);
  const ring = hasUniq('moonring'), tonight = fullTonight();
  say([[head, 'Steps down under the Lockwood lintel. Chains bolted into the stone, and a door scored from the inside. Lock yourself in before moonrise and the wolf spends the night behind it.'], ['', ring ? 'The ring keeps the moon off you. You do not need the chains while you wear it.' : tonight ? 'The moon is full tonight. Lock the chains now and you wake here at dawn, and nobody is hurt.' : 'The moon is not full tonight. Come back on the day it is, before dark.']], tonight && !ring ? [['Lock the chains.', () => chainUp()], ['Not yet.', () => { }]] : null);
}
function bridgeSign() {
  const A = 'Ambrose', F = S.flags, want = (qAt('q_oak', 1) || qAt('q_original', 2)) && !hasCons('oakwood');
  if (!want) return say([['The old sign', 'WICKERY BRIDGE · 1912. The paint has gone. The wood has not: a hundred years in the weather and not a soft spot in it.']]);
  const take = () => { const beam = !!F.signTaken; addCons('oakwood', 1); F.signTaken = 1; storySync(); sfx('open'); jot('whiteoak'); toast(beam ? 'A beam of the old bridge, black from the river and sound all the way through.' : 'The sign comes away from the rail in one piece. It is heavier than it looks.'); checkHave(); };
  const amb = actors.find(a => a.kind === 'npc' && a.npc.id === 'ambrose' && a.rig.g.visible);
  if (amb && !F.signTalk && F.ambroseFree !== 'cure') return say([[A, 'So the Council has finally read its own mill records.'], [A, 'I have stood over that wood since they built this bridge. I could stop you. Then someone else would come, and I would have to stop them too, for ever.'], [A, lineLinked() ? 'You know what it does to both of us. If you carve it, see a witch about your own neck before you use it.' : F.ambroseFree ? 'Take it. It cannot reach me any more, and I find I am tired of standing here.' : 'If that wood finds his heart, I have about an hour. I would like you to remember that you were told.']], [['Take it.', () => { F.signTalk = 1; take(); }], ['Leave it for now.', () => { }]]);
  take();
}
function elspethBox() {
  if (!roomFor()) return; S.flags.box = 1;
  say([['', "Letters, mostly, in your aunt's square hand. Forty years of Council minutes that say 'animal attack' and mean something else."], ['', 'Under them, a heavy ring with the Fell crest, and a note.'], ['Elspeth', 'Spelled by a Thorne in 1864. If something unnatural kills you while you wear it, you wake up. It only works on plain people, which is what most of us are. It takes a little each time. Do not lean on it.']], null, () => { addItem(mkUniq('fring', S.lvl)); diary('fring'); jot('fring', 'council'); });
}
function yourRoom() {
  if (isVamp() && !S.flags.invited) return toast("Your foot will not cross the sill. This is Mrs. Pruitt's house, and she has not asked you in.");
  const opts = [['Sleep until morning.', () => sleepUntil(8)], ['Sleep until dusk.', () => sleepUntil(20.5)]]; if (!S.flags.box) opts.push(["Open Elspeth's box.", elspethBox]); opts.push(['Not now.', () => { }]);
  say([['Your room', "Elspeth's bed, Elspeth's lamp, Elspeth's box on the dresser. The window faces east."]], opts);
}

const NPCS = [
  { id: 'marnie', n: 'Marnie', x: 0, z: -30, rot: 0, look: { cloth: 0x8a4a3a, hair: 0x8a2f1a, long: 1 }, talk() { const M = 'Marnie', vamp = isVamp();
    if (qAt('q_arrive', 0)) return say([[M, "You are Elspeth's. You have her jaw."], [M, "She said you would come when the letters stopped. There is a room at Pruitt's, paid through the winter. West side of the square."], [M, 'Coffee is on the house for founding families. Drink it every day. It tastes like weeds and I am not going to tell you why.'], [M, 'You want work? Take this next door to Odette Thorne. Do not open it, do not sniff it, and do not let her read your palm.']], null, () => qEvent('talk', 'marnie'));
    if (qAt('q_arrive', 2)) return say([[M, 'She took it? Good. Here, eat something. You look like a ghost.'], [M, 'One more thing. My delivery boy went up the cemetery road last night and did not come back. The paper will call it an animal attack. It always does.'], [M, '...If you are out after dark, look. West road, through the iron gate. But you stay on the path.']], null, () => qEvent('talk', 'marnie'));
    say([[M, S.transition ? 'You are grey as dishwater. Sit down before you fall down.' : vamp ? pick(['You look less like a ghost. Or more. Hard to say with you.', 'Bourbon is behind the bar. It takes the edge off, I am told.', 'You have stopped ordering the coffee. I notice things.']) : pick(["Burger's good. Coffee is free for founding families, and I would not skip it.", 'Board by the door has work on it, if you have the stomach.', 'Elise Gilroy was asking after you. She is usually by the gazebo.'])]],
      [shop('marnie'), ['"Heard anything?"', () => say([[M, pick(RUMOURS)]])], ['The notice board.', () => openMenu('bounty')], ['"What is in the coffee?"', () => say([[M, 'Vervain. A weed; it grows in the north woods. Hale has us put it in every pot.'], [M, 'Drink a cup and for a day nobody can look you in the eye and tell you what to think. I did not believe it either. Then I watched a man try it on my cook.'], [M, vamp ? 'There is bourbon, if that sits better with you. Your sort always wants the bourbon.' : 'So drink it. And if someone at my bar will not touch theirs, sit somewhere else.']], null, () => jot('vervain', 'compulsion'))], bye]); } },
  { id: 'odette', n: 'Odette Thorne', x: -20, z: -30, rot: 0, look: { cloth: 0x4f2f72, hair: 0x0c0808, skin: 0x7a5236, pants: 0x1a1020, long: 1, coat: 1 }, talk() { odetteTalk(); } },
  { id: 'hale', n: 'Captain Hale', x: 35.5, z: 10, rot: -PI / 2, look: { cloth: 0x2a3a5c, hair: 0x6a6a6a, pants: 0x1a1c26, hat: 1, armor: 1 }, scale: 1.08, talk() { const H = 'Captain Hale', F = S.flags, vamp = isVamp();
    if (qAt('q_bump', 2)) return say([[H, 'Sit. No, stand. You will want to be standing.'], [H, 'What came at you up there was a person a week ago. Now it is a vampire: fast, strong, and dead by any measure that matters.'], [H, 'Wood through the heart ends them. Fire and sunlight too. Take the head or the heart and that works. Anything less and they lie grey for a few breaths and get up. Break the neck and you have bought yourself an hour, no more.'], [H, 'Vervain burns them. Drink it, and they cannot get inside your head. That is what is in the coffee. Do not bother with garlic or crosses. Do not bother with silver either, for anything.'],
      [H, "The Founders' Council has kept this quiet since 1864. You are a Fell. That makes it your inheritance. Take these, and look at the board outside the Grill when you want work."]], null, () => { diary('hale'); jot('vampire', 'killing', 'council'); qEvent('talk', 'hale'); });
    if (qAt('q_council', 1)) return say([[H, "Six. You counted? I counted. Here. And this was your aunt's: a Council watch. There is a compass in the case that a witch spelled in 1864. It points at them."], [H, 'There is a man on Wickery Bridge every night. Has been since they built it. He has never crossed into town and we have never been able to make him leave.'], [H, 'Go east along the road after dark and look at him. Do not get close.']], null, () => qEvent('talk', 'hale'));
    if (qAt('q_oak', 0)) return say([[H, 'Odette told me what is on the tenth floor. One of the first of them. Stakes do nothing permanent. I was in the Council records all night.'], [H, 'There was a tree once that could kill them. They burned it a thousand years ago. Another grew from the ash, and in 1912 the mill cut it down and built Wickery Bridge out of it. Nobody knew what it was.'], [H, 'The bridge has been rebuilt since. The old sign is still wired to the rail at the town end. White oak. That is why Varga has stood there every night for a hundred years: he is guarding the only wood that can kill what his line began with.'], [H, 'Bring me that sign and I will carve you a stake. Go by day, when he is not there. Or go at night and hear what he has to say about it. He has always been civil.']], null, () => { jot('whiteoak'); qEvent('talk', 'hale'); });
    if (qAt('q_oak', 2)) { if (!roomFor()) return; return say([[H, 'That is it. A hundred years in the weather and not a soft spot in it.'], [H, 'There. Carved from the old Wickery Bridge sign. The whole bridge was white oak and nobody knew.'], [H, 'Understand what you are holding. Against anything else it is a stick. Through the heart of one of the first family, when he is down, it kills him for good and burns up doing it. One stake, one of them.'],
      [H, 'And Odette says everything he ever made dies with him, inside the hour. Varga. The quarry nest. ' + (vamp ? 'You, if what I am starting to think about you is right. Deal with that before you use it.' : 'I can live with that. Decide whether you can before you are standing over him.')]], null, () => { S.cons.oakwood = Math.max(0, (S.cons.oakwood || 0) - 1); F.stakes = (F.stakes || 0) + 1; addItem(mkUniq('whiteoak', S.lvl)); jot('whiteoak', 'sireline'); qEvent('talk', 'hale'); }); }
    if (qAt('q_quarry', 1)) return say([[H, F.slain && F.slain.corvin && !(F.slain && F.slain.lenore) ? 'The whole nest, grey where they stood, and nobody near them. I do not need to know how. Take the bow anyway.' : 'The matron. We lost four men finding that nest. Take the bow. It has thirty years of my practice in the stock.']], null, () => qEvent('talk', 'hale'));
    if (vamp && S.exposure >= 50) return say([[H, 'I know what you are. Walk away while I am still deciding.']]);
    const opts = [shop('hale')], slain = F.slain || {};
    if (S.done.q_council && S.lvl >= 10 && !S.quests.q_quarry && !S.done.q_quarry && !slain.lenore && !slain.corvin) opts.push(['"Anything bigger?"', () => say([[H, 'Blackridge Quarry, south-east. There is a nest. A matron and everything she has made. We lost four men finding that out.'], [H, 'She only comes up after dark. Bring wood, or fire. And finish her when she drops, or she gets up.']], null, () => startQuest('q_quarry'))]);
    if ((F.casimirMet || F.corvinFate) && !F.gotDagger) opts.push(['"What stops an Original, short of white oak?"', () => say([[H, 'This. Silver, dipped in the ash of the old tree. The Five carried them nine hundred years ago; the Council has had this one since 1864.'], [H, 'In the heart of one of them, once he is down, it holds him like the dead for as long as it stays in. Pull it out and he wakes.'], [H, 'It does nothing to the one under the church. There is wolf in him, and silver is nothing to a wolf. And it kills any vampire who drives it in. ' + (vamp ? 'I am looking at you when I say that.' : 'So it has to be one of us.')]], null, () => { F.gotDagger = 1; addCons('ashdagger', 1); jot('dagger'); })]);
    if (F.stakes > 0 && F.stakes < 3 && !hasStake() && !hasCons('oakwood')) { const cost = 300 + 20 * S.lvl; opts.push(['"Is there any of the sign left?"', () => { if (!roomFor()) return; say([[H, `Enough for ${F.stakes === 1 ? 'two more, with care' : 'one more, and then it is shavings'}. It is a day's work. ${cost} gold, for the Council fund.`]], [[`Pay ${cost} gold.`, () => { if (S.gold < cost) { sfx('deny'); return toast('Not enough gold.'); } S.gold -= cost; F.stakes++; addItem(mkUniq('whiteoak', S.lvl)); sfx('coin'); }], ['"Not now."', () => { }]]); }]); }
    if (hasCons('hblood') && !F.blood_hale) opts.push(["Give him a vial of Corvin's blood.", () => say([[H, 'His blood. In my hall.'], [H, 'Into the furnace, with my own hands. One less way for anyone in this town to wake up wrong. Here. The Council pays its debts.']], null, () => { S.cons.hblood--; F.blood_hale = 1; S.gold += 250 + 30 * S.lvl; sfx('coin'); })]);
    opts.push(['"Tell me about the Council."', () => say([[H, 'Founding families. Fell, Gilroy, Lockwood, Hale, a few more. In 1864 we rounded up twenty-seven of them to burn in Fell\'s Church. We told the town it was a battle.'], [H, 'They did not burn. A Thorne witch shut them in the tomb underneath instead, and they have been drying out down there ever since. We found that out rather late.'], [H, 'We keep what the families were given. Watches that point at vampires. Rings that bring an ordinary person back. A device in the vault: wind it, and every vampire and every wolf within a few streets drops screaming. It does not ask who its friends are.']], null, () => jot('council', 'tomb', 'fring'))], bye);
    say([[H, vamp ? pick(['You smell different. Like the cold. ...Tell me I am wrong.', 'The first body, and it will not matter whose kin you were.']) : pick(['Keep your stakes dry.', 'You are still alive. That puts you ahead of most volunteers.', 'Heart or head. Everything else is a delay.'])]], cap6(opts)); } },
  { id: 'pruitt', n: 'Mrs. Pruitt', x: -37.6, z: -3.5, rot: PI / 2, look: { cloth: 0x7a6a5a, hair: 0xc0b4a0, long: 1 }, talk() { const Pn = 'Mrs. Pruitt', vamp = isVamp(), opts = [];
    if (qAt('q_locket', 1)) { if (!roomFor()) return; return say([[Pn, 'That is the one. E.F. They buried it with her mother by mistake in 1994.'], [Pn, 'There is vervain packed behind the glass. She refilled it every spring and never told me why, and I never asked. ' + (vamp ? 'I would not put it on, dear. Not as you are now.' : 'Wear it. Nobody will talk you into anything while you do.')]], null, () => { S.cons.locket = 0; addItem(mkUniq('vlocket', Math.max(3, S.lvl))); jot('vervain'); qEvent('talk', 'pruitt'); }); }
    if (vamp && !S.flags.invited) return S.humanity < 30 ? say([[Pn, 'You are standing very carefully on my porch. I know why.'], [Pn, 'Not tonight. I have read what the paper is calling animal attacks. Come back when you can look at me.']]) : say([[Pn, 'You are standing very carefully on my porch.'], [Pn, 'Elspeth told me there might come a night when one of hers could not cross that sill without being asked. She told me what to say, and she told me to think hard first.'], [Pn, 'I have thought. You wiped your feet when you were alive.'], [Pn, 'Well, come in then.']], null, () => { S.flags.invited = 1; sfx('quest'); diary('invited'); jot('invitation'); toast('You can enter the boarding house. An invitation only has to be given once.'); });
    if (!S.quests.q_locket && !S.done.q_locket && S.done.q_arrive) opts.push(['"Did you know my aunt?"', () => say([[Pn, 'Forty years. They buried her with the wrong locket. Hers went into the Fell crypt by mistake in 1994, with her mother.'], [Pn, 'It is in a chest at the back of the old cemetery, behind the mausoleum, if nobody has robbed it. I would like you to have it.']], null, () => startQuest('q_locket'))]);
    opts.push(['Sleep until morning.', () => sleepUntil(8)], ['Sleep until dusk.', () => sleepUntil(20.5)], bye); say([[Pn, pick(['Breakfast is at seven. I do not care what you are after dark as long as you wipe your feet.', 'Your room is as she left it. Her box is still on the dresser.', 'You have her way of coming in late.'])]], opts); } },
  { id: 'ambrose', n: 'Ambrose Varga', x: 203, z: -40, rot: -PI / 2, look: { cloth: 0x6a1019, hair: 0xc9c2b0, skin: 0xeadccb, pants: 0x0c0c10, coat: 1 }, scale: 1.12, when: () => isNight() && !S.flags.ambroseDead && S.flags.ambroseDay !== S.day && !actors.some(e => e.kind === 'enemy' && e.type === 'ambrose' && !e.dead), talk(n) { ambroseTalk(n); } },
  { id: 'gault', n: 'Mr. Gault', x: 240, z: -45, rot: -PI / 2, look: { cloth: 0x1a1a1e, hair: 0x2a2a2a, pants: 0x101012, coat: 1 }, talk() { const G = 'Mr. Gault', vamp = isVamp(), tr = S.transition;
    if (vamp && !S.flags.gaultIn) return say([[G, 'Stop there, please. You will find you have to.'], [G, "I hold the deed to this house. A living man's name on the paper, and nothing of your kind crosses that sill unless I say so. Master Varga pays me to be particular about it."], [G, S.flags.ambroseSent || S.sire === 'corvin' ? 'He said to expect you. Come in.' : 'You are not of his making. He said to expect that too, one day. Come in.']], null, () => { S.flags.gaultIn = 1; sfx('quest'); jot('invitation'); toast('You have been invited into Varga Manor. Gault sells blood that was given willingly.'); });
    if (vamp) return say([[G, pick(['Master Varga keeps a cellar. Everything in it was given willingly. I checked.', 'The bourbon is for the hunger. It does not cure it. It makes it polite.', 'There is a cot in the cellar with no window. You are welcome to the day.'])]], [shop('gault'), ['Sleep in the cellar until dusk.', () => sleepUntil(20.5)], bye]);
    if (tr && tr.to === 'vampire') return say([[G, 'You have a day on your hands. I know the look; I have seen it on this step before.'], [G, 'The bags are human and were given willingly. I sell them. What you do with one is your decision and nobody else\'s.']], [shop('gault'), bye]);
    say([[G, 'Deliveries at the rear. No, you may not come in.']]); } },
  { id: 'abel', n: 'Farmer Abel', x: 22, z: 206, rot: PI, look: { cloth: 0x7a6a3a, hair: 0x9a7a44, hat: 1, pants: 0x3a3020 }, talk() { const Fa = 'Abel';
    if (!S.quests.q_farm && !S.done.q_farm) return say([[Fa, 'Something has been at my herd. Comes out of the tree line after dark, takes one, and leaves the rest standing there too scared to low.'], [Fa, 'Wolves, mostly. Lately not only wolves. I will pay for five dead, any kind, on my land at night.']], [['"I will do it."', () => startQuest('q_farm')], bye]);
    if (qAt('q_farm', 1)) return say([[Fa, 'Five. I heard it from the porch. Here.'], [Fa, "And take my father's knife. He had the blade silvered and swore it kept the wolves off. It never did a thing that I saw. It is a good knife anyway."]], null, () => qEvent('talk', 'abel'));
    say([[Fa, pick(['Deer come down to the south field at dawn. Easy meat, if you need it.', 'Rain soon. My knee says so.', 'Full moon, I keep the herd in the barn. Learned that the dear way.'])]]); } },
  { id: 'wren', n: 'Old Wren', x: -113, z: 168, rot: -PI / 2, look: { cloth: 0x4a5a3a, hair: 0xe0d8c8, long: 1, hood: 0 }, talk() { wrenTalk(); } },
  { id: 'bex', n: 'Quartermaster Bex', x: -227, z: -66, rot: PI / 2, look: { cloth: 0x4a4230, hair: 0x1a1210, hat: 1, armor: 1, pants: 0x1c1a16 }, talk() { const B = 'Bex', vamp = isVamp();
    if (qAt('q_bex', 1)) return say([[B, 'Five. I can tell from how you are standing. Take it.']], null, () => qEvent('talk', 'bex'));
    if (vamp) return say([[B, S.exposure >= 30 ? 'Camp is closed to your kind. Walk.' : 'You are quiet. And cold. And the needle on my watch has been spinning since you walked up. I am not selling you anything pointed.']]);
    const opts = [shop('bex')];
    if (!S.quests.q_bex && !S.done.q_bex) opts.push(['"Teach me something."', () => say([[B, "Hale's new Fell. Everyone can swing. Show me you can wait."], [B, 'Block at the last instant, when the blow is already coming, and you turn it. Do that five times, on anything, and I will open the good crate.']], [['"Five."', () => startQuest('q_bex')], ['"Later."', () => { }]])]);
    opts.push(['"Tell me about the hunters."', () => { const pot = S.origin === 'human' && S.species === 'human' && !S.transition && !S.quests.q_five && !S.done.q_five;
      const lines = [[B, 'Two kinds. Council first: deputies, founders\' sons, people like me. Wooden rounds, vervain in darts and grenades, wolfsbane for the Falls. A wooden bullet does not kill one of them. It stays in and stops them healing until they dig it out.'], [B, 'Then there are the Five. Not Council. Five hunters, made by a witch nine hundred years ago. When one dies, somebody somewhere makes a kill and wakes up with the mark on his hand.'], [B, 'You cannot compel one. Not even the old ones can. They are stronger than us, and they cannot stop: every vampire, even one they love. The mark grows with each kill, and only another hunter can see it.'], [B, 'And if a vampire kills one of the Five, the dead man follows it about telling it to die, until the next hunter wakes. I watched a three-hundred-year-old thing walk into the sun over that.']];
      if (pot) lines.push([B, 'There was a man through here last month with ink from his knuckles to his neck. Nobody saw it but me, and I only saw the edge.'], [B, 'You are squinting as if you would have seen all of it. That makes you what they call a potential. Keep killing them and train until there is nothing left to learn. If it is in you, it will come up on your hand.']);
      say(lines, null, () => { jot('council', 'five', 'curse'); if (pot) startQuest('q_five'); }); }], bye);
    say([[B, S.species === 'werewolf' ? 'Something about you sets the dogs off. Keep it at the Falls and we have no quarrel.' : pick(['Bolts are free. Dying is not.', 'Wolfsbane for the Falls. Oak for the graves.', 'Silver? Sell it to tourists.'])]], opts); } },
  { id: 'elise', n: 'Elise Gilroy', x: 13.2, z: 12.5, rot: -PI / 2, verv: 1, look: { cloth: 0x9a3a4a, hair: 0x2a1a12, skin: 0xd8b49a, pants: 0x1a1c26, long: 1 }, talk() { const E = 'Elise Gilroy', F = S.flags, tr = S.transition, resting = (F.eliseRest || 0) > S.day, sore = [[E, 'My chest still hurts from what Odette needed of me. Ask me in a few days.']];
    if (tr && tr.to === 'hybrid' && !hasCons('dblood')) return say([[E, 'Your eyes are bleeding. Sit down. I know what this is; Odette told me what to look for.'], [E, 'You died with his blood in you, and now only mine finishes it. Without it you do not see tomorrow night.'], [E, 'I am not going to make that choice for you. Here. Drink it or do not.']], null, () => { addCons('dblood', 1); F.eliseMet = 1; F.doppel = 1; jot('doppelganger', 'hybrid'); if (qAt('q_hybrid', 1)) qEvent('talk', 'elise'); });
    if (!F.eliseMet) return say([[E, "You are the new Fell. Elspeth's. I am Elise. Gilroy, on paper: they adopted me. Founding family, so I get the bunting and the bitter coffee."], [E, "People here will tell you that you have somebody's jaw. They tell me I have somebody's whole face, and then they will not say whose."], [E, 'I gave blood at the clinic in the spring. Three bags. They lost all three. I think about that more than I should.']], null, () => { F.eliseMet = 1; });
    if (qAt('q_hybrid', 1)) { if (resting) return say(sore);
      return say([[E, 'You want my blood. I can tell before you ask; people get a look.'], [E, 'I know what it does. A wolf who dies with his blood in them wakes up dying, and mine is the only thing that finishes it. No more full moons. And they belong to him afterwards, until they break it.'], [E, 'So tell me one thing. Is this what you want, or what he wants?']], [['"It is what I want."', () => say([[E, 'Then here. One vial, drawn this morning; I had a feeling. His blood first. Then you have to die, and then you have a day. Do not lose this.']], null, () => { addCons('dblood', 1); F.doppel = 1; jot('doppelganger', 'hybrid'); qEvent('talk', 'elise'); })], ['"I am not sure yet."', () => say([[E, 'Then come back when you are. It is not a thing to be talked into.']])]]); }
    if (qAt('q_original', 0) && !hasCons('dblood')) { if (resting) return say(sore);
      return say([[E, 'I know why you are here. I was told you would come.'], [E, 'The spell that made his family. It was a face like mine in the cup the first time. I have read about her. She did not get a say.'], [E, 'I am getting one. One vial, and then I want nothing more to do with it.']], [['"Thank you."', () => { addCons('dblood', 1); F.doppel = 1; jot('doppelganger'); checkHave(); }], ['"Keep it. I have changed my mind."', () => { }]]); }
    const opts = [];
    if (F.doppel) opts.push(['"Do you know what you are?"', () => say([[E, 'Odette sat me down when I was sixteen. A doppelgänger. A copy. Nature keeps making this face, and it is always mortal, and it is always in the middle of something.'], [E, "Blood from a face like mine was in the spell that made the first of them, a thousand years ago. And it is the only thing that finishes one of Corvin's hybrids. That is where my three bags went."], [E, 'It only works while I am alive and human. If I turned, it would be worth nothing to any of them. Do not think I have not considered it.']], null, () => { diary('elise'); jot('doppelganger'); })]);
    else opts.push(['"Whose face?"', () => say([[E, 'If I knew, I would tell you. Ask Odette Thorne. She looks at me the way you look at a clock.']])]);
    opts.push(['"Is that vervain?"', () => say([[E, 'The bracelet. Hale gave one to every Council child. Nobody gets inside my head, and anything that bites me regrets it.']], null, () => jot('vervain'))], bye);
    say([[E, resting ? 'I am all right. It only stopped for a minute. Odette says that is what it is supposed to do.' : pick(["Founder's Day. I have to wave from a float. Pray for me.", 'You are settling in. You have stopped looking over your shoulder. I would start again.', 'Marnie says you take the coffee black. Good. Keep taking it.'])]], opts); } },
  { id: 'casimir', n: 'Casimir', x: 27, z: -23.5, rot: -0.85, scale: 1.1, look: { cloth: 0x1a1c24, hair: 0x2a1c12, skin: 0xe2d6c8, pants: 0x0e0e12, coat: 1 }, when: () => !!S.flags.casimir && !S.flags.casimirGone && S.flags.casimirDay !== S.day && !actors.some(e => e.kind === 'enemy' && e.type === 'casimir' && !e.dead), talk(n) { casimirTalk(n); } },
  { id: 'corvin', n: 'Corvin', x: 240, z: -36, rot: -PI / 2, scale: 1.2, look: { cloth: 0x5a0a14, pants: 0x0c0c10, skin: 0xe0d8d0, hair: 0xb89a5a, coat: 1 }, when: () => S.flags.corvinFate === 'bargain' && !(S.flags.slain && S.flags.slain.corvin) && S.flags.corvinDay !== S.day && !actors.some(e => e.kind === 'enemy' && e.type === 'corvin' && !e.dead), talk(n) { corvinTalk(n); } },
];
const TOWNIE_BARKS = ['Evening. You are the Fell kid, right?', 'Do not stay out late.', 'Coffee at the Grill tastes like weeds lately. I drink it anyway.', 'They never did find the delivery boy.', 'My dog will not go near the cemetery road.', "Founder's Day is coming. They are hanging the bunting.", 'You look pale. Are you eating?', 'Lock your windows. And do not ask anyone in.', 'Another animal attack in the paper. That is three this month.', 'Something was howling up at the Falls last full moon.'];

/* step types the engine knows: talk, kill, gather, reach, floor, flag, have, level, parry, use; any other type (shift) counts plain events of that name. A step's d may be a getter. */
const QUESTS = {
  q_arrive: { n: 'New in Town', steps: [{ t: 'talk', id: 'marnie', d: 'Find Marnie at the Mystic Grill, on the north side of the square.' }, { t: 'talk', id: 'odette', d: "Carry Marnie's parcel to Odette Thorne at the apothecary next door." }, { t: 'talk', id: 'marnie', d: 'Tell Marnie it is done.' }], rew: { xp: 60, gold: 25, cons: { burger: 2, coffee: 2 } }, next: 'q_bump' },
  q_bump: { n: 'Things That Go Bump', steps: [{ t: 'reach', id: 'cem', night: 1, d: 'After dark, look for the delivery boy at the Old Cemetery, west of town.', on() { if (!isNight()) toast('Night falls at eight. You can sleep at the boarding house, or explore until then.'); } }, { t: 'kill', fam: 'vampire', n: 2, d: 'Something is feeding among the graves. Put two of them down for good: the heart or the head, before they get back up.', on() { diary('ferals'); for (let i = 0; i < 2; i++) { const e = spawnEnemy('feral', -122 - i * 5, 36 + i * 7, 1); aggro(e); } toast('They were not looking for the boy. They are what is left of him.'); } }, { t: 'talk', id: 'hale', d: 'Captain Hale wants a word. Council Hall, east side of the square.' }],
    rew: { xp: 120, gold: 40, item: () => genItem(2, { base: 'stake', rar: 1 }) }, end() { addItem(genItem(2, { base: 'xbow', rar: 0 })); toast('Equip the crossbow in your pack, then fire it with F.'); }, next: ['q_council', 'q_witch'] },
  q_council: { n: "The Council's Errand", steps: [{ t: 'kill', fam: 'vampire', n: 6, d: 'Destroy six vampires. They come out after dark: the cemetery, the woods. Wood through the heart, fire, or the head.' }, { t: 'talk', id: 'hale', d: 'Report to Captain Hale.' }], rew: { xp: 220, gold: 90, sp: 1, item: () => genItem(S.lvl, { base: 'vest', rar: 2 }) }, end() { addItem(mkUniq('watch', S.lvl)); }, next: 'q_bridge' },
  q_witch: { n: "A Witch's Price", steps: [{ t: 'talk', id: 'odette', d: 'Odette Thorne asked to see you.' }, { t: 'gather', item: 'vervain', n: 3, d: 'Gather three sprigs of vervain in the Whispering Woods, north of town.' }, { t: 'gather', item: 'wolfsbane', n: 2, d: 'Gather two heads of wolfsbane, near the Falls or Dunham Lake.' }, { t: 'talk', id: 'odette', d: 'Bring the herbs to Odette.' }], rew: { xp: 200, sp: 1 } },
  q_bridge: { n: 'The Man on the Bridge', steps: [{ t: 'reach', id: 'bridge', night: 1, d: 'After dark, follow the east road to Wickery Bridge.' }, { t: 'talk', id: 'ambrose', d: 'Speak with the man on the bridge. He is only there at night.' }], rew: { xp: 260 }, next: 'q_tomb' },
  q_tomb: { n: 'Under the Church', steps: [{ t: 'reach', id: 'chapel', d: "Find the ruins of Fell's Church, north-west through the woods. The signposts call it Fell Chapel." }, { t: 'floor', n: 3, d: 'Descend into the Tomb and clear three floors. The dead down there are only dried out: spilled blood wakes them.', on() { diary('tomb'); jot('tomb', 'desiccation'); } }], rew: { xp: 400, gold: 150, sp: 1 }, next: 'q_warden' },
  q_warden: { n: 'The Warden', steps: [{ t: 'kill', type: 'warden', d: 'Something keeps the fifth floor of the Tomb. Put it down and finish it: the heart or the head.' }, { t: 'talk', id: 'odette', d: 'Tell Odette what was guarding the fifth floor.', on() { diary('warden'); } }], rew: { xp: 700, sp: 2, gold: 250 }, next: ['q_first', 'q_oak'] },
  q_first: { n: 'First of the Line', steps: [{ t: 'floor', n: 9, d: 'Clear the Tomb down to the ninth floor. Corvin is on the tenth.', on() { if (S.deepest >= 9) advQuest('q_first'); } },
    { t: 'flag', id: 'corvinDown', d: 'Put Corvin on the floor. Ordinary weapons only drop him for a few minutes. Only white oak kills him, and that kills everything of his line.', on() { if (lineLinked()) toast("You are of Corvin's line. If white oak kills him while you are tied to him, you die within the hour."); if (S.flags.corvinDowned) advQuest('q_first'); } },
    { t: 'flag', id: 'fate', d: "Stand over Corvin and decide: white oak, Odette's spell, or his bargain.", on() { diary('corvin'); if (S.flags.corvinFate) advQuest('q_first'); } }], rew: { xp: 1500, sp: 3, gold: 600 }, next: 'q_deeper' },
  q_oak: { n: 'The Bridge Sign', steps: [{ t: 'talk', id: 'hale', d: 'Ask Captain Hale what can kill one of the first family.' }, { t: 'have', item: 'oakwood', at: { x: 193, z: -37 }, d: 'Take the old sign from the rail of Wickery Bridge. Ambrose Varga stands over it at night.' }, { t: 'talk', id: 'hale', d: 'Bring the sign to Hale to be carved.' }], rew: { xp: 500 } },
  q_deeper: { n: 'Deeper', steps: [{ t: 'talk', id: 'odette', d: "Ask Odette Thorne what lies under Corvin's floor.", on() { diary('deeper'); } }, { t: 'floor', n: 19, d: 'Clear the Tomb down to the nineteenth floor.', on() { if (S.deepest >= 19) advQuest('q_deeper'); } },
    { t: 'kill', type: 'sleeper', d: "Open the sealed door on the twentieth floor and put down what was shut in with the Cure. The door wants a living Thorne witch, or Emeline Thorne's talisman.", on() { if (S.kills.sleeper) advQuest('q_deeper'); } }], rew: { xp: 5000, sp: 3, cons: { cure: 1 } }, end() { diary('sleeper'); jot('cure'); }, next: 'q_abyss' },
  q_abyss: { n: 'No Bottom', steps: [{ t: 'floor', n: 50, d: 'Fifty floors. Nobody has ever come back from that far to say what is there.' }], rew: { xp: 40000, sp: 5, item: () => genItem(S.lvl + 3, { rar: 4 }) } },
  q_daylight: { n: 'Daylight', steps: [{ t: 'talk', id: 'odette', d: 'Ask Odette Thorne about the sun.' }, { t: 'have', item: 'lapisq', d: 'Find lapis lazuli in the Tomb. Chests hold it, the keeper of the fifth floor wears it, and so do the oldest vampires abroad at night.' }, { t: 'talk', id: 'odette', d: 'Bring the lapis lazuli to Odette.' }], rew: { xp: 500, sp: 1 } },
  q_locket: { n: "Elspeth's Locket", steps: [{ t: 'have', item: 'locket', d: 'Open the chest behind the mausoleum, at the back of the Old Cemetery.' }, { t: 'talk', id: 'pruitt', d: 'Show Mrs. Pruitt the locket.' }], rew: { xp: 150, gold: 60 } },
  q_farm: { n: 'Night on the Farm', steps: [{ t: 'kill', n: 5, night: 1, zone: 'farm', d: 'Kill five predators on Abel Farm after dark.' }, { t: 'talk', id: 'abel', d: 'Tell Abel his herd is safe.' }], rew: { xp: 200, gold: 110, item: () => genItem(Math.max(5, S.lvl), { base: 'stiletto', rar: 2 }) } },
  q_wren: { n: 'The Alpha of the Falls', steps: [{ t: 'kill', type: 'alpha', get d() { return S.origin === 'wolf' ? (S.species === 'human' ? 'On a full-moon night, challenge Old Tobias at the pool below the Falls. Killing him takes a human life: the curse will wake in you.' : 'On a full-moon night, challenge Old Tobias at the pool below the Falls. Win, and the pack answers to you.') : 'On a full-moon night, kill Old Tobias at the pool below the Falls. He will be a wolf.'; } }, { t: 'talk', id: 'wren', d: 'Bring word to Old Wren at Dunham Lake.', on() { diary(S.flags.packAlpha ? 'alphaw' : 'alpha'); } }], rew: { xp: 900, gold: 300, sp: 1 } },
  q_bex: { n: 'Wait For It', steps: [{ t: 'parry', n: 5, d: 'Parry five attacks: block at the last instant.' }, { t: 'talk', id: 'bex', d: "Return to Bex at the Hunters' Camp." }], rew: { xp: 250, sp: 1, item: () => genItem(Math.max(4, S.lvl), { slot: 'ranged', rar: 2 }) } },
  q_quarry: { n: 'The Nest', steps: [{ t: 'kill', type: 'lenore', d: 'After dark, kill the matron of the Blackridge Quarry nest. Finish her when she drops, or she gets up.' }, { t: 'talk', id: 'hale', d: 'Report to Captain Hale.' }], rew: { xp: 1200, gold: 500, sp: 1, item: () => mkUniq('halebow', S.lvl) } },
  q_hollow: { n: 'A Hundred Voices', steps: [{ t: 'kill', type: 'matriarch', d: 'After dark, lay a hand on the altar at Coven Hollow, call out the one voice, and break it.' }, { t: 'talk', id: 'odette', d: 'Tell Odette the Hollow is quiet.', on() { diary('matriarch'); } }], rew: { xp: 1400, sp: 2 } },
  q_unlink: { n: 'One Thread', steps: [{ t: 'have', item: 'hblood', d: 'Bring Odette a vial of the Blood of the First. It can only be taken while Corvin lives: put him on the floor and take it, or bargain for it.' }, { t: 'talk', id: 'odette', d: "Give the vial to Odette Thorne. She will cut you out of Corvin's line." }], rew: { xp: 800 } },
  q_moonring: { n: 'Black Kyanite', steps: [{ t: 'flag', id: 'moon', d: 'Get through one full moon: chained in the Lockwood cellar, in the stone house west of the Falls den, or loose.', on() { if (S.flags.moons > 0) advQuest('q_moonring'); } }, { t: 'talk', id: 'wren', d: 'Go back to Old Wren at Dunham Lake.' }, { t: 'talk', id: 'odette', d: 'Take the kyanite to Odette Thorne. A witch has to spell it.' }], rew: { xp: 600 } },
  q_hybrid: { n: 'Neither Moon Nor Sun', steps: [{ t: 'flag', id: 'hb', d: 'Get the Blood of the First. Corvin has to be alive: take it while he is down, or strike a bargain with him.', on() { if (hasCons('hblood') || S.flags.hblood) advQuest('q_hybrid'); } },
    { t: 'talk', id: 'elise', d: 'Ask Elise Gilroy, by the gazebo, for her blood. It only works while she is human, and only she can give it.', on() { if (hasCons('dblood')) advQuest('q_hybrid'); } },
    { t: 'flag', id: 'hybrid', d: "If you want this: drink Corvin's blood, then die within the day. You wake in transition and must drink Elise's blood before the next night, or you bleed from the eyes and die. Only the Cure undoes it." },
    { t: 'shift', n: 100, d: 'You are sired to Corvin and cannot raise a hand to him. Change shape willingly (G) a hundred times to break the bond.' }], rew: { xp: 3000, sp: 2 } },
  q_five: { n: 'The Mark', steps: [{ t: 'flag', id: 'five', d: 'Learn Brotherhood of the Five, the last skill of the Hunter tree. Only an ordinary human can carry the mark.', on() { if (sk('h_five') > 0) advQuest('q_five'); } }, { t: 'kill', fam: ['vampire', 'hybrid', 'original'], n: 25, d: 'The mark grows with every vampire you kill. Finish it.', on() { diary('five'); } }, { t: 'talk', id: 'odette', d: 'The mark is complete. Let Odette Thorne read it.' }], rew: { xp: 2500, sp: 1 } },
  q_original: { n: 'The First Spell', steps: [{ t: 'have', item: 'dblood', d: "The spell that made the first family needs the doppelgänger's blood. Ask Elise Gilroy, by the gazebo." }, { t: 'flag', id: 'firstblood', d: "It needs the blood of the first family: a vial of Corvin's, or Casimir's own if he will give it.", on() { if (hasCons('hblood') || S.flags.casimirCup) advQuest('q_original'); } },
    { t: 'have', item: 'oakwood', at: { x: 193, z: -37 }, d: 'It needs white oak to burn to ash. Something of the old bridge is still at Wickery Bridge.' }, { t: 'flag', id: 'ritual', d: 'After dark, lay it all on the altar at Coven Hollow. You will die again, and nothing but the Cure undoes it.' }], rew: { xp: 8000, sp: 3 } },
};
const BOSSUNIQ = { warden: 'wardblade', corvin: 'corvin', alpha: 'alphafang', lenore: 'ripper', matriarch: 'grimoire' };
function storyEvent(type, a, b) {
  const F = S.flags; if (F.slain && F.slain.corvin && F.corvinFate !== 'oak') oakAftermath();                     // white oak found him by some other hand than the dialogue's
  if (type === 'downed') return void storyDowned(a); desicWatch();
  if (type === 'slain') { if (a && a.type === 'casimir' && F.casimirGone !== 'dead') { F.casimirGone = 'dead'; toast('Casimir burned with the white oak. Somewhere far from here, everything he ever made has an hour left.'); } return; }
  if (type === 'dagger') { jot('dagger'); if (a && a.type === 'casimir' && b) { F.casimirGone = 'dagger'; toast('Casimir lies like the dead with the dagger in him. Hale will have him boxed and under the Council hall by morning.'); } return; }
  if (type === 'transition') { setTimeout(() => toast(a === 'hybrid' ? (hasCons('dblood') ? "Elise Gilroy's blood is in your pack. Drinking it finishes this. Not drinking it is also a choice." : "Only Elise Gilroy's blood will finish this. She is by the gazebo in the square.") : 'Ambrose is on Wickery Bridge until dawn. Gault, at Varga Manor, sells blood that was given willingly.'), 11000); return; }
  if (type === 'turned') { F.invited = 0; F.gaultIn = 0; if (S.quests.q_five) { delete S.quests.q_five; toast('The mark is gone from your arm. The Five do not take the dead.'); }
    if (a === 'hybrid') { if (qAt('q_hybrid', 2)) qEvent('flag', 'hybrid'); else jumpQuest('q_hybrid', 3, 0); jot('sirebond', 'venom', 'invitation'); }
    else { if (!S.done.q_daylight) startQuest('q_daylight'); if (S.heretic) diary('heretic'); jot('sun', 'feeding', 'invitation'); }
    if (lineLinked()) setTimeout(() => { toast("You were made with blood of Corvin's line. If Corvin is ever truly killed, you die within the hour."); jot('sireline'); }, 16500); return; }
  if (type === 'triggered') { jot('fullmoon', 'wolfsbane'); if (!F.wrenTold) setTimeout(() => toast('Old Wren, at Dunham Lake, will know what you are now. She can tell you where the pack chains up.'), 11000); return; }
  if (type === 'fullmoon' || type === 'chained') { if (type === 'chained') diary('cellar'); if (qAt('q_moonring', 0)) qEvent('flag', 'moon'); return; }
  if (type === 'shift') { const st = S.quests.q_hybrid; if (st && st.step === 3) { st.n = Math.max(st.n, F.shifts || 0); if (st.n >= 100) advQuest('q_hybrid'); } return; }
  if (type === 'murder') { if (F.dring === 1 && !F.ringOff && isVamp()) { F.ringMurders = (F.ringMurders || 0) + 1; if (F.ringMurders >= 2) { if (despellRing(true)) { F.ringOff = 1; F.vouched = 0; diary('despelled'); } } else toast('Odette Thorne will know about that by morning. Once more, and the ring goes cold.'); } return; }
  if (type === 'venom') { if (!S.original) setTimeout(() => toast(hasCons('hblood') ? 'You are carrying the Blood of the First. Drink it.' : S.heretic ? 'A Heretic can siphon the venom out of herself.' : F.blood_odette === 1 ? "Odette Thorne is keeping a vial of Corvin's blood. Go to her." : F.corvinFate === 'bargain' ? 'Corvin is at Varga Manor. He said his blood was on offer.' : F.corvinFate ? "Corvin's blood was the only cure, and there is no more to be had." : 'Corvin is on the tenth floor of the Tomb. His blood is the only cure, and he has to be alive to give it.'), 6000); return; }
  if (type === 'cured') { for (const id of ['q_daylight', 'q_unlink', 'q_original']) delete S.quests[id]; F.ringOff = 0; return; }
  if (type === 'original') { delete S.quests.q_unlink; return; }
  if (type !== 'kill' || !a || !a.def || !a.def.boss) return; const t = a.type, u = BOSSUNIQ[t];
  if (u && (!F['u_' + t] || chance(0.08))) { F['u_' + t] = 1; mkDrop(a.x, a.z, 'item', mkUniq(u, a.lvl), 0xe2334a); }
  S.sigils += Math.ceil(a.lvl / 2); if (t === 'warden' && qAt('q_daylight', 1) && !hasCons('lapisq')) { addCons('lapisq'); checkHave(); }
  if (t === 'alpha') { const carrier = S.origin === 'wolf' && S.species === 'human'; F.alphaDead = S.day; if (S.origin === 'wolf' && (S.quests.q_wren || F.alphaOath) && S.species !== 'vampire') F.packAlpha = 1; if (carrier && F.alphaOath) triggerCurse(); }
  if (t === 'lenore') F.lenoreDay = S.day; if (t === 'matriarch') { F.matriarch = 1; F.matDay = S.day; toast('The one voice breaks apart into a hundred. The Hollow is quiet, and it will leave you be.'); }
  if (t === 'ambrose') { F.ambroseDead = S.day; if (!S.switchOff) S.humanity = Math.max(0, S.humanity - 10); diary('ambroseDead'); toast('Ambrose Varga lies grey on his bridge. He asked for a fight. He did not ask for that.'); }
  if (RT.area.id === 'tomb' && RT.area.depth === 20 && !F.cure20) { F.cure20 = 1; if (!S.done.q_deeper && !S.quests.q_deeper) addCons('cure'); }
  if (!a.def.original) banner(a.def.n.split(',')[0] + ' has fallen', 'Level ' + a.lvl);
}
function storyChest(c) { if (c.id === 'c0' && qAt('q_locket', 0)) { addCons('locket'); checkHave(); } if (RT.area.id === 'tomb' && qAt('q_daylight', 1) && !hasCons('lapisq') && chance(0.45)) { addCons('lapisq'); checkHave(); } }
/* quest items with no use of their own: say what they are for */
function storyUse(k) {
  const note = { oakwood: 'White oak, a hundred years old and sound. Hale could carve a stake from it.', ashdagger: 'It only matters in the heart of an Original who is already down: stand over him and use it there. It does nothing to Corvin, and it kills any vampire who drives it in.', kyanite: 'Black kyanite. A stone is only a stone until a witch spells it. Odette Thorne can.', moonstone: 'It gives its holder nothing. It bound a curse once.',
    talisman: "Emeline Thorne's crystal. It opens what she sealed: the door on the twentieth floor of the Tomb.", lapisq: 'Lapis lazuli. Odette Thorne can bind the sun into it, for one vampire.', locket: 'Tarnished, engraved E.F. Mrs. Pruitt asked for it.', dblood: "Elise Gilroy's blood. It finishes a hybrid's transition, and it is one part of a much older spell. It does nothing for you as you are." }[k];
  if (!note || !hasCons(k)) return false; toast(note); return true;
}
/* keep the world in step with the story: whether the sign is still on the bridge, and no quest left pointing at a step that does not exist (who keeps the tenth floor: tombBoss reads S.flags.corvinFate) */
function storySync() {
  const F = S.flags, a = RT.area; for (const id in S.quests) if (!QUESTS[id] || S.quests[id].step >= QUESTS[id].steps.length) delete S.quests[id];
  if (a && a.storyProps) a.storyProps.sign.visible = !F.signTaken;
}
/* periodic world checks: discovery, timed keepers, who is standing where, and everything Odette, Casimir and the moon do on their own time */
function worldEvents() {
  const F = S.flags;
  for (const p of POI) { const d = hyp(p.x - pl.x, p.z - pl.z); if (d < 18) { if (!S.disc[p.id]) { S.disc[p.id] = 1; banner(p.n, 'Discovered · waypoint unlocked'); gainXp(20 + S.lvl * 8); sfx('quest'); } for (const id in S.quests) { const st = S.quests[id], s = QUESTS[id].steps[st.step]; if (s && s.t === 'reach' && s.id === p.id && (!s.night || isNight())) advQuest(id); } } }
  for (const n of actors) if (n.kind === 'npc') { const w = n.npc.when; n.rig.g.visible = w ? !!w() : n.npc.townie ? (!isNight() || n.npc.owl) : true; }
  checkHave(); desicWatch(); if (F.slain && F.slain.corvin && F.corvinFate !== 'oak') oakAftermath();
  if (F.slain && F.slain.casimir && F.casimirGone !== 'dead') { F.casimirGone = 'dead'; toast('Casimir burned with the white oak. Somewhere far from here, everything he ever made has an hour left.'); }
  const night = isNight(), has = t => actors.some(e => e.kind === 'enemy' && e.type === t && !e.dead), carrier = S.origin === 'wolf' && S.species === 'human';
  /* the Warden is gone, so nothing stops the cultists feeding what he guarded; the news brings Corvin's brother */
  if (!F.corvinAwake && !F.corvinFate && S.kills.warden) F.corvinAwake = S.day;
  if (F.corvinAwake && !F.casimir && !F.casimirGone && S.day > F.corvinAwake) { F.casimir = S.day; toast("A stranger in a good coat has taken to standing in the square. He has been asking about Fell's Church."); }
  /* Odette made the daylight ring and can unmake it from her chair */
  if (isVamp() && F.dring === 1 && !F.ringOff && S.humanity < 30 && despellRing(true)) { F.ringOff = 1; F.vouched = 0; diary('despelled'); toast('Odette Thorne has taken the spell out of your ring. She will want amends before she puts it back.'); }
  /* quest steps that wait on something the engine does not announce */
  if (qAt('q_five', 0) && sk('h_five') > 0) qEvent('flag', 'five'); if (qAt('q_original', 1) && (hasCons('hblood') || F.casimirCup)) qEvent('flag', 'firstblood'); if (qAt('q_moonring', 0) && F.moons > 0) qEvent('flag', 'moon');
  if (qAt('q_hybrid', 0) && (hasCons('hblood') || F.hblood)) qEvent('flag', 'hb'); if (S.species === 'werewolf' && F.hblood && !S.quests.q_hybrid && !S.done.q_hybrid) startQuest('q_hybrid');   // a wolf with his blood in them should know what dying now would do
  /* timed keepers. An untriggered carrier only ever meets the alpha after Wren has said what killing him costs. */
  if (night && fullMoon() && !has('alpha') && !F.packAlpha && (!F.alphaDead || S.day - F.alphaDead >= 8) && (!carrier || F.alphaOath) && d2(pl, { x: 168, z: -222 }) < 70) { const e = spawnEnemy('alpha', 172, -218, Math.max(10, S.lvl)); if (F.alphaDead) e.name = 'The New Alpha'; toast('Something very large is moving by the Falls.'); sfx('howl'); }
  if (night && !(F.slain && (F.slain.lenore || F.slain.corvin)) && !has('lenore') && d2(pl, { x: 152, z: 190 }) < 70 && (S.quests.q_quarry || S.done.q_quarry)) spawnEnemy('lenore', 156, 196, Math.max(14, S.lvl));
  /* a duel with Ambrose is to the first fall: he yields at a third of his health, or the moment he is dropped */
  const duel = actors.find(e => e.kind === 'enemy' && e.duel && !e.dead && (e.downed || e.hp <= e.maxHp * 0.3));
  if (duel) { puff(duel.x, 1, duel.z, 14, { c: [0.3, 0.3, 0.34], add: 0.2, sp: 2, up: 1.5, life: 0.6, size: 0.36, grav: 0 }); removeActor(duel); F.ambroseDay = S.day; gainXp(duel.xp); if (!F.u_ambrose && S.inv.length < 60) { F.u_ambrose = 1; addItem(genItem(S.lvl + 1, { slot: 'ring', rar: 4 })); }
    if (RT.boss === duel) { RT.boss = null; hideBoss(); } say([['Ambrose', 'Enough. I yield. That one was yours.'], ['Ambrose', 'You stopped when I said stop. I notice things like that. Tomorrow night, if you want another.']]); }
  for (const b of S.bounties) if (b.spawn && b.acc && !b.done) { const z = ZONES.find(q => q.id === b.zone), c = z.c ? { x: z.c[0], z: z.c[1] } : { x: (z.r[0] + z.r[2]) / 2, z: (z.r[1] + z.r[3]) / 2 }; if (d2(pl, c) < 62) { b.spawn = false; const e = spawnEnemy(b.type, c.x + R(-8, 8), c.z + R(-8, 8), Math.max(b.lvl, S.lvl), { elite: true, tag: b.id }); collide(e); e.maxHp *= 1.5; e.hp = e.maxHp; toast('Your quarry is close: ' + e.name + '.'); } }
}
function spawnWorldNpcs() {
  const a = RT.area; a.inter = a.inter.filter(i => !i.temp); for (const d of NPCS) { const n = spawnNpc(d); if (d.when && n && n.rig) n.rig.g.visible = !!d.when(); }   // nobody flickers into view who is not there yet
  const W = [[-22, -22], [22, -20], [-22, 20], [20, 22], [-8, 10], [10, -10], [0, 40], [0, 70], [0, 100], [-34, 8], [30, -14], [12, -44], [-4, -20], [24, 4]];
  for (let i = 0; i < 12; i++) { const w = W[i]; spawnNpc({ n: 'Townsperson', x: w[0], z: w[1], wps: W, townie: 1, owl: i < 3 }); }
  for (const d of [[-60, 16, [[-60, 16], [-30, 8], [-88, 30]]], [50, -14, [[50, -14], [30, -14], [80, -14]]]]) spawnNpc({ n: 'Deputy', x: d[0], z: d[1], wps: d[2], look: { cloth: 0x2a3a5c, hat: 1, pants: 0x1a1c26, long: 0 } });
  /* story props, built once: the old bridge sign, and the door of the Lockwood cellar, set into a bank west of the Falls den */
  if (!a.storyProps) { a.storyProps = { sign: place('board', 193.2, -36.2, 0, 0.5), cellar: place('cellar', 159.5, -214, 0, 0.8), torch: place('torch', 162.6, -211, 0, 1) }; if (a.boxes && a.los && a.hash && typeof hashArea === 'function') { for (const box of [[157.4, -218, 161.6, -213.1], [157.7, -213.1, 158.5, -210.9], [160.5, -213.1, 161.3, -210.9]]) { a.boxes.push(box); a.los.push(box); } hashArea(a); } }
  storySync();
  addInter({ temp: 1, x: -20, z: -245, r: 2.8, label: () => 'Touch the altar', act: hollowAltar });
  addInter({ temp: 1, x: 8.5, z: -29.2, r: 2.4, label: () => S.done.q_bump ? 'Read the notice board' : null, act: () => openMenu('bounty') });
  addInter({ temp: 1, x: -38.4, z: -8, r: 2.4, label: () => isVamp() && !S.flags.invited ? 'Your room (you have not been asked in)' : 'Your room: rest', act: yourRoom });
  addInter({ temp: 1, id: 'oakwood', x: 193, z: -37, r: 2.8, label: () => (qAt('q_oak', 1) || qAt('q_original', 2)) && !hasCons('oakwood') ? (S.flags.signTaken ? 'Pull a beam of the old bridge out of the bank' : 'Pry the old sign off Wickery Bridge') : S.flags.signTaken ? null : 'Read the old bridge sign', act: bridgeSign });
  addInter({ temp: 1, id: 'cellar', x: 159.5, z: -210.8, r: 3, label: () => pl.wolf && !isHybrid() ? null : S.species === 'werewolf' && !hasUniq('moonring') && fullTonight() ? 'Chain yourself in the Lockwood cellar' : 'The Lockwood cellar', act: lockwoodCellar });
}
/* Hollow Moon — interface: HUD, minimap, dialogue, the Use prompt, menus, codex, vendors, touch controls. */
const GLYPH = { h_gren: '✺', h_wgren: '✽', h_heart: '➹', h_whirl: '⟳', h_volley: '⋙', h_device: '⊚', w_incend: '♨', w_aneur: '✹', w_ward: '◈', w_cloak: '◌', w_motus: '⇗', w_bound: '◯', w_siphon: '⊛', w_desic: '⊘', l_rage: '✸', l_pounce: '↷', l_howl: '≋', v_frenzy: '♥', v_compel: '◉', v_step: '⤳', v_ripper: '◐', v_snap: '✕', v_heart: '❥' };
const glyph = id => GLYPH[id] || (SK[id] ? SK[id].n.charAt(0) : '?');
function toast(t) { const box = $('toasts'); if (box.lastChild && box.lastChild.textContent === t) return; const d = el('div', '', t); box.appendChild(d); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => d.remove(), 5200); }
function lootToast(t, col) { const box = $('loot'), d = el('div', '', t); d.style.color = col; box.appendChild(d); while (box.children.length > 5) box.firstChild.remove(); setTimeout(() => d.remove(), 4200); }
let bannerT = 0; function banner(t, s) { $('bannerT').textContent = t; $('bannerS').textContent = s || ''; const b = $('banner'); b.hidden = false; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go'); clearTimeout(bannerT); bannerT = setTimeout(() => b.hidden = true, 3600); }
function zoneBanner(z) { $('zone').textContent = z.n + (z.safe ? '' : ' · Lv ' + z.lvl); if (!z.safe && z.id !== 'wild') banner(z.n, 'Enemy level ' + z.lvl + '+'); }
function showBoss(e) { $('bossbar').hidden = false; $('bossname').textContent = e.name; $('bosssub').textContent = e.def.sub || ''; } function hideBoss() { $('bossbar').hidden = true; }
/* what a character is, in a word or two. Works on the live save and on one read back from storage (the Continue button). */
function kindName(o) {
  o = o || S; const f = o.flags || {}, k = o.species === 'vampire' ? (o.original ? 'Original' : o.heretic ? 'heretic' : 'vampire') : o.species === 'hybrid' ? (o.original ? 'Original hybrid' : 'hybrid') : o.species === 'werewolf' ? 'werewolf' : o.origin === 'siphoner' ? 'siphoner' : o.origin === 'witch' && f.witch ? 'witch' : 'human';
  return o.transition ? k + ' in transition' : k;
}
/* G does something only for a hybrid (always), or for a werewolf wearing a moonlight ring on the night the moon would have taken them anyway */
const canShift = () => !!pl && !S.transition && (isHybrid() || (S.species === 'werewolf' && hasUniq('moonring') && fullMoon() && isNight()));
const nightsToFull = () => (4 - moonPhase() + 8) % 8;

/* ---------------- dialogue ---------------- */
let dq = null;
function say(lines, choices, done) { dq = { lines, i: 0, choices, done }; for (const k in K) K[k] = false; mouse.l = mouse.r = false; J.x = J.y = 0; if (pl) { pl.buf = null; pl.block = false; } showDlg(); }
function showDlg() { const l = dq.lines[dq.i], last = dq.i === dq.lines.length - 1; $('dlg').hidden = false; $('dwho').textContent = l[0]; $('dtext').textContent = l[1]; const c = $('dch'); c.innerHTML = ''; $('dnext').hidden = last && !!dq.choices;
  if (last && dq.choices) { dq.at = performance.now();   // a choice cannot be taken in the first third of a second: a click or a key already on its way to something else must not answer a question that cannot be unanswered
    dq.choices.forEach((ch, i) => { const b = el('button', 'choice', (RT.touch ? '' : (i + 1) + '. ') + ch[0]); b.type = 'button'; b.onclick = ev => { ev.stopPropagation(); if (ev.isTrusted && dq && performance.now() - dq.at < 350) return; pickChoice(i); }; c.appendChild(b); }); } }
/* a dialogue has just closed: the key or click that closed it is not also a blow, and a button still held down is not the start of a heavy one */
function dlgClosed() { RT.dlgT = performance.now(); mouse.l = false; if (pl) { pl.buf = null; pl.heavyUsed = true; } }
function pickChoice(i) { if (!dq || !dq.choices || dq.i < dq.lines.length - 1 || !dq.choices[i]) return; const fn = dq.choices[i][1]; dq = null; $('dlg').hidden = true; dlgClosed(); sfx('ui'); fn(); }
function advDlg() { if (!dq) return; if (dq.i < dq.lines.length - 1) { dq.i++; showDlg(); sfx('ui'); } else if (!dq.choices) { const d = dq.done; dq = null; $('dlg').hidden = true; dlgClosed(); d && d(); } }
$('dlg').onclick = advDlg;

/* ---------------- interaction ---------------- */
/* What the Use key would do right now: the nearest thing in the area that has a use, or whatever actorInteract (35-player) says can be done to the nearest person or creature.
   Returns { label, act } or null. hold: nothing happens on a tap, the key has to be held (updPlayer does the work). also: a second thing a held key does meanwhile. */
function findInteract() {
  if (!pl || pl.dead || pl.feed) return null; let best = null, bd = 1e9;
  for (const it of RT.area.inter) { const d = hyp(it.x - pl.x, it.z - pl.z); if (d < it.r && d < bd) { const l = it.label(); if (l) { bd = d; best = { label: l, act: it.act }; } } }
  for (const n of actors) { if (n === pl || n.dead || !n.rig.g.visible) continue; const d = d2(pl, n); if (d > 8) continue; const o = actorInteract(n, d); if (!o || !o.label) continue;
    const s = n.kind === 'npc' ? d - (n.npc.talk ? 1.5 : 1) : d * 0.01 - 9;                                                   // someone to talk to beats a signpost at the same distance; anything lying at your feet beats both
    if (s < bd) { bd = s; best = { label: o.label, act: o.act }; } }
  if (pl.fx.lodged > 0 && isVamp()) { const n = Math.ceil(pl.fx.lodged), l = 'pull the wood out of you' + (n > 1 ? ` (${n} lodged)` : ''); if (best) best.also = l; else best = { label: cap(l), act: () => { }, hold: 1 }; }   // wood stays in a vampire until it is dug out
  return best;
}

/* ---------------- HUD ---------------- */
const bar = (id, v, m, txt) => { const b = $(id); b.firstElementChild.style.width = clamp(v / m * 100, 0, 100) + '%'; b.lastElementChild.textContent = txt != null ? txt : Math.max(0, Math.ceil(v)) + ' / ' + Math.round(m); };
const ARW = [$('a0'), $('a1'), $('a2')]; let hudT = 0, miniT = 0, curInt = null, moonK = -1;
/* the moon as it stands tonight: waxing lit on the right, waning on the left */
function drawMoon(ph) {
  if (ph === moonK) return; moonK = ph; const c = $('moonc'); if (!c) return; const g = c.getContext('2d'), n = c.width, r = n / 2 - 2, f = [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25][ph] || 0, rx = Math.max(0.01, Math.abs(1 - 2 * f) * r);
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, n, n); g.translate(n / 2, n / 2); if (ph > 4) g.scale(-1, 1); g.fillStyle = '#1a2130'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  if (f > 0) { g.fillStyle = ph === 4 ? '#ffe9a0' : '#e9e0cf'; g.beginPath(); g.arc(0, 0, r, -PI / 2, PI / 2); g.ellipse(0, 0, rx, r, 0, PI / 2, -PI / 2, f < 0.5); g.fill(); }
  g.strokeStyle = 'rgba(233,224,207,.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); c.title = MOON[ph];
}
/* the words under the bars: what is being done to you first, then what you carry, then what you have done to yourself */
function hudStatus() {
  const b = pl.buff, f = pl.fx, F = S.flags, st = [], vamp = isVamp(), now = absHours(), hrs = t => Math.max(1, Math.ceil(t - now)) + 'h';
  if (pl.burning) st.push('The sun is burning you'); if (f.burn > 0) st.push('On fire'); if (f.charm > 0) st.push('Compelled'); if (f.stun > 0) st.push('Stunned'); if (f.root > 0) st.push('Held in a boundary'); if (f.aneur > 0) st.push('Head splitting'); if (f.verv > 0) st.push('Weakened by vervain');
  if (typeof sysStatus === 'function') { for (const l of sysStatus()) if (l.indexOf('In transition') !== 0) st.push(l === 'Wolf' ? 'Wolf form' : l); }   // everything 40-systems keeps a clock on; the transition has a line of its own
  else { if (S.venomUntil > now) st.push((S.original ? 'Venom fever ' : 'Werewolf venom ') + hrs(S.venomUntil)); if (S.curseUntil > now) st.push("Hunter's Curse " + hrs(S.curseUntil)); if (f.lodged > 0) st.push('Wood lodged'); if (f.wolfsbane > 0) st.push('Wolfsbane'); if (pl.wolf) st.push('Wolf form');
    if (P.desic) st.push(['', 'Starving', 'Weakening', 'Desiccating'][P.desic] || 'Desiccating'); else if (vamp && pl.blood <= 0) st.push('Starving'); if (S.switchOff) st.push('Humanity off'); if (vamp && S.diet === 'animal') st.push('Animal blood'); if (F.vblood) st.push('Vampire blood in you'); if (F.hblood) st.push('Blood of the First in you'); }
  if (vamp) { if (S.exposure >= 50) st.push('Hunted'); else if (S.exposure >= 20) st.push('Suspected'); }
  if (b.coatV > 0) st.push('Vervain blade ' + Math.ceil(b.coatV) + 's'); if (b.coatW > 0) st.push('Wolfsbane blade ' + Math.ceil(b.coatW) + 's'); if (b.ward > 0) st.push('Ward ' + Math.round(b.ward)); if (b.cloak > 0) st.push('Cloaked ' + Math.ceil(b.cloak) + 's'); if (b.fury > 0) st.push('Fury ' + Math.ceil(b.fury) + 's');
  if (b.slayerN) st.push('Momentum ×' + b.slayerN); if (b.riposte > 0) st.push('Riposte'); if (b.burger > 0 && !vamp) st.push('Fed');
  return st;
}
function updHud(dt) {
  const vamp = isVamp(), wolfK = isWolf(), wf = !!pl.wolf, tr = S.transition, showF = canMagic() || S.origin === 'siphoner', showR = wolfK || P.rageGain > 0;
  bar('bHp', pl.hp, P.maxHp); bar('bSt', pl.sta, P.maxSta, '');
  // one small bar for each thing you actually run on: focus for magic (a siphoner's starts empty), blood for the dead, rage for the wolf
  $('bFoc').hidden = !showF; if (showF) bar('bFoc', pl.foc, P.maxFoc, Math.ceil(pl.foc) + ' focus'); $('bBl').hidden = !vamp; if (vamp) bar('bBl', pl.blood, P.maxBlood, Math.ceil(pl.blood) + ' blood'); $('bRg').hidden = !showR; if (showR) bar('bRg', pl.rage || 0, 100, Math.round(pl.rage || 0) + (wolfK ? ' rage' : ' temper'));
  $('xpfill').style.width = S.xp / xpNeed(S.lvl) * 100 + '%'; if (RT.boss) $('bossfill').style.width = clamp(RT.boss.hp / RT.boss.maxHp * 100, 0, 100) + '%';
  hudT -= dt; if (hudT > 0) return; hudT = 0.12;
  const tomb = RT.area.id === 'tomb', ph = moonPhase(), full = ph === 4, night = isNight(), were = S.species === 'werewolf' && !tr, use = RT.touch ? 'USE' : 'E';
  $('lvl').textContent = S.lvl; $('clock').textContent = fmtClock(S.clock); drawMoon(ph); $('daymoon').textContent = tomb ? 'The Tomb · Floor ' + RT.area.depth : `Day ${S.day} · ${MOON[ph]}`; if (tomb) $('zone').textContent = RT.area.cleared ? 'Seal broken' : RT.area.boss ? 'A keeper waits' : `${Math.max(0, RT.area.need - RT.area.killed)} to break the seal`;
  // the moon, said plainly: everyone is told when tonight is the full moon; a wolf is also told what it means for them, and how many nights are left
  const ml = $('moonline'), ring = were && hasUniq('moonring'), nts = nightsToFull(); ml.hidden = !(full || wolfK || (S.origin === 'wolf' && S.species === 'human')); ml.classList.toggle('full', full);
  if (!ml.hidden) ml.textContent = full ? (night ? 'The full moon is up' : 'Full moon tonight') + (were ? (ring ? ' · your ring gives you the choice' : pl.wolf ? ' · wolf until dawn' : night ? '' : ' · you will turn at dusk') : '') : 'Full moon ' + (nts === 1 ? 'tomorrow night' : 'in ' + nts + ' nights');
  $('gold').textContent = fmt(S.gold) + ' gold' + (S.sigils ? ' · ' + S.sigils + ' sigils' : ''); $('pts').hidden = !(S.ap || S.sp); $('pts').textContent = (S.ap ? S.ap + ' attribute' : '') + (S.ap && S.sp ? ' · ' : '') + (S.sp ? S.sp + ' skill' : '') + ' points to spend';
  // in transition: the one clock that matters, on a line of its own
  const tl = $('trans'); tl.hidden = !tr; if (tr) { const h = tr.until - absHours(); tl.textContent = `In transition: drink ${tr.to === 'hybrid' ? "the doppelgänger's blood" : 'human blood'} within ${h <= 1 ? 'the hour' : Math.ceil(h) + ' hours'}`; }
  $('status').textContent = hudStatus().join(' · ');
  // ability bar. In wolf form: teeth only. Whatever paws cannot use is taken off the bar, and the wolf's own two moves are put on it.
  for (let i = 0; i < 4; i++) { const s = $('s' + i), id = S.bar[i], d = id ? SK[id] : null, ok = !!d && treeOpen(d.tree) && (!wf || d.tree === 'wolf'), cd = id ? (pl.cds[id] || 0) : 0; s.hidden = wf && !ok; s.classList.toggle('empty', !id); s.classList.toggle('off', !!id && !ok); s.querySelector('b').textContent = id ? glyph(id) : '';
    s.querySelector('u').style.height = d && cd > 0 ? clamp(cd / (d.cd * (1 - P.cdr)) * 100, 0, 100) + '%' : '0'; s.title = d ? d.n : ''; const p = $('p' + i); if (p) { p.hidden = !ok; p.textContent = id ? glyph(id) : ''; p.classList.toggle('cd', cd > 0); } }
  const rg = S.eq.ranged, sR = $('sR'); sR.hidden = wf; sR.classList.toggle('empty', !rg); sR.querySelector('u').style.height = rg && pl.rangedCd > 0 ? clamp(pl.rangedCd / (BASES[rg.base].cd * P.reload) * 100, 0, 100) + '%' : '0';
  const heals = (S.cons.draught || 0) + (vamp ? (S.cons.bloodbag || 0) : 0), sH = $('sH'); sH.hidden = wf; sH.querySelector('i').textContent = heals; sH.classList.toggle('empty', !heals); $('sWb').hidden = $('sWp').hidden = !wf;
  const shift = canShift(), sG = $('sG'); sG.hidden = !shift; if (shift) { sG.querySelector('u').style.height = pl.shiftCd > 0 ? clamp(pl.shiftCd / ((P.shiftT || 3) + 1.5) * 100, 0, 100) + '%' : '0'; sG.title = wf ? 'Change back' : 'Change into the wolf'; }
  if (RT.touch) { const pG = $('pG'), pJ = $('pJ'), pR = $('pR'); pG.hidden = !shift; pG.classList.toggle('cd', pl.shiftCd > 0); $('pF').hidden = $('pB').hidden = pR.hidden = wf; pR.textContent = heals ? '✚' + heals : '✚'; const jt = wf ? 'Bite' : 'Attack'; if (pJ.textContent !== jt) pJ.textContent = jt; }
  if (wf && !RT.wolfTip) { RT.wolfTip = 1; toast((RT.touch ? 'Wolf form. BITE bites; hold it to pounce.' : 'Wolf form. Left mouse or J bites; hold it, or press K, to pounce.') + ' No weapons, no spells and no talking with paws. ' + (shift ? (RT.touch ? 'SHIFT' : 'G') + ' changes you back.' : 'Dawn changes you back.')); }
  // quest tracker
  const qb = $('quests'); qb.innerHTML = ''; const tg = []; let n = 0;
  for (const id in S.quests) { if (n++ >= 3) break; const q = QUESTS[id], st_ = S.quests[id], s = q && q.steps[st_.step]; if (!s) continue; const d = el('div', 'q'); d.appendChild(el('b', '', q.n)); d.appendChild(el('span', '', s.d + ((s.n || 1) > 1 ? ` (${Math.min(st_.n, s.n)}/${s.n})` : ''))); qb.appendChild(d); const t = qTarget(s); if (t && RT.area.id === 'world') tg.push(t); }
  for (const bq of S.bounties) if (bq.acc && n++ < 4) { const d = el('div', 'q'); d.appendChild(el('b', '', 'Bounty · ' + bq.title)); d.appendChild(el('span', '', bq.done ? 'Collect at the notice board.' : `${bq.prog}/${bq.n}`)); qb.appendChild(d); }
  RT.targets = tg; for (let i = 0; i < 3; i++) { const a = ARW[i], o = tg[i]; if (!o || d2(o, pl) < 14 || RT.menu) { a.hidden = true; continue; } const an = Math.atan2(-(o.z - pl.z), o.x - pl.x); a.hidden = false; a.style.left = 50 + Math.cos(an) * 38 + '%'; a.style.top = 50 - Math.sin(an) * 32 + '%'; a.firstChild.style.transform = `rotate(${PI / 2 - an}rad)`; a.lastChild.textContent = Math.round(d2(o, pl)) + ' m'; }
  // prompt. Pulling lodged wood is a held key: the prompt fills as it comes out.
  curInt = RT.paused ? null : findInteract(); const pr = $('prompt'); pr.hidden = !curInt;
  if (curInt) { const k = pl.fx.lodged > 0 ? clamp((pl.pull || 0) / 0.9, 0, 1) * 100 : 0; pr.textContent = curInt.hold ? `Hold ${use} · ${curInt.label}` : (RT.touch ? '' : 'E · ') + curInt.label + (curInt.also ? ` · hold ${use} to ${curInt.also}` : ''); pr.style.backgroundImage = k > 0 ? `linear-gradient(90deg,rgba(179,18,42,.65) ${k}%,transparent ${k}%)` : ''; }
  const pe = $('pE'); if (pe) pe.classList.toggle('hot', !!curInt);
  miniT -= 0.12; if (miniT <= 0) { miniT = 0.2; drawMini(); }
}
function drawMini() {
  const c = $('mini'), g = c.getContext('2d'), N = c.width, span = RT.area.id === 'tomb' ? 90 : 150, k = N / span; g.fillStyle = '#0a0e16'; g.fillRect(0, 0, N, N); const X = x => (x - pl.x) * k + N / 2, Z = z => (z - pl.z) * k + N / 2;
  if (RT.area.id === 'world' && WORLDMAP) { const s = WORLDMAP.width / (WS * 2); g.globalAlpha = isNight() ? 0.75 : 1; g.drawImage(WORLDMAP, (pl.x - span / 2 + WS) * s, (pl.z - span / 2 + WS) * s, span * s, span * s, 0, 0, N, N); g.globalAlpha = 1; g.fillStyle = 'rgba(20,16,14,.85)'; for (const b of RT.area.los) if (Math.abs(b[0] - pl.x) < span && Math.abs(b[1] - pl.z) < span) g.fillRect(X(b[0]), Z(b[1]), (b[2] - b[0]) * k, (b[3] - b[1]) * k);
    for (const p of POI) if (S.disc[p.id]) { g.fillStyle = '#ffc870'; g.fillRect(X(p.x) - 2, Z(p.z) - 2, 4, 4); } }
  else { g.fillStyle = '#3a3a48'; for (const b of RT.area.boxes) if (b.length === 4 && Math.abs(b[0] - pl.x) < span && Math.abs(b[1] - pl.z) < span) g.fillRect(X(b[0]), Z(b[1]), (b[2] - b[0]) * k, (b[3] - b[1]) * k); const a = RT.area; g.fillStyle = a.cleared ? '#a08cff' : '#5a4c90'; g.fillRect(X(a.exit.x) - 3, Z(a.exit.z) - 3, 6, 6); g.fillStyle = '#6a8cff'; g.fillRect(X(a.start.x) - 2, Z(a.start.z) - 2, 4, 4); }
  /* what shows without having seen you first: the Founder's watch points at vampires and hybrids (and only spins on the hand of one); a vampire hears every heartbeat;
     a wolf smells everything within range; and a floor of the Tomb that is mostly cleared gives up the rest */
  const watch = hasUniq('watch') && !isVamp(), heart = isVamp() && sk('v_sense') ? 60 : 0, nose = isWolf() && sk('l_senses') ? 20 + 10 * sk('l_senses') : 0, all = RT.area.id === 'tomb' && RT.area.killed >= RT.area.need * 0.6, calm = typeof neutralTo === 'function' ? neutralTo : () => false;
  for (const a of actors) { if (a.dead || !a.rig.g.visible) continue; if (a.kind === 'npc' && a.npc.talk) { g.fillStyle = '#7ab0ff'; g.fillRect(X(a.x) - 2, Z(a.z) - 2, 4, 4); } else if (a.kind === 'enemy' && !a.def.peaceful && !a.ko) { const d = d2(a, pl), dead = a.fam === 'vampire' || a.fam === 'hybrid' || a.fam === 'original', beats = a.fam !== 'vampire' && a.fam !== 'original' && a.fam !== 'spirit';
      if (!(a.ai.aggro || a.downed || all || (watch && dead) || d < nose || (d < heart && beats))) continue; g.fillStyle = a.team === 0 ? '#b080ff' : a.downed || a.dormant ? '#8a909c' : calm(a) && !a.ai.aggro ? '#d8c890' : a.def.boss ? '#ff3050' : '#e04050'; const r = a.def.boss ? 3 : 2; g.fillRect(X(a.x) - r, Z(a.z) - r, r * 2, r * 2); } }
  for (const t of RT.targets || []) { let x = X(t.x), z = Z(t.z); const dx = x - N / 2, dz = z - N / 2, l = hyp(dx, dz), m = N / 2 - 6; if (l > m) { x = N / 2 + dx / l * m; z = N / 2 + dz / l * m; } g.fillStyle = '#ffe040'; g.beginPath(); g.arc(x, z, 3.5, 0, 7); g.fill(); }
  g.save(); g.translate(N / 2, N / 2); g.rotate(-pl.rot + PI); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5); g.fill(); g.restore();
}
/* floating numbers, enemy health bars, name tags: one 2D canvas over the scene */
function drawOverlay(dt) {
  const c = $('fxc'), g = c.getContext('2d'), s = c.width / innerWidth; g.setTransform(s, 0, 0, s, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight); if (!pl) return; g.textAlign = 'center';
  for (const a of actors) { if (a.dead || !a.rig.g.visible) continue; const d = d2(a, pl); if (d > 34) continue;
    if (a.kind === 'enemy' && (a.downed || a.ko)) { if (d > 20) continue; const p = toScreen(a.x, 1.5, a.z); if (!p.ok) continue; const orig = a.fam === 'original' || !!a.def.original;   // lying still is not dead: say which kind of still
      g.font = '600 11px "Barlow Condensed",sans-serif'; g.fillStyle = '#b8c0d0'; g.fillText(a.name, p.x, p.y - 5); g.fillStyle = a.ko ? '#d8d0c0' : '#ffe9a0'; g.fillText(a.ko ? 'out cold' : a.daggered ? 'daggered' : a.downT > 1e8 || a.desiccated ? 'desiccated' : orig ? 'down · he will get up' : 'down · not dead', p.x, p.y + 8); }
    else if (a.kind === 'enemy' && !a.def.peaceful && !a.dormant && (a.hpShow > 0 || a.elite || a.ai.aggro) && !a.def.boss) { const p = toScreen(a.x, 2.5 * a.rig.g.scale.y / 1.28 + (a.rig.kind === 'quad' ? -0.9 : 0), a.z); if (!p.ok) continue; const w = a.elite ? 56 : 42; g.fillStyle = 'rgba(8,10,16,.75)'; g.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, 6); g.fillStyle = a.team === 0 ? '#b080ff' : a.elite ? '#f0a13c' : '#d8354a'; g.fillRect(p.x - w / 2, p.y, w * clamp(a.hp / a.maxHp, 0, 1), 4);
      g.font = '600 11px "Barlow Condensed",sans-serif'; g.fillStyle = a.elite ? '#f0c060' : a.lvl > S.lvl + 3 ? '#ff7070' : '#d8d0c0'; g.fillText(`${a.lvl} ${a.name}`, p.x, p.y - 5); if (a.fx.stun > 0) { g.fillStyle = '#ffe9a0'; g.fillText('✦ staggered ✦', p.x, p.y - 18); } else if (a.fx.root > 0) { g.fillStyle = '#9aa8ff'; g.fillText('bound', p.x, p.y - 18); } }
    else if (a.kind === 'npc' && a.npc.talk && d < 12) { const p = toScreen(a.x, 2.75, a.z); if (!p.ok) continue; g.font = 'italic 14px "IM Fell English",serif'; g.fillStyle = '#e6b86c'; g.fillText(a.name, p.x, p.y); if (hasQuestFor(a.npc.id)) { g.font = '700 20px "Barlow Condensed",sans-serif'; g.fillStyle = '#ffe040'; g.fillText('!', p.x, p.y - 16); } } }
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; if (f.t > 0.9) { floats.splice(i, 1); continue; } const p = toScreen(f.x + f.vx * f.t, f.y + f.t * 1.6, f.z); if (!p.ok) continue; g.globalAlpha = Math.min(1, (0.9 - f.t) * 3); g.font = `700 ${f.size * (1 + Math.max(0, 0.15 - f.t) * 3)}px "Barlow Condensed",sans-serif`; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(f.txt, p.x, p.y); g.fillStyle = f.col; g.fillText(f.txt, p.x, p.y); } g.globalAlpha = 1;
}
function hasQuestFor(id) { for (const q in S.quests) { const s = QUESTS[q] && QUESTS[q].steps[S.quests[q].step]; if (s && s.t === 'talk' && s.id === id) return true; } return false; }

/* ---------------- menus ---------------- */
const TABS = [['char', 'Character'], ['inv', 'Pack'], ['skills', 'Skills'], ['journal', 'Journal'], ['codex', 'Codex'], ['map', 'Map'], ['system', 'System']];
let selItem = null, vendId = null;
function openMenu(tab) { if (dq || !RT.started || pl.dead) return; RT.menu = tab || RT.menu || 'inv'; $('menu').hidden = false; for (const k in K) K[k] = false; mouse.l = mouse.r = false; J.x = J.y = 0; selItem = null; sfx('ui'); renderMenu(); $('mbody').scrollTop = 0; }
function closeMenu() { RT.menu = null; vendId = null; $('menu').hidden = true; $('tip').hidden = true; if (pl) pl.heavyUsed = true; save(); }
function openVendor(id) { vendId = id; openMenu('vendor'); }
const H = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const boundIt = it => !!(it && it.uniq && UNIQ[it.uniq] && UNIQ[it.uniq].bound);   // a relic spelled for one person: it cannot be sold or broken down
const itemCard = (it, extra = '') => `<button type="button" class="item r${it.rar}${selItem === it ? ' sel' : ''}" data-item="${it.id}"><b>${H(it.name)}${it.up ? ' +' + it.up : ''}</b><span>Lv ${it.lvl} · ${it.despelled ? 'de-spelled · ' : ''}${boundIt(it) ? 'bound · ' : ''}${it.dmg ? Math.round(up(it, it.dmg)) + ' dmg' : it.def ? Math.round(up(it, it.def)) + ' armour' : cap(it.slot)}${extra}</span></button>`;
const findItem = id => S.inv.find(i => i.id == id) || Object.values(S.eq).find(i => i && i.id == id) || (vendId && vendorStock(vendId).items.find(i => i.id == id));
function itemDetail(it, mode) {
  if (!it) return '<p class="dim">Select an item.</p>'; const owned = S.inv.includes(it), worn = Object.values(S.eq).includes(it), cur = S.eq[it.slot], bound = boundIt(it);
  let h = `<h3 class="r${it.rar}">${H(it.name)}${it.up ? ' +' + it.up : ''}</h3><p class="dim">${RAR[it.rar].n} ${H(BASES[it.base].n)} · level ${it.lvl}${bound ? ' · bound to you' : ''}${it.despelled ? ' · de-spelled' : ''}</p><ul>${itemLines(it).map(l => `<li>${H(l)}</li>`).join('')}</ul>`;
  if (bound) h += '<p class="dim">Bound to you. It cannot be sold or salvaged.</p>';
  if (cur && cur !== it && !worn) h += `<p class="dim">Equipped: <span class="r${cur.rar}">${H(cur.name)}</span> · ${cur.dmg ? Math.round(up(cur, cur.dmg)) + ' dmg' : cur.def ? Math.round(up(cur, cur.def)) + ' armour' : ''}</p>`;
  h += '<div class="row">'; if (mode === 'buy') h += `<button type="button" class="btn" data-act="buy">Buy · ${buyPrice(it)} gold</button>`; else { if (owned) h += '<button type="button" class="btn" data-act="equip">Equip</button>'; if (worn) h += '<button type="button" class="btn" data-act="unequip">Unequip</button>'; if (owned && mode === 'sell' && !bound) h += `<button type="button" class="btn" data-act="sell">Sell · ${sellPrice(it)} gold</button>`; if (owned && !mode && !bound) h += '<button type="button" class="btn ghost" data-act="salvage">Salvage</button>';
    if ((owned || worn) && mode === 'sell' && VEND[vendId].forge && (it.dmg || it.def)) { const c = upCost(it); h += (it.up || 0) >= 10 ? '' : `<button type="button" class="btn" data-act="forge">Reforge to +${(it.up || 0) + 1} · ${c.gold} gold, ${c.scrap} scrap</button>`; } }
  return h + '</div>';
}
/* the character sheet's account of what you are: bloodline, species, and every rule that currently applies to you. Each row is [heading, the rule in a sentence]. */
function sheetRows() {
  const F = S.flags, og = ORIGINS[S.origin] || { n: cap(S.origin || 'human'), d: '' }, vamp = isVamp(), hyb = isHybrid(), tr = S.transition, sp = S.species, rows = [['Bloodline · ' + og.n, og.d]]; let kind, note;
  if (tr) { kind = 'In transition'; note = tr.to === 'hybrid' ? "Not a hybrid yet. Only the doppelgänger's blood finishes it; ordinary blood does nothing. Without it you die when the day runs out." : 'Not a vampire yet. None of their powers are yours and none of their weaknesses: the sun only hurts your eyes. Human blood before the day runs out finishes it. Without it you die the ordinary way, and that is allowed.'; }
  else if (vamp && S.original) { kind = hyb ? 'Original hybrid' : 'Original vampire'; note = 'Only white oak through the heart ends you. Anything else puts you down for a while. ' + (hyb ? 'Vervain and wolfsbane still burn; the sun does not.' : 'The sun and vervain still burn.') + ' The ash dagger ' + (hyb ? 'does nothing to you.' : 'would hold you as dead for as long as it stayed in.'); }
  else if (hyb) { kind = 'Hybrid'; note = 'Werewolf and vampire both. The sun does not burn you, you change shape when you choose, and your bite is venom in either shape. Vervain and wolfsbane both burn. Wood only puts you down.'; }
  else if (vamp) { kind = S.heretic ? 'Heretic' : 'Vampire'; note = (S.heretic ? 'A siphoner who turned. You still take magic by touch, and your spells feed on your own blood. ' : 'Blood is strength. ') + 'Wood, fire, vervain and the sun hurt you, a werewolf bite is a slow death, and you cannot cross the threshold of a home until someone living there asks you in.'; }
  else if (sp === 'werewolf') { kind = 'Werewolf'; note = 'The curse is awake. Stronger and faster than a person and less than a vampire, more as the moon fills and when you are angry. Your bite is venom only as a wolf. Wolfsbane burns you. Silver does nothing.'; }
  else if (S.origin === 'wolf') { kind = 'Human, carrying the werewolf gene'; note = 'The curse is asleep. It wakes the first time you take a human life and never sleeps again, so you pull your blows: people you beat are knocked out, not killed, unless you choose to finish one.'; }
  else if (S.origin === 'siphoner') { kind = 'Siphoner'; note = 'Mortal. You make no magic of your own. You take it by touch from anything that has some, and what you take runs out as you use it.'; }
  else if (S.origin === 'witch') { kind = F.witch ? 'Witch' : 'Human, of the Thorne line'; note = F.witch ? 'Mortal. Spells cost focus. Cast with too little and it comes out of your health, starting with the nose. If you ever become a vampire the magic is gone for good.' : 'The craft is in your blood and asleep. Odette Thorne could wake it. It belongs to the living: a witch who becomes a vampire loses it.'; }
  else { kind = 'Human'; note = "Mortal, and nothing else. Only someone like you can carry the mark of the Five, and a Founder's Ring only works for someone like you."; }
  rows.push(['Species · ' + kind, note]);
  if (F.cured) rows.push(['The Cure · taken', 'You can never be turned again. Vampire blood only heals you now.']);
  if (vamp || tr) rows.push(vamp && S.original ? ['Sire line · your own', 'You are the first of it. Nobody above you can die and take you along.'] : S.unlinked && vamp ? ['Sire line · Corvin · unlinked', 'Your life no longer hangs on his. He can die without you.'] : ['Sire line · Corvin' + (tr ? ' · not yet' : ' · linked'), tr ? 'The blood that is turning you comes down from him. If you finish this, your life hangs on his.' : 'If white oak ever kills Corvin, every vampire he made dies within the hour, and you are one of them. Only an unlinking spell or the Cure gets you out of that.']);
  if (hyb && S.sire && !S.original) { const n = F.shifts || 0; rows.push(n >= 100 ? ['Sire bond · broken', 'A hundred willing changes. It no longer hurts, and you owe him nothing.'] : [`Sire bond · ${n} of 100 changes`, 'You are sired to Corvin and cannot raise a hand to him. Change shape by choice a hundred times and the bond breaks.']); }
  if (vamp) { rows.push([`Humanity ${Math.round(S.humanity)}` + (S.switchOff ? ' · switched off' : ''), S.switchOff ? 'It is off: nothing you do costs you, it cannot rise, and it drains while you leave it. Turning it back on brings all of it back at once.' : 'Falls when you kill the people you feed on.']);
    rows.push([`Exposure ${Math.round(S.exposure)}`, 'At 50 the Council hunts you. Fades with time and sleep.']); rows.push(S.diet === 'animal' ? ['Diet · animal blood', 'It keeps you on your feet. You are weaker on it, slower to heal, and your compulsion holds half as long.'] : ['Diet · human blood', 'Full strength.']);
    const r = Object.values(S.eq).find(i => i && i.uniq === 'daylight'); rows.push(hyb ? ['The sun · harmless', 'A hybrid needs no daylight ring.'] : r && r.despelled ? ['The sun · lethal · ring de-spelled', 'The witch who made your ring has taken the spell out of it. It is only a stone until she relents.'] : r ? ['The sun · daylight ring', 'While you wear it the sun does not burn you. It does not work inside Coven Hollow unless the dead witches there allow it.'] : ['The sun · lethal', 'Without a daylight ring spelled by a witch the sun burns you. Be under a roof or underground by day.']); }
  else if (S.exposure >= 1) rows.push([`Exposure ${Math.round(S.exposure)}`, 'Fades with time and sleep.']);
  if (sp === 'werewolf') { const n = nightsToFull(); rows.push(['The full moon · ' + (fullMoon() ? (isNight() ? 'up now' : 'tonight') : n === 1 ? 'tomorrow night' : 'in ' + n + ' nights'), hasUniq('moonring') ? "A moonlight ring: you are not forced to turn, and on that night you may choose to. The wolf's strength and venom are yours in either shape." : 'You turn at dusk and are not yourself until dawn: no talking, no shops, and the town runs from you. Chain yourself in the Lockwood cellar before moonrise, or be somewhere there is nobody to hurt.']); }
  const mk = F.mark || 0; rows.push(sk('h_five') && sp === 'human' && S.origin === 'human' ? [`The Hunter's Mark · ${mk} killed`, `It grows up your arm with every vampire you kill. +${10 + Math.min(40, Math.floor(mk / 2))}% damage to vampires, hybrids and Originals.`] : S.origin === 'human' && sp === 'human' && !tr ? ["The Hunter's Mark · not yet", 'You are a potential. The mark appears with the Brotherhood of the Five, at the end of the Hunter tree, and it is lost if you ever turn.'] : ["The Hunter's Mark · none", S.origin === 'human' ? 'It left you when you stopped being an ordinary human.' : 'Only an ordinary human can carry it.']);
  const ic = immuneCompel(false), io = immuneCompel(true); rows.push(ic && io ? ['Compulsion · immune', 'Nobody can compel you, not even an Original.'] : ic ? ['Compulsion · immune to ordinary vampires', 'An Original can still compel you, unless there is vervain in you.'] : ['Compulsion · not protected', "A vampire who catches your eye can compel you. Vervain stops it: the Grill's coffee for a day, or a vervain locket for as long as you wear it."]);
  return rows;
}
const costTxt = c => { const o = []; if (c) { if (c.st) o.push(c.st + ' stamina'); if (c.fo) o.push(c.fo + ' focus'); if (c.bl) o.push(c.bl + ' blood'); if (c.rg) o.push(c.rg + ' rage'); if (c.hp) o.push(Math.round(c.hp * 100) + '% of your health'); } return o.join(', '); };
function skillRow(k, open, pts) {
  const d = SK[k], r = sk(k), okd = !d.ok || !!d.ok(), can = open && okd && S.sp > 0 && r < d.max && pts >= d.req, cost = d.act ? costTxt(d.cost) : '';
  return `<div class="skill${r ? ' known' : ''}${pts < d.req || !okd ? ' locked' : ''}"><div><b>${d.act ? glyph(k) + ' ' : ''}${H(d.n)}</b> <small>${r}/${d.max}${pts < d.req ? ' · needs ' + d.req + ' points' : ''}${d.act ? ' · ' + d.cd + 's' + (cost ? ' · ' + cost : '') : ''}</small><span>${H(d.d(Math.max(1, r)))}${r && r < d.max ? '<br><i>Next: ' + H(d.d(r + 1)) + '</i>' : ''}${!okd && d.okD ? '<br>' + H(d.okD) : ''}</span></div><div class="row">${d.act && r && open ? [0, 1, 2, 3].map(i => `<button type="button" class="btn sm${S.bar[i] === k ? '' : ' ghost'}" data-bind="${k}:${i}">${i + 1}</button>`).join('') : ''}<button type="button" class="btn sm" data-learn="${k}" ${can ? '' : 'disabled'}>+</button></div></div>`;
}
/* one tree. Open: its skills. Closed: its name and the reason it is closed to this character, with the skills folded away underneath for the curious. */
function treeSec(tr) {
  const T_ = TREES[tr], open = treeOpen(tr), pts = treePts(tr), list = Object.keys(SK).filter(k => SK[k].tree === tr).map(k => skillRow(k, open, pts)).join('');
  if (open) return `<section><h2>${H(T_.n)} <small>${pts} points</small></h2><p class="dim">${H(T_.d)}</p>${list}</section>`;
  return `<section class="shut"><details><summary><h2>${H(T_.n)} <small>closed${pts ? ' · ' + pts + ' points' : ''}</small></h2><p class="why">${H((T_.shut && T_.shut()) || 'Closed to you.')}</p><u></u></summary>${list}</details></section>`;
}
function renderMenu() {
  const t = RT.menu, body = $('mbody'), vamp = isVamp(), nCodex = Object.keys(S.codex || {}).length, dot = k => (k === 'char' && S.ap) || (k === 'skills' && S.sp) || (k === 'codex' && nCodex > (S.flags.codexSeen || 0)) ? ' •' : '';
  $('mtabs').innerHTML = (t === 'vendor' || t === 'bounty' ? `<span class="tab on">${t === 'vendor' ? H(VEND[vendId].n) : 'Notice board'}</span>` : TABS.map(([k, n]) => `<button type="button" class="tab${k === t ? ' on' : ''}" data-tab="${k}">${n}${k === t ? '' : dot(k)}</button>`).join('')) + `<span class="purse">${fmt(S.gold)} gold · ${S.cons.scrap || 0} scrap · ${S.sigils} sigils</span>`;
  let h = '';
  if (t === 'char') { const A = [['mig', 'Might', '+2% melee damage'], ['fin', 'Finesse', '+2% ranged damage, +0.4% critical chance'], ['vig', 'Vigor', '+10 health, +2 stamina'], ['wil', 'Will', '+2.5% spell power, +4 focus']], showF = canMagic() || S.origin === 'siphoner';
    h = `<div class="cols"><section><h2>${title()}</h2><p class="dim">Level ${S.lvl} ${kindName()} · power ${fmt(P.power)} · ${Math.floor(S.xp)} / ${xpNeed(S.lvl)} xp</p><h3>Attributes <small>${S.ap} to spend</small></h3>` + A.map(([k, n, d]) => `<div class="stat"><b>${n} ${P.attr[k]}</b><span>${d}</span><button type="button" class="btn sm" data-attr="${k}" ${S.ap ? '' : 'disabled'}>+</button></div>`).join('') +
      `</section><section><h3>What you are</h3>${sheetRows().map(([b, s]) => `<div class="stat"><b>${H(b)}</b><span>${H(s)}</span></div>`).join('')}</section><section><h3>Numbers</h3><ul class="nums">` +
      [['Health', Math.round(P.maxHp)], ['Stamina', Math.round(P.maxSta)]].concat(showF ? [['Focus', Math.round(P.maxFoc)]] : [], vamp ? [['Blood', Math.round(P.maxBlood)]] : [], [['Weapon damage', Math.round(P.wdmg * P.meleeM)], ['Ranged damage', S.eq.ranged ? Math.round(S.eq.ranged.dmg * P.rangedM) : '—'], ['Spell damage', showF ? Math.round(P.spellBase) : '—'], ['Critical', P.crit.toFixed(1) + '% for ×' + P.critMult.toFixed(2)], ['Attack speed', '×' + P.as.toFixed(2)], ['Armour', Math.round(P.def) + ' (' + Math.round(P.mit * 100) + '% less damage)'], ['Life steal', P.ls.toFixed(1) + '%'], ['Movement', P.spd.toFixed(1)], ['Cooldowns', Math.round(P.cdr * 100) + '% faster'], ['Better loot', '+' + Math.round(P.mf) + '%']]).map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join('') +
      `</ul><h3>Record</h3><ul class="nums"><li><span>Kills</span><b>${S.stats.kills}</b></li><li><span>Deepest floor</span><b>${S.deepest}</b></li><li><span>Deaths</span><b>${S.stats.deaths}</b></li><li><span>Time</span><b>${Math.floor(S.stats.played / 3600)}h ${Math.floor(S.stats.played / 60) % 60}m</b></li></ul></section></div>`; }
  else if (t === 'inv' || t === 'vendor') { const sell = t === 'vendor', st = sell ? vendorStock(vendId) : null, vd = sell ? VEND[vendId] : null;
    const eqh = ['weapon', 'ranged', 'armor', 'ring', 'amulet'].map(s => { const it = S.eq[s]; return it ? itemCard(it, ' · worn') : `<div class="item none"><b>${cap(s)}</b><span>empty</span></div>`; }).join('');
    const cons = Object.keys(S.cons).filter(k => S.cons[k] > 0 && CONS[k]).map(k => `<button type="button" class="item cons" data-cons="${k}" title="${H(CONS[k].d)}"><b>${CONS[k].icon} ${H(CONS[k].n)} ×${S.cons[k]}</b><span>${sell && !CONS[k].quest ? 'Sell · ' + Math.max(1, Math.round(CONS[k].price * 0.4)) + ' gold' : H(CONS[k].d)}</span></button>`).join('');
    const inv = S.inv.slice().sort((a, b) => b.rar - a.rar || b.lvl - a.lvl).map(it => itemCard(it)).join('') || '<p class="dim">Nothing but lint.</p>';
    h = '<div class="cols">' + (sell ? `<section><h3>For sale</h3><div class="grid">${st.items.map(it => itemCard(it, ' · ' + buyPrice(it) + 'g')).join('') || ''}${vd.cons.filter(k => CONS[k]).map(k => `<button type="button" class="item cons" data-buycons="${k}" title="${H(CONS[k].d)}"><b>${CONS[k].icon} ${H(CONS[k].n)}</b><span>${CONS[k].price} gold</span></button>`).join('')}</div></section>` : '') +
      `<section><h3>Worn</h3><div class="grid">${eqh}</div><h3>Pack <small>${S.inv.length}/60</small>${sell ? '' : ' <button type="button" class="btn sm ghost" data-act="salvageall">Salvage all common</button>'}</h3><div class="grid">${inv}</div><h3>Supplies</h3><div class="grid">${cons || '<p class="dim">None.</p>'}</div></section><section class="detail">${itemDetail(selItem, sell ? (st.items.includes(selItem) ? 'buy' : 'sell') : null)}</section></div>`; }
  else if (t === 'skills') { const keys = Object.keys(TREES), openT = keys.filter(k => treeOpen(k)), shutT = keys.filter(k => !treeOpen(k));
    h = `<p class="dim">${S.sp} skill point${S.sp === 1 ? '' : 's'} to spend. Assign learned abilities to keys 1–4. A tree opens with what you are, and what you are only changes if you choose it.</p><div class="cols three">${openT.map(treeSec).join('')}</div>` + (shutT.length ? `<h3>Closed to you</h3><div class="cols three">${shutT.map(treeSec).join('')}</div>` : '') +
      `<h2>Ascension <small>${S.sigils} sigils, earned in the Tomb</small></h2><div class="cols">` + Object.keys(ASC).map(k => `<div class="skill known"><div><b>${ASC[k].n}</b> <small>rank ${S.asc[k]}</small><span>${ASC[k].d}</span></div><div class="row"><button type="button" class="btn sm" data-asc="${k}" ${S.sigils >= ascCost(S.asc[k]) ? '' : 'disabled'}>${ascCost(S.asc[k])} sigils</button></div></div>`).join('') + '</div>'; }
  else if (t === 'journal') { h = '<div class="cols"><section><h2>Quests</h2>' + (Object.keys(S.quests).filter(id => QUESTS[id]).map(id => { const q = QUESTS[id], st = S.quests[id]; return `<div class="quest"><b>${H(q.n)}</b>` + q.steps.map((s, i) => i <= st.step ? `<span class="${i < st.step ? 'done' : ''}">${i < st.step ? '✓ ' : ''}${H(s.d)}${i === st.step && (s.n || 1) > 1 ? ` (${Math.min(st.n, s.n)}/${s.n})` : ''}</span>` : '').join('') + '</div>'; }).join('') || '<p class="dim">Nothing asked of you just now. The notice board by the Grill always has work, and the Tomb always has another floor.</p>') +
      `<h3>Done</h3><p class="dim">${Object.keys(S.done).map(id => QUESTS[id] ? H(QUESTS[id].n) : '').filter(Boolean).join(' · ') || 'Nothing yet.'}</p></section><section class="paper"><h2>Dear Diary,</h2>${S.diary.map(e => `<p><small>${H(e.t)}</small>${H(e.x)}</p>`).join('')}</section></div>`; }
  else if (t === 'codex') { const C = typeof CODEX === 'object' && CODEX ? CODEX : {}, have = Object.keys(S.codex || {}).filter(k => C[k]).reverse(), total = Object.keys(C).length, left = total - have.length; S.flags.codexSeen = nCodex;   // newest first: the save keeps them in the order they were learned
    h = `<h2>Codex <small>${have.length} of ${total}</small></h2><p class="dim">What you have learned about how this town works, newest first. Every entry is a rule that holds. ${left > 0 ? left + (left === 1 ? ' entry is' : ' entries are') + ' still to be discovered.' : total ? 'There is nothing left to discover.' : ''}</p>` + (have.length ? `<div class="cols">${have.map(k => `<div class="entry"><b>${H(C[k].t)}</b><span>${H(C[k].x)}</span></div>`).join('')}</div>` : '<p class="dim">Nothing yet. Talk to people, and pay attention to what tries to kill you.</p>'); }
  else if (t === 'map') { const near = POI.find(p => S.disc[p.id] && d2(p, pl) < 5 && RT.area.id === 'world'); h = `<p class="dim">${RT.area.id !== 'world' ? 'You are under the ground.' : near ? 'Choose a waypoint you have found to travel there.' : 'Stand at a waypoint signpost to travel between the ones you have found.'}</p><div class="mapwrap"><canvas id="bigmap" width="900" height="900"></canvas>` + POI.filter(p => S.disc[p.id]).map(p => `<button type="button" class="pin" style="left:${(p.x + WS) / (WS * 2) * 100}%;top:${(p.z + WS) / (WS * 2) * 100}%" data-poi="${p.id}" ${near ? '' : 'disabled'}>${H(p.n)}</button>`).join('') + '</div>'; }
  else if (t === 'bounty') { genBounties(); h = '<p class="dim">Paid by the Founders\' Council. New notices go up each morning.</p>' + (S.bounties.map(b => `<div class="skill known"><div><b>${H(b.title)}</b> <small>${b.gold} gold · ${fmt(b.xp)} xp${b.acc ? ' · ' + b.prog + '/' + b.n : ''}</small><span>${H(b.text)}</span></div><div class="row"><button type="button" class="btn sm" data-bounty="${b.id}">${b.done ? 'Collect' : b.acc ? 'Accepted' : 'Accept'}</button></div></div>`).join('') || '<p>Nothing posted.</p>'); }
  else if (t === 'system') { h = `<div class="cols"><section><h2>System</h2><div class="row">${['low', 'med', 'high'].map(q => `<button type="button" class="btn${RT.quality === q ? '' : ' ghost'}" data-q="${q}">Graphics: ${q}</button>`).join('')}</div><div class="row"><button type="button" class="btn" data-act="save">Save now</button><button type="button" class="btn ghost" data-act="export">Copy save code</button><button type="button" class="btn ghost" data-act="import">Load save code</button></div><textarea id="savecode" rows="3" placeholder="A save code appears here, or paste one and press Load."></textarea><p class="dim">The game saves on its own to this browser${cloud ? ' and to your Claude account' : ''}. A save code moves a character between devices.</p><div class="row"><button type="button" class="btn ghost" data-act="wipe">Start over…</button></div></section>
      <section><h2>Controls</h2><ul class="nums"><li><span>Move</span><b>WASD</b></li><li><span>Attack · hold for heavy</span><b>Left mouse / J</b></li><li><span>Heavy attack</span><b>K</b></li><li><span>Block · tap just in time to parry</span><b>Right mouse / Shift</b></li><li><span>Dodge</span><b>Space</b></li><li><span>Ranged shot</span><b>F</b></li><li><span>Abilities</span><b>1 2 3 4</b></li><li><span>Heal</span><b>R</b></li><li><span>Use · talk · feed · finish what is down</span><b>E</b></li><li><span>Pull out lodged wood</span><b>Hold E</b></li><li><span>Change shape · a hybrid, or a moonlight ring on the full moon</span><b>G</b></li><li><span>Menu · map</span><b>Tab · M</b></li><li><span>Zoom</span><b>Mouse wheel</b></li></ul><p class="dim">As a wolf you bite (attack) and pounce (heavy). Weapons, shots, blocking, spells and draughts need hands. On a touch screen the same controls are the round buttons, and SHIFT appears when you are able to change.</p></section></div>`; }
  body.innerHTML = h; if (t === 'map') drawBigMap();
}
function drawBigMap() { const c = $('bigmap'), g = c.getContext('2d'); if (WORLDMAP) g.drawImage(WORLDMAP, 0, 0, c.width, c.height); const k = c.width / (WS * 2); g.fillStyle = 'rgba(8,10,16,.25)'; g.fillRect(0, 0, c.width, c.height); if (RT.area.id === 'world') { g.fillStyle = '#fff'; g.beginPath(); g.arc((pl.x + WS) * k, (pl.z + WS) * k, 6, 0, 7); g.fill(); g.strokeStyle = '#b3122a'; g.lineWidth = 3; g.stroke(); } for (const t of RT.targets || []) { g.fillStyle = '#ffe040'; g.beginPath(); g.arc((t.x + WS) * k, (t.z + WS) * k, 7, 0, 7); g.fill(); } }
$('menu').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
  if (b.id === 'mclose') return closeMenu(); if (d.tab) { RT.menu = d.tab; selItem = null; sfx('ui'); renderMenu(); $('mbody').scrollTop = 0; return; }
  else if (d.item) { selItem = findItem(d.item); sfx('ui'); } else if (d.attr) { if (S.ap > 0) { S.ap--; S.attr[d.attr]++; recalc(); sfx('ui'); } } else if (d.learn) learn(d.learn); else if (d.bind) { const [k, i] = d.bind.split(':'); S.bar = S.bar.map(x => x === k ? null : x); S.bar[+i] = k; sfx('ui'); }
  else if (d.asc) { const c = ascCost(S.asc[d.asc]); if (S.sigils >= c) { S.sigils -= c; S.asc[d.asc]++; recalc(); sfx('quest'); } } else if (d.poi) return fastTravel(POI.find(p => p.id === d.poi)); else if (d.q) { setQuality(d.q); try { localStorage.setItem('hollowmoon.q', d.q); } catch (er) { } }
  else if (d.cons) { if (RT.menu === 'vendor') { if (!CONS[d.cons].quest && S.cons[d.cons] > 0) { S.cons[d.cons]--; S.gold += Math.max(1, Math.round(CONS[d.cons].price * 0.4)); sfx('coin'); } } else if (!useCons(d.cons) && !storyUse(d.cons)) sfx('deny'); if (!RT.menu) return; }   // some supplies close the menu to ask a question first
  else if (d.buycons) { const p = CONS[d.buycons].price; if (S.gold >= p) { S.gold -= p; addCons(d.buycons, 1, true); sfx('coin'); } else sfx('deny'); }
  else if (d.bounty) { const bq = S.bounties.find(x => x.id === d.bounty); if (bq.done) payBounty(bq); else if (!bq.acc) acceptBounty(bq); }
  else if (d.act) { const it = selItem;
    if (d.act === 'equip' && it) { equip(it); selItem = null; } else if (d.act === 'unequip' && it) { unequip(it.slot); selItem = null; } else if (d.act === 'salvage' && it) { salvage(it); selItem = null; } else if (d.act === 'salvageall') { S.inv.filter(i => i.rar === 0 && !boundIt(i)).forEach(salvage); }
    else if (d.act === 'sell' && it) { const i = S.inv.indexOf(it); if (i < 0 || boundIt(it)) { sfx('deny'); if (i >= 0) toast('It is bound to you. It cannot be sold or broken down.'); } else { S.inv.splice(i, 1); S.gold += sellPrice(it); selItem = null; sfx('coin'); } } else if (d.act === 'buy' && it) { const p = buyPrice(it); if (S.gold >= p && S.inv.length < 60) { S.gold -= p; const st = vendorStock(vendId); st.items.splice(st.items.indexOf(it), 1); S.inv.push(it); selItem = null; sfx('coin'); } else sfx('deny'); }
    else if (d.act === 'forge' && it) upgrade(it); else if (d.act === 'save') { save(true); toast('Saved.'); } else if (d.act === 'export') { const c = exportSave(); $('savecode').value = c; if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => toast('Save code copied.'), () => { $('savecode').select(); }); return; }
    else if (d.act === 'import') { if (importSave($('savecode').value)) location.reload(); else toast('That is not a save code.'); return; } else if (d.act === 'wipe') { if (b.dataset.sure) { try { for (const k of ['hollowmoon.save', 'hollowmoon.preturn', 'hollowmoon.preboss']) localStorage.removeItem(k); } catch (er) { } if (cloud) cloud.delete().catch(() => { }).then(() => location.reload()); else location.reload(); } else { b.dataset.sure = 1; b.textContent = 'Press again to erase this character'; } return; } }
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
/* Hollow Moon — boot, character creation, input routing, the frame loop. */
const LOOKS = { skin: [0xe6cdb8, 0xd3a48a, 0xa5714e, 0x70492f], hair: [0x15100e, 0x4a2f1a, 0x9a7a44, 0x8a2f1a, 0xc0b4a0, 0x2a3a5a], coat: [0x231a22, 0x3a2418, 0x1c2a3a, 0x40181c, 0x2a3324, 0x4a4a52] };
let lookI = { skin: 0, hair: 0, coat: 0, long: 0 }, originSel = 'human';   // the bloodline card selected on the title screen
const curLook = () => ({ skin: LOOKS.skin[lookI.skin], hair: LOOKS.hair[lookI.hair], coat: LOOKS.coat[lookI.coat], long: !!lookI.long });
keyHandlers.push(k => {
  audioInit();
  if (dq) { if (k === 'e' || k === 'enter' || k === ' ') advDlg(); else if (k.length === 1 && '123456'.includes(k)) { if (performance.now() - (dq.at || 0) > 350) pickChoice(+k - 1); } return true; }   // while someone is talking, no key is a blow
  if (!RT.started || RT.blk) return true;
  if (RT.menu) { if (k === 'tab' || k === 'escape' || k === 'i') closeMenu(); else if (k === 'm' && RT.menu !== 'vendor') { RT.menu = 'map'; renderMenu(); } return true; }
  if (k === 'tab' || k === 'i') { openMenu(); return true; } if (k === 'm') { openMenu('map'); return true; } if (k === 'escape') { openMenu('system'); return true; }
  if (RT.paused || !pl || pl.dead) return true;
  const since = performance.now() - (RT.dlgT || 0), act = since > 300;   // the press that closed a dialogue is not also an attack, a shot, a spell or another question
  if (k === 'mouse0' || k === 'j') { if (act) tryAttack(); } else if (k === 'k') { if (act) tryHeavy(); } else if (k === ' ') tryDodge(); else if (k === 'f') { if (act) tryShoot(); } else if (k === 'r') quickHeal(); else if (k === 'g') toggleShift();
  else if (k === 'e') { if (since < 450) return true; const it = findInteract(); if (it) it.act(); } else if (k.length === 1 && '1234'.includes(k)) { if (act) castSkill(+k - 1); }
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
/* the bus stop. Two lines, and the second is the one thing each bloodline arrives knowing about itself. Everyone steps off the bus human. */
const ARRIVE = {
  human: "Mystic Falls, Virginia. Your aunt Elspeth's letter said: find Marnie at the Grill, north side of the square. It also said: be indoors by dark. It did not say why.",
  witch: "Mystic Falls, Virginia. Your aunt Elspeth's letter said: find Marnie at the Grill, north side of the square, and be indoors by dark. It also said your mother was a Thorne, and that in this town the name still means something.",
  siphoner: "Mystic Falls, Virginia. Your aunt Elspeth's letter said: find Marnie at the Grill, north side of the square, and be indoors by dark. It did not mention the coven that put you out, or what your hands take from anything that has magic in it.",
  wolf: "Mystic Falls, Virginia. Your aunt Elspeth's letter said: find Marnie at the Grill, north side of the square, and be indoors by dark. It also said, underlined twice: your father was a Lockwood, so whatever happens here, do not kill anyone.",
};
function begin(fresh, data) {
  audioInit(); if (fresh) { newGame(curLook(), originSel); if (typeof dropSnap === 'function') { dropSnap('hollowmoon.preturn'); dropSnap('hollowmoon.preboss'); } } else if (applySave(data) === false) { $('continue').hidden = true; return; }
  mkPlayer(S.pos.x, S.pos.z); const inTomb = S.area === 'tomb'; enterArea('world', inTomb ? { x: -130, z: -164 } : { x: S.pos.x, z: S.pos.z });
  RT.started = true; $('title').hidden = true; $('hud').hidden = false; genBounties();
  if (fresh) { startQuest('q_arrive'); diary('arrive'); say([['', 'The bus lets you off on Main Street at half past four and does not wait.'], ['', ARRIVE[S.origin] || ARRIVE.human]], null, () => { toast(RT.touch ? 'Left thumb moves. ATTACK strikes; hold it for a heavy blow.' : 'WASD to move. Left mouse attacks; hold it for a heavy blow.'); setTimeout(() => toast(RT.touch ? 'DODGE rolls through attacks. Hold BLOCK, or tap it just in time to parry.' : 'Space dodges. Right mouse blocks; tap it just in time to parry.'), 5400); setTimeout(() => toast(RT.touch ? 'USE talks and opens. The top-right button opens your pack, skills and codex.' : 'E talks and opens. Tab opens your pack, skills, codex and map.'), 10800); }); }
  else { toast(`Day ${S.day}. ${MOON[moonPhase()]}. Welcome back.`); const tr = S.transition; if (tr) setTimeout(() => toast(`You are still in transition. ${tr.to === 'hybrid' ? "The doppelgänger's blood" : 'Human blood'} within ${Math.max(1, Math.ceil(tr.until - absHours()))} hours, or you die the ordinary way.`), 5400); }
}
function b64buf(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }
let bestSave = null;
function offerSave(o) { if (!o || (o.v !== 2 && o.v !== 3) || RT.started) return; if (!bestSave || (o.ts || 0) > (bestSave.ts || 0)) bestSave = o; const c = $('continue'); c.hidden = false; c.textContent = `Continue · level ${bestSave.lvl} ${kindName(bestSave)}, day ${bestSave.day}`; }
/* character creation, part two: the four bloodline cards. The choice is what you were born with; nobody starts as anything but human. */
function originCards() {
  const ob = $('origins'); if (!ob || typeof ORIGINS !== 'object') return;
  ob.innerHTML = Object.keys(ORIGINS).map(k => `<button type="button" class="origin${k === originSel ? ' on' : ''}" data-origin="${k}" aria-pressed="${k === originSel}"><b>${H(ORIGINS[k].n)}</b><span>${H(ORIGINS[k].d)}</span></button>`).join('');
  ob.onclick = e => { const b = e.target.closest('[data-origin]'); if (!b || !ORIGINS[b.dataset.origin]) return; originSel = b.dataset.origin; ob.querySelectorAll('.origin').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); sfx('ui'); };
}
function boot() {
  let q = null; try { q = localStorage.getItem('hollowmoon.q'); } catch (e) { } RT.quality = q || (matchMedia('(pointer:coarse)').matches ? 'med' : 'high'); setQuality(RT.quality);
  new T.GLTFLoader().parse(b64buf(window.HM_MODELS), '', g => {
    for (const c of g.scene.children.slice()) MODELS[c.name] = c;
    newGame(curLook(), 'human'); mkPlayer(-4, 12); enterArea('world', { x: -4, z: 12 }); S.clock = 21.5; pl.rot = 0.4; originCards();
    const b = $('begin'); b.disabled = false; b.textContent = 'New game'; b.onclick = () => { if (bestSave && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Start over? Press again'; return; } begin(true); };
    $('continue').onclick = () => begin(false, bestSave); $('respawn').onclick = respawn; $('mclose').onclick = closeMenu; $('tMenu').onclick = () => RT.menu ? closeMenu() : openMenu();
    document.querySelectorAll('[data-look]').forEach(bt => bt.onclick = () => { const k = bt.dataset.look; lookI[k] = (lookI[k] + 1) % (k === 'long' ? 2 : LOOKS[k].length); S.look = curLook(); const r = pl.rot; mkPlayer(pl.x, pl.z); pl.rot = pl.vr = r; sfx('ui'); });
    offerSave(readLocal()); initCloud(offerSave);
    requestAnimationFrame(loop);
  }, e => { $('begin').textContent = 'The models failed to load'; console.error(e); });
}
addEventListener('visibilitychange', () => { if (document.hidden && RT.started) save(true); });
try { if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => { if (RT.started) save(true); return {}; }); } catch (e) { }
/* debug and test handle. The species calls are wrapped so that a missing one fails when it is called, not when the page loads. */
window.HM = { get S() { return S; }, get pl() { return pl; }, get P() { return P; }, get RT() { return RT; }, actors, press, K, spawnEnemy, enterArea, genItem, addItem, gainXp, startQuest, qEvent, mkUniq, recalc, save, hit, drops, get area() { return RT.area; }, get info() { return ren.info.render; }, get cam() { return cam; }, get scene() { return scene; },
  get dq() { return dq; }, get prompt() { return curInt; }, get origin() { return S.origin; }, get species() { return S.species; }, get kind() { return kindName(); }, get wolf() { return !!(pl && pl.wolf); }, get status() { return pl ? hudStatus() : []; }, get originSel() { return originSel; }, set originSel(v) { if (ORIGINS[v]) { originSel = v; originCards(); } },
  begin: (fresh, data) => begin(fresh, data), newGame: (look, origin) => newGame(look, origin), findInteract: () => findInteract(), openMenu: t => openMenu(t), closeMenu: () => closeMenu(), say: (l, c, d) => say(l, c, d),
  setForm: (wolf, willing) => setForm(wolf, willing), toggleShift: () => toggleShift(), canShift: () => canShift(), triggerCurse: () => triggerCurse(), beginTransition: (to, how) => beginTransition(to, how), completeTransition: () => completeTransition(), failTransition: why => failTransition(why),
  becomeOriginal: () => becomeOriginal(), cureVampire: () => cureVampire(), unlinkSire: () => unlinkSire(), envenom: src => envenom(src), cureVenom: how => cureVenom(how), hunterCurse: () => hunterCurse(), despellRing: on => despellRing(on), playerDeath: (src, o) => playerDeath(src, o), respawn: () => respawn(),
  isVamp: () => isVamp(), isWolf: () => isWolf(), isHybrid: () => isHybrid(), inTransition: () => inTransition(), canMagic: () => canMagic(), treeOpen: t => treeOpen(t), treePts: t => treePts(t), sk: id => sk(id), hasUniq: k => hasUniq(k), daylightSafe: () => daylightSafe(), immuneCompel: o => immuneCompel(o), moonPower: () => moonPower(), absHours: () => absHours(),
  isNight: () => isNight(), fullMoon: () => fullMoon(), moonPhase: () => moonPhase(), codex: id => codex(id), learn: id => learn(id), useCons: k => useCons(k), addCons: (k, n, quiet) => addCons(k, n, quiet), castSkill: i => castSkill(i), actorInteract: (a, d) => actorInteract(a, d), spawnNpc: o => spawnNpc(o),
  finishDowned: e => finishDowned(e), tickClock: dt => tickClock(dt), flipSwitch: f => flipSwitch(f), chainUp: () => chainUp(), channelHundred: () => channelHundred(), canLearn: id => canLearn(id), fullTonight: () => fullTonight(), sireBound: () => sireBound(), lineLinked: () => lineLinked(), shiftAllowed: () => shiftAllowed(), isBound: it => isBound(it), sleepUntil: h => sleepUntil(h) };
boot();
})();

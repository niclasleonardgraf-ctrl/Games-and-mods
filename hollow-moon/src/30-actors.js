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
/* the Sleeper is no Original. He was immortal a thousand years before the white oak grew: he can be put down, and nothing the player owns kills him or holds him. */
const isImmortal = e => !!(e && e.def && (e.def.immortal || e.type === 'sleeper'));
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
  if (e.type === 'hunter' && S.species === 'werewolf' && (pl.wolf || S.exposure >= 50)) return false;   // the Council shoots a wolf on sight, and the person too once the town has their description
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
   A hybrid: the head or the heart, nothing else. An Original: white oak through the heart, and that is the whole list. The Sleeper: nothing at all. */
function lethalTo(e, o) {
  const m = o.mat, L = o.lethal; if (isImmortal(e)) return false; if (isOrig(e)) return L === 'whiteoak';
  if (L === 'heart' || L === 'head' || L === 'desic') return true; if (isHyb(e)) return !!o.heavy && m === 'steel';
  return L === 'stake' || L === 'whiteoak' || m === 'wood' || m === 'whiteoak' || m === 'fire' || m === 'sun' || m === 'venom' || (!!o.heavy && m === 'steel');
}
function hit(src, tgt, o) {
  if (!tgt || tgt.dead || o.dmg == null) return 0;
  if (tgt === pl) return src && src.phantom ? 0 : hitPlayer(src, o);
  if (tgt.kind === 'npc' || tgt.ko || (src && src.phantom)) return 0;
  const fromP = src === pl, ours = fromP || !src || src.team === 0;
  if (tgt.phantom) { if (ours) vanish(tgt, true); return 0; }
  if (tgt.downed) { if (ours && lethalTo(tgt, o)) { trueDeath(tgt, src, o); return o.dmg; } if (fromP && !o.dot && RT.time - (tgt.hintAt || -9) > 1.6) { tgt.hintAt = RT.time; floatText(tgt.x, 1.7, tgt.z, isImmortal(tgt) ? 'Nothing ends him' : isOrig(tgt) ? 'Only white oak' : isHyb(tgt) ? 'The head or the heart' : 'Wood, fire or the head', '#b8c0d0', 12); } return 0; }
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
  // (o.pvenom: a blow that is a bite in either shape, such as a pounce, so a ring wearer or a hybrid on two legs can deliver what P.venom promises)
  if (o.venom) venomOn(tgt, d * 0.3, 8); else if (fromP && wpn) { if (m === 'bite' || (o.pvenom && P.venom > 0)) { if (P.venom > 0) venomOn(tgt, d * P.venom, 8); } else if (o.melee && !pl.wolf && S.eq.weapon && S.eq.weapon.uniq === 'alphafang') venomOn(tgt, d * 0.6, 6); }
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
/* a werewolf bite on an ordinary vampire: nothing heals at all (draught, blood bag, feeding, a blood font) until Corvin's blood or a Heretic's siphoning lifts it. An Original only has a fever, a hybrid nothing. */
const venomed = () => isVamp() && !isHybrid() && !S.original && (S.venomUntil || 0) > absHours();
/* at zero health: who dies, who only drops, who is spared */
function fall(e, src, o) {
  const ours = src === pl || !src || src.team === 0;
  if (undead(e)) { if (lethalTo(e, o)) trueDeath(e, src, o); else if (e.downed) e.hp = 1; else downEnemy(e, src); return; }
  if (ours && personLife(e) && !e.phantom && mercy() && !S.flags[e.type + 'Oath']) return knockOut(e, src);   // ...unless the story has had the player swear to this one death (S.flags.alphaOath)
  die(e, src);
}
function trueDeath(e, src, o) {
  if (isImmortal(e)) { if (!e.downed && !e.dead) downEnemy(e, src); return; }   // whoever asks: he only lies still
  const m = o.mat, L = o.lethal; e.burnt = m === 'fire' || m === 'sun' || (L === 'whiteoak' && isOrig(e));
  if (L === 'whiteoak' && isOrig(e)) { const w = S.eq.weapon; RT.flashV = 0.4; RT.shake = 0.8; sfx('fire'); sfx('boom'); ringFx(e.x, e.z, 0xffb060, 10, 1); puff(e.x, 1, e.z, 60, { c: FIRE, add: 1, sp: 4, up: 5, life: 1.1, size: 0.4, grav: -1, spread: 0.6 });
    if (w && w.uniq === 'whiteoak' && !w.indestructible) { S.eq.weapon = null; recalc(); refreshGear(); toast('The white oak catches with him and burns to nothing in your hand.'); } }
  else if (e.burnt) { puff(e.x, 1, e.z, 26, { c: FIRE, add: 1, sp: 2.5, up: 3.5, life: 0.8, size: 0.34, grav: -1, spread: 0.4 }); sfx('fire'); }
  else if (!L) floatText(e.x, 3, e.z, m === 'venom' ? 'THE VENOM TAKES IT' : m === 'steel' ? 'BEHEADED' : 'STAKED', '#ffd24a', 15);
  // a keeper is only written down as slain when the kill is the player's to claim: a death nobody is paid for must never close a quest
  if (e.def.boss && !e.noCredit && (src === pl || !src || src.team === 0)) (S.flags.slain = S.flags.slain || {})[e.type] = S.day;
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
  if (P.thorns > 0 && src && src.kind === 'enemy' && !src.dead && !lying(src) && !src.phantom && !bondHolds(src)) { src.hp -= P.thorns; src.flash = 0.1; if (src.hp <= 0) fall(src, pl, { mat: 'steel' }); }
  if (src && src.leech && !src.dead && !(src.fx.verv > 0)) src.hp = Math.min(src.maxHp, src.hp + d * src.leech * 4);
  const sw = sk('h_second'); if (sw && pl.hp > 0 && pl.hp < P.maxHp * 0.3 && pl.buff.second <= 0) { pl.buff.second = 90; heal(P.maxHp * (0.1 + 0.1 * sw)); floatText(pl.x, 3, pl.z, 'SECOND WIND', '#9effa0', 16); }
  if (pl.hp <= 0) playerDeath(src, o); return d;
}
function heal(n, quiet) { if (pl.dead || (pl.fx.lodged > 0 && isVamp()) || venomed()) return; const b = pl.hp; pl.hp = Math.min(P.maxHp, pl.hp + n); if (!quiet && pl.hp - b > 1) { floatText(pl.x, 2.6, pl.z, '+' + fmt(pl.hp - b), '#7dff8a', 15); puff(pl.x, 1, pl.z, 8, { c: GREEN, add: 0.9, sp: 1, up: 2.5, life: 0.7, size: 0.18, grav: -1 }); } }
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
  // the Hunter's Curse falls on a vampire who kills one of the Five. It only strikes a supernatural killer: have a compelled human do it and nothing follows you home.
  if ((e.def.five || e.type === 'fivehunter') && isVamp() && (src === pl || !src || undead(src) || src.fam === 'wolf')) hunterCurse();
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
    if (!gone) { const targets = p.team === 0 ? actors.filter(a => a.kind === 'enemy' && a.team !== 0 && !a.dead && !a.ko) : [pl, ...actors.filter(a => a.team === 0 && !a.dead && a.kind === 'enemy' && !lying(a))];
      for (const a of targets) { if (a.dead || p.hitIds[a.id] || hyp(a.x - p.x, a.z - p.z) > p.r + a.r) continue; p.hitIds[a.id] = 1; p.keep = false; const got = hit(p.owner, a, { dmg: p.dmg, mat: p.mat, proj: p, verv: p.verv, bane: p.bane, venom: p.venom, kb: p.kb != null ? p.kb : 2, poise: p.poise || 6, spell: p.spell, at: p, dir: Math.atan2(p.vx, p.vz) }); if (p.keep) { p.hitIds = {}; p.t = 0; break; } if (a === pl && got === 0 && pl.inv > 0) { delete p.hitIds[a.id]; continue; } if (p.onHit && got) p.onHit(a); if (!p.pierce) { gone = true; break; } } }
    if (gone) { puff(p.x, 1.3, p.z, 5, { c: p.pc || SPARK, add: 1, sp: 2, life: 0.25, size: 0.14, grav: 0 }); p.m.parent && p.m.parent.remove(p.m); p.m.material.dispose(); shots.splice(i, 1); } }
}
/* hazard: a delayed circular blast (or lingering pool). o: team, mat, col, linger seconds, tick, onHit, src */
function hazard(x, z, r, delay, dmg, o = {}) { const h = Object.assign({ x, z, r, delay, dmg, t: 0, team: 1, done: false, linger: 0, tickT: 0 }, o); if (delay > 0.05) h.tele = telegraph(x, z, 0, { kind: 'circle', r }, delay + 0.02, o.col || 0xff2030); zonesFx.push(h); return h; }
function hazardHit(h, dmg) { const targets = h.team === 0 ? actors.filter(a => a.kind === 'enemy' && a.team !== 0 && !a.dead && !a.ko) : [pl, ...actors.filter(a => a.team === 0 && !a.dead && a.kind === 'enemy' && !lying(a))]; for (const a of targets) if (a !== h.skip && hyp(a.x - h.x, a.z - h.z) < h.r + a.r * 0.5) { const got = hit(h.src || null, a, { dmg, mat: h.mat, at: h, unblock: h.unblock, kb: h.kb || 0, poise: h.poise || 0, spell: h.spell, verv: h.verv, bane: h.bane, venom: h.venom, dot: h.linger > 0, noCrit: h.linger > 0 && h.done }); if (got && h.onHit) h.onHit(a); } }
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
  else if (k === 'slam') { if (!jump && !A.far) { c.tx = e.x; c.tz = e.z; } c.tele = telegraph(c.tx, c.tz, 0, { kind: 'circle', r: A.r || 3 }, c.wind, A.mat === 'verv' ? 0xb070ff : A.mat === 'wolfsbane' ? 0xffe060 : undefined); } else if (k === 'nova') c.tele = telegraph(e.x, e.z, 0, { kind: 'circle', r: 3 }, c.wind, 0xff3050);
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
    case 'slam': if (A.jump || name === 'pounce') { e.x = c.tx; e.z = c.tz; collide(e); } hazard(c.tx, c.tz, A.r || 3, 0, dmg, { team: e.team, src: e, mat, kb: 6, poise: 20, venom: ven, verv: mat === 'verv', bane: mat === 'wolfsbane', onHit: t => { if (t === pl && (name === 'pounce' || A.stun)) addFx(pl, 'stun', A.stun || 0.45); } });   // mat 'verv' + stun: a hunter's vervain grenade (ATK.vgren); mat 'wolfsbane': the one they bring for a wolf (ATK.wgren)
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
  if (RT.area.id === 'world' && undead(e) && !isHyb(e) && !e.ring && !e.phantom && sunUp() && !shelterAt(e.x, e.z)) {
    // a keeper nobody has struck (or one in a duel to the first fall) does not stand and wait for the sun: it goes to ground, and the story brings it back the next night
    if (def.boss && (!ai.provoked || e.duel)) { if (RT.boss === e) { RT.boss = null; hideBoss(); } dropAtk(e); e.sw = null; if (e.duel && e.type === 'ambrose') S.flags.ambroseDay = S.day; if (pl && !pl.dead && d2(e, pl) < 60) toast(e.name.split(',')[0] + ' is gone before the sun clears the trees.'); e.gone = true; return; }
    const wet = S.weather === 'storm' || S.weather === 'rain' || S.weather === 'fog'; e.hp -= e.maxHp * (wet ? 0.06 : 0.16) * dt; e.hpShow = 2; e.fx.slow = Math.max(e.fx.slow || 0, 0.3); puff(e.x + R(-0.3, 0.3), 1.4, e.z + R(-0.3, 0.3), 2, { c: FIRE, add: 1, sp: 0.6, up: 2.5, life: 0.5, size: 0.3, grav: -2 });
    if (e.hp <= 0) { if (!ai.provoked) e.paid = e.noCredit = true; return fall(e, null, { mat: 'sun' }); } }
  // any stun cancels the attack in hand (and lets go of whoever it was holding), however it was landed
  if (e.fx.stun > 0) { if (ai.cur) { dropAtk(e); e.sw = null; e.y = 0; } e.sp = 0; return; } for (const k in ai.cd) ai.cd[k] -= dt; ai.gcd -= dt; ai.t -= dt;
  if (def.boss && !e.enraged && e.hp < e.maxHp * 0.5) { e.enraged = true; e.spdM *= 1.15; floatText(e.x, 3.4, e.z, 'ENRAGED', '#ff4050', 20); sfx('growl'); ringFx(e.x, e.z, 0xff2030, 9, 0.7); RT.shake = 0.5; if (e.fam === 'wolf' && e.rig.kind === 'biped') rigEyes(e.rig, 1); }
  else if (!def.boss && !e.enraged && e.fam === 'wolf' && e.rig.kind === 'biped' && e.hp < e.maxHp * 0.6) { e.enraged = true; e.dmgM *= 1.2; e.spdM *= 1.12; rigEyes(e.rig, 1); floatText(e.x, 2.9, e.z, 'FURY', '#ffd24a', 14); sfx('growl'); }   // a werewolf's eyes go gold when the anger comes up, and the strength with them
  if (ai.cur) return updAtk(e, dt);
  if (def.peaceful) { const d = d2(e, pl); if (d < 10 || e.hp < e.maxHp) { ai.flee = 3; } if (ai.flee > 0) { ai.flee -= dt; const a = dirTo(pl, e); mv(e, e.x + Math.sin(a) * 5, e.z + Math.cos(a) * 5, def.spd, dt); } else wander(e, dt, 2); return; }
  // the leash: pulled too far from home it gives up, heals once, and walks back for a few seconds before it will look at anyone again. The Council's hunters (ai.hunt) are after the player, not a place.
  if (e.team === 1 && RT.area.id === 'world' && !def.boss && !ai.hunt && !(ai.leash > 0) && d2(e, ai.home) > 70) { ai.aggro = false; ai.leash = 5; e.hp = e.maxHp; }
  if (ai.leash > 0) { ai.leash -= dt; if (d2(e, ai.home) > 2) mv(e, ai.home.x, ai.home.z, def.spd, dt); else { e.sp = 0; ai.leash = 0; } return; }
  const tgt = nearestFoe(e, 60); if (!tgt) { if (e.team === 0) { if (d2(e, pl) > 3.5) mv(e, pl.x + 2, pl.z + 2, def.spd, dt); else e.sp = 0; } else { ai.aggro = false; wander(e, dt, 1.8); } return; } const d = d2(e, tgt);
  if (!ai.aggro) { if (d < (def.boss ? 16 : (isNight() ? 15 : 12)) && los(e, tgt)) aggro(e); else return wander(e, dt, 1.8); }
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
/* who does not run from a wolf. 1: their own kind of secret; they neither run nor tell (a witch, a wolf, the dead and the man who keeps their door). 2: Council; they stand, and they tell. */
const WOLF_KNOWN = { odette: 1, wren: 1, ambrose: 1, gault: 1, casimir: 1, corvin: 1, hale: 2, bex: 2 };
function spawnNpc(o) {
  const L = Object.assign({ cloth: pick(TOWNLOOK.cloth), hair: pick(TOWNLOOK.hair), skin: pick(TOWNLOOK.skin), pants: pick(TOWNLOOK.pants), long: chance(0.45) }, o.look || {}), def = { n: o.n, rig: 'human', fam: 'human', look: L, scale: o.scale || 1 }, rig = mkBody(def), n = baseActor('npc', def, rig, o.x, o.z);
  // the Council puts vervain in the town's coffee. Most people drink it; the night owls and one in five of the rest do not.
  const verv = o.verv != null ? !!o.verv : o.townie ? !(o.owl || townieN++ % 5 === 3) : true;
  areaAdd(rig.g); Object.assign(n, { npc: o, rot: o.rot || 0, vr: o.rot || 0, hp: 50, maxHp: 50, blood: 100, verv, wps: o.wps, wait: R(0, 4), stuck: 0, pose: o.pose || null, r: 0.5 }); actors.push(n); pose(n, 0); return n;
}
function updNpc(n, dt) {
  if (n.dead) return; if (n.held) { n.sp = 0; return; }
  /* a wolf in the street. Everyone ordinary runs from it, named or not, and anyone who gets a clear look tells the Council: the same exposure a vampire earns by being seen feeding,
     once a night for each witness. The wolf only has to be there; whether it bites anyone is the player's doing. Sage smoke or a cloak hides it. */
  const near = d2(n, pl) < 11, wolfNear = near && pl.wolf && !pl.dead && n.rig.g.visible && !(pl.buff.cloak > 0), who = WOLF_KNOWN[n.npc.id];
  if (wolfNear && who !== 1 && n.sawWolf !== moonDay() && los(n, pl)) { n.sawWolf = moonDay(); const F = S.flags, first = !F.wolfSeen; F.wolfSeen = moonDay(); S.exposure = Math.min(100, S.exposure + 18); toast(first ? 'Someone saw the wolf. The Council hunts what the town has seen.' : 'Someone saw the wolf.'); }
  if (!(n.fleeT > 0) && near && (pl.wolf ? !who : (n.wps || n.npc.townie) && n.fearDay === S.day)) n.fleeT = 3;      // nobody stands and talks to a wolf, or to the thing that bit them this morning
  if (n.fleeT > 0) { n.fleeT -= dt; n.dazed = 0; n.away = 1; n.homeT = 0; const a = dirTo(pl, n); mv(n, n.x + Math.sin(a) * 5, n.z + Math.cos(a) * 5, 5.2, dt); return; }
  if (n.dazed > 0) { n.dazed -= dt; n.sp = 0; n.fx.stun = 0.2; return; }
  /* someone with a place to stand walks back to it once the fright is over. If a wall is in the way they wait, and are simply there again once nobody is near enough to see. */
  if (!n.wps && n.away) {
    const hx = n.npc.x, hz = n.npc.z, ox = n.x, oz = n.z; if (hyp(ox - hx, oz - hz) < 0.5) { n.x = hx; n.z = hz; n.away = 0; n.homeT = 0; n.sp = 0; return; }
    if (n.homeT > 3) { n.sp = 0; if (d2(n, pl) > 24) { n.x = hx; n.z = hz; n.away = 0; n.homeT = 0; } return; }
    mv(n, hx, hz, 2.4, dt); if (hyp(n.x - ox, n.z - oz) < 1.2 * dt) n.homeT = (n.homeT || 0) + dt; return;
  }
  if (!n.wps) { n.sp = 0; if (n.npc.talk && d2(n, pl) < 7 && !n.npc.still) n.rot += angd(dirTo(n, pl), n.rot) * Math.min(1, dt * 4); else if (n.npc.rot != null) n.rot = n.npc.rot; return; }
  if (n.wait > 0) { n.wait -= dt; n.sp = 0; return; }
  if (!n.tg || hyp(n.x - n.tg[0], n.z - n.tg[1]) < 1.2 || n.stuck > 2.5) { n.tg = pick(n.wps); n.wait = n.stuck > 2.5 ? 0 : R(0, 5); n.stuck = 0; return; }
  const ox = n.x, oz = n.z; mv(n, n.tg[0], n.tg[1], 2.1, dt); if (hyp(n.x - ox, n.z - oz) < 1.2 * dt) n.stuck += dt;
}

/* ---------------- phantoms: the Hunter's Curse, and the fever of a werewolf bite ---------------- */
function haunting() { const h = absHours(); return (S.curseUntil || 0) > h ? 'curse' : (S.venomUntil || 0) > h && isVamp() && !isHybrid() ? 'venom' : (S.flags.ringHaunt || 0) > h && S.species === 'human' ? 'ring' : null; }   // 'ring': what a Founder's Ring keeps each time it brings its wearer back (40-systems respawn)
function spawnPhantom(kind) {
  const types = (kind === 'curse' ? ['fivehunter', 'fivehunter', 'hunter', 'robber'] : ['robber', 'hunter', 'feral', 'cultist']).filter(t => EN[t] && !EN[t].boss); if (!types.length) return null;
  for (let t = 0; t < 6; t++) { const a = R(0, TAU), d = R(8, 13), x = pl.x + Math.sin(a) * d, z = pl.z + Math.cos(a) * d; if (solidAt(x, z)) continue; const probe = { x, z, r: 0.6 }; collide(probe); if (hyp(probe.x - x, probe.z - z) > 1.5) continue;
    const e = spawnEnemy(pick(types), x, z, S.lvl, { spawned: true, phantom: true, awake: 1 }); e.name = kind === 'curse' ? (e.type === 'fivehunter' ? 'The hunter you killed' : pick(['Someone you failed', 'A face from home'])) : pick([kind === 'ring' ? 'Someone who is not there' : 'Someone you bit', 'A face from home', 'Your own voice']); e.rot = dirTo(e, pl); return e; }
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
      for (let k = 0; k < 2; k++) { const e = spawnEnemy(k === 0 && five ? 'fivehunter' : 'hunter', pl.x + Math.sin(a) * 42 + k * 2, pl.z + Math.cos(a) * 42, Math.max(3, S.lvl + RI(-1, 1)), { spawned: true }); collide(e); e.ai.provoked = e.ai.hunt = true; aggro(e); }
      toast(five ? 'The Council has your description. One of the men coming is not Council: he moves like he was made for this.' : S.species === 'werewolf' ? 'The Council knows there is a wolf, and whose face it wears by day. Hunters are closing in with wolfsbane.' : 'The Council has your description. Hunters are closing in.'); } }
  worldEvents();
}

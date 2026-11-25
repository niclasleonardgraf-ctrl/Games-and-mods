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

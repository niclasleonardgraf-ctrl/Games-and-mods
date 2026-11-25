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

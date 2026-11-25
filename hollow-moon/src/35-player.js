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

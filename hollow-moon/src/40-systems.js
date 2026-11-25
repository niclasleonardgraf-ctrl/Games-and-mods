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

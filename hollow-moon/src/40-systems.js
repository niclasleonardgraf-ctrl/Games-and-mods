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
    case 'cure': if (tr) { toast('There is nothing to cure yet. You are not one of them until you feed.'); return false; } if (!vamp) { toast('It would do nothing to you. It is for the dead.'); return false; } S.cons[k]--; cureVampire(); return true;
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
const typeOk = t => { const d = EN[t]; return !!d && (!d.full || (fullMoon() && isNight())) && (!d.need || !!S.flags[d.need]); };
function spawnTable(z) { const night = isNight(), t = night ? (fullMoon() && z.full ? z.full : z.night) : z.day; return (t || []).filter(typeOk); }
const plural = t => EN[t].pl || EN[t].n + 's';
function genBounties() {
  if (S.bountyDay === S.day && S.bounties.length) return; S.bountyDay = S.day; S.bounties = S.bounties.filter(b => b.acc && !b.paid); const L = S.lvl;
  /* the Council pays for monsters: nothing peaceful, nobody who leaves ordinary people alone (the pack, its own hunters), nothing that only exists under a full moon */
  const fair = z => (z.night || []).concat(z.day || []).filter(t => { const d = EN[t]; return !d.peaceful && !d.onlyVs && !d.full && (!d.need || S.flags[d.need]); }), zs = ZONES.filter(z => !z.safe && z.night && z.lvl <= L + 6 && fair(z).length); let guard = 0;
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

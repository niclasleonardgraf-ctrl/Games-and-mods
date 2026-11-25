/* Hollow Moon — balance: what each species is worth with the same gear at the same level, how long ordinary enemies and keepers last, and a few real fights at level 1
   played by a simple bot.  node tools/tests/balance.js <dir> [numbers,fights] */
const { launch, open, ok, note, finish, sections } = require('./_lib');

async function numbers(b) {
  console.log('\n# the species, side by side (level 10, the same rare sabre and vest)');
  const h = await open(b, { origin: 'human', tag: 'numbers' }), { ev } = h;
  const rows = await ev(() => {
    HM.gainXp(4000); HM.S.lvl = 10; HM.S.attr = { mig: 9, fin: 9, vig: 9, wil: 0 }; HM.S.eq.weapon = HM.genItem(10, { base: 'sword', rar: 2 }); HM.S.eq.weapon.aff = []; HM.S.eq.armor = HM.genItem(10, { base: 'vest', rar: 2 }); HM.S.eq.armor.aff = []; HM.S.skills = {};
    const S = HM.S, pl = HM.pl, base = { origin: S.origin, species: S.species, day: S.day, clock: S.clock }, out = {};
    const sheet = () => { HM.recalc(); const P = HM.P, c = { fast: [[0.24, 0.8], [0.24, 0.8], [0.32, 1.25]], med: [[0.34, 1], [0.34, 1], [0.46, 1.5]], slow: [[0.48, 1.3], [0.48, 1.3], [0.62, 1.9]], wolf: [[0.27, 0.9], [0.27, 0.9], [0.42, 1.7]], staff: [[0.36, 1], [0.36, 1], [0.48, 1.4]] }[P.wcls], m = c.reduce((a, x) => a + x[1], 0), d = c.reduce((a, x) => a + x[0], 0);
      return { dps: +(P.wdmg * P.meleeM * m / d * P.as * (1 + P.crit / 100 * (P.critMult - 1))).toFixed(1), hp: Math.round(P.maxHp), spd: +P.spd.toFixed(2), power: P.power }; };
    const as = (name, o) => { S.origin = o.origin || 'human'; S.species = o.species || 'human'; S.original = !!o.original; S.heretic = false; S.diet = o.diet || 'human'; S.day = o.full ? 2 : 6; S.clock = o.full ? 22 : 12; pl.wolf = !!o.wolf; pl.blood = o.blood != null ? o.blood : 1e9; pl.rage = 0; pl.dryT = o.dry || 0; pl.fx = {}; out[name] = sheet(); };
    as('human', {}); as('gene carrier', { origin: 'wolf' }); as('werewolf, new moon', { origin: 'wolf', species: 'werewolf' }); as('werewolf, day of the full moon', { origin: 'wolf', species: 'werewolf', full: 1 }); as('werewolf as a wolf, full moon', { origin: 'wolf', species: 'werewolf', full: 1, wolf: 1 });
    as('vampire', { species: 'vampire' }); as('vampire on animal blood', { species: 'vampire', diet: 'animal' }); as('vampire, starved a minute', { species: 'vampire', blood: 0, dry: 61 }); as('hybrid', { origin: 'wolf', species: 'hybrid' }); as('hybrid as a wolf', { origin: 'wolf', species: 'hybrid', wolf: 1 }); as('Original', { species: 'vampire', original: 1 });
    S.origin = base.origin; S.species = base.species; S.original = false; S.day = base.day; S.clock = base.clock; pl.wolf = false; pl.blood = 60; pl.dryT = 0; HM.recalc(); return out; });
  for (const k in rows) note(k.padEnd(32), rows[k]);
  const d = k => rows[k].dps, H = d('human');
  ok('balance: a werewolf in human form is stronger than a person and weaker than a vampire', d('human') < d('gene carrier') && d('gene carrier') < d('werewolf, new moon') && d('werewolf, new moon') < d('vampire'), rows);
  ok('balance: the moon makes the wolf: stronger on the day of the full moon, and as a wolf a match for a vampire', d('werewolf, day of the full moon') > d('werewolf, new moon') && d('werewolf as a wolf, full moon') >= d('vampire'), rows);
  ok('balance: a hybrid outdoes a vampire and a werewolf; an Original outdoes any vampire', d('hybrid') > d('vampire') && d('hybrid') > d('werewolf, new moon') && d('Original') > d('vampire') && rows.Original.hp > rows.vampire.hp, rows);
  ok('balance: the weaknesses cost something: animal blood and starvation both weaken a vampire', d('vampire on animal blood') < d('vampire') && d('vampire, starved a minute') < d('vampire on animal blood') + 1e-9 && rows['vampire, starved a minute'].spd < rows.vampire.spd, rows);
  ok('balance: nothing is worth more than two and a half people with the same sword', Object.keys(rows).every(k => d(k) <= H * 2.5), Object.fromEntries(Object.keys(rows).map(k => [k, +(d(k) / H).toFixed(2)])));

  /* how long things last against that human with that sabre (steel: a vampire still has to be finished; this is only the time to put it down) */
  const ttk = await ev(dps => { const o = {}; for (const t of ['robber', 'wolf', 'feral', 'tombvamp', 'stalker', 'elder', 'cultist', 'warlock', 'shade', 'werewolf', 'packrunner', 'hybrid', 'hunter', 'fivehunter', 'warden', 'corvin', 'alpha', 'ambrose', 'lenore', 'matriarch', 'sleeper', 'casimir']) { const e = HM.spawnEnemy(t, 300, 300, 10, { awake: 1 }); const W = { vampire: 1, original: 1, hybrid: 1, spirit: 0.8 }[e.fam] || 1; o[t] = { hp: Math.round(e.maxHp), s: +(e.maxHp / (dps * W)).toFixed(1), boss: !!e.def.boss, hit: Math.round(e.dmg) }; e.dead = true; e.gone = true; } return o; }, H);
  const ord = Object.keys(ttk).filter(k => !ttk[k].boss), boss = Object.keys(ttk).filter(k => ttk[k].boss);
  note('ordinary, seconds to put down:', Object.fromEntries(ord.map(k => [k, ttk[k].s]))); note('keepers, seconds to put down: ', Object.fromEntries(boss.map(k => [k, ttk[k].s])));
  ok('pacing: a same-level ordinary enemy takes a few seconds of uninterrupted hitting (1.5 to 20)', ord.every(k => ttk[k].s >= 1.5 && ttk[k].s <= 20), Object.fromEntries(ord.map(k => [k, ttk[k].s])));
  ok('pacing: a keeper takes 15 to 120 seconds of uninterrupted hitting (about a minute once it fights back)', boss.every(k => ttk[k].s >= 15 && ttk[k].s <= 120), Object.fromEntries(boss.map(k => [k, ttk[k].s])));
  ok('pacing: no ordinary same-level enemy kills in fewer than five blows', ord.every(k => ttk[k].hit * 5 < rows.human.hp * 1.3), { hp: rows.human.hp, hits: Object.fromEntries(ord.map(k => [k, ttk[k].hit])) });
  await h.close();
}

async function fights(b) {
  console.log('\n# level 1 fights in the square, played by a bot (walk up, swing, finish what is down)');
  const h = await open(b, { origin: 'human', tag: 'fights' }), { ev, p } = h;
  const fresh = (base, clock) => ev(([base, clock]) => { HM.S.clock = clock; HM.S.lvl = 1; HM.S.xp = 0; HM.S.skills = {}; HM.S.eq.weapon = HM.genItem(1, { base, rar: 0 }); HM.S.eq.ranged = null; HM.recalc(); HM.pl.fx = {}; HM.pl.hp = HM.P.maxHp; HM.pl.sta = HM.P.maxSta; HM.pl.x = 10; HM.pl.z = 5; HM.pl.inv = 0; HM.RT.dlgT = 0; for (const a of HM.actors.slice()) if (a.kind === 'enemy') { a.dead = true; a.gone = true; } }, [base, clock]);
  const fight = async (label, base, clock, spawn, dodge, maxS = 70) => {
    await fresh(base, clock); await h.run(0.1); await ev(spawn); await ev(() => { window.TAKEN = 0; window.LASTHP = HM.pl.hp; window.T0 = HM.RT.time; window.DOWNS = 0; });
    let res = { done: false };
    for (let i = 0; i < maxS * 12; i++) { res = await ev(dodge => { const en = HM.actors.filter(a => a.kind === 'enemy' && !a.dead && !a.def.peaceful && !a.gone), pl = HM.pl; if (pl.hp < LASTHP) TAKEN += LASTHP - pl.hp; LASTHP = pl.hp;
        if (!en.length || pl.dead) return { done: true, won: !pl.dead, taken: Math.round(TAKEN), max: Math.round(HM.P.maxHp), t: +(HM.RT.time - T0).toFixed(1), downs: DOWNS };
        if (HM.RT.time - T0 > 60) return { done: true, won: false, timeout: true, taken: Math.round(TAKEN), max: Math.round(HM.P.maxHp), t: 60, downs: DOWNS };
        let near = en[0], bd = 1e9; for (const e of en) { const d = Math.hypot(e.x - pl.x, e.z - pl.z) - (e.downed ? 3 : 0); if (d < bd) { bd = d; near = e; } } const c = near.ai.cur, dist = Math.hypot(near.x - pl.x, near.z - pl.z);
        HM.K.d = HM.K.a = HM.K.w = HM.K.s = false;
        if (near.downed) { if (dist < 2.4) { const it = HM.findInteract(); if (it && /Finish/.test(it.label) && !pl.act) { DOWNS++; it.act(); } } else { const dx = near.x - pl.x, dz = near.z - pl.z; HM.K.d = dx > 0.4; HM.K.a = dx < -0.4; HM.K.s = dz > 0.4; HM.K.w = dz < -0.4; } }
        else if (dodge && c && c.ph === 'wind' && c.t > c.wind * 0.55 && dist < 6 && Math.random() < dodge) HM.press(' ');
        else if (dist < 3.0) { pl.rot = Math.atan2(near.x - pl.x, near.z - pl.z); HM.press('j'); }
        else { const dx = near.x - pl.x, dz = near.z - pl.z; HM.K.d = dx > 0.5; HM.K.a = dx < -0.5; HM.K.s = dz > 0.5; HM.K.w = dz < -0.5; } return { done: false }; }, dodge); if (res.done) break; await p.waitForTimeout(60); }
    await ev(() => { HM.K.d = HM.K.a = HM.K.w = HM.K.s = false; }); note(label.padEnd(44), res);
    if (res.done && !res.won && !res.timeout) { await h.until(() => !document.getElementById('death').hidden, null, 10000); await ev(() => document.getElementById('respawn').click()); await h.until(() => !HM.pl.dead, null, 10000); await h.unpaused(); }
    return res;
  };
  let r = await fight('ash bat v one timber wolf, no dodging', 'bat', 12, () => { HM.spawnEnemy('wolf', 15, 8, 1); }, 0);
  ok('fight: a new arrival beats one timber wolf in a few seconds and survives it', r.won && r.t >= 1.5 && r.t <= 25 && r.taken < r.max, r);
  r = await fight('ash bat v one newborn vampire, no dodging', 'bat', 22, () => { HM.spawnEnemy('feral', 15, 8, 1, { awake: 1 }); }, 0);
  ok('fight: wood kills a newborn vampire outright: a few seconds, survivable', r.won && r.t >= 1.5 && r.t <= 25 && r.taken < r.max && r.downs === 0, r);
  r = await fight('hunting knife v one newborn vampire', 'dagger', 22, () => { HM.spawnEnemy('feral', 15, 8, 1, { awake: 1 }); }, 0);
  ok('fight: steel only drops it; finishing it while it is down (the head) wins the fight', r.won && r.downs >= 1 && r.t <= 40, r);
  r = await fight('ash bat v two newborn vampires, dodging 60%', 'bat', 22, () => { HM.spawnEnemy('feral', 15, 8, 1, { awake: 1 }); HM.spawnEnemy('feral', 5, 0, 1, { awake: 1 }); }, 0.6);
  ok('fight: two at once can be won with dodging', r.won, r);
  r = await fight('ash bat v three timber wolves, no dodging', 'bat', 12, () => { HM.spawnEnemy('wolf', 15, 8, 1); HM.spawnEnemy('wolf', 5, 0, 1); HM.spawnEnemy('wolf', 16, 2, 1); }, 0);
  ok('fight: three wolves at level 1 with no dodging is a real fight (it costs at least a fifth of your health)', r.done && r.taken >= r.max * 0.2, r);
  await h.close();
}

(async () => { const b = await launch(); await sections(b, [['numbers', numbers], ['fights', fights]], process.argv[3]); await finish(b); })();

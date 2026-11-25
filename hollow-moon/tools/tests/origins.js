/* Hollow Moon — the four bloodlines, each driven through its canon transformation by way of window.HM.
   Run from /tmp with a static server on :8765:  node tools/tests/origins.js <dir for output>
   One line per assertion (PASS / FAIL), page errors at the end, exit code 1 if anything failed. */
const { launch, open, ok, finish, sections } = require('./_lib');
const start = (b, origin, tag) => open(b, { origin, tag });

/* ============ human: dies with vampire blood → transition → drinks → vampire; also the rules for enemies ============ */
async function human(b) {
  console.log('\n# human → vampire');
  const h = await start(b, 'human', 'human'), { ev } = h;
  let s = await ev(() => ({ origin: HM.S.origin, species: HM.S.species, v: HM.S.v, vt: HM.treeOpen('vampire'), ht: HM.treeOpen('hunter'), wt: HM.treeOpen('witch'), lt: HM.treeOpen('wolf'), ot: HM.treeOpen('original'), mercy: HM.S.flags.mercy, indoors: HM.RT.indoors }));
  ok('human: starts as origin human, species human, save v3', s.origin === 'human' && s.species === 'human' && s.v === 3, s);
  ok('human: only the Hunter tree is open at the start', s.ht && !s.vt && !s.wt && !s.lt && !s.ot, s);

  /* --- a downed vampire revives unless finished --- */
  await ev(() => { HM.S.clock = 22; HM.pl.inv = 1e6; window.K0 = HM.S.stats.kills; window.E = HM.spawnEnemy('feral', HM.pl.x + 1.6, HM.pl.z, 1, { awake: 1 }); E.fx.stun = 60; HM.hit(HM.pl, E, { dmg: 1e9, mat: 'steel', melee: 1 }); });
  s = await ev(() => ({ downed: E.downed, dead: E.dead, hp: E.hp, kills: HM.S.stats.kills - K0 }));
  ok('vampire enemy: a steel blow only downs it (not dead, no kill credit)', s.downed === true && s.dead === false && s.kills === 0, s);
  s = await ev(() => { const d = HM.hit(HM.pl, E, { dmg: 1e9, mat: 'steel', melee: 1 }); return { d, dead: E.dead, downed: E.downed }; });
  ok('vampire enemy: more steel while it is down does nothing', s.d === 0 && !s.dead && s.downed, s);
  await ev(() => { E.downT = 0.01; }); const rose = await h.until(() => !E.downed && !E.dead, null, 20000);
  s = await ev(() => ({ downed: E.downed, dead: E.dead, hp: Math.round(E.hp), max: Math.round(E.maxHp) }));
  ok('vampire enemy: left alone it gets back up', rose && !s.dead && s.hp > 1, s);
  s = await ev(() => { E.fx.stun = 60; HM.hit(HM.pl, E, { dmg: 1e9, mat: 'steel', melee: 1 }); const o = HM.actorInteract(E, Math.hypot(E.x - HM.pl.x, E.z - HM.pl.z)); const label = o && o.label; if (o) o.act(); return { label, dead: E.dead, kills: HM.S.stats.kills - K0, wmat: HM.P.wmat }; });
  ok('vampire enemy: E on a downed one finishes it (wood through the heart), and that is the kill', /Finish/.test(s.label || '') && s.dead === true && s.kills === 1, s);
  s = await ev(() => { const a = HM.spawnEnemy('feral', HM.pl.x + 1.6, HM.pl.z, 1, { awake: 1 }); HM.hit(HM.pl, a, { dmg: 1e9, mat: 'wood', melee: 1 }); const b2 = HM.spawnEnemy('feral', HM.pl.x + 1.6, HM.pl.z, 1, { awake: 1 }); HM.hit(HM.pl, b2, { dmg: 1e9, mat: 'steel', melee: 1, heavy: 1 }); const c = HM.spawnEnemy('feral', HM.pl.x + 1.6, HM.pl.z, 1, { awake: 1 }); HM.hit(HM.pl, c, { dmg: 1e9, mat: 'fire', spell: 1 }); const d = HM.spawnEnemy('robber', HM.pl.x + 1.6, HM.pl.z, 1); HM.hit(HM.pl, d, { dmg: 1e9, mat: 'steel', melee: 1 }); return { wood: a.dead, head: b2.dead, fire: c.dead, human: d.dead }; });
  ok('vampire enemy: wood, a heavy blade (the head) and fire each kill outright; a human dies of plain steel', s.wood && s.head && s.fire && s.human, s);
  await h.clear();

  /* --- Corvin cannot be killed without the White Oak Stake --- */
  await ev(() => { window.C = HM.spawnEnemy('corvin', HM.pl.x + 2, HM.pl.z, 10); C.fx.stun = 600; HM.hit(HM.pl, C, { dmg: 1e12, mat: 'wood', melee: 1, heavy: 1 }); });
  s = await ev(() => ({ downed: C.downed, dead: C.dead, credit: HM.S.kills.corvin || 0, slain: !!(HM.S.flags.slain && HM.S.flags.slain.corvin) }));
  ok('Corvin: wood through the heart only puts him down (credit for beating him, not slain)', s.downed && !s.dead && s.credit === 1 && !s.slain, s);
  ok('Corvin: the story stands over him and asks what to do', await h.waitDlg(8000)); ok('Corvin: "Not yet." is on offer', await h.choose('Not yet.'));
  s = await ev(() => { const r = { fin: HM.finishDowned(C), wmat: HM.P.wmat }; r.fire = HM.hit(HM.pl, C, { dmg: 1e12, mat: 'fire', spell: 1 }); r.head = HM.hit(HM.pl, C, { dmg: 1e12, mat: 'steel', melee: 1, heavy: 1 }); r.heart = HM.hit(HM.pl, C, { dmg: 1e12, mat: 'steel', lethal: 'heart' }); r.stake = HM.hit(HM.pl, C, { dmg: 1e12, mat: 'wood', lethal: 'stake' }); r.dead = C.dead; r.downed = C.downed; return r; });
  ok('Corvin: an ash bat cannot finish him, nor fire, the head, the heart or an ordinary stake', s.fin === false && !s.dead && s.downed && !s.fire && !s.head && !s.heart && !s.stake, s);
  await ev(() => { C.downT = 0.01; }); const up = await h.until(() => !C.downed && !C.dead, null, 20000);
  ok('Corvin: he gets back up', up, await ev(() => ({ downed: C.downed, dead: C.dead, hp: C.hp })));
  await ev(() => { C.fx.stun = 600; HM.hit(HM.pl, C, { dmg: 1e12, mat: 'steel', melee: 1 }); }); await h.waitDlg(8000); await h.choose('Not yet.');
  s = await ev(() => { HM.S.eq.weapon = HM.mkUniq('whiteoak', HM.S.lvl); HM.recalc(); const r = { wmat: HM.P.wmat, fin: HM.finishDowned(C) }; r.dead = C.dead; r.slain = !!(HM.S.flags.slain && HM.S.flags.slain.corvin); r.stake = HM.S.eq.weapon; r.fate = HM.S.flags.corvinFate; return r; });
  ok('Corvin: the White Oak Stake through the heart of the downed Original kills him, and burns up', s.wmat === 'whiteoak' && s.fin === true && s.dead && s.slain && s.stake === null, s);
  await h.adv(); await h.unpaused(); await h.run(0.2);
  s = await ev(() => ({ lineDeathAt: HM.S.flags.lineDeathAt || 0, dead: HM.pl.dead, fate: HM.S.flags.corvinFate }));
  ok('Corvin: a living human is not of his line, and nothing happens to them', !s.lineDeathAt && !s.dead && s.fate === 'oak', s);
  await h.clear(); await ev(() => { HM.S.eq.weapon = HM.genItem(1, { base: 'bat', rar: 0 }); HM.recalc(); HM.pl.inv = 0; });

  /* --- vampire blood, then death --- */
  s = await ev(() => { HM.addCons('vblood', 1, true); const used = HM.useCons('vblood'); return { used, vblood: HM.S.flags.vblood, t: HM.S.flags.vbloodT, species: HM.S.species, left: HM.S.cons.vblood }; });
  ok('human: drinking vampire blood only heals; it stays in the system for a day (1440 s)', s.used && s.vblood === 1 && s.t === 1440 && s.species === 'human' && !s.left, s);
  await ev(() => { HM.S.gold = 777; window.SP0 = HM.S.sp; }); await h.die();
  ok('human: dying with vampire blood does not end the game: wakes in transition', await h.awaitTransition());
  s = await ev(() => ({ tr: HM.S.transition, now: HM.absHours(), species: HM.S.species, isVamp: HM.isVamp(), inTr: HM.inTransition(), vt: HM.treeOpen('vampire'), night: HM.isNight(), snap: !!localStorage.getItem('hollowmoon.preturn'), vblood: HM.S.flags.vblood, dead: HM.pl.dead, kind: HM.kind, shown: !document.getElementById('death').hidden }));
  ok('transition: to vampire, sire Corvin, 24 game hours on the clock', !!s.tr && s.tr.to === 'vampire' && s.tr.sire === 'corvin' && Math.abs(s.tr.until - s.now - 24) < 0.5, s);
  ok('transition: still human, not a vampire, the Vampire tree stays shut', s.species === 'human' && !s.isVamp && s.inTr && !s.vt, s);
  ok('transition: woke after dark, the pre-death snapshot is saved, no death screen', s.night && s.snap && !s.dead && !s.shown, s);
  await h.square(); await ev(() => { HM.S.clock = 12; }); await h.run(0.3);
  s = await ev(() => ({ burning: HM.pl.burning, glare: HM.RT.glare, indoors: HM.RT.indoors, safe: HM.daylightSafe() }));
  ok('transition: daylight only hurts the eyes (glare, no burning)', !s.burning && s.glare === 1 && !s.indoors, s);
  s = await ev(() => ({ learn: (HM.S.sp = Math.max(1, HM.S.sp), HM.learn('v_pred'), HM.S.skills.v_pred || 0), compel: HM.immuneCompel(false) }));
  ok('transition: no vampire skill can be learned', s.learn === 0, s);
  await ev(() => { HM.S.clock = 22; HM.addCons('bloodbag', 1, true); HM.useCons('bloodbag'); });
  ok('transition: a blood bag asks before it is drunk', await h.waitDlg(5000)); ok('transition: the player may say "Not yet."', await h.choose('Not yet.'));
  s = await ev(() => ({ tr: !!HM.S.transition, species: HM.S.species, bag: HM.S.cons.bloodbag }));
  ok('transition: refusing leaves them in transition with the bag untouched', s.tr && s.species === 'human' && s.bag === 1, s);
  await ev(() => { HM.useCons('bloodbag'); }); await h.waitDlg(5000); ok('transition: "Drink it." is on offer', await h.choose('Drink it.'));
  s = await ev(() => ({ species: HM.S.species, tr: HM.S.transition, isVamp: HM.isVamp(), vt: HM.treeOpen('vampire'), sire: HM.S.sire, unlinked: HM.S.unlinked, linked: HM.lineLinked(), snap: !!localStorage.getItem('hollowmoon.preturn'), sp: HM.S.sp - SP0, bag: HM.S.cons.bloodbag || 0, safe: HM.daylightSafe(), kind: HM.kind, blood: HM.pl.blood, heretic: HM.S.heretic, five: HM.S.skills.h_five || 0 }));
  ok('vampire: human blood completes the change (species vampire, tree open, snapshot dropped)', s.species === 'vampire' && s.tr === null && s.isVamp && s.vt && !s.snap && s.bag === 0, s);
  ok('vampire: of Corvin\'s line; Corvin was already dead, so the line cannot take them', s.sire === 'corvin' && s.unlinked === true && !s.linked, s);
  ok('vampire: no daylight ring, so the sun is not safe', s.safe === false, s);
  await h.adv(); await h.unpaused(); await h.square(); await ev(() => { HM.S.clock = 12; HM.pl.hp = HM.P.maxHp; });
  ok('vampire: the noon sun burns', await h.until(() => HM.pl.burning === true, null, 15000));
  s = await ev(() => { const r = HM.mkUniq('daylight', HM.S.lvl); HM.S.eq.ring = r; HM.recalc(); const a = HM.daylightSafe(); const de = HM.despellRing(true), b2 = HM.daylightSafe(); HM.despellRing(false); return { a, de, b2, c: HM.daylightSafe(), bound: HM.isBound(r) }; });
  ok('vampire: a daylight ring makes the sun safe; de-spelled it does not; it is bound', s.a === true && s.de === true && s.b2 === false && s.c === true && s.bound === true, s);
  await h.run(0.2); ok('vampire: with the ring on, no burning at noon', await ev(() => HM.pl.burning === false));
  await ev(() => { HM.S.clock = 22; });

  /* --- a werewolf bite, and the only cure --- */
  s = await ev(() => { HM.pl.inv = 0; HM.pl.hp = HM.P.maxHp; const w = HM.spawnEnemy('werewolf', HM.pl.x + 2, HM.pl.z, HM.S.lvl, { awake: 1 }); w.fx.stun = 600; const d = HM.hit(w, HM.pl, { dmg: 4, mat: 'bite', kb: 0, venom: true }); w.dead = true; w.gone = true; return { d, until: HM.S.venomUntil - HM.absHours(), healM: HM.P.healM, status: HM.status, dead: HM.pl.dead }; });
  ok('vampire: a werewolf bite is venom, with a day to live', s.d > 0 && Math.abs(s.until - 24) < 0.5 && !s.dead, s);
  ok('vampire: nothing heals under venom, and the HUD says so', s.healM === 0 && s.status.some(x => /venom/i.test(x)), s);
  s = await ev(() => { HM.addCons('draught', 1, true); HM.pl.hp = HM.P.maxHp * 0.5; HM.pl.healCd = 0; HM.useCons('draught'); HM.addCons('bloodbag', 1, true); HM.useCons('bloodbag'); return { still: HM.S.venomUntil > HM.absHours() }; });
  ok('vampire: draughts and blood bags do not lift venom', s.still === true, s);
  s = await ev(() => { HM.addCons('hblood', 1, true); const used = HM.useCons('hblood'); return { used, until: HM.S.venomUntil, healM: HM.P.healM, hflag: HM.S.flags.hblood || 0 }; });
  ok('vampire: the Blood of the First cures the bite', s.used && s.until === 0 && s.healM > 0, s);
  s = await ev(() => { const r = { before: HM.S.switchOff }; r.flip = HM.flipSwitch(); r.off = HM.S.switchOff; r.back = HM.flipSwitch(); r.on = !HM.S.switchOff; r.guilt = (HM.S.flags.guiltT || 0) > HM.absHours(); return r; });
  ok('vampire: the humanity switch is a toggle, and turning it back on brings guilt', s.before === false && s.flip && s.off === true && s.back && s.on && s.guilt, s);
  await h.close();
}

/* ============ human again: the transition is refused (it lapses), and the hour before death is restored; then a linked vampire and the death of the line ============ */
async function lapse(b) {
  console.log('\n# human → transition lapses → the snapshot is restored; then a linked vampire outlives nothing');
  const h = await start(b, 'human', 'lapse'), { ev } = h;
  await ev(() => { HM.S.clock = 22; HM.S.gold = 777; HM.S.flags.testMark = 41; window.D0 = HM.S.stats.deaths; HM.addCons('vblood', 1, true); HM.useCons('vblood'); }); await h.die();
  ok('lapse: in transition', await h.awaitTransition());
  await ev(() => { HM.S.gold = 5; HM.S.flags.testMark = 99; HM.S.transition.until = HM.absHours() - 0.01; });
  ok('lapse: when the day runs out the story goes back', await h.until(() => !HM.RT.blk && !HM.S.transition && !HM.pl.dead && HM.S.gold === 777, null, 40000));
  let s = await ev(() => ({ species: HM.S.species, tr: HM.S.transition, gold: HM.S.gold, mark: HM.S.flags.testMark, vblood: HM.S.flags.vblood || 0, snap: !!localStorage.getItem('hollowmoon.preturn'), dead: HM.pl.dead, deaths: HM.S.stats.deaths - D0, hp: HM.pl.hp > 0, shown: !document.getElementById('death').hidden, area: HM.S.area, isVamp: HM.isVamp() }));
  ok('lapse: human, alive, not in transition, the blood gone from the system', s.species === 'human' && s.tr === null && !s.vblood && !s.dead && s.hp && !s.isVamp, s);
  ok('lapse: the pre-death snapshot was restored (gold and flags as they were) and then dropped', s.gold === 777 && s.mark === 41 && !s.snap, s);
  ok('lapse: it counts as a death', s.deaths === 1, s);

  /* killed again before feeding is the same true death */
  await h.unpaused(); await ev(() => { HM.S.clock = 22; HM.S.gold = 321; HM.addCons('vblood', 1, true); HM.useCons('vblood'); }); await h.die(); await h.awaitTransition();
  await ev(() => { HM.S.gold = 1; }); await h.die();
  ok('killed in transition: a true death, and the snapshot is restored', await h.until(() => !HM.RT.blk && !HM.S.transition && !HM.pl.dead && HM.S.gold === 321, null, 40000), await ev(() => ({ tr: HM.S.transition, gold: HM.S.gold, dead: HM.pl.dead, blk: HM.RT.blk })));

  /* complete it this time, by feeding on a person: the engine's own Use prompt */
  await h.unpaused(); await ev(() => { HM.S.clock = 22; HM.addCons('vblood', 1, true); HM.useCons('vblood'); }); await h.die(); await h.awaitTransition(); await h.square();
  s = await ev(() => { HM.S.clock = 22; const n = HM.spawnNpc({ n: 'Night owl', x: HM.pl.x + 1.2, z: HM.pl.z, townie: 1, owl: 1, verv: 0 }); window.N = n; const o = HM.actorInteract(n, 1.2); return { label: o && o.label }; });
  ok('transition: E on a townsperson offers to feed, and says what it means', /Feed/.test(s.label || '') && /for good/.test(s.label || ''), s);
  await ev(() => { HM.actorInteract(N, 1.2).act(); }); await h.waitDlg(5000); ok('transition: feeding on a person asks first', await h.choose('Feed.'));
  await ev(() => { HM.K.e = true; }); const turned = await h.until(() => HM.S.species === 'vampire', null, 30000); await ev(() => { HM.K.e = false; });
  s = await ev(() => ({ species: HM.S.species, linked: HM.lineLinked(), sire: HM.S.sire, unlinked: HM.S.unlinked, ndead: N.dead }));
  ok('vampire: a mouthful from a living person completes the change, and they live', turned && s.species === 'vampire' && !s.ndead, s);
  ok('vampire: linked to Corvin\'s line while he lives', s.sire === 'corvin' && s.unlinked === false && s.linked === true, s);
  await h.adv(); await h.unpaused();

  /* floor 10 of the Tomb: Corvin, white oak, and the hour that follows */
  await ev(() => { HM.S.gold = 4242; HM.enterArea('tomb', { depth: 10 }); }); await h.run(0.1);
  s = await ev(() => { window.C = HM.actors.find(a => a.type === 'corvin'); return { keeper: !!C, snap: !!localStorage.getItem('hollowmoon.preboss'), boss: HM.area.boss }; });
  ok('tomb: Corvin keeps the tenth floor, and the hour before a keeper is saved', s.keeper && s.snap && s.boss, s);
  await ev(() => { HM.pl.inv = 1e6; HM.pl.x = C.x; HM.pl.z = C.z + 2; C.fx.stun = 600; HM.hit(HM.pl, C, { dmg: 1e12, mat: 'wood', melee: 1 }); });
  await h.waitDlg(8000); const lines = await ev(() => HM.dq ? HM.dq.lines.map(l => l[1]).join(' ') : ''); await h.choose('Not yet.');
  s = await ev(() => { HM.S.eq.weapon = HM.mkUniq('whiteoak', HM.S.lvl); HM.recalc(); HM.S.gold = 1; const fin = HM.finishDowned(C); return { fin, dead: C.dead, cleared: HM.area.cleared }; });
  ok('linked vampire: white oak kills Corvin', s.fin === true && s.dead, s);
  await h.adv(); await h.unpaused(); await h.run(0.2);
  s = await ev(() => ({ at: (HM.S.flags.lineDeathAt || 0) - HM.absHours(), status: HM.status, dead: HM.pl.dead }));
  ok('linked vampire: the line has about an hour', s.at > 0.5 && s.at <= 1.01 && s.status.includes('The line is dying'), s);
  await ev(() => { HM.pl.inv = 0; HM.S.flags.lineDeathAt = HM.absHours() - 0.001; });
  ok('linked vampire: on the hour, they die with the rest of the line', await h.until(() => HM.pl.dead && !document.getElementById('death').hidden, null, 20000), await ev(() => ({ dead: HM.pl.dead, at: HM.S.flags.lineDeathAt })));
  s = await ev(() => ({ txt: document.getElementById('deathtxt').textContent, sub: document.getElementById('deathsub').textContent }));
  ok('linked vampire: the death screen says why', /Corvin is dead/.test(s.txt) && /goes back/.test(s.sub), s);
  await ev(() => document.getElementById('respawn').click());
  ok('linked vampire: getting up puts the story back to before the keeper', await h.until(() => !HM.pl.dead && HM.S.area === 'world' && HM.S.gold === 4242, null, 20000), await ev(() => ({ dead: HM.pl.dead, area: HM.S.area, gold: HM.S.gold })));
  s = await ev(() => ({ slain: !!(HM.S.flags.slain && HM.S.flags.slain.corvin), species: HM.S.species, linked: HM.lineLinked(), at: HM.S.flags.lineDeathAt || 0, fate: HM.S.flags.corvinFate || null }));
  ok('linked vampire: Corvin is alive again, and so are they', !s.slain && s.species === 'vampire' && s.linked && !s.at && !s.fate, s);
  s = await ev(() => { const r = { un: HM.unlinkSire() }; r.linked = HM.lineLinked(); r.unlinked = HM.S.unlinked; return r; });
  ok('linked vampire: an unlinking cuts them out of the line', s.un === true && !s.linked && s.unlinked === true, s);
  await h.close();
  return lines;
}

/* ============ witch: taught by Odette → turned → the magic is gone and the points come back ============ */
async function witch(b) {
  console.log('\n# witch → taught → turned');
  const h = await start(b, 'witch', 'witch'), { ev } = h;
  let s = await ev(() => { HM.S.sp = 3; HM.learn('w_attune'); return { origin: HM.S.origin, species: HM.S.species, magic: HM.canMagic(), wt: HM.treeOpen('witch'), learned: HM.S.skills.w_attune || 0, flag: HM.S.flags.witch || 0, kind: HM.kind, open: HM.canLearn('w_attune') }; });
  ok('witch: starts human, the craft asleep (no magic, tree shut, nothing learnable)', s.origin === 'witch' && s.species === 'human' && !s.magic && !s.wt && !s.learned && !s.flag && !s.open, s);
  await ev(() => { HM.S.clock = 12; HM.S.quests.q_witch = { step: 3, n: 0 }; });
  ok('witch: Odette Thorne is there to talk to', await h.talk('odette')); await h.adv(); await h.unpaused();
  s = await ev(() => ({ flag: HM.S.flags.witch, magic: HM.canMagic(), wt: HM.treeOpen('witch'), kind: HM.kind, staff: HM.S.inv.some(i => i.base === 'staff'), done: !!HM.S.done.q_witch }));
  ok('witch: Odette wakes the craft (flag set, magic, tree open, a staff handed over)', s.flag === 1 && s.magic && s.wt && s.kind === 'witch' && s.staff && s.done, s);
  s = await ev(() => { HM.S.sp = 6; HM.learn('w_attune'); HM.learn('w_attune'); HM.learn('w_chan'); HM.learn('w_incend'); return { pts: HM.treePts('witch'), sp: HM.S.sp, bar: HM.S.bar.slice(), skills: Object.assign({}, HM.S.skills) }; });
  ok('witch: four points spent in the Witch tree, Incendia on the bar', s.pts === 4 && s.sp === 2 && s.bar.includes('w_incend'), s);
  await h.square(); await h.run(0.1);
  s = await ev(() => { const i = HM.S.bar.indexOf('w_incend'); HM.pl.foc = HM.P.maxFoc; const f0 = HM.pl.foc, e = HM.spawnEnemy('robber', HM.pl.x, HM.pl.z + 3, 1); e.fx.stun = 60; HM.pl.rot = 0; const hp0 = e.hp; HM.castSkill(i); const r = { spent: f0 - HM.pl.foc, cd: HM.pl.cds.w_incend > 0, hurt: e.hp < hp0 || e.ko || e.dead }; HM.pl.cds = {}; HM.pl.act = null; HM.pl.foc = 0; HM.pl.hp = HM.P.maxHp; HM.castSkill(i); r.nose = (HM.P.maxHp - HM.pl.hp) / HM.P.maxHp; r.foc = HM.pl.foc; return r; });
  ok('witch: Incendia costs 22 focus and burns what is in front of her', s.spent === 22 && s.cd && s.hurt, s);
  ok('witch: casting past empty is allowed and costs a tenth of her health (nosebleed)', Math.abs(s.nose - 0.1) < 0.02 && s.foc === 0, s);
  await h.clear();
  await ev(() => { HM.S.clock = 22; window.SP0 = HM.S.sp; HM.addCons('vblood', 1, true); HM.useCons('vblood'); }); await h.die();
  ok('witch: dies with vampire blood → transition', await h.awaitTransition());
  s = await ev(() => ({ magic: HM.canMagic(), pts: HM.treePts('witch') }));
  ok('witch: in transition she is still alive enough to keep the craft', s.magic && s.pts === 4, s);
  await ev(() => { HM.addCons('bloodbag', 1, true); HM.useCons('bloodbag'); }); await h.waitDlg(5000); await h.choose('Drink it.');
  s = await ev(() => ({ species: HM.S.species, magic: HM.canMagic(), wt: HM.treeOpen('witch'), vt: HM.treeOpen('vampire'), w: Object.keys(HM.S.skills).filter(k => k[0] === 'w'), sp: HM.S.sp - SP0, bar: HM.S.bar.slice(), heretic: HM.S.heretic, kind: HM.kind }));
  ok('witch turned: a vampire, and not a Heretic', s.species === 'vampire' && s.vt && !s.heretic, s);
  ok('witch turned: the magic is gone for good (no witch skills, tree shut, nothing on the bar)', !s.magic && !s.wt && s.w.length === 0 && !s.bar.some(k => k && k[0] === 'w'), s);
  ok('witch turned: the four points are refunded (plus the two a new vampire gets)', s.sp === 6, s);
  s = await ev(() => { HM.S.sp = 1; HM.learn('w_attune'); return { learned: HM.S.skills.w_attune || 0, flag: HM.S.flags.witch }; });
  ok('witch turned: the Witch tree cannot be learned again', s.learned === 0, s);
  await h.close();
}

/* ============ siphoner: no magic of her own → turned → a Heretic whose focus comes out of her blood ============ */
async function siphoner(b) {
  console.log('\n# siphoner → heretic');
  const h = await start(b, 'siphoner', 'siphoner'), { ev } = h;
  let s = await ev(() => ({ origin: HM.S.origin, species: HM.S.species, siphon: HM.S.skills.w_siphon || 0, magic: HM.canMagic(), wt: HM.treeOpen('witch'), regen: HM.P.focRegen, foc: HM.pl.foc, bar: HM.S.bar.slice(), kind: HM.kind }));
  ok('siphoner: starts human with Siphon, the tree open, and no focus of her own', s.origin === 'siphoner' && s.species === 'human' && s.siphon === 1 && s.magic && s.wt && s.regen === 0 && s.foc === 0 && s.bar.includes('w_siphon'), s);
  s = await ev(() => { HM.addCons('tonic', 1, true); const used = HM.useCons('tonic'); return { used, foc: HM.pl.foc, left: HM.S.cons.tonic }; });
  ok('siphoner: a focus tonic wakes nothing in her', s.used === false && s.foc === 0 && s.left === 1, s);
  await ev(() => { HM.S.clock = 22; }); await h.run(0.1);
  s = await ev(() => { const i = HM.S.bar.indexOf('w_siphon'); HM.pl.inv = 1e6; const r = {}; const hu = HM.spawnEnemy('robber', HM.pl.x + 1.5, HM.pl.z, 1); hu.fx.stun = 60; HM.castSkill(i); r.fromHuman = HM.pl.foc; hu.dead = true; hu.gone = true; HM.pl.cds = {}; HM.pl.act = null; const v = HM.spawnEnemy('feral', HM.pl.x + 1.5, HM.pl.z, 1, { awake: 1 }); v.fx.stun = 60; const hp0 = v.hp; HM.castSkill(i); r.fromVampire = HM.pl.foc; r.hurt = v.hp < hp0; v.dead = true; v.gone = true; return r; });
  ok('siphoner: a person holds no magic to take; a vampire does', s.fromHuman === 0 && s.fromVampire >= 20 && s.hurt, s);
  s = await ev(() => { const i = HM.S.bar.indexOf('w_siphon'); HM.pl.cds = {}; HM.pl.act = null; HM.S.sp = 1; HM.learn('w_incend'); const j = HM.S.bar.indexOf('w_incend'); HM.pl.foc = 0; const hp0 = HM.pl.hp; HM.castSkill(j); return { cast: !!(HM.pl.cds.w_incend > 0), hp: HM.pl.hp === hp0, learned: HM.S.skills.w_incend || 0 }; });
  ok('siphoner: with nothing siphoned she cannot cast at all (no nosebleed casting)', s.learned === 1 && !s.cast && s.hp, s);
  await h.clear(); await ev(() => { HM.pl.inv = 0; window.SP0 = HM.S.sp; HM.addCons('vblood', 1, true); HM.useCons('vblood'); }); await h.die();
  ok('siphoner: dies with vampire blood → transition', await h.awaitTransition());
  await ev(() => { HM.addCons('bloodbag', 1, true); HM.useCons('bloodbag'); }); await h.waitDlg(5000); await h.choose('Drink it.');
  s = await ev(() => ({ species: HM.S.species, heretic: HM.S.heretic, magic: HM.canMagic(), wt: HM.treeOpen('witch'), vt: HM.treeOpen('vampire'), siphon: HM.S.skills.w_siphon || 0, incend: HM.S.skills.w_incend || 0, kind: HM.kind, sp: HM.S.sp - SP0 }));
  ok('heretic: a vampire who kept her magic (heretic set, both trees open, skills kept)', s.species === 'vampire' && s.heretic === true && s.magic && s.wt && s.vt && s.siphon === 1 && s.incend === 1 && s.kind === 'heretic', s);
  await h.adv(); await h.unpaused(); await h.square(); await h.clear();
  s = await ev(() => { HM.S.clock = 22; HM.pl.foc = 0; HM.pl.blood = HM.P.maxBlood; const b0 = HM.pl.blood; HM.tickClock(2); return { foc: HM.pl.foc, spent: b0 - HM.pl.blood, regen: HM.P.focRegen }; });
  ok('heretic: focus is siphoned out of her own blood over time (1.5 a second, half that in blood)', Math.abs(s.foc - 3) < 0.2 && Math.abs(s.spent - 1.5) < 0.2 && s.regen === 0, s);
  s = await ev(() => { HM.pl.foc = 0; HM.pl.blood = HM.P.maxBlood * 0.1; HM.tickClock(2); return { foc: HM.pl.foc }; });
  ok('heretic: with a fifth of her blood or less, nothing comes', s.foc === 0, s);
  await h.run(0.1);
  s = await ev(() => { const i = HM.S.bar.indexOf('w_siphon'); HM.pl.cds = {}; HM.pl.act = null; HM.pl.foc = 0; HM.pl.blood = 60; HM.castSkill(i); return { foc: HM.pl.foc, blood: HM.pl.blood, cd: HM.pl.cds.w_siphon > 0 }; });
  ok('heretic: Siphon with nothing to touch turns 12 blood into focus', s.foc >= 20 && Math.abs(60 - s.blood - 12) < 0.5 && s.cd, s);
  s = await ev(() => { HM.pl.inv = 0; const w = HM.spawnEnemy('werewolf', HM.pl.x + 12, HM.pl.z, 1, { awake: 1 }); w.fx.stun = 600; HM.hit(w, HM.pl, { dmg: 2, mat: 'bite', venom: true }); w.dead = true; w.gone = true; const bitten = HM.S.venomUntil > HM.absHours(); const i = HM.S.bar.indexOf('w_siphon'); HM.pl.cds = {}; HM.pl.act = null; HM.pl.fx.stun = 0; HM.castSkill(i); return { bitten, after: HM.S.venomUntil }; });
  ok('heretic: she can siphon werewolf venom out of herself', s.bitten === true && s.after === 0, s);
  await h.close();
}

/* ============ wolf: mercy → the deliberate kill → the full moon → Blood of the First → the doppelgänger → hybrid ============ */
async function wolf(b) {
  console.log('\n# werewolf gene → werewolf → hybrid');
  const h = await start(b, 'wolf', 'wolf'), { ev } = h;
  let s = await ev(() => ({ origin: HM.S.origin, species: HM.S.species, mercy: HM.S.flags.mercy, isWolf: HM.isWolf(), lt: HM.treeOpen('wolf'), rage: HM.P.rageGain, shift: HM.shiftAllowed() }));
  ok('wolf gene: starts human, the curse asleep, mercy on', s.origin === 'wolf' && s.species === 'human' && s.mercy === 1 && !s.isWolf && !s.lt && s.rage > 0 && !!s.shift, s);
  await ev(() => { HM.S.clock = 12; window.R1 = HM.spawnEnemy('robber', HM.pl.x + 1.5, HM.pl.z, 1); R1.fx.stun = 60; window.X0 = HM.S.xp + HM.S.lvl * 1e6; HM.hit(HM.pl, R1, { dmg: 1e9, mat: 'wood', melee: 1 }); });
  s = await ev(() => ({ ko: R1.ko, dead: R1.dead, species: HM.S.species, xp: HM.S.xp + HM.S.lvl * 1e6 > X0, trig: HM.S.flags.triggered || 0 }));
  ok('wolf gene: a killing blow on a person only knocks them out (credit given, curse still asleep)', s.ko === true && s.dead === false && s.species === 'human' && s.xp && !s.trig, s);
  s = await ev(() => { const a = HM.spawnEnemy('feral', HM.pl.x + 1.5, HM.pl.z + 1, 1, { awake: 1 }); HM.S.clock = 22; HM.hit(HM.pl, a, { dmg: 1e9, mat: 'wood', melee: 1 }); const d = HM.spawnEnemy('deer', HM.pl.x + 1.5, HM.pl.z - 1, 1); HM.hit(HM.pl, d, { dmg: 1e9, mat: 'wood', melee: 1 }); HM.S.clock = 12; return { vamp: a.dead, deer: d.dead, species: HM.S.species }; });
  ok('wolf gene: killing a vampire or an animal is not a human life and wakes nothing', s.vamp && s.deer && s.species === 'human', s);
  s = await ev(() => { const o = HM.actorInteract(R1, Math.hypot(R1.x - HM.pl.x, R1.z - HM.pl.z)); if (o) o.act(); return { label: o && o.label }; });
  ok('wolf gene: E on the unconscious offers the killing, and says what it wakes', /wakes the curse/.test(s.label || ''), s);
  ok('wolf gene: the killing asks first, and can be refused', (await h.waitDlg(5000)) && await h.choose('Leave them.'));
  s = await ev(() => ({ species: HM.S.species, dead: R1.dead, ko: R1.ko }));
  ok('wolf gene: refused, the curse stays dormant and they stay alive', s.species === 'human' && !s.dead && s.ko, s);
  await ev(() => { window.SP0 = HM.S.sp; HM.actorInteract(R1, Math.hypot(R1.x - HM.pl.x, R1.z - HM.pl.z)).act(); }); await h.waitDlg(5000); await h.choose('Kill them.');
  s = await ev(() => ({ species: HM.S.species, dead: R1.dead, isWolf: HM.isWolf(), lt: HM.treeOpen('wolf'), sp: HM.S.sp - SP0, trig: HM.S.flags.triggered || 0, kind: HM.kind, compel: HM.immuneCompel(true) }));
  ok('werewolf: the deliberate kill triggers the curse (species werewolf, tree open, two points)', s.dead && s.species === 'werewolf' && s.isWolf && s.lt && s.sp === 2 && s.trig > 0, s);
  ok('werewolf: cannot be compelled, even by an Original', s.compel === true, s);
  await h.adv(); await h.unpaused();
  s = await ev(() => { const r = { why: HM.shiftAllowed(), tog: HM.toggleShift(), wolf: HM.pl.wolf, venom: HM.P.venom }; HM.learn('l_might'); r.might = HM.S.skills.l_might || 0; return r; });
  ok('werewolf: no changing at will off the full moon, and no venom in human form', !!s.why && s.tog === false && s.wolf === false && s.venom === 0 && s.might === 1, s);
  s = await ev(() => { const r = HM.spawnEnemy('robber', HM.pl.x + 1.5, HM.pl.z, 1); r.fx.stun = 60; HM.hit(HM.pl, r, { dmg: 1e9, mat: 'wood', melee: 1 }); return { dead: r.dead, ko: !!r.ko }; });
  ok('werewolf: once triggered, blows on people are no longer pulled', s.dead === true && !s.ko, s);
  await h.clear(); await h.square();

  /* the full moon: day 2's night */
  await ev(() => { HM.S.day = 2; HM.S.clock = 21; window.M0 = HM.S.flags.moons || 0; });
  ok('full moon: forced into wolf form', await h.until(() => HM.pl.wolf === true, null, 20000), await ev(() => ({ full: HM.fullMoon(), night: HM.isNight(), wolf: HM.pl.wolf, sp: HM.S.species })));
  await ev(() => { HM.pl.shiftT = 0; HM.pl.shiftCd = 0; }); await h.run(0.1);
  s = await ev(() => { HM.addCons('draught', 1, true); HM.pl.hp = HM.P.maxHp * 0.5; return { wolf: HM.pl.wolf, tog: HM.toggleShift(), still: HM.pl.wolf, why: HM.shiftAllowed(), wcls: HM.P.wcls, wmat: HM.P.wmat, venom: HM.P.venom, cons: HM.useCons('draught'), moons: (HM.S.flags.moons || 0) - M0, status: HM.status, talk: (() => { const n = HM.actors.find(a => a.npc && a.npc.id === 'marnie'); return n ? HM.actorInteract(n, 1) : null; })() }; });
  ok('full moon: the wolf cannot be put away (G refused)', s.tog === false && s.still === true && /moon decides/.test(s.why), s);
  ok('full moon: a real wolf: bites, venom in the bite, no items, no talking', s.wcls === 'wolf' && s.wmat === 'bite' && s.venom > 0 && s.cons === false && s.talk === null, s);
  ok('full moon: not counted until the night is over, and the HUD says wolf form', s.moons === 0 && s.status.includes('Wolf form'), s);
  await ev(() => { HM.S.day = 3; HM.S.clock = 6.2; });
  ok('full moon: released at dawn', await h.until(() => HM.pl.wolf === false, null, 20000), await ev(() => ({ wolf: HM.pl.wolf, clock: HM.S.clock, day: HM.S.day })));
  ok('full moon: counted as a moon survived once dawn comes', await ev(() => (HM.S.flags.moons || 0) - M0 === 1), await ev(() => HM.S.flags.moons));
  s = await ev(() => { HM.S.day = 10; HM.S.clock = 14; const r = { tonight: HM.fullTonight() }; HM.S.eq.ring = HM.mkUniq('moonring', HM.S.lvl); HM.recalc(); HM.S.clock = 21; r.forcedWithRing = HM.shiftAllowed(); return r; });
  await h.run(0.3);
  s.wolfWithRing = await ev(() => HM.pl.wolf); s.tog = await ev(() => { HM.pl.shiftT = 0; HM.pl.shiftCd = 0; const t = HM.toggleShift(); const w = HM.pl.wolf; HM.pl.shiftT = 0; HM.pl.shiftCd = 0; HM.toggleShift(); HM.pl.shiftT = 0; HM.pl.shiftCd = 0; return t && w && !HM.pl.wolf; });
  ok('moonlight ring: on the full moon the wearer is not forced, and may choose to turn and turn back', s.tonight === true && s.forcedWithRing === '' && s.wolfWithRing === false && s.tog === true, s);
  await ev(() => { HM.S.inv.push(HM.S.eq.ring); HM.S.eq.ring = null; HM.S.day = 11; HM.S.clock = 12; HM.S.flags.shifts = 0; HM.recalc(); }); await h.run(0.1);

  /* the Blood of the First, death, the doppelgänger */
  s = await ev(() => { HM.addCons('vblood', 1, true); HM.useCons('vblood'); const r = { vflag: HM.S.flags.vblood || 0 }; HM.addCons('hblood', 1, true); r.used = HM.useCons('hblood'); r.hflag = HM.S.flags.hblood; r.t = HM.S.flags.hbloodT; return r; });
  ok('werewolf: ordinary vampire blood cannot turn a werewolf; the Blood of the First stays in the system', !s.vflag && s.used && s.hflag === 1 && s.t === 1440, s);
  await ev(() => { HM.S.gold = 555; }); await h.die();
  ok('werewolf: dies with the Blood of the First → transition', await h.awaitTransition());
  s = await ev(() => ({ to: HM.S.transition.to, species: HM.S.species, isVamp: HM.isVamp(), vt: HM.treeOpen('vampire'), wolf: HM.pl.wolf }));
  ok('hybrid transition: to hybrid, still a werewolf, not yet a vampire', s.to === 'hybrid' && s.species === 'werewolf' && !s.isVamp && !s.vt && !s.wolf, s);
  s = await ev(() => { HM.addCons('bloodbag', 1, true); const used = HM.useCons('bloodbag'); return { used, tr: !!HM.S.transition, species: HM.S.species, dq: !!HM.dq }; });
  ok('hybrid transition: ordinary human blood does not complete it', s.tr && s.species === 'werewolf' && !s.dq, s);
  s = await ev(() => { const n = HM.spawnNpc({ n: 'Night owl', x: HM.pl.x + 1.2, z: HM.pl.z, townie: 1, owl: 1, verv: 0 }); const o = HM.actorInteract(n, 1.2); n.dead = true; n.rig.g.visible = false; return { label: o && o.label }; });
  ok('hybrid transition: no offer to feed on a townsperson', !/Feed/.test(s.label || ''), s);
  await ev(() => { window.SP0 = HM.S.sp; HM.addCons('dblood', 1, true); HM.useCons('dblood'); }); ok('hybrid transition: the doppelgänger\'s blood asks first', await h.waitDlg(5000)); await h.choose('Drink it.');
  s = await ev(() => ({ species: HM.S.species, tr: HM.S.transition, hyb: HM.isHybrid(), vamp: HM.isVamp(), wolfK: HM.isWolf(), lt: HM.treeOpen('wolf'), vt: HM.treeOpen('vampire'), safe: HM.daylightSafe(), sire: HM.S.sire, bound: HM.sireBound(), might: HM.S.skills.l_might || 0, kind: HM.kind, left: HM.S.cons.dblood || 0 }));
  ok('hybrid: the doppelgänger\'s blood completes it (species hybrid, both trees open, wolf skills kept)', s.species === 'hybrid' && s.tr === null && s.hyb && s.vamp && s.wolfK && s.lt && s.vt && s.might === 1 && s.left === 0, s);
  ok('hybrid: sired to Corvin', s.sire === 'corvin' && s.bound === true, s);
  await h.adv(); await h.unpaused(); await h.square(); await ev(() => { HM.S.day = 12; HM.S.clock = 12; HM.pl.hp = HM.P.maxHp; }); await h.run(0.4);
  s = await ev(() => ({ burning: HM.pl.burning, safe: HM.daylightSafe(), indoors: HM.RT.indoors, ring: HM.hasUniq('daylight'), full: HM.fullMoon() }));
  ok('hybrid: walks in the noon sun with no ring', !s.burning && s.safe && !s.indoors && !s.ring, s);
  s = await ev(() => { HM.pl.shiftT = 0; HM.pl.shiftCd = 0; HM.pl.hp = HM.P.maxHp; const r = { why: HM.shiftAllowed(), n0: HM.S.flags.shifts || 0 }; r.t1 = HM.toggleShift(); r.wolf = HM.pl.wolf; r.n1 = HM.S.flags.shifts || 0; r.cost = (HM.P.maxHp - HM.pl.hp) / HM.P.maxHp; r.venomWolf = HM.P.venom; HM.pl.shiftT = 0; HM.pl.shiftCd = 0; r.t2 = HM.toggleShift(); r.back = !HM.pl.wolf; r.n2 = HM.S.flags.shifts || 0; r.venomHuman = HM.P.venom; HM.pl.shiftT = 0; HM.pl.shiftCd = 0; return r; });
  ok('hybrid: shifts at will, by day, off the full moon, and back again', s.why === '' && s.t1 === true && s.wolf === true && s.t2 === true && s.back === true && !s.full, s);
  ok('hybrid: each willing change into the wolf hurts and counts toward the sire bond', s.n1 === s.n0 + 1 && s.n2 === s.n1 && s.cost > 0.05, s);
  ok('hybrid: the bite is venom in either shape', s.venomWolf > 0 && s.venomHuman > 0, s);
  s = await ev(() => { const r = { env: HM.envenom(null) }; HM.addCons('vervain', 1, true); HM.addCons('wolfsbane', 1, true); HM.useCons('vervain'); HM.useCons('wolfsbane'); r.verv = HM.pl.fx.verv > 0; r.bane = HM.pl.fx.wolfsbane > 0; r.coat = HM.pl.buff.coatV > 0 || HM.pl.buff.coatW > 0; HM.pl.fx.verv = HM.pl.fx.wolfsbane = 0; HM.recalc(); return r; });
  ok('hybrid: immune to werewolf venom; vervain and wolfsbane both burn', s.env === false && s.verv && s.bane && !s.coat, s);
  s = await ev(() => { HM.S.clock = 22; HM.pl.inv = 1e6; const c = HM.spawnEnemy('corvin', HM.pl.x + 2, HM.pl.z, 10); c.fx.stun = 600; const r = { d0: HM.hit(HM.pl, c, { dmg: 500, mat: 'steel', melee: 1 }), full: c.hp === c.maxHp }; HM.S.flags.shifts = 100; r.bound = HM.sireBound(); r.d1 = HM.hit(HM.pl, c, { dmg: 500, mat: 'steel', melee: 1 }); c.dead = true; c.gone = true; return r; });
  ok('hybrid: cannot raise a hand to Corvin while sired; a hundred willing changes break the bond', s.d0 === 0 && s.full && s.bound === false && s.d1 > 0, s);
  await h.close();
}

(async () => {
  const b = await launch();
  await sections(b, [['human', human], ['lapse', lapse], ['witch', witch], ['siphoner', siphoner], ['wolf', wolf]], process.argv[3]);
  await finish(b);
})();

/* Hollow Moon — the main systems end to end: creation, quests, combat, menus, vendors, the Tomb, turning by way of the transition, the sun, death, feeding, saving,
   and a save from before the canon rework (v2) being brought forward.  node tools/tests/systems.js <dir for screenshots> [section,section] */
const { launch, open, ok, note, finish, sections } = require('./_lib');
const SP = process.argv[2] || '.';

async function play(b) {
  console.log('\n# a human, from the bus stop to the Tomb to the grave and back');
  const h = await open(b, { origin: 'human', tag: 'systems', dir: SP }), { ev, p } = h;
  let s = await ev(() => ({ origin: HM.S.origin, species: HM.S.species, weapon: HM.S.eq.weapon && HM.S.eq.weapon.base, quests: Object.keys(HM.S.quests), cons: HM.S.cons, diary: HM.S.diary.length, hud: !document.getElementById('hud').hidden, title: document.getElementById('title').hidden }));
  ok('creation: New game starts a human Fell with the starting kit and the first quest', s.origin === 'human' && s.species === 'human' && s.weapon === 'bat' && s.quests.includes('q_arrive') && s.cons.draught === 2 && s.hud && s.title, s);

  /* --- quest: Marnie, Odette, Marnie --- */
  for (const id of ['marnie', 'odette', 'marnie']) { ok('quest: ' + id + ' can be talked to', await h.talk(id)); await h.adv(); }
  await h.unpaused();
  s = await ev(() => ({ done: Object.keys(HM.S.done), quests: Object.keys(HM.S.quests), gold: HM.S.gold, xp: Math.round(HM.S.xp), burger: HM.S.cons.burger }));
  ok('quest: New in Town completes, pays out, and starts Things That Go Bump', s.done.includes('q_arrive') && s.quests.includes('q_bump') && s.gold === 45 && s.xp > 0, s);

  /* --- combat with the real keys: a timber wolf in the square --- */
  await h.square(); await ev(() => { HM.S.clock = 12; window.K0 = HM.S.stats.kills; window.W = HM.spawnEnemy('wolf', HM.pl.x + 2, HM.pl.z + 1, 1); HM.pl.inv = 1e6; });
  for (let i = 0; i < 60; i++) { if (await ev(() => W.dead)) break; await ev(() => { HM.pl.rot = Math.atan2(W.x - HM.pl.x, W.z - HM.pl.z); if (Math.hypot(W.x - HM.pl.x, W.z - HM.pl.z) > 2.4) { W.x = HM.pl.x + 1.6; W.z = HM.pl.z; } }); await p.keyboard.press('j'); await p.waitForTimeout(250); }
  s = await ev(() => ({ dead: W.dead, kills: HM.S.stats.kills - K0, xp: Math.round(HM.S.xp), combo: HM.pl.combo }));
  ok('combat: J swings the bat and a timber wolf dies of it', s.dead && s.kills === 1, s);

  /* --- an enemy attacks: a newborn vampire after dark --- */
  await ev(() => { HM.S.clock = 22; HM.pl.inv = 0; HM.pl.hp = HM.P.maxHp; window.F = HM.spawnEnemy('feral', HM.pl.x + 2.2, HM.pl.z, 1, { awake: 1 }); });
  const hurt = await h.until(() => HM.pl.hp < HM.P.maxHp - 1 || HM.pl.fx.stun > 0, null, 45000);
  s = await ev(() => ({ php: Math.round(HM.pl.hp), max: Math.round(HM.P.maxHp), aggro: F.ai.aggro, combat: HM.RT.combatT > 0 }));
  ok('combat: a newborn vampire notices the player and hurts them', hurt && s.aggro && s.combat, s);
  await ev(() => { HM.pl.inv = 1e6; HM.pl.fx = {}; HM.pl.pose = null; F.fx.stun = 600; if (F.ai.cur) { F.ai.cur = null; } }); await h.idle();

  /* --- dodge, heavy, ranged, block and parry --- */
  s = await ev(() => { const st = HM.pl.sta; HM.pl.dodgeCd = 0; HM.press(' '); return { type: HM.pl.act && HM.pl.act.type, spent: st - HM.pl.sta }; });
  ok('moves: Space dodges and costs stamina', s.type === 'dodge' && s.spent > 0, s);
  await h.idle(); await ev(() => { HM.RT.dlgT = 0; HM.pl.sta = HM.P.maxSta; }); s = await ev(() => { HM.press('k'); return { heavy: HM.pl.act && HM.pl.act.heavy }; });
  ok('moves: K is a heavy blow (overhead, for a bat)', s.heavy === 'over', s);
  await h.idle(); s = await ev(() => { HM.addItem(HM.genItem(3, { base: 'xbow', rar: 2 }), true); HM.S.eq.ranged = HM.S.inv.pop(); HM.recalc(); HM.pl.rangedCd = 0; HM.press('f'); return { type: HM.pl.act && HM.pl.act.type, cd: HM.pl.rangedCd > 0 }; });
  ok('moves: F fires the crossbow', s.type === 'shoot' && s.cd, s);
  await h.idle(); await ev(() => { HM.K.shift = true; }); await h.until(() => HM.pl.block === true, null, 10000);
  s = await ev(() => { HM.pl.inv = 0; HM.pl.hp = HM.P.maxHp; HM.pl.rot = Math.atan2(F.x - HM.pl.x, F.z - HM.pl.z); HM.pl.blockT = 1; const d1 = HM.hit(F, HM.pl, { dmg: 40 }); HM.pl.blockT = 0.05; const d2 = HM.hit(F, HM.pl, { dmg: 40 }); const r = { blocked: d1, parried: d2, riposte: HM.pl.buff.riposte > 0 }; HM.K.shift = false; HM.pl.inv = 1e6; return r; });
  ok('moves: a block takes most of a blow, and a block at the last instant is a parry', s.blocked > 0 && s.blocked < 12 && s.parried === 0 && s.riposte, s);

  /* --- a steel-armed player needs the finishing move; wood does it in one --- */
  s = await ev(() => { F.fx.stun = 600; HM.hit(HM.pl, F, { dmg: 1e9, mat: 'steel', melee: 1 }); const r = { downed: F.downed, dead: F.dead }; HM.hit(HM.pl, F, { dmg: 5, mat: 'wood', melee: 1 }); r.staked = F.dead; return r; });
  ok('rules: steel only downs a vampire; wood into a downed one ends it', s.downed && !s.dead && s.staked, s);
  await h.clear();

  /* --- levelling --- */
  s = await ev(() => { HM.gainXp(5000); return { lvl: HM.S.lvl, ap: HM.S.ap, sp: HM.S.sp, maxHp: Math.round(HM.P.maxHp), power: HM.P.power }; });
  ok('levelling: experience gives levels, three attribute points and one skill point each', s.lvl > 1 && s.ap === 3 * (s.lvl - 1) && s.sp === s.lvl - 1 && s.maxHp > 100, s);

  /* --- menus --- */
  await h.unpaused(); await p.keyboard.press('Tab'); await h.until(() => HM.RT.menu === 'inv', null, 5000);
  s = await ev(() => ({ menu: HM.RT.menu, paused: !!HM.dq || !!HM.RT.menu, items: document.querySelectorAll('#mbody .item').length, tabs: [...document.querySelectorAll('#mtabs [data-tab]')].map(t => t.dataset.tab) }));
  ok('menu: Tab opens the pack; the tabs include the Codex', s.menu === 'inv' && s.items > 0 && s.tabs.join() === 'char,inv,skills,journal,codex,map,system', s);
  for (const t of ['char', 'skills', 'journal', 'codex', 'map', 'system', 'inv']) await ev(t => document.querySelector(`[data-tab="${t}"]`).click(), t);
  s = await ev(() => { document.querySelector('[data-tab="skills"]').click(); const shut = [...document.querySelectorAll('#mbody section.shut h2')].map(x => x.textContent.split(' ')[0]), why = [...document.querySelectorAll('#mbody section.shut .why')].map(x => x.textContent);
    document.querySelector('[data-learn="h_weapon"]').click(); for (let i = 0; i < 3; i++) document.querySelector('[data-learn="h_cond"]').click(); document.querySelector('[data-learn="h_gren"]').click(); const five = document.querySelector('[data-learn="h_five"]').disabled, vp = document.querySelector('[data-learn="v_pred"]').disabled;
    document.querySelector('[data-tab="char"]').click(); for (let i = 0; i < 3; i++) document.querySelector('[data-attr="mig"]').click(); const rows = [...document.querySelectorAll('#mbody .stat b')].map(x => x.textContent);
    return { shut, why: why.every(w => w.length > 10), skills: HM.S.skills, bar: HM.S.bar, attr: HM.S.attr.mig, five, vp, rows }; });
  ok('menu: the Skills tab shows the Hunter tree open and the other four closed, each with its reason', s.shut.join() === 'Witch,Werewolf,Vampire,Original' && s.why, s);
  ok('menu: skills are learned with the + buttons and an active one lands on the bar; closed trees cannot be learned', s.skills.h_weapon === 1 && s.skills.h_cond === 3 && s.skills.h_gren === 1 && s.bar[0] === 'h_gren' && s.five && s.vp, s);
  ok('menu: the Character tab spends attribute points and says what the player is', s.attr === 3 && s.rows.some(r => /Bloodline · Human/.test(r)) && s.rows.some(r => /Species · Human/.test(r)) && s.rows.some(r => /Compulsion/.test(r)), s.rows);
  await ev(() => { HM.codex('vervain'); HM.codex('vampire'); document.querySelector('[data-tab="inv"]').click(); }); s = await ev(() => { const o = { dot: /•/.test(document.querySelector('[data-tab="codex"]').textContent) }; document.querySelector('[data-tab="codex"]').click(); o.entries = [...document.querySelectorAll('#mbody .entry b')].map(x => x.textContent); o.known = Object.keys(HM.S.codex).length; return o; });
  ok('menu: the Codex marks what is new and lists what has been learned, newest first', s.dot && s.entries.length === 2 && s.known === 2 && /vampire/i.test(s.entries[0]), s);
  await h.shot('sys_menu.png'); await p.keyboard.press('Tab'); await h.unpaused();

  /* --- an ability from the bar: the vervain grenade --- */
  await ev(() => { HM.S.clock = 22; window.F2 = HM.spawnEnemy('feral', HM.pl.x + 3, HM.pl.z, 2, { awake: 1 }); F2.fx.stun = 600; window.R2 = HM.spawnEnemy('robber', HM.pl.x + 3, HM.pl.z + 1.5, 2); R2.fx.stun = 600; HM.pl.rot = Math.PI / 2; HM.pl.sta = HM.P.maxSta; HM.RT.dlgT = 0; HM.press('1'); });
  const boom = await h.until(() => F2.hp < F2.maxHp || F2.dead || F2.downed, null, 30000);
  s = await ev(() => ({ f: +(F2.hp / F2.maxHp).toFixed(2), r: +(R2.hp / R2.maxHp).toFixed(2), verv: F2.fx.verv > 0, rverv: R2.fx.verv > 0, cd: HM.pl.cds.h_gren > 0 }));
  ok('ability: 1 throws the vervain grenade; it poisons the vampire and only rattles the person', boom && s.cd && s.verv && !s.rverv && (1 - s.f) > (1 - s.r) * 2, s);
  await h.clear();

  /* --- a vendor --- */
  await ev(() => { HM.S.clock = 12; }); ok('vendor: Captain Hale can be talked to', await h.talk('hale')); ok('vendor: he offers to trade', await h.choose('Trade.'));
  s = await ev(() => { const r = { menu: HM.RT.menu, forsale: document.querySelectorAll('#mbody section:first-child .item').length, inv0: HM.S.inv.length }; HM.S.gold = 99999; document.querySelector('#mbody section:first-child .item[data-item]').click(); const bb = document.querySelector('[data-act="buy"]'); if (bb) bb.click(); r.inv1 = HM.S.inv.length; r.spent = 99999 - HM.S.gold; return r; });
  ok('vendor: the armoury has stock and sells it', s.menu === 'vendor' && s.forsale > 3 && s.inv1 === s.inv0 + 1 && s.spent > 0, s);
  await p.keyboard.press('Escape'); await h.unpaused();

  /* --- the Tomb --- */
  await ev(() => { HM.pl.inv = 1e6; HM.enterArea('tomb', { depth: 1 }); }); await h.run(0.2);
  s = await ev(() => { const en = HM.actors.filter(a => a.kind === 'enemy'); return { area: HM.area.id, n: en.length, types: [...new Set(en.map(a => a.type))], dormant: en.filter(a => a.dormant).length, need: HM.area.need, lvl: HM.area.lvl, chests: (HM.area.chests || []).length }; });
  ok('tomb: floor 1 is the tomb of 1864: only tomb vampires, most of them lying desiccated', s.area === 'tomb' && s.n > 0 && s.types.join() === 'tombvamp' && s.dormant > 0 && s.need > 0, s);
  await h.shot('sys_tomb.png');
  await ev(() => { for (const a of HM.actors) if (a.kind === 'enemy') HM.hit(HM.pl, a, { dmg: 1e9, mat: 'wood' }); }); await h.run(0.1);
  s = await ev(() => ({ cleared: HM.area.cleared, killed: HM.area.killed, need: HM.area.need }));
  ok('tomb: staking enough of them breaks the seal', s.cleared === true && s.killed >= s.need, s);
  await ev(() => { HM.pl.x = HM.area.exit.x; HM.pl.z = HM.area.exit.z + 2; HM.RT.dlgT = 0; }); await h.run(0.1); await ev(() => { const it = HM.findInteract(); window.LBL = it && it.label; if (it) it.act(); });
  ok('tomb: the stairs lead down', await h.until(() => HM.area.depth === 2 && !HM.RT.blk, null, 20000), await ev(() => ({ lbl: LBL, depth: HM.area.depth })));
  s = await ev(() => ({ sig: HM.S.sigils, deepest: HM.S.deepest, floors: HM.S.stats.floors })); ok('tomb: sigils for the descent', s.sig === 2 && s.deepest === 1 && s.floors === 1, s);
  await ev(() => { HM.enterArea('tomb', { depth: 5 }); }); await h.run(0.2);
  s = await ev(() => { window.BO = HM.actors.find(a => a.def.boss); HM.pl.x = BO.x; HM.pl.z = BO.z + 7; return { boss: HM.area.boss, who: BO && BO.type, snap: !!localStorage.getItem('hollowmoon.preboss') }; });
  ok('tomb: the Warden keeps the fifth floor', s.boss && s.who === 'warden' && s.snap, s);
  ok('tomb: he notices, and the boss bar comes up', await h.until(() => !!HM.RT.boss && !document.getElementById('bossbar').hidden, null, 40000));
  await h.shot('sys_boss.png');
  s = await ev(() => { BO.fx.stun = 600; HM.hit(HM.pl, BO, { dmg: 1e12, mat: 'steel', melee: 1 }); const r = { downed: BO.downed, dead: BO.dead, cleared: HM.area.cleared, bar: document.getElementById('bossbar').hidden }; HM.hit(HM.pl, BO, { dmg: 5, mat: 'wood', melee: 1 }); r.dead2 = BO.dead; r.cleared2 = HM.area.cleared; r.slain = !!(HM.S.flags.slain && HM.S.flags.slain.warden); r.drops = HM.drops.length; r.relic = HM.drops.some(d => d.kind === 'item' && d.v.uniq === 'wardblade'); return r; });
  ok('tomb: a keeper who is only downed does not break the seal', s.downed && !s.dead && !s.cleared && s.bar, s);
  ok('tomb: finished, he is slain for good, the seal breaks, and his blade drops', s.dead2 && s.cleared2 && s.slain && s.relic, s);
  await ev(() => { HM.enterArea('tomb', { depth: 5 }); }); s = await ev(() => ({ who: (HM.actors.find(a => a.def.boss) || {}).type, awake: HM.S.flags.corvinAwake || 0 }));
  ok('tomb: a slain keeper does not come back; another takes the floor', !!s.who && s.who !== 'warden', s);

  /* --- up, and into the grave: vampire blood from the pack, a death, a blood bag from the pack --- */
  await ev(() => { HM.enterArea('world', { x: 10, z: 5 }); HM.S.clock = 22; HM.addCons('vblood', 1, true); HM.addCons('bloodbag', 1, true); }); await h.unpaused();
  await p.keyboard.press('Tab'); await h.until(() => !!HM.RT.menu, null, 5000); await ev(() => { document.querySelector('[data-tab="inv"]').click(); document.querySelector('[data-cons="vblood"]').click(); }); await p.keyboard.press('Tab');
  s = await ev(() => ({ flag: HM.S.flags.vblood, status: HM.status })); ok('turning: vampire blood drunk from the pack is in the system, and the HUD says so', s.flag === 1 && s.status.some(x => /Vampire blood/.test(x)), s);
  await h.die(); ok('turning: death with it starts the transition', await h.awaitTransition());
  s = await ev(() => ({ line: document.getElementById('trans').textContent, hidden: document.getElementById('trans').hidden, kind: HM.kind })); await h.run(0.3);
  s = await ev(() => ({ line: document.getElementById('trans').textContent, hidden: document.getElementById('trans').hidden, kind: HM.kind }));
  ok('turning: the HUD carries the countdown', !s.hidden && /In transition: drink human blood within \d+ hours/.test(s.line) && s.kind === 'human in transition', s);
  await h.unpaused(); await p.keyboard.press('Tab'); await h.until(() => !!HM.RT.menu, null, 5000); await ev(() => { document.querySelector('[data-cons="bloodbag"]').click(); });
  ok('turning: the blood bag closes the pack and asks', await h.until(() => !HM.RT.menu && !!HM.dq, null, 5000)); await h.choose('Drink it.');
  s = await ev(() => ({ species: HM.S.species, quests: Object.keys(HM.S.quests), blood: Math.round(HM.pl.blood), kind: HM.kind })); await h.adv(); await h.unpaused();
  ok('turning: a vampire, with the Daylight quest started', s.species === 'vampire' && s.quests.includes('q_daylight') && s.blood >= 40, s);

  /* --- the sun, and dying of it --- */
  await h.square(); await ev(() => { HM.S.clock = 12; HM.pl.inv = 0; HM.pl.hp = HM.P.maxHp * 0.05; HM.S.gold = 1000; });
  ok('sun: a vampire without a ring burns to death at noon', await h.until(() => HM.pl.dead && !document.getElementById('death').hidden, null, 60000), await ev(() => ({ burning: HM.pl.burning, hp: HM.pl.hp, dead: HM.pl.dead })));
  s = await ev(() => ({ txt: document.getElementById('deathtxt').textContent, sub: document.getElementById('deathsub').textContent })); ok('death: the screen says it was the sun, and what it cost', /sun/i.test(s.txt) && /100 gold/.test(s.sub), s);
  await ev(() => document.getElementById('respawn').click()); await h.until(() => !HM.pl.dead, null, 10000);
  s = await ev(() => ({ dead: HM.pl.dead, hp: Math.round(HM.pl.hp), max: Math.round(HM.P.maxHp), night: HM.isNight(), deaths: HM.S.stats.deaths, gold: HM.S.gold, burning: HM.pl.burning }));
  ok('death: getting up is at home, whole, and after dark for a vampire with no ring', !s.dead && s.hp === s.max && s.night && s.gold === 900, s);

  /* --- feeding --- */
  await h.unpaused(); await h.square(); await ev(() => { HM.S.clock = 22; HM.pl.blood = 20; window.N = HM.spawnNpc({ n: 'Night owl', x: HM.pl.x + 1.2, z: HM.pl.z, townie: 1, owl: 1, verv: 0 }); window.B0 = HM.pl.blood; window.F0 = HM.S.stats.feeds; }); await h.run(0.3);
  s = await ev(() => ({ prompt: (HM.findInteract() || {}).label, vis: N.rig.g.visible })); ok('feeding: E on a townsperson offers to feed', /^Feed/.test(s.prompt || ''), s);
  await ev(() => { HM.RT.dlgT = 0; }); await p.keyboard.down('e'); const fed = await h.until(() => N.blood < 75, null, 40000); s = await ev(() => ({ feeding: !!HM.pl.feed, bar: !document.getElementById('feed').hidden })); await p.keyboard.up('e'); await h.until(() => !HM.pl.feed, null, 10000);
  ok('feeding: holding E drinks, with the victim\'s blood shown', fed && s.feeding && s.bar, s);
  s = await ev(() => ({ blood: Math.round(HM.pl.blood - B0), nblood: Math.round(N.blood), ndead: N.dead, feeds: HM.S.stats.feeds - F0, dazed: N.dazed > 0 }));
  ok('feeding: letting go in time leaves them alive and compelled to forget', s.blood > 5 && !s.ndead && s.feeds === 1 && s.dazed, s);
  s = await ev(() => { const n = HM.spawnNpc({ n: 'Coffee drinker', x: HM.pl.x - 1.2, z: HM.pl.z, townie: 1, owl: 1, verv: 1 }); HM.pl.hp = HM.P.maxHp; const it = HM.actorInteract(n, 1.2); it.act(); return { burned: HM.pl.fx.verv > 0, hp: HM.pl.hp < HM.P.maxHp, feeding: !!HM.pl.feed, remembers: n.fearDay === HM.S.day, codex: !!HM.S.codex.vervain }; });
  ok('feeding: a townsperson on vervain burns the biter, gives nothing, and remembers', s.burned && s.hp && !s.feeding && s.remembers && s.codex, s);

  /* --- saving and loading --- */
  await ev(() => { HM.pl.fx = {}; HM.save(true); }); s = await ev(() => ({ len: (localStorage.getItem('hollowmoon.save') || '').length, lvl: HM.S.lvl, skills: JSON.stringify(HM.S.skills), inv: HM.S.inv.length }));
  ok('save: written to this browser', s.len > 500, s); const before = s;
  await p.reload(); await p.waitForFunction(() => window.HM && window.HM.pl && !document.getElementById('begin').disabled, null, { timeout: 120000 });
  s = await ev(() => ({ hidden: document.getElementById('continue').hidden, text: document.getElementById('continue').textContent })); ok('save: the title offers to continue, and says what the character is', !s.hidden && new RegExp('level ' + before.lvl + ' vampire').test(s.text), s);
  await ev(() => document.getElementById('continue').click()); await h.until(() => HM.RT.started, null, 20000);
  s = await ev(() => ({ lvl: HM.S.lvl, species: HM.S.species, origin: HM.S.origin, inv: HM.S.inv.length, skills: JSON.stringify(HM.S.skills), sire: HM.S.sire, v: HM.S.v, slain: !!(HM.S.flags.slain && HM.S.flags.slain.warden) }));
  ok('save: Continue restores the character as it was', s.lvl === before.lvl && s.species === 'vampire' && s.origin === 'human' && s.sire === 'corvin' && s.skills === before.skills && s.inv === before.inv && s.v === 3 && s.slain, s);
  await h.close();
}

/* a save written by the game as it was before the rework: no bloodlines, silver weapons, a compass, witches who bought their magic back */
async function oldSave(b) {
  console.log('\n# a version 2 save is brought forward');
  const v2 = { v: 2, seed: 7, species: 'vampire', heretic: true, lvl: 12, xp: 10, ap: 0, sp: 1, attr: { mig: 4, fin: 0, vig: 2, wil: 0 }, skills: { h_weapon: 2, w_mend: 2, w_temp: 1, w_incend: 1, v_night: 3, v_pred: 2, v_frenzy: 1 }, asc: { pow: 1 }, sigils: 3, hp: 200, foc: 50, blood: 70, humanity: 80, exposure: 0, gold: 300,
    inv: [{ id: 5, base: 'silvers', slot: 'weapon', rar: 2, lvl: 10, up: 1, aff: [['dmg', 5]], dmg: 40, name: 'Savage Silver Sabre' }, { id: 6, base: 'amulet', slot: 'amulet', rar: 5, lvl: 9, up: 0, uniq: 'compass', name: "Founder's Compass", aff: [['mf', 25]] }, { id: 7, base: 'amulet', slot: 'amulet', rar: 5, lvl: 9, up: 0, uniq: 'moonstone', name: 'Moonstone Pendant', aff: [] }],
    eq: { weapon: { id: 4, base: 'silverd', slot: 'weapon', rar: 1, lvl: 10, up: 0, aff: [], dmg: 30, name: 'Silver Dagger' }, ranged: null, armor: null, ring: null, amulet: null }, cons: { draught: 3, elderblood: 2, tonic: 1 }, bar: ['w_mend', 'v_frenzy', 'w_temp', null],
    quests: {}, done: { q_arrive: 1 }, bounties: [], bountyDay: 0, flags: { witch: 1, turned: 2 }, diary: [], day: 5, clock: 22, weather: 'clear', area: 'world', pos: { x: 10, z: 5 }, disc: { town: 1 }, deepest: 6, runs: 3, kills: {}, stats: { kills: 9, feeds: 2, murders: 0, deaths: 1, floors: 6, played: 100 }, opened: {}, gath: {}, look: { skin: 0xe6cdb8, hair: 0x15100e, coat: 0x231a22, long: false }, vendors: {}, ts: 5, uid: 20 };
  const h = await open(b, { tag: 'v2save', begin: false, storage: { 'hollowmoon.save': JSON.stringify(v2) } }), { ev } = h;
  let s = await ev(() => ({ hidden: document.getElementById('continue').hidden, text: document.getElementById('continue').textContent })); ok('v2 save: offered on the title screen', !s.hidden && /level 12/.test(s.text), s);
  await ev(() => document.getElementById('continue').click()); await h.until(() => HM.RT.started, null, 20000); await h.unpaused();
  s = await ev(() => ({ v: HM.S.v, origin: HM.S.origin, species: HM.S.species, sire: HM.S.sire, heretic: HM.S.heretic, skills: HM.S.skills, sp: HM.S.sp, bar: HM.S.bar, cons: HM.S.cons, weapon: HM.S.eq.weapon && HM.S.eq.weapon.base, wname: HM.S.eq.weapon && HM.S.eq.weapon.name, inv: HM.S.inv.map(i => i.uniq || i.base), codex: typeof HM.S.codex, magic: HM.canMagic(), mercy: HM.S.flags.mercy }));
  ok('v2 save: becomes version 3, with a bloodline and a sire', s.v === 3 && s.origin === 'witch' && s.species === 'vampire' && s.sire === 'corvin' && s.codex === 'object' && s.mercy === 1, s);
  ok('v2 save: a witch who turned no longer has her magic; those points come back', !s.heretic && !s.magic && !Object.keys(s.skills).some(k => k[0] === 'w') && s.sp === 1 + 4, s);
  ok('v2 save: Nightstalker became Well Fed; the bar keeps only what still exists', s.skills.v_fed === 3 && !('v_night' in s.skills) && s.bar.join() === ',v_frenzy,,', s);
  ok('v2 save: elder blood became the Blood of the First', s.cons.hblood === 2 && !('elderblood' in s.cons), s);
  ok('v2 save: no silver weapons, a pocket watch for the compass, a moonlight ring for the moonstone', s.weapon === 'stiletto' && !/silver/i.test(s.wname) && s.inv.includes('cavalry') && s.inv.includes('watch') && s.inv.includes('moonring'), s);
  await h.close();
}

(async () => { const b = await launch(); await sections(b, [['play', play], ['v2', oldSave]], process.argv[3]); await finish(b); })();

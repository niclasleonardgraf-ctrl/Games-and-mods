const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const SP = process.argv[2];
  const p = await b.newPage({ viewport: { width: 320, height: 200 } });
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push('E: ' + m.text().slice(0, 300)); }); p.on('pageerror', e => errs.push('PAGEERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')));
  await p.goto('http://localhost:8765/index.html'); await p.waitForFunction(() => window.HM && window.HM.pl && !document.getElementById('begin').disabled, null, { timeout: 90000 });
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } document.getElementById('begin').click(); }); await p.waitForTimeout(300);
  const adv = async () => { for (let i = 0; i < 14; i++) { const o = await p.evaluate(() => !document.getElementById('dlg').hidden && !document.querySelector('#dch .choice')); if (!o) break; await p.keyboard.press('e'); await p.waitForTimeout(90); } };
  const ev = (f, a) => p.evaluate(f, a), log = async (l, f, a) => console.log(l, JSON.stringify(await p.evaluate(f, a)));
  const wait = ms => p.waitForTimeout(ms);
  await adv();
  // --- quest: talk to marnie, odette, marnie
  const talk = async id => { await ev(id => { const n = HM.actors.find(a => a.npc && a.npc.id === id); HM.pl.x = n.x + 1.5; HM.pl.z = n.z + 1.5; }, id); await wait(250); await p.keyboard.press('e'); await wait(150); await adv(); };
  await talk('marnie'); await talk('odette'); await talk('marnie');
  await log('after arrive', () => ({ done: Object.keys(HM.S.done), quests: HM.S.quests, gold: HM.S.gold, xp: Math.round(HM.S.xp), lvl: HM.S.lvl }));
  // --- combat: spawn a wolf next to player in the open and attack
  await ev(() => { HM.pl.x = 0; HM.pl.z = 150; window.W = HM.spawnEnemy('wolf', 2, 152, 1); });
  await wait(300); await p.mouse.move(165, 100); 
  for (let i = 0; i < 14; i++) { await ev(() => { if (!W.dead) { HM.pl.rot = Math.atan2(W.x - HM.pl.x, W.z - HM.pl.z); } }); await p.keyboard.press('j'); await wait(260); }
  await log('wolf fight', () => ({ dead: W.dead, whp: Math.round(W.hp), php: Math.round(HM.pl.hp), xp: Math.round(HM.S.xp), drops: HM.drops.length, kills: HM.S.stats.kills }));
  // enemy attacks player: spawn feral, wait
  await ev(() => { window.F = HM.spawnEnemy('feral', HM.pl.x + 2, HM.pl.z, 1); }); await wait(4000);
  await log('feral attacks', () => ({ php: Math.round(HM.pl.hp), aggro: F.ai.aggro, cur: F.ai.cur && F.ai.cur.name, fhp: Math.round(F.hp) }));
  // dodge, heavy, shoot, block
  await p.keyboard.press(' '); await wait(500); await p.keyboard.press('k'); await wait(900);
  await ev(() => { HM.addItem(HM.genItem(3, { base: 'xbow', rar: 2 })); HM.S.eq.ranged = HM.S.inv.pop(); HM.recalc(); }); await p.keyboard.press('f'); await wait(600);
  await log('after moves', () => ({ php: Math.round(HM.pl.hp), sta: Math.round(HM.pl.sta), fdead: F.dead, fhp: Math.round(F.hp), act: HM.pl.act && HM.pl.act.type }));
  await ev(() => { for (const a of HM.actors) if (a.kind === 'enemy') HM.hit(HM.pl, a, { dmg: 9999, mat: 'wood' }); HM.gainXp(5000); }); await wait(400);
  await log('levelled', () => ({ lvl: HM.S.lvl, ap: HM.S.ap, sp: HM.S.sp, maxHp: Math.round(HM.P.maxHp), power: HM.P.power }));
  // --- menus
  await p.keyboard.press('Tab'); await wait(300); await log('menu open', () => ({ menu: HM.RT.menu, paused: HM.RT.paused, items: document.querySelectorAll('#mbody .item').length }));
  for (const t of ['char', 'skills', 'journal', 'map', 'system', 'inv']) { await ev(t => document.querySelector(`[data-tab="${t}"]`).click(), t); await wait(120); }
  await ev(() => { document.querySelector('[data-tab="skills"]').click(); }); await wait(100);
  await ev(() => { document.querySelector('[data-learn="h_weapon"]').click(); }); await ev(() => { for (let i = 0; i < 3; i++) document.querySelector('[data-learn="h_cond"]').click(); }); await ev(() => { document.querySelector('[data-learn="h_gren"]').click(); });
  await ev(() => { document.querySelector('[data-tab="char"]').click(); }); await ev(() => { for (let i = 0; i < 3; i++) document.querySelector('[data-attr="mig"]').click(); });
  await log('skills', () => ({ skills: HM.S.skills, bar: HM.S.bar, sp: HM.S.sp, attr: HM.S.attr }));
  await ev(() => { document.querySelector('[data-tab="inv"]').click(); }); await wait(100);
  await ev(() => { const it = document.querySelector('#mbody .grid .item[data-item]'); it && it.click(); }); await wait(100);
  await p.screenshot({ path: SP + '/v2menu.png' });
  await p.keyboard.press('Tab'); await wait(200);
  // ability
  await ev(() => { window.F2 = HM.spawnEnemy('feral', HM.pl.x + 3, HM.pl.z, 2); }); await wait(200); await p.keyboard.press('1'); await wait(1200);
  await log('grenade', () => ({ f2hp: Math.round(F2.hp), max: Math.round(F2.maxHp), cd: HM.pl.cds.h_gren, stun: F2.fx.stun }));
  // --- vendor
  await talk('hale'); await wait(200); await log('hale dlg', () => ({ dlg: !document.getElementById('dlg').hidden, text: document.getElementById('dtext').textContent.slice(0, 40), ch: [...document.querySelectorAll('#dch .choice')].map(c => c.textContent) }));
  await ev(() => { const c = document.querySelector('#dch .choice'); c && c.click(); }); await wait(300);
  await log('vendor', () => ({ menu: HM.RT.menu, forsale: document.querySelectorAll('#mbody section:first-child .item').length }));
  await ev(() => { HM.S.gold = 99999; const it = document.querySelector('#mbody section:first-child .item[data-item]'); it.click(); }); await wait(100); await ev(() => { const bb = document.querySelector('[data-act="buy"]'); bb && bb.click(); }); await wait(100);
  await log('bought', () => ({ inv: HM.S.inv.length, gold: HM.S.gold })); await p.keyboard.press('Escape'); await wait(200);
  // --- tomb
  await ev(() => { HM.enterArea('tomb', { depth: 1 }); }); await wait(1500);
  await log('tomb1', () => ({ area: HM.area.id, enemies: HM.actors.filter(a => a.kind === 'enemy').length, need: HM.area.need, lvl: HM.area.lvl, boxes: HM.area.boxes.length, px: Math.round(HM.pl.x), pz: Math.round(HM.pl.z), chests: (HM.area.chests || []).length }));
  await p.screenshot({ path: SP + '/v2tomb.png' });
  await ev(() => { for (const a of HM.actors) if (a.kind === 'enemy') HM.hit(HM.pl, a, { dmg: 99999, mat: 'wood' }); }); await wait(600);
  await log('tomb cleared', () => ({ cleared: HM.area.cleared, killed: HM.area.killed, drops: HM.drops.length }));
  await ev(() => { HM.pl.x = HM.area.exit.x; HM.pl.z = HM.area.exit.z + 2; }); await wait(300); await p.keyboard.press('e'); await wait(2500);
  await log('floor2', () => ({ depth: HM.area.depth, sig: HM.S.sigils, deepest: HM.S.deepest }));
  await ev(() => { HM.enterArea('tomb', { depth: 5 }); }); await wait(1500);
  await log('boss floor', () => ({ boss: HM.area.boss, en: HM.actors.filter(a => a.kind === 'enemy').map(a => a.name + ' ' + Math.round(a.maxHp)), d: Math.round(Math.hypot(HM.actors[0].x - HM.pl.x, HM.actors[0].z - HM.pl.z)) }));
  await ev(() => { const bo = HM.actors.find(a => a.def.boss); HM.pl.x = bo.x; HM.pl.z = bo.z + 8; HM.pl.hp = 99999; }); await wait(6000);
  await log('boss fight 6s', () => ({ boss: !!HM.RT.boss, bar: !document.getElementById('bossbar').hidden, cur: HM.RT.boss && HM.RT.boss.ai.cur && HM.RT.boss.ai.cur.name, php: Math.round(HM.pl.hp) }));
  await p.screenshot({ path: SP + '/v2boss.png' });
  await ev(() => { const bo = HM.actors.find(a => a.def.boss); HM.hit(HM.pl, bo, { dmg: 9e9, mat: 'wood' }); }); await wait(800);
  await log('boss dead', () => ({ cleared: HM.area.cleared, drops: HM.drops.map(d => d.kind + ':' + (d.v.name || d.v)), flags: Object.keys(HM.S.flags) }));
  // --- leave, turn vampire
  await ev(() => { HM.enterArea('world', { x: 0, z: 150 }); HM.S.cons.vblood = 1; }); await wait(600);
  await p.keyboard.press('Tab'); await wait(200); await ev(() => { document.querySelector('[data-cons="vblood"]').click(); }); await p.keyboard.press('Tab'); await wait(200);
  await ev(() => { HM.pl.hp = 1; HM.hit(null, HM.pl, { dmg: 9999 }); }); await wait(9000);
  await log('turned', () => ({ species: HM.S.species, dead: HM.pl.dead, hp: Math.round(HM.pl.hp), blood: Math.round(HM.pl.blood), clock: HM.S.clock.toFixed(1), quests: Object.keys(HM.S.quests), blk: HM.RT.blk }));
  // sun
  await ev(() => { HM.S.clock = 12; }); await wait(2500); await log('sun', () => ({ burning: HM.pl.burning, hp: Math.round(HM.pl.hp), max: Math.round(HM.P.maxHp) }));
  await ev(() => { HM.S.clock = 23; HM.pl.hp = 5; HM.hit(null, HM.pl, { dmg: 9999 }); }); await wait(2500);
  await log('death', () => ({ dead: HM.pl.dead, shown: !document.getElementById('death').hidden })); await ev(() => document.getElementById('respawn').click()); await wait(800);
  await log('respawn', () => ({ dead: HM.pl.dead, hp: Math.round(HM.pl.hp), x: Math.round(HM.pl.x), clock: HM.S.clock.toFixed(1), day: HM.S.day }));
  // feed on a townsperson
  await ev(() => { HM.S.clock = 21; const n = HM.actors.find(a => a.npc && a.npc.owl); window.N = n; HM.pl.x = n.x + 1; HM.pl.z = n.z; }); await wait(2200);
  await log('npc vis', () => ({ vis: N.rig.g.visible, d: Math.hypot(N.x - HM.pl.x, N.z - HM.pl.z).toFixed(1), prompt: document.getElementById('prompt').textContent }));
  await ev(() => { HM.pl.x = N.x + 1; HM.pl.z = N.z; }); await wait(300); await p.keyboard.down('e'); await wait(1500); await p.keyboard.up('e'); await wait(300);
  await log('fed', () => ({ blood: Math.round(HM.pl.blood), nblood: Math.round(N.blood), feeds: HM.S.stats.feeds, exposure: Math.round(HM.S.exposure) }));
  // save / load
  await ev(() => { HM.save(true); }); await log('saved', () => ({ len: (localStorage.getItem('hollowmoon.save') || '').length }));
  await p.reload(); await p.waitForFunction(() => window.HM && window.HM.pl && !document.getElementById('begin').disabled, null, { timeout: 90000 }); await wait(500);
  await log('continue btn', () => ({ hidden: document.getElementById('continue').hidden, text: document.getElementById('continue').textContent })); await ev(() => document.getElementById('continue').click()); await wait(1500);
  await log('loaded', () => ({ lvl: HM.S.lvl, species: HM.S.species, inv: HM.S.inv.length, skills: HM.S.skills, started: HM.RT.started, x: Math.round(HM.pl.x) }));
  console.log('ERRS', errs.slice(0, 12).join('\n')); await b.close();
})();

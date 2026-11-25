const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 320, height: 200 } });
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push('E: ' + m.text().slice(0, 200)); }); p.on('pageerror', e => errs.push('PAGEERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')));
  await p.goto('http://localhost:8765/index.html'); await p.waitForFunction(() => window.HM && window.HM.pl && !document.getElementById('begin').disabled, null, { timeout: 90000 });
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } document.getElementById('begin').click(); }); await p.waitForTimeout(300); for (let i = 0; i < 2; i++) { await p.keyboard.press('e'); await p.waitForTimeout(200); }
  const ev = (f, a) => p.evaluate(f, a), wait = ms => p.waitForTimeout(ms), log = async (l, f, a) => console.log(l, JSON.stringify(await p.evaluate(f, a)));
  const adv = async () => { for (let i = 0; i < 14; i++) { const o = await ev(() => !document.getElementById('dlg').hidden && !document.querySelector('#dch .choice')); if (!o) break; await p.keyboard.press('e'); await wait(90); } };
  const choose = async i => { await ev(i => { const c = document.querySelectorAll('#dch .choice')[i]; c && c.click(); }, i); await wait(200); };
  const talk = async id => { await ev(id => { const n = HM.actors.find(a => a.npc && a.npc.id === id); HM.pl.x = n.x + 1.5; HM.pl.z = n.z + 1.5; }, id); await wait(600); await p.keyboard.press('e'); await wait(150); await adv(); };
  await ev(() => { HM.RT.touch = true; HM.S.clock = 12; HM.gainXp(60000); const S = HM.S; S.flags.witch = 1; S.sp = 99; S.ap = 50; for (const k of ['h_gren', 'h_heart', 'h_whirl', 'h_volley', 'w_incend', 'w_aneur', 'w_ward', 'w_mend', 'w_temp', 'h_parry', 'h_second', 'h_slayer', 'w_spirit', 'w_express', 'h_five']) S.skills[k] = 1; S.eq.weapon = HM.genItem(S.lvl, { base: 'sword', rar: 3 }); S.eq.ranged = HM.genItem(S.lvl, { base: 'revolver', rar: 2 }); HM.recalc(); HM.pl.hp = HM.P.maxHp; });
  const cast = async (id, n = 3) => { await ev(([id, n]) => { const pl = HM.pl; pl.x = 0; pl.z = 150; pl.hp = HM.P.maxHp; pl.sta = 999; pl.foc = 999; pl.blood = 999; pl.cds = {}; pl.act = null; for (const a of HM.actors.slice()) if (a.kind === 'enemy') { a.dead = true; a.gone = true; } window.EN = []; for (let i = 0; i < n; i++) EN.push(HM.spawnEnemy(['feral', 'robber', 'wolf'][i % 3], 3 + i, 151 + (i % 2) * 2, HM.S.lvl)); HM.S.bar[0] = id; HM.press('1'); }, [id, n]); await wait(1500);
    console.log(id, JSON.stringify(await ev(() => ({ hp: EN.map(e => Math.round(e.hp / e.maxHp * 100)), team: EN.map(e => e.team), stun: EN.map(e => +(e.fx.stun || 0).toFixed(1)), cd: Object.values(HM.pl.cds).map(v => +v.toFixed(1)), ward: Math.round(HM.pl.buff.ward), act: HM.pl.act && HM.pl.act.kind })))); };
  for (const id of ['h_gren', 'h_heart', 'h_whirl', 'h_volley', 'w_incend', 'w_aneur', 'w_ward', 'w_mend', 'w_temp']) await cast(id);
  // staff bolts, heavy blast, shoot, block+parry
  await ev(() => { HM.S.eq.weapon = HM.genItem(HM.S.lvl, { base: 'staff', rar: 2 }); HM.recalc(); const pl = HM.pl; pl.act = null; for (const a of HM.actors.slice()) if (a.kind === 'enemy') { a.dead = true; a.gone = true; } window.E1 = HM.spawnEnemy('stalker', 4, 152, HM.S.lvl); HM.press('j'); }); await wait(700); await ev(() => HM.press('k')); await wait(1200); await ev(() => HM.press('f')); await wait(600);
  await log('staff', () => ({ e: Math.round(E1.hp / E1.maxHp * 100), foc: Math.round(HM.pl.foc) }));
  await ev(() => { HM.K.shift = true; }); await wait(60); await ev(() => { HM.pl.rot = Math.atan2(E1.x - HM.pl.x, E1.z - HM.pl.z); HM.pl.blockT = 0.05; HM.hit(E1, HM.pl, { dmg: 50 }); }); await wait(200);
  await log('parry', () => ({ riposte: HM.pl.buff.riposte > 0, estun: +(E1.fx.stun || 0).toFixed(1), hp: Math.round(HM.pl.hp / HM.P.maxHp * 100), block: HM.pl.block }));
  await wait(800); await ev(() => { HM.pl.blockT = 1; HM.hit(E1, HM.pl, { dmg: 50 }); }); await log('block', () => ({ hp: Math.round(HM.pl.hp / HM.P.maxHp * 100), sta: Math.round(HM.pl.sta) })); await ev(() => { HM.K.shift = false; });
  // become vampire: vampire skills
  await ev(() => { for (const a of HM.actors.slice()) if (a.kind === 'enemy') { a.dead = true; a.gone = true; } HM.S.cons.vblood = 1; }); await p.keyboard.press('Tab'); await wait(200); await ev(() => document.querySelector('[data-cons="vblood"]').click()); await p.keyboard.press('Tab'); await wait(200);
  await ev(() => { HM.pl.hp = 1; HM.hit(null, HM.pl, { dmg: 1e9 }); }); await wait(9500);
  await ev(() => { const S = HM.S; S.clock = 23; S.sp = 50; for (const k of ['v_frenzy', 'v_compel', 'v_step', 'v_ripper', 'v_blur', 'v_pred', 'v_heal', 'v_sense', 'v_night', 'v_elder']) S.skills[k] = k === 'v_blur' ? 3 : 1; S.eq.weapon = null; HM.recalc(); });
  await log('vampire', () => ({ sp: HM.S.species, witchPts: Object.keys(HM.S.skills).filter(k => k[0] === 'w'), maxHp: Math.round(HM.P.maxHp) }));
  for (const id of ['v_frenzy', 'v_compel', 'v_step', 'v_ripper']) await cast(id);
  await ev(() => { HM.press(' '); }); await wait(500);
  // deer feed
  await ev(() => { for (const a of HM.actors.slice()) if (a.kind === 'enemy') { a.dead = true; a.gone = true; } HM.pl.blood = 10; window.D = HM.spawnEnemy('deer', HM.pl.x + 1.5, HM.pl.z, 1); }); await wait(250); await p.keyboard.press('e'); await wait(500); await log('deer', () => ({ dead: D.dead, blood: Math.round(HM.pl.blood) }));
  // quests chain quick: arrive -> bump
  await ev(() => { HM.S.clock = 22; }); await talk('marnie'); await talk('odette'); await talk('marnie');
  await ev(() => { HM.pl.x = -104; HM.pl.z = 44; }); await wait(4500); await log('bump', () => ({ q: HM.S.quests, ferals: HM.actors.filter(a => a.type === 'feral').length }));
  await ev(() => { for (const a of HM.actors) if (a.kind === 'enemy' && a.fam === 'vampire') HM.hit(HM.pl, a, { dmg: 1e9, mat: 'wood' }); }); await wait(400); await talk('hale'); await wait(300);
  await log('after hale', () => ({ q: Object.keys(HM.S.quests), done: Object.keys(HM.S.done), inv: HM.S.inv.map(i => i.name) }));
  // bounty board
  await ev(() => { HM.pl.x = 8.5; HM.pl.z = -28; }); await wait(700); await p.keyboard.press('e'); await wait(300); await log('board', () => ({ menu: HM.RT.menu, n: HM.S.bounties.length, titles: HM.S.bounties.map(b => b.title) }));
  await ev(() => document.querySelector('[data-bounty]').click()); await wait(100); await ev(() => { const b = HM.S.bounties.find(b => b.acc); b.prog = b.n; b.done = true; }); await ev(() => { const bt = [...document.querySelectorAll('[data-bounty]')]; bt[0].click(); }); await wait(100); await ev(() => { const bt = [...document.querySelectorAll('[data-bounty]')].find(x => x.textContent === 'Collect'); bt && bt.click(); }); await log('bounty paid', () => ({ gold: HM.S.gold, n: HM.S.bounties.length })); await p.keyboard.press('Escape'); await wait(200);
  // vendor sell + forge
  await ev(() => { HM.S.exposure = 0; HM.S.gold = 99999; HM.S.cons.scrap = 99; HM.addItem(HM.genItem(10, { base: 'sword', rar: 1 }), true); }); await talk('hale'); await wait(300); await log('hale vamp', () => ({ ch: [...document.querySelectorAll('#dch .choice')].map(c => c.textContent), text: document.getElementById('dtext').textContent.slice(0, 50) }));
  await choose(0); await ev(() => { const it = [...document.querySelectorAll('#mbody section:nth-child(2) .item[data-item]')].pop(); it.click(); }); await wait(100); await ev(() => { const f = document.querySelector('[data-act="forge"]'); f && f.click(); }); await wait(100); await ev(() => { const f = document.querySelector('[data-act="sell"]'); f && f.click(); }); await wait(100);
  await log('forge+sell', () => ({ inv: HM.S.inv.length, scrap: HM.S.cons.scrap })); await p.keyboard.press('Escape'); await wait(200);
  // map travel + sleep
  await ev(() => { HM.S.disc.farm = 1; HM.pl.x = -6 + 1; HM.pl.z = 22 + 1; HM.RT.combatT = 0; }); await wait(500); await p.keyboard.press('m'); await wait(300); await ev(() => { const b = document.querySelector('[data-poi="farm"]'); b && !b.disabled && b.click(); }); await wait(3000); await log('travel', () => ({ x: Math.round(HM.pl.x), z: Math.round(HM.pl.z), menu: HM.RT.menu }));
  await ev(() => { HM.pl.x = -37.6; HM.pl.z = -8; }); await wait(600); await p.keyboard.press('e'); await wait(300); await choose(1); await wait(4500); await log('slept', () => ({ clock: HM.S.clock.toFixed(1), day: HM.S.day, hp: Math.round(HM.pl.hp), blk: HM.RT.blk }));
  // heretic + cure
  await ev(() => { HM.S.flags.matriarch = 1; HM.S.sigils = 100; HM.S.clock = 23; HM.pl.x = -20; HM.pl.z = -243; }); await wait(700); await p.keyboard.press('e'); await wait(300); await choose(0); await log('heretic', () => ({ her: HM.S.heretic, sig: HM.S.sigils }));
  await ev(() => { HM.S.cons.cure = 1; }); await p.keyboard.press('Tab'); await wait(200); await ev(() => document.querySelector('[data-cons="cure"]').click()); await wait(200); await p.keyboard.press('Tab'); await wait(6500); await log('cured', () => ({ sp: HM.S.species, her: HM.S.heretic, skills: Object.keys(HM.S.skills).filter(k => k[0] === 'v') }));
  // matriarch + alpha + lenore spawn
  await ev(() => { HM.S.flags.matDay = undefined; HM.S.flags.matriarch = 0; }); await p.keyboard.press('e'); await wait(800); await log('matriarch', () => ({ boss: HM.actors.filter(a => a.def.boss).map(a => a.name) }));
  await ev(() => { HM.pl.hp = 1e7; }); await wait(5000); await ev(() => { for (const a of HM.actors) if (a.kind === 'enemy') HM.hit(HM.pl, a, { dmg: 1e12, mat: 'magic' }); }); await wait(600); await log('mat dead', () => ({ flags: HM.S.flags.matriarch, drops: HM.drops.length }));
  console.log('ERRS', errs.slice(0, 10).join('\n')); await b.close();
})();

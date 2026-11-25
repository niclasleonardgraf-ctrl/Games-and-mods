const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 320, height: 200 } }); const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto('http://localhost:8765/index.html'); await p.waitForFunction(() => window.HM && window.HM.pl && !document.getElementById('begin').disabled, null, { timeout: 90000 });
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } document.getElementById('begin').click(); }); await p.waitForTimeout(300); for (let i = 0; i < 2; i++) { await p.keyboard.press('e'); await p.waitForTimeout(200); }
  const ev = (f, a) => p.evaluate(f, a), wait = ms => p.waitForTimeout(ms);
  await ev(() => { HM.RT.touch = true; HM.S.clock = 12; HM.pl.x = 10; HM.pl.z = 5; });
  const dps = async (label, setup) => { await ev(setup); await ev(() => { window.D = HM.spawnEnemy('feral', HM.pl.x + 2, HM.pl.z, 1); D.maxHp = D.hp = 1e9; D.maxPoise = D.poise = 1e9; D.fx.stun = 1e6; window.T0 = HM.RT.time; });
    for (let i = 0; i < 90; i++) { await ev(() => HM.press('j')); await wait(60); } const r = await ev(() => ({ dmg: Math.round(1e9 - D.hp), t: +(HM.RT.time - T0).toFixed(2) })); console.log(label, JSON.stringify(r), 'dps', (r.dmg / r.t).toFixed(1)); await ev(() => { D.dead = true; D.gone = true; }); await wait(300); };
  await dps('L1 bat', () => { });
  await dps('L1 stake', () => { HM.S.eq.weapon = HM.genItem(1, { base: 'stake', rar: 0 }); HM.recalc(); });
  await dps('L1 axe', () => { HM.S.eq.weapon = HM.genItem(1, { base: 'axe', rar: 0 }); HM.recalc(); });
  console.log('feral L1 hp', await ev(() => { const e = HM.spawnEnemy('feral', 40, 40, 1); const h = e.maxHp; e.dead = e.gone = true; const w = HM.spawnEnemy('wolf', 40, 40, 1); const wh = w.maxHp; w.dead = w.gone = true; return [Math.round(h), Math.round(wh), Math.round(e.dmg), Math.round(w.dmg)]; }));
  // real fight in the square (no spawns): no dodge, then 60% dodge
  const fight = async (label, setup, dodge, maxS = 90) => { await ev(setup); await ev(() => { window.TAKEN = 0; window.LASTHP = HM.pl.hp; }); const t0 = await ev(() => HM.RT.time); let res;
    for (let i = 0; i < maxS * 9; i++) { res = await ev((dodge) => { const en = HM.actors.filter(a => a.kind === 'enemy' && !a.dead && !a.def.peaceful), pl = HM.pl; if (pl.hp < LASTHP) TAKEN += LASTHP - pl.hp; LASTHP = pl.hp; if (!en.length || pl.dead) return { done: true, taken: Math.round(TAKEN), max: Math.round(HM.P.maxHp), t: HM.RT.time, dead: pl.dead };
        let near = en[0], bd = 1e9; for (const e of en) { const d = Math.hypot(e.x - pl.x, e.z - pl.z); if (d < bd) { bd = d; near = e; } } const c = near.ai.cur;
        if (dodge && c && c.ph === 'wind' && c.t > c.wind * 0.55 && bd < 6 && Math.random() < dodge) HM.press(' '); else if (bd < 3.2) { HM.K.d = HM.K.a = HM.K.w = HM.K.s = false; HM.press('j'); } else { const dx = near.x - pl.x, dz = near.z - pl.z; HM.K.d = dx > 0.5; HM.K.a = dx < -0.5; HM.K.s = dz > 0.5; HM.K.w = dz < -0.5; } return { done: false }; }, dodge); if (res.done) break; await wait(100); }
    await ev(() => { HM.K.d = HM.K.a = HM.K.w = HM.K.s = false; }); console.log(label, JSON.stringify(res), 'dur', res.t ? (res.t - t0).toFixed(1) : 'timeout'); if (res.dead) { await wait(1800); await ev(() => document.getElementById('respawn').click()); await wait(600); } await ev(() => { HM.S.clock = 12; HM.S.lvl = 1; HM.S.xp = 0; HM.S.eq.weapon = HM.genItem(1, { base: 'bat', rar: 0 }); HM.recalc(); HM.pl.hp = HM.P.maxHp; HM.pl.x = 10; HM.pl.z = 5; for (const a of HM.actors.slice()) if (a.kind === 'enemy') { a.dead = true; a.gone = true; } }); await wait(300); };
  await ev(() => { HM.S.lvl = 1; HM.S.xp = 0; HM.S.eq.weapon = HM.genItem(1, { base: 'bat', rar: 0 }); HM.recalc(); HM.pl.hp = HM.P.maxHp; });
  await fight('L1 wolf nododge', () => { HM.spawnEnemy('wolf', 15, 8, 1); }, 0);
  await fight('L1 feral nododge', () => { HM.spawnEnemy('feral', 15, 8, 1); }, 0);
  await fight('L1 2 ferals nododge', () => { HM.spawnEnemy('feral', 15, 8, 1); HM.spawnEnemy('feral', 5, 0, 1); }, 0);
  await fight('L1 2 ferals dodge60', () => { HM.spawnEnemy('feral', 15, 8, 1); HM.spawnEnemy('feral', 5, 0, 1); }, 0.6);
  await fight('L1 3 wolves nododge', () => { HM.spawnEnemy('wolf', 15, 8, 1); HM.spawnEnemy('wolf', 5, 0, 1); HM.spawnEnemy('wolf', 16, 2, 1); }, 0);
  console.log('ERRS', errs.join('\n')); await b.close();
})();

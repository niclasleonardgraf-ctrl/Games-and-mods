const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const SP = process.argv[2]; const want = (process.argv[3] || '').split(',');
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('console', m => { if (m.type() === 'warning' && /missing model/.test(m.text())) errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')));
  await p.goto('http://localhost:8765/index.html'); await p.waitForFunction(() => window.HM && window.HM.pl && !document.getElementById('begin').disabled, null, { timeout: 120000 });
  await p.waitForTimeout(2500); if (want.includes('title')) await p.screenshot({ path: SP + '/x_title.png' });
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { } document.getElementById('begin').click(); }); await p.waitForTimeout(400);
  for (let i = 0; i < 2; i++) { await p.keyboard.press('e'); await p.waitForTimeout(250); }
  const ev = (f, a) => p.evaluate(f, a), wait = ms => p.waitForTimeout(ms);
  await ev(() => { HM.RT.touch = true; document.getElementById('toasts').style.display = 'none'; });
  const V = { town: [6, -18, 14], square: [-4, 8, 22], cem: [-140, 44, 0.5], woods: [-40, -120, 23], chapel: [-130, -160, 22], falls: [196, -224, 10], lake: [-128, 172, 19.3], farm: [34, 222, 9], manor: [234, -50, 21.5], quarry: [150, 176, 23], hollow: [-20, -236, 1], camp: [-228, -66, 20.5], bridge: [196, -40, 6.2], res: [0, 80, 17.5] };
  for (const k of want) if (V[k]) { await ev(v => { HM.pl.x = v[0]; HM.pl.z = v[1]; HM.S.clock = v[2]; HM.pl.hp = 1e7; }, V[k]); await wait(3200); await p.screenshot({ path: SP + "/x_" + k + ".png" }); console.log(k, JSON.stringify(await ev(() => ({ tris: HM.RT.tris, calls: HM.RT.calls })))); }
  if (want.includes('tomb')) { await ev(() => { HM.enterArea('tomb', { depth: 4 }); }); await wait(1200); await ev(() => { const a = HM.area; const w = a.boxes[20]; HM.pl.hp = 1e7; }); await wait(3000); await p.screenshot({ path: SP + '/x_tomb.png' }); }
  if (want.includes('boss')) { await ev(() => { HM.enterArea('tomb', { depth: 10 }); }); await wait(1000); await ev(() => { const bo = HM.actors.find(a => a.def.boss); HM.pl.x = bo.x; HM.pl.z = bo.z + 8; HM.pl.hp = 1e7; }); await wait(6000); await p.screenshot({ path: SP + '/x_boss.png' }); }
  console.log(JSON.stringify(await ev(() => ({ tris: HM.RT.tris, calls: HM.RT.calls })))); console.log('ERRS', [...new Set(errs)].slice(0, 30).join('\n')); await b.close();
})();

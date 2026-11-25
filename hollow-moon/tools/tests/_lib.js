/* Hollow Moon — shared helpers for the Playwright tests in this folder.
   The tests need a static server on :8765 serving the hollow-moon directory, and are run from /tmp:
     cd /tmp && node /path/to/hollow-moon/tools/tests/<name>.js <dir for screenshots>
   Headless rendering is slow (the game's clock runs at roughly a third of wall time in a 320x200 window), so the tests drive state through
   window.HM and wait on conditions, never on fixed sleeps where a condition will do. */
const { chromium } = require('playwright');
const URL = process.env.HM_URL || 'http://localhost:8765/index.html';
const T = { passes: 0, fails: 0, errs: [] };
/* one line per assertion; the state that failed it is printed after a FAIL */
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined && !cond ? '  ' + JSON.stringify(extra) : '')); if (cond) T.passes++; else T.fails++; return !!cond; };
const note = (label, v) => console.log('     ' + label + ' ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const launch = () => chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const READY = () => window.HM && window.HM.pl && !document.getElementById('begin').disabled;

/* open the game in its own browser context (its own localStorage). o: origin ('human' | 'witch' | 'siphoner' | 'wolf'), viewport, tag (prefix for page errors),
   begin: false to stay on the title screen, storage: { key: value } written to localStorage before the page loads, toasts: true to leave the toasts visible */
async function open(b, o = {}) {
  const tag = o.tag || o.origin || 'page', ctx = o.ctx || await b.newContext({ viewport: o.viewport || { width: 320, height: 200 } }), p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') T.errs.push(`[${tag}] E: ` + m.text().slice(0, 300)); });
  p.on('pageerror', e => T.errs.push(`[${tag}] PAGEERR ` + e.message + '\n' + (e.stack || '').split('\n').slice(1, 5).join('\n')));
  if (o.storage) await ctx.addInitScript(s => { try { if (!sessionStorage.getItem('hm.seeded')) { sessionStorage.setItem('hm.seeded', '1'); for (const k in s) localStorage.setItem(k, s[k]); } } catch (e) { } }, o.storage);
  await p.goto(URL); await p.waitForFunction(READY, null, { timeout: 120000 });
  const h = {
    p, ctx, ev: (f, a) => p.evaluate(f, a),
    /* click through a dialogue until it closes or offers choices; returns the choices on offer, or null */
    adv: () => p.evaluate(() => { let n = 0; while (HM.dq && !(HM.dq.choices && HM.dq.i === HM.dq.lines.length - 1) && n++ < 40) document.getElementById('dlg').click(); return HM.dq ? [...document.querySelectorAll('#dch .choice')].map(c => c.textContent) : null; }),
    /* pick the choice whose text contains txt; false (and the labels on offer are printed) if there is none */
    choose: async txt => { await h.adv(); const r = await p.evaluate(t => { const c = [...document.querySelectorAll('#dch .choice')], bt = c.find(x => x.textContent.includes(t)); if (!bt) return c.map(x => x.textContent); bt.click(); return true; }, txt); if (r !== true) note('no choice "' + txt + '" among', r); return r === true; },
    waitDlg: (ms = 15000) => p.waitForFunction(() => !!HM.dq, null, { timeout: ms }).then(() => true, () => false),
    until: (f, a, ms = 30000) => p.waitForFunction(f, a, { timeout: ms }).then(() => true, () => false),
    /* let the game run for s seconds of its own clock (it stands still while a dialogue or a menu is open) */
    run: async (s = 0.15) => { const t = await p.evaluate(() => HM.RT.time); return h.until(([t0, s0]) => HM.RT.time >= t0 + s0, [t, s], 90000); },
    unpaused: () => h.until(() => !HM.RT.paused && !HM.RT.blk && !HM.dq && !HM.RT.menu),
    idle: () => h.until(() => !HM.RT.paused && !HM.pl.act && !(HM.pl.fx.stun > 0) && !(HM.pl.shiftT > 0), null, 20000),
    /* the town square: a safe zone (nothing spawns there), open to the sky */
    square: () => p.evaluate(() => { HM.pl.x = 10; HM.pl.z = 5; HM.pl.kx = HM.pl.kz = 0; }),
    clear: () => p.evaluate(() => { for (const a of HM.actors.slice()) if (a.kind === 'enemy') { a.dead = true; a.gone = true; } }),
    /* an ordinary death by a blow: whatever is in the blood decides what happens next */
    die: async () => { await h.unpaused(); await p.evaluate(() => { HM.pl.inv = 0; HM.pl.buff.ward = 0; HM.pl.buff.second = 99; HM.hit(null, HM.pl, { dmg: 1e9 }); }); },
    /* walk up to a named person and use them, by way of the game's own Use logic */
    talk: async id => { await h.unpaused(); return p.evaluate(id => { const n = HM.actors.find(a => a.npc && a.npc.id === id); if (!n) return false; HM.pl.x = n.x + 1.2; HM.pl.z = n.z + 1.2; const it = HM.actorInteract(n, Math.hypot(n.x - HM.pl.x, n.z - HM.pl.z)); if (!it) return false; it.act(); return true; }, id); },
    /* dying with blood in the system: wait for the blackout to end with the player in transition */
    awaitTransition: () => h.until(() => !HM.RT.blk && !!HM.S.transition && !HM.pl.dead, null, 40000),
    /* straight to a species, skipping the story (for tests that are about something else) */
    turn: async blood => { await h.unpaused(); await p.evaluate(() => HM.beginTransition('vampire', 'test')); await h.awaitTransition(); await p.evaluate(() => HM.completeTransition()); await h.adv(); await h.unpaused(); },
    shot: name => p.screenshot({ path: (o.dir || '.') + '/' + name }),
    close: () => ctx.close(),
  };
  await p.evaluate(t => { if (!t) document.getElementById('toasts').style.display = 'none'; }, !!o.toasts);
  if (o.begin !== false) {
    await p.evaluate(og => { const c = document.querySelector(`[data-origin="${og}"]`); if (c) c.click(); document.getElementById('begin').click(); }, o.origin || 'human');
    await h.until(() => HM.RT.started && !!HM.dq, null, 20000); await h.adv(); await h.unpaused(); await h.square();
  }
  return h;
}
/* the summary line, any page errors, and the exit code */
async function finish(b) { console.log(`\n${T.passes} passed, ${T.fails} failed`); console.log('ERRS', [...new Set(T.errs)].slice(0, 20).join('\n') || 'none'); if (b) await b.close(); process.exit(T.fails || T.errs.length ? 1 : 0); }
/* run named sections; argv[3] may be a comma-separated list of the ones wanted */
async function sections(b, list, only) { const want = (only || '').split(',').filter(Boolean); for (const [n, f] of list) if (!want.length || want.includes(n)) { try { await f(b); } catch (e) { T.fails++; console.log('FAIL ' + n + ': the run threw: ' + String(e && e.message || e).split('\n')[0]); } } }
module.exports = { launch, open, ok, note, finish, sections, T, URL };

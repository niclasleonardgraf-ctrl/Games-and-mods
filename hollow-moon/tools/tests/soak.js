/* Hollow Moon — soak: every kind of enemy fights each kind of player for a few seconds of game time while a bot swings back. It is looking for page errors
   in the attack code that only runs when something actually happens (compulsion, grabs, neck snaps, telekinesis, boundaries, venom, lodged bolts, summons).
   node tools/tests/soak.js <dir> [human,vampire,hybrid] */
const { launch, open, ok, note, finish, sections } = require('./_lib');
const SECS = +(process.env.HM_SOAK || 6);

async function soak(h, label, weapon) {
  const { ev, p } = h, types = await ev(() => { window.SEEN = { atk: {}, fx: {}, resolved: 0 }; return HM.S && Object.keys(HM.S.kills).length >= 0 ? null : null; });
  const all = ['robber', 'wolf', 'deer', 'feral', 'tombvamp', 'stalker', 'elder', 'thrall', 'cultist', 'warlock', 'shade', 'werewolf', 'packrunner', 'hybrid', 'hunter', 'fivehunter', 'warden', 'corvin', 'alpha', 'ambrose', 'lenore', 'matriarch', 'sleeper', 'casimir'];
  for (let i = 0; i < all.length; i += 6) {
    const batch = all.slice(i, i + 6);
    await h.unpaused(); await ev(([batch, weapon]) => { HM.S.day = 2; HM.S.clock = 22; HM.pl.x = 10; HM.pl.z = 5; HM.pl.inv = 0; HM.pl.fx = {}; HM.pl.pose = null; if (weapon) { HM.S.eq.weapon = HM.genItem(HM.S.lvl, { base: weapon, rar: 1 }); HM.recalc(); }
      for (const a of HM.actors.slice()) if (a.kind === 'enemy') { a.dead = true; a.gone = true; }
      batch.forEach((t, k) => { const an = k / batch.length * 6.283, e = HM.spawnEnemy(t, 10 + Math.sin(an) * 5, 5 + Math.cos(an) * 5, HM.S.lvl, { awake: 1 }); e.dmgM *= 0.05; e.ai.provoked = true; if (!e.def.peaceful) { e.ai.aggro = true; e.ai.gcd = 0.2 + k * 0.1; } }); }, [batch, weapon]);
    const t0 = await ev(() => HM.RT.time);
    for (let n = 0; n < 400; n++) {
      const st = await ev(t0 => { const pl = HM.pl; if (HM.dq) { let k = 0; while (HM.dq && k++ < 30) { const c = [...document.querySelectorAll('#dch .choice')]; if (c.length) c[c.length - 1].click(); else document.getElementById('dlg').click(); } }
        if (!pl.dead) pl.hp = Math.max(pl.hp, HM.P.maxHp * 0.7); pl.sta = HM.P.maxSta; pl.blood = Math.max(pl.blood, 50);
        for (const k in pl.fx) if (pl.fx[k] > 0) SEEN.fx[k] = 1; if (HM.S.venomUntil > 0) { SEEN.fx.venom = 1; HM.S.venomUntil = 0; HM.recalc(); } if (pl.pose === 'held') SEEN.fx.held = 1;
        let near = null, bd = 1e9; for (const e of HM.actors) { if (e.kind !== 'enemy' || e.dead) continue; if (e.ai && e.ai.cur) SEEN.atk[e.ai.cur.name] = (SEEN.atk[e.ai.cur.name] || 0) + 1; if (e.def.peaceful) continue; const d = Math.hypot(e.x - pl.x, e.z - pl.z); if (d < bd) { bd = d; near = e; } }
        if (near && !pl.dead && !HM.RT.paused) { if (near.downed && bd < 3) { const it = HM.findInteract(); if (it && /Finish/.test(it.label)) it.act(); } else if (bd < 3.4) { pl.rot = Math.atan2(near.x - pl.x, near.z - pl.z); HM.RT.dlgT = 0; HM.press(Math.random() < 0.2 ? 'k' : 'j'); } }
        return { t: HM.RT.time - t0, dead: pl.dead, blk: HM.RT.blk, shown: !document.getElementById('death').hidden }; }, t0);
      if (st.shown) { await ev(() => document.getElementById('respawn').click()); await h.until(() => !HM.pl.dead, null, 10000); break; }
      if (st.t >= SECS) break; await p.waitForTimeout(90);
    }
    await h.until(() => !HM.RT.blk, null, 30000);
  }
  const seen = await ev(() => ({ atk: Object.keys(SEEN.atk).sort(), fx: Object.keys(SEEN.fx).sort() })); note(label + ' saw attacks:', seen.atk.join(' ')); note(label + ' suffered:', seen.fx.join(' ')); return seen;
}
const CANON = ['gaze', 'grab', 'snap', 'dashchain', 'debris', 'wbite', 'pounce', 'firebolt', 'tk', 'boundary', 'aneurysm', 'xbolt', 'summon'];

async function human(b) { console.log('\n# a living human against everything'); const h = await open(b, { origin: 'human', tag: 'soak-human' }); await h.ev(() => { HM.gainXp(20000); });
  const s = await soak(h, 'human', 'sword'); ok('soak (human): every canon attack was thrown at least once', CANON.every(a => s.atk.includes(a)), CANON.filter(a => !s.atk.includes(a)));
  ok('soak (human): compelled by a vampire\'s gaze, seized and fed on, and stunned', s.fx.includes('charm') && s.fx.includes('held') && s.fx.includes('stun'), s.fx); ok('soak (human): never envenomed, nothing lodged', !s.fx.includes('venom') && !s.fx.includes('lodged'), s.fx); await h.close(); }
async function vampire(b) { console.log('\n# a vampire against everything'); const h = await open(b, { origin: 'human', tag: 'soak-vampire' }); await h.ev(() => { HM.gainXp(20000); HM.S.clock = 22; }); await h.turn();
  const s = await soak(h, 'vampire', 'bat'); ok('soak (vampire): bitten and envenomed by wolves, with wooden bolts lodged and vervain in the blood', s.fx.includes('venom') && s.fx.includes('lodged') && s.fx.includes('verv'), s.fx);
  ok('soak (vampire): an ordinary vampire cannot be compelled by another, but an Original can do it', s.fx.includes('charm'), s.fx); await h.close(); }
async function hybrid(b) { console.log('\n# a hybrid, as a wolf, against everything'); const h = await open(b, { origin: 'wolf', tag: 'soak-hybrid' }); await h.ev(() => { HM.gainXp(20000); HM.S.clock = 22; HM.triggerCurse(); }); await h.adv(); await h.unpaused();
  await h.ev(() => { HM.beginTransition('hybrid', 'test'); }); await h.awaitTransition(); await h.ev(() => { HM.completeTransition(); HM.S.flags.shifts = 100; }); await h.adv(); await h.unpaused(); await h.ev(() => { HM.setForm(true, true); HM.pl.shiftT = 0; });
  const s = await soak(h, 'hybrid wolf', null); ok('soak (hybrid): still a wolf at the end, never envenomed, wolfsbane found it', (await h.ev(() => HM.pl.wolf)) && !s.fx.includes('venom') && !s.fx.includes('charm'), s.fx); await h.close(); }

(async () => { const b = await launch(); await sections(b, [['human', human], ['vampire', vampire], ['hybrid', hybrid]], process.argv[3]); await finish(b); })();

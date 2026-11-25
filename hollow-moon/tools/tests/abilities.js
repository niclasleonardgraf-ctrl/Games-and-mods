/* Hollow Moon — every active skill, cast by the species it belongs to against the families it is meant to tell apart, plus the town's services.
   node tools/tests/abilities.js <dir for screenshots> [hunter,vampire,witch,wolf,town] */
const { launch, open, ok, note, finish, sections } = require('./_lib');
const SP = process.argv[2] || '.';
/* in-page helpers: a clean slate, an enemy at an offset from the player (held still unless free), and a cast from slot 1 */
const HELP = () => { window.T_ = {
  reset() { const pl = HM.pl; HM.recalc(); pl.hp = HM.P.maxHp; pl.sta = HM.P.maxSta; pl.foc = HM.P.maxFoc; pl.blood = HM.P.maxBlood; pl.rage = 0; pl.cds = {}; pl.act = null; pl.sw = null; pl.fx = {}; pl.inv = 1e6; pl.buff.cloak = pl.buff.ward = pl.buff.wardT = pl.buff.fury = 0; pl.shiftT = pl.shiftCd = 0; pl.rot = pl.vr = Math.PI / 2; HM.RT.dlgT = 0; for (const a of HM.actors.slice()) if (a.kind === 'enemy') { a.dead = true; a.gone = true; } },
  foe(type, dx = 2, dz = 0, o = {}) { const e = HM.spawnEnemy(type, HM.pl.x + dx, HM.pl.z + dz, o.lvl || HM.S.lvl, Object.assign({ awake: 1 }, o)); e.fx.stun = o.free ? 0 : 600; e.rot = -Math.PI / 2; return e; },
  cast(id, r) { HM.S.skills[id] = r || HM.S.skills[id] || 1; HM.S.bar[0] = id; HM.castSkill(0); return HM.pl.cds[id] > 0; },
  pct: e => +(e.hp / e.maxHp).toFixed(3),
  /* someone whose only move is to catch the player's eye */
  gazer(type) { T_.reset(); const e = T_.foe(type, 4, 0, { free: 1 }); for (const n of e.def.atk) if (n !== 'gaze') e.ai.cd[n] = 1e6; e.ai.aggro = e.ai.provoked = true; e.ai.gcd = 0; HM.pl.inv = 0; window.G = e; return e; },
}; };
const prep = async (h, o = {}) => { await h.ev(HELP); await h.ev(o => { HM.S.clock = o.clock || 22; HM.gainXp(40000); HM.S.sp = 0; HM.pl.inv = 1e6; T_.reset(); }, o); await h.unpaused(); await h.square(); };

async function hunter(b) {
  console.log('\n# hunter skills (a living human)');
  const h = await open(b, { origin: 'human', tag: 'hunter', dir: SP }), { ev } = h; await prep(h);
  let s = await ev(() => { T_.reset(); window.A = T_.foe('feral', 4, 0); window.B = T_.foe('packrunner', 4, 1.5); window.C = T_.foe('robber', 4, -1.5); return T_.cast('h_gren'); });
  await h.until(() => A.hp < A.maxHp && C.hp < C.maxHp, null, 30000);
  let r = await ev(() => ({ a: T_.pct(A), b: T_.pct(B), c: T_.pct(C), av: A.fx.verv > 0, bv: B.fx.verv > 0, cv: C.fx.verv > 0 }));
  ok('h_gren: vervain weakens and burns the vampire; the werewolf and the person only take the bang', s && r.av && !r.bv && !r.cv && r.a < r.b && r.a < r.c, r);
  s = await ev(() => { T_.reset(); window.A = T_.foe('feral', 4, 0); window.B = T_.foe('packrunner', 4, 1.5); window.C = T_.foe('wolf', 4, -1.5); return T_.cast('h_wgren'); });
  await h.until(() => A.hp < A.maxHp && B.hp < B.maxHp, null, 30000);
  r = await ev(() => ({ a: T_.pct(A), b: T_.pct(B), c: T_.pct(C), ab: A.fx.wolfsbane > 0, bb: B.fx.wolfsbane > 0, cb: C.fx.wolfsbane > 0 }));
  ok('h_wgren: wolfsbane weakens the werewolf; the vampire and the timber wolf only take the bang', s && r.bb && !r.ab && !r.cb && r.b < r.a, r);
  r = await ev(() => { const o = {}; T_.reset(); let e = T_.foe('feral', 3, 0, { free: 1 }); e.hp = e.maxHp * 0.15; T_.cast('h_heart'); o.low = e.dead;
    T_.reset(); e = T_.foe('feral', 3, 0, { free: 1 }); T_.cast('h_heart'); o.healthy = !e.dead && !e.downed && e.hp < e.maxHp;
    T_.reset(); e = T_.foe('feral', 3, 0); HM.hit(HM.pl, e, { dmg: 1e9, mat: 'steel' }); o.wasDown = e.downed; T_.cast('h_heart'); o.downed = e.dead;
    T_.reset(); e = T_.foe('hybrid', 3, 0); HM.hit(HM.pl, e, { dmg: 1e9, mat: 'steel' }); T_.cast('h_heart'); o.hybrid = !e.dead && e.downed;
    T_.reset(); e = T_.foe('casimir', 3, 0); HM.hit(HM.pl, e, { dmg: 1e12, mat: 'steel' }); T_.cast('h_heart'); o.original = !e.dead && e.downed; return o; });
  ok('h_heart: stakes a vampire that is low or down; a healthy one is only hurt', r.low && r.healthy && r.wasDown && r.downed, r);
  ok('h_heart: wood through the heart does not end a hybrid or an Original', r.hybrid && r.original, r);
  s = await ev(() => { T_.reset(); window.A = T_.foe('robber', 2, 0); A.maxHp = A.hp = 1e7; return T_.cast('h_whirl'); }); await h.until(() => !HM.pl.act, null, 30000);
  r = await ev(() => ({ lost: 1e7 - A.hp, one: HM.P.wdmg * HM.P.meleeM * 0.8 })); ok('h_whirl: three turns, three hits', s && r.lost > r.one * 2.5 && r.lost < r.one * 3 * 2.2, r);
  s = await ev(() => { T_.reset(); HM.S.eq.ranged = HM.genItem(HM.S.lvl, { base: 'xbow', rar: 1 }); HM.recalc(); window.A = T_.foe('robber', 7, 0); A.maxHp = A.hp = 1e7; return T_.cast('h_volley'); }); await h.until(() => A.hp < 1e7, null, 30000);
  ok('h_volley: a fan of bolts reaches a target seven metres off', s && await ev(() => A.hp < 1e7));
  r = await ev(() => { T_.reset(); const v = T_.foe('feral', 6, 0, { free: 1 }), w = T_.foe('packrunner', 6, 2, { free: 1 }), p = T_.foe('robber', 6, -2, { free: 1 }), o = T_.foe('casimir', 9, 0, { free: 1 }); const c = T_.cast('h_device'); return { c, v: v.fx.stun, w: w.fx.stun, p: p.fx.stun || 0, o: o.fx.stun, me: HM.pl.fx.stun || 0 }; });
  ok("h_device: drops vampires and werewolves, an Original for less; people hear nothing, and a human winding it is fine", r.c && r.v >= 5 && r.w >= 5 && r.p === 0 && r.o > 0 && r.o < r.v && r.me === 0, r);
  const MET = () => { HM.pl.rot = Math.atan2(G.x - HM.pl.x, G.z - HM.pl.z); HM.pl.hp = HM.P.maxHp; return HM.pl.fx.charm > 0 || G.ai.noGaze === true; };
  await ev(() => { T_.gazer('elder'); }); await h.until(MET, null, 60000); r = await ev(() => ({ charm: HM.pl.fx.charm > 0, by: HM.pl.charmBy === G, resisted: !!G.ai.noGaze, status: HM.status }));
  ok('compulsion: a vampire who catches a living person\'s eye compels them', r.charm && r.by && !r.resisted && r.status.includes('Compelled'), r);
  await ev(() => { HM.addCons('coffee', 1, true); HM.useCons('coffee'); T_.gazer('elder'); }); await h.until(MET, null, 60000); r = await ev(() => ({ charm: HM.pl.fx.charm > 0, resisted: !!G.ai.noGaze, immune: HM.immuneCompel(true) }));
  ok('compulsion: vervain coffee stops it, and the vampire stops trying', !r.charm && r.resisted && r.immune, r); await ev(() => { HM.S.flags.vervUntil = 0; });
  r = await ev(() => { T_.reset(); HM.S.eq.weapon = HM.genItem(HM.S.lvl, { base: 'staff', rar: 1 }); HM.recalc(); const o = { cls: HM.P.wcls, mat: HM.P.wmat }; HM.S.eq.weapon = HM.genItem(HM.S.lvl, { base: 'bat', rar: 0 }); HM.S.eq.ranged = null; HM.recalc(); return o; });
  ok('a staff in hands with no magic is only a stick', r.cls === 'med' && r.mat === 'wood', r);
  r = await ev(() => { T_.reset(); HM.S.skills = {}; HM.S.sp = 40; for (let i = 0; i < 5; i++) { HM.learn('h_weapon'); HM.learn('h_marks'); HM.learn('h_cond'); HM.learn('h_slayer'); } for (let i = 0; i < 3; i++) { HM.learn('h_parry'); HM.learn('h_second'); } for (let i = 0; i < 5; i++) HM.learn('h_slayer'); const pts = HM.treePts('hunter'); HM.learn('h_five'); const o = { pts, five: HM.S.skills.h_five || 0, immune: HM.immuneCompel(true), vsV: HM.P.vsV };
    const e = T_.foe('feral', 2, 0); HM.hit(HM.pl, e, { dmg: 1e9, mat: 'wood' }); o.mark = HM.S.flags.mark; HM.S.flags.mark = 60; HM.recalc(); o.vsV60 = HM.P.vsV; HM.S.flags.mark = 500; HM.recalc(); o.cap = HM.P.vsV; return o; });
  ok('h_five: the Brotherhood: immune even to an Original; the mark grows with each vampire killed, to +50%', r.pts >= 25 && r.five === 1 && r.immune && r.vsV === 10 && r.mark === 1 && r.vsV60 === 40 && r.cap === 50, r);
  await h.close();
}

async function vampire(b) {
  console.log('\n# vampire and Original skills');
  const h = await open(b, { origin: 'human', tag: 'vampire', dir: SP }), { ev, p } = h; await prep(h); await h.turn(); await ev(() => { T_.reset(); });
  let r = await ev(() => { const o = {}; T_.reset(); HM.pl.blood = 30; HM.pl.hp = HM.P.maxHp * 0.5; let e = T_.foe('robber', 5, 0); const b0 = HM.pl.blood; T_.cast('v_frenzy'); o.human = { blood: Math.round(HM.pl.blood - b0), hurt: e.hp < e.maxHp, healed: HM.pl.hp > HM.P.maxHp * 0.5, near: Math.hypot(e.x - HM.pl.x, e.z - HM.pl.z) < 3 };
    T_.reset(); HM.pl.blood = 30; e = T_.foe('hunter', 5, 0); const b1 = HM.pl.blood; T_.cast('v_frenzy'); o.dosed = { blood: Math.round(HM.pl.blood - b1), burned: HM.pl.fx.verv > 0 };
    T_.reset(); HM.pl.blood = 30; e = T_.foe('feral', 5, 0); const b2 = HM.pl.blood; T_.cast('v_frenzy'); o.dead = { blood: Math.round(HM.pl.blood - b2) };
    T_.reset(); HM.pl.blood = 30; e = T_.foe('wolf', 5, 0); const b3 = HM.pl.blood; T_.cast('v_frenzy'); o.animal = { blood: Math.round(HM.pl.blood - b3), diet: HM.S.diet, compel: HM.P.compelM }; HM.S.diet = 'human'; HM.recalc(); return o; });
  ok('v_frenzy: human blood feeds fully and heals', r.human.blood === 25 && r.human.hurt && r.human.healed && r.human.near, r.human);
  ok('v_frenzy: vervain in the blood burns the biter; a vampire has nothing to give', r.dosed.blood === 0 && r.dosed.burned && r.dead.blood === 0, r);
  ok('v_frenzy: animal blood gives half, and puts the vampire on the weaker diet', r.animal.blood === 13 && r.animal.diet === 'animal' && r.animal.compel === 0.5, r.animal);
  r = await ev(() => { const o = {}; T_.reset(); let e = T_.foe('robber', 5, 0, { free: 1 }); o.human = T_.cast('v_compel') && e.team === 0 && e.fx.charm > 0; o.cost = Math.round(HM.P.maxBlood - HM.pl.blood);
    T_.reset(); e = T_.foe('hunter', 5, 0, { free: 1 }); o.dosed = !T_.cast('v_compel') && e.team === 1 && HM.pl.blood === HM.P.maxBlood; T_.reset(); e = T_.foe('feral', 5, 0, { free: 1 }); o.vampire = !T_.cast('v_compel') && e.team === 1;
    T_.reset(); e = T_.foe('packrunner', 5, 0, { free: 1 }); o.wolf = !T_.cast('v_compel') && e.team === 1; T_.reset(); e = T_.foe('cultist', 5, 0, { free: 1 }); o.witch = !T_.cast('v_compel') && e.team === 1; return o; });
  ok('v_compel: works on a person with no vervain in them, and costs blood', r.human && r.cost === 18, r);
  ok('v_compel: fails, and costs nothing, on the vervained, on vampires, werewolves and witches', r.dosed && r.vampire && r.wolf && r.witch, r);
  r = await ev(() => { T_.reset(); const e = T_.foe('robber', 10, 0); e.maxHp = e.hp = 1e7; const x0 = HM.pl.x; const c = T_.cast('v_step'); return { c, moved: HM.pl.x - x0, hurt: e.hp < 1e7, same: HM.pl.z === 5 }; });
  ok('v_step: a straight rush that ends in a blow', r.c && r.moved > 6 && r.moved < 10 && r.hurt, r);
  r = await ev(() => { T_.reset(); const o = { c1: T_.cast('v_ripper'), off: HM.S.switchOff, m: HM.P.meleeM }; HM.pl.cds = {}; o.c2 = T_.cast('v_ripper'); o.on = !HM.S.switchOff; o.guilt = HM.S.flags.guiltT > HM.absHours(); HM.S.flags.guiltT = 0; HM.recalc(); o.m0 = HM.P.meleeM; return o; });
  ok('v_ripper: the humanity switch is a toggle, stronger while off, guilt when it comes back', r.c1 && r.off === true && r.c2 && r.on && r.guilt && r.m > r.m0, r);
  r = await ev(() => { const o = {}; T_.reset(); const hm = HM.S.humanity; let e = T_.foe('robber', 3, 0, { free: 1 }); T_.cast('v_snap'); o.person = e.dead; o.humanity = hm - HM.S.humanity; T_.reset(); e = T_.foe('feral', 3, 0, { free: 1 }); window.V = e; e.hp = e.maxHp * 0.8; T_.cast('v_snap'); o.vampire = e.downed && !e.dead; o.downT = e.downT; return o; });
  ok('v_snap: a broken neck kills a person (and costs humanity)', r.person && r.humanity === 5, r);
  await ev(() => { V.downT = 0.01; }); const rose = await h.until(() => !V.downed && !V.dead, null, 20000);
  ok('v_snap: a vampire only lies there for a few seconds, then gets up as hurt as it was', r.vampire && r.downT === 6 && rose && await ev(() => Math.abs(V.hp / V.maxHp - 0.8) < 0.02), r);
  r = await ev(() => { const o = {}; T_.reset(); let e = T_.foe('feral', 2, 0); HM.hit(HM.pl, e, { dmg: 1e9, mat: 'steel' }); T_.cast('v_heart'); o.downed = e.dead; T_.reset(); e = T_.foe('hybrid', 2, 0); HM.hit(HM.pl, e, { dmg: 1e9, mat: 'steel' }); T_.cast('v_heart'); o.hybrid = e.dead;
    T_.reset(); e = T_.foe('packrunner', 2, 0, { free: 1 }); T_.cast('v_heart'); o.healthy = !e.dead && e.hp < e.maxHp; T_.reset(); e = T_.foe('casimir', 2, 0); HM.hit(HM.pl, e, { dmg: 1e12, mat: 'steel' }); T_.cast('v_heart'); o.original = !e.dead && e.downed; return o; });
  ok('v_heart: tears the heart from anything down that can die, a hybrid included; never an Original', r.downed && r.hybrid && r.healthy && r.original, r);
  r = await ev(() => { T_.reset(); T_.foe('feral', 6, 0, { free: 1 }); const c = T_.cast('h_device'); return { c, me: HM.pl.fx.stun }; });
  ok('h_device: wound by a vampire, it drops the vampire holding it too', r.c && r.me >= 5, r);
  const MET = () => { HM.pl.rot = Math.atan2(G.x - HM.pl.x, G.z - HM.pl.z); HM.pl.hp = HM.P.maxHp; return HM.pl.fx.charm > 0 || G.ai.noGaze === true; };
  await ev(() => { T_.gazer('elder'); }); await h.until(MET, null, 60000); r = await ev(() => ({ charm: HM.pl.fx.charm > 0, resisted: !!G.ai.noGaze }));
  ok('compulsion: one vampire cannot compel another', !r.charm && r.resisted, r);
  await ev(() => { T_.gazer('casimir'); }); await h.until(MET, null, 60000); r = await ev(() => ({ charm: HM.pl.fx.charm > 0, resisted: !!G.ai.noGaze }));
  ok('compulsion: an Original can compel a vampire', r.charm && !r.resisted, r);
  /* a deer, by way of the Use prompt */
  r = await ev(() => { T_.reset(); HM.pl.blood = 10; const d = T_.foe('deer', 1.5, 0); const it = HM.actorInteract(d, 1.5); const label = it && it.label; if (it) it.act(); return { label, dead: d.dead, blood: Math.round(HM.pl.blood), diet: HM.S.diet }; });
  ok('feeding: E on a deer drinks it dry: 15 blood, and the animal diet', /animal blood/.test(r.label || '') && r.dead && r.blood === 25 && r.diet === 'animal', r);
  /* wood lodged by a hunter's bolt */
  await ev(() => { T_.reset(); HM.S.diet = 'human'; HM.pl.inv = 0; const e = T_.foe('hunter', 5, 0); HM.hit(e, HM.pl, { dmg: 3, mat: 'wood', proj: { vx: 0, vz: 0 } }); HM.pl.inv = 1e6; e.dead = true; e.gone = true; }); await h.run(0.1);
  r = await ev(() => { const hp0 = HM.pl.hp; HM.addCons('draught', 1, true); HM.pl.healCd = 0; const used = HM.useCons('draught'); return { lodged: HM.pl.fx.lodged, healM: HM.P.healM, used, prompt: (HM.findInteract() || {}).label, status: HM.status }; });
  ok('lodged wood: a wooden bolt stays in a vampire and nothing heals round it', r.lodged === 1 && r.healM === 0 && r.used === false && /pull the wood/i.test(r.prompt || '') && r.status.includes('Wood lodged'), r);
  await ev(() => { HM.RT.combatT = 30; HM.K.e = true; }); const pulled = await h.until(() => !(HM.pl.fx.lodged > 0), null, 30000); await ev(() => { HM.K.e = false; HM.recalc(); });
  ok('lodged wood: holding E digs it out, and healing comes back', pulled && await ev(() => HM.P.healM === 1));
  /* the Hollow, the ring, and the Hundred */
  r = await ev(() => { T_.reset(); HM.S.eq.ring = HM.mkUniq('daylight', HM.S.lvl); HM.recalc(); const o = { town: HM.daylightSafe() }; HM.pl.x = -20; HM.pl.z = -240; o.hollow = HM.daylightSafe(); HM.S.flags.vouched = 1; o.vouched = HM.daylightSafe(); HM.S.flags.vouched = 0; HM.pl.inv = 0; HM.pl.hp = HM.P.maxHp; return o; });
  const pain = await h.until(() => HM.pl.hp < HM.P.maxHp - 1 && HM.pl.fx.aneur > 0, null, 60000);
  ok('Coven Hollow: a daylight ring fails there and the Hundred hurt a vampire, unless a witch has spoken for them', r.town && !r.hollow && r.vouched && pain, r);
  await h.square(); await ev(() => { T_.reset(); });
  /* the first family */
  r = await ev(() => { const sp0 = HM.S.sp, o = { ok: HM.becomeOriginal(), original: HM.S.original, sire: HM.S.sire, linked: HM.lineLinked(), tree: HM.treeOpen('original'), kind: HM.kind, sp: HM.S.sp - sp0 }; return o; });
  await h.adv(); await h.unpaused();
  ok('Original: the first of a new line, with a tree of its own', r.ok && r.original && r.sire === null && !r.linked && r.tree && r.kind === 'Original', r);
  r = await ev(() => { const o = {}; T_.reset(); HM.S.skills.o_compel = 1; let e = T_.foe('feral', 5, 0, { free: 1 }); o.vampire = T_.cast('v_compel') && e.team === 0; T_.reset(); e = T_.foe('casimir', 5, 0, { free: 1 }); o.original = !T_.cast('v_compel') && e.team === 1; T_.reset(); e = T_.foe('feral', 5, 0, { free: 1 }); e.fx.verv = 5; o.verv = !T_.cast('v_compel');
    T_.reset(); HM.S.skills.o_sire = 1; e = T_.foe('stalker', 5, 0, { free: 1 }); e.hp = e.maxHp * 0.3; T_.cast('v_compel'); o.sired = e.ally === 1 && e.team === 0 && /^Sired/.test(e.name); o.immune = HM.immuneCompel(true); return o; });
  ok('o_compel: an Original compels vampires too, but not another Original, and not through vervain', r.vampire && r.original && r.verv && r.immune, r);
  ok('o_sire: one compelled below half health is theirs for good', r.sired, r);
  r = await ev(() => { T_.reset(); HM.S.skills.o_undying = 1; HM.pl.inv = 0; HM.S.flags.undyT = 0; HM.hit(null, HM.pl, { dmg: 1e9, mat: 'wood' }); return { dead: HM.pl.dead }; });
  const up = await h.until(() => !HM.pl.dead && HM.pl.hp > 1, null, 20000); r.shown = await ev(() => !document.getElementById('death').hidden); r.hp = await ev(() => +(HM.pl.hp / HM.P.maxHp).toFixed(2));
  ok('o_undying: an ordinary death only puts an Original down for a few seconds', r.dead && up && !r.shown && Math.abs(r.hp - 0.4) < 0.05, r);
  r = await ev(() => { T_.reset(); const e = T_.foe('casimir', 2, 0); HM.hit(HM.pl, e, { dmg: 1e12, mat: 'steel' }); HM.addCons('ashdagger', 1, true); const it = HM.actorInteract(e, 2); const label = it && it.label; if (it) it.act(); return { label, daggered: e.daggered === true, down: e.downT > 1e8, dead: e.dead, me: HM.pl.dead, left: HM.S.cons.ashdagger, gone: HM.S.flags.casimirGone }; });
  ok('ash dagger: holds a pure Original as dead while it stays in, and an Original may wield it', /ash dagger/.test(r.label || '') && r.daggered && r.down && !r.dead && !r.me && r.left === 0 && r.gone === 'dagger', r);
  await h.close();
}

async function witch(b) {
  console.log('\n# witch skills (a living Thorne witch)');
  const h = await open(b, { origin: 'witch', tag: 'witch', dir: SP }), { ev } = h; await prep(h); await ev(() => { HM.S.flags.witch = 1; HM.recalc(); T_.reset(); });
  let r = await ev(() => { T_.reset(); const v = T_.foe('feral', 4, 0, { free: 1 }), p = T_.foe('robber', 4, 2, { free: 1 }), sp = T_.foe('shade', 4, -2, { free: 1 }), o = T_.foe('casimir', 7, 0, { free: 1 }); const c = T_.cast('w_aneur'); return { c, v: v.fx.stun, p: p.fx.stun, s: sp.fx.stun || 0, o: o.fx.stun, vh: T_.pct(v), ph: T_.pct(p), sh: T_.pct(sp) }; });
  ok('w_aneur: drops a vampire hard, a person briefly, an Original for less; a spirit has no blood to burst', r.c && r.v >= 2.5 && r.p === 1 && r.s === 0 && r.sh === 1 && r.o > 0 && r.o < r.v && r.vh < r.ph, r);
  r = await ev(() => { T_.reset(); const c = T_.cast('w_ward'), w = HM.pl.buff.ward; HM.pl.inv = 0; const e = T_.foe('robber', 2, 0); const d = HM.hit(e, HM.pl, { dmg: 20 }); HM.pl.inv = 1e6; return { c, w: +(w / HM.P.maxHp).toFixed(2), d, left: HM.pl.buff.ward < w, hp: HM.pl.hp === HM.P.maxHp }; });
  ok('w_ward: a barrier worth 30% of her health takes the blow', r.c && r.w === 0.3 && r.d === 0 && r.left && r.hp, r);
  r = await ev(() => { T_.reset(); const v = T_.foe('feral', 6, 0, { free: 1 }), w = T_.foe('cultist', 6, 2, { free: 1 }); v.ai.aggro = w.ai.aggro = true; const c = T_.cast('w_cloak'); const o = { c, cloak: HM.pl.buff.cloak, v: v.ai.aggro, w: w.ai.aggro }; HM.hit(HM.pl, v, { dmg: 1, mat: 'wood', melee: 1 }); o.after = HM.pl.buff.cloak; return o; });
  ok('w_cloak: a vampire loses her, a witch does not; striking ends it', r.c && r.cloak === 6 && r.v === false && r.w === true && r.after === 0, r);
  r = await ev(() => { T_.reset(); const e = T_.foe('robber', 5, 0, { free: 1 }); e.maxHp = e.hp = 1e7; const x0 = e.x; const c = T_.cast('w_motus'); const o = { c, thrown: +(e.x - x0).toFixed(1), stun: e.fx.stun, hurt: e.hp < 1e7 }; T_.reset(); const k = T_.foe('warden', 5, 0, { free: 1 }); const kx = k.x; T_.cast('w_motus'); o.keeper = k.x === kx && k.hp < k.maxHp; return o; });
  ok('w_motus: throws an enemy eight metres without touching it; a keeper is too heavy', r.c && r.thrown > 6 && r.stun >= 1.5 && r.hurt && r.keeper, r);
  await ev(() => { T_.reset(); window.A = T_.foe('feral', 5, 0, { free: 1 }); window.B = T_.foe('feral', 12, 8, { free: 1 }); window.CAST = T_.cast('w_bound'); }); await h.run(0.2);
  r = await ev(() => ({ c: CAST, a: A.fx.root > 0, b: !(B.fx.root > 0), d: +Math.hypot(A.x - (HM.pl.x + 5), A.z - HM.pl.z).toFixed(1) })); ok('w_bound: whoever stood in the circle is held in it; whoever did not is not', r.c && r.a && r.b && r.d <= 5, r);
  r = await ev(() => { const o = {}; T_.reset(); let e = T_.foe('feral', 2, 0, { free: 1 }); o.refused = !T_.cast('w_desic') && HM.pl.hp === HM.P.maxHp && !e.dead; T_.reset(); e = T_.foe('feral', 2, 0); o.cast = T_.cast('w_desic'); o.dead = e.dead; o.cost = +((HM.P.maxHp - HM.pl.hp) / HM.P.maxHp).toFixed(2);
    T_.reset(); e = T_.foe('robber', 2, 0); o.person = !T_.cast('w_desic') && !e.dead; T_.reset(); e = T_.foe('casimir', 2, 0); window.CAS = e; o.orig = T_.cast('w_desic'); o.origDown = e.downed && !e.dead && e.desiccated === true && e.downT > 1e8; return o; });
  ok('w_desic: only on a vampire that is held or worn down; it stops the heart for good and costs her 35% of her own', r.refused && r.cast && r.dead && r.cost === 0.35 && r.person, r);
  ok('w_desic: an Original is not killed by it: he lies desiccated, and his line lives', r.orig && r.origDown && await ev(() => !(HM.S.flags.slain && HM.S.flags.slain.casimir)), r);
  /* a staff casts */
  await ev(() => { T_.reset(); HM.S.eq.weapon = HM.genItem(HM.S.lvl, { base: 'staff', rar: 1 }); HM.recalc(); window.A = T_.foe('robber', 8, 0); A.maxHp = A.hp = 1e7; HM.press('j'); }); const bolt = await h.until(() => A.hp < 1e7, null, 30000);
  r = await ev(() => ({ cls: HM.P.wcls, mat: HM.P.wmat })); ok('staff: in a witch\'s hands it throws bolts of magic', bolt && r.cls === 'staff' && r.mat === 'magic', r);
  /* the Hundred, at the altar, by way of the Use prompt */
  await ev(() => { T_.reset(); HM.S.clock = 12; HM.pl.x = -20; HM.pl.z = -243.5; window.SB = HM.P.spellBase; }); await h.run(0.2);
  r = await ev(() => { const it = HM.findInteract(); const label = it && it.label; if (it) it.act(); return { label }; }); ok('Coven Hollow: the altar can be touched', /altar/i.test(r.label || ''), r);
  ok('Coven Hollow: a living witch may channel the Hundred', await h.choose('Channel the Hundred')); await h.unpaused(); await ev(() => { HM.pl.inv = 0; });
  r = await ev(() => ({ on: HM.S.flags.hundredT > HM.absHours(), x: +(HM.P.spellBase / SB).toFixed(2), status: HM.status })); const bleed = await h.until(() => HM.pl.hp < HM.P.maxHp * 0.99, null, 30000);
  ok('Coven Hollow: a hundred dead witches lend a great deal of power, and take it out of her in blood', r.on && r.x >= 1.6 && bleed && r.status.includes('The Hundred'), r);
  await ev(() => { HM.pl.x = 10; HM.pl.z = 5; }); ok('Coven Hollow: they let go when she leaves', await h.until(() => !HM.S.flags.hundredT, null, 20000));
  /* the Sleeper's door */
  r = await ev(() => { const o = { witch: HM.S.origin === 'witch' && HM.canMagic() }; HM.enterArea('tomb', { depth: 20 }); const d = HM.area.door; o.keeper = HM.area.keeper; o.door = !!d; if (d) { o.label = d.label(); d.act(); o.open = d.open; } const sl = HM.actors.find(a => a.type === 'sleeper'); o.dormant = !!(sl && sl.dormant); HM.enterArea('world', { x: 10, z: 5 }); return o; });
  ok('floor 20: the Sleeper lies desiccated behind a sealed door, and it opens to a living Thorne witch', r.keeper === 'sleeper' && r.door && /sealed door/.test(r.label || '') && r.open === true && r.dormant, r);
  await h.close();
}

async function wolf(b) {
  console.log('\n# werewolf skills');
  const h = await open(b, { origin: 'wolf', tag: 'wolf', dir: SP }), { ev } = h; await prep(h, { clock: 12 });
  let r = await ev(() => { T_.reset(); HM.enterArea('tomb', { depth: 20 }); const d = HM.area.door, o = { door: !!d }; if (d) { d.act(); o.shut = d.open === false; HM.addCons('talisman', 1, true); d.act(); o.open = d.open === true; HM.S.cons.talisman = 0; } HM.enterArea('world', { x: 10, z: 5 }); return o; });
  ok('floor 20: the door stays shut to anyone else, until they carry the Thorne talisman', r.door && r.shut && r.open, r);
  await ev(() => { HM.triggerCurse(); T_.reset(); }); await h.adv(); await h.unpaused();
  r = await ev(() => { T_.reset(); const m0 = HM.P.meleeM; const no = T_.cast('l_rage'); HM.pl.rage = 50; const c = T_.cast('l_rage'); const o = { no, c, fury: HM.pl.buff.fury, rage: HM.pl.rage, up: +(HM.P.meleeM / m0).toFixed(2), status: HM.status }; HM.pl.inv = 0; const e = T_.foe('robber', 2, 0); const fx0 = HM.pl.fx.stun || 0; HM.pl.fx.stun = 0; HM.hit(e, HM.pl, { dmg: 1 }); HM.pl.inv = 1e6; return o; });
  ok('l_rage: needs 30 rage; then the anger is out: more damage, and the HUD shows it', !r.no && r.c && r.fury === 8 && r.rage === 20 && r.up > 1.2 && r.status.some(x => /^Fury/.test(x)), r);
  r = await ev(() => { T_.reset(); const e = T_.foe('robber', 8, 0, { free: 1 }); e.maxHp = e.hp = 1e7; const x0 = HM.pl.x; const c = T_.cast('l_pounce'); return { c, moved: +(HM.pl.x - x0).toFixed(1), flat: e.fx.stun, hurt: e.hp < 1e7 }; });
  ok('l_pounce: a leap onto an enemy that knocks it flat', r.c && r.moved > 5 && r.flat >= 1.5 && r.hurt, r);
  r = await ev(() => { T_.reset(); const p = T_.foe('robber', 5, 0, { free: 1 }), v = T_.foe('feral', 5, 2, { free: 1 }); HM.S.clock = 22; const c = T_.cast('l_howl'); const o = { c, runs: p.fearT > 0, vamp: !(v.fearT > 0), slow: v.fx.slow > 0, rage: HM.pl.rage, allies: HM.actors.filter(a => a.ally && !a.dead).length };
    T_.reset(); HM.S.skills.l_alpha = 1; T_.cast('l_howl'); o.pack = HM.actors.filter(a => a.ally && !a.dead && a.team === 0 && a.type === 'wolf').length; const w = T_.foe('wolf', 8, 0, { free: 1 }), pr = T_.foe('packrunner', 8, 2, { free: 1 }); o.calm = HM.actors.includes(w) && [w, pr].every(e => e.team === 1); return o; });
  ok('l_howl: people break and run, a vampire is only slowed, and rage rises', r.c && r.runs && r.vamp && r.slow && r.rage === 20 && r.allies === 0, r);
  ok('l_alpha: the howl calls two wolves to fight beside the alpha', r.pack === 2, r);
  /* wolf form */
  await ev(() => { T_.reset(); HM.S.day = 2; HM.S.clock = 21; }); ok('wolf form: the full moon brings it', await h.until(() => HM.pl.wolf === true, null, 20000));   // a werewolf is only ever a wolf under the full moon
  r = await ev(() => { T_.reset(); const o = { wolf: HM.pl.wolf, cls: HM.P.wcls, mat: HM.P.wmat }; HM.S.skills.h_gren = 1; o.gren = T_.cast('h_gren'); HM.S.eq.ranged = HM.genItem(HM.S.lvl, { base: 'xbow', rar: 1 }); HM.press('f'); o.shoot = HM.pl.act && HM.pl.act.type; HM.K.shift = true; return o; });
  await h.run(0.15);
  r.block = await ev(() => { const bl = HM.pl.block; HM.K.shift = false; return bl; });
  ok('wolf form: teeth only: no grenades, no crossbow, no blocking', r.wolf && r.cls === 'wolf' && r.mat === 'bite' && !r.gren && !r.shoot && !r.block, r);
  r = await ev(() => { T_.reset(); const v = T_.foe('feral', 2, 0); v.maxHp = v.hp = 1e7; HM.hit(HM.pl, v, { dmg: 100, mat: 'bite', melee: 1 }); const o = { venom: v.fx.venom > 0, pv: HM.P.venom }; const c = T_.foe('casimir', 2, 1.5); HM.hit(HM.pl, c, { dmg: 100, mat: 'bite', melee: 1 }); o.orig = !(c.fx.venom > 0) && c.fx.sick > 0; const hy = T_.foe('hybrid', 2, -1.5); HM.hit(HM.pl, hy, { dmg: 100, mat: 'bite', melee: 1 }); o.hybrid = !(hy.fx.venom > 0); const p = T_.foe('robber', 3, 3); HM.hit(HM.pl, p, { dmg: 1, mat: 'bite', melee: 1 }); o.person = !(p.fx.venom > 0); return o; });
  ok('wolf form: the bite is venom to a vampire, a fever to an Original, nothing to a hybrid or a person', r.pv > 0 && r.venom && r.orig && r.hybrid && r.person, r);
  await ev(() => { T_.reset(); HM.RT.dlgT = 0; window.A = T_.foe('robber', 6, 0); A.maxHp = A.hp = 1e7; window.X0 = HM.pl.x; HM.press('k'); }); await h.until(() => !HM.pl.act, null, 30000);
  r = await ev(() => ({ moved: +(HM.pl.x - X0).toFixed(1), hurt: A.hp < 1e7 })); ok('wolf form: the heavy attack is a pounce', r.moved > 3 && r.hurt, r);
  await ev(() => { HM.S.day = 3; HM.S.clock = 12; }); await h.until(() => HM.pl.wolf === false, null, 20000); await ev(() => { T_.reset(); });
  r = await ev(() => { HM.addCons('wolfsbane', 1, true); HM.useCons('wolfsbane'); const o = { burned: HM.pl.fx.wolfsbane > 0, healM: HM.P.healM, coat: HM.pl.buff.coatW > 0 }; HM.S.skills.l_rage = 1; HM.pl.rage = 50; o.locked = !T_.cast('l_rage'); HM.pl.fx.wolfsbane = 0; HM.recalc(); return o; });
  ok('wolfsbane: burns a werewolf who handles it, stops the healing and locks the wolf\'s skills', r.burned && r.healM === 0 && !r.coat && r.locked, r);
  /* the cellar */
  await ev(() => { T_.reset(); HM.pl.inv = 0; HM.S.day = 10; HM.S.clock = 15; HM.pl.x = 159.5; HM.pl.z = -209.5; window.M0 = HM.S.flags.moons || 0; }); await h.run(0.2);
  r = await ev(() => { const it = HM.findInteract(); const label = it && it.label; if (it) it.act(); return { label, tonight: HM.fullTonight() }; }); ok('Lockwood cellar: on the day of the full moon it offers the chains', /Chain yourself/.test(r.label || '') && r.tonight, r);
  ok('Lockwood cellar: locking the chains is a choice', await h.choose('Lock the chains.'));
  ok('Lockwood cellar: the night passes behind the door', await h.until(() => !HM.RT.blk && HM.S.day === 11 && HM.S.clock >= 6.5 && HM.S.clock < 8, null, 30000), await ev(() => ({ day: HM.S.day, clock: HM.S.clock, blk: HM.RT.blk })));
  r = await ev(() => ({ wolf: HM.pl.wolf, moons: (HM.S.flags.moons || 0) - M0, chained: HM.S.flags.chained, dead: HM.pl.dead })); ok('Lockwood cellar: nobody is hurt, and it counts as a moon survived', !r.wolf && r.moons === 1 && !r.dead, r);
  await h.close();
}

async function town(b) {
  console.log('\n# the town: the board, the armoury, the road, a bed, an invitation, the Cure');
  const h = await open(b, { origin: 'human', tag: 'town', dir: SP }), { ev, p } = h; await prep(h, { clock: 12 });
  await ev(() => { T_.reset(); HM.pl.inv = 0; HM.S.done.q_bump = 1; HM.pl.x = 8.5; HM.pl.z = -27.6; }); await h.run(0.2);
  let r = await ev(() => { const it = HM.findInteract(); const label = it && it.label; if (it) it.act(); return { label, menu: HM.RT.menu, n: HM.S.bounties.length, bad: HM.S.bounties.filter(q => !q.title || !q.text || /undefined/.test(q.title + q.text)).length }; });
  ok('notice board: the Council has posted work', /notice board/.test(r.label || '') && r.menu === 'bounty' && r.n > 0 && r.bad === 0, r);
  r = await ev(() => { const g0 = HM.S.gold; document.querySelector('[data-bounty]').click(); const q = HM.S.bounties.find(x => x.acc); const acc = !!q; q.prog = q.n; q.done = true; document.querySelector(`[data-bounty="${q.id}"]`).click(); return { acc, paid: HM.S.gold - g0, left: HM.S.bounties.includes(q) }; });
  ok('notice board: a bounty is accepted, fulfilled and paid', r.acc && r.paid > 0 && !r.left, r); await p.keyboard.press('Escape'); await h.unpaused();
  await ev(() => { HM.S.gold = 99999; HM.S.cons.scrap = 99; HM.addItem(HM.genItem(10, { base: 'sword', rar: 1 }), true); const rg = HM.mkUniq('daylight', HM.S.lvl); HM.S.inv.push(rg); window.RING = rg.id; });
  await h.talk('hale'); await h.choose('Trade.');
  r = await ev(() => { const sw = HM.S.inv.find(i => i.base === 'sword'); document.querySelector(`#mbody .item[data-item="${sw.id}"]`).click(); document.querySelector('[data-act="forge"]').click(); const o = { up: sw.up, n0: HM.S.inv.length }; document.querySelector('[data-act="sell"]').click(); o.sold = HM.S.inv.length === o.n0 - 1;
    document.querySelector(`#mbody .item[data-item="${RING}"]`).click(); o.ringSell = !!document.querySelector('[data-act="sell"]'); o.bound = /bound/i.test(document.querySelector('#mbody .detail').textContent); return o; });
  ok('armoury: gear is reforged and sold; a bound daylight ring cannot be', r.up === 1 && r.sold && !r.ringSell && r.bound, r); await p.keyboard.press('Escape'); await h.unpaused();
  await ev(() => { HM.S.inv = HM.S.inv.filter(i => i.uniq !== 'daylight'); HM.recalc(); });
  r = await ev(() => ({ back: HM.S.inv.some(i => i.uniq === 'daylight') })); ok('daylight ring: bound means bound: however it leaves the pack, it comes back', r.back, r);
  /* the road */
  await ev(() => { HM.S.disc.farm = 1; HM.pl.x = -5; HM.pl.z = 23; HM.RT.combatT = 0; }); await h.run(0.2); await p.keyboard.press('m'); await h.until(() => HM.RT.menu === 'map', null, 5000);
  r = await ev(() => { const bt = document.querySelector('[data-poi="farm"]'); const o = { there: !!bt, enabled: bt && !bt.disabled }; if (bt) bt.click(); return o; });
  ok('map: standing at a signpost, a found waypoint can be travelled to', r.there && r.enabled && await h.until(() => !HM.RT.blk && Math.hypot(HM.pl.x - 15.5, HM.pl.z - 198) < 6, null, 20000), await ev(() => ({ x: HM.pl.x, z: HM.pl.z })));
  /* a bed */
  await ev(() => { HM.pl.x = -38.4; HM.pl.z = -7; HM.S.clock = 23; window.D0 = HM.S.day; HM.pl.hp = HM.P.maxHp * 0.4; }); await h.run(0.2);
  r = await ev(() => { const it = HM.findInteract(); const label = it && it.label; if (it) it.act(); return { label }; }); ok('boarding house: the room offers a bed', /Your room/.test(r.label || ''), r); await h.choose('Sleep until morning.');
  ok('boarding house: sleeping until morning', await h.until(() => !HM.RT.blk && HM.S.day === D0 + 1 && Math.abs(HM.S.clock - 8) < 0.5, null, 30000), await ev(() => ({ day: HM.S.day, clock: HM.S.clock })));
  ok('boarding house: rested', await ev(() => HM.pl.hp === HM.P.maxHp));
  /* dead, and not asked in */
  await h.unpaused(); await ev(() => { HM.S.clock = 22; }); await h.turn(); await ev(() => { HM.S.clock = 22; HM.pl.x = -38.4; HM.pl.z = -7; HM.S.skills.v_pred = 2; HM.recalc(); }); await h.run(0.2);
  r = await ev(() => { const it = HM.findInteract(); const label = it && it.label; return { label, invited: HM.S.flags.invited || 0 }; }); ok('invitation: a vampire cannot cross the sill of a house they have not been asked into', /not been asked in/.test(r.label || '') && !r.invited, r);
  ok('invitation: Mrs. Pruitt is on the porch', await h.talk('pruitt')); await h.adv(); await h.unpaused();
  r = await ev(() => { HM.pl.x = -38.4; HM.pl.z = -7; const it = HM.findInteract(); return { invited: HM.S.flags.invited, label: it && it.label }; }); ok('invitation: asked in once, the room is theirs again', r.invited === 1 && /rest/.test(r.label || ''), r);
  /* the Cure */
  await h.square(); await ev(() => { HM.addCons('cure', 1, true); window.SP0 = HM.S.sp; }); await p.keyboard.press('Tab'); await h.until(() => !!HM.RT.menu, null, 5000); await ev(() => { document.querySelector('[data-tab="inv"]').click(); document.querySelector('[data-cons="cure"]').click(); });
  ok('the Cure: it asks before it is drunk, and can be put back', (await h.until(() => !HM.RT.menu && !!HM.dq, null, 5000)) && (await h.choose('Not yet.')) && await ev(() => HM.S.species === 'vampire' && HM.S.cons.cure === 1));
  await ev(() => { HM.useCons('cure'); }); await h.choose('Drink it.');
  ok('the Cure: taken from the pack', await h.until(() => !HM.RT.blk && HM.S.species === 'human' && !!HM.S.flags.cured, null, 30000));
  r = await ev(() => ({ species: HM.S.species, cured: HM.S.flags.cured, sp: HM.S.sp - SP0, v: Object.keys(HM.S.skills).filter(k => k[0] === 'v'), tree: HM.treeOpen('vampire'), sire: HM.S.sire, left: HM.S.cons.cure || 0 }));
  ok('the Cure: human again, the vampire\'s skills refunded', r.species === 'human' && r.cured === 1 && r.sp === 2 && r.v.length === 0 && !r.tree && r.sire === null && r.left === 0, r);
  await h.unpaused(); r = await ev(() => { HM.addCons('vblood', 1, true); HM.useCons('vblood'); return { flag: HM.S.flags.vblood || 0, tr: HM.beginTransition('vampire', 'test') }; });
  ok('the Cure: whoever takes it can never be turned again', !r.flag && r.tr === false, r);
  await ev(() => { HM.S.gold = 1000; }); await h.die(); ok('the Cure: after it, death is the ordinary kind', await h.until(() => HM.pl.dead && !document.getElementById('death').hidden && !HM.S.transition, null, 20000));
  await h.close();
}

(async () => { const b = await launch(); await sections(b, [['hunter', hunter], ['vampire', vampire], ['witch', witch], ['wolf', wolf], ['town', town]], process.argv[3]); await finish(b); })();

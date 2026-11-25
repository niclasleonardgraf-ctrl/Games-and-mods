/* Hollow Moon — boot, character creation, input routing, the frame loop. */
const LOOKS = { skin: [0xe6cdb8, 0xd3a48a, 0xa5714e, 0x70492f], hair: [0x15100e, 0x4a2f1a, 0x9a7a44, 0x8a2f1a, 0xc0b4a0, 0x2a3a5a], coat: [0x231a22, 0x3a2418, 0x1c2a3a, 0x40181c, 0x2a3324, 0x4a4a52] };
let lookI = { skin: 0, hair: 0, coat: 0, long: 0 }, originSel = 'human';   // the bloodline card selected on the title screen
const curLook = () => ({ skin: LOOKS.skin[lookI.skin], hair: LOOKS.hair[lookI.hair], coat: LOOKS.coat[lookI.coat], long: !!lookI.long });
keyHandlers.push(k => {
  audioInit();
  if (dq) { if (k === 'e' || k === 'enter' || k === ' ') advDlg(); else if (k.length === 1 && '123456'.includes(k)) { if (performance.now() - (dq.at || 0) > 350) pickChoice(+k - 1); } return true; }   // while someone is talking, no key is a blow
  if (!RT.started || RT.blk) return true;
  if (RT.menu) { if (k === 'tab' || k === 'escape' || k === 'i') closeMenu(); else if (k === 'm' && RT.menu !== 'vendor') { RT.menu = 'map'; renderMenu(); } return true; }
  if (k === 'tab' || k === 'i') { openMenu(); return true; } if (k === 'm') { openMenu('map'); return true; } if (k === 'escape') { openMenu('system'); return true; }
  if (RT.paused || !pl || pl.dead) return true;
  const since = performance.now() - (RT.dlgT || 0), act = since > 300;   // the press that closed a dialogue is not also an attack, a shot, a spell or another question
  if (k === 'mouse0' || k === 'j') { if (act) tryAttack(); } else if (k === 'k') { if (act) tryHeavy(); } else if (k === ' ') tryDodge(); else if (k === 'f') { if (act) tryShoot(); } else if (k === 'r') quickHeal(); else if (k === 'g') toggleShift();
  else if (k === 'e') { if (since < 450) return true; const it = findInteract(); if (it) it.act(); } else if (k.length === 1 && '1234'.includes(k)) { if (act) castSkill(+k - 1); }
  return true;
});
let lastT = 0, saveT = 40, slowT = 0, frame = 0;
function loop(ts) {
  requestAnimationFrame(loop); const dt = Math.min(0.05, (ts - lastT) / 1000 || 0.016); lastT = ts; frame++;
  if (!pl || !RT.area) return; RT.paused = !!(dq || RT.menu || !RT.started || RT.blk || !$('death').hidden); updMouseWorld();
  if (!RT.paused) {
    RT.time += dt; let g = dt; if (RT.hitstop > 0) { RT.hitstop -= dt; g = dt * 0.05; }
    tickClock(g); updPlayer(g);
    for (let i = actors.length - 1; i >= 0; i--) { const a = actors[i]; if (a.kind === 'enemy') { if (!a.dead) updEnemy(a, g); } else if (a.kind === 'npc') updNpc(a, g); if (a.rig.g.visible) pose(a, g); if (a.gone) removeActor(a); }
    pose(pl, g); updShots(g); updHazards(g); updDrops(g); updSpawns(g); updDecals(g); updParticles(dt);
    slowT -= dt; if (slowT <= 0) { slowT = 2; recalc(); } saveT -= dt; if (saveT <= 0 && RT.combatT <= 0) { saveT = 40; save(); }
  } else if (!RT.started) { pl.rot += dt * 0.5; pose(pl, dt); }
  updSky(dt); updLights(); if (frame % 10 === 0) updChunks(); updCam(dt, !RT.started);
  if (RT.started) { updHud(dt); drawOverlay(RT.paused ? 0 : dt); }
  renderFrame();
}
/* the bus stop. Two lines, and the second is the one thing each bloodline arrives knowing about itself. Everyone steps off the bus human. */
const ARRIVE = {
  human: "Mystic Falls, Virginia. Your aunt Elspeth's letter said: find Marnie at the Grill, north side of the square. It also said: be indoors by dark. It did not say why.",
  witch: "Mystic Falls, Virginia. Your aunt Elspeth's letter said: find Marnie at the Grill, north side of the square, and be indoors by dark. It also said your mother was a Thorne, and that in this town the name still means something.",
  siphoner: "Mystic Falls, Virginia. Your aunt Elspeth's letter said: find Marnie at the Grill, north side of the square, and be indoors by dark. It did not mention the coven that put you out, or what your hands take from anything that has magic in it.",
  wolf: "Mystic Falls, Virginia. Your aunt Elspeth's letter said: find Marnie at the Grill, north side of the square, and be indoors by dark. It also said, underlined twice: your father was a Lockwood, so whatever happens here, do not kill anyone.",
};
function begin(fresh, data) {
  audioInit(); if (fresh) { newGame(curLook(), originSel); if (typeof dropSnap === 'function') { dropSnap('hollowmoon.preturn'); dropSnap('hollowmoon.preboss'); } } else if (applySave(data) === false) { $('continue').hidden = true; return; }
  mkPlayer(S.pos.x, S.pos.z); const inTomb = S.area === 'tomb'; enterArea('world', inTomb ? { x: -130, z: -164 } : { x: S.pos.x, z: S.pos.z });
  RT.started = true; $('title').hidden = true; $('hud').hidden = false; genBounties();
  if (fresh) { startQuest('q_arrive'); diary('arrive'); say([['', 'The bus lets you off on Main Street at half past four and does not wait.'], ['', ARRIVE[S.origin] || ARRIVE.human]], null, () => { toast(RT.touch ? 'Left thumb moves. ATTACK strikes; hold it for a heavy blow.' : 'WASD to move. Left mouse attacks; hold it for a heavy blow.'); setTimeout(() => toast(RT.touch ? 'DODGE rolls through attacks. Hold BLOCK, or tap it just in time to parry.' : 'Space dodges. Right mouse blocks; tap it just in time to parry.'), 5400); setTimeout(() => toast(RT.touch ? 'USE talks and opens. The top-right button opens your pack, skills and codex.' : 'E talks and opens. Tab opens your pack, skills, codex and map.'), 10800); }); }
  else { toast(`Day ${S.day}. ${MOON[moonPhase()]}. Welcome back.`); const tr = S.transition; if (tr) setTimeout(() => toast(`You are still in transition. ${tr.to === 'hybrid' ? "The doppelgänger's blood" : 'Human blood'} within ${Math.max(1, Math.ceil(tr.until - absHours()))} hours, or you die the ordinary way.`), 5400); }
}
function b64buf(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }
let bestSave = null;
function offerSave(o) { if (!o || (o.v !== 2 && o.v !== 3) || RT.started) return; if (!bestSave || (o.ts || 0) > (bestSave.ts || 0)) bestSave = o; const c = $('continue'); c.hidden = false; c.textContent = `Continue · level ${bestSave.lvl} ${kindName(bestSave)}, day ${bestSave.day}`; }
/* character creation, part two: the four bloodline cards. The choice is what you were born with; nobody starts as anything but human. */
function originCards() {
  const ob = $('origins'); if (!ob || typeof ORIGINS !== 'object') return;
  ob.innerHTML = Object.keys(ORIGINS).map(k => `<button type="button" class="origin${k === originSel ? ' on' : ''}" data-origin="${k}" aria-pressed="${k === originSel}"><b>${H(ORIGINS[k].n)}</b><span>${H(ORIGINS[k].d)}</span></button>`).join('');
  ob.onclick = e => { const b = e.target.closest('[data-origin]'); if (!b || !ORIGINS[b.dataset.origin]) return; originSel = b.dataset.origin; ob.querySelectorAll('.origin').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); sfx('ui'); };
}
function boot() {
  let q = null; try { q = localStorage.getItem('hollowmoon.q'); } catch (e) { } RT.quality = q || (matchMedia('(pointer:coarse)').matches ? 'med' : 'high'); setQuality(RT.quality);
  new T.GLTFLoader().parse(b64buf(window.HM_MODELS), '', g => {
    for (const c of g.scene.children.slice()) MODELS[c.name] = c;
    newGame(curLook(), 'human'); mkPlayer(-4, 12); enterArea('world', { x: -4, z: 12 }); S.clock = 21.5; pl.rot = 0.4; originCards();
    const b = $('begin'); b.disabled = false; b.textContent = 'New game'; b.onclick = () => { if (bestSave && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Start over? Press again'; return; } begin(true); };
    $('continue').onclick = () => begin(false, bestSave); $('respawn').onclick = respawn; $('mclose').onclick = closeMenu; $('tMenu').onclick = () => RT.menu ? closeMenu() : openMenu();
    document.querySelectorAll('[data-look]').forEach(bt => bt.onclick = () => { const k = bt.dataset.look; lookI[k] = (lookI[k] + 1) % (k === 'long' ? 2 : LOOKS[k].length); S.look = curLook(); const r = pl.rot; mkPlayer(pl.x, pl.z); pl.rot = pl.vr = r; sfx('ui'); });
    offerSave(readLocal()); initCloud(offerSave);
    requestAnimationFrame(loop);
  }, e => { $('begin').textContent = 'The models failed to load'; console.error(e); });
}
addEventListener('visibilitychange', () => { if (document.hidden && RT.started) save(true); });
try { if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => { if (RT.started) save(true); return {}; }); } catch (e) { }
/* debug and test handle. The species calls are wrapped so that a missing one fails when it is called, not when the page loads. */
window.HM = { get S() { return S; }, get pl() { return pl; }, get P() { return P; }, get RT() { return RT; }, actors, press, K, spawnEnemy, enterArea, genItem, addItem, gainXp, startQuest, qEvent, mkUniq, recalc, save, hit, drops, get area() { return RT.area; }, get info() { return ren.info.render; },
  get dq() { return dq; }, get prompt() { return curInt; }, get origin() { return S.origin; }, get species() { return S.species; }, get kind() { return kindName(); }, get wolf() { return !!(pl && pl.wolf); }, get status() { return pl ? hudStatus() : []; }, get originSel() { return originSel; }, set originSel(v) { if (ORIGINS[v]) { originSel = v; originCards(); } },
  begin: (fresh, data) => begin(fresh, data), newGame: (look, origin) => newGame(look, origin), findInteract: () => findInteract(), openMenu: t => openMenu(t), closeMenu: () => closeMenu(), say: (l, c, d) => say(l, c, d),
  setForm: (wolf, willing) => setForm(wolf, willing), toggleShift: () => toggleShift(), canShift: () => canShift(), triggerCurse: () => triggerCurse(), beginTransition: (to, how) => beginTransition(to, how), completeTransition: () => completeTransition(), failTransition: why => failTransition(why),
  becomeOriginal: () => becomeOriginal(), cureVampire: () => cureVampire(), unlinkSire: () => unlinkSire(), envenom: src => envenom(src), cureVenom: how => cureVenom(how), hunterCurse: () => hunterCurse(), despellRing: on => despellRing(on), playerDeath: (src, o) => playerDeath(src, o), respawn: () => respawn(),
  isVamp: () => isVamp(), isWolf: () => isWolf(), isHybrid: () => isHybrid(), inTransition: () => inTransition(), canMagic: () => canMagic(), treeOpen: t => treeOpen(t), treePts: t => treePts(t), sk: id => sk(id), hasUniq: k => hasUniq(k), daylightSafe: () => daylightSafe(), immuneCompel: o => immuneCompel(o), moonPower: () => moonPower(), absHours: () => absHours(),
  isNight: () => isNight(), fullMoon: () => fullMoon(), moonPhase: () => moonPhase(), codex: id => codex(id), learn: id => learn(id), useCons: k => useCons(k), addCons: (k, n, quiet) => addCons(k, n, quiet), castSkill: i => castSkill(i), actorInteract: (a, d) => actorInteract(a, d), spawnNpc: o => spawnNpc(o) };
boot();

/* Hollow Moon — the story in the real engine: every quest step that is a conversation is held, as each bloodline, and then everyone in the county is talked to
   at random for a while, taking whatever choices come up (trading, sleeping, turning, bargaining). It is looking for page errors and dead ends.
   node tools/tests/story.js <dir> [human,witch,siphoner,wolf] */
const { launch, open, ok, note, finish, sections } = require('./_lib');
const WALK = +(process.env.HM_WALK || 90);
/* let whatever was started run out: advance lines, take a choice (the first, or a random one), close menus, wait out blackouts, get up if dead */
const settle = (h, random) => h.p.evaluate(async random => { const nap = ms => new Promise(r => setTimeout(r, ms));
  for (let n = 0; n < 400; n++) { if (HM.RT.blk) { await nap(250); continue; }
    if (HM.dq) { const last = HM.dq.i === HM.dq.lines.length - 1; if (HM.dq.choices && last) { const c = [...document.querySelectorAll('#dch .choice')]; if (!c.length) return 'a question with no answers'; c[random ? Math.floor(Math.random() * c.length) : 0].click(); } else document.getElementById('dlg').click(); continue; }
    if (HM.RT.menu) { HM.closeMenu(); continue; } if (!document.getElementById('death').hidden) { document.getElementById('respawn').click(); await nap(400); continue; }
    await nap(60); if (!HM.dq && !HM.RT.blk && !HM.RT.menu) return 'ok'; } return 'never settled'; }, !!random);
const stock = h => h.ev(() => { const S = HM.S; S.gold = 99999; for (const k of ['hblood', 'dblood', 'oakwood', 'kyanite', 'lapisq', 'locket', 'talisman', 'ashdagger', 'vervain', 'wolfsbane', 'bloodbag', 'vblood', 'cure', 'moonstone']) S.cons[k] = Math.max(S.cons[k] || 0, 3); S.inv = S.inv.slice(0, 20); HM.pl.inv = 1e6; HM.pl.hp = HM.P.maxHp; for (const a of HM.actors.slice()) if (a.kind === 'enemy') { a.dead = true; a.gone = true; } });

function walk(origin) { return async b => {
  console.log('\n# ' + origin + ': the quest conversations, then a random walk round the county');
  const h = await open(b, { origin, tag: 'story-' + origin }), { ev } = h; await ev(() => { HM.gainXp(250000); HM.S.clock = 22; });
  const steps = await ev(() => { const o = []; const Q = HM.S.quests; /* the quest table is not on the handle: read it through the engine */ return o; });
  const talks = [['q_arrive', 0, 'marnie'], ['q_arrive', 1, 'odette'], ['q_arrive', 2, 'marnie'], ['q_bump', 2, 'hale'], ['q_council', 1, 'hale'], ['q_witch', 0, 'odette'], ['q_witch', 3, 'odette'], ['q_bridge', 1, 'ambrose'], ['q_warden', 1, 'odette'], ['q_oak', 0, 'hale'], ['q_oak', 2, 'hale'], ['q_deeper', 0, 'odette'],
    ['q_daylight', 0, 'odette'], ['q_daylight', 2, 'odette'], ['q_locket', 1, 'pruitt'], ['q_farm', 1, 'abel'], ['q_wren', 1, 'wren'], ['q_bex', 1, 'bex'], ['q_quarry', 1, 'hale'], ['q_hollow', 1, 'odette'], ['q_unlink', 1, 'odette'], ['q_moonring', 1, 'wren'], ['q_moonring', 2, 'odette'], ['q_hybrid', 1, 'elise'], ['q_five', 2, 'odette']];
  const main = ['q_arrive', 'q_bump', 'q_council', 'q_witch', 'q_bridge', 'q_warden', 'q_oak', 'q_deeper'], moved = [], stayed = []; let bad = null;
  for (const [q, step, who] of talks) { await stock(h); const r = await ev(([q, step, who]) => { const S = HM.S; delete S.done[q]; S.quests = { [q]: { step, n: 0 } }; S.clock = 22; const n = HM.actors.find(a => a.npc && a.npc.id === who); if (!n) return 'nobody called ' + who; n.npc.talk(n); return 'ok'; }, [q, step, who]);
    if (r !== 'ok') { bad = bad || `${q}:${step} ${r}`; continue; } const st = await settle(h, false); if (st !== 'ok') bad = bad || `${q}:${step} ${st}`;
    (await ev(([q, step]) => { const S = HM.S; return !!S.done[q] || (S.quests[q] && S.quests[q].step > step); }, [q, step]) ? moved : stayed).push(q + ':' + step); }
  ok(origin + ': every quest conversation can be held and ends', !bad, bad);
  ok(origin + ': the main line\'s conversations all move the story on', main.every(q => !stayed.some(s => s.startsWith(q + ':'))), stayed); if (stayed.length) note('side conversations that wanted something more first:', stayed.join(' '));
  /* the random walk: whoever is in the county, whatever they offer */
  await ev(() => { HM.S.quests = {}; }); let stuck = null; const seen = {};
  for (let i = 0; i < WALK && !stuck; i++) { if (i % 15 === 0) await stock(h);
    const r = await ev(i => { const S = HM.S; if (i % 7 === 3) S.clock = S.clock >= 20 || S.clock < 6 ? 12 : 22; const ns = HM.actors.filter(a => a.npc && a.npc.talk && !a.dead); const n = ns[Math.floor(Math.random() * ns.length)]; HM.pl.x = n.x + 1; HM.pl.z = n.z + 1; n.npc.talk(n); return n.npc.id + ' as ' + HM.kind; }, i);
    seen[r] = (seen[r] || 0) + 1; const st = await settle(h, true); if (st !== 'ok') stuck = r + ': ' + st; }
  ok(origin + ': ' + WALK + ' conversations at random, none of them a dead end', !stuck, stuck);
  const s = await ev(() => ({ kind: HM.kind, species: HM.S.species, origin: HM.S.origin, day: HM.S.day, quests: Object.keys(HM.S.quests), done: Object.keys(HM.S.done).length, flags: Object.keys(HM.S.flags).length, dead: HM.pl.dead, codex: Object.keys(HM.S.codex).length, diary: HM.S.diary.length }));
  note('ended as', s); note('spoke to', [...new Set(Object.keys(seen).map(k => k.split(' as ')[0]))].join(' ') + ' · as ' + [...new Set(Object.keys(seen).map(k => k.split(' as ')[1]))].join(', '));
  ok(origin + ': the bloodline never changed, and the player is still on their feet', s.origin === origin && !s.dead, s);
  await h.close(); }; }

(async () => { const b = await launch(); await sections(b, ['human', 'witch', 'siphoner', 'wolf'].map(o => [o, walk(o)]), process.argv[3]); await finish(b); })();

/* Hollow Moon — data: origins, items, affixes, skills, enemies, zones. Balance lives here. Canon rules: see SPEC.md. */
const RAR = [{ n: 'Common', c: '#b8b2a6', m: 1, aff: 0 }, { n: 'Uncommon', c: '#6fbf73', m: 1.12, aff: 1 }, { n: 'Rare', c: '#5b9cf0', m: 1.26, aff: 2 }, { n: 'Epic', c: '#b678f0', m: 1.42, aff: 3 }, { n: 'Legendary', c: '#f0a13c', m: 1.62, aff: 4 }, { n: 'Relic', c: '#e2334a', m: 1.8, aff: 0 }];
const lvlScale = l => (1 + 0.14 * (l - 1)) * Math.pow(1.028, l - 1);          // item + enemy damage curve
const hpScale = l => (1 + 0.2 * (l - 1)) * Math.pow(1.04, l - 1);             // enemy health curve
const xpNeed = l => Math.floor(70 * Math.pow(l, 1.65));

/* ---------------- bloodlines: chosen at character creation, never changed. start = the kit newGame hands out ---------------- */
const ORIGINS = {
  human: { n: 'Human', d: "An ordinary Fell, with nothing in the blood but the family name. The Brotherhood of the Five takes its hunters from people like you, and a Founder's Ring only works on them.", start: { weapon: 'bat', armor: 'jacket', cons: { draught: 2, burger: 1, coffee: 1 } } },
  witch: { n: 'Witch', d: "Thorne blood on your mother's side, the town's old witch line. The craft is asleep in you until a Thorne wakes it, and it is gone for good if you ever become a vampire.", start: { weapon: 'bat', armor: 'coat', cons: { draught: 2, burger: 1, sage: 2 } } },
  siphoner: { n: 'Siphoner', d: 'Born to a coven that calls your kind an abomination. You make no magic of your own: you take it by touch from anything that has some, and you would keep that even as a vampire.', start: { weapon: 'dagger', armor: 'coat', cons: { draught: 2, burger: 1 }, skills: { w_siphon: 1 } } },
  wolf: { n: 'Werewolf gene', d: "Lockwood blood on your father's side: you carry the werewolf curse, asleep. It wakes the first time you take a human life and never sleeps again, so until you choose otherwise you only knock people out.", start: { weapon: 'bat', armor: 'jacket', cons: { draught: 1, burger: 3 } } },
};

/* silver does nothing to anyone in this town: there are no silver weapons. mat is the damage type (see WEAK).
   'staff' and 'robe' are old ids, kept so saves and vendor lists still work: no witch here carries a staff or wears a robe. They are a walking stick and a dark coat. */
const BASES = {
  stake: { n: 'Oak Stake', slot: 'weapon', cls: 'fast', dmg: 8, mat: 'wood', model: 'wStake' }, dagger: { n: 'Hunting Knife', slot: 'weapon', cls: 'fast', dmg: 9, mat: 'steel', model: 'wDagger' },
  stiletto: { n: 'Stiletto', slot: 'weapon', cls: 'fast', dmg: 9.6, mat: 'steel', model: 'wDagger', min: 5 }, bat: { n: 'Ash Bat', slot: 'weapon', cls: 'med', dmg: 12, mat: 'wood', model: 'wBat' },
  sword: { n: 'Sabre', slot: 'weapon', cls: 'med', dmg: 13, mat: 'steel', model: 'wSword', min: 3 }, cavalry: { n: 'Cavalry Sabre', slot: 'weapon', cls: 'med', dmg: 13.8, mat: 'steel', model: 'wSword', min: 8 },
  axe: { n: "Woodsman's Axe", slot: 'weapon', cls: 'slow', dmg: 18, mat: 'steel', model: 'wAxe', min: 2 }, great: { n: 'Greatsword', slot: 'weapon', cls: 'slow', dmg: 21, mat: 'steel', model: 'wGreat', min: 9 },
  maul: { n: 'Ironwood Maul', slot: 'weapon', cls: 'slow', dmg: 20, mat: 'wood', model: 'wBat', min: 7 }, staff: { n: 'Hawthorn Walking Stick', slot: 'weapon', cls: 'staff', dmg: 10, mat: 'magic', model: 'wStaff' },
  xbow: { n: 'Crossbow', slot: 'ranged', dmg: 17, cd: 1.3, mat: 'wood', model: 'crossbow', pspd: 36 }, revolver: { n: 'Revolver', slot: 'ranged', dmg: 11, cd: 0.62, mat: 'wood', model: 'revolver', pspd: 52, min: 5 },
  knives: { n: 'Throwing Knives', slot: 'ranged', dmg: 7.5, cd: 0.38, mat: 'steel', model: 'wDagger', pspd: 30 },
  jacket: { n: 'Leather Jacket', slot: 'armor', def: 7, hp: 12 }, coat: { n: 'Long Coat', slot: 'armor', def: 5, hp: 8, st: 12 }, vest: { n: "Hunter's Vest", slot: 'armor', def: 10, hp: 18, min: 4 },
  robe: { n: 'Long Dark Coat', slot: 'armor', def: 4, hp: 6, fo: 22 }, mail: { n: 'Council Mail', slot: 'armor', def: 15, hp: 26, min: 9 },
  ring: { n: 'Ring', slot: 'ring' }, signet: { n: 'Signet', slot: 'ring' }, band: { n: 'Iron Band', slot: 'ring' }, amulet: { n: 'Amulet', slot: 'amulet' }, locket: { n: 'Locket', slot: 'amulet' }, talisman: { n: 'Talisman', slot: 'amulet' },
};
/* melee move sets: [duration, damage mult] per combo hit; heavy attack. The player's current set is P.wcls (recalc): 'wolf' in wolf form, and a staff in hands
   that hold no magic swings like 'med'. wolf = bite, bite, maul; heavy = pounce (a leap of up to 8 m onto the aim point). Wolf hits are mat 'bite'. */
const CLS = {
  fast: { hits: [[0.24, 0.8], [0.24, 0.8], [0.32, 1.25]], range: 2.5, arc: 1.5, heavy: { kind: 'lunge', dur: 0.5, mult: 2.1, st: 22 }, poise: 12, st: 0 },
  med: { hits: [[0.34, 1], [0.34, 1], [0.46, 1.5]], range: 3.0, arc: 2.1, heavy: { kind: 'over', dur: 0.7, mult: 2.5, st: 28 }, poise: 22, st: 0 },
  slow: { hits: [[0.48, 1.3], [0.48, 1.3], [0.62, 1.9]], range: 3.5, arc: 2.6, heavy: { kind: 'spin', dur: 0.8, mult: 2.2, st: 34 }, poise: 38, st: 0 },
  staff: { hits: [[0.36, 1], [0.36, 1], [0.48, 1.4]], range: 3.0, arc: 2.0, heavy: { kind: 'blast', dur: 0.75, mult: 2.4, st: 20 }, poise: 14, st: 0, bolt: true },
  wolf: { hits: [[0.27, 0.9], [0.27, 0.9], [0.42, 1.7]], range: 2.7, arc: 1.8, heavy: { kind: 'pounce', dur: 0.55, mult: 2.4, st: 24, dist: 8 }, poise: 24, st: 0, mat: 'bite' },
};
/* affixes: [key, label, min, max, perLevelGrowth, slots]. vsV counts against fam vampire, hybrid and original; vsW against fam wolf and hybrid; vsS against spirits. */
const AFF = [
  ['dmg', 'Savage', 3, 7, 0.06, 'weapon ranged ring amulet'], ['crit', 'Keen', 2, 5, 0.03, 'weapon ranged ring amulet'], ['critd', 'Cruel', 8, 18, 0.25, 'weapon ranged ring'],
  ['hp', 'Stalwart', 8, 18, 1.6, 'armor ring amulet'], ['st', 'Tireless', 6, 14, 0.5, 'armor ring'], ['fo', 'Arcane', 8, 16, 0.6, 'armor amulet weapon'],
  ['def', 'Warded', 3, 7, 0.5, 'armor ring'], ['ls', 'Leeching', 1, 2.5, 0.02, 'weapon ring'], ['spd', 'Fleet', 2, 5, 0.03, 'armor amulet'], ['as', 'Quick', 3, 7, 0.04, 'weapon ring'],
  ['cdr', 'Focused', 3, 6, 0.04, 'amulet ring weapon'], ['xp', 'Learned', 4, 8, 0.05, 'amulet ring'], ['gold', 'Gilded', 8, 16, 0.2, 'amulet ring armor'], ['mf', 'Fortunate', 5, 10, 0.15, 'amulet ring'],
  ['regen', 'Mending', 0.3, 0.7, 0.03, 'armor amulet'], ['vsV', 'Slaying', 8, 16, 0.15, 'weapon ranged'], ['vsW', 'Wolfsbane-laced', 8, 16, 0.15, 'weapon ranged'], ['vsS', 'Veil-touched', 8, 16, 0.15, 'weapon ranged amulet'],
  ['spell', 'Witching', 5, 10, 0.12, 'weapon amulet ring armor'], ['burn', 'Smouldering', 3, 6, 0.5, 'weapon ranged'], ['thorns', 'Barbed', 3, 6, 0.6, 'armor'],
  ['mig', 'of Might', 1, 3, 0.12, 'weapon armor ring amulet'], ['fin', 'of Finesse', 1, 3, 0.12, 'weapon ranged armor ring amulet'], ['vig', 'of Vigor', 1, 3, 0.12, 'armor ring amulet'], ['wil', 'of Will', 1, 3, 0.12, 'weapon armor ring amulet'],
];
const AFFD = { dmg: '+{v}% damage', crit: '+{v}% critical chance', critd: '+{v}% critical damage', hp: '+{v} health', st: '+{v} stamina', fo: '+{v} focus', def: '+{v} armour', ls: '{v}% life steal', spd: '+{v}% movement speed', as: '+{v}% attack speed', cdr: '{v}% faster cooldowns', xp: '+{v}% experience', gold: '+{v}% gold found', mf: '+{v}% better loot', regen: '+{v} health per second', vsV: '+{v}% damage to vampires and hybrids', vsW: '+{v}% damage to werewolves and hybrids', vsS: '+{v}% damage to spirits', spell: '+{v}% spell power', burn: '{v} fire damage on hit', thorns: '{v} damage to attackers', mig: '+{v} Might', fin: '+{v} Finesse', vig: '+{v} Vigor', wil: '+{v} Will' };
/* relics. bound: cannot be sold or salvaged (see isBound). The effects in d are implemented in recalc / daylightSafe / immuneCompel / playerDeath unless noted. */
const UNIQ = {
  daylight: { n: 'Daylight Ring', base: 'ring', bound: 1, aff: [['hp', 30]], d: 'Lapis lazuli, spelled by a witch for one vampire. While you wear it the sun does not burn you. It cannot be sold, and the witch who made it can unmake it from anywhere.' },
  moonring: { n: 'Moonlight Ring', base: 'band', aff: [['hp', 40], ['def', 12]], d: "Black kyanite. A werewolf who wears it is not forced to turn on the full moon and may choose to. On that night the wolf's strength and its venom are yours in either shape. There is no second stone: a werewolf cannot sell it." },   // bound while S.species === 'werewolf' (isBound)
  whiteoak: { n: 'White Oak Stake', base: 'stake', mult: 1.25, aff: [['crit', 10]], d: 'Carved from the old Wickery Bridge sign. Against anything else it is only wood. Through the heart of a downed Original it is the end of him, and of everyone he ever made. It burns up when it is used that way.' },
  watch: { n: "Founder's Pocket Watch", base: 'amulet', aff: [['mf', 25], ['crit', 6]], d: 'A compass spelled into a watch case in 1864. Vampires and hybrids show on your map. If you are one, the needle only spins.' },
  vlocket: { n: "Elspeth's Vervain Locket", base: 'locket', aff: [['hp', 30], ['wil', 3]], d: 'Packed with vervain. Whoever wears it cannot be compelled. It burns a vampire who tries to put it on.' },
  fring: { n: "Founder's Ring", base: 'signet', aff: [['hp', 25], ['def', 8]], d: 'Brings back an ordinary human killed by something supernatural. It does nothing for a witch, a werewolf, a hunter of the Five or the dead, and nothing against an ordinary death. Each time it keeps a little of your mind: for some hours after you see people who are not there, and it is longer every time.' },
  halebow: { n: "Hale's Crossbow", base: 'xbow', mult: 1.4, aff: [['vsV', 30], ['crit', 8]], d: 'Thirty years of practice in the stock. Its wooden bolts pierce.' },
  corvin: { n: "Corvin's Signet", base: 'signet', aff: [['ls', 6], ['dmg', 18], ['critd', 30]], d: 'A thousand years on one hand. On a vampire it adds 1% damage for every night since they turned, up to 20%.' },
  wardblade: { n: "Warden's Oath", base: 'great', mult: 1.35, aff: [['def', 20], ['dmg', 12]], d: 'Heavy blows send a shockwave through the stone. A heavy blade takes heads.' },
  grimoire: { n: 'Thorne Grimoire', base: 'talisman', aff: [['spell', 35], ['fo', 40], ['cdr', 12]], d: 'Nine generations of marginalia.' },
  ripper: { n: "Ripper's Band", base: 'band', aff: [['dmg', 10], ['ls', 3]], d: 'Two percent more damage for every ten humanity you have lost.' },
  alphafang: { n: "Alpha's Fang", base: 'dagger', mult: 1.3, aff: [['as', 15], ['crit', 12]], d: 'Still wet. Werewolf venom: a vampire it cuts loses 60% of the blow again every second for 6 seconds and cannot heal. It does nothing extra to anything else, and an Original only sickens.' },
};
/* supplies. quest: cannot be sold. useCons (40-systems) implements every effect written here; quest items with no direct use fall through to storyUse. */
const CONS = {
  draught: { n: 'Healing Draught', d: 'Restores 40% of your health.', price: 28, icon: '✚' }, tonic: { n: 'Focus Tonic', d: 'Restores 60% of your focus. A siphoner has nothing for it to wake.', price: 30, icon: '✦' },
  bloodbag: { n: 'Blood Bag', d: 'Human blood, given willingly. A vampire: 50 blood and a quarter of your health. In transition: drinking it completes the change.', price: 40, icon: '♥' },
  burger: { n: 'Grill Special', d: 'A minute of steady healing for the living. A vampire can eat it. It just does not help.', price: 12, icon: '◉' },
  bourbon: { n: 'Bourbon', d: "Takes the edge off the craving: a vampire's blood drains at half speed for three minutes.", price: 15, icon: '◉' },
  coffee: { n: 'Vervain Coffee', d: "The Grill's bitter coffee. Nobody can compel the living for a day after a cup. It burns a vampire all the way down.", price: 8, icon: '◉' },
  vervain: { n: 'Vervain Sprig', d: 'Coat your weapon: +50% damage to vampires and hybrids for 90 seconds, and each hit leaves them weakened. Burns a vampire who touches it.', price: 14, icon: '❋' },
  wolfsbane: { n: 'Wolfsbane', d: 'Coat your weapon: +60% damage to werewolves and hybrids for 90 seconds, and each hit leaves them weakened. Burns a werewolf who touches it. An ordinary animal does not care.', price: 14, icon: '❋' },
  sage: { n: 'White Sage', d: 'Burn it: for 20 seconds nothing short of a witch or a spirit can overhear or track you. Enemies lose you and suspicion fades. Striking or casting clears the smoke.', price: 10, icon: '❋' },
  scrap: { n: 'Scrap', d: 'Salvage. The Council armourer uses it to reforge gear.', price: 3, icon: '▣' },
  vblood: { n: 'Vial of Vampire Blood', d: 'Heals you completely and stays in you for a day. Die in that day and you wake in transition. It does nothing more for someone who has taken the Cure.', price: 0, icon: '♦', quest: 1 },
  hblood: { n: 'Blood of the First', d: "Corvin's blood. It heals, and it is the only cure for a werewolf bite. For a day after drinking it: a werewolf who dies wakes in transition to a hybrid, a human to a vampire of his line.", price: 0, icon: '♦', quest: 1 },
  dblood: { n: "Doppelgänger's Blood", d: "Elise Gilroy's blood, drawn while she is human. The only thing that completes a hybrid's transition.", price: 0, icon: '♦', quest: 1 },
  ashdagger: { n: 'White Oak Ash Dagger', d: 'A silver dagger dipped in white oak ash. In the heart of an Original it holds him as dead until it is drawn out. It kills any ordinary vampire who uses it, and it does nothing at all to a hybrid.', price: 0, icon: '◆', quest: 1 },
  oakwood: { n: 'Wickery Bridge Sign', d: 'The sign from the old bridge. White oak, like the rest of it was. Someone who knows wood could carve a stake from this.', price: 0, icon: '◆', quest: 1 },
  kyanite: { n: 'Black Kyanite', d: 'A witch can spell it into a moonlight ring.', price: 0, icon: '◆', quest: 1 }, moonstone: { n: 'Moonstone', d: 'It gives its holder nothing. It binds a curse, and it is one part of the ritual that breaks one.', price: 0, icon: '◆', quest: 1 },
  talisman: { n: 'Thorne Talisman', d: "Emeline Thorne's crystal. It opens what a Thorne sealed, however long ago.", price: 0, icon: '◆', quest: 1 },
  cure: { n: 'The Cure', d: 'One dose. Makes a vampire human for good: whoever takes it can never be turned again.', price: 0, icon: '♦', quest: 1 }, lapisq: { n: 'Lapis Lazuli', d: 'A witch can bind the sun into it.', price: 0, icon: '◆', quest: 1 },
  locket: { n: 'Tarnished Locket', d: 'Engraved: E.F., 1864. It smells faintly of vervain.', price: 0, icon: '◆', quest: 1 },
};

/* ---------------- skills ----------------
   cost keys: st stamina, fo focus, bl blood, rg rage, hp fraction of max health. ok() is an extra requirement beyond the tree being open (learn/canLearn check it; okD says why not).
   Passive numbers are applied in recalc (40-systems) and must not be applied again elsewhere. Notes after "//" are for whoever implements ABIL. */
const SK = {
  h_weapon: { tree: 'hunter', n: 'Weapon Training', max: 5, req: 0, d: r => `+${6 * r}% melee damage.` },
  h_marks: { tree: 'hunter', n: 'Marksman', max: 5, req: 0, d: r => `+${8 * r}% ranged damage, ${5 * r}% faster reload.` },
  h_cond: { tree: 'hunter', n: 'Conditioning', max: 5, req: 0, d: r => `+${10 * r} stamina, +${8 * r}% stamina recovery.` },
  h_parry: { tree: 'hunter', n: 'Riposte', max: 3, req: 2, d: r => `A wider parry window. Your next hit after a parry deals +${50 * r}% damage.` },
  // h_gren: hazard at aimPoint(13), r 4.4, fuse 0.55 s, mat 'verv' (WEAK does the 60% / 30%). On fam vampire|hybrid|original: stun, fx.burn 4 s, fx.verv 6 s (fx.verv on an enemy = deals 25% less, no healing).
  h_gren: { tree: 'hunter', n: 'Vervain Grenade', max: 3, req: 3, act: 1, cd: 14, cost: { st: 20 }, d: r => `Throw a vervain grenade: ${120 + 40 * r}% weapon damage as vervain in a 4.4 metre circle. Vervain does 60% more to vampires and hybrids, burns them, stuns them for ${1 + r} seconds and leaves them weakened for 6. Anyone else takes a 30% concussion and nothing more.` },
  // h_wgren: same throw, mat 'wolfsbane', on fam wolf|hybrid: stun, fx.burn 4 s, fx.wolfsbane 6 s (deals 25% less, no healing, slowed).
  h_wgren: { tree: 'hunter', n: 'Wolfsbane Grenade', max: 3, req: 4, act: 1, cd: 14, cost: { st: 20 }, d: r => `Throw a wolfsbane grenade: ${120 + 40 * r}% weapon damage as wolfsbane in a 4.4 metre circle. Wolfsbane does 60% more to werewolves and 50% more to hybrids, burns them, stuns them for ${1 + r} seconds and leaves them weak and slow for 6. Anyone else takes a 30% concussion. A timber wolf is only a wolf.` },
  // h_heart: the blow is mat 'wood' whatever is equipped ('whiteoak' with the White Oak Stake). "Staked for good" = permanent kill of fam vampire. Never finishes fam hybrid or original.
  h_heart: { tree: 'hunter', n: 'Heartseeker', max: 3, req: 5, act: 1, cd: 10, cost: { st: 25 }, d: r => `Lunge up to 9 metres and drive wood at the heart for ${260 + 40 * r}%. A vampire that is downed, staggered or below ${20 + 5 * r}% health is staked for good; a keeper has to be down, or at half that. Any other ordinary enemy below ${15 + 5 * r}% dies outright. A hybrid only falls over, and an Original gets up again.` },
  h_whirl: { tree: 'hunter', n: 'Whirlwind', max: 3, req: 8, act: 1, cd: 9, cost: { st: 30 }, d: r => `Spin, hitting everything around you ${2 + r} times for 80% weapon damage.` },
  h_volley: { tree: 'hunter', n: 'Volley', max: 3, req: 10, act: 1, cd: 11, cost: { st: 22 }, d: r => `Loose ${3 + 2 * r} shots in a fan.` },
  h_second: { tree: 'hunter', n: 'Second Wind', max: 3, req: 12, d: r => `Falling below 30% health heals ${10 + 10 * r}% once every 90 seconds.` },
  h_slayer: { tree: 'hunter', n: "Slayer's Momentum", max: 5, req: 15, d: r => `Each kill grants +${2 + r}% damage for 10 seconds, stacking five times.` },
  // h_device: affects enemies of fam vampire|hybrid|original (Originals for 60% of the time) and fam wolf (either shape); never fam human|witch|animal|spirit. If isVamp() || isWolf() || S.origin === 'wolf' the player is stunned for the same time.
  h_device: { tree: 'hunter', n: "The Founders' Device", max: 3, req: 18, act: 1, cd: 240, cost: { st: 40 }, d: r => `Wind the Device. Every vampire, hybrid and werewolf within 30 metres drops, helpless, for ${4 + r} seconds; an Original is up again a little sooner. If you are a vampire, a hybrid or a werewolf yourself, or only carry the wolf gene, it drops you too. Humans and witches hear nothing.` },
  // h_five: immunity lives in immuneCompel(); the damage is folded into P.vsV by recalc (do not multiply again in hit); S.flags.mark is counted in qEvent('kill').
  h_five: { tree: 'hunter', n: 'Brotherhood of the Five', max: 1, req: 25, ok: () => S.origin === 'human' && S.species === 'human' && !S.transition, okD: 'Only an ordinary human can carry the mark.', d: () => `Nobody can compel you, not even an Original. The Hunter's Mark grows up your arm: +10% damage to vampires, hybrids and Originals, and 1% more for every two you kill, up to +50%. A Founder's Ring stops working for you. If you ever turn, the mark is gone.` },

  w_attune: { tree: 'witch', n: 'Attunement', max: 5, req: 0, d: r => `+${8 * r}% spell power, +${10 * r} focus.` },
  w_chan: { tree: 'witch', n: 'Channeling', max: 5, req: 0, d: r => `+${12 * r}% focus recovery. On a full-moon night, and inside Coven Hollow, you draw on something larger: +${6 * r}% spell power, and focus comes back twice as fast.` },
  w_incend: { tree: 'witch', n: 'Incendia', max: 5, req: 0, act: 1, cd: 6, cost: { fo: 22 }, d: r => `A cone of fire 9 metres long for ${140 + 30 * r}% spell damage. Enemies burn for 4 seconds and the ground for 3.5. Fire is one of the things that ends a vampire for good.` },
  // w_aneur: fam vampire|hybrid|wolf full effect; fam original half the stun; fam human|witch|animal the lesser effect; fam spirit nothing at all (show "NO BLOOD").
  w_aneur: { tree: 'witch', n: 'Pain Infliction', max: 3, req: 3, act: 1, cd: 12, cost: { fo: 30 }, d: r => `Burst the blood vessels of everything within 10 metres. Vampires, hybrids and werewolves drop for ${2 + 0.5 * r} seconds and take ${110 + 30 * r}% spell damage; they heal, so you can do it again. Originals shake it off in half the time. The living are stunned for 1 second and take ${50 + 15 * r}%. A spirit has no blood to burst.` },
  w_ward: { tree: 'witch', n: 'Protection Spell', max: 3, req: 5, act: 1, cd: 16, cost: { fo: 25 }, d: r => `A barrier that absorbs damage equal to ${20 + 10 * r}% of your health for 8 seconds.` },
  // w_cloak: pl.buff.cloak = duration. While > 0 enemies cannot target the player (drop aggro, walk home); any attack or other cast by the player ends it.
  w_cloak: { tree: 'witch', n: 'Cloaking Spell', max: 3, req: 5, act: 1, cd: 20, cost: { fo: 28 }, d: r => `For ${4 + 2 * r} seconds nothing can see or hear you, except a witch or a spirit. Enemies lose you and go back to what they were doing. Striking or casting ends it.` },
  // w_motus: target = aimTarget(13). Bosses: no throw, poise damage 80 instead.
  w_motus: { tree: 'witch', n: 'Motus', max: 3, req: 8, act: 1, cd: 9, cost: { fo: 34 }, d: r => `Throw an enemy within 13 metres without touching it: ${150 + 30 * r}% spell damage, hurled 8 metres and stunned for 1.5 seconds. Everything within 3 metres of where it lands takes half. Keepers are too heavy to throw; they stagger.` },
  // w_bound: circle r 5 at aimPoint(12). Enemies inside get fx.root (cannot leave the circle; they can still attack inside it) and fx.slow for the duration. Bosses and Originals are held too.
  w_bound: { tree: 'witch', n: 'Boundary Spell', max: 3, req: 10, act: 1, cd: 22, cost: { fo: 36 }, d: r => `Draw a circle 10 metres across at a point within 12 metres. For ${5 + r} seconds no enemy inside can leave it, and they move slowly. It holds anything. It held an Original once.` },
  w_herb: { tree: 'witch', n: 'Herbalist', max: 3, req: 4, d: r => `Draughts, tonics and burning sage are ${15 * r}% stronger. Herb patches yield one more.` },
  // w_spirit: recalc gives P.spellCrit and P.spiritFoc (focus per kill); both are 0 with Expression, and for a Heretic.
  w_spirit: { tree: 'witch', n: "Spirits' Favour", max: 5, req: 12, d: r => `The dead witches of the Hollow lean in: +${3 * r}% critical chance with spells, and each kill restores ${3 * r} focus. They turn their backs on Expression, and on the dead.` },
  // w_siphon: needs a target within 3 m of fam vampire|hybrid|original|wolf|witch|spirit, or an active enemy ward/boundary, or the Hollow altar (fills focus). Red glow on the hand.
  //           fam vampire target ending below 15% health -> desiccated: permanently down, grey (Originals: stunned 4 s instead). With no target a Heretic turns 12 blood into the same focus.
  //           If S.venomUntil is set and S.heretic: call cureVenom('siphon') instead of anything else.
  w_siphon: { tree: 'witch', n: 'Siphon', max: 3, req: 0, act: 1, cd: 5, cost: {}, ok: () => S.origin === 'siphoner', okD: 'Only a born siphoner can do this.', d: r => `Lay a hand on something supernatural within 3 metres and take its magic: ${22 + 8 * r} focus, and ${60 + 20 * r}% spell damage to it. Vampires, hybrids, werewolves, witches, spirits and wards all hold some; people and animals hold none. A vampire drained below 15% health desiccates and stays down. A Heretic with nothing to touch draws on her own vampirism, 12 blood at a time, and can siphon werewolf venom out of herself.` },
  // w_desic: target within 3 m, fam vampire|hybrid|original, and (stunned | rooted | downed | below 35% health), else refuse and refund. Ordinary: permanent kill, grey corpse.
  //          fam original: desiccated = out of the fight (counts as defeated, not as killed by white oak; the sire line lives).
  w_desic: { tree: 'witch', n: 'Desiccation', max: 1, req: 18, act: 1, cd: 90, cost: { fo: 50, hp: 0.35 }, d: () => `Stop a vampire's heart with your hand on it. The balance is a living heart, and you pay it yourself: 35% of your health. It only takes on a vampire within 3 metres that is stunned, held in a Boundary, downed or below 35% health. An ordinary vampire or hybrid greys and never gets up. An Original lies desiccated until someone feeds him, and his line lives.` },
  // w_express: every living witch may cast with too little focus by paying 10% of max health (nosebleed); Expression makes that 5%. A siphoner with no focus cannot cast at all.
  w_express: { tree: 'witch', n: 'Expression', max: 1, req: 25, d: () => `Magic that answers to no spirit and no balance. +30% spell power. Casting with no focus left costs 5% of your health instead of the usual 10%. Spirits' Favour stops working.` },

  l_might: { tree: 'wolf', n: 'Might', max: 5, req: 0, d: r => `+${3 * r}% health in either shape. As a person, +${4 * r}% melee damage. As a wolf, +${8 * r}% bite damage.` },
  l_regen: { tree: 'wolf', n: 'Quick Healing', max: 5, req: 0, d: r => `You heal ${(0.2 * r).toFixed(1)}% of your health every second, half as much again as a wolf. Slower than a vampire, and wolfsbane stops it.` },
  l_senses: { tree: 'wolf', n: 'Senses', max: 3, req: 2, d: r => `+${4 * r}% critical chance. You smell them first: everything within ${20 + 10 * r} metres shows on your map.` },
  // l_rage: pl.buff.fury = duration, then recalc(). pl.rage (0-100) fills from hits dealt (+3) and taken (+6), times P.rageGain; drains 2 per second out of combat. Yellow eyes while fury > 0; no stagger or stun on the player.
  l_rage: { tree: 'wolf', n: 'Fury', max: 3, req: 3, act: 1, cd: 20, cost: { rg: 30 }, d: r => `Let the anger out for ${6 + 2 * r} seconds: +${20 + 10 * r}% damage, +15% speed, your eyes go yellow and nothing can stagger you. Costs 30 rage. Rage builds as you hit and are hit, faster near the full moon, and even unspent it adds up to 15% damage.` },
  // l_pounce: target aimTarget(10); land on it. mat 'bite' in wolf form, else the weapon. Venom per P.venom when it is > 0.
  l_pounce: { tree: 'wolf', n: 'Pounce', max: 3, req: 5, act: 1, cd: 8, cost: { st: 20 }, d: r => `Leap up to 10 metres onto an enemy: ${200 + 50 * r}% damage, and it is knocked flat for ${1 + 0.5 * r} seconds. As a wolf it is a bite, and carries your venom.` },
  // l_howl: enemies within 12 m: fx.slow; non-boss fam human|animal flee for the duration. With l_alpha: also spawn 2 'wolf' allies at the player's level for 30 s (team 0, no loot).
  l_howl: { tree: 'wolf', n: 'Howl', max: 3, req: 8, act: 1, cd: 30, cost: { st: 15 }, d: r => `Every enemy within 12 metres is slowed for ${3 + r} seconds, and ordinary people and animals break and run. You gain ${15 + 5 * r} rage.` },
  // l_venom: P.venom (recalc) is the fraction of the bite dealt again each second for 8 s, as mat 'venom', to fam vampire (no healing meanwhile). 0 = not venomous right now.
  //          fam original: fx.slow and deals 20% less for 8 s, no damage. Nothing on any other family. Without this skill a bite in wolf form still carries 30%.
  l_venom: { tree: 'wolf', n: 'Werewolf Venom', max: 3, req: 10, d: r => `Your bite poisons vampires: ${40 + 20 * r}% of the bite again every second for 8 seconds, and they cannot heal. It is slow death to an ordinary vampire and only a fever to an Original. A werewolf is venomous only as a wolf. A hybrid, or the wearer of a moonlight ring on the full moon, is venomous in either shape.` },
  l_moon: { tree: 'wolf', n: 'Moonblood', max: 5, req: 12, d: r => `Your strength follows the moon. At the full moon: +${6 * r}% damage and +${2 * r}% speed on top of what the moon already gives you. At the new moon, nothing.` },
  // l_bones: recalc gives P.shiftT (seconds of helpless change) and P.shiftHp (fraction of max health it costs). Forced full-moon changes cost nothing.
  l_bones: { tree: 'wolf', n: 'Broken In', max: 3, req: 6, d: r => `Every bone breaks each time. You are getting used to it: a willing change takes ${(3 - 0.8 * r).toFixed(1)} seconds instead of 3 and costs ${12 - 3 * r}% of your health instead of 12%.` },
  // l_alpha: enemies of type 'wolf', 'packrunner' and non-boss 'werewolf' are neutral to the player unless struck.
  l_alpha: { tree: 'wolf', n: 'Alpha', max: 1, req: 25, d: () => `Timber wolves and the Falls pack no longer attack you unless you strike first. Your Howl calls two wolves, who fight beside you for 30 seconds.` },

  v_pred: { tree: 'vampire', n: 'Predator', max: 5, req: 0, d: r => `+${5 * r}% melee damage, ${r}% life steal.` },
  // v_heal: rate = sk('v_heal') * 0.004 * P.healM of max health per second while blood > 0 (P.healM is 0 with wood lodged, vervain or venom in you; 0.5 on animal blood).
  v_heal: { tree: 'vampire', n: 'Healing Factor', max: 5, req: 0, d: r => `Regenerate ${(0.4 * r).toFixed(1)}% of your health every second while you have blood. Half as fast on animal blood. It stops while wood is lodged in you, and under vervain or werewolf venom.` },
  v_blur: { tree: 'vampire', n: 'Blur', max: 3, req: 0, d: r => `Your dodge travels ${20 * r}% further${r >= 3 ? ' and strikes everything you pass through' : ''}.` },
  // v_frenzy: fam human|witch: full; fam animal|wolf|hybrid: half heal and blood, and S.diet = 'animal' for fam animal; fam vampire|original|spirit: damage only. def.verv target: no blood, player takes 10% max health and fx.verv 6 s.
  v_frenzy: { tree: 'vampire', n: 'Feeding Frenzy', max: 3, req: 0, act: 1, cd: 8, cost: {}, d: r => `Leap up to 10 metres onto an enemy and feed: ${180 + 40 * r}% damage. Human blood heals 14% of your health and restores ${20 + 5 * r} blood. Animal and werewolf blood gives half, another vampire's a quarter. The starved dead of the tomb and spirits give nothing, and vervain in the blood burns you instead.` },
  // v_compel: allowed only on fam human without def.verv / def.five. With S.original && sk('o_compel'): also fam vampire|hybrid without fx.verv, for half the time; never fam original. Everything else: float "IMMUNE" (or "VERVAIN") and refund.
  v_compel: { tree: 'vampire', n: 'Compulsion', max: 3, req: 3, act: 1, cd: 22, cost: { bl: 18 }, d: r => `Catch the eye of a human within 11 metres and they fight for you for ${8 + 4 * r} seconds, half that if you live on animal blood. It fails on anyone with vervain in them, and it has never worked on witches, werewolves, the Five, spirits or other vampires. A keeper only stands still for 3 seconds.` },
  // v_step: a straight dash (collide() each step, a streak not smoke); target aimTarget(15).
  v_step: { tree: 'vampire', n: 'Vamp Speed', max: 3, req: 6, act: 1, cd: 9, cost: { bl: 12 }, d: r => `A rush too fast to follow, up to 15 metres in a straight line, ending in a blow for ${220 + 60 * r}% that always lands critically. Everything in your path takes 60%. It is speed, not vanishing: a wall stops you.` },
  // v_ripper: a toggle, not a buff: call flipSwitch(); it sets S.switchOff, applies the guilt and recalcs. The bonuses are in recalc. Colour drain on screen while S.switchOff.
  v_ripper: { tree: 'vampire', n: 'The Switch', max: 3, req: 10, act: 1, cd: 4, cost: {}, d: r => `Your humanity is a switch, and this turns it off or back on. Off: +${15 + 5 * r}% damage, +10% speed, +3% life steal, and killing costs you nothing. But humanity cannot rise and drains by 1 every minute. Turning it back on brings all of it back at once: 20 seconds dealing 30% less, and 5 seconds more for every kill you made while it was off.` },
  v_sense: { tree: 'vampire', n: "Predator's Senses", max: 3, req: 4, d: r => `+${4 * r}% critical chance. You hear heartbeats: everything living shows on your map.` },
  // v_snap: target aimTarget(8), dash behind it. Non-elite fam human|witch: dies. fam vampire|hybrid: downed for the time given, then rises (not a kill). fam wolf: executes below the threshold, else damage.
  //         Bosses, elites and fam original: only if stunned, and then 2 s more stun plus the damage. fam spirit|animal: plain damage. Killing fam human|witch this way: S.humanity -5 unless S.switchOff.
  v_snap: { tree: 'vampire', n: 'Neck Snap', max: 3, req: 8, act: 1, cd: 14, cost: { bl: 10 }, d: r => `Blur behind a target within 8 metres and break its neck. A person dies. A vampire or hybrid drops for ${4 + 2 * r} seconds and then gets back up. A werewolf below ${20 + 10 * r}% health dies; above that it takes ${200 + 50 * r}%. Keepers, champions and Originals can only be caught while staggered, and only lose 2 seconds. Killing a person this way costs 5 humanity.` },
  // v_heart: target within 3 m. If downed | stunned | below the threshold: permanent kill of any fam except original (and bosses must be downed or below the threshold). fam original: goes down as from any "death". fam spirit: no heart, refuse.
  v_heart: { tree: 'vampire', n: 'Heart Extraction', max: 3, req: 14, act: 1, cd: 16, cost: { bl: 14 }, d: r => `Reach into a target within 3 metres that is downed, staggered or below ${20 + 5 * r}% health and take the heart. It ends anything that can die: vampires, hybrids, werewolves, witches, people. On anything healthier it is a blow for ${240 + 40 * r}%. An Original gets up again regardless.` },
  v_fed: { tree: 'vampire', n: 'Well Fed', max: 5, req: 12, d: r => `While your blood is above 70% and it is human blood: +${4 * r}% damage and +${2 * r}% speed.` },
  v_elder: { tree: 'vampire', n: 'Age', max: 5, req: 25, d: r => `A vampire grows stronger with every year. +${6 * r}% health, damage and blood.` },

  o_might: { tree: 'original', n: 'First Blood', max: 5, req: 0, d: r => `Stronger and faster than any vampire, whatever its age. +${8 * r}% damage, +${4 * r}% health, +${3 * r}% speed.` },
  // o_compel: see v_compel.
  o_compel: { tree: 'original', n: 'Compel the Dead', max: 1, req: 2, d: () => `Your Compulsion also takes vampires and hybrids, for half as long; a keeper among them stands still for 3 seconds. Vervain still blocks it, and no Original can compel another.` },
  // o_undying: handled in playerDeath (40-systems).
  o_undying: { tree: 'original', n: 'Undying', max: 3, req: 4, d: r => `Nothing but white oak ends you. When you would die you lie grey where you fell for four seconds, then rise with ${30 + 10 * r}% of your health. It cannot happen again for ${5 - r} hours of the clock; fall sooner and you wake at home like anyone else.` },
  // o_sire: in v_compel, a compelled fam vampire|hybrid below 50% health becomes e.ally = 1 (team 0 for good, follows the player) while fewer than r allies live.
  o_sire: { tree: 'original', n: 'Sire', max: 3, req: 6, d: r => `A vampire or hybrid you compel while it is below half health is yours for good: it follows you and fights for you until it dies. You can keep ${r}.` },
};
/* d: shown when the tree is open. shut(): why it is closed, for this character. */
const TREES = {
  hunter: { n: 'Hunter', d: 'Stakes, vervain and nerve. Open to anyone.', shut: () => '' },
  witch: { n: 'Witch', d: 'Spells cost focus. Cast with too little and it comes out of you instead, starting with the nose.', shut: () => S.origin === 'siphoner' ? 'You became a vampire without your siphoning. That should not be possible.' : S.origin !== 'witch' ? 'Magic is inherited. It is not in your blood.' : S.species !== 'human' ? 'A witch who becomes a vampire loses her magic for good.' : 'The craft is asleep in you. Odette Thorne could wake it.' },
  wolf: { n: 'Werewolf', d: "Strength, speed and healing below a vampire's, rising with the moon and with rage. The wolf comes out on the full moon whether you like it or not. G changes your shape when you are allowed to choose.", shut: () => S.origin !== 'wolf' ? 'The curse is inherited. A bite does not pass it on.' : S.species === 'vampire' ? 'The curse sleeps on under the vampire. Only one man ever woke it after he died, and became both.' : 'The curse is asleep. It wakes with the first human life you take.' },
  vampire: { n: 'Vampire', d: 'Blood is strength. Wood, fire, vervain and the sun are the price.', shut: () => S.transition ? 'You are in transition. Nothing here is yours until you feed.' : S.flags.cured ? 'You took the Cure. You can never be turned again.' : 'Only the dead may learn this.' },
  original: { n: 'Original', d: 'The first of a line. Only white oak ends you.', shut: () => 'There were only ever a handful of these, and all of them are a thousand years old.' },
};
const ASC = { pow: { n: 'Power', d: '+2% damage per rank' }, vit: { n: 'Vitality', d: '+2% health per rank' }, swi: { n: 'Swiftness', d: '+1% cooldown recovery and attack speed per rank' }, fort: { n: 'Fortune', d: '+2% better loot and gold per rank' } };
const ascCost = r => 4 + r * 3 + Math.floor(r * r * 0.35);

/* ---------------- enemies ---------------- */
/* attacks: kind melee|lunge|slam|shoot|nova|blink|summon. dmg is a multiplier of the enemy's damage. New attacks use the old kinds, so they work as plain blows even
   where a flag is ignored; flags ask for the canon behaviour:
   mat      damage type of the blow (default: steel, magic for orbs and spirits, wood for xbolt)
   venom    a werewolf bite: on a vampire player call envenom(e)
   grab     grab-and-feed: on hit root the player for `root` seconds and heal the attacker `heal` x its max health
   snap     neck-snap grab: on hit stun the player for `stun` seconds (a human player takes dmg x 1.6 instead)
   gaze     telegraphed compulsion, no damage: if the player is inside the cone, facing the attacker and !immuneCompel(e.def.original), set pl.fx.charm = `charm` seconds
   tk       telekinetic throw: an unseen shove; knock the player back `kb` metres
   far      slam centred on the target's position instead of the attacker's (with mat 'verv' it is a vervain grenade: vervain on a vampire or hybrid player, and `stun` seconds)
   boundary a circle the player cannot leave for `root` seconds if still inside when it closes; no damage
   aneurysm pain infliction: on hit stun `stun` seconds; on a vampire, hybrid or werewolf player also lock that tree's skills for the stun; fam spirit attackers use it only on vampires
   vs       only chosen when S.species is in the list
   Vampires, hybrids and Originals have no magic: no orbs, no blinks. claw / claw3 are bare-handed flurries (no claws on the model). */
const ATK = {
  slash: { kind: 'melee', range: 2.6, arc: 1.7, wind: 0.5, rec: 0.6, dmg: 1, cd: 1.3 }, claw: { kind: 'melee', range: 2.4, arc: 1.6, wind: 0.34, rec: 0.25, dmg: 0.7, cd: 1.2, reps: 2 },
  claw3: { kind: 'melee', range: 2.6, arc: 1.8, wind: 0.3, rec: 0.2, dmg: 0.7, cd: 1.6, reps: 3 }, touch: { kind: 'melee', range: 2.2, arc: 2.2, wind: 0.6, rec: 0.7, dmg: 1, cd: 1.5 },
  bite: { kind: 'lunge', range: 6.5, min: 2, dist: 6, w: 1.3, wind: 0.42, rec: 0.7, dmg: 1, cd: 2.2, mat: 'bite' }, lunge: { kind: 'lunge', range: 10, min: 3.5, dist: 10, w: 1.5, wind: 0.5, rec: 0.8, dmg: 1.3, cd: 3.4 },
  charge: { kind: 'lunge', range: 16, min: 5, dist: 17, w: 2.4, wind: 0.85, rec: 1.2, dmg: 1.5, cd: 6 }, leap: { kind: 'slam', range: 11, min: 4, r: 3.4, wind: 0.75, rec: 0.9, dmg: 1.4, cd: 5, jump: 1 },
  slam: { kind: 'slam', range: 3.6, r: 4.6, wind: 0.8, rec: 0.9, dmg: 1.3, cd: 4.5 }, quake: { kind: 'slam', range: 14, r: 3.2, wind: 0.9, rec: 0.6, dmg: 1.2, cd: 7, multi: 4 },
  gslash: { kind: 'melee', range: 4.4, arc: 2.4, wind: 0.6, rec: 0.6, dmg: 1.1, cd: 1.6 }, bolt: { kind: 'shoot', range: 15, min: 3, wind: 0.5, rec: 0.5, dmg: 0.9, cd: 2.2, n: 1, spd: 15, col: 0x9a6bff },
  bolt3: { kind: 'shoot', range: 15, min: 2, wind: 0.6, rec: 0.6, dmg: 0.8, cd: 3.2, n: 3, spread: 0.24, spd: 15, col: 0x9a6bff }, xbolt: { kind: 'shoot', range: 17, min: 4, wind: 0.55, rec: 0.6, dmg: 1, cd: 2, n: 1, spd: 30, col: 0xe8c890, wood: 1 },
  fan: { kind: 'shoot', range: 16, wind: 0.7, rec: 0.6, dmg: 0.8, cd: 5, n: 7, spread: 0.2, spd: 13, col: 0x8a6cff }, nova: { kind: 'nova', range: 14, wind: 0.9, rec: 0.8, dmg: 0.9, cd: 8, n: 16, spd: 10, col: 0x8a6cff },
  blink: { kind: 'blink', range: 16, min: 5, wind: 0.25, rec: 0.15, cd: 5 }, summon: { kind: 'summon', range: 30, wind: 1, rec: 0.6, cd: 16, n: 2 }, stab: { kind: 'melee', range: 2.3, arc: 1.2, wind: 0.4, rec: 0.5, dmg: 1.1, cd: 1.4 },
  howl: { kind: 'summon', range: 30, wind: 1.1, rec: 0.5, cd: 24, n: 2 },
  /* the Council's hunters: a vervain grenade lobbed at a vampire or hybrid (never wasted on anyone else). A slam on the target's spot; resolveAtk adds the vervain and the short stun. */
  vgren: { kind: 'slam', range: 13, min: 5, r: 3.4, wind: 0.95, rec: 0.7, dmg: 0.8, cd: 11, mat: 'verv', far: 1, stun: 0.8, vs: ['vampire', 'hybrid'] },
  /* werewolves */
  wbite: { kind: 'lunge', range: 7, min: 1.5, dist: 7, w: 1.4, wind: 0.4, rec: 0.7, dmg: 1.15, cd: 2.4, mat: 'bite', venom: 1 }, pounce: { kind: 'slam', range: 11, min: 4, r: 3, wind: 0.7, rec: 0.9, dmg: 1.4, cd: 5.5, jump: 1, mat: 'bite', venom: 1 },
  /* vampires, hybrids, Originals: speed, hands, teeth, eyes */
  gaze: { kind: 'melee', range: 8, arc: 1.1, wind: 1.1, rec: 0.8, dmg: 0.01, cd: 14, gaze: 1, charm: 3 }, grab: { kind: 'melee', range: 2.6, arc: 1.6, wind: 0.55, rec: 0.9, dmg: 1.2, cd: 7, mat: 'bite', grab: 1, root: 1.2, heal: 0.06 },
  snap: { kind: 'melee', range: 2.4, arc: 1.4, wind: 0.65, rec: 1, dmg: 0.8, cd: 12, snap: 1, stun: 2.2 }, debris: { kind: 'shoot', range: 16, min: 5, wind: 0.6, rec: 0.6, dmg: 1.1, cd: 5, n: 1, spd: 24, col: 0x8a8478, mat: 'steel', solid: 1 },
  dashchain: { kind: 'lunge', range: 12, min: 3, dist: 9, w: 1.4, wind: 0.36, rec: 0.18, dmg: 0.8, cd: 6.5, reps: 3 },
  /* witches: fire, telekinesis, boundary, pain */
  firebolt: { kind: 'shoot', range: 15, min: 3, wind: 0.5, rec: 0.5, dmg: 0.9, cd: 2.2, n: 1, spd: 15, col: 0xff7a20, mat: 'fire', burn: 2 }, tk: { kind: 'shoot', range: 12, min: 2, wind: 0.6, rec: 0.7, dmg: 1.1, cd: 6, n: 1, spd: 34, col: 0xb0a8ff, mat: 'magic', tk: 1, kb: 9 },
  boundary: { kind: 'slam', range: 13, min: 3, r: 3.2, wind: 0.9, rec: 0.7, dmg: 0.01, cd: 14, mat: 'magic', far: 1, boundary: 1, root: 3 }, aneurysm: { kind: 'melee', range: 11, arc: 0.5, wind: 0.9, rec: 0.9, dmg: 0.7, cd: 11, mat: 'magic', aneurysm: 1, stun: 1.2 },
};
/* def flags: fam (see WEAK) · onlyVs:[species] hostile only to a player of those species, otherwise neutral unless struck · ring wears a daylight ring (survives sunrise, drops inert lapis)
   · full exists only while fullMoon() && isNight() · need: an S.flags key that must be set before the type may spawn · venom its bite is werewolf venom · original ordinary "death" only
   desiccates it; only a White Oak Stake kills · hybrid werewolf and vampire both (no sun damage, wolfsbane hurts too) · line: the Original whose death kills it · five one of the Brotherhood
   (cannot be compelled; a vampire who kills one is cursed) · verv vervain in the blood (cannot be compelled, burns a feeder) · eyes emissive eye colour · desic lies desiccated until someone living
   comes close · addHp/addDmg scale what its summon calls · pl plural for notices. Vampire looks carry no weapon: hands and teeth.
   · immortal (the Sleeper only): older than the Originals and not one of them. He fights and falls like one (fam and original stay set for that), but white oak and the ash dagger
   are nothing to him and no line hangs on him: isImmortal() in 30-actors. */
const EN = {
  robber: { n: 'Grave Robber', rig: 'human', fam: 'human', hp: 36, dmg: 8, spd: 4.6, xp: 10, poise: 20, atk: ['slash'], look: { cloth: 0x5a5040, pants: 0x2a2620, hat: 1, w: 'wBat' }, gold: 1.5 },
  wolf: { n: 'Timber Wolf', pl: 'Timber Wolves', rig: 'wolf', fam: 'animal', hp: 28, dmg: 11, spd: 7.4, xp: 9, poise: 14, atk: ['bite'], strafe: 1, r: 0.6, tint: { fur: 0x6a6a70, furDark: 0x3a3a40 } },   // dmg 11: a pack of three costs a careless new arrival a bit more than a fifth of their health
  deer: { n: 'Deer', pl: 'Deer', rig: 'deer', fam: 'animal', hp: 20, dmg: 0, spd: 8, xp: 3, poise: 5, atk: [], peaceful: 1, r: 0.6 },
  feral: { n: 'Newborn Vampire', rig: 'human', fam: 'vampire', line: 'corvin', hp: 46, dmg: 11, spd: 6.1, xp: 14, poise: 22, atk: ['claw', 'grab'], look: { cloth: 0x3a3a44, pants: 0x1a1a20, skin: 0xb8b0a8, hair: 0x201818, torn: 1 } },
  tombvamp: { n: 'Tomb Vampire', rig: 'human', fam: 'vampire', hp: 50, dmg: 11, spd: 5.4, xp: 15, poise: 26, atk: ['grab', 'claw'], desic: 1, look: { cloth: 0x4a4438, pants: 0x2a2620, skin: 0x8c8880, hair: 0x4a4640, torn: 1, long: 1 } },
  stalker: { n: 'Nest Vampire', rig: 'human', fam: 'vampire', line: 'corvin', hp: 64, dmg: 14, spd: 6.8, xp: 20, poise: 30, atk: ['lunge', 'claw', 'grab'], strafe: 1, look: { cloth: 0x1c1c26, pants: 0x101014, skin: 0xc8c0b8, hair: 0x101010, coat: 1 } },
  elder: { n: 'Elder Vampire', rig: 'human', fam: 'vampire', ring: 1, hp: 125, dmg: 19, spd: 6.6, xp: 40, poise: 60, atk: ['dashchain', 'claw3', 'snap', 'gaze'], strafe: 1, scale: 1.1, look: { cloth: 0x4a0f18, pants: 0x101014, skin: 0xd8d0c8, hair: 0xc8c0b0, cape: 1 }, gold: 2 },
  thrall: { n: 'Sired Fledgling', rig: 'human', fam: 'vampire', line: 'corvin', hp: 34, dmg: 9, spd: 6.4, xp: 8, poise: 12, atk: ['claw'], look: { cloth: 0x302830, pants: 0x1a1a20, skin: 0xa8a098 } },
  cultist: { n: 'Hollow Cultist', rig: 'human', fam: 'witch', hp: 40, dmg: 12, spd: 4.2, xp: 15, poise: 16, atk: ['firebolt'], ranged: 1, look: { cloth: 0x2a2038, pants: 0x18141c, hood: 1, w: 'wStaff' } },
  warlock: { n: 'Coven Warlock', rig: 'human', fam: 'witch', hp: 76, dmg: 16, spd: 4.2, xp: 30, poise: 26, atk: ['firebolt', 'tk', 'boundary', 'aneurysm'], ranged: 1, look: { cloth: 0x501828, pants: 0x18141c, hood: 1, w: 'wStaff' }, gold: 2 },
  shade: { n: 'Restless Spirit', rig: 'shade', fam: 'spirit', hp: 38, dmg: 12, spd: 5.2, xp: 16, poise: 10, atk: ['touch'], float: 1 },
  werewolf: { n: 'Werewolf', pl: 'Werewolves', rig: 'wolf', fam: 'wolf', full: 1, venom: 1, eyes: 0xffd040, hp: 170, dmg: 23, spd: 8.2, xp: 60, poise: 80, atk: ['wbite', 'pounce', 'charge'], strafe: 1, r: 0.85, scale: 1.5, tint: { fur: 0x3c3834, furDark: 0x1c1a18 }, gold: 2 },
  packrunner: { n: 'Falls Pack Runner', rig: 'human', fam: 'wolf', onlyVs: ['vampire', 'hybrid'], eyes: 0xffd040, hp: 68, dmg: 14, spd: 5.8, xp: 22, poise: 36, atk: ['slash', 'lunge'], strafe: 1, look: { cloth: 0x5a3a2a, pants: 0x2a3040, hair: 0x2a1c12, w: 'wAxe' }, gold: 1.5 },
  hybrid: { n: 'Sired Hybrid', rig: 'human', fam: 'hybrid', hybrid: 1, venom: 1, need: 'corvinAwake', line: 'corvin', eyes: 0xffc020, hp: 110, dmg: 18, spd: 6.8, xp: 44, poise: 50, atk: ['wbite', 'claw3', 'lunge'], strafe: 1, look: { cloth: 0x2a3a2a, pants: 0x14161a, skin: 0xcabcae, hair: 0x2a1c12, coat: 1 }, gold: 2 },
  hunter: { n: 'Council Hunter', rig: 'human', fam: 'human', onlyVs: ['vampire', 'hybrid'], verv: 1, hp: 74, dmg: 14, spd: 5, xp: 22, poise: 34, atk: ['xbolt', 'stab', 'vgren'], ranged: 1, look: { cloth: 0x4a4230, pants: 0x1c1a16, hat: 1, w: 'crossbow', armor: 1 } },
  fivehunter: { n: 'Hunter of the Five', pl: 'Hunters of the Five', rig: 'human', fam: 'human', five: 1, verv: 1, onlyVs: ['vampire', 'hybrid'], hp: 140, dmg: 19, spd: 6, xp: 70, poise: 70, atk: ['xbolt', 'stab', 'lunge', 'vgren'], ranged: 1, scale: 1.06, look: { cloth: 0x2c2c2c, pants: 0x1a1a1a, hair: 0x15100e, w: 'crossbow', armor: 1 }, gold: 3 },
  /* bosses */
  warden: { n: 'The Warden', boss: 1, rig: 'human', fam: 'vampire', ring: 1, hp: 620, dmg: 20, spd: 5, xp: 400, poise: 160, scale: 1.7, atk: ['gslash', 'slam', 'charge', 'grab'], look: { cloth: 0x2a2c34, pants: 0x14161c, skin: 0x9a9690, hair: 0x101010, armor: 1, w: 'wGreat' }, r: 0.9, sub: "Sealed under Fell's Church since 1864" },
  corvin: { n: 'Corvin, the First', boss: 1, rig: 'human', fam: 'original', original: 1, hybrid: 1, venom: 1, weak: { wolfsbane: 1.3 }, eyes: 0xffc020, hp: 900, dmg: 23, spd: 6.8, xp: 900, poise: 160, scale: 1.35, atk: ['dashchain', 'claw3', 'wbite', 'grab', 'gaze', 'debris', 'summon'], add: 'thrall', look: { cloth: 0x5a0a14, pants: 0x0c0c10, skin: 0xe0d8d0, hair: 0xb89a5a, coat: 1 }, sub: 'The Original hybrid. A thousand years old' },
  alpha: { n: 'Old Tobias, the Alpha', boss: 1, rig: 'wolf', fam: 'wolf', full: 1, venom: 1, eyes: 0xffd040, hp: 560, dmg: 20, spd: 7.8, xp: 500, poise: 150, scale: 1.9, atk: ['wbite', 'pounce', 'charge', 'howl'], add: 'werewolf', addHp: 0.35, addDmg: 0.7, r: 1.1, tint: { fur: 0x8a8680, furDark: 0x4a4844 }, sub: 'Alpha of the Falls pack' },
  ambrose: { n: 'Ambrose Varga', boss: 1, rig: 'human', fam: 'vampire', line: 'corvin', hp: 700, dmg: 21, spd: 6.8, xp: 700, poise: 130, scale: 1.2, atk: ['dashchain', 'claw3', 'snap', 'grab'], look: { cloth: 0x6a1019, pants: 0x0c0c10, skin: 0xeadccb, hair: 0xc9c2b0, coat: 1 }, sub: "Turned in 1864. Of Corvin's line" },
  lenore: { n: 'Mother Lenore', boss: 1, rig: 'human', fam: 'vampire', line: 'corvin', hp: 600, dmg: 19, spd: 6.2, xp: 520, poise: 120, scale: 1.25, atk: ['claw3', 'grab', 'dashchain', 'debris', 'summon'], add: 'feral', look: { cloth: 0x1a2a22, pants: 0x101014, skin: 0xd0d8c8, hair: 0x808880, long: 1, cape: 1 }, sub: 'Matron of the quarry nest' },
  matriarch: { n: 'The Hundred', boss: 1, rig: 'shade', fam: 'spirit', hp: 640, dmg: 21, spd: 5.4, xp: 600, poise: 100, scale: 1.7, atk: ['firebolt', 'tk', 'boundary', 'quake', 'summon', 'blink', 'aneurysm'], add: 'shade', float: 1, sub: 'A hundred burned witches, one voice' },
  sleeper: { n: 'The Sleeper', boss: 1, rig: 'human', fam: 'original', original: 1, immortal: 1, desic: 1, hp: 1000, dmg: 25, spd: 5.6, xp: 1600, poise: 180, scale: 1.3, atk: ['grab', 'claw3', 'slam', 'debris', 'gaze', 'dashchain'], look: { cloth: 0x3a3630, pants: 0x24211c, skin: 0x7c7870, hair: 0x5a564e, long: 1, torn: 1 }, sub: 'Sealed in with the Cure. Two thousand years without a drop' },
  casimir: { n: 'Casimir', boss: 1, rig: 'human', fam: 'original', original: 1, ring: 1, hp: 950, dmg: 24, spd: 7, xp: 1200, poise: 170, scale: 1.3, atk: ['dashchain', 'claw3', 'snap', 'grab', 'gaze', 'debris'], look: { cloth: 0x1a1c24, pants: 0x0e0e12, skin: 0xe2d6c8, hair: 0x2a1c12, coat: 1 }, sub: "An Original. Corvin's elder brother" },
};
/* damage multipliers by enemy family and damage type (o.mat); anything missing is 1. Silver is not a type: it does nothing to anyone. 'wolfsbane' is the tenth type, for the
   wolfsbane grenade. No entry is 0 (hit() treats 0 as "missing"); 0.05 means "as good as nothing". Killing rules (a stake through the heart, fire, a head, a heart) are not
   multipliers: see SPEC rule 3. whiteoak is ordinary wood to everything except an Original. A def may override with def.weak. */
const WEAK = {
  human: { verv: 0.3, wolfsbane: 0.3, venom: 0.05 },
  witch: { verv: 0.3, wolfsbane: 0.3, venom: 0.05 },
  animal: { verv: 0.3, wolfsbane: 0.3, venom: 0.05 },
  vampire: { wood: 1.5, whiteoak: 1.5, fire: 1.4, verv: 1.6, venom: 1.5, wolfsbane: 0.3 },
  original: { wood: 1.15, whiteoak: 2, fire: 1.15, verv: 1.3, ash: 1.5, venom: 0.05, wolfsbane: 0.3 },
  wolf: { wolfsbane: 1.6, verv: 0.3, venom: 0.05 },
  hybrid: { verv: 1.6, wolfsbane: 1.5, wood: 1.15, whiteoak: 1.15, fire: 1.2, venom: 0.05 },
  spirit: { magic: 1.4, wood: 0.8, whiteoak: 0.8, steel: 0.8, ash: 0.8, bite: 0.8, fire: 0.8, venom: 0.05, verv: 0.05, wolfsbane: 0.05 },
};
const ELITE = [['Swift', e => { e.spdM = 1.3; }], ['Hulking', e => { e.maxHp *= 1.8; e.hp = e.maxHp; e.rig.g.scale.multiplyScalar(1.18); }], ['Vicious', e => { e.dmgM = 1.35; }], ['Ravenous', e => { e.leech = 0.5; }], ['Unyielding', e => { e.maxPoise *= 3; e.poise = e.maxPoise; }], ['Volatile', e => { e.volatile = 1; }]];

/* ---------------- geography ---------------- */
const POI = [
  { id: 'town', n: 'Mystic Falls', x: -6, z: 22 }, { id: 'cem', n: 'Old Cemetery', x: -104, z: 40 }, { id: 'chapel', n: "Fell's Church", x: -130, z: -146 }, { id: 'hollow', n: 'Coven Hollow', x: -20, z: -226 },
  { id: 'falls', n: 'The Falls', x: 178, z: -200 }, { id: 'bridge', n: 'Wickery Bridge', x: 186, z: -40 }, { id: 'manor', n: 'Varga Manor', x: 221, z: -45 }, { id: 'quarry', n: 'Blackridge Quarry', x: 128, z: 168 },
  { id: 'farm', n: 'Abel Farm', x: 14, z: 196 }, { id: 'lake', n: 'Dunham Lake', x: -118, z: 160 }, { id: 'camp', n: "Hunters' Camp", x: -214, z: -70 },
];
/* spawn tables. day: no vampire is ever out in the sun (hybrids are, once Corvin has made some). night: after dark. full: the whole table on a full-moon night, replacing night
   (the Falls pack has all turned). spawnTable(zone) in 40-systems picks the right one and filters by def.full and def.need. */
const ZONES = [
  { id: 'town', n: 'Mystic Falls', lvl: 1, r: [-72, -62, 82, 128], safe: 1 }, { id: 'camp', n: "Hunters' Camp", lvl: 5, c: [-230, -70, 24], safe: 1 },
  { id: 'cem', n: 'Old Cemetery', lvl: 2, r: [-196, -2, -104, 82], day: ['robber'], night: ['feral', 'feral', 'shade'], max: 5 },
  { id: 'chapel', n: "Fell's Church Ruins", lvl: 6, c: [-130, -170, 36], day: ['cultist', 'robber'], night: ['cultist', 'shade', 'tombvamp', 'feral'], max: 5 },
  { id: 'hollow', n: 'Coven Hollow', lvl: 12, c: [-20, -245, 36], day: ['shade', 'cultist'], night: ['shade', 'warlock', 'shade'], max: 6 },
  { id: 'falls', n: 'The Falls', lvl: 9, c: [190, -226, 52], day: ['wolf', 'deer', 'packrunner'], night: ['packrunner', 'wolf', 'packrunner'], full: ['werewolf', 'werewolf', 'wolf'], max: 5 },
  { id: 'quarry', n: 'Blackridge Quarry', lvl: 14, c: [150, 185, 50], day: ['robber'], night: ['stalker', 'elder', 'feral'], max: 7 },
  { id: 'lake', n: 'Dunham Lake', lvl: 7, c: [-170, 190, 78], day: ['wolf', 'robber', 'deer'], night: ['feral', 'stalker', 'wolf'], max: 5 },
  { id: 'farm', n: 'Abel Farm', lvl: 3, r: [-24, 168, 92, 262], day: ['deer'], night: ['wolf', 'feral'], max: 4 },
  { id: 'manor', n: 'Varga Manor', lvl: 16, r: [214, -96, 288, -4], safe: 1 },
  { id: 'east', n: 'The East Bank', lvl: 16, r: [212, -292, 292, 292], day: ['wolf', 'deer', 'hybrid'], night: ['elder', 'stalker', 'warlock', 'hybrid'], full: ['werewolf', 'werewolf', 'elder', 'hybrid'], max: 6 },
  { id: 'woods', n: 'Whispering Woods', lvl: 4, r: [-292, -292, 196, -64], day: ['wolf', 'deer', 'deer'], night: ['feral', 'wolf', 'stalker'], full: ['werewolf', 'wolf', 'feral'], max: 6 },
  { id: 'wild', n: 'The Outskirts', lvl: 2, r: [-999, -999, 999, 999], day: ['deer', 'wolf', 'deer'], night: ['feral', 'wolf'], full: ['wolf', 'werewolf', 'feral'], max: 4 },
];
const MOON = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
const TITLES = [[1, 'Newcomer'], [5, 'Local'], [10, 'Night Owl'], [15, 'Hunter'], [20, 'Slayer'], [30, 'Legend of the Falls'], [40, 'Nightmare'], [50, 'Apex'], [75, 'Myth'], [100, 'First of a New Line']];

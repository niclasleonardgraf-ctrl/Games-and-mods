/* Hollow Moon — data: items, affixes, skills, enemies, zones. Balance lives here. */
const RAR = [{ n: 'Common', c: '#b8b2a6', m: 1, aff: 0 }, { n: 'Uncommon', c: '#6fbf73', m: 1.12, aff: 1 }, { n: 'Rare', c: '#5b9cf0', m: 1.26, aff: 2 }, { n: 'Epic', c: '#b678f0', m: 1.42, aff: 3 }, { n: 'Legendary', c: '#f0a13c', m: 1.62, aff: 4 }, { n: 'Relic', c: '#e2334a', m: 1.8, aff: 0 }];
const lvlScale = l => (1 + 0.14 * (l - 1)) * Math.pow(1.028, l - 1);          // item + enemy damage curve
const hpScale = l => (1 + 0.2 * (l - 1)) * Math.pow(1.04, l - 1);             // enemy health curve
const xpNeed = l => Math.floor(70 * Math.pow(l, 1.65));

const BASES = {
  stake: { n: 'Oak Stake', slot: 'weapon', cls: 'fast', dmg: 8, mat: 'wood', model: 'wStake' }, dagger: { n: 'Hunting Knife', slot: 'weapon', cls: 'fast', dmg: 9, mat: 'steel', model: 'wDagger' },
  silverd: { n: 'Silver Dagger', slot: 'weapon', cls: 'fast', dmg: 8.5, mat: 'silver', model: 'wDagger', min: 5 }, bat: { n: 'Ash Bat', slot: 'weapon', cls: 'med', dmg: 12, mat: 'wood', model: 'wBat' },
  sword: { n: 'Sabre', slot: 'weapon', cls: 'med', dmg: 13, mat: 'steel', model: 'wSword', min: 3 }, silvers: { n: 'Silvered Blade', slot: 'weapon', cls: 'med', dmg: 12.5, mat: 'silver', model: 'wSword', min: 8 },
  axe: { n: "Woodsman's Axe", slot: 'weapon', cls: 'slow', dmg: 18, mat: 'steel', model: 'wAxe', min: 2 }, great: { n: 'Greatsword', slot: 'weapon', cls: 'slow', dmg: 21, mat: 'steel', model: 'wGreat', min: 9 },
  maul: { n: 'Ironwood Maul', slot: 'weapon', cls: 'slow', dmg: 20, mat: 'wood', model: 'wBat', min: 7 }, staff: { n: 'Hawthorn Staff', slot: 'weapon', cls: 'staff', dmg: 10, mat: 'magic', model: 'wStaff' },
  xbow: { n: 'Crossbow', slot: 'ranged', dmg: 17, cd: 1.3, mat: 'wood', model: 'crossbow', pspd: 36 }, revolver: { n: 'Revolver', slot: 'ranged', dmg: 11, cd: 0.62, mat: 'wood', model: 'revolver', pspd: 52, min: 5 },
  knives: { n: 'Throwing Knives', slot: 'ranged', dmg: 7.5, cd: 0.38, mat: 'steel', model: 'wDagger', pspd: 30 },
  jacket: { n: 'Leather Jacket', slot: 'armor', def: 7, hp: 12 }, coat: { n: 'Long Coat', slot: 'armor', def: 5, hp: 8, st: 12 }, vest: { n: "Hunter's Vest", slot: 'armor', def: 10, hp: 18, min: 4 },
  robe: { n: 'Coven Robe', slot: 'armor', def: 4, hp: 6, fo: 22 }, mail: { n: 'Council Mail', slot: 'armor', def: 15, hp: 26, min: 9 },
  ring: { n: 'Ring', slot: 'ring' }, signet: { n: 'Signet', slot: 'ring' }, band: { n: 'Iron Band', slot: 'ring' }, amulet: { n: 'Amulet', slot: 'amulet' }, locket: { n: 'Locket', slot: 'amulet' }, talisman: { n: 'Talisman', slot: 'amulet' },
};
const CLS = {   // melee move sets: [duration, damage mult] per combo hit; heavy attack
  fast: { hits: [[0.24, 0.8], [0.24, 0.8], [0.32, 1.25]], range: 2.5, arc: 1.5, heavy: { kind: 'lunge', dur: 0.5, mult: 2.1, st: 22 }, poise: 12, st: 0 },
  med: { hits: [[0.34, 1], [0.34, 1], [0.46, 1.5]], range: 3.0, arc: 2.1, heavy: { kind: 'over', dur: 0.7, mult: 2.5, st: 28 }, poise: 22, st: 0 },
  slow: { hits: [[0.48, 1.3], [0.48, 1.3], [0.62, 1.9]], range: 3.5, arc: 2.6, heavy: { kind: 'spin', dur: 0.8, mult: 2.2, st: 34 }, poise: 38, st: 0 },
  staff: { hits: [[0.36, 1], [0.36, 1], [0.48, 1.4]], range: 3.0, arc: 2.0, heavy: { kind: 'blast', dur: 0.75, mult: 2.4, st: 20 }, poise: 14, st: 0, bolt: true },
};
/* affixes: [key, label, min, max, perLevelGrowth, slots] */
const AFF = [
  ['dmg', 'Savage', 3, 7, 0.06, 'weapon ranged ring amulet'], ['crit', 'Keen', 2, 5, 0.03, 'weapon ranged ring amulet'], ['critd', 'Cruel', 8, 18, 0.25, 'weapon ranged ring'],
  ['hp', 'Stalwart', 8, 18, 1.6, 'armor ring amulet'], ['st', 'Tireless', 6, 14, 0.5, 'armor ring'], ['fo', 'Arcane', 8, 16, 0.6, 'armor amulet weapon'],
  ['def', 'Warded', 3, 7, 0.5, 'armor ring'], ['ls', 'Leeching', 1, 2.5, 0.02, 'weapon ring'], ['spd', 'Fleet', 2, 5, 0.03, 'armor amulet'], ['as', 'Quick', 3, 7, 0.04, 'weapon ring'],
  ['cdr', 'Focused', 3, 6, 0.04, 'amulet ring weapon'], ['xp', 'Learned', 4, 8, 0.05, 'amulet ring'], ['gold', 'Gilded', 8, 16, 0.2, 'amulet ring armor'], ['mf', 'Fortunate', 5, 10, 0.15, 'amulet ring'],
  ['regen', 'Mending', 0.3, 0.7, 0.03, 'armor amulet'], ['vsV', 'Slaying', 8, 16, 0.15, 'weapon ranged'], ['vsW', 'Moonbane', 8, 16, 0.15, 'weapon ranged'], ['vsS', 'Hallowed', 8, 16, 0.15, 'weapon ranged amulet'],
  ['spell', 'Witching', 5, 10, 0.12, 'weapon amulet ring armor'], ['burn', 'Smouldering', 3, 6, 0.5, 'weapon ranged'], ['thorns', 'Barbed', 3, 6, 0.6, 'armor'],
  ['mig', 'of Might', 1, 3, 0.12, 'weapon armor ring amulet'], ['fin', 'of Finesse', 1, 3, 0.12, 'weapon ranged armor ring amulet'], ['vig', 'of Vigor', 1, 3, 0.12, 'armor ring amulet'], ['wil', 'of Will', 1, 3, 0.12, 'weapon armor ring amulet'],
];
const AFFD = { dmg: '+{v}% damage', crit: '+{v}% critical chance', critd: '+{v}% critical damage', hp: '+{v} health', st: '+{v} stamina', fo: '+{v} focus', def: '+{v} armour', ls: '{v}% life steal', spd: '+{v}% movement speed', as: '+{v}% attack speed', cdr: '{v}% faster cooldowns', xp: '+{v}% experience', gold: '+{v}% gold found', mf: '+{v}% better loot', regen: '+{v} health per second', vsV: '+{v}% damage to vampires', vsW: '+{v}% damage to wolves', vsS: '+{v}% damage to spirits', spell: '+{v}% spell power', burn: '{v} fire damage on hit', thorns: '{v} damage to attackers', mig: '+{v} Might', fin: '+{v} Finesse', vig: '+{v} Vigor', wil: '+{v} Will' };
const UNIQ = {
  daylight: { n: 'Daylight Ring', base: 'ring', aff: [['hp', 30], ['regen', 1]], d: 'A vampire who wears it may walk in the sun.' },
  whiteoak: { n: 'White Oak Stake', base: 'stake', mult: 1.5, aff: [['vsV', 100], ['crit', 10]], d: 'Cut from the one tree that can end anything.' },
  compass: { n: "Founder's Compass", base: 'amulet', aff: [['mf', 25], ['crit', 6]], d: 'The needle swings toward anything that hunts. Enemies show on your map.' },
  moonstone: { n: 'Moonstone Pendant', base: 'amulet', aff: [['vsW', 40], ['def', 15], ['hp', 40]], d: 'Under a full moon, all your damage rises by a quarter.' },
  halebow: { n: "Hale's Crossbow", base: 'xbow', mult: 1.4, aff: [['vsV', 30], ['crit', 8]], d: 'Thirty years of practice in the stock. Bolts pierce.' },
  corvin: { n: "Corvin's Signet", base: 'signet', aff: [['ls', 6], ['dmg', 18], ['critd', 30]], d: 'It remembers the first night. A fifth more damage after dark.' },
  wardblade: { n: "Warden's Oath", base: 'great', mult: 1.35, aff: [['def', 20], ['dmg', 12]], d: 'Heavy blows send a shockwave through the stone.' },
  grimoire: { n: 'Thorne Grimoire', base: 'talisman', aff: [['spell', 35], ['fo', 40], ['cdr', 12]], d: 'Nine generations of marginalia.' },
  ripper: { n: "Ripper's Band", base: 'band', aff: [['dmg', 10], ['ls', 3]], d: 'Two percent more damage for every ten humanity you have lost.' },
  alphafang: { n: "Alpha's Fang", base: 'dagger', mult: 1.3, aff: [['as', 15], ['crit', 12], ['burn', 0]], d: 'Still warm. Strikes cause bleeding.' },
};
const CONS = {
  draught: { n: 'Healing Draught', d: 'Restores 40% of your health.', price: 28, icon: '✚' }, tonic: { n: 'Focus Tonic', d: 'Restores 60% of your focus.', price: 30, icon: '✦' },
  bloodbag: { n: 'Blood Bag', d: 'Vampires only. Restores 50 blood and a quarter of your health.', price: 40, icon: '♥' }, burger: { n: 'Grill Special', d: 'A minute of steady healing. Humans only.', price: 12, icon: '◉' },
  vervain: { n: 'Vervain Sprig', d: 'Coat your weapon: +35% damage to vampires for 90 seconds. Burns a vampire who uses it.', price: 14, icon: '❋' },
  wolfsbane: { n: 'Wolfsbane', d: 'Coat your weapon: +35% damage to wolves for 90 seconds.', price: 14, icon: '❋' }, sage: { n: 'White Sage', d: 'Burn it: restores health slowly and lifts every affliction.', price: 10, icon: '❋' },
  scrap: { n: 'Scrap', d: 'Salvage. The Council armourer uses it to reforge gear.', price: 3, icon: '▣' }, vblood: { n: 'Vial of Vampire Blood', d: 'Heals you completely. If you die with it in your veins, you come back. Changed.', price: 0, icon: '♦', quest: 1 },
  cure: { n: 'The Cure', d: 'One dose. Makes a vampire human again.', price: 0, icon: '♦', quest: 1 }, lapisq: { n: 'Lapis Lazuli', d: 'A witch can bind the sun into it.', price: 0, icon: '◆', quest: 1 },
  elderblood: { n: 'Blood of the First', d: "Corvin's blood. It hums. Several people want it.", price: 0, icon: '♦', quest: 1 }, locket: { n: 'Tarnished Locket', d: 'Engraved: E.F., 1864.', price: 0, icon: '◆', quest: 1 },
};

/* ---------------- skills ---------------- */
const SK = {
  h_weapon: { tree: 'hunter', n: 'Weapon Training', max: 5, req: 0, d: r => `+${6 * r}% melee damage.` },
  h_marks: { tree: 'hunter', n: 'Marksman', max: 5, req: 0, d: r => `+${8 * r}% ranged damage, ${5 * r}% faster reload.` },
  h_cond: { tree: 'hunter', n: 'Conditioning', max: 5, req: 0, d: r => `+${10 * r} stamina, +${8 * r}% stamina recovery.` },
  h_parry: { tree: 'hunter', n: 'Riposte', max: 3, req: 2, d: r => `A wider parry window. Your next hit after a parry deals +${50 * r}% damage.` },
  h_gren: { tree: 'hunter', n: 'Vervain Grenade', max: 3, req: 3, act: 1, cd: 14, cost: { st: 20 }, d: r => `Throw a grenade: ${120 + 40 * r}% weapon damage in an area. Vampires are stunned for ${1 + r} seconds.` },
  h_heart: { tree: 'hunter', n: 'Heartseeker', max: 3, req: 5, act: 1, cd: 10, cost: { st: 25 }, d: r => `Lunge and strike for ${260 + 40 * r}%. Kills ordinary enemies below ${15 + 5 * r}% health outright.` },
  h_whirl: { tree: 'hunter', n: 'Whirlwind', max: 3, req: 8, act: 1, cd: 9, cost: { st: 30 }, d: r => `Spin, hitting everything around you ${2 + r} times for 80% weapon damage.` },
  h_volley: { tree: 'hunter', n: 'Volley', max: 3, req: 10, act: 1, cd: 11, cost: { st: 22 }, d: r => `Loose ${3 + 2 * r} shots in a fan.` },
  h_second: { tree: 'hunter', n: 'Second Wind', max: 3, req: 12, d: r => `Falling below 30% health heals ${10 + 10 * r}% once every 90 seconds.` },
  h_slayer: { tree: 'hunter', n: "Slayer's Momentum", max: 5, req: 15, d: r => `Each kill grants +${2 + r}% damage for 10 seconds, stacking five times.` },
  h_five: { tree: 'hunter', n: 'Brotherhood', max: 1, req: 25, d: () => '+25% damage to vampires, wolves and spirits. Compulsion and stuns last half as long on you.' },
  w_attune: { tree: 'witch', n: 'Attunement', max: 5, req: 0, d: r => `+${8 * r}% spell power, +${10 * r} focus.` },
  w_chan: { tree: 'witch', n: 'Channeling', max: 5, req: 0, d: r => `+${12 * r}% focus recovery.` },
  w_incend: { tree: 'witch', n: 'Incendia', max: 5, req: 0, act: 1, cd: 6, cost: { fo: 22 }, d: r => `A cone of fire for ${140 + 30 * r}% spell damage. Sets enemies and the ground alight.` },
  w_aneur: { tree: 'witch', n: 'Aneurysm', max: 3, req: 3, act: 1, cd: 12, cost: { fo: 30 }, d: r => `Every enemy near you is stunned for ${1.5 + 0.5 * r}s and takes ${80 + 30 * r}% spell damage.` },
  w_ward: { tree: 'witch', n: 'Ward', max: 3, req: 5, act: 1, cd: 16, cost: { fo: 25 }, d: r => `A barrier that absorbs damage equal to ${20 + 10 * r}% of your health for 8 seconds.` },
  w_mend: { tree: 'witch', n: 'Mend', max: 3, req: 5, act: 1, cd: 18, cost: { fo: 30 }, d: r => `Heal ${20 + 10 * r}% of your health over 4 seconds.` },
  w_temp: { tree: 'witch', n: 'Tempest', max: 3, req: 10, act: 1, cd: 9, cost: { fo: 34 }, d: r => `Lightning leaps between ${3 + r} enemies for ${150 + 30 * r}% spell damage.` },
  w_herb: { tree: 'witch', n: 'Herbalist', max: 3, req: 4, d: r => `Draughts, tonics and herbs are ${15 * r}% stronger. Herb patches yield one more.` },
  w_spirit: { tree: 'witch', n: 'Ancestral Favour', max: 5, req: 12, d: r => `+${3 * r}% critical chance with spells. Kills restore ${3 * r} focus.` },
  w_express: { tree: 'witch', n: 'Expression', max: 1, req: 25, d: () => '+30% spell power. With no focus left, spells are paid for in health.' },
  v_pred: { tree: 'vampire', n: 'Predator', max: 5, req: 0, d: r => `+${5 * r}% melee damage, ${r}% life steal.` },
  v_heal: { tree: 'vampire', n: 'Healing Factor', max: 5, req: 0, d: r => `Regenerate ${(0.4 * r).toFixed(1)}% of your health every second while you have blood.` },
  v_blur: { tree: 'vampire', n: 'Blur', max: 3, req: 0, d: r => `Your dodge travels ${20 * r}% further${r >= 3 ? ' and cuts everything you pass through' : ''}.` },
  v_frenzy: { tree: 'vampire', n: 'Feeding Frenzy', max: 3, req: 0, act: 1, cd: 8, cost: {}, d: r => `Leap onto an enemy and feed: ${180 + 40 * r}% damage, heals you and restores ${20 + 5 * r} blood.` },
  v_compel: { tree: 'vampire', n: 'Compulsion', max: 3, req: 3, act: 1, cd: 22, cost: { bl: 18 }, d: r => `An enemy fights for you for ${8 + 4 * r} seconds. Bosses are stunned briefly instead. Vervain protects.` },
  v_step: { tree: 'vampire', n: 'Shadow Step', max: 3, req: 6, act: 1, cd: 9, cost: { bl: 12 }, d: r => `Vanish, reappear behind your target and strike for ${220 + 60 * r}%, always critical.` },
  v_ripper: { tree: 'vampire', n: 'The Switch', max: 3, req: 10, act: 1, cd: 40, cost: { bl: 10 }, d: r => `Turn it off for 12 seconds: +${30 + 15 * r}% damage, +25% speed, +5% life steal. Costs 2 humanity.` },
  v_sense: { tree: 'vampire', n: "Predator's Senses", max: 3, req: 4, d: r => `+${4 * r}% critical chance. You hear heartbeats: enemies show on your map.` },
  v_night: { tree: 'vampire', n: 'Nightwalker', max: 5, req: 12, d: r => `After dark: +${4 * r}% damage and +${2 * r}% speed.` },
  v_elder: { tree: 'vampire', n: 'Elder Blood', max: 5, req: 25, d: r => `+${6 * r}% health, damage and blood.` },
};
const TREES = { hunter: { n: 'Hunter', d: 'Steel, oak and nerve. Open to anyone.' }, witch: { n: 'Witch', d: "The Thorne line's craft. Lost to those who turn, unless they find another way." }, vampire: { n: 'Vampire', d: 'Only the dead may learn this.' } };
const ASC = { pow: { n: 'Power', d: '+2% damage per rank' }, vit: { n: 'Vitality', d: '+2% health per rank' }, swi: { n: 'Swiftness', d: '+1% cooldown recovery and attack speed per rank' }, fort: { n: 'Fortune', d: '+2% better loot and gold per rank' } };
const ascCost = r => 4 + r * 3 + Math.floor(r * r * 0.35);

/* ---------------- enemies ---------------- */
/* attacks: kind melee|lunge|slam|shoot|nova|blink|summon. dmg is a multiplier of the enemy's damage. */
const ATK = {
  slash: { kind: 'melee', range: 2.6, arc: 1.7, wind: 0.5, rec: 0.6, dmg: 1, cd: 1.3 }, claw: { kind: 'melee', range: 2.4, arc: 1.6, wind: 0.34, rec: 0.25, dmg: 0.7, cd: 1.2, reps: 2 },
  claw3: { kind: 'melee', range: 2.6, arc: 1.8, wind: 0.3, rec: 0.2, dmg: 0.7, cd: 1.6, reps: 3 }, touch: { kind: 'melee', range: 2.2, arc: 2.2, wind: 0.6, rec: 0.7, dmg: 1, cd: 1.5 },
  bite: { kind: 'lunge', range: 6.5, min: 2, dist: 6, w: 1.3, wind: 0.42, rec: 0.7, dmg: 1, cd: 2.2 }, lunge: { kind: 'lunge', range: 10, min: 3.5, dist: 10, w: 1.5, wind: 0.5, rec: 0.8, dmg: 1.3, cd: 3.4 },
  charge: { kind: 'lunge', range: 16, min: 5, dist: 17, w: 2.4, wind: 0.85, rec: 1.2, dmg: 1.5, cd: 6 }, leap: { kind: 'slam', range: 11, min: 4, r: 3.4, wind: 0.75, rec: 0.9, dmg: 1.4, cd: 5, jump: 1 },
  slam: { kind: 'slam', range: 3.6, r: 4.6, wind: 0.8, rec: 0.9, dmg: 1.3, cd: 4.5 }, quake: { kind: 'slam', range: 14, r: 3.2, wind: 0.9, rec: 0.6, dmg: 1.2, cd: 7, multi: 4 },
  gslash: { kind: 'melee', range: 4.4, arc: 2.4, wind: 0.6, rec: 0.6, dmg: 1.1, cd: 1.6 }, bolt: { kind: 'shoot', range: 15, min: 3, wind: 0.5, rec: 0.5, dmg: 0.9, cd: 2.2, n: 1, spd: 15, col: 0x9a6bff },
  bolt3: { kind: 'shoot', range: 15, min: 2, wind: 0.6, rec: 0.6, dmg: 0.8, cd: 3.2, n: 3, spread: 0.24, spd: 15, col: 0x9a6bff }, xbolt: { kind: 'shoot', range: 17, min: 4, wind: 0.55, rec: 0.6, dmg: 1, cd: 2, n: 1, spd: 30, col: 0xe8c890, wood: 1 },
  fan: { kind: 'shoot', range: 16, wind: 0.7, rec: 0.6, dmg: 0.8, cd: 5, n: 7, spread: 0.2, spd: 13, col: 0xff3050 }, nova: { kind: 'nova', range: 14, wind: 0.9, rec: 0.8, dmg: 0.9, cd: 8, n: 16, spd: 10, col: 0xff3050 },
  blink: { kind: 'blink', range: 16, min: 5, wind: 0.25, rec: 0.15, cd: 5 }, summon: { kind: 'summon', range: 30, wind: 1, rec: 0.6, cd: 16, n: 2 }, stab: { kind: 'melee', range: 2.3, arc: 1.2, wind: 0.4, rec: 0.5, dmg: 1.1, cd: 1.4 },
  howl: { kind: 'summon', range: 30, wind: 1.1, rec: 0.5, cd: 20, n: 3 },
};
const EN = {
  robber: { n: 'Grave Robber', rig: 'human', fam: 'human', hp: 36, dmg: 8, spd: 4.6, xp: 10, poise: 20, atk: ['slash'], look: { cloth: 0x5a5040, pants: 0x2a2620, hat: 1, w: 'wBat' }, gold: 1.5 },
  wolf: { n: 'Timber Wolf', rig: 'wolf', fam: 'wolf', hp: 28, dmg: 9, spd: 7.4, xp: 9, poise: 14, atk: ['bite'], strafe: 1, r: 0.6, tint: { fur: 0x6a6a70, furDark: 0x3a3a40 } },
  feral: { n: 'Feral Vampire', rig: 'human', fam: 'vampire', hp: 46, dmg: 11, spd: 6.1, xp: 14, poise: 22, atk: ['claw'], look: { cloth: 0x3a3a44, pants: 0x1a1a20, skin: 0xb8b0a8, hair: 0x201818, w: 'wClaws', torn: 1 } },
  stalker: { n: 'Night Stalker', rig: 'human', fam: 'vampire', hp: 64, dmg: 14, spd: 6.8, xp: 20, poise: 30, atk: ['lunge', 'claw'], strafe: 1, look: { cloth: 0x1c1c26, pants: 0x101014, skin: 0xc8c0b8, hair: 0x101010, coat: 1, w: 'wClaws' } },
  elder: { n: 'Elder Vampire', rig: 'human', fam: 'vampire', hp: 125, dmg: 19, spd: 6.6, xp: 40, poise: 60, atk: ['lunge', 'claw3', 'blink'], strafe: 1, scale: 1.1, look: { cloth: 0x4a0f18, pants: 0x101014, skin: 0xd8d0c8, hair: 0xc8c0b0, cape: 1, w: 'wSword' }, gold: 2 },
  cultist: { n: 'Hollow Cultist', rig: 'human', fam: 'human', hp: 40, dmg: 12, spd: 4.2, xp: 15, poise: 16, atk: ['bolt'], ranged: 1, look: { cloth: 0x2a2038, pants: 0x18141c, hood: 1, w: 'wStaff' } },
  warlock: { n: 'Coven Warlock', rig: 'human', fam: 'human', hp: 76, dmg: 16, spd: 4.2, xp: 30, poise: 26, atk: ['bolt3', 'slam', 'blink'], ranged: 1, look: { cloth: 0x501828, pants: 0x18141c, hood: 1, w: 'wStaff' }, gold: 2 },
  shade: { n: 'Shade', rig: 'shade', fam: 'spirit', hp: 38, dmg: 12, spd: 5.2, xp: 16, poise: 10, atk: ['touch'], float: 1 },
  werewolf: { n: 'Werewolf', rig: 'beast', fam: 'wolf', hp: 170, dmg: 23, spd: 7.6, xp: 60, poise: 80, atk: ['claw', 'leap'], strafe: 1, r: 0.8, gold: 2 },
  hunter: { n: 'Council Hunter', rig: 'human', fam: 'human', hp: 74, dmg: 14, spd: 5, xp: 22, poise: 34, atk: ['xbolt', 'stab'], ranged: 1, look: { cloth: 0x4a4230, pants: 0x1c1a16, hat: 1, w: 'crossbow', armor: 1 }, verv: 1 },
  thrall: { n: 'Blood Thrall', rig: 'human', fam: 'vampire', hp: 34, dmg: 9, spd: 6.4, xp: 8, poise: 12, atk: ['claw'], look: { cloth: 0x302830, pants: 0x1a1a20, skin: 0xa8a098, w: 'wClaws' } },
  deer: { n: 'Deer', rig: 'deer', fam: 'animal', hp: 20, dmg: 0, spd: 8, xp: 3, poise: 5, atk: [], peaceful: 1, r: 0.6 },
  /* bosses */
  warden: { n: 'The Warden', boss: 1, rig: 'human', fam: 'vampire', hp: 620, dmg: 20, spd: 5, xp: 400, poise: 160, scale: 1.7, atk: ['gslash', 'slam', 'charge'], look: { cloth: 0x2a2c34, pants: 0x14161c, skin: 0x9a9690, hair: 0x101010, armor: 1, w: 'wGreat', crown: 1 }, r: 0.9, sub: 'Jailer of the First Tomb' },
  corvin: { n: 'Corvin, First of the Line', boss: 1, rig: 'human', fam: 'vampire', hp: 820, dmg: 22, spd: 6.4, xp: 900, poise: 140, scale: 1.35, atk: ['lunge', 'claw3', 'fan', 'nova', 'blink', 'summon'], add: 'thrall', look: { cloth: 0x5a0a14, pants: 0x0c0c10, skin: 0xe0d8d0, hair: 0xe8e4dc, cape: 1, crown: 1, w: 'wClaws' }, sub: 'Nine centuries hungry' },
  alpha: { n: 'Old Tobias, the Alpha', boss: 1, rig: 'beast', fam: 'wolf', hp: 560, dmg: 20, spd: 7.8, xp: 500, poise: 150, scale: 1.3, atk: ['claw3', 'leap', 'charge', 'howl'], add: 'wolf', r: 1, sub: 'The Falls pack' },
  ambrose: { n: 'Ambrose Varga', boss: 1, rig: 'human', fam: 'vampire', hp: 700, dmg: 21, spd: 6.8, xp: 700, poise: 130, scale: 1.2, atk: ['lunge', 'claw3', 'blink', 'fan'], look: { cloth: 0x6a1019, pants: 0x0c0c10, skin: 0xeadccb, hair: 0xc9c2b0, coat: 1, w: 'wSword' }, sub: 'Your would-be sire' },
  lenore: { n: 'Mother Lenore', boss: 1, rig: 'human', fam: 'vampire', hp: 600, dmg: 19, spd: 6.2, xp: 520, poise: 120, scale: 1.25, atk: ['claw3', 'nova', 'summon', 'blink'], add: 'feral', look: { cloth: 0x1a2a22, pants: 0x101014, skin: 0xd0d8c8, hair: 0x808880, long: 1, cape: 1, w: 'wClaws' }, sub: 'Matron of the Quarry nest' },
  matriarch: { n: 'The Hollow Matriarch', boss: 1, rig: 'shade', fam: 'spirit', hp: 640, dmg: 21, spd: 5.4, xp: 600, poise: 100, scale: 1.7, atk: ['bolt3', 'nova', 'summon', 'blink', 'quake'], add: 'shade', float: 1, sub: 'A hundred witches, one voice' },
};
const WEAK = { vampire: { wood: 1.5, fire: 1.3, silver: 1 }, wolf: { silver: 1.6, wood: 1 }, spirit: { magic: 1.4, silver: 1.25, wood: 0.8, steel: 0.8 }, human: {}, animal: {} };
const ELITE = [['Swift', e => { e.spdM = 1.3; }], ['Hulking', e => { e.maxHp *= 1.8; e.hp = e.maxHp; e.rig.g.scale.multiplyScalar(1.18); }], ['Vicious', e => { e.dmgM = 1.35; }], ['Vampiric', e => { e.leech = 0.5; }], ['Unyielding', e => { e.maxPoise *= 3; e.poise = e.maxPoise; }], ['Volatile', e => { e.volatile = 1; }]];

/* ---------------- geography ---------------- */
const POI = [
  { id: 'town', n: 'Mystic Falls', x: -6, z: 22 }, { id: 'cem', n: 'Old Cemetery', x: -104, z: 40 }, { id: 'chapel', n: 'Fell Chapel', x: -130, z: -146 }, { id: 'hollow', n: 'Coven Hollow', x: -20, z: -226 },
  { id: 'falls', n: 'The Falls', x: 178, z: -200 }, { id: 'bridge', n: 'Wickery Bridge', x: 186, z: -40 }, { id: 'manor', n: 'Varga Manor', x: 221, z: -45 }, { id: 'quarry', n: 'Blackridge Quarry', x: 128, z: 168 },
  { id: 'farm', n: 'Abel Farm', x: 14, z: 196 }, { id: 'lake', n: 'Dunham Lake', x: -118, z: 160 }, { id: 'camp', n: "Hunters' Camp", x: -214, z: -70 },
];
const ZONES = [
  { id: 'town', n: 'Mystic Falls', lvl: 1, r: [-72, -62, 82, 128], safe: 1 }, { id: 'camp', n: "Hunters' Camp", lvl: 5, c: [-230, -70, 24], safe: 1 },
  { id: 'cem', n: 'Old Cemetery', lvl: 2, r: [-196, -2, -104, 82], day: ['robber'], night: ['feral', 'feral', 'shade'], max: 5 },
  { id: 'chapel', n: 'Fell Chapel Ruins', lvl: 6, c: [-130, -170, 36], day: ['cultist', 'robber'], night: ['cultist', 'shade', 'feral'], max: 5 },
  { id: 'hollow', n: 'Coven Hollow', lvl: 12, c: [-20, -245, 36], day: ['shade', 'cultist'], night: ['shade', 'warlock', 'shade'], max: 6 },
  { id: 'falls', n: 'The Falls', lvl: 9, c: [190, -226, 52], day: ['wolf', 'wolf', 'deer'], night: ['wolf', 'stalker'], full: ['werewolf', 'wolf'], max: 5 },
  { id: 'quarry', n: 'Blackridge Quarry', lvl: 14, c: [150, 185, 50], day: ['robber', 'stalker'], night: ['stalker', 'elder', 'feral'], max: 7 },
  { id: 'lake', n: 'Dunham Lake', lvl: 7, c: [-170, 190, 78], day: ['wolf', 'robber', 'deer'], night: ['feral', 'stalker', 'wolf'], max: 5 },
  { id: 'farm', n: 'Abel Farm', lvl: 3, r: [-24, 168, 92, 262], day: ['deer'], night: ['wolf', 'feral'], max: 4 },
  { id: 'manor', n: 'Varga Manor', lvl: 16, r: [214, -96, 288, -4], safe: 1 },
  { id: 'east', n: 'The East Bank', lvl: 16, r: [212, -292, 292, 292], day: ['wolf', 'stalker'], night: ['elder', 'stalker', 'warlock'], full: ['werewolf', 'werewolf', 'elder'], max: 6 },
  { id: 'woods', n: 'Whispering Woods', lvl: 4, r: [-292, -292, 196, -64], day: ['wolf', 'deer', 'deer'], night: ['feral', 'wolf', 'stalker'], full: ['werewolf', 'wolf'], max: 6 },
  { id: 'wild', n: 'The Outskirts', lvl: 2, r: [-999, -999, 999, 999], day: ['deer', 'wolf', 'deer'], night: ['feral', 'wolf'], full: ['wolf', 'werewolf'], max: 4 },
];
const MOON = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
const TITLES = [[1, 'Newcomer'], [5, 'Local'], [10, 'Night Owl'], [15, 'Hunter'], [20, 'Slayer'], [30, 'Legend of the Falls'], [40, 'Nightmare'], [50, 'Apex'], [75, 'Myth'], [100, 'First of a New Line']];

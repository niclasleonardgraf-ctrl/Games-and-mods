# Hollow Moon

An action RPG set in Mystic Falls. You arrive in town alive and human. What you become is up to you.

Unofficial fan game set in the world of *The Vampire Diaries*, with original characters. Not affiliated with the series.

## Play

Open `index.html` in a browser (it loads three.js from a CDN, so you need to be online). Keyboard and mouse, or touch.

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD | left thumb |
| Attack (hold for a heavy blow) | left mouse / J | ATTACK |
| Block; tap just in time to parry | right mouse / Shift | BLOCK |
| Dodge | Space | DODGE |
| Ranged shot | F | SHOOT |
| Abilities | 1 2 3 4 | the four round buttons |
| Heal | R | ✚ |
| Talk, open, gather, feed | E | USE |
| Pack, skills, journal, map | Tab (M for map) | Menu |

## What is in it

- **Three ways to be.** Start human. Learn the Hunter tree from the start, the Witch tree from Odette Thorne, and the Vampire tree only if you die with vampire blood in you, which is your choice to make or refuse. Turning costs you the witch's craft, makes the sun lethal until you earn a daylight ring, and can be undone with the Cure, deep in the Tomb.
- **Combat.** Three-hit combos that differ by weapon class, charged heavy attacks, a dodge with invulnerability, blocking, timed parries that stagger, ranged weapons, thirteen active abilities, enemy attacks that telegraph on the ground, poise and stagger, burn, bleed, stun and charm.
- **Materials matter.** Wood for vampires, silver for wolves, magic for spirits. Vervain and wolfsbane coat a blade.
- **Loot.** Six rarities, twenty-five affixes, ten relics with their own rules, reforging to +10, salvage.
- **Growth without a ceiling.** Levels, four attributes, three skill trees, and Ascension ranks bought with sigils from the Tomb.
- **A county to walk.** The town, the Old Cemetery, the Whispering Woods, Fell Chapel, Coven Hollow, the Falls, Wickery Bridge, Varga Manor, Blackridge Quarry, Abel Farm, Dunham Lake, the Hunters' Camp. Day and night, an eight-day moon, weather, waypoints, respawning chests and herbs.
- **The Tomb.** Procedurally built floors under Fell Chapel with a keeper every fifth floor. It does not end.
- **Quests and bounties.** A main story, side quests, and a notice board that posts new work every morning.
- **Saving.** Automatic, to the browser (and to your Claude account when played as an artifact). A save code moves a character between devices.

## Build

```
pip install bpy
python3 tools/build_models.py   # Blender builds every model: assets/models.glb + assets/models.js
tools/build.sh                  # bundles src/*.js into game.js
```

Source layout: `src/00-core.js` renderer, input, audio, particles · `10-data.js` items, skills, enemies, zones · `20-world.js` map, Tomb generator, sky · `30-actors.js` animation, damage, enemy AI · `35-player.js` controls, abilities · `40-systems.js` stats, loot, quests, saving · `45-story.js` people and quests · `50-ui.js` interface · `60-main.js` loop.

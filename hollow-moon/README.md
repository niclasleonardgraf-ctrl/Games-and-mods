# Hollow Moon

One night in Mystic Falls. You woke up dead in a crypt at 9 PM, and the sun comes up at six.

An unofficial fan game set in the world of *The Vampire Diaries*, with original characters. Not affiliated with the series.

## Play

Open `index.html` in a browser (it loads three.js from a CDN, so you need to be online). Works with keyboard and mouse, or touch on a phone.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | WASD / arrows | left stick |
| Feed / use / talk | hold E | BITE |
| Compel | Q | COMPEL |
| Vampire speed | Space | DASH |
| Strike | J or click | STRIKE |
| Heightened senses | F | SENSE |
| Humanity switch | H | Switch |
| Diary | Tab | Diary |

## How it works

- **Blood** drains all night. Feed by holding the button, and let go before the heart stops. Compel first so they don't scream, or compel after so they forget.
- **Vervain** burns. Senses show it as a purple pulse. Hunters and the witch are always on it.
- **Humanity** drops with every death. The witch will not make a daylight ring for a monster, which leaves a darker way to get one.
- **The switch** makes you faster and stronger and makes feeding hard to stop. Turning it back on costs you for everything done while it was off.
- **Hunters** patrol with flashlights. Stay out of the light on Council ground, or take them from behind. Their third shot is always a vervain dart.
- **Suspicion** rises with screams and bodies. The town starts drinking vervain, then arms patrols, then locks down.
- **The diary** writes itself as you play, and reads differently with the switch off. Six endings.

## Build

The models are made in Blender by script and exported as one GLB:

```
pip install bpy
python3 tools/build_models.py   # writes assets/models.glb and assets/models.js
```

`game.js` holds the game, `index.html` the HUD. Rendering is three.js r128.

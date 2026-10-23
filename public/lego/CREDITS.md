# Lego Universe: credits

Every figure is an existing free LEGO model made by someone else. Nothing here was generated or built by us.

What we changed:
- Each model's own geometry was regrouped into body/head/arm/leg parts around joint pivots so it can be animated in code by rotating those parts.
- Seated legs were stood up.
- Sizes were normalised with a uniform scale only.
- Some colours were set (for example, Black Panther's suit is black).
- Metal/gloss materials were made matte plastic.
- The files were compressed with meshopt and webp textures (gltf-transform).

No figure's shape was otherwise altered.

LEGO® is a trademark of the LEGO Group, which does not sponsor or endorse this. Marvel characters are © Marvel.

## Figures (chars/)

| File | Plays | Model | Author | License | Source |
|---|---|---|---|---|---|
| captain-america.glb | white king (the good king) | Captain America minifig from 76042 "The SHIELD Helicarrier" (hair piece left out; head and torso swapped for the official LDraw Cap prints 3626cpbl "Head with Eyes in Mask, White 'A'" and 973pbl "Torso with Red/White Waist, Zipper and White Star Pattern", both by Magnus Forsberg [MagFors], CC BY 4.0) | Marc Giraudet [Mad_Marc] | CC BY 2.0 (LDraw OMR); prints CC BY 4.0 (LDraw parts library) | https://library.ldraw.org/omr/sets/1202 |
| blackpanther.glb | Black Panther (ready for the white king, not in play yet) | "minifig black panther" | Mgr. Pavel Krist (Pavel_Krist) | CC0 | https://www.printables.com/model/1423935 |
| wizard.glb | white queen (stand-in for Dr. Strange) | Wizard from 10176 "Royal King's Castle" | Marc Giraudet | CC BY 2.0 (LDraw OMR) | https://library.ldraw.org/omr/sets/1110 |
| hulk.glb | Hulk (white rooks) | "Lego Hulk" | emby | CC BY 4.0 | https://sketchfab.com/3d-models/lego-hulk-887b1784a8b94b139fc3d583f56372bf |
| ironman.glb | Iron Man (white bishops) | "Lego Iron Man minifigure" | Neut2000 | CC BY 4.0 | https://sketchfab.com/3d-models/lego-iron-man-minifigure-093538974670456289de6ac7d414d953 |
| spiderman.glb | Spider-Man (white knights) | "Spider-Man Homecoming LEGO Model" | Lego Mania (dankmememe) | CC BY 4.0 | https://sketchfab.com/3d-models/spider-man-homecoming-lego-model-d84dc4fc47614a4687a774152b343ddd |
| space-police.glb | white pawns (hero agents) | Minifig from 6986 "Mission Commander" (Space Police I) | Damien Roux [Darats] | CC BY 2.0 (LDraw OMR) | https://library.ldraw.org/omr/sets/199 |
| doom-bigbrick.glb | Dr. Doom (black king) | "Big Brick * RDJ Dr. DOOM * Robert Downey Jr" (assembled, helmet on, hair piece left out) | cBoLsmUiEc | MakerWorld Standard Digital File License (personal use) | https://makerworld.com/en/models/4145928739 (file supplied by the board's owner) |
| widow.glb | Black Widow (black queen) | Black Widow minifig from 76042 "The SHIELD Helicarrier" (its plain unprinted head swapped for the official LDraw face print 3626cpd66 "Head Female with Black Eyebrows and Eyelashes, Beauty Mark, Dark Red Lips", by Gerald Lasser [GeraldLasser], CC BY 4.0) | Marc Giraudet [Mad_Marc] | CC BY 2.0 (LDraw OMR) | https://library.ldraw.org/omr/sets/1202 |
| skeleton.glb | black rooks (Skeleton minifig) | Skeleton from 6232 "Skeleton Crew" | Stan Isachenko [angmarec] | CC BY 2.0 (LDraw OMR) | https://library.ldraw.org/omr/sets/60 |
| blacktron.glb | black bishops (stand-in for Loki/Ultron) | Minifig from 6894 "Invader" (Blacktron I) | Damien Roux [Darats] | CC BY 2.0 (LDraw OMR) | https://library.ldraw.org/omr/sets/150 |
| insectoid.glb | black knights (stand-in for Green Goblin) | Leon minifig from 6919 "Planetary Prowler" (Insectoids) | N. W. Perry [Plastikean] | CC BY 2.0 (LDraw OMR) | https://library.ldraw.org/omr/sets/1206 |
| gigabot.glb | black pawns (stand-in for Doombots) | Gigabot robot from 6919 "Planetary Prowler" (Insectoids) | N. W. Perry [Plastikean] | CC BY 2.0 (LDraw OMR) | https://library.ldraw.org/omr/sets/1206 |

The LDraw models were converted with the LDraw parts library (LDraw.org, CC BY 4.0, https://library.ldraw.org) and three.js LDrawLoader.

A real Dr. Strange normal minifig that is free to redistribute was not found. We checked Printables, MakerWorld, Cults, CGTrader, Thingiverse, Mecabricks, the LDraw parts library and the OMR, but none were usable. The ones that exist are NC/ND, paid, personal-use only, BrickHeadz, or not LEGO-shaped. So the Wizard stands in. Checked again in October 2026: the LDraw parts library (official and unofficial) has only the Doctor Strange head print 3626cpbm and hair 25972p01, with no Strange torso, legs or cape. The OMR has no Doctor Strange minifig; its only Strange is the BrickHeadz 41493.

## Setting

- **sky/helicarrier.glb** (the heroes' base, behind white)
  - Source: "76042 - The SHIELD Helicarrier" by Marc Giraudet [Mad_Marc], LDraw Official Model Repository, https://library.ldraw.org/omr/sets/1202, licence CC BY 2.0.
  - Uses LDraw library parts (LDraw.org, CC BY 2.0).
  - Changes: converted to glTF with three.js LDrawLoader (main ship only; the minifigs and display stand are left out), merged per colour, simplified, normals dropped (flat shading) and meshopt-compressed.
- **sky/black-monarch-castle.glb** (Dr. Doom's castle, behind black)
  - Source: "6085 - Black Monarch's Castle" by Stefan Frenz [smf], LDraw Official Model Repository, https://library.ldraw.org/omr/sets/1305, licence CC BY 2.0.
  - Uses LDraw library parts (LDraw.org, CC BY 2.0).
  - Changes: converted to glTF with three.js LDrawLoader (castle only; the minifigs and horses are left out), merged per colour, simplified, normals dropped (flat shading) and meshopt-compressed.
- **avengers-tower.glb** (no longer shown; kept for older links)
  - Source: "Avenger Tower" by Sohan (Sohan_4213645), https://www.printables.com/model/1691934, licence CC BY-SA 4.0.
  - Changes: converted from STL to glTF, scaled uniformly (0.6) and given one material.
  - This derived file is shared under the same CC BY-SA licence.
- **city.glb**
  - Source: the city blocks far below the floating board are from Kenney's "City Kit (Commercial)" 2.1, https://kenney.nl/assets/city-kit-commercial, licence CC0.
- **Drawn in code:**
  - The floating deck, studded baseplate, dusk sky and effects (beams, standing portals, shockwaves).
  - The capture debris. These are real LEGO brick and plate shapes (1x2, 2x2 and 2x4 bricks, 1x2 and 2x2 plates, all with studs on top, standard LEGO proportions) drawn in code, in the colours of the figure that was captured.

## Create Lego board (builder pieces)

- **builder/palette.glb** and **builder/palette.json**
  - Every piece in the builder's palette is an official part from the LDraw.org Parts Library (https://library.ldraw.org), licence CC BY 4.0. The LDraw part numbers behind every piece are listed in `builder/parts-ldraw.json`.
  - Changes: converted to glTF with three.js LDrawLoader, merged per colour, and centred on their footprint. The shapes are not changed.
  - No minifigs were assembled for the builder.

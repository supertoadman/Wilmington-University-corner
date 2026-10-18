# Temple Run — Divine & Corrupt asset package

An original 2D asset library for an isometric browser game about divinity, corruption, and ancient philosophy. The visual language is carved ivory marble, aged gold, solemn classical architecture, and fractured/horned corrupted counterparts.

**Current web pack:** all **143 logical asset IDs** remain, with WebP raster images, Ogg/AAC audio, repaired divine beam and four corrected fall landings. The 120 individual source frames are under ignored `masters/frames/`; runtime animations use combined sheets. Read **[EXPANSION.md](EXPANSION.md)** for current paths, exact audio loop timing and the **2.0.0 schema migration**. `npm run check` enforces a 15 MB runtime budget, counting both audio formats. The original collection inventory below is retained for historical context; current formats and paths are specified in EXPANSION.md and the manifest.

## Open the collection

Serve **viewer.html** or **expansion-preview.html** locally for the library, animations, counterpart comparisons and audio. No internet, account, external fonts, or CDN is needed; audio decoding requires HTTP rather than a file URL.

For development, run:

    npm run preview

Then visit http://localhost:4174. This is an asset viewer and composition demonstration, not a finished game.

## Contents

- **40 raster assets:** 26 newly generated artworks plus the 14 existing divine/demonic archangels.
- Two complete temple landmarks, two gateways, two columns, two decorative paving slabs.
- Two fallen-column barriers and two spike traps.
- Six collectible sprites: laurel currency, wisdom scroll, and aegis shield, each in both realms.
- Six philosopher sheets: Socrates, Plato, and Aristotle, each divine and corrupted. Four poses per sheet: idle, run-a, run-b, jump.
- Two atmospheric sanctuary backgrounds.
- Fourteen archangel guardian illustrations for encounters, shrines, dialogue, or menus.
- **40 SVG assets:** paired UI panels, four button states, six control/status icons, health-bar pieces, four exact-grid tiles, and three effects.
- **8 original synthesized WAV cues:** currency, wisdom, aegis, jump, landing, damage, and two realm transitions.
- JSON manifest, frame rectangles, measured transparent bounds, anchors, counterpart IDs, palette, helper code, and this viewer.

There are **88 logical assets**. PNG masters and WebP exports are alternate formats of the same artworks, not extra assets.

## Folder layout

- masters/{divine,corrupt}/... — original generated PNGs, preserved without visual editing.
- textures/{divine,corrupt}/... — compact WebP files for game use; alpha preserved.
- vectors/{divine,corrupt}/{ui,terrain-grid,effects}/... — editable SVG assets.
- audio/ — Ogg/Vorbis and M4A/AAC runtime sounds; WAV masters live in ignored masters/audio/.
- manifest.json — canonical asset manifest, schema version 2.0.0.
- manifest.js — the same data as a browser global, enabling the offline viewer.
- examples/canvas-assets.mjs — dependency-free Canvas 2D loading, drawing, animation, and projection helpers.
- source/prompts.json — full image-generation prompt set.
- source/build-package.mjs — reproducible format exports, vector generation, audio synthesis, and manifest build.
- source/check-package.mjs — file, alpha, frame, counterpart, SVG, and WAV checks.
- source/export-report.json — actual output sizes and transparency measurements.

## Loading assets

Keep the folder structure or resolve each src relative to manifest.json. All runtime paths are relative; there are no deployment-specific URLs.

    import {loadPack, drawAsset, animationFrame} from './examples/canvas-assets.mjs';

    const pack = await loadPack('./manifest.json');
    const runner = await pack.load('divine-socrates');
    const frame = animationFrame(runner.asset, 'run', elapsedSeconds);
    drawAsset(ctx, runner, playerX, playerY, 128, {frame});

A matching realm asset is available through asset.counterpart. For example, divine-temple maps to corrupt-temple. Audio cues are shared and have no counterpart.

Preload only the categories needed by your current scene, rather than every master image. The viewer shows the total runtime byte size. Use masters for larger displays and editing; use the smaller exports during gameplay.

## Camera and placement

The intended world view is isometric / three-quarter. The exact logical grid is **256 × 128** pixels with a 2:1 top-face diamond.

    screenX = (column - row) * 128
    screenY = (column + row) * 64

The SVG terrain tiles are **256 × 144**, including a 16-pixel front edge. Their anchor is the center of the top face: (128,64), or normalized (0.5, 64/144). They tessellate on the logical grid. Draw tiles from back to front by column + row.

Use the SVG plain, inlay, edge, and gap tiles to construct paths of any shape. A gap tile represents a void; collision/game rules are your application's responsibility. The generated marble slabs are decorative images, **not seamless textures or guaranteed grid-aligned tiles**.

World-object anchors are derived from their visible alpha bounds. They are useful starting points; set a gameplay footprint separately and adjust the visual offset to your scene. Generated architectural views are approximate artistic three-quarter views, not calibrated renders from a shared 3D model. Depth-sort world objects by their ground contact point.

## Characters and guardians

The playable cast has been redesigned with full heads of hair and theatrical protagonist styling: **Socrates** has a swept-back mane, powerful build, emerald mantle and large gold bracers; **Plato** has long flowing hair, a lapis split coat and a tall elegant silhouette; **Aristotle** has a full bronze curly topknot, burgundy cropped layers and a lean agile silhouette. Their corrupted forms preserve these identities while adding cracks, tarnished gold, torn hems and small horns. The viewer includes a three-character lineup for comparison.

The latest character prompts are in source/protagonist-redesign-prompts.json and source/protagonist-corruption-prompts.json; these supersede the initial character prompts in source/prompts.json.

The philosopher sheets contain four cells in a 2 × 2 layout. The frames field gives exact exported frame rectangles and a per-frame anchor; animations defines idle, a basic two-pose run loop, and jump.

These are **prototype pose sheets**, not hand-polished continuous animation. Pose-to-pose scale, drapery, and limb placement can vary. Only a northeast-facing view is supplied. Mirroring gives a visual northwest alternative, but does not create true south-facing views. There are no slide, attack, death, or eight-direction cycles, no skeletons, and no 3D meshes.

Jump elevation should come from game physics; the jump pose itself is a static frame. Anchors align visible bounds, not a rigged skeleton.

The 14 archangels reuse the existing front-facing artwork and are labeled guardians. They suit encounters, cards, statues, and menus. They are not isometric animated enemy sprites. The philosopher names are artistic inspirations, and the corrupted versions are fictional fantasy interpretations.

## UI and effects

SVG panels and buttons have optional nineSlice metadata. Add accessible HTML text labels in your game; no labels are baked into the artwork. Button states are normal, hover, pressed, and disabled.

The health bar is split into track and fill; clip the fill according to health. Rings, sparks, and soft shadows are separate effects so you can animate opacity, scale, and movement in your renderer. There are no pre-rendered particle animation sheets.

## Audio

The sound cues are original procedural synthesis, with short fades and conservative levels. They are effects, not a music score or recorded performance. Start playback only after a user gesture, respect mute settings, and mix them in your game as desired.

## Rebuilding

Viewing the package requires no installed dependencies. Rebuilding exports uses Node.js and sharp:

    npm install
    npm run build
    npm run check

If sharp is already available elsewhere, set SHARP_PATH to that installed package directory instead. The build does not call an image-generation API, download anything, or regenerate creative art. It reads the saved masters, creates optimized exports, and rebuilds the manifest, SVGs, and WAVs.

## Provenance and scope

The 26 new raster assets were created with the built-in image_gen tool. The 14 guardian PNGs were copied from the earlier archangel collections in this workspace. The vector UI, exact-grid tiles, effects, and audio cues are original procedural assets. The supplied statue photographs served as visual references; the photos themselves are not bundled.

The user-requested folder name is "temple run." The art and package design are original and do not reproduce branding, characters, or assets from an existing commercial game.

This package supplies visuals, basic pose metadata, UI parts, audio cues, and integration examples. Game logic, levels, collision tuning, progression, rigged 3D models, additional facings, and polished long animation cycles are not included.


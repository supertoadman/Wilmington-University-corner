# Crypt Survivors art: license and provenance

The sprites in `tiles/` come from **[crawl/tiles](https://github.com/crawl/tiles)**, release
`releases/Nov-2015`, a packaging of the Dungeon Crawl Stone Soup tile set (itself based on
RLTiles). Every tile in that release was cleared by its artists for release under
**[CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)**;
tiles with unclear ownership are left out of the release (see the repository's
`TILES_UNDER_UNKNOWN_LICENSE.md`). No attribution is required, but credit is due to the Dungeon
Crawl Stone Soup artists listed in the repository's `ARTISTS.md`.

- `tiles.json` maps each id the game uses to its path in the release. `scripts/survivors-import.mjs`
  copies them here from a checkout and refuses any file on the unknown-license list.
- The tiles are unmodified 32×32 PNGs. The build (`scripts/survivors.mjs`) packs them into one atlas
  for `/survivors/pack/`; tinted, flashed and corrupted variants are drawn at runtime.

The music and the few recorded sound effects are the site's own, from `Assets/temple run/audio/`
(original compositions; see that pack's README). Combat sounds are synthesized in the browser.

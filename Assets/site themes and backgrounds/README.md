# Sanctum — Site themes and backgrounds

Six original backgrounds in three divine/corrupt pairs, inspired by the ivory marble, aged gold, classical architecture, and fallen sanctuaries of Sanctum Run.

| Pair | Divine | Corrupt |
| --- | --- | --- |
| Sanctuary | Sanctuary of Dawn | Sanctuary of Ash |
| Archive | Celestial Archive | Forbidden Archive |
| Grove | Elysian Grove | Blighted Grove |

Open **preview.html** directly in a browser to switch themes, compare counterparts, inspect palettes, download originals, or hide the sample content. Everything is local; no fonts, scripts, or services are fetched externally.

For an HTTP preview, run from this folder:

```sh
node source/serve.mjs
```

Then open http://127.0.0.1:4175/.

## Files

- `backgrounds/*.png`: six untouched generated originals, 1672 × 941 pixels (approximately 16:9).
- `backgrounds/*.webp`: six optimized web exports at the same native resolution; about 1.83 MiB combined.
- `themes.css`: six opt-in color themes and small, namespaced components for page backgrounds, panels, buttons, and links.
- `manifest.json`: relative asset paths, actual dimensions, byte sizes, palettes, and reciprocal counterpart IDs. Paths resolve relative to the manifest folder.
- `manifest.js`: equivalent data for an offline preview without fetch.
- `source/prompts.json`: exact generation/edit prompts, palette values, and paired reference paths. Artwork made using the built-in image_gen tool on 2026-10-19.
- `source/build.mjs`: reproduces WebP exports, manifests, and theme CSS from the local PNGs and prompt metadata. It does not regenerate artwork.

## Use a theme

Keep `themes.css` beside the `backgrounds` folder. CSS image URLs resolve relative to the stylesheet, so the package can be hosted under any base path.

```html
<link rel="stylesheet" href="./site%20themes%20and%20backgrounds/themes.css">
<body data-site-theme="divine-sanctuary" class="st-page">
  <section class="st-backdrop" style="padding: 4rem 1rem">
    <article class="st-panel" style="max-width: 36rem; margin: auto; padding: 2rem">
      <h1>Your page title</h1>
      <p class="st-muted">Your supporting text.</p>
      <a class="st-button" href="./library/">Explore</a>
    </article>
  </section>
</body>
```

Theme IDs: `divine-sanctuary`, `corrupt-sanctuary`, `divine-archive`, `corrupt-archive`, `divine-grove`, `corrupt-grove`. Change `data-site-theme` to switch both artwork and colors. The seven palette variables use the `--st-` prefix: `background`, `surface`, `text`, `muted`, `accent`, `on-accent`, and `gold`.

Use opaque `st-panel` surfaces for readable body copy. Background art itself has varying contrast; text placed directly on the image needs an appropriate opaque surface or separately checked overlay. Gold is decorative, not a body-text color. These are landscape scenic images, not seamless tiles. `cover` crops the edges on portrait displays; the preview demonstrates that behavior. No portrait-specific originals are included.

To rebuild, run `node source/build.mjs`. The script uses the existing adjacent `temple run/node_modules/sharp`, or the package directory supplied through `SHARP_PATH`.

This is a standalone asset collection. Integration into the public site is a separate step.

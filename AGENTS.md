# Notes for coding agents

- Source documents live in `content/<Subject>/`. Never edit files in `dist/`; the build regenerates it.
- To add or describe documents, edit `content/<Subject>/subject.json` (see README). Don't hand-edit generated HTML.
- Build with `npm run build`, then preview with `npm run serve` (http://localhost:4173/Wilmington-University-corner/).
- All internal links must stay relative (templates use the `root` prefix), so the site works under any base path.
- The JSON API schema is versioned (`schemaVersion` in `api/catalog.json`). Add fields freely, but don't rename or remove existing ones without bumping the major version.
- The public site deliberately has no developer or agent pages. The API reference lives in `docs/agents-api.md`. Don't add links to `api/`, `llms.txt`, or the repository in the public UI.
- `/admin/` (`admin()` in `src/templates.mjs`, `src/assets/admin.js`) is an owner-only title/description editor. It commits through the GitHub API with the owner's token. Keep it unlinked, out of the sitemap, free of secrets and third-party scripts, and have it edit only the changed value (`src/assets/admin-json.mjs`).
- Submissions (`submissions/`) must only ADD files under `content/` (document + `<file>.meta.json`), never edit shared files, so pending pull requests can't conflict. Keep `submissions/core.mjs` web-standard (no Node APIs) so it runs on any serverless platform.
- The game at `/play/` (`src/game/`, built by `scripts/game.mjs`) reads the practice sets at build time. If you add a practice set in a new format, add a reader to `scripts/lib/quiz.mjs`. Readers must only parse page data, never execute it, because the build also runs on submission pull requests. Art comes from `Assets/temple run/`: don't commit its `masters/`, `previews/` or ZIPs.
- Crypt Survivors at `/survivors/` (`src/survivors/`, `survivors()` in `src/templates.mjs`, built by `scripts/survivors.mjs`) asks the same `play/data/` questions, so it needs nothing extra for a new practice set. Keep `src/survivors/logic.js`, `defs.js` and `engine.js` free of DOM access at import so `tests/survivors.test.mjs` runs them under Node. Its sprites are CC0 tiles from crawl/tiles in `Assets/survivors/tiles/`: add one by listing it in `Assets/survivors/tiles.json` and running `scripts/survivors-import.mjs`, never by copying art of unknown license. Keep its runtime pack (`dist/survivors/pack/`) to a few MB.
- Pushing to `main` deploys automatically through GitHub Actions.

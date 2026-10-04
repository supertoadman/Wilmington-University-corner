# Notes for coding agents

- Source documents live in `content/<Subject>/`. Never edit files in `dist/`; the build regenerates it.
- To add or describe documents, edit `content/<Subject>/subject.json` (see README). Don't hand-edit generated HTML.
- Build with `npm run build`, then preview with `npm run serve` (http://localhost:4173/Wilmington-University-corner/).
- All internal links must stay relative (templates use the `root` prefix), so the site works under any base path.
- The JSON API schema is versioned (`schemaVersion` in `api/catalog.json`). Add fields freely, but don't rename or remove existing ones without bumping the major version.
- The public site deliberately has no developer or agent pages. The API reference lives in `docs/agents-api.md`. Don't add links to `api/`, `llms.txt`, or the repository in the public UI.
- Submissions (`submissions/`) must only ADD files under `content/` (document + `<file>.meta.json`), never edit shared files, so pending pull requests can't conflict. Keep `submissions/core.mjs` web-standard (no Node APIs) so it runs on any serverless platform.
- Pushing to `main` deploys automatically through GitHub Actions.

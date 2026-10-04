# Wilmington University Corner

A static study library for law school courses: outlines, rule charts, flowcharts, flashcards, and practice question banks. Every document can be opened in the browser or downloaded, and the whole library is also published as a machine-readable API for AI agents.

**Live site:** https://supertoadman.github.io/Wilmington-University-corner/

> An independent student study resource, not affiliated with or endorsed by Wilmington University.

## Adding content

Everything lives in `content/`, with one folder per subject:

```
content/
  Evidence/
    subject.json              <- optional: titles, descriptions, ordering
    FRE_Rule_Cards.html
    ...
  Professional Responsibility/
    subject.json
    outline_v3.html
    ...
```

- **New document:** drop a file into a subject folder and push. Supported formats are `.html`, `.docx`, `.pdf`, `.md`, and `.txt`. Word documents are converted into a readable web page with a table of contents, and the original stays available to download.
- **New subject:** create a new folder in `content/`. That's all you need. Add a `subject.json` to set the description, icon, and color.
- **Metadata (optional):** in `subject.json`, use `documents` keyed by file name (or a `<file>.meta.json` sidecar next to the file) to set `title`, `description`, `type`, `tags`, `questions`, `order`, `slug`, `contributor`, or `"publish": false`. Anything you leave out is inferred: the title comes from the file's `<title>`, and the type from the file name.

```json
{
  "title": "Evidence",
  "description": "Federal Rules of Evidence ...",
  "icon": "scale",
  "accent": "#2f6f8f",
  "order": 1,
  "documents": {
    "FRE_Rule_Cards.html": { "title": "FRE Rule Cards", "type": "flashcards", "tags": ["FRE"] }
  }
}
```

The document types are `outline`, `rule-chart`, `flowcharts`, `flashcards`, `practice`, and `document`. To add a new type, add one line to `TYPES` in `scripts/build.mjs`. Icon names can be any [Lucide](https://lucide.dev/icons) icon.

## Contributions from other people

Anyone can share their work through the site's **Share your work** page, without an account. Each submission becomes a pull request that you approve (merge) or reject (close). Automated safety checks run on every submission. Try it locally with `npm run dev` and the review queue at `/__review/`.

Setup, review steps, and how to change the rules: [docs/contributions-setup.md](docs/contributions-setup.md).

## Local development

Requires Node 20 or later.

```bash
npm install
npm run dev      # build + preview at http://localhost:4173/Wilmington-University-corner/
```

## Deployment

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the site and publishes `dist/` to the `gh-pages` branch. GitHub Pages serves the site from that branch.

## For agents and integrations

Each build also generates a read-only API: `catalog.json`, per-document JSON and plain text, `llms.txt`, and an OpenAPI spec. It isn't linked from the public site. See [docs/agents-api.md](docs/agents-api.md) for the endpoints and examples.

## Project layout

```
content/                 source documents (edit these)
scripts/build.mjs        static site generator
scripts/serve.mjs        local preview server (mirrors the GitHub Pages base path)
src/templates.mjs        HTML templates for every page type
src/assets/              CSS, client JS, favicon, social image
site.config.json         site title, URL, repository, disclaimer
docs/agents-api.md       internal API reference for agents and integrations
docs/contributions-setup.md  how submissions work and how to turn them on
submissions/             submission relay (Cloudflare Worker), safety checks, local test inbox
```


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
- **Metadata (optional):** in `subject.json`, use `documents` keyed by file name to set `title`, `description`, `type`, `tags`, `questions`, `order`, `slug`, or `"publish": false`. Anything you leave out is inferred: the title comes from the file's `<title>`, and the type from the file name.

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

## Local development

Requires Node 20 or later.

```bash
npm install
npm run dev      # build + preview at http://localhost:4173/Wilmington-University-corner/
```

## Deployment

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the site and publishes `dist/` to the `gh-pages` branch. GitHub Pages serves the site from that branch.

## For agents and integrations

The build generates a static, read-only API alongside the pages:

| Path | What it is |
| --- | --- |
| `/llms.txt` | Index in the [llms.txt](https://llmstxt.org) format |
| `/llms-full.txt` | Plain text of every document in one file |
| `/api/catalog.json` | All subjects and documents with metadata and absolute URLs |
| `/api/subjects/{subject}.json` | One subject and its documents |
| `/api/documents/{subject}/{doc}.json` | One document's metadata plus extracted text |
| `/api/documents/{subject}/{doc}.txt` | One document as plain text |
| `/api/search-index.json` | Compact search index |
| `/api/openapi.json` | OpenAPI 3.1 description (for GPT actions or tool-calling agents) |

Every page also includes schema.org JSON-LD and `<link rel="alternate">` tags that point to its JSON and text versions.

**MCP server idea:** a small [Model Context Protocol](https://modelcontextprotocol.io) server can wrap `catalog.json` to expose `list_documents`, `get_document(id)`, and `search(query)` tools, so Claude or another assistant can quiz you directly from the library.

## Project layout

```
content/                 source documents (edit these)
scripts/build.mjs        static site generator
scripts/serve.mjs        local preview server (mirrors the GitHub Pages base path)
src/templates.mjs        HTML templates for every page type
src/assets/              CSS, client JS, favicon, social image
site.config.json         site title, URL, repository, disclaimer
```

## Not published

`content/Professional Responsibility/PR_MPRE_500_Course_Subset.html` is excluded through `.gitignore` and `"publish": false`. It reproduces questions from a copyrighted commercial MPRE book. To publish it anyway, remove it from `.gitignore` and delete `"publish": false` from that subject's `subject.json`.

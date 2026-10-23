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
- **Music:** an `.mp3` in a subject folder is a song with its own player. A folder of `.mp3` files inside a subject folder is one playlist document: its tracks play in file-name order (so `14_Power_to_Leave.mp3` is track 14), and listeners pick a track from the list or let it play through, at 0.5× to 1.5× speed. Give the playlist a `subject.json` entry like any document, plus `tracks` keyed by file name with each track's `title`, `topic` and `description`. A link ending in `#track-<slug>` (such as `#track-winding-up`) opens on that track.
- **New subject:** create a new folder in `content/`. That's all you need. Add a `subject.json` to set the description, icon, and color.
- **Metadata (optional):** in `subject.json`, use `documents` keyed by file name (or a `<file>.meta.json` sidecar next to the file) to set `title`, `description`, `type`, `tags`, `questions`, `order`, `slug`, `contributor`, `"theme": "structured"` (for Word outlines that use one-cell tables as section titles and RULE/CASE boxes; turns them into real headings, callouts and case boxes, and sets the outline between the archangel figures from `src/assets/archangels/`), `"outsideColor"` (with the structured theme: the Word font color, such as `"7030A0"`, that marks text from outside the class materials, so it keeps its own color on the site), or `"publish": false`. Anything you leave out is inferred: the title comes from the file's `<title>`, and the type from the file name.

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

The document types are `outline`, `rule-chart`, `flowcharts`, `flashcards`, `practice`, and `document`. To add a new type, add one line to `TYPES` in `scripts/build.mjs`. Icons come from the site's own set in `src/icons/` (drawn by `scripts/icons/glyphs.mjs`; run `npm run icons` after adding or changing one). Courses can also use an archangel bust, `statue-angel-michael`, `-gabriel`, `-raphael`, `-uriel`, `-selaphiel`, `-jegudiel` or `-barachiel` (from `src/assets/archangels/busts/`; the fallen counterpart shows in dark mode). Any other [Lucide](https://lucide.dev/icons) name still works and shows as an outline.

## Sanctum Run (the study game)

`/play/` is a running game built on the practice question banks, linked from the home page under the course browser and from each course page. Players pick courses, practice sets and a philosopher, then run an isometric sanctuary. Each gate stops the run for one question, with no time limit. A wrong answer spreads corruption: at half, the world, the runner and the pursuer turn to their fallen versions. The gate also shows the explanation and links to the section of the course outline that covers the question.

- **Questions** come from the practice sets automatically at build time (`scripts/game.mjs`, readers in `scripts/lib/quiz.mjs`). A new HTML practice set in one of the existing formats joins the game with no extra step; a set in a format the reader doesn't know is skipped.
- **Review links** go to the course's `outline` document, or its `rule-chart` if it has no outline. Each question is matched to the closest section of it (`scripts/lib/outline.mjs`): a heading in a Word or HTML outline, or a page of a PDF.
- **Art and audio** come from the asset pack in `Assets/temple run/`; the build copies only what the game uses into `play/pack/`.
- **Code** is in `src/game/` (`engine.js` draws and runs the world, `game.js` handles the screens and gates). Add `?debug` to the URL to get `window.sanctum`.

## Shuffle mode

`/shuffle/` (linked from the home page between the course browser and Sanctum Run) lets you tick practice sets from any courses and answer all their questions in one shuffled stack, with shuffled choices, cross-outs, explanations, review links and Retry missed. It reads the same question data the game does (`play/data/`), so any set the game can read shows up here too. The page is `shuffle()` in `src/templates.mjs`; the client is `src/assets/shuffle.js`.

A variation (a question that changes the facts of another) carries a "Show the question this varies" toggle here, in Sanctum Run, and in the bar-style practice sets themselves, so a shuffle or filter that separates it from its original never hides the facts it builds on.

Exam-style sets (such as the Agency & Partnership practice exams) can share one fact pattern across several questions (`h`, naming an entry in `HYPOS`; the game and Shuffle mode print it with each question), give the correct choice's index in `a`, and mark `fixed` a question whose choices refer to each other ("B and C", "None of the above"), so its choices keep their letters instead of being shuffled.

## Editing titles and descriptions online

Go to `/admin` on the live site (it isn't linked anywhere) to edit any document's title and description from a browser or phone. Sign in with a GitHub [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new):

1. **Repository access:** Only select repositories, then choose this repository.
2. **Permissions:** Repository permissions, then **Contents: Read and write**.
3. Set an expiration date. When it expires, create a new token the same way.

Saving commits the change to `subject.json` (or to the document's `.meta.json` sidecar, if that sets the field) and the site redeploys automatically. The page holds no secrets; only someone with a token that can write to this repository can save. The token is kept for the current tab only. To revoke access, delete the token on GitHub.

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
scripts/game.mjs         game data: questions, outline sections, asset copy
src/game/                Sanctum Run, the game at /play/
Assets/temple run/       the game's art and audio pack (runtime files; masters stay local)
scripts/serve.mjs        local preview server (mirrors the GitHub Pages base path)
scripts/icons/           draws the icon set (npm run icons)
src/templates.mjs        HTML templates for every page type
src/icons/               the site's icon set (generated SVGs, committed)
src/assets/              CSS, client JS, favicon, social image
site.config.json         site title, URL, repository, disclaimer
docs/agents-api.md       internal API reference for agents and integrations
docs/contributions-setup.md  how submissions work and how to turn them on
submissions/             submission relay (Cloudflare Worker), safety checks, local test inbox
```


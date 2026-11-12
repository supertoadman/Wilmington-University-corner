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

- **New document:** drop a file into a subject folder and push. Supported formats are `.html`, `.docx`, `.pdf`, `.md`, and `.txt`, plus three data formats the build turns into pages: `<Name>.mcq.json` (a practice set), `<Name>.supplement.json` (a statutory supplement) and `<Name>.cards.json` (a flashcard deck); see [Canonical formats](#canonical-formats-for-outlines-supplements-practice-sets-and-flashcards). Word documents are converted into a readable web page with a table of contents, and the original stays available to download.
- **Music (kept local):** music isn't published or committed. The course playlists are `"publish": false` in their `subject.json`, and `.gitignore` keeps `content/**/*.mp3` and `.wav` (and the `Music/` working folder) on this computer. The build still supports music, so local builds can use it: an `.mp3` in a subject folder is a song with its own player. A folder of `.mp3` files inside a subject folder is one playlist document: its tracks play in file-name order (so `14_Power_to_Leave.mp3` is track 14), and listeners pick a track from the list or let it play through, at 0.5× to 1.5× speed. Give the playlist a `subject.json` entry like any document, plus `tracks` keyed by file name with each track's `title`, `topic` and `description`. A link ending in `#track-<slug>` (such as `#track-winding-up`) opens on that track.
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

Outlines follow [docs/outline-format.md](docs/outline-format.md), which sets how tests and factors are labeled.

The document types are `outline`, `rule-chart`, `flowcharts`, `flashcards`, `practice`, and `document`. To add a new type, add one line to `TYPES` in `scripts/build.mjs`. Icons come from the site's own set in `src/icons/` (drawn by `scripts/icons/glyphs.mjs`; run `npm run icons` after adding or changing one). Courses can also use an archangel bust, `statue-angel-michael`, `-gabriel`, `-raphael`, `-uriel`, `-selaphiel`, `-jegudiel` or `-barachiel` (from `src/assets/archangels/busts/`; the fallen counterpart shows in dark mode). Any other [Lucide](https://lucide.dev/icons) name still works and shows as an outline.

## Canonical formats for outlines, supplements, practice sets and flashcards

New study materials use four canonical formats, modeled on the Sales and Leases materials, so they need no cleanup and the reference popup works on them automatically:

- **Outlines:** write the outline as outline/v1 JSON and build the Word file with `node scripts/templates/build-outline-docx.mjs outline.json "content/<Subject>/<Name>_Outline.docx"` (or follow the same rules in Word). Spec: [docs/outline-format.md](docs/outline-format.md).
- **Statutory / rule supplements:** `content/<Subject>/<Name>.supplement.json` (the AREAS and DATA of the supplement viewer). Spec: [docs/supplement-format.md](docs/supplement-format.md).
- **Practice sets:** `content/<Subject>/<Name>.mcq.json`, built into a standalone Shuffle-mode practice page. Spec: [docs/mcq-format.md](docs/mcq-format.md).
- **Flashcards:** `content/<Subject>/<Name>.cards.json`, built into a standalone flashcard page: one card at a time with Back / Show answer / Next, a Shuffle switch, Remove with Undo, a topic menu, larger text, and an All cards overview with search. Progress is saved in the browser. Spec: [docs/cards-format.md](docs/cards-format.md); model: `content/Evidence/Evidence_Rules_Flashcards.cards.json`.

`npm run check -- <file>` validates any of them (and, after `npm run build`, checks that a practice set's citations link). Prompts for outside AIs are in [docs/ai-prompts.md](docs/ai-prompts.md); copyable templates and samples are in `docs/templates/` (`npm run templates` regenerates the templates).

## The games (local only)

Sanctum Run and Crypt Survivors are **kept off the published site**: `npm run build` (what the deploy runs) leaves out their pages, code and art, and every link to them. To play them on this computer, run `npm run dev:games` (a build with `--games`, then the preview server); the home page and course pages then link to them as before. The question data both games read (`play/data/`) is always built, because Shuffle mode and Your stats use it too.

## Sanctum Run (the study game)

`/play/` is a running game built on the practice question banks, linked (in a `--games` build) from the home page under the course browser and from each course page. Players pick courses, practice sets and a philosopher, then run an isometric sanctuary. Each gate stops the run for one question, with no time limit. A wrong answer spreads corruption: at half, the world, the runner and the pursuer turn to their fallen versions. The gate also shows the explanation and links to the section of the course outline that covers the question.

- **Questions** come from the practice sets automatically at build time (`scripts/game.mjs`, readers in `scripts/lib/quiz.mjs`). A new HTML practice set in one of the existing formats joins the game with no extra step; a set in a format the reader doesn't know is skipped.
- **Review links** go to the course's `outline` document, or its `rule-chart` if it has no outline. Each question is matched to the closest section of it (`scripts/lib/outline.mjs`): a heading in a Word or HTML outline, or a page of a PDF.
- **Art and audio** come from the asset pack in `Assets/temple run/`; the build copies only what the game uses into `play/pack/`.
- **Code** is in `src/game/` (`engine.js` draws and runs the world, `game.js` handles the screens and gates). Add `?debug` to the URL to get `window.sanctum`.

## Shuffle mode

`/shuffle/` (linked from the home page under the course browser) lets you tick practice sets from any courses and answer all their questions in one shuffled stack, with shuffled choices, cross-outs, explanations, review links and Retry missed. It reads the same question data the game does (`play/data/`), so any set the game can read shows up here too. The page is `shuffle()` in `src/templates.mjs`; the client is `src/assets/shuffle.js`.

A variation (a question that changes the facts of another) carries a "Show the question this varies" toggle here, in Sanctum Run, and in the bar-style practice sets themselves, so a shuffle or filter that separates it from its original never hides the facts it builds on.

Exam-style sets (such as the Agency & Partnership practice exams) can share one fact pattern across several questions (`h`, naming an entry in `HYPOS`; the game and Shuffle mode print it with each question), give the correct choice's index in `a`, and mark `fixed` a question whose choices refer to each other ("B and C", "None of the above"), so its choices keep their letters instead of being shuffled.

## Crypt Survivors

`/survivors/` (linked, in a `--games` build, from the home page under Sanctum Run and from each course page with practice sets) is a survival study game: hold a crypt of the restless dead for fifteen minutes while your weapons fire on their own. Every level-up stops the world for one question from the practice sets you picked (the same course + set checklist as Shuffle mode, with shuffle, missed-only and feedback-pacing options). A right answer lets you choose one of three boons: a new weapon, a weapon level, a relic, an evolution when a maxed weapon has its relic, or, every third answer in a row while corrupted, a Purify card. A wrong answer shows the right choice, the explanation and the outline section to review, then makes you choose one of three corruptions (Leaden Shackles, Rusted Edge, Fell Beacon…) that stack in a tray on the HUD. The run ends with a review of every missed question and a button to run just those.

- **Questions** are the game's own data (`play/data/`, from `scripts/game.mjs`), so every practice set Sanctum Run can read shows up here with no extra step. A link ending in `?course=<slug>` picks that course's sets.
- **Art** is a curated set of CC0 tiles from [crawl/tiles](https://github.com/crawl/tiles) in `Assets/survivors/tiles/` (list and paths in `Assets/survivors/tiles.json`, provenance in `Assets/survivors/LICENSE.md`). The build packs them into one atlas (`scripts/survivors.mjs`, with the PNG codec in `scripts/lib/png.mjs`); tints, hit flashes and corrupted variants are drawn at runtime. To change the list, edit `tiles.json` and run `node scripts/survivors-import.mjs <crawl-tiles>/releases/Nov-2015` (the script's header shows the sparse clone).
- **Music** is the divine and corrupt score from `Assets/temple run/audio/`; combat sounds are synthesized in the browser.
- **Code** is in `src/survivors/`: `defs.js` (weapons, relics, corruptions, enemies, waves), `logic.js` (the rules, as pure functions), `engine.js` (simulation and drawing), `game.js` (screens, questions, HUD). Add `?debug` to the URL to get `window.survivors`. Tests: `tests/survivors.test.mjs`.

## Your stats

`/stats/` (linked from the header, the home page shortcuts, the footer and Shuffle mode) shows a student which topics they miss most: answers, accuracy, the last 7 days, a day streak, the questions to review, their weakest topics, the last 12 weeks, and every topic by course. Each topic links to a **drill**: Shuffle mode opened on that topic's questions (`shuffle/?course=<slug>&area=<area>`), or on just the ones whose latest answer was wrong (`&missed=1`).

- **What counts:** every answer graded in Shuffle mode, the games (when played locally), and the pages built from `.mcq.json` sets (the site's copy of those pages loads `src/assets/practice-log.js`, which records the page's `practice:answer` events; downloads stay standalone). Older practice pages with their own scripts don't report yet; a set moved to the canonical format starts counting with no extra step.
- **Where it lives:** in the browser's `localStorage` (key `answer-log`), written and read by `src/assets/answer-log.js`. Nothing is uploaded and there are no accounts. The footer's progress backup includes it, and restoring a backup merges answer histories instead of replacing them.
- **Topics** are the questions' `area` (the part of the topic before " — "), grouped per course; area names that differ only in case or spacing count as one. Each answer keeps its topic as it read then, so later edits to a set don't re-file old answers.
- **Code:** the page is `stats()` in `src/templates.mjs`, drawn by `src/assets/stats.js`. Tests: `tests/answer-log.test.mjs`.

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
npm run dev:games  # the same, with the local-only games (Sanctum Run, Crypt Survivors)
```

## Deployment

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the site and publishes `dist/` to the `gh-pages` branch. GitHub Pages serves the site from that branch.

## For agents and integrations

Each build also generates a read-only API: `catalog.json`, per-document JSON and plain text, `llms.txt`, and an OpenAPI spec. It isn't linked from the public site. See [docs/agents-api.md](docs/agents-api.md) for the endpoints and examples.

## Project layout

```
content/                 source documents (edit these)
scripts/build.mjs        static site generator
scripts/lib/             build helpers: docx.mjs (structured outlines), refs.mjs (popup index), quiz.mjs (game reader),
                         mcq.mjs + practice-shell.mjs (mcq/v1 sets), supplement-shell.mjs (supplement/v1),
                         cards.mjs + cards-shell.mjs (cards/v1 flashcard decks)
scripts/templates/       build-outline-docx.mjs, check.mjs (npm run check), build-templates.mjs (npm run templates)
src/practice/            the standalone practice page, supplement viewer and flashcard page, inlined into built pages
scripts/game.mjs         game data: questions, outline sections, asset copy
src/game/                Sanctum Run, the game at /play/
Assets/temple run/       the game's art and audio pack (runtime files; masters stay local)
scripts/survivors.mjs    Crypt Survivors' build step: sprite atlas and audio for /survivors/
src/survivors/           Crypt Survivors, the game at /survivors/
Assets/survivors/        its CC0 sprite tiles (from crawl/tiles) and their license
scripts/serve.mjs        local preview server (mirrors the GitHub Pages base path)
scripts/icons/           draws the icon set (npm run icons)
src/templates.mjs        HTML templates for every page type
src/icons/               the site's icon set (generated SVGs, committed)
src/assets/              CSS, client JS, favicon, social image
site.config.json         site title, URL, repository, disclaimer
docs/agents-api.md       internal API reference for agents and integrations
docs/*-format.md         the canonical outline, supplement and practice set formats; docs/templates/ holds samples
docs/contributions-setup.md  how submissions work and how to turn them on
submissions/             submission relay (Cloudflare Worker), safety checks, local test inbox
```


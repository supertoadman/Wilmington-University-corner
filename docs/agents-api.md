# Agent & developer API (internal)

These endpoints are generated on every build but are **not linked anywhere on the public site**. Share them only with tools and people who need them.

Base URL: `https://supertoadman.github.io/Wilmington-University-corner/`

| Path | What it is |
| --- | --- |
| `llms.txt` | Index in the [llms.txt](https://llmstxt.org) format. Start here for LLMs. |
| `llms-full.txt` | Plain text of every document in one file |
| `api/catalog.json` | All subjects and documents with metadata and absolute URLs |
| `api/subjects/{subject}.json` | One subject and its documents |
| `api/documents/{subject}/{doc}.json` | One document's metadata plus extracted text |
| `api/documents/{subject}/{doc}.txt` | One document as plain text, good for retrieval |
| `api/search-index.json` | Compact index the site's own search uses |
| `api/openapi.json` | OpenAPI 3.1 description, for GPT actions or tool-calling agents |
| `api/specs/index.json` | Authoring specs and templates for new materials, with media types (below) |

Each document page also carries schema.org JSON-LD and `<link rel="alternate">` tags that point to its JSON and text versions, so a crawler that lands on a page can find the structured data.

## Quick start

```bash
curl -s https://supertoadman.github.io/Wilmington-University-corner/api/catalog.json \
  | jq '.documents[] | {title, type, url: .urls.page}'
```

```js
const base = 'https://supertoadman.github.io/Wilmington-University-corner/';
const catalog = await fetch(base + 'api/catalog.json').then((r) => r.json());
const doc = catalog.documents.find((d) => d.type === 'practice');
const { text } = await fetch(doc.urls.json).then((r) => r.json());
```

```python
import requests
base = "https://supertoadman.github.io/Wilmington-University-corner/"
catalog = requests.get(base + "api/catalog.json").json()
for d in catalog["documents"]:
    print(d["subjectTitle"], "|", d["title"], "|", d["urls"]["text"])
```

## Document record

```json
{
  "id": "evidence/evidence-rule-chart",
  "subject": "evidence",
  "subjectTitle": "Evidence",
  "slug": "evidence-rule-chart",
  "title": "Evidence Rule Chart (with class slides)",
  "description": "...",
  "type": "rule-chart",
  "typeLabel": "Rule Chart",
  "format": "Word",
  "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "originalFilename": "2Evidence_Rule_Chart (with class slides).docx",
  "tags": ["FRE", "rule chart"],
  "questions": null,
  "sizeBytes": 47380,
  "updated": "2026-10-04T18:10:00.000Z",
  "headings": ["..."],
  "urls": { "page": "...", "file": "...", "download": "...", "text": "...", "json": "..." }
}
```

The schema is versioned with `schemaVersion` in `catalog.json`. New fields may be added, but existing fields keep their meaning within a major version.

## Using it with an assistant

- **Chat assistants:** give the assistant the `llms.txt` URL and ask it to read the documents it links.
- **Custom GPTs and tool-calling agents:** import `api/openapi.json` as an action or tool schema.
- **RAG pipelines:** index each `urls.text` file. Use `updated` to re-index only what changed.
- **MCP:** a small [Model Context Protocol](https://modelcontextprotocol.io) server can wrap `catalog.json` to expose `list_documents`, `get_document(id)`, and `search(query)` tools.

## Authoring specs (for agents that write new materials)

Agents that *write* outlines, statutory supplements or practice sets for the site can fetch the formats it builds automatically. Files in these formats get the site's structured outline page, supplement viewer, or Shuffle-mode practice page, and the reference popup links their citations, with no manual cleanup.

| Path | What it is |
| --- | --- |
| `api/specs/index.json` | List of the files below, with titles, descriptions, media types and URLs |
| `api/specs/outline-format.md` | Outline format (outline/v1): the Word structures the site turns into sections, callouts and case cards, and that the popup indexes |
| `api/specs/supplement-format.md` | Supplement format (supplement/v1): the `AREAS`/`DATA` contract and the citation styles (`ucc`, `fre`, `mrpc`, `frcp`, `restatement`, `section`) |
| `api/specs/mcq-format.md` | Practice set format (mcq/v1): the question schema, the writing standard, and the citation rules that make questions link |
| `api/specs/ai-prompts.md` | Copy-paste prompts for generating each of the three |
| `api/specs/mcq-shuffle-template.html` | The standalone practice page with a sample set (replace the JSON in its `mcq-data` block) |
| `api/specs/supplement-template.html` | The standalone supplement viewer with sample data (replace its `SUPP`, `AREAS` and `DATA` lines) |
| `api/specs/sample.mcq.json`, `sample.supplement.json`, `sample-outline.json`, `sample-outline.docx` | Samples of each format |

The sources live in `docs/` and `docs/templates/` in the repository. Like the rest of this API, they are not linked from the public site or listed in the sitemap.

## Limitations

The older interactive practice banks keep their questions inside the page's script, so their `.txt` and `.json` text holds only the visible text; to work with the full question set, fetch the HTML file (`urls.file`). Sets in the canonical mcq/v1 format are the exception: their text holds every question, choice, answer and rationale, and their HTML carries the set as JSON in `<script id="mcq-data" type="application/json">`.

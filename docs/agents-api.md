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

## Limitations

The interactive practice banks keep their questions inside the page's script, so their `.txt` and `.json` text holds only the visible text. To work with the full question set, fetch the HTML file (`urls.file`).

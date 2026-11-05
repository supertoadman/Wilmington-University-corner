// Builds each subject's outline as HTML the demo can show and the reference popup can search:
// Word outlines go through the site's own structured-outline transform, HTML outlines are reduced
// to their body, and both get ids on their headings.

import fs from 'node:fs';
import mammoth from 'mammoth';
import { addHeadingIds as idHeadings } from '../../scripts/lib/outline.mjs';
import { addHeadingIds, markOutsideRuns, outsideTone, structureOutline, rainbowRows, labelTableCells } from './structure.mjs';

/** The outline HTML for a subject definition (see loadSubjectDefs), or '' when it has none. */
export async function buildOutlineHtml(def) {
  const doc = def.outlineDoc;
  if (!doc) return '';
  if (doc.file.endsWith('.docx')) {
    const raw = fs.readFileSync(doc.path);
    const styleMap = ["p[style-name='Title'] => h1.doc-title:fresh", "p[style-name='Subtitle'] => p.doc-subtitle:fresh", "highlight[color='darkMagenta'] => span.outside"];
    const source = doc.outsideColor ? markOutsideRuns(raw, doc.outsideColor) : raw;
    const { value } = await mammoth.convertToHtml({ buffer: source }, { styleMap });
    const shaped = doc.theme === 'structured' ? structureOutline(value, doc.outsideColor ? outsideTone(doc.outsideColor) : 'accent') : value;
    const labelled = doc.theme === 'structured' ? rainbowRows(labelTableCells(shaped)) : labelTableCells(shaped);
    return addHeadingIds(labelled.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>')).html;
  }
  if (doc.file.endsWith('.html')) {
    let html = fs.readFileSync(doc.path, 'utf8');
    html = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, '');
    const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    html = (body ? body[1] : html.replace(/<head\b[\s\S]*?<\/head>/i, '').replace(/<\/?(?:html|body)\b[^>]*>|<!doctype[^>]*>/gi, '')).trim();
    // Inline event handlers and javascript: URLs never belong in a stored outline.
    html = html.replace(/\son[a-z]+="[^"]*"/gi, '').replace(/href="javascript:[^"]*"/gi, 'href="#"');
    return idHeadings(html);
  }
  return '';
}

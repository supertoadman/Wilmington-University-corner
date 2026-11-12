// The Topics checklist (src/assets/topic-picker.js) as page code, for practice pages that must work
// on their own, offline or downloaded. Pages built from an .mcq.json set inline it
// (practice-shell.mjs). The older hand-built practice pages in content/ carry two empty placeholders,
// <style data-topic-picker></style> and <script data-topic-picker></script>; the build fills them
// (inlineTopicPicker) before it serves, zips or reads the page, so every copy has the current picker
// while the sources stay small. Each such page maps its own color names onto the picker's (a short
// ".tp,.tp-btn,.tp-note{...}" rule in its stylesheet) and hooks it up with TopicPicker.topicFilter().

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const EXPORTS = ['topicsButton', 'showTopics', 'topicFilter', 'pickTopics'];

/** The picker as one classic script that defines a single global, `TopicPicker`. */
export function topicPickerScript() {
  const js = fs.readFileSync(path.join(SRC, 'assets', 'topic-picker.js'), 'utf8').replace(/^export /gm, '');
  if (/^\s*import\s/m.test(js)) throw new Error('src/assets/topic-picker.js must not import anything');
  if (/<\/(?:script|style)/i.test(js)) throw new Error('src/assets/topic-picker.js must not contain a closing script or style tag');
  return `var TopicPicker = (function () {\n${js.trim()}\nreturn { ${EXPORTS.map((n) => `${n}: ${n}`).join(', ')} };\n})();\n`;
}

/** The picker's .tp-* rules: the "Topic picker" section of src/practice/shell.css. */
export function topicPickerCss() {
  const css = fs.readFileSync(path.join(SRC, 'practice', 'shell.css'), 'utf8');
  const start = css.indexOf('/* ---------- Topic picker');
  const end = start < 0 ? -1 : css.indexOf('\n/* ----------', start + 1);
  if (start < 0 || end < 0) throw new Error('src/practice/shell.css has no "Topic picker" section');
  return `${css.slice(start, end).trim()}\n`;
}

const STYLE = /<style data-topic-picker>[\s\S]*?<\/style>/i;
const SCRIPT = /<script data-topic-picker>[\s\S]*?<\/script>/i;

/** Whether a page has the placeholders. */
export const hasTopicPicker = (html) => STYLE.test(html) && SCRIPT.test(html);

/** Fills a page's placeholders with the current picker; any other page comes back unchanged. */
export function inlineTopicPicker(html) {
  if (!hasTopicPicker(html)) return html;
  return html
    .replace(STYLE, () => `<style data-topic-picker>\n${topicPickerCss()}</style>`)
    .replace(SCRIPT, () => `<script data-topic-picker>\n${topicPickerScript()}</script>`);
}

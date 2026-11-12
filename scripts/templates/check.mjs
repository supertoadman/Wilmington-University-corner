#!/usr/bin/env node
// Checks a file in one of the canonical formats before (or after) it goes into content/<Subject>/:
//
//   npm run check -- "content/Sales and Leases/Sales_and_Leases_Remedies.mcq.json"
//   npm run check -- path/to/outline.json            (outline/v1 data for build-outline-docx.mjs)
//   npm run check -- "content/Evidence/Evidence_Condensed_Outline.docx"
//   npm run check -- path/to/Rules.supplement.json
//   npm run check -- "content/Evidence/Evidence_Rules_Flashcards.cards.json"
//
// Practice sets (.mcq.json, or .html with an mcq-data block) are validated against mcq/v1, and their
// citations are checked against the course's reference index: every statute cite, case name and
// "Problem 4-3(b)" should link in the popup. The index comes from the last build
// (dist/assets/refs/<subject>.json; run `npm run build` first) or from --refs <file>.
// Outlines are built and read the way the site reads them, and the sections, case keys and worked
// problems the popup will index are listed. Flashcard decks (.cards.json, or .html with a cards-data
// block) are validated against cards/v1. Exit code 1 means errors.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { readMcq, normalizeMcq } from '../lib/mcq.mjs';
import { readSupplement, readSupplementPage, normalizeSupplement } from '../lib/supplement-shell.mjs';
import { readCards, normalizeCards } from '../lib/cards.mjs';
import { convertDocx } from '../lib/docx.mjs';
import { refIndex } from '../lib/refs.mjs';
import { slugify } from '../lib/text.mjs';
import { buildOutlineDocx } from './build-outline-docx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The citation matchers the popup itself uses (src/assets/refs.js, run without a page). */
export function loadCites() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'assets', 'refs.js'), 'utf8'), ctx);
  return ctx.refsCites;
}

/**
 * Whether choice length gives the answer away. For each question whose choices shuffle, ranks the
 * key by length (0 = longest). By chance the key is longest about 1 time in n and in the top two
 * about 2 in n; a set where "pick the longest" or "pick between the two longest" does much better
 * than that has a tell. Returns the share at each rank and warnings past the thresholds.
 */
export function answerLengthBias(set) {
  const ranks = [];
  for (const q of set.questions) {
    if (q.fixed || !Array.isArray(q.o) || q.o.length < 4) continue;
    const len = q.o.map((o) => String(o).length);
    ranks.push(len.filter((l, i) => l > len[q.a] || (l === len[q.a] && i < q.a)).length / (q.o.length - 1));
  }
  const n = ranks.length;
  if (n < 10) return { n, longest: 0, topTwo: 0, warnings: [] };
  const longest = ranks.filter((r) => r === 0).length / n;
  const topTwo = ranks.filter((r) => r <= 0.25).length / n;
  const pct = (x) => `${Math.round(100 * x)}%`;
  const warnings = [];
  if (longest > 0.35) warnings.push(`the correct choice is the longest in ${pct(longest)} of questions (about 20% by chance): even out choice lengths`);
  if (topTwo > 0.6) warnings.push(`the correct choice is one of the two longest in ${pct(topTwo)} of questions (about 40% by chance): even out choice lengths`);
  return { n, longest, topTwo, warnings };
}

/** The subject folder and subject.json of a file under content/, if it is in one. */
function subjectOf(file) {
  const rel = path.relative(path.join(ROOT, 'content'), path.resolve(file));
  if (rel.startsWith('..') || !rel.includes(path.sep)) return null;
  const folder = rel.split(path.sep)[0];
  const metaFile = path.join(ROOT, 'content', folder, 'subject.json');
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
  return { folder, meta, slug: meta.slug || slugify(folder) };
}

/**
 * Citation report for a checked set against a reference index: for each question, what links and
 * what won't. Returns { linked, problems: [messages], unlinked: [question ids] }.
 */
export function lintCitations(set, index, cites = loadCites()) {
  const style = cites.STYLES[index.cite] || cites.STYLES.ucc;
  const statutes = new Set(index.statutes.map((s) => s.s));
  const problems = new Set((index.problems || []).map((p) => p.n));
  const caseRe = cites.caseRegex(index.cases || []);
  const issues = [], unlinked = [];
  let linked = 0;
  for (const q of set.questions) {
    const texts = [q.hypo && set.hypos[q.hypo]?.text, q.q, ...q.o, ...q.oe, q.e].filter(Boolean);
    let n = 0;
    for (const t of texts) {
      for (const c of style.cites(t)) {
        if (statutes.has(c.id)) n++;
        else issues.push(`question ${q.id}: "${t.slice(c.at, c.end)}" won't link (${style.name(c.id)} isn't in the supplement)`);
      }
      for (const m of t.matchAll(cites.PROB)) {
        for (const p of cites.problemsIn(m)) {
          if (problems.has(p.n)) n++;
          else issues.push(`question ${q.id}: "Problem ${p.n}${p.sub}" won't link (the outline doesn't work Problem ${p.n})`);
        }
      }
      const caseSpans = caseRe ? [...t.matchAll(caseRe)].map((m) => [m.index, m.index + m[0].length]) : [];
      n += caseSpans.length;
      // "Party v. Party" names that no case card in the outline keys.
      for (const m of t.matchAll(/\b([A-Z][\w&.'’-]*(?:\s+(?:[A-Z][\w&.'’-]*|&|of|de))*)\s+v\.\s+([A-Z][\w&.'’-]*)/g)) {
        if (!caseSpans.some(([a, b]) => a < m.index + m[0].length && b > m.index)) issues.push(`question ${q.id}: "${m[0]}" isn't a case card in the outline, so it won't link`);
      }
    }
    if (n) linked++; else unlinked.push(q.id);
  }
  return { linked, issues, unlinked };
}

function report(label, { errors = [], warnings = [], notes = [] }) {
  for (const e of errors) console.log(`  error: ${e}`);
  for (const w of warnings) console.log(`  warning: ${w}`);
  for (const n of notes) console.log(`  ${n}`);
  console.log(`${label}: ${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
  return errors.length;
}

function summarizeIndex(ix) {
  const h2 = ix.sections.filter((s) => s.level === 2);
  return [
    `sections: ${h2.length} (${ix.sections.length - h2.length} subsections)`,
    ...h2.map((s) => `  ${s.title}${s.week ? ` [${s.week}]` : ''}: ${s.children.length} subsections`),
    `case cards: ${ix.cases.length}`,
    ...ix.cases.map((c) => `  ${c.keys.join(' | ')}  <-  ${c.title}`),
    `worked problems: ${ix.problems.length}${ix.problems.length ? ` (${ix.problems.map((p) => p.n + (p.parts.some((x) => x.part) ? `[${p.parts.filter((x) => x.part).map((x) => x.part).join('')}]` : '')).join(', ')})` : ''}`,
  ];
}

async function check(file, refsPath) {
  const text = fs.readFileSync(file, file.endsWith('.docx') ? null : 'utf8');
  const subject = subjectOf(file);
  if (file.endsWith('.docx')) {
    const dm = subject?.meta.documents?.[path.basename(file)] || {};
    const { html } = await convertDocx(text, { theme: 'structured', outsideColor: dm.outsideColor });
    const notes = summarizeIndex(refIndex({ outlineHtml: html, links: {}, fullNames: subject?.meta.refs?.fullNames }));
    const warnings = dm.theme === 'structured' || !subject ? [] : ['subject.json doesn\'t give this file "theme": "structured", so the site shows it unstructured'];
    return report(file, { warnings, notes });
  }
  const json = /^\s*\{/.test(text) ? (() => { try { return JSON.parse(text); } catch (e) { return { parseError: e.message }; } })() : null;
  if (json?.parseError) return report(file, { errors: [`not valid JSON: ${json.parseError}`] });
  if (json && /^outline\//.test(json.schema || '')) {
    let html;
    try { ({ html } = await convertDocx(buildOutlineDocx(json), { theme: 'structured', outsideColor: json.outsideColor })); } catch (e) { return report(file, { errors: [e.message] }); }
    return report(file, { notes: summarizeIndex(refIndex({ outlineHtml: html, links: {} })) });
  }
  const cardsRaw = readCards(text);
  if (cardsRaw) {
    const { deck, errors, warnings } = normalizeCards(cardsRaw);
    const per = deck.topics.map((t) => `  ${t}: ${deck.cards.filter((c) => c.topic === t).length}`);
    return report(file, { errors, warnings, notes: [`cards: ${deck.cards.length} in ${deck.topics.length} topic${deck.topics.length === 1 ? '' : 's'}`, ...per] });
  }
  const suppRaw = json && !Array.isArray(json.questions) ? readSupplement(text) : readSupplementPage(text);
  if (suppRaw) {
    const { data, errors, warnings } = normalizeSupplement(suppRaw);
    return report(file, { errors, warnings, notes: [`entries: ${data.length}`] });
  }
  const raw = readMcq(text);
  if (!raw) return report(file, { errors: ['not an mcq/v1 set, supplement/v1 supplement, cards/v1 deck, or outline/v1 outline (see docs/*-format.md)'] });
  const { set, errors, warnings } = normalizeMcq(raw);
  const notes = [`questions: ${set.questions.length} in ${set.exams.length || 1} exam${set.exams.length > 1 ? 's' : ''}, ${set.areas.length} topic areas`];
  const bias = answerLengthBias(set);
  warnings.push(...bias.warnings);
  if (bias.n >= 10) notes.push(`choice length: the key is the longest in ${Math.round(100 * bias.longest)}% and one of the two longest in ${Math.round(100 * bias.topTwo)}% of ${bias.n} shuffled questions`);
  const index = refsPath ? path.resolve(refsPath) : subject && path.join(ROOT, 'dist', 'assets', 'refs', `${subject.slug}.json`);
  if (index && fs.existsSync(index)) {
    const lint = lintCitations(set, JSON.parse(fs.readFileSync(index, 'utf8')));
    warnings.push(...lint.issues);
    notes.push(`citations: ${lint.linked} of ${set.questions.length} questions have at least one inline link`);
    if (lint.unlinked.length) notes.push(`  no inline links (Look up still suggests from their words): ${lint.unlinked.join(', ')}`);
  } else if (subject?.meta.refs) {
    notes.push(`citations not checked: run \`npm run build\` first (no ${path.relative(ROOT, index)})`);
  } else {
    notes.push('citations not checked: the subject has no "refs" in subject.json, or pass --refs <index.json>');
  }
  return report(file, { errors, warnings, notes });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--refs');
  const refs = at >= 0 ? args.splice(at, 2)[1] : null;
  if (!args.length) {
    console.error('Usage: npm run check -- <file.mcq.json | file.cards.json | file.html | outline.json | outline.docx | file.supplement.json> [--refs dist/assets/refs/<subject>.json]');
    process.exit(2);
  }
  let errors = 0;
  for (const f of args) errors += await check(f, refs);
  process.exit(errors ? 1 : 0);
}

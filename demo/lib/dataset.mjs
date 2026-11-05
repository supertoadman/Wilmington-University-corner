// Turns the real study materials in content/ into plain rows for the demo database: subjects with
// their outlines, master rule nodes, questions and classified choices, and the reference-popup
// bundles. No database here, so it can be tested and cached on its own.

import fs from 'node:fs';
import { htmlSections, matcher } from '../../scripts/lib/outline.mjs';
import { refIndex } from '../../scripts/lib/refs.mjs';
import { slugify } from '../../scripts/lib/text.mjs';
import { loadSubjectDefs, readSet } from './bank.mjs';
import { buildOutlineHtml } from './outlines.mjs';
import { classifyTrap } from './traps.mjs';
import { hash32 } from './prng.mjs';

const trim = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** "Ch. 6 · Immoral Speech" -> "Immoral Speech"; "Tier 2 · Quantity & price (§§ 2-305)" -> "Quantity & price (§§ 2-305)". */
export function cleanArea(topic) {
  const area = String(topic || '').split(' — ')[0].trim() || 'General';
  const m = area.match(/^(?:Tier \d|Ch\. [\d–-]+|[IVXLC]+|\d+)\s·\s(.+)$/);
  return (m ? m[1] : area).trim();
}

const UCC = /§§?\s*(\d-\d{3}[A-Z]?(?:\([a-z0-9]{1,4}\))*)/g;
const RULE = /\b(?:FRE|Fed\. R\. Evid\.|Rule|Rules)\s+(\d{1,4}(?:\.\d+)?(?:\([a-z0-9]{1,4}\))*)/g;
const REST = /Restatement \((?:Second|Third)\) of \w+(?: \w+)? § ?[\d.]+/g;
/** Statute and rule cites that appear in a node's text, most frequent first. */
function statuteCites(text) {
  const n = new Map();
  const add = (k) => n.set(k, (n.get(k) || 0) + 1);
  for (const m of text.matchAll(UCC)) add(`§ ${m[1]}`);
  for (const m of text.matchAll(RULE)) add(`Rule ${m[1]}`);
  for (const m of text.matchAll(REST)) add(m[0]);
  return [...n].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 6);
}

/**
 * Assign scopes: ~20% bar_only, ~15% course, the rest both. Whole outline sections tend to go together
 * (a topic is either in the professor's syllabus or only on the bar), with a little noise inside each.
 */
function assignScopes(nodes) {
  const groups = new Map();
  for (const n of nodes) (groups.get(n.group) || groups.set(n.group, []).get(n.group)).push(n);
  const order = [...groups].sort((a, b) => hash32(`g${a[0]}`) - hash32(`g${b[0]}`));
  const total = nodes.length;
  const lead = new Map();
  // Fill each quota with whole sections that fit, skipping any that would overshoot.
  for (const [kind, cap] of [['bar_only', total * 0.2], ['course', total * 0.15]]) {
    let seen = 0;
    for (const [key, list] of order) {
      if (!lead.has(key) && seen + list.length <= cap) { lead.set(key, kind); seen += list.length; }
    }
  }
  for (const [key, list] of groups) {
    const kind = lead.get(key) || 'both';
    for (const n of list) n.scope = kind === 'both' || kind === 'bar_only' || hash32(`n${n.id}`) % 100 < 90 ? kind : 'both';
  }
}

export async function buildDataset() {
  const defs = loadSubjectDefs();
  const outlines = await Promise.all(defs.map(buildOutlineHtml));
  const out = { subjects: [], nodes: [], questions: [], choices: [], refs: {} };

  defs.forEach((def, di) => {
    const outlineHtml = outlines[di];
    const sections = outlineHtml ? htmlSections(outlineHtml) : [];
    const match = sections.length ? matcher(sections) : () => -1;
    const sets = def.sets.map((s) => ({ ...s, ...readSet(s.path) }));

    const nodeByKey = new Map();
    const nodes = [];
    const used = new Set();
    const nodeId = (code) => {
      let id = `${def.short}.${slugify(code).slice(0, 48) || 'rule'}`;
      for (let i = 2; used.has(id); i++) id = `${def.short}.${slugify(code).slice(0, 44)}-${i}`;
      used.add(id);
      return id;
    };
    const nodeFor = (key, make) => {
      if (!nodeByKey.has(key)) { const n = { ...make(), subject_id: def.id, scope: 'both', texts: [], qn: 0 }; n.id = nodeId(n.code); nodeByKey.set(key, n); nodes.push(n); }
      return nodeByKey.get(key);
    };

    const rows = [];
    for (const set of sets) {
      const idOf = new Map();
      set.questions.forEach((q, i) => { if (q.srcId) idOf.set(q.srcId, `${set.slug}.${String(i + 1).padStart(3, '0')}`); });
      set.questions.forEach((q, i) => {
        const pos = i + 1;
        let node;
        const code = q.cov?.[0];
        const area = code && set.COV && Object.keys(set.COV).find((a) => set.COV[a]?.[code] != null && (a === q.qArea)) || (code && set.COV && Object.keys(set.COV).find((a) => set.COV[a]?.[code] != null));
        if (code && area) {
          node = nodeFor(`cov|${area}|${code}`, () => ({ area_title: area, code, title: String(set.COV[area][code]), derived: false }));
        } else {
          const title = cleanArea(q.topic);
          node = nodeFor(`d|${title.toLowerCase()}`, () => ({ area_title: null, code: slugify(title).slice(0, 40), title, derived: true }));
        }
        node.qn++;
        if (node.texts.length < 6) node.texts.push(`${q.q} ${q.e || ''}`);
        rows.push({ set, q, pos, node });
      });
    }

    // Place each node in the outline, and (for derived nodes) borrow the outline's own area heading.
    for (const n of nodes) {
      const hit = sections.length ? match(`${n.title} ${n.texts.join(' ').slice(0, 1500)}`, n.title) : -1;
      n.matched = hit >= 0;
      n.outline_anchor = hit >= 0 ? sections[hit].anchor : null;
      n.group = hit >= 0 ? sections[hit].title.split(' › ')[0] : `~${n.area_title || n.title}`;
      if (n.derived) n.area_title = hit >= 0 ? sections[hit].title.split(' › ')[0] : 'Additional bar topics';
    }
    assignScopes(nodes);

    // Reference-popup bundle.
    const supplementHtml = def.statutesDoc ? fs.readFileSync(def.statutesDoc.path, 'utf8') : undefined;
    const bundle = refIndex({ supplementHtml, outlineHtml, links: { statutes: null, outline: null }, cite: def.refs.cite, fullNames: def.refs.fullNames });
    out.refs[def.id] = bundle;
    const caseKeys = bundle.cases.map((c) => c.keys[0]).filter((k) => k && k.length > 4);
    for (const n of nodes) {
      const text = `${n.title} ${n.texts.join(' ')}`;
      n.statute_cites = statuteCites(text);
      n.case_cites = caseKeys.filter((k) => text.includes(k)).slice(0, 5);
    }

    // Questions and their choices.
    let variations = 0;
    const setIds = new Map();
    for (const { set, q, pos, node } of rows) {
      const id = `${set.slug}.${String(pos).padStart(3, '0')}`;
      setIds.set(`${set.slug}|${q.srcId}`, id);
      const isVar = q.pre ? 1 : 0;
      variations += isVar;
      out.questions.push({
        id, subject_id: def.id, source_set: set.title, set_slug: set.slug, num_in_set: pos, rule_node_id: node.id,
        parent_question_id: q.parentKey ? setIds.get(`${set.slug}|${q.parentKey}`) || `${set.slug}.${String(set.questions.findIndex((x) => x.srcId === q.parentKey) + 1).padStart(3, '0')}` : null,
        is_variation: isVar, pre_facts: q.pre || null, fixed_order: q.fixed ? 1 : 0, stem: q.q, correct_index: q.a, explanation: q.e || null, status: 'approved',
      });
      q.o.forEach((text, ci) => {
        const rationale = q.oe?.[ci] || null;
        const right = ci === q.a;
        const trap = right ? null : classifyTrap(`${rationale || ''} ${text}${rationale ? '' : ` ${(q.e || '').slice(0, 400)}`}`, def.id);
        out.choices.push({ question_id: id, choice_index: ci, choice_text: text, rationale, is_correct: right ? 1 : 0, trap_code: trap?.code ?? null, trap_label: trap?.label ?? null });
      });
    }
    // A parent that never resolved (id typo in the source) is simply not linked.
    const known = new Set(out.questions.filter((x) => x.subject_id === def.id).map((x) => x.id));
    for (const q of out.questions) if (q.subject_id === def.id && q.parent_question_id && !known.has(q.parent_question_id)) q.parent_question_id = null;

    for (const n of nodes) out.nodes.push({
      id: n.id, subject_id: def.id, area_title: n.area_title, code: n.code, title: trim(n.title, 200), scope: n.scope, outline_anchor: n.outline_anchor,
      statute_cites_json: JSON.stringify(n.statute_cites), case_cites_json: JSON.stringify(n.case_cites),
    });
    out.subjects.push({
      id: def.id, title: def.title, ncbe_category: def.ncbe, accent: def.accent, outline_html: outlineHtml, description: def.description, sort_order: def.order,
      question_count: rows.length, variation_count: variations, rule_count: nodes.length, cite: def.refs.cite || null,
    });
  });
  return out;
}

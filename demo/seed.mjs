// Builds the demo database from the real study materials: subjects, outlines, master rule nodes,
// every question and choice, six personas, 150 cohort students and ~35,000 attempts, plus the
// reference-popup bundles in demo/data/refs/. One transaction, a few seconds.
//
//   node --disable-warning=ExperimentalWarning demo/seed.mjs [--force]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, tx, setMeta, getMeta, removeDb, DATA_DIR, DEFAULT_DB, SCHEMA_VERSION } from './db.mjs';
import { buildDataset } from './lib/dataset.mjs';
import { simulate } from './lib/sim.mjs';

export const REFS_DIR = path.join(DATA_DIR, 'refs');
const SUBJECT_IDS = ['agency-and-partnership', 'civil-procedure', 'con-law-ii', 'contracts-i', 'evidence', 'professional-responsibility', 'sales-and-leases'];

/** Whether a usable database (and the reference bundles that go with it) already exists. */
export function isSeeded(dbFile = DEFAULT_DB, refsDir = REFS_DIR) {
  if (!fs.existsSync(dbFile)) return false;
  if (!SUBJECT_IDS.every((id) => fs.existsSync(path.join(refsDir, `${id}.json`)))) return false;
  let db;
  try { db = openDb(dbFile); return Number(getMeta(db, 'schema_version')) === SCHEMA_VERSION; } catch { return false; } finally { db?.close(); }
}

/** Build the database from scratch at dbFile. Resolves to { dbFile, refsDir, stats }. */
export async function seedDatabase({ dbFile = DEFAULT_DB, refsDir = REFS_DIR, now = Date.now(), log = () => {} } = {}) {
  const t0 = Date.now();
  const data = await buildDataset();
  log(`content read in ${Date.now() - t0} ms`);
  const sim = simulate({ dataset: data, now });
  log(`${sim.events.length} attempts simulated in ${Date.now() - t0} ms`);

  fs.mkdirSync(refsDir, { recursive: true });
  for (const [id, bundle] of Object.entries(data.refs)) fs.writeFileSync(path.join(refsDir, `${id}.json`), JSON.stringify(bundle));

  removeDb(dbFile);
  const db = openDb(dbFile);
  const flagged = new Set(sim.flagged);
  tx(db, () => {
    const ins = (sql) => db.prepare(sql);
    const sub = ins('INSERT INTO subjects (id,title,ncbe_category,accent,outline_html,question_count,variation_count,rule_count,description,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (const s of data.subjects) sub.run(s.id, s.title, s.ncbe_category, s.accent, s.outline_html, s.question_count, s.variation_count, s.rule_count, s.description, s.sort_order);
    const node = ins('INSERT INTO master_rule_nodes (id,subject_id,area_title,code,title,scope,outline_anchor,statute_cites_json,case_cites_json) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const n of data.nodes) node.run(n.id, n.subject_id, n.area_title, n.code, n.title, n.scope, n.outline_anchor, n.statute_cites_json, n.case_cites_json);
    const q = ins('INSERT INTO questions (id,subject_id,source_set,set_slug,num_in_set,rule_node_id,parent_question_id,is_variation,pre_facts,fixed_order,stem,correct_index,explanation,status,revision,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NULL)');
    for (const x of data.questions) q.run(x.id, x.subject_id, x.source_set, x.set_slug, x.num_in_set, x.rule_node_id, x.parent_question_id, x.is_variation, x.pre_facts, x.fixed_order, x.stem, x.correct_index, x.explanation, flagged.has(x.id) ? 'flagged' : x.status);
    const ch = ins('INSERT INTO question_choices (question_id,choice_index,choice_text,rationale,is_correct,trap_code,trap_label) VALUES (?,?,?,?,?,?,?)');
    for (const c of data.choices) ch.run(c.question_id, c.choice_index, c.choice_text, c.rationale, c.is_correct, c.trap_code, c.trap_label);
    const us = ins('INSERT INTO users (id,name,email,role,cohort_year,assigned_subject_id,persona_badge,is_persona) VALUES (?,?,?,?,?,?,?,?)');
    for (const u of sim.users) us.run(u.id, u.name, u.email, u.role, u.cohort_year, u.assigned_subject_id, u.persona_badge, u.is_persona);
    const ev = ins('INSERT INTO attempt_events (user_id,question_id,subject_id,rule_node_id,selected_index,is_correct,trap_code,crossed_out_json,opened_popup,duration_ms,mode,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const e of sim.events) ev.run(e.user_id, e.question_id, e.subject_id, e.rule_node_id, e.selected_index, e.is_correct, e.trap_code, e.crossed_out_json, e.opened_popup, e.duration_ms, e.mode, e.created_at);
    setMeta(db, 'seeded_at', new Date(now).toISOString());
    setMeta(db, 'sim_tags', JSON.stringify(sim.tags));
    setMeta(db, 'schema_version', SCHEMA_VERSION);
  });
  const stats = {
    subjects: data.subjects.length, rules: data.nodes.length, questions: data.questions.length, choices: data.choices.length,
    users: sim.users.length, attempts: sim.events.length, flagged: sim.flagged.length, ms: Date.now() - t0,
  };
  db.close();
  log(`seeded ${JSON.stringify(stats)}`);
  return { dbFile, refsDir, stats };
}

/** Seed only if there is no usable database yet. Resolves to true when it had to seed. */
export async function ensureSeeded(opts = {}) {
  const dbFile = opts.dbFile || DEFAULT_DB;
  const refsDir = opts.refsDir || REFS_DIR;
  if (!opts.force && isSeeded(dbFile, refsDir)) return false;
  await seedDatabase({ ...opts, dbFile, refsDir });
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { stats } = await seedDatabase({ log: (m) => console.log(m), dbFile: process.env.DEMO_DB || DEFAULT_DB });
  console.log(stats);
}

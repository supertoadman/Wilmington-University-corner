// SQLite storage for the demo (Node's built-in node:sqlite, no packages). One file in WAL mode.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const DEMO_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(DEMO_DIR, 'data');
export const DEFAULT_DB = path.join(DATA_DIR, 'scale_demo.sqlite');
// Bump when the schema or the seeded data changes shape: an older file is rebuilt on boot.
export const SCHEMA_VERSION = 4;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,                 -- slug, e.g. 'sales-and-leases'
  title TEXT NOT NULL,
  ncbe_category TEXT,
  accent TEXT,
  outline_html TEXT,
  question_count INTEGER NOT NULL DEFAULT 0,
  variation_count INTEGER NOT NULL DEFAULT 0,
  rule_count INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS master_rule_nodes (
  id TEXT PRIMARY KEY,                 -- e.g. 'sal.2207-1'
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  area_title TEXT,
  code TEXT,
  title TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'both' CHECK (scope IN ('course','bar_only','both','hidden')),
  outline_anchor TEXT,                 -- '#heading-id' in the subject's outline
  statute_cites_json TEXT NOT NULL DEFAULT '[]',
  case_cites_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_rules_subject ON master_rule_nodes(subject_id);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,                 -- '<set slug>.<position>'
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  source_set TEXT,
  set_slug TEXT,
  num_in_set INTEGER,
  rule_node_id TEXT REFERENCES master_rule_nodes(id),
  parent_question_id TEXT,             -- the base question a 1-fact variation changes
  is_variation INTEGER NOT NULL DEFAULT 0,
  pre_facts TEXT,                      -- the base question's facts, for a variation
  fixed_order INTEGER NOT NULL DEFAULT 0,
  stem TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','flagged','draft','retired')),
  revision INTEGER NOT NULL DEFAULT 0, -- bumped by every edit in the SME workbench
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_q_subject ON questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_q_rule ON questions(rule_node_id);
CREATE INDEX IF NOT EXISTS idx_q_status ON questions(status);

CREATE TABLE IF NOT EXISTS question_choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL REFERENCES questions(id),
  choice_index INTEGER NOT NULL,       -- position in the stored order (the correct one is often 0)
  choice_text TEXT NOT NULL,
  rationale TEXT,
  is_correct INTEGER NOT NULL DEFAULT 0,
  trap_code TEXT,
  trap_label TEXT,
  UNIQUE (question_id, choice_index)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('student','faculty','dean','admin')),
  cohort_year INTEGER,                 -- graduating class: 2027 (3L), 2028 (2L), 2029 (1L)
  assigned_subject_id TEXT,
  persona_badge TEXT,
  is_persona INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attempt_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  question_id TEXT NOT NULL REFERENCES questions(id),
  subject_id TEXT NOT NULL,
  rule_node_id TEXT,
  selected_index INTEGER NOT NULL,
  is_correct INTEGER NOT NULL,
  trap_code TEXT,                      -- the trap behind the picked wrong choice
  crossed_out_json TEXT NOT NULL DEFAULT '[]',
  opened_popup INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  mode TEXT NOT NULL DEFAULT 'study' CHECK (mode IN ('study','timed')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ev_user ON attempt_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ev_question ON attempt_events(question_id);
CREATE INDEX IF NOT EXISTS idx_ev_subject ON attempt_events(subject_id);
CREATE INDEX IF NOT EXISTS idx_ev_rule ON attempt_events(rule_node_id);

CREATE TABLE IF NOT EXISTS compiler_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id TEXT,
  title TEXT NOT NULL,
  source_name TEXT,
  mode TEXT,                           -- 'showcase' | 'live'
  master_nodes_json TEXT,
  student_outline_html TEXT,
  generated_questions_json TEXT,
  verification_json TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'compiled',   -- 'compiled' | 'published'
  published_at TEXT,
  meta_json TEXT
);
`;

/** Open (creating if needed) a demo database with the schema applied. */
export function openDb(file = DEFAULT_DB) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

/** Run fn inside one transaction; roll back if it throws. */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  }
}

export const getMeta = (db, key) => db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
export const setMeta = (db, key, value) => db.prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));

/** Delete a database file and its WAL/SHM side files. */
export function removeDb(file) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
}

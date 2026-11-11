// SQLite via Node's built-in node:sqlite. Starts EMPTY - no demo accounts, no seed data.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..", "data");
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(resolve(dataDir, "bits-connect.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student')),
  student_id    TEXT,
  program       TEXT DEFAULT 'software_engineering',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- GPA tracker (a student's own course records)
CREATE TABLE IF NOT EXISTS gpa_courses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  title      TEXT NOT NULL,
  credits    INTEGER NOT NULL CHECK (credits BETWEEN 1 AND 6),
  grade      TEXT,
  status     TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','inprogress','planned')),
  year       INTEGER CHECK (year BETWEEN 1 AND 4),
  semester   TEXT,
  UNIQUE (user_id, code)
);

-- Habit tracker (90 days per habit, up to 10 habits)
CREATE TABLE IF NOT EXISTS habits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS habit_entries (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id  INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  day       INTEGER NOT NULL CHECK (day BETWEEN 1 AND 90),
  completed INTEGER NOT NULL DEFAULT 1,
  UNIQUE (habit_id, day)
);

-- PSP logs: Job Number Log and Daily Time Log
CREATE TABLE IF NOT EXISTS psp_jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_no       INTEGER NOT NULL,
  project      TEXT NOT NULL DEFAULT 'General',
  kind         TEXT NOT NULL DEFAULT 'project' CHECK (kind IN ('previous','project')),
  phase        TEXT NOT NULL DEFAULT 'other',
  name         TEXT NOT NULL,
  est_minutes  INTEGER,
  est_units    REAL,
  unit_label   TEXT NOT NULL DEFAULT 'LOC',
  actual_units REAL,
  status       TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','done')),
  completed_on TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, job_no)
);

CREATE TABLE IF NOT EXISTS psp_entries (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id            INTEGER NOT NULL REFERENCES psp_jobs(id) ON DELETE CASCADE,
  entry_date        TEXT NOT NULL,
  start_time        TEXT NOT NULL,
  stop_time         TEXT NOT NULL,
  interruption_min  INTEGER NOT NULL DEFAULT 0,
  interruption_note TEXT,
  delta_min         INTEGER NOT NULL,
  comments          TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_psp_entries_user_date ON psp_entries (user_id, entry_date);

-- PSP sticky notes (optionally linked to a job)
CREATE TABLE IF NOT EXISTS psp_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id     INTEGER REFERENCES psp_jobs(id) ON DELETE SET NULL,
  body       TEXT NOT NULL DEFAULT '',
  color      TEXT NOT NULL DEFAULT 'yellow' CHECK (color IN ('yellow','green','blue','pink','purple','white')),
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_psp_notes_user ON psp_notes (user_id, pinned, updated_at);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  habit_start_date TEXT
);
`);

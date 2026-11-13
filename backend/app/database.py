import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from .config import db_path

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, summary TEXT DEFAULT '',
  raw_text TEXT DEFAULT '', skills TEXT DEFAULT '[]', experience TEXT DEFAULT '[]',
  projects TEXT DEFAULT '[]', education TEXT DEFAULT '[]', achievements TEXT DEFAULT '[]',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, company TEXT DEFAULT '',
  description TEXT NOT NULL, required_skills TEXT DEFAULT '[]', url TEXT, notes TEXT DEFAULT '',
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL, saved_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, preset TEXT, interview_type TEXT NOT NULL, role TEXT NOT NULL,
  config TEXT NOT NULL, num_questions INTEGER NOT NULL, status TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, report TEXT);
CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, question TEXT NOT NULL, category TEXT DEFAULT 'General',
  hint TEXT DEFAULT '', is_follow_up INTEGER DEFAULT 0, answer TEXT, feedback TEXT,
  score REAL, answered_at TEXT);
CREATE TABLE IF NOT EXISTS coding_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT NOT NULL, problem TEXT NOT NULL,
  code TEXT NOT NULL, review TEXT NOT NULL, created_at TEXT NOT NULL);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with db() as c:
        c.executescript(SCHEMA)


def jloads(value, default):
    try:
        return json.loads(value) if value else default
    except (TypeError, ValueError):
        return default

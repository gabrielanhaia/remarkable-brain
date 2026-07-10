import Database from 'better-sqlite3';
export type DB = Database.Database;

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      excluded INTEGER NOT NULL DEFAULT 0,
      folder_path TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      page_number INTEGER NOT NULL,
      written_at TEXT,
      image_path TEXT,
      extracted_text TEXT,
      page_type TEXT,
      open_loop INTEGER NOT NULL DEFAULT 0,
      open_loop_description TEXT,
      extracted_at TEXT,
      content_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pages_notebook ON pages(notebook_id);
    CREATE INDEX IF NOT EXISTS idx_pages_open_loop ON pages(open_loop);

    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      UNIQUE(name, type)
    );

    CREATE TABLE IF NOT EXISTS page_entities (
      page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      PRIMARY KEY (page_id, entity_id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      extracted_text,
      content='pages',
      content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
      INSERT INTO pages_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
    END;
    CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
    END;
    CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
      INSERT INTO pages_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
    END;
  `);

  // Additive migration for databases created before folder_path existed. CREATE TABLE IF NOT
  // EXISTS above already includes the column for fresh installs; this backfills older ones.
  const notebookCols = db.prepare(`PRAGMA table_info(notebooks)`).all() as { name: string }[];
  if (!notebookCols.some((c) => c.name === 'folder_path')) {
    db.exec(`ALTER TABLE notebooks ADD COLUMN folder_path TEXT NOT NULL DEFAULT ''`);
  }
}

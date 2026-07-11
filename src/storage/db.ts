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

    -- Per-page embedding vectors for local semantic search (optional feature). vec is the raw
    -- little-endian Float32 array; dim is its length. Populated on-device during sync/embed.
    CREATE TABLE IF NOT EXISTS page_embeddings (
      page_id TEXT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
      dim INTEGER NOT NULL,
      vec BLOB NOT NULL
    );

    -- Two indexes over the same text, kept in sync by the triggers below:
    --   pages_fts     — Porter-stemmed, so word forms match (meeting/meetings/meet, run/running).
    --   pages_raw_fts — unstemmed, so the fuzzy fallback compares typos against WHOLE words
    --                   (a typo is closer to "meeting" than to the stem "meet").
    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      extracted_text, content='pages', content_rowid='rowid', tokenize='porter unicode61'
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS pages_raw_fts USING fts5(
      extracted_text, content='pages', content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
      INSERT INTO pages_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
      INSERT INTO pages_raw_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
    END;
    CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
      INSERT INTO pages_raw_fts(pages_raw_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
    END;
    CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
      INSERT INTO pages_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
      INSERT INTO pages_raw_fts(pages_raw_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
      INSERT INTO pages_raw_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
    END;

    -- Distinct WHOLE-WORD terms (from the unstemmed index) drive the typo-tolerant fuzzy fallback.
    CREATE VIRTUAL TABLE IF NOT EXISTS pages_vocab USING fts5vocab('pages_raw_fts', 'row');
  `);

  // Additive migration for databases created before folder_path existed. CREATE TABLE IF NOT
  // EXISTS above already includes the column for fresh installs; this backfills older ones.
  const notebookCols = db.prepare(`PRAGMA table_info(notebooks)`).all() as { name: string }[];
  if (!notebookCols.some((c) => c.name === 'folder_path')) {
    db.exec(`ALTER TABLE notebooks ADD COLUMN folder_path TEXT NOT NULL DEFAULT ''`);
  }

  // Stemming migration: rebuild the FTS stack when it predates the Porter tokenizer or the
  // unstemmed companion index. `rebuild` re-derives both indexes from the pages content table —
  // no re-extraction, entirely local.
  const ftsSql =
    (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='pages_fts'`).get() as
      | { sql?: string }
      | undefined)?.sql ?? '';
  const hasRaw = !!db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='pages_raw_fts'`)
    .get();
  if ((ftsSql && !/porter/i.test(ftsSql)) || !hasRaw) {
    db.exec(`
      DROP TRIGGER IF EXISTS pages_ai;
      DROP TRIGGER IF EXISTS pages_ad;
      DROP TRIGGER IF EXISTS pages_au;
      DROP TABLE IF EXISTS pages_vocab;
      DROP TABLE IF EXISTS pages_fts;
      DROP TABLE IF EXISTS pages_raw_fts;
      CREATE VIRTUAL TABLE pages_fts USING fts5(
        extracted_text, content='pages', content_rowid='rowid', tokenize='porter unicode61'
      );
      CREATE VIRTUAL TABLE pages_raw_fts USING fts5(
        extracted_text, content='pages', content_rowid='rowid'
      );
      CREATE TRIGGER pages_ai AFTER INSERT ON pages BEGIN
        INSERT INTO pages_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
        INSERT INTO pages_raw_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
      END;
      CREATE TRIGGER pages_ad AFTER DELETE ON pages BEGIN
        INSERT INTO pages_fts(pages_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
        INSERT INTO pages_raw_fts(pages_raw_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
      END;
      CREATE TRIGGER pages_au AFTER UPDATE ON pages BEGIN
        INSERT INTO pages_fts(pages_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
        INSERT INTO pages_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
        INSERT INTO pages_raw_fts(pages_raw_fts, rowid, extracted_text) VALUES('delete', old.rowid, old.extracted_text);
        INSERT INTO pages_raw_fts(rowid, extracted_text) VALUES (new.rowid, new.extracted_text);
      END;
      CREATE VIRTUAL TABLE pages_vocab USING fts5vocab('pages_raw_fts', 'row');
      INSERT INTO pages_fts(pages_fts) VALUES('rebuild');
      INSERT INTO pages_raw_fts(pages_raw_fts) VALUES('rebuild');
    `);
  }
}

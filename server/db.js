import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function openDatabase(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, "folio.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,password TEXT,name TEXT NOT NULL,guest INTEGER DEFAULT 0,settings TEXT DEFAULT '{}',created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,provider TEXT NOT NULL,label TEXT NOT NULL,secret TEXT NOT NULL,models TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS oauth_states(state TEXT PRIMARY KEY,session_hash TEXT REFERENCES sessions(hash) ON DELETE CASCADE,verifier TEXT NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS notebooks(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT DEFAULT '',color TEXT DEFAULT '#267c92',settings TEXT DEFAULT '{}',created TEXT DEFAULT CURRENT_TIMESTAMP,updated TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,title TEXT NOT NULL,format TEXT NOT NULL,path TEXT,hash TEXT,status TEXT NOT NULL,error TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,source_id TEXT UNIQUE NOT NULL REFERENCES sources(id) ON DELETE CASCADE,status TEXT NOT NULL,attempts INTEGER DEFAULT 0,error TEXT,updated TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS chunks(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,page INTEGER,text TEXT NOT NULL,UNIQUE(source_id,ordinal));
  CREATE VIRTUAL TABLE IF NOT EXISTS chunk_search USING fts5(text,content='chunks',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
  CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN INSERT INTO chunk_search(rowid,text) VALUES(new.rowid,new.text); END;
  CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN INSERT INTO chunk_search(chunk_search,rowid,text) VALUES('delete',old.rowid,old.text); END;
  CREATE TABLE IF NOT EXISTS embeddings(chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,model TEXT NOT NULL,vector TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('user','assistant')),text TEXT NOT NULL,citations TEXT DEFAULT '[]',provider TEXT,model TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY,notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,kind TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,citations TEXT DEFAULT '[]',created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS cards(id TEXT PRIMARY KEY,artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,front TEXT NOT NULL,back TEXT NOT NULL,hint TEXT DEFAULT '',explanation TEXT DEFAULT '',refs TEXT DEFAULT '[]',due INTEGER NOT NULL,interval REAL DEFAULT 0,ease REAL DEFAULT 2.5,repetitions INTEGER DEFAULT 0,lapses INTEGER DEFAULT 0,flagged INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS card_reviews(id TEXT PRIMARY KEY,card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,grade INTEGER NOT NULL,interval REAL NOT NULL,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS quiz_attempts(id TEXT PRIMARY KEY,artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,answers TEXT NOT NULL,result TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS usage(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,provider TEXT NOT NULL,model TEXT NOT NULL,input_tokens INTEGER DEFAULT 0,output_tokens INTEGER DEFAULT 0,estimated_cost REAL,created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE SET NULL,event TEXT NOT NULL,resource TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS notebook_owner ON notebooks(user_id);
  CREATE INDEX IF NOT EXISTS source_notebook ON sources(notebook_id);
  CREATE INDEX IF NOT EXISTS chunk_source ON chunks(source_id);
  CREATE INDEX IF NOT EXISTS message_notebook ON messages(notebook_id,created);
  CREATE INDEX IF NOT EXISTS artifact_notebook ON artifacts(notebook_id);
  CREATE INDEX IF NOT EXISTS cards_due ON cards(due);
  PRAGMA user_version=1;`);
  // Additive migration for early local databases; existing records remain intact.
  if (
    !db
      .prepare("PRAGMA table_info(usage)")
      .all()
      .some((c) => c.name === "estimated_cost")
  )
    db.exec("ALTER TABLE usage ADD COLUMN estimated_cost REAL");
  // Sharing, groups and communities (additive; see server/social.js).
  db.exec(`
  CREATE TABLE IF NOT EXISTS notebook_shares(notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(notebook_id,user_id));
  CREATE TABLE IF NOT EXISTS study_groups(id TEXT PRIMARY KEY,name TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,editable INTEGER NOT NULL DEFAULT 0,created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS group_members(group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(group_id,user_id));
  CREATE TABLE IF NOT EXISTS group_notebooks(group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,created TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(group_id,notebook_id));
  CREATE TABLE IF NOT EXISTS communities(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT DEFAULT '',president_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS community_followers(community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(community_id,user_id));
  CREATE TABLE IF NOT EXISTS community_notebooks(community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,created TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(community_id,notebook_id));
  CREATE TABLE IF NOT EXISTS community_reactions(community_id TEXT NOT NULL,notebook_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('like','follow')),created TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(community_id,notebook_id,user_id,kind),FOREIGN KEY(community_id,notebook_id) REFERENCES community_notebooks(community_id,notebook_id) ON DELETE CASCADE);
  CREATE INDEX IF NOT EXISTS share_user ON notebook_shares(user_id);
  CREATE INDEX IF NOT EXISTS member_user ON group_members(user_id);
  CREATE INDEX IF NOT EXISTS group_notebook ON group_notebooks(notebook_id);
  CREATE INDEX IF NOT EXISTS community_notebook ON community_notebooks(notebook_id);`);
  // Collections, source topics and answer feedback (additive).
  db.exec(`
  CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS collection_notebooks(collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,created TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(collection_id,notebook_id));
  CREATE INDEX IF NOT EXISTS collection_owner ON collections(user_id);`);
  const hasColumn = (table, column) =>
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .some((c) => c.name === column);
  if (!hasColumn("sources", "topic"))
    db.exec("ALTER TABLE sources ADD COLUMN topic TEXT DEFAULT ''");
  if (!hasColumn("messages", "feedback"))
    db.exec("ALTER TABLE messages ADD COLUMN feedback TEXT");
  // FSRS scheduling state, cached card explanations and 4-button ratings (additive).
  for (const [table, column, type] of [
    ["cards", "stability", "REAL"],
    ["cards", "difficulty", "REAL"],
    ["cards", "last_review", "INTEGER"],
    ["cards", "last_rating", "INTEGER"],
    ["cards", "detail", "TEXT"],
    ["card_reviews", "rating", "INTEGER"],
  ])
    if (!hasColumn(table, column))
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  return {
    raw: db,
    /** SQL projection types vary by query; validate external inputs before this boundary. @returns {Record<string, any> | undefined} */
    get: (sql, ...args) => db.prepare(sql).get(...args),
    /** @returns {Record<string, any>[]} */
    all: (sql, ...args) => db.prepare(sql).all(...args),
    run: (sql, ...args) => db.prepare(sql).run(...args),
    transaction(fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => db.close(),
  };
}

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE dictations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  original_text TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  word_count INTEGER NOT NULL,
  delivery TEXT NOT NULL,
  audio_file TEXT,
  upload_api_url TEXT,
  uploaded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX dictations_created_idx ON dictations(created_at DESC);

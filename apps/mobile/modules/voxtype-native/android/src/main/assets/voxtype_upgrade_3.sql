CREATE TABLE local_recordings (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, original_text TEXT NOT NULL,
  created_at INTEGER NOT NULL, duration_ms INTEGER NOT NULL, audio_file TEXT
);
INSERT INTO local_recordings SELECT id,user_id,COALESCE(original_text,text),created_at,duration_ms,audio_file
FROM dictations WHERE audio_file IS NOT NULL OR (uploaded = 0 AND original_text IS NOT NULL)
ORDER BY created_at DESC,id DESC LIMIT 10;
UPDATE dictations SET original_text = NULL;

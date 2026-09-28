SELECT id, audio_file FROM dictations
WHERE audio_file IS NOT NULL
ORDER BY created_at DESC, id DESC
LIMIT -1 OFFSET ?;

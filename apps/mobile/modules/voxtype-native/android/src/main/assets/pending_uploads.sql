SELECT id, user_id, text, original_text, created_at, duration_ms
FROM dictations
WHERE user_id = ? AND upload_api_url = ? AND uploaded = 0
  AND length(trim(text, char(9) || char(10) || char(13) || ' ')) > 0
ORDER BY created_at ASC, id ASC;

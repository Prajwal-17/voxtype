ALTER TABLE dictations ADD COLUMN upload_api_url TEXT;
ALTER TABLE dictations ADD COLUMN uploaded INTEGER NOT NULL DEFAULT 0;
DELETE FROM settings WHERE key = 'audio_limit';

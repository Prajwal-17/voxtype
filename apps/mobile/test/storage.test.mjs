import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

const assets = new URL('../modules/voxtype-native/android/src/main/assets/', import.meta.url);
const schema = readFileSync(new URL('voxtype_schema.sql', assets), 'utf8');
const toPrune = readFileSync(new URL('audio_to_prune.sql', assets), 'utf8');

test('local schema mirrors dictation fields and retains only newest audio references', () => {
  for (const limit of [5, 10, 15]) {
    const db = new DatabaseSync(':memory:');
    db.exec(schema);
    const columns = db
      .prepare('PRAGMA table_info(dictations)')
      .all()
      .map((row) => row.name);
    assert.deepEqual(columns, [
      'id',
      'user_id',
      'text',
      'original_text',
      'created_at',
      'updated_at',
      'duration_ms',
      'word_count',
      'delivery',
      'audio_file',
    ]);
    const insert = db.prepare('INSERT INTO dictations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (let index = 0; index < 18; index++) {
      insert.run(
        String(index),
        'local-user',
        `dictation ${index}`,
        null,
        index,
        index,
        1000,
        2,
        'saved',
        `/private/${index}.wav`,
      );
    }
    const expired = db.prepare(toPrune).all(limit);
    assert.equal(expired.length, 18 - limit);
    assert.equal(expired.at(0)?.id, String(17 - limit));
    const clear = db.prepare('UPDATE dictations SET audio_file = NULL WHERE id = ?');
    expired.forEach(({ id }) => clear.run(id));
    assert.equal(
      db.prepare('SELECT count(*) AS count FROM dictations WHERE audio_file IS NOT NULL').get()
        .count,
      limit,
    );
    assert.equal(db.prepare('SELECT count(*) AS count FROM dictations').get().count, 18);
    db.close();
  }
});

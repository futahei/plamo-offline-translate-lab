import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstQ4ShardFilename } from '../src/model-shards.js';

test('validates the first shard URL for a complete GGUF split', () => {
  const filename = 'plamo-3-translate-0.8b-Q4_0-00001-of-00008.gguf';
  assert.equal(firstQ4ShardFilename({ firstShard: filename, shardCount: 8 }), filename);
});

test('rejects unexpected GGUF paths and inconsistent counts', () => {
  for (const manifest of [
    { firstShard: '../another-model.gguf', shardCount: 8 },
    { firstShard: 'plamo-3-translate-0.8b-Q4_0-00002-of-00008.gguf', shardCount: 8 },
    { firstShard: 'plamo-3-translate-0.8b-Q4_0-00001-of-00008.gguf', shardCount: 7 },
    { firstShard: 'plamo-3-translate-0.8b-Q4_0-00001-of-00001.gguf', shardCount: 1 },
    {},
  ]) {
    assert.throws(() => firstQ4ShardFilename(manifest));
  }
});

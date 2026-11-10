import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('builds an ordered manifest for the GGUF shards', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'karuyaku-q4-manifest-'));
  try {
    for (let index = 1; index <= 6; index++) {
      const name = `plamo-3-translate-0.8b-Q4_0-${String(index).padStart(5, '0')}-of-00006.gguf`;
      const file = await open(join(directory, name), 'w');
      try {
        await file.truncate(80_000_000);
      } finally {
        await file.close();
      }
    }
    const result = spawnSync(process.execPath, ['scripts/write-q4-manifest.mjs', directory], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(await readFile(join(directory, 'q4-manifest.json'), 'utf8'));
    assert.equal(manifest.firstShard, 'plamo-3-translate-0.8b-Q4_0-00001-of-00006.gguf');
    assert.equal(manifest.shardCount, 6);
    assert.equal(manifest.totalBytes, 480_000_000);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

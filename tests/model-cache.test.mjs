import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cachedModelFileNames, modelShardUrls, modelCacheState, openCachedBlobsSequentially } from '../src/model-cache.js';

const q4 = 'https://example.com/models/plamo-3-translate-0.8b-Q4_0-00001-of-00003.gguf';
const q2 = 'https://huggingface.co/example/Q2_K.gguf';
const entry = (url, size = 123) => ({ name: `saved:${url}`, size, metadata: { originalURL: url, originalSize: size } });

test('分割Q4_0の全ファイルを順序付きで再利用できる', () => {
  const urls = modelShardUrls(q4);
  assert.deepEqual(urls, [
    'https://example.com/models/plamo-3-translate-0.8b-Q4_0-00001-of-00003.gguf',
    'https://example.com/models/plamo-3-translate-0.8b-Q4_0-00002-of-00003.gguf',
    'https://example.com/models/plamo-3-translate-0.8b-Q4_0-00003-of-00003.gguf',
  ]);
  const files = urls.reverse().map((url) => entry(url));
  assert.deepEqual(cachedModelFileNames(q4, files), modelShardUrls(q4).map((url) => `saved:${url}`));
});

test('別モデルが未完了でも完全なQ2キャッシュは使える', () => {
  const files = [entry(q2), entry(modelShardUrls(q4)[0])];
  assert.deepEqual(cachedModelFileNames(q2, files), [`saved:${q2}`]);
  assert.equal(cachedModelFileNames(q4, files), null);
  assert.deepEqual(modelCacheState(q4, files), {
    complete: false, saved: 1, total: 3, savedBytes: 123, names: [`saved:${modelShardUrls(q4)[0]}`],
  });
});

test('分割ファイルのサイズ不一致ではキャッシュとみなさない', () => {
  const files = modelShardUrls(q4).map((url) => entry(url));
  files[1].metadata.originalSize = 1000;
  assert.equal(cachedModelFileNames(q4, files), null);
});

test('未知の分割番号や欠損は誤認しない', () => {
  assert.deepEqual(modelShardUrls('https://example.com/Q4-00002-of-00003.gguf'), []);
  assert.equal(cachedModelFileNames(q2, []), null);
});

test('キャッシュから分割Blobを順番に開き、欠損時は起動させない', async () => {
  const calls = [];
  const manager = { async open(name) { calls.push(name); return new Blob([name]); } };
  const blobs = await openCachedBlobsSequentially(manager, ['one', 'two', 'three']);
  assert.deepEqual(calls, ['one', 'two', 'three']);
  assert.equal(blobs.length, 3);
  assert.equal(await openCachedBlobsSequentially({ open: async () => null }, ['missing']), null);
});

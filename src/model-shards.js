// wllamaが自動認識するGGUF分割名のみを許可する。
// マニフェストはGitHub Pagesのビルド時に生成する。
const SHARD_NAME = /^plamo-3-translate-0\.8b-Q4_0-00001-of-(\d{5})\.gguf$/;

export function firstQ4ShardFilename(manifest) {
  const filename = manifest?.firstShard;
  const match = typeof filename === 'string' ? filename.match(SHARD_NAME) : null;
  const total = match ? Number(match[1]) : 0;
  if (!match || total < 2 || total > 99 || manifest.shardCount !== total) {
    throw new Error('実験用Q4_0モデルの分割情報が不正です。');
  }
  return filename;
}

export function q4ShardSizes(manifest) {
  firstQ4ShardFilename(manifest);
  const sizes = manifest.shardSizes;
  if (!Array.isArray(sizes) || sizes.length !== manifest.shardCount ||
      sizes.some((size) => !Number.isSafeInteger(size) || size < 4) ||
      sizes.reduce((sum, size) => sum + size, 0) !== manifest.totalBytes) {
    throw new Error('Q4_0モデルの分割サイズ情報が不正です。');
  }
  return sizes;
}

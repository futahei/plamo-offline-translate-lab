import { readdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve(process.argv[2] || 'public/models');
const prefix = 'plamo-3-translate-0.8b-Q4_0';
const names = (await readdir(directory))
  .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith('.gguf'))
  .sort();

if (names.length < 2 || names.length > 99) throw new Error('Q4_0の分割数が不正です');
const suffix = String(names.length).padStart(5, '0');
const expected = names.map((_, index) => `${prefix}-${String(index + 1).padStart(5, '0')}-of-${suffix}.gguf`);
if (names.some((name, index) => name !== expected[index])) {
  throw new Error('分割GGUFの命名や連番が不正です');
}

let totalBytes = 0;
for (const name of names) {
  const info = await stat(resolve(directory, name));
  if (!info.isFile() || info.size < 4) throw new Error(`不正なGGUFファイル: ${name}`);
  totalBytes += info.size;
}
if (totalBytes < 400_000_000 || totalBytes > 650_000_000) {
  throw new Error(`Q4_0の分割後サイズが想定外です: ${totalBytes}`);
}

const manifest = {
  model: 'pfnet/plamo-3-translate-0.8b-GGUF',
  quantization: 'Q4_0',
  firstShard: names[0],
  shardCount: names.length,
  totalBytes,
  distribution: 'GitHub Pages / GGUF split',
};
await writeFile(resolve(directory, 'q4-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Generated Q4_0 manifest: ${names.length} shards, ${(totalBytes / 1e6).toFixed(1)} MB\n`);

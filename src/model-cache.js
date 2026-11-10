// wllamaが保存したGGUFをURLとサイズで照合する。
// 未完了の別モデルが混在していても、正常なモデルのキャッシュを再利用できる。
export function modelShardUrls(firstUrl) {
  const match = firstUrl.match(/-(\d{5})-of-(\d{5})\.gguf(\?.*)?$/);
  if (!match) return [firstUrl];

  const count = Number(match[2]);
  if (match[1] !== '00001' || count < 2 || count > 99) return [];

  const prefix = firstUrl.slice(0, match.index);
  const suffix = match[3] || '';
  return Array.from({ length: count }, (_, i) =>
    `${prefix}-${String(i + 1).padStart(5, '0')}-of-${match[2]}.gguf${suffix}`);
}

export function cachedModelFileNames(modelUrl, files) {
  const urls = modelShardUrls(modelUrl);
  if (!urls.length) return null;

  const cached = new Map(files.map((file) => [file.metadata?.originalURL, file]));
  const names = [];
  for (const url of urls) {
    const file = cached.get(url);
    if (!file || !file.name || file.size <= 0 || file.metadata?.originalSize !== file.size) return null;
    names.push(file.name);
  }
  return names;
}

const TOKEN = Object.freeze({
  tag: '<|plamo:tag|>',
  message: '<|plamo:msg|>',
  key: '<|plamo:key|>',
  value: '<|plamo:val|>',
  index: '<|plamo:index|>',
  item: '<|plamo:item|>',
});

export const TARGET_LANGUAGES = Object.freeze([
  { code: 'ja', label: '日本語' },
  { code: 'en', label: '英語' },
  { code: 'zh-hans', label: '中国語（簡体字）' },
  { code: 'ko', label: '韓国語' },
  { code: 'fr', label: 'フランス語' },
  { code: 'de', label: 'ドイツ語' },
  { code: 'es', label: 'スペイン語' },
]);

export function parseGlossary(raw, maxItems = 50) {
  const entries = [];
  const lines = raw.split(/\r?\n/);
  for (const [idx, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const delimiter = trimmed.includes('=>') ? '=>' : trimmed.includes('\t') ? '\t' : null;
    if (!delimiter) {
      throw new Error(`用語集の${idx + 1}行目は「原語 => 訳語」の形式で入力するっス`);
    }
    const boundary = trimmed.indexOf(delimiter);
    const source = trimmed.slice(0, boundary).trim();
    const target = trimmed.slice(boundary + delimiter.length).trim();
    if (!source || !target) {
      throw new Error(`用語集の${idx + 1}行目は原語・訳語の両方が必要っス`);
    }
    entries.push({ source, target });
    if (entries.length > maxItems) {
      throw new Error(`ブラウザ実験では用語集を最大${maxItems}件に制限しているっス`);
    }
  }
  return entries;
}

/** PFNが公開するPFML3仕様に沿った翻訳プロンプトを構築する。 */
export function buildTranslationPrompt({ text, sourceLang, targetLang, form, context, glossary }) {
  if (!text?.trim()) throw new Error('翻訳する文章を入力してほしいっス');
  if (!targetLang) throw new Error('翻訳先の言語を選択してほしいっス');

  let prompt = `${TOKEN.tag}dataset${TOKEN.message}translation`;
  if (context?.trim()) prompt += `${TOKEN.tag}context${TOKEN.message}${context.trim()}`;

  if (glossary?.length) {
    prompt += `${TOKEN.tag}glossary`;
    for (const { source, target } of glossary) {
      prompt += `${TOKEN.index}${source}${TOKEN.item}${target}`;
    }
  }

  prompt += `${TOKEN.tag}input`;
  if (sourceLang && sourceLang !== 'auto') {
    prompt += `${TOKEN.key}lang${TOKEN.value}${sourceLang}`;
  }
  prompt += `${TOKEN.message}${text.trim()}`;
  prompt += `${TOKEN.tag}output${TOKEN.key}lang${TOKEN.value}${targetLang}`;
  if (targetLang === 'ja' && form && form !== 'auto') {
    prompt += `${TOKEN.key}form${TOKEN.value}${form}`;
  }
  prompt += TOKEN.message;
  return prompt;
}

export function cleanTranslation(text) {
  return (text || '').split('<|plamo:tag|>')[0].split('<|plamo:bos|>')[0].trim();
}

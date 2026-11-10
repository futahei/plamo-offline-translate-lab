import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_LANGUAGES, SAMPLE_SENTENCES, pickSample } from '../src/samples.js';

test('7言語それぞれに重複しない例文を30種類用意する', () => {
  assert.equal(SAMPLE_LANGUAGES.length, 7);
  for (const language of SAMPLE_LANGUAGES) {
    const sentences = SAMPLE_SENTENCES[language];
    assert.equal(sentences.length, 30, language);
    assert.equal(new Set(sentences).size, 30, language);
    assert.ok(sentences.every((text) => text && text.length < 2000), language);
  }
});

test('選択言語に対応する文章を返し、直前と同じ文章を避ける', () => {
  const first = pickSample('en', 'ja', '', () => 0);
  assert.equal(first.language, 'en');
  assert.equal(first.text, SAMPLE_SENTENCES.en[0]);
  assert.equal(pickSample('en', 'ja', first.text, () => 0).text, SAMPLE_SENTENCES.en[1]);
});

test('言語自動判別では翻訳先言語以外から選ぶ', () => {
  const random = pickSample('auto', 'ja', '', () => 0);
  assert.notEqual(random.language, 'ja');
  assert.ok(SAMPLE_SENTENCES[random.language].includes(random.text));
});

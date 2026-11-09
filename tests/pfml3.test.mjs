import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTranslationPrompt, cleanTranslation, parseGlossary } from '../src/pfml3.js';
import { explainRuntimeError, isLowLevelRuntimeError } from '../src/runtime-errors.js';

test('公式PFML3の基本構成になる', () => {
  assert.equal(buildTranslationPrompt({ text: 'Hello.', targetLang: 'ja', sourceLang: 'en' }),
    '<|plamo:tag|>dataset<|plamo:msg|>translation' +
    '<|plamo:tag|>input<|plamo:key|>lang<|plamo:val|>en<|plamo:msg|>Hello.' +
    '<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>ja<|plamo:msg|>');
});

test('用語集は1つのグループにまとめ、文脈・文体も付ける', () => {
  const prompt = buildTranslationPrompt({
    text: 'Open the dashboard.', sourceLang: 'en', targetLang: 'ja', form: 'polite',
    context: 'プロダクトUI',
    glossary: [{ source: 'dashboard', target: '管理画面' }, { source: 'Open', target: '開く' }],
  });
  assert.equal((prompt.match(/<\|plamo:tag\|>glossary/g) || []).length, 1);
  assert.ok(prompt.includes('<|plamo:tag|>context<|plamo:msg|>プロダクトUI'));
  assert.ok(prompt.includes('<|plamo:index|>dashboard<|plamo:item|>管理画面<|plamo:index|>Open<|plamo:item|>開く'));
  assert.ok(prompt.endsWith('<|plamo:key|>form<|plamo:val|>polite<|plamo:msg|>'));
});

test('行ごとの用語ペアを読み取る', () => {
  assert.deepEqual(parseGlossary('# メモ\nEOD => 本日中\n\t\nowner\t担当者'), [
    { source: 'EOD', target: '本日中' }, { source: 'owner', target: '担当者' },
  ]);
});

test('未完成・過大な用語集は拒否する', () => {
  assert.throws(() => parseGlossary('EOD'), /1行目/);
  assert.throws(() => parseGlossary('a => b\nc => d', 1), /最大1件/);
});

test('余計なPLaMo区切りトークンを翻訳結果から除去する', () => {
  assert.equal(cleanTranslation(' 本日中です。<|plamo:tag|>input'), '本日中です。');
});

test('GLUE内部通信エラーを判定して理解できるメッセージに変える', () => {
  const error = new RangeError('Invalid typed array length: 1163217991');
  assert.ok(isLowLevelRuntimeError(error));
  assert.match(explainRuntimeError(error), /GLUE/);
});

test('翻訳指示の入力不備はWASMの復旧対象にしない', () => {
  assert.equal(isLowLevelRuntimeError(new Error('用語集の1行目が不正')), false);
});

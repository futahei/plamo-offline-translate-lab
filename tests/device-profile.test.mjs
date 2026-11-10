import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferenceSettings, isIOSDevice } from '../src/device-profile.js';

test('iPhone の Safari / Chrome はどちらもモバイル判定する', () => {
  assert.equal(isIOSDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 Version/26.6 Mobile/15E148 Safari/604.1' }), true);
  assert.equal(isIOSDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 CriOS/132.0 Mobile/15E148 Safari/604.1' }), true);
  assert.equal(isIOSDevice({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_6 like Mac OS X)' }), true);
  assert.equal(isIOSDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 5 }), true);
});

test('デスクトップブラウザはモバイル判定しない', () => {
  assert.equal(isIOSDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 0 }), false);
  assert.equal(isIOSDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 0 }), false);
});

test('iOS用プロファイルは最小のコンテキスト・バッチを利用する', () => {
  assert.deepEqual(inferenceSettings('mobile'), { n_ctx: 512, n_batch: 32 });
  assert.deepEqual(inferenceSettings('safe'), { n_ctx: 1024, n_batch: 64 });
  assert.deepEqual(inferenceSettings('normal'), { n_ctx: 2048, n_batch: 128 });
});

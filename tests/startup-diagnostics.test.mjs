import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARTUP_LOG_KEY, MAX_STARTUP_EVENTS, readStartupEvents, addStartupEvent, previousStartupStage } from '../src/startup-diagnostics.js';

test('起動ログは直近40件だけ保存し、古い記録を除外する', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  for (let i = 0; i < MAX_STARTUP_EVENTS + 2; i++) addStartupEvent(storage, { phase: 'stage-' + i });
  assert.equal(readStartupEvents(storage).length, MAX_STARTUP_EVENTS);
  assert.equal(readStartupEvents(storage)[0].phase, 'stage-2');
  assert.equal(previousStartupStage([...readStartupEvents(storage), { phase: 'page-open' }]).phase, 'stage-41');
  assert.equal(typeof data.get(STARTUP_LOG_KEY), 'string');
});

test('保存領域が使えなくても起動ログ処理は失敗しない', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(readStartupEvents(broken), []);
  assert.equal(addStartupEvent(broken, { phase: 'load-request' }).length, 1);
});

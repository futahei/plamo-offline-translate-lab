// iOSの強制リロード前後を比較するため、端末内に起動イベントだけを記録する。
// 翻訳原文や用語集、モデル本体は記録しない。
export const STARTUP_LOG_KEY = 'karuyaku:startup-log-v1';
export const MAX_STARTUP_EVENTS = 40;

export function readStartupEvents(storage) {
  try {
    const events = JSON.parse(storage?.getItem(STARTUP_LOG_KEY) || '[]');
    return Array.isArray(events) ? events.filter((event) => event && typeof event.phase === 'string') : [];
  } catch {
    return [];
  }
}

export function addStartupEvent(storage, event) {
  const events = readStartupEvents(storage);
  const next = [...events, event].slice(-MAX_STARTUP_EVENTS);
  try {
    storage?.setItem(STARTUP_LOG_KEY, JSON.stringify(next));
  } catch { /* ストレージが使えない場合もモデルの起動は続ける */ }
  return next;
}

export function previousStartupStage(events) {
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index].phase !== 'page-open') return events[index];
  }
  return null;
}

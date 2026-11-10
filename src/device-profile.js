// Safari と Chrome を含め、iOS 上のブラウザは WebKit のメモリ制限を共有する。
export function isIOSDevice(client = {}) {
  return /iPhone|iPad|iPod/i.test(client.userAgent || '') ||
    (client.platform === 'MacIntel' && (client.maxTouchPoints || 0) > 1);
}

export function inferenceSettings(profile) {
  if (profile === 'mobile') return { n_ctx: 512, n_batch: 32 };
  if (profile === 'safe') return { n_ctx: 1024, n_batch: 64 };
  return { n_ctx: 2048, n_batch: 128 };
}

export const IOS_MODEL_PREFERENCE_KEY = 'karuyaku:ios-model-mode';

// 初回は高精度Q4_0。明示的にQ2_Kへ変更した端末では、その選択を保持する。
export function preferredIOSModelMode(savedMode) {
  return savedMode === 'stable' ? 'stable' : 'experimental-q4';
}

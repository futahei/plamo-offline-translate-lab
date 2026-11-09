const GLUE_HEADER_AS_UINT32 = '1163217991';

export function isLowLevelRuntimeError(error) {
  return /Invalid typed array length|WebAssembly|RuntimeError|out of memory|memory access|WebGPU|wllama|abort/i.test(String(error?.message || error));
}

export function explainRuntimeError(error) {
  const message = String(error?.message || error || '原因不明');
  if (message.includes(GLUE_HEADER_AS_UINT32)) {
    return '推論エンジンの内部通信（GLUE）が壊れたっス。ブラウザのGPU／WASM互換性やメモリ不足が疑わしいっス';
  }
  return message;
}

const GLUE_HEADER_AS_UINT32 = '1163217991';

export function isLowLevelRuntimeError(error) {
  return /Invalid typed array length|WebAssembly|RuntimeError|out of memory|memory access|WebGPU|wllama|abort/i.test(String(error?.message || error));
}

export function explainRuntimeError(error) {
  const message = String(error?.message || error || '原因不明');
  if (message.includes(GLUE_HEADER_AS_UINT32)) {
    return 'WASMエンジンが内部要求に応答できず、GLUEヘッダーが残ったっス。以前のwllama 3.8.1ではPLaMo 3のトークナイザー非対応が原因だったっス。新版でも発生する場合は開発者ツールのコンソールログを確認してほしいっス';
  }
  return message;
}

import { buildTranslationPrompt, cleanTranslation } from './pfml3.js';
import { explainRuntimeError, isLowLevelRuntimeError } from './runtime-errors.js';
import { inferenceSettings, isIOSDevice, IOS_MODEL_PREFERENCE_KEY, preferredIOSModelMode } from './device-profile.js';
import { firstQ4ShardFilename, q4ShardSizes } from './model-shards.js';
import { cachedModelFileNames, modelCacheState, modelShardUrls } from './model-cache.js';

export const MODEL_REPO = 'pfnet/plamo-3-translate-0.8b-GGUF';
export const MODEL = Object.freeze({
  label: 'PLaMo 3 Translate 0.8B',
  file: 'plamo-3-translate-0.8b-Q4_0.gguf',
  sizeMB: 550,
  quantization: 'Q4_0',
});

const IOS_MODEL = Object.freeze({
  label: MODEL.label,
  file: 'plamo-3-translate-0.8b-Q2_K.gguf',
  sizeMB: 410,
  quantization: 'Q2_K',
});
export const IOS_EXPERIMENTAL_MODEL = MODEL;
export const IS_IOS = isIOSDevice(typeof navigator === 'undefined' ? {} : navigator);
export const DEVICE_MODEL = MODEL;
export const MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/${DEVICE_MODEL.file}`;
const IOS_LIGHT_MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/${IOS_MODEL.file}`;
const PREVIOUS_MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/plamo-3-translate-0.8b-Q4_K_M.gguf`;
const modelAssetUrl = (filename) => new URL(`${import.meta.env.BASE_URL}models/${filename}`, document.baseURI).href;

// npm版wllama 3.8.1はPLaMo 3のトークナイザー非対応。
// PLaMo 3対応のd275dacをビルドし、同一オリジンから配信する。
const assetUrl = (filename) => new URL(`${import.meta.env.BASE_URL}vendor/wllama/${filename}`, document.baseURI).href;
let runtimeAssetsPromise;
let q4ManifestPromise;

function getQ4Manifest() {
  if (!q4ManifestPromise) {
    q4ManifestPromise = fetch(modelAssetUrl('q4-manifest.json')).then(async (response) => {
      if (!response.ok) throw new Error(`Q4_0モデルの配布情報を取得できません (HTTP ${response.status})`);
      return response.json();
    }).catch((error) => {
      q4ManifestPromise = null;
      throw error;
    });
  }
  return q4ManifestPromise;
}

async function getRuntimeAssets() {
  if (!runtimeAssetsPromise) {
    runtimeAssetsPromise = Promise.all([
      import(/* @vite-ignore */ assetUrl('wllama.js')),
      fetch(assetUrl('wllama-compat-module.js')).then((response) => {
        if (!response.ok) throw new Error(`WASM互換モジュールの取得に失敗: HTTP ${response.status}`);
        return response.text();
      }),
    ]).then(([module, compatWorkerCode]) => ({ module, compatWorkerCode }));
  }
  return runtimeAssetsPromise;
}

async function makeRuntime() {
  const { module, compatWorkerCode } = await getRuntimeAssets();
  const { Wllama, LoggerWithoutDebug } = module;
  const wllama = new Wllama({ default: assetUrl('wllama.wasm') }, {
    allowOffline: true,
    suppressNativeLog: false,
    logger: LoggerWithoutDebug,
    // WebKitのピークメモリを抑えるため、iPhoneはGGUF分割を1本ずつ保存。
    parallelDownloads: IS_IOS ? 1 : 3,
  });
  wllama.setCompat({
    wasm: assetUrl('wllama-compat.wasm'),
    worker: { code: compatWorkerCode },
  }, 'firefox_safari');
  return wllama;
}

function initialIOSModelMode() {
  if (!IS_IOS) return 'experimental-q4';
  try {
    return preferredIOSModelMode(localStorage.getItem(IOS_MODEL_PREFERENCE_KEY));
  } catch {
    return preferredIOSModelMode(null);
  }
}

export async function detectWebGpu() {
  if (!navigator.gpu?.requestAdapter) return false;
  try {
    return Boolean(await navigator.gpu.requestAdapter());
  } catch {
    return false;
  }
}

export class TranslatorRuntime {
  instance = null;
  activeBackend = null;
  profile = null;
  iosModelMode = initialIOSModelMode();

  getSelectedModel() {
    return IS_IOS && this.iosModelMode === 'stable' ? IOS_MODEL : DEVICE_MODEL;
  }

  async setIOSModelMode(mode) {
    if (!IS_IOS || !['stable', 'experimental-q4'].includes(mode)) return;
    if (this.iosModelMode === mode) return;
    await this.unload();
    this.iosModelMode = mode;
    try {
      localStorage.setItem(IOS_MODEL_PREFERENCE_KEY, mode);
    } catch { /* 保存できない環境では現在のタブ内だけで選択を保持する */ }
  }

  async selectedModelUrl() {
    if (!IS_IOS) return MODEL_URL;
    if (this.iosModelMode === 'stable') return IOS_LIGHT_MODEL_URL;
    const filename = firstQ4ShardFilename(await getQ4Manifest());
    return modelAssetUrl(filename);
  }

  // 一部のSafariでは分割ファイルのレスポンスにContent-Lengthがなく、
  // wllamaが保存サイズを0として記録する。配布時に確定したサイズとの
  // 一致を確認できた場合だけメタデータを補正する。
  async repairQ4CacheMetadata(runtime, modelUrl, cachedFiles) {
    if (!IS_IOS || this.iosModelMode !== 'experimental-q4') return cachedFiles;
    const urls = modelShardUrls(modelUrl);
    const sizes = q4ShardSizes(await getQ4Manifest());
    const filesByUrl = new Map(cachedFiles.map((file) => [file.metadata?.originalURL, file]));
    let repaired = false;
    for (const [index, url] of urls.entries()) {
      const file = filesByUrl.get(url);
      if (!file || file.size !== sizes[index] || file.metadata?.originalSize === file.size) continue;
      await runtime.cacheManager.writeMetadata(file.name, {
        ...file.metadata,
        originalURL: url,
        originalSize: sizes[index],
      });
      repaired = true;
    }
    return repaired ? runtime.cacheManager.list() : cachedFiles;
  }

  async modelCacheInfo() {
    const selectedUrl = await this.selectedModelUrl();
    const runtime = this.instance || await makeRuntime();
    const cachedFiles = await this.repairQ4CacheMetadata(runtime, selectedUrl, await runtime.cacheManager.list());
    const selected = modelCacheState(selectedUrl, cachedFiles);
    if (selected.complete) return { ...selected, url: selectedUrl };
    if (!IS_IOS) {
      const legacy = modelCacheState(PREVIOUS_MODEL_URL, cachedFiles);
      if (legacy.complete) return { ...legacy, url: PREVIOUS_MODEL_URL };
    }
    return { ...selected, url: selectedUrl };
  }

  async cachedModelUrl() {
    try {
      const status = await this.modelCacheInfo();
      return status.complete ? status.url : null;
    } catch (error) {
      console.warn('モデルのキャッシュを確認できなかったっス', error);
    }
    return null;
  }

  async isCached() {
    return Boolean(await this.cachedModelUrl());
  }

  async download({ onProgress = () => {} } = {}) {
    const state = await this.modelCacheInfo();
    if (state.complete) return { fromCache: true, state };

    // iOSでは取得とWASM起動を分離し、取得完了直後のピークメモリを避ける。
    const runtime = await makeRuntime();
    await runtime.modelManager.downloadModel(state.url, {
      progressCallback: ({ loaded, total }) => onProgress({
        loaded: total > 0 ? Math.min(total, loaded + state.savedBytes) : loaded,
        total,
        resumed: state.saved > 0,
      }),
    });
    const verified = await this.modelCacheInfo();
    if (!verified.complete) {
      throw new Error(`モデルの保存を確認できません（${verified.saved}/${verified.total}ファイル）。端末の空き容量やSafariの保存領域を確認してください。`);
    }
    return { fromCache: false, state: verified };
  }

  async load({ backend = 'auto', profile = IS_IOS ? 'mobile' : 'normal', onProgress = () => {}, onCacheStatus = () => {} } = {}) {
    if (this.instance) {
      await this.instance.exit().catch(() => {});
      this.instance = null;
      this.activeBackend = null;
      this.profile = null;
    }

    // iOSはSafari・ChromeともWebKit。GPUで失敗してWASMに再起動すると
    // ピークメモリが上がるため、最初からCPUを選ぶ。
    const gpuAvailable = !IS_IOS && await detectWebGpu();
    const shouldUseGpu = backend !== 'cpu' && gpuAvailable;
    const modelUrl = (await this.cachedModelUrl()) || await this.selectedModelUrl();

    const attempt = async (useGpu) => {
      const wllama = await makeRuntime();
      this.instance = wllama;
      const cachedNames = cachedModelFileNames(modelUrl, await wllama.cacheManager.list());
      const cachedBlobs = cachedNames ? await Promise.all(cachedNames.map((name) => wllama.cacheManager.open(name))) : null;
      const fromCache = Boolean(cachedBlobs?.every((blob) => blob && blob.size > 0));
      onCacheStatus(fromCache);
      if (IS_IOS && !fromCache) {
        throw new Error('保存済みモデルを確認できません。先にモデルをダウンロードしてください。');
      }
      const settings = {
        ...inferenceSettings(profile),
        n_threads: 1, // GitHub PagesではCOOP/COEPを自由に設定できない。
        n_gpu_layers: useGpu ? 99 : 0,
        jinja: false,
      };
      if (fromCache) {
        // 保存済みBlobを直接読む。切り替え時の再取得や「100%ダウンロード」表示を防ぐ。
        await wllama.loadModel(cachedBlobs, settings);
      } else {
        const downloaded = await wllama.modelManager.downloadModel(modelUrl, {
          progressCallback: ({ loaded, total }) => onProgress({ loaded, total }),
        });
        await wllama.loadModel(downloaded, settings);
      }
      this.activeBackend = useGpu ? 'WebGPU' : 'CPU / WASM';
      this.profile = profile;
      return { backend: this.activeBackend, profile, fromCache, context: wllama.getLoadedContextInfo() };
    };

    try {
      return await attempt(shouldUseGpu);
    } catch (firstError) {
      await this.instance?.exit().catch(() => {});
      this.instance = null;
      if (backend === 'auto' && shouldUseGpu) {
        try {
          return await attempt(false);
        } catch (cpuError) {
          await this.instance?.exit().catch(() => {});
          this.instance = null;
          throw new Error(`WebGPUとCPUの起動に失敗したっス：${explainRuntimeError(cpuError)}`);
        }
      }
      throw new Error(explainRuntimeError(firstError));
    }
  }

  async translate({ text, sourceLang, targetLang, form, context, glossary, maxTokens = 192, onFallback = () => {} }) {
    if (!this.instance?.isModelLoaded()) throw new Error('先にPLaMoモデルを読み込んでほしいっス');
    const prompt = buildTranslationPrompt({ text, sourceLang, targetLang, form, context, glossary });

    const run = async () => {
      const startedAt = performance.now();
      const response = await this.instance.createCompletion({
        prompt,
        temperature: 0,
        max_tokens: maxTokens,
        stop: ['<|plamo:tag|>', '<|plamo:bos|>'],
        stream: false,
      });
      return {
        text: cleanTranslation(response.choices[0]?.text || ''),
        elapsedMs: performance.now() - startedAt,
        tokens: response.usage?.completion_tokens ?? null,
        speed: response.timings?.predicted_per_second ?? null,
        stoppedByLimit: response.choices[0]?.finish_reason === 'length',
      };
    };

    try {
      return await run();
    } catch (firstError) {
      if (!isLowLevelRuntimeError(firstError) || IS_IOS || (this.activeBackend !== 'WebGPU' && this.profile === 'safe')) {
        throw new Error(explainRuntimeError(firstError));
      }

      // GLUEのメッセージヘッダーを巨大な配列長として読む等のWASM障害を
      // 検知したら、キャッシュ済みGGUFを使ってCPU・低メモリ設定で一度だけ復旧。
      onFallback(this.activeBackend);
      try {
        await this.load({ backend: 'cpu', profile: 'safe' });
        return await run();
      } catch (secondError) {
        throw new Error(`自動復旧後も翻訳できなかったっス。${explainRuntimeError(secondError)}`);
      }
    }
  }

  async unload() {
    await this.instance?.exit().catch(() => {});
    this.instance = null;
    this.activeBackend = null;
    this.profile = null;
  }
}

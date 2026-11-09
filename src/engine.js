import { buildTranslationPrompt, cleanTranslation } from './pfml3.js';
import { explainRuntimeError, isLowLevelRuntimeError } from './runtime-errors.js';

export const MODEL_REPO = 'pfnet/plamo-3-translate-0.8b-GGUF';
export const MODEL = Object.freeze({
  label: 'PLaMo 3 Translate 0.8B',
  file: 'plamo-3-translate-0.8b-Q4_0.gguf',
  sizeMB: 550,
  quantization: 'Q4_0',
});

export const MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/${MODEL.file}`;
const PREVIOUS_MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/plamo-3-translate-0.8b-Q4_K_M.gguf`;

// npm版wllama 3.8.1はPLaMo 3のトークナイザー非対応。
// PLaMo 3対応のd275dacをビルドし、同一オリジンから配信する。
const assetUrl = (filename) => new URL(`${import.meta.env.BASE_URL}vendor/wllama/${filename}`, document.baseURI).href;
let runtimeAssetsPromise;

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
  });
  wllama.setCompat({
    wasm: assetUrl('wllama-compat.wasm'),
    worker: { code: compatWorkerCode },
  }, 'firefox_safari');
  return wllama;
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

  async cachedModelUrl() {
    try {
      const runtime = this.instance || await makeRuntime();
      const cached = await runtime.modelManager.getModels();
      if (cached.some((model) => model.url === MODEL_URL && model.size > 0)) return MODEL_URL;
      // 旧バージョンからの利用者は、ダウンロード済みのQ4_K_Mを再利用する。
      if (cached.some((model) => model.url === PREVIOUS_MODEL_URL && model.size > 0)) return PREVIOUS_MODEL_URL;
    } catch (error) {
      console.warn('モデルのキャッシュを確認できなかったっス', error);
    }
    return null;
  }

  async isCached() {
    return Boolean(await this.cachedModelUrl());
  }

  async load({ backend = 'auto', profile = 'normal', onProgress = () => {} } = {}) {
    if (this.instance) {
      await this.instance.exit().catch(() => {});
      this.instance = null;
      this.activeBackend = null;
      this.profile = null;
    }

    const gpuAvailable = await detectWebGpu();
    const shouldUseGpu = backend !== 'cpu' && gpuAvailable;
    const modelUrl = (await this.cachedModelUrl()) || MODEL_URL;

    const attempt = async (useGpu) => {
      const wllama = await makeRuntime();
      this.instance = wllama;
      await wllama.loadModelFromUrl(modelUrl, {
        // 軽量ノート・スマホを優先。推論失敗後の保守的プロファイルではさらに絞る。
        n_ctx: profile === 'safe' ? 1024 : 2048,
        n_batch: profile === 'safe' ? 64 : 128,
        n_threads: 1, // GitHub PagesではCOOP/COEPを自由に設定できない。
        n_gpu_layers: useGpu ? 99 : 0,
        jinja: false,
        useCache: true,
        progressCallback: ({ loaded, total }) => onProgress({ loaded, total }),
      });
      this.activeBackend = useGpu ? 'WebGPU' : 'CPU / WASM';
      this.profile = profile;
      return { backend: this.activeBackend, profile, context: wllama.getLoadedContextInfo() };
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
      if (!isLowLevelRuntimeError(firstError) || (this.activeBackend !== 'WebGPU' && this.profile === 'safe')) {
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

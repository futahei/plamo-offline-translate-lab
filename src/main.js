import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { TranslatorRuntime, MODEL, MODEL_REPO, detectWebGpu } from './engine.js';
import { parseGlossary, TARGET_LANGUAGES } from './pfml3.js';

const app = document.querySelector('#app');
const translator = new TranslatorRuntime();
const history = [];

const icon = (name, size = 18) => {
  const paths = {
    spark: '<path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z"/><path d="m19 18 .6 1.4L21 20l-1.4.6L19 22l-.6-1.4L17 20l1.4-.6L19 18Z"/>',
    wifi: '<path d="M3 9a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 15a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>',
    wifiOff: '<path d="m2 2 20 20M3 9a15 15 0 0 1 4-2M21 9a15 15 0 0 0-10-3M6 12a10 10 0 0 1 4-1M18 12a10 10 0 0 0-3-1M9 15a5 5 0 0 1 6 0"/>',
    download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3"/>',
    arrow: '<path d="M7 7h13m0 0-4-4m4 4-4 4M17 17H4m0 0 4-4m-4 4 4 4"/>',
    shield: '<path d="M12 2 4 5v6c0 5 3.5 8.4 8 11 4.5-2.6 8-6 8-11V5l-8-3Z"/><path d="m9 11 2 2 4-4"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 9h6v6H9zM9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6M4 13a8 8 0 0 0 14 5l3-3m0 6v-6h-6"/>',
    flask: '<path d="M9 3h6m-5 0v7l-5.5 8.7A2 2 0 0 0 6.2 22h11.6a2 2 0 0 0 1.7-3.3L14 10V3M7.5 16h9"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M20 13v7H4V4h7"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};

const options = TARGET_LANGUAGES.map((l) => `<option value="${l.code}">${l.label}</option>`).join('');

app.innerHTML = `
  <div class="site-shell">
    <header class="topbar">
      <div class="brand"><span class="brand-logo">P<span>.</span></span><span class="brand-name">PLaMo <small>OFFLINE LAB</small></span></div>
      <div class="topbar-right"><span class="pill subtle" id="network-chip">${icon('wifi')} 接続確認中</span><a class="topbar-link" href="https://huggingface.co/${MODEL_REPO}" target="_blank" rel="noopener noreferrer">モデル出典 ${icon('external', 13)}</a></div>
    </header>

    <main>
      <section class="hero">
        <div class="hero-copy">
          <div class="eyebrow"><span class="eyebrow-dot"></span> ON-DEVICE TRANSLATION EXPERIMENT</div>
          <h1>言葉を、<br /><em>機内モード</em>へ。</h1>
          <p>国産翻訳LLM <strong>PLaMo 3 Translate 0.8B</strong> を、ブラウザの中だけで実行する実験室。翻訳内容を外部APIに送らず、モデル取得後はネットワークがなくても動くことを目指すPoCっス。</p>
          <div class="hero-tags"><span>${icon('shield', 16)} 推論は端末内</span><span>${icon('chip', 16)} CPU / WebGPU</span><span>${icon('flask', 16)} ベンチマーク対応</span></div>
        </div>
        <div class="hero-visual" aria-hidden="true"><div class="orbit orbit-outer"></div><div class="orbit orbit-mid"></div><div class="orbit orbit-inner"></div><div class="visual-core"><span>JA</span><span class="core-line"></span><span>EN</span></div><span class="orbit-dot orbit-dot-a"></span><span class="orbit-dot orbit-dot-b"></span><span class="visual-caption">LOCAL MODEL · NO API KEY</span></div>
      </section>

      <section class="workspace">
        <div class="left-column">
          <div class="panel model-panel">
            <div class="section-topline"><span class="step">01</span><h2>モデルを準備する</h2><span class="status" id="model-status">未読み込み</span></div>
            <p class="section-description">PLaMoの小型モデルを1種類に固定。初回だけ約${MODEL.sizeMB}MBを取得し、以降はブラウザ内から読み込むっス。</p>
            <div class="fixed-model"><span class="fixed-model-badge">固定モデル</span><strong>${MODEL.label}</strong><small>${MODEL.quantization} · 約${MODEL.sizeMB}MB</small></div>
            <p class="model-note">推論方法は自動選択。WebGPUを優先し、失敗時はCPUに切り替えるっス。旧版で取得したモデルがあればそのキャッシュを再利用するっス。</p>
            <div class="progress-block" id="download-progress" hidden><div class="progress-info"><span id="progress-label">取得中...</span><span id="progress-percent">0%</span></div><div class="progress-track"><span id="progress-fill"></span></div></div>
            <button class="primary-btn load-btn" id="load-btn">${icon('download')} モデルをダウンロードして起動</button>
            <div class="support-row"><span><i class="indicator" id="gpu-dot"></i> WebGPU <strong id="gpu-state">確認中</strong></span><span><i class="indicator" id="pwa-dot"></i> オフライン起動 <strong id="pwa-state">確認中</strong></span></div>
          </div>

          <div class="panel settings-panel">
            <div class="section-topline"><span class="step">02</span><h2>翻訳する</h2></div>
            <div class="language-row">
              <label>原文の言語<select id="source-lang"><option value="auto">自動判定</option>${options}</select></label>
              <button class="swap-btn" type="button" id="swap-languages" title="言語を入れ替え">${icon('arrow', 20)}</button>
              <label>翻訳先の言語<select id="target-lang">${options}</select></label>
            </div>
            <label class="text-input-label" for="source-text">入力テキスト <span id="char-count">0 / 2,000</span></label>
            <textarea id="source-text" maxlength="2000" rows="5" placeholder="Translate this sentence into Japanese.">Technology should make people's lives easier.</textarea>
            <details class="advanced"><summary>翻訳オプション・用語集 <span>任意</span></summary>
              <div class="advanced-content">
                <label>日本語の文体<select id="form"><option value="auto">モデルに任せる</option><option value="polite">です・ます調</option><option value="plain">だ・である調</option></select></label>
                <label>文脈（Context）<textarea id="context" rows="2" placeholder="例：ソフトウェアの操作マニュアルです。"></textarea></label>
                <label>用語集（1行に1組、最大50件）<textarea id="glossary" rows="3" spellcheck="false" placeholder="EOD => 本日中&#10;dashboard => 管理画面"></textarea></label>
                <span class="field-hint">用語集は公式のPFML3に変換してモデルへ直接渡すっス。大量の登録は処理時間が伸びやすいっス。</span>
              </div>
            </details>
            <button class="primary-btn translate-btn" id="translate-btn" disabled>${icon('spark')} 翻訳する</button>
            <div class="result-header"><h3>翻訳結果</h3><button type="button" class="text-button" id="copy-result">コピー</button></div>
            <div class="translation-result" id="result-text" aria-live="polite">モデルを読み込むと翻訳できるっス。</div>
            <div class="metrics"><div><span>総推論時間</span><strong id="metric-time">—</strong></div><div><span>出力トークン</span><strong id="metric-tokens">—</strong></div><div><span>生成速度</span><strong id="metric-speed">—</strong></div></div>
          </div>
        </div>

        <aside class="right-column">
          <div class="panel offline-panel"><div class="section-topline"><span class="panel-symbol">${icon('wifiOff', 19)}</span><h2>オフライン実験</h2></div><p>本番デモは、この順番で行うっス。</p><ol class="demo-steps"><li><b>オンラインでモデルを読み込む</b><span>完了までタブを閉じずに待機。</span></li><li><b>Wi-Fi / モバイル通信をOFF</b><span>機内モードに切り替える。</span></li><li><b>サイトを再読み込みして翻訳</b><span>本当にネット接続なしで動くか検証。</span></li></ol><div class="offline-alert">${icon('shield', 17)} <span>アプリとWASMはPWAのキャッシュ、モデルはブラウザ内のOPFSに保存するっス。ストレージが消去された場合は再取得が必要っス。</span></div></div>
          <div class="panel benchmark-panel"><div class="section-topline"><span class="panel-symbol">${icon('flask', 19)}</span><h2>実験ログ</h2></div><p>翻訳ごとの処理時間を記録。端末を変えて比較できるっス。</p><div class="log-table-wrap"><table class="log-table"><thead><tr><th>回</th><th>時間</th><th>速度</th></tr></thead><tbody id="history-list"><tr><td colspan="3" class="muted-cell">翻訳すると記録されるっス</td></tr></tbody></table></div><button type="button" class="outline-btn" id="export-log" disabled>測定結果をCSV保存</button></div>
          <div class="info-card"><div class="info-kicker">ABOUT THIS PROJECT</div><p>これはPLaMo公式サービスではない非公式PoCっス。モデルの権利はPreferred Networksに帰属し、<strong>PLaMo Community License</strong>に従うっス。</p><p>推論基盤はGGUF対応の <strong>wllama（WebGPU / WASM）</strong>。MLC製のWebLLMとは別のライブラリっス。</p><a href="https://huggingface.co/${MODEL_REPO}" target="_blank" rel="noopener noreferrer">公式モデルカード ${icon('external', 14)}</a></div>
        </aside>
      </section>

      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    </main>
    <footer><span>PLaMo Offline Translate Lab <span class="footer-dot">·</span> Experimental browser inference</span><span>GitHub Pages / PWA / wllama</span></footer>
  </div>
`;

const $ = (selector) => document.querySelector(selector);
const state = { busy: false, swReady: false, gpuAvailable: false };
let toastTimeout;

function toast(message, type = 'info') {
  const node = $('#toast');
  node.textContent = message;
  node.dataset.type = type;
  node.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => node.classList.remove('visible'), 5000);
}

function setBusy(value) {
  state.busy = value;
  $('#load-btn').disabled = value;
  $('#translate-btn').disabled = value || !translator.instance?.isModelLoaded();
  for (const id of ['source-lang', 'target-lang']) {
    $("#" + id).disabled = value;
  }
}

function setModelStatus(message, status = 'neutral') {
  const node = $('#model-status');
  node.textContent = message;
  node.dataset.status = status;
}

function setNetworkStatus() {
  const online = navigator.onLine;
  const node = $('#network-chip');
  node.className = `pill ${online ? 'subtle' : 'success'}`;
  node.innerHTML = `${icon(online ? 'wifi' : 'wifiOff')} ${online ? 'オンライン' : 'オフライン'}`;
}

async function refreshCapabilities() {
  state.gpuAvailable = await detectWebGpu();
  $('#gpu-state').textContent = state.gpuAvailable ? '利用可能' : '利用不可';
  $('#gpu-dot').classList.toggle('good', state.gpuAvailable);
  $('#pwa-state').textContent = state.swReady ? '準備済み' : '準備中 / 非対応';
  $('#pwa-dot').classList.toggle('good', state.swReady);
}

function updateProgress({ loaded, total }) {
  $('#download-progress').hidden = false;
  if (total > 0) {
    const ratio = Math.min(100, Math.round((loaded / total) * 100));
    $('#progress-percent').textContent = `${ratio}%`;
    $('#progress-fill').style.width = `${ratio}%`;
    $('#progress-label').textContent = `モデル取得 ${Math.round(loaded / 1e6)} / ${Math.round(total / 1e6)} MB`;
  } else {
    $('#progress-percent').textContent = '確認中';
    $('#progress-label').textContent = 'キャッシュ / ダウンロード確認中';
  }
}

async function refreshModelCache() {
  try {
    const cached = await translator.isCached();
    if (cached && !translator.instance?.isModelLoaded()) {
      setModelStatus('端末内に保存済み', 'cached');
      $('#load-btn').innerHTML = `${icon('check')} 保存済みモデルを起動`;
    } else if (!translator.instance?.isModelLoaded()) {
      setModelStatus('未読み込み', 'neutral');
      $('#load-btn').innerHTML = `${icon('download')} モデルをダウンロードして起動`;
    }
  } catch (error) {
    console.warn('モデルキャッシュを確認できないっス', error);
  }
}

$('#load-btn').addEventListener('click', async () => {
  if (state.busy) return;
  setBusy(true);
  setModelStatus('モデル起動中', 'loading');
  $('#load-btn').textContent = '読み込み中…';
  $('#progress-fill').style.width = '0%';
  const startedAt = performance.now();
  try {
    const loaded = await translator.load({ onProgress: updateProgress });
    setModelStatus(`${loaded.backend} で起動中`, 'ready');
    $('#load-btn').innerHTML = `${icon('check')} モデル起動完了`;
    $('#download-progress').hidden = true;
    toast(`PLaMoを${loaded.backend}で起動したっス！（${((performance.now() - startedAt) / 1000).toFixed(1)}秒）`, 'success');
  } catch (error) {
    setModelStatus('起動失敗', 'error');
    $('#load-btn').innerHTML = `${icon('refresh')} もう一度モデルを起動`;
    toast(`モデルを起動できなかったっス：${error.message}`, 'error');
    console.error(error);
  } finally {
    setBusy(false);
  }
});

$('#source-text').addEventListener('input', () => {
  $('#char-count').textContent = `${$('#source-text').value.length.toLocaleString('ja-JP')} / 2,000`;
});
$('#source-text').dispatchEvent(new Event('input'));
$('#target-lang').value = 'ja';

$('#swap-languages').addEventListener('click', () => {
  const source = $('#source-lang');
  const target = $('#target-lang');
  const oldSource = source.value;
  source.value = target.value;
  target.value = oldSource === 'auto' ? 'en' : oldSource;
  const oldText = $('#result-text').dataset.lastTranslation;
  if (oldText) $('#source-text').value = oldText;
  $('#source-text').dispatchEvent(new Event('input'));
});

$('#translate-btn').addEventListener('click', async () => {
  if (state.busy) return;
  setBusy(true);
  const result = $('#result-text');
  result.textContent = 'PLaMoが翻訳中っス…';
  result.classList.add('thinking');
  try {
    const glossary = parseGlossary($('#glossary').value);
    const translation = await translator.translate({
      text: $('#source-text').value,
      sourceLang: $('#source-lang').value,
      targetLang: $('#target-lang').value,
      form: $('#form').value,
      context: $('#context').value,
      glossary,
      onFallback: (previousBackend) => {
        setModelStatus('CPUへ自動切替中', 'loading');
        result.textContent = '推論エンジンのエラーを検知。モデルを再ダウンロードせず、CPU・省メモリ設定で再試行中っス…';
        toast(`${previousBackend}で問題を検知したっス。CPUへ自動切替するっス`, 'info');
      },
    });
    setModelStatus(`${translator.activeBackend} で起動中`, 'ready');
    result.textContent = translation.text || '翻訳結果が空だったっス。短い文で再試行してほしいっス。';
    result.dataset.lastTranslation = translation.text;
    $('#metric-time').textContent = `${(translation.elapsedMs / 1000).toFixed(2)} 秒`;
    $('#metric-tokens').textContent = translation.tokens == null ? '—' : `${translation.tokens} tokens`;
    $('#metric-speed').textContent = translation.speed == null ? '—' : `${translation.speed.toFixed(1)} tok/s`;
    if (translation.stoppedByLimit) toast('生成上限に達したっス。短い文章で試してほしいっス', 'info');
    history.unshift({
      index: history.length + 1,
      time: translation.elapsedMs / 1000,
      speed: translation.speed,
      tokens: translation.tokens,
      model: MODEL.label,
      backend: translator.activeBackend,
      device: navigator.userAgent,
      at: new Date().toISOString(),
    });
    renderHistory();
  } catch (error) {
    result.textContent = `翻訳に失敗したっス。\n実行方式: ${translator.activeBackend || '初期化失敗'}\n詳細: ${error.message}`;
    toast(error.message, 'error');
    if (!translator.instance?.isModelLoaded()) {
      setModelStatus('再起動が必要', 'error');
      $('#load-btn').innerHTML = `${icon('refresh')} モデルを再起動`;
    } else {
      setModelStatus(`${translator.activeBackend} で起動中`, 'ready');
    }
    console.error(error);
  } finally {
    result.classList.remove('thinking');
    setBusy(false);
  }
});

$('#copy-result').addEventListener('click', async () => {
  const text = $('#result-text').dataset.lastTranslation;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast('訳文をコピーしたっス', 'success');
  } catch {
    toast('クリップボードへコピーできなかったっス', 'error');
  }
});

function renderHistory() {
  $('#history-list').replaceChildren();
  for (const item of history.slice(0, 8)) {
    const row = document.createElement('tr');
    const cells = [String(item.index), `${item.time.toFixed(2)}秒`, item.speed == null ? '—' : `${item.speed.toFixed(1)} tok/s`];
    for (const value of cells) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    }
    $('#history-list').appendChild(row);
  }
  $('#export-log').disabled = history.length === 0;
}

$('#export-log').addEventListener('click', () => {
  if (!history.length) return;
  const cols = ['at', 'model', 'backend', 'time', 'tokens', 'speed', 'device'];
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [cols.join(','), ...history.slice().reverse().map((item) => cols.map((col) => escape(item[col])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `plamo-browser-benchmark-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

window.addEventListener('online', setNetworkStatus);
window.addEventListener('offline', setNetworkStatus);
setNetworkStatus();

if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onOfflineReady: () => {
      state.swReady = true;
      refreshCapabilities();
    },
    onRegisteredSW: () => {
      navigator.serviceWorker.ready.then(() => {
        state.swReady = true;
        refreshCapabilities();
      }).catch(() => {});
    },
    onRegisterError: (error) => console.warn('Service Workerが登録できなかったっス', error),
  });
}

Promise.all([refreshCapabilities(), refreshModelCache()]).catch(console.error);

import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { TranslatorRuntime, MODEL, MODEL_REPO, DEVICE_MODEL, IS_IOS, detectWebGpu } from './engine.js';
import { parseGlossaryRows, TARGET_LANGUAGES } from './pfml3.js';

const app = document.querySelector('#app');
const translator = new TranslatorRuntime();
const history = [];

const icon = (name, size = 18) => {
  const paths = {
    spark: '<path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z"/>',
    wifi: '<path d="M3 9a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 15a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>',
    wifiOff: '<path d="m2 2 20 20M3 9a15 15 0 0 1 4-2M21 9a15 15 0 0 0-10-3M6 12a10 10 0 0 1 4-1M18 12a10 10 0 0 0-3-1M9 15a5 5 0 0 1 6 0"/>',
    download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3"/>',
    arrow: '<path d="M7 7h13m0 0-4-4m4 4-4 4M17 17H4m0 0 4-4m-4 4 4 4"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6M4 13a8 8 0 0 0 14 5l3-3m0 6v-6h-6"/>',
    book: '<path d="M12 7c-2.5-2-6-2.7-10-2v14c4-.7 7.5 0 10 2m0-14c2.5-2 6-2.7 10-2v14c-4-.7-7.5 0-10 2m0-14v14"/>',
    sliders: '<path d="M4 6h10m4 0h2M4 12h2m4 0h10M4 18h10m4 0h2"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-1.9 1.9-.06-.06A1.7 1.7 0 0 0 16 18.4a1.7 1.7 0 0 0-1.4 1.57V21h-5.2v-1.03A1.7 1.7 0 0 0 8 18.4a1.7 1.7 0 0 0-1.87.34l-.06.06-1.9-1.9.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.57-1.4H2v-3.2h1.03A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87L4.2 7.07l1.9-1.9.06.06A1.7 1.7 0 0 0 8 5.6a1.7 1.7 0 0 0 1.4-1.57V3h5.2v1.03A1.7 1.7 0 0 0 16 5.6a1.7 1.7 0 0 0 1.87-.34l.06-.06 1.9 1.9-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.57 1.4H22v3.2h-1.03A1.7 1.7 0 0 0 19.4 15Z"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M20 13v7H4V4h7"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};

const options = TARGET_LANGUAGES.map((l) => `<option value="${l.code}">${l.label}</option>`).join('');

app.innerHTML = `
  <div class="site-shell">
    <header class="topbar">
      <a class="brand" href="./" aria-label="KaruYaku ホーム">
        <svg class="brand-logo" width="38" height="38" viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M6 8h23l16 16-16 16H6l16-16z"/><path fill="#fff" d="M3 22h25v4H3z"/></svg>
        <strong class="brand-name">KaruYaku</strong>
      </a>
      <span class="brand-tagline">軽く、つながず、翻訳する。</span>
      <div class="topbar-right">
        <span class="network-chip" id="network-chip" role="status"><i class="status-dot"></i><span id="network-label">接続状態を確認中</span></span>
        <button class="icon-button settings-shortcut" type="button" id="open-settings" aria-label="詳細設定を開く" title="詳細設定">${icon('settings', 23)}</button>
      </div>
    </header>

    <main>
      <div class="page-heading"><h1>テキスト翻訳</h1><p>翻訳はこの端末内で処理されます</p></div>

      <div class="update-notice" id="update-notice" hidden role="status"><span>新しいバージョンがあります</span><button type="button" id="apply-update">更新する</button></div>

      <section class="model-setup" id="setup-banner" aria-label="翻訳モデルの準備">
        <div class="setup-copy"><strong id="model-status">モデルの準備が必要です</strong><span>初回は約${DEVICE_MODEL.sizeMB}MBのダウンロードが必要です</span></div>
        <button type="button" class="setup-btn" id="load-btn">${icon('download', 17)} モデルを準備</button>
        <div class="progress-block" id="download-progress" hidden><div class="progress-info"><span id="progress-label">準備中…</span><span id="progress-percent">0%</span></div><div class="progress-track"><span id="progress-fill"></span></div></div>
        <p class="recovery-note" id="recovery-note" hidden></p>
      </section>

      <section class="translator" aria-label="テキスト翻訳">
        <div class="language-bar">
          <label class="language-control"><span class="sr-only">原文の言語</span><select id="source-lang"><option value="auto">言語を検出</option>${options}</select></label>
          <button type="button" class="swap-btn" id="swap-languages" aria-label="翻訳言語を入れ替える" title="言語を入れ替える">${icon('arrow', 21)}</button>
          <label class="language-control"><span class="sr-only">翻訳先の言語</span><select id="target-lang">${options}</select></label>
        </div>
        <div class="translation-grid">
          <section class="translation-card source-card" aria-label="翻訳する文章">
            <label class="sr-only" for="source-text">翻訳する文章</label>
            <textarea id="source-text" maxlength="2000" spellcheck="true" placeholder="翻訳したい文章を入力してください">Small language models can run entirely in your browser. Your text stays on this device.</textarea>
            <div class="source-footer"><span id="char-count">0文字</span><button class="icon-button clear-btn" id="clear-text" type="button" aria-label="入力を消去" title="入力を消去">${icon('close', 19)}</button></div>
          </section>
          <button class="primary-btn translate-btn" id="translate-btn" type="button" disabled>翻訳する</button>
          <section class="translation-card result-card" aria-label="翻訳結果">
            <div class="translation-result empty" id="result-text" aria-live="polite">翻訳結果がここに表示されます</div>
            <div class="result-footer"><button type="button" class="icon-button" id="copy-result" aria-label="翻訳結果をコピー" title="コピー" disabled>${icon('copy', 22)}</button></div>
          </section>
        </div>
      </section>

      <section class="tools" aria-label="追加機能">
        <div class="tools-bar">
          <div class="tools-buttons">
            <button type="button" class="tool-button" id="toggle-glossary" aria-expanded="false" aria-controls="glossary-panel">${icon('book', 22)} 用語集</button>
            <span class="tool-divider" aria-hidden="true"></span>
            <button type="button" class="tool-button" id="toggle-settings" aria-expanded="false" aria-controls="settings-panel">${icon('sliders', 22)} 詳細設定</button>
          </div>
          <span class="model-credit"><i class="status-dot"></i> ${MODEL.label} · 端末内処理</span>
        </div>
        <div id="glossary-panel" class="tools-panel" hidden>
          <div class="glossary-heading"><h2>用語集</h2><span id="glossary-count">0 / 50件</span></div>
          <p class="field-help">翻訳で使いたい用語を登録できます。</p>
          <div class="glossary-columns" aria-hidden="true"><span>原語</span><span>訳語</span></div>
          <div class="glossary-rows" id="glossary-rows"></div>
          <button type="button" class="add-glossary-btn" id="add-glossary">＋ 用語を追加</button>
        </div>
        <div id="settings-panel" class="tools-panel" hidden>
          <div class="settings-grid">
            <label class="field-label">日本語の文体<select id="form"><option value="auto">自動</option><option value="polite">です・ます調</option><option value="plain">だ・である調</option></select></label>
            <label class="field-label">文脈<textarea id="context" rows="2" placeholder="例：ソフトウェアの操作マニュアル"></textarea></label>
          </div>
          ${IS_IOS ? `
            <fieldset class="mobile-model-options" id="mobile-model-options">
              <legend>iPhoneモデル（実験）</legend>
              <label class="model-option"><input type="radio" name="ios-model" value="stable" checked><span><strong>標準 · Q2_K</strong><small>約410MB · メモリ節約</small></span></label>
              <label class="model-option"><input type="radio" name="ios-model" value="experimental-q4"><span><strong>高精度 · Q4_0</strong><small>約550MB · GGUF分割読み込み</small></span><span class="experimental-badge">実験</span></label>
              <p class="model-option-note">Q4_0はブラウザのメモリ制限で終了する可能性があります。分割しても推論時の使用メモリは減りません。再読み込み後は標準のQ2_Kに戻ります。</p>
            </fieldset>` : ''}
          <div class="technical-status"><span>量子化 <strong id="quantization-state">${DEVICE_MODEL.quantization}</strong></span><span>実行方式 <strong id="backend-state">未起動</strong></span><span>WebGPU <strong id="gpu-state">確認中</strong></span><span>オフライン用キャッシュ <strong id="pwa-state">確認中</strong></span></div>
          <div class="metrics"><div><span>推論時間</span><strong id="metric-time">—</strong></div><div><span>出力トークン</span><strong id="metric-tokens">—</strong></div><div><span>生成速度</span><strong id="metric-speed">—</strong></div></div>
          <div class="history-header"><h2>実験ログ</h2><button type="button" id="export-log" class="outline-btn" disabled>CSVで保存</button></div>
          <table class="log-table"><thead><tr><th>回</th><th>量子化</th><th>時間</th><th>速度</th></tr></thead><tbody id="history-list"><tr><td colspan="4" class="muted-cell">まだ記録がありません</td></tr></tbody></table>
          <p class="model-disclaimer">非公式の実験サイトです。使用モデル：<a href="https://huggingface.co/${MODEL_REPO}" target="_blank" rel="noopener noreferrer">${MODEL.label} ${icon('external', 13)}</a>（<a href="https://plamo.preferredai.jp/info/plamo-community-license-en" target="_blank" rel="noopener noreferrer">PLaMo Community License</a>）。推論基盤：wllama。端末やブラウザによっては動作しない場合があります。</p>
          <p class="runtime-error" id="runtime-error" hidden></p>
        </div>
      </section>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    </main>
  </div>
`;

const $ = (selector) => document.querySelector(selector);
const state = { busy: false, swReady: false, gpuAvailable: false, updateAvailable: false };
let toastTimeout;
let applyServiceWorkerUpdate = () => Promise.resolve();
const LOAD_MARKER = 'karuyaku:ios-model-loading';

function markModelLoad(active) {
  if (!IS_IOS) return;
  try {
    if (active) sessionStorage.setItem(LOAD_MARKER, String(Date.now()));
    else sessionStorage.removeItem(LOAD_MARKER);
  } catch { /* プライベートモード等の保存領域制限 */ }
}

if (IS_IOS) {
  try {
    const interruptedAt = Number(sessionStorage.getItem(LOAD_MARKER));
    sessionStorage.removeItem(LOAD_MARKER);
    if (interruptedAt && Date.now() - interruptedAt < 20 * 60 * 1000) {
      $('#recovery-note').textContent = '前回のモデル準備が途中で中断されました。iPhoneのメモリ制限などでページが終了した可能性があります。';
      $('#recovery-note').hidden = false;
    }
  } catch { /* 保存領域が利用できなくても続行する */ }
}

const MAX_GLOSSARY_ITEMS = 50;

function updateGlossaryRows() {
  const rows = [...document.querySelectorAll('.glossary-row')];
  rows.forEach((row, index) => {
    row.querySelector('.glossary-source').setAttribute('aria-label', `原語 ${index + 1}件目`);
    row.querySelector('.glossary-target').setAttribute('aria-label', `訳語 ${index + 1}件目`);
    row.querySelector('.glossary-remove').setAttribute('aria-label', `${index + 1}件目を削除`);
  });
  const filled = rows.filter((row) => row.querySelector('.glossary-source').value.trim() || row.querySelector('.glossary-target').value.trim());
  $('#glossary-count').textContent = `${filled.length} / ${MAX_GLOSSARY_ITEMS}件`;
  $('#add-glossary').disabled = rows.length >= MAX_GLOSSARY_ITEMS;
}

function addGlossaryRow() {
  if ($('#glossary-rows').children.length >= MAX_GLOSSARY_ITEMS) return;
  const row = document.createElement('div');
  row.className = 'glossary-row';

  for (const [kind, label, placeholder] of [
    ['source', '原語', '例：dashboard'],
    ['target', '訳語', '例：管理画面'],
  ]) {
    const field = document.createElement('label');
    field.className = 'glossary-cell';
    const caption = document.createElement('span');
    caption.className = 'glossary-mobile-label';
    caption.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = `glossary-${kind}`;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.addEventListener('input', updateGlossaryRows);
    field.append(caption, input);
    row.append(field);
  }

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-button glossary-remove';
  remove.title = 'この用語を削除';
  remove.innerHTML = icon('close', 18);
  remove.addEventListener('click', () => {
    row.remove();
    if (!$('#glossary-rows').children.length) addGlossaryRow();
    updateGlossaryRows();
  });
  row.append(remove);
  $('#glossary-rows').append(row);
  updateGlossaryRows();
}

$('#add-glossary').addEventListener('click', () => {
  addGlossaryRow();
  $('#glossary-rows .glossary-row:last-child .glossary-source').focus();
});
addGlossaryRow();

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
  $('#apply-update').disabled = value;
  $('#load-btn').disabled = value;
  $('#translate-btn').disabled = value || !translator.instance?.isModelLoaded() || !$('#source-text').value.trim();
  for (const id of ['source-lang', 'target-lang']) {
    $('#' + id).disabled = value;
  }
  $('#swap-languages').disabled = value;
  document.querySelectorAll('input[name="ios-model"]').forEach((input) => { input.disabled = value; });
}

function setModelStatus(message, status = 'neutral') {
  const node = $('#model-status');
  node.textContent = message;
  node.dataset.status = status;
  $('#backend-state').textContent = translator.activeBackend || '未起動';
  $('#setup-banner').hidden = status === 'ready';
  setNetworkStatus();
}

function setNetworkStatus() {
  const ready = Boolean(state.swReady && translator.instance?.isModelLoaded());
  const node = $('#network-chip');
  node.className = `network-chip ${ready ? 'ready' : (navigator.onLine ? '' : 'offline-not-ready')}`;
  $('#network-label').textContent = ready ? 'オフライン利用可能' : (navigator.onLine ? 'モデル準備中' : 'オフライン（未準備）');
}

async function refreshCapabilities() {
  state.gpuAvailable = await detectWebGpu();
  $('#gpu-state').textContent = state.gpuAvailable ? '利用可能' : '利用不可';
  $('#pwa-state').textContent = state.swReady ? '準備済み' : '準備中 / 非対応';
  setNetworkStatus();
}

function updateProgress({ loaded, total }) {
  $('#download-progress').hidden = false;
  if (total > 0) {
    const ratio = Math.min(100, Math.round((loaded / total) * 100));
    $('#progress-percent').textContent = `${ratio}%`;
    $('#progress-fill').style.width = `${ratio}%`;
    $('#progress-label').textContent = ratio === 100 ? 'モデル取得完了・起動中…' : `モデル取得 ${Math.round(loaded / 1e6)} / ${Math.round(total / 1e6)} MB`;
  } else {
    $('#progress-percent').textContent = '確認中';
    $('#progress-label').textContent = 'キャッシュ / ダウンロード確認中';
  }
}

async function refreshModelCache() {
  try {
    const cached = await translator.isCached();
    if (cached && !translator.instance?.isModelLoaded()) {
      setModelStatus('モデルは保存済みです', 'cached');
      $('#load-btn').innerHTML = `${icon('check')} モデルを起動`;
      $('.setup-copy span').textContent = 'ダウンロードせずに再利用できます';
    } else if (!translator.instance?.isModelLoaded()) {
      setModelStatus('モデルの準備が必要です', 'neutral');
      $('#load-btn').innerHTML = `${icon('download')} モデルを準備`;
      $('.setup-copy span').textContent = `初回は約${translator.getSelectedModel().sizeMB}MBのダウンロードが必要です`;
    }
  } catch (error) {
    console.warn('モデルキャッシュを確認できません', error);
  }
}

if (IS_IOS) {
  document.querySelectorAll('input[name="ios-model"]').forEach((input) => {
    input.addEventListener('change', async () => {
      if (!input.checked || state.busy) return;
      setBusy(true);
      try {
        await translator.setIOSModelMode(input.value);
        $('#quantization-state').textContent = translator.getSelectedModel().quantization;
        $('#download-progress').hidden = true;
        $('#runtime-error').hidden = true;
        setModelStatus('モデルを切り替えました', 'neutral');
        $('.setup-copy span').textContent = `初回は約${translator.getSelectedModel().sizeMB}MBのダウンロードが必要です`;
        await refreshModelCache();
      } catch (error) {
        $('#runtime-error').textContent = cleanError(error);
        $('#runtime-error').hidden = false;
        toast('モデルの切り替えに失敗しました', 'error');
      } finally {
        setBusy(false);
      }
    });
  });
}

$('#load-btn').addEventListener('click', async () => {
  if (state.busy) return;
  markModelLoad(true);
  setBusy(true);
  setModelStatus('モデルを準備しています', 'loading');
  $('#load-btn').textContent = '準備中…';
  $('#progress-fill').style.width = '0%';
  try {
    const loaded = await translator.load({ onProgress: updateProgress });
    setModelStatus('モデルの準備が完了しました', 'ready');
    $('#backend-state').textContent = loaded.backend;
    $('#load-btn').innerHTML = `${icon('check')} 準備完了`;
    $('#download-progress').hidden = true;
    $('#runtime-error').hidden = true;
    toast('モデルの準備が完了しました', 'success');
  } catch (error) {
    setModelStatus('モデルの準備に失敗しました', 'error');
    $('#load-btn').innerHTML = `${icon('refresh')} 再試行`;
    $('#runtime-error').textContent = cleanError(error);
    $('#runtime-error').hidden = false;
    toast('モデルを起動できませんでした。詳細設定からエラーを確認できます。', 'error');
    console.error(error);
  } finally {
    markModelLoad(false);
    setBusy(false);
  }
});

function cleanError(error) {
  return String(error?.message || error)
    .replaceAll('したっス', 'しました')
    .replaceAll('ほしいっス', 'ください')
    .replaceAll('するっス', 'します')
    .replaceAll('っス', '');
}

$('#source-text').addEventListener('input', () => {
  const count = $('#source-text').value.length;
  $('#char-count').textContent = `${count.toLocaleString('ja-JP')}文字`;
  const result = $('#result-text');
  if (result.dataset.lastTranslation) {
    delete result.dataset.lastTranslation;
    result.textContent = '翻訳結果がここに表示されます';
    result.classList.add('empty');
    $('#copy-result').disabled = true;
  }
  setBusy(state.busy);
});
$('#source-text').dispatchEvent(new Event('input'));
$('#target-lang').value = 'ja';
$('#source-lang').value = 'en';

$('#clear-text').addEventListener('click', () => {
  $('#source-text').value = '';
  $('#source-text').dispatchEvent(new Event('input'));
  $('#source-text').focus();
});

function toggleTool(name) {
  for (const current of ['glossary', 'settings']) {
    const button = $('#toggle-' + current);
    const panel = $('#' + current + '-panel');
    const shouldOpen = current === name && panel.hidden;
    panel.hidden = !shouldOpen;
    button.setAttribute('aria-expanded', String(shouldOpen));
  }
}
$('#toggle-glossary').addEventListener('click', () => toggleTool('glossary'));
$('#toggle-settings').addEventListener('click', () => toggleTool('settings'));
$('#open-settings').addEventListener('click', () => {
  if ($('#settings-panel').hidden) toggleTool('settings');
  $('#settings-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

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
  result.textContent = '翻訳しています…';
  result.classList.remove('empty');
  result.classList.add('thinking');
  $('#copy-result').disabled = true;
  try {
    const glossary = parseGlossaryRows([...document.querySelectorAll('.glossary-row')].map((row) => ({
      source: row.querySelector('.glossary-source').value,
      target: row.querySelector('.glossary-target').value,
    })));
    const translation = await translator.translate({
      text: $('#source-text').value,
      sourceLang: $('#source-lang').value,
      targetLang: $('#target-lang').value,
      form: $('#form').value,
      context: $('#context').value,
      glossary,
      onFallback: (previousBackend) => {
        $('#backend-state').textContent = 'CPU / WASM に切り替え中';
        result.textContent = '実行方式を切り替えて再試行しています…';
        toast(`${previousBackend}で問題が発生したため、CPUで再試行しています。`);
      },
    });
    setModelStatus('モデルの準備が完了しました', 'ready');
    result.textContent = translation.text || '翻訳結果が空でした。短い文章で再試行してください。';
    result.dataset.lastTranslation = translation.text || '';
    $('#copy-result').disabled = !translation.text;
    $('#metric-time').textContent = `${(translation.elapsedMs / 1000).toFixed(2)} 秒`;
    $('#metric-tokens').textContent = translation.tokens == null ? '—' : `${translation.tokens} tokens`;
    $('#metric-speed').textContent = translation.speed == null ? '—' : `${translation.speed.toFixed(1)} tok/s`;
    if (translation.stoppedByLimit) toast('生成上限に達しました。短い文章で再試行してください。');
    history.unshift({
      index: history.length + 1,
      time: translation.elapsedMs / 1000,
      speed: translation.speed,
      tokens: translation.tokens,
      model: MODEL.label,
      quantization: translator.getSelectedModel().quantization,
      backend: translator.activeBackend,
      device: navigator.userAgent,
      at: new Date().toISOString(),
    });
    renderHistory();
    $('#runtime-error').hidden = true;
  } catch (error) {
    result.textContent = '翻訳できませんでした。詳細設定からエラーを確認できます。';
    result.classList.add('empty');
    $('#runtime-error').textContent = `実行方式: ${translator.activeBackend || '未起動'}\n${cleanError(error)}`;
    $('#runtime-error').hidden = false;
    toast('翻訳に失敗しました', 'error');
    if (!translator.instance?.isModelLoaded()) {
      setModelStatus('モデルの再起動が必要です', 'error');
      $('#load-btn').innerHTML = `${icon('refresh')} モデルを再起動`;
    } else {
      setModelStatus('モデルの準備が完了しました', 'ready');
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
    toast('翻訳結果をコピーしました', 'success');
  } catch {
    toast('クリップボードにコピーできませんでした', 'error');
  }
});

function renderHistory() {
  $('#history-list').replaceChildren();
  for (const item of history.slice(0, 8)) {
    const row = document.createElement('tr');
    const cells = [String(item.index), item.quantization, `${item.time.toFixed(2)}秒`, item.speed == null ? '—' : `${item.speed.toFixed(1)} tok/s`];
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
  const cols = ['at', 'model', 'quantization', 'backend', 'time', 'tokens', 'speed', 'device'];
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [cols.join(','), ...history.slice().reverse().map((item) => cols.map((col) => escape(item[col])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `karuyaku-benchmark-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

window.addEventListener('online', setNetworkStatus);
window.addEventListener('offline', setNetworkStatus);
setNetworkStatus();

if ('serviceWorker' in navigator) {
  applyServiceWorkerUpdate = registerSW({
    immediate: true,
    onNeedRefresh: () => {
      state.updateAvailable = true;
      $('#update-notice').hidden = false;
    },
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
    onRegisterError: (error) => console.warn('Service Workerを登録できませんでした', error),
  });
}

$('#apply-update').addEventListener('click', () => {
  if (state.busy || !state.updateAvailable) return;
  applyServiceWorkerUpdate(true);
});

Promise.all([refreshCapabilities(), refreshModelCache()]).catch(console.error);

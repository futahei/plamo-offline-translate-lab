# PLaMo Offline Translate Lab

**PLaMo 3 Translate 0.8Bをブラウザ単体で動かす、GitHub Pages対応のオフライン翻訳PoC。**

モデルは[Preferred Networks公式GGUF](https://huggingface.co/pfnet/plamo-3-translate-0.8b-GGUF)、推論エンジンは[wllama](https://github.com/ngxson/wllama)（ブラウザ版llama.cpp）を使用。PLaMoの翻訳指示は公式PFML3を直接構築する。

## 技術構成

| 役割 | 技術 |
| --- | --- |
| UI / 配信 | HTML、JavaScript、Vite、GitHub Pages |
| 推論基盤 | wllama v3（WebAssembly + 任意のWebGPU） |
| モデル | PLaMo 3 Translate 0.8B GGUF（Q4_0に固定） |
| 翻訳入力 | PFML3（原文・対象言語・文脈・用語集・文体） |
| オフライン | Workbox Service Worker（アプリ） + OPFS（GGUF） |
| iPhone Safari | wllama-compat を同梱 |
| テスト | Node.jsのPFML3ユニットテスト |

翻訳はブラウザ内で実行される。モデル取得時にHugging Faceへ通信するが、翻訳対象のテキストは送信しない。APIキーや独自サーバーは不要。

利用者にモデル選択UIは表示しない。新規取得はQ4_0に固定するが、旧版PoCでダウンロード済みのQ4_K_Mがブラウザ内にある場合だけ、自動でそのモデルを再利用する（再ダウンロードを避けるため）。

## ローカルで動かす

```bash
npm ci
npm test
npm run dev
```

表示された `http://localhost:5173/` を開く。初回にモデルを読み込むと、約0.55GBがダウンロードされる。

配布用ビルドの確認：

```bash
npm run build
npm run preview
```

**オフライン動作テストは本番ビルド（`npm run preview`）かGitHub Pages上で行う。** 開発サーバーではService Workerの動作が異なる。

## GitHub Pagesで公開

1. GitHubに公開リポジトリを新規作成し、このプロジェクトの全ファイル（`node_modules/`と`dist/`を除く）をpushする。
2. GitHubの **Settings → Pages → Build and deployment** で **Source: GitHub Actions** を選ぶ。
3. `main`へのpushで `.github/workflows/pages.yml` が実行され、`npm test`と`npm run build`の成功後に自動公開される。
4. `https://<ユーザー名>.github.io/<リポジトリ名>/` にアクセスする。独自ドメインや費用は不要。

Viteの `base: './'`、PWAの `start_url: './'` / `scope: './'` により、ユーザーサイトとプロジェクトサイトの両方のパス構成に対応。

**GGUFはGitHubにコミットしないこと。** ファイルはHugging Faceからユーザー端末に直接ダウンロードし、ブラウザ内OPFSに保持する。

## LT向けオフライン実演

1. ネット接続中にGitHub Pagesを開く。
2. 「モデルをダウンロードして起動」を押す。初回は約550MBの取得を待つ。モデルはPLaMo 3 Translate 0.8Bに固定。
3. 翻訳できることを確認する。
4. Wi-Fiとモバイル通信を無効にする。DevToolsのNetwork Offlineでもよい。
5. 同じブラウザ・同じURLで再読み込みし、PWAがページを表示できることを確認する。
6. 「保存済みモデルを起動」を押して翻訳。キャッシュにあるモデルを再使用する。
7. 必要ならCSVを保存して処理速度をLTの結果として使う。

**注意：** OSの機内モードでもブラウザの保存領域は残るが、プライベートブラウジング、ストレージの削除、容量不足による自動消去はオフライン起動を妨げる。機種・ブラウザ・GPUで動作状況が変わるため、本番で使う端末で必ず事前検証すること。

## 性能・互換性の既知の制約

- GitHub PagesはCOOP/COEPレスポンスヘッダーを自由に設定できないため、PoCは **CPUを1スレッド**に固定している。WebGPUが使える端末ではGPUを優先する。
- Safari/iOSはwllamaの通常ビルドが必要とするJSPI/Memory64に未対応の場合があり、同梱の `@wllama/wllama-compat` に切り替える。通常ビルドより遅い可能性がある。
- PLaMo 3 Translate 0.8BのQ4_0モデル本体は約0.55GB。推論にはこれ以外にもWASM、作業用メモリ、KVキャッシュが必要。
- モバイル端末によってはWebGPUの初期化・メモリ確保に失敗する。その場合、CPUへ自動切り替えする。翻訳時の低水準エラーでもCPU・小さいコンテキストに一度だけ自動再試行する。
- 最大コンテキストはメモリを抑えるため実験的に **2,048 tokens**に制限。自動復旧時は1,024 tokensに縮小する。長文と大量の用語集は対象外。
- 推論の実動作は端末環境での確認が必要。これは実験用のPoCであって、商用サービスの品質を保証するものではない。

### WebLLMという名称について

WebLLM（MLC AIのライブラリ）は、MLC形式に変換してコンパイルされたモデルを実行する仕組み。PLaMo 3 Translateの公式GGUFをそのまま読み込むことはできない。このPoCでは、**WebGPUでブラウザ内推論するという目的**を満たすため、GGUF対応のwllamaを使用し、WebGPU非対応・エラー時にCPU/WASMを試す構成を採用している。

### `Invalid typed array length: 1163217991` への対処

この数値を16進数にすると `0x45554c47` で、wllama内部の通信識別子 `GLUE` をリトルエンディアンで読んだ値に一致する。正常な出力サイズとして扱えず、WASMからの応答処理が失敗した可能性がある。原因がGPU・メモリ・wllama本体のどれかはスタックトレースなしでは断定できない。現在のPoCは翻訳時にこのエラーを検知した場合、モデルを保存領域から再利用してCPU・省メモリ設定で一度だけ再試行し、復旧できなければ詳しいエラーを表示する。実機で再発する場合はブラウザのコンソールログを取得する。

## ライセンス

ソースコードの著作権とモデルの利用条件は別。モデル本体は **PLaMo Community License** に従う。非商用の研究・学習目的を想定する。商用利用する場合は[PFNのライセンス条項](https://plamo.preferredai.jp/info/plamo-community-license-en)を確認すること。

関連情報：

- [PFN公式 PLaMo 3 Translate GGUFモデルカード](https://huggingface.co/pfnet/plamo-3-translate-0.8b-GGUF)
- [wllama（ブラウザ用llama.cpp）](https://github.com/ngxson/wllama)
- [GitHub Pages公式ドキュメント](https://docs.github.com/en/pages)

# KaruYaku

**PLaMo 3 Translate 0.8Bをブラウザ単体で動かす、GitHub Pages対応のオフライン翻訳PoC。**

モデルは[Preferred Networks公式GGUF](https://huggingface.co/pfnet/plamo-3-translate-0.8b-GGUF)、推論エンジンは[wllama](https://github.com/ngxson/wllama)（ブラウザ版llama.cpp）を使用。PLaMoの翻訳指示は公式PFML3を直接構築する。

## 技術構成

| 役割 | 技術 |
| --- | --- |
| UI / 配信 | HTML、JavaScript、Vite、GitHub Pages |
| 推論基盤 | PLaMo 3対応のwllamaソースビルド（固定コミット `d275dac` / WebAssembly + WebGPU） |
| モデル | PLaMo 3 Translate 0.8B GGUF（PC・iPhone/iPadとも標準Q4_0、iOSはQ2_Kへ切り替え可能） |
| 翻訳入力 | PFML3（原文・対象言語・文脈・用語集・文体） |
| オフライン | Workbox Service Worker（アプリ） + OPFS（GGUF） |
| iPhone Safari | 同じコミットのwllama-compatを同梱 |
| テスト | Node.jsのPFML3ユニットテスト |

翻訳はブラウザ内で実行される。モデル取得時にHugging Faceへ通信するが、翻訳対象のテキストは送信しない。APIキーや独自サーバーは不要。

PCにはモデル選択UIを表示しない。新規取得はQ4_0に固定するが、旧版PoCでダウンロード済みのQ4_K_Mがブラウザ内にある場合だけ自動で再利用する。iPhone/iPadもQ4_0（約550MB）の**GGUF分割読み込み**が初期設定。メモリに余裕がない端末では詳細設定からQ2_K（約410MB）へ変更でき、選択は同じブラウザで維持される。

各量子化モデルの初回取得後は、wllamaの保存領域（OPFS）にあるファイルを直接開いて再利用する。切り替え前のモデルは自動削除しない。両方のモデルを保存するには約1GB以上の空き容量が必要。iOSは保存領域の空き容量やブラウザの削除ポリシーによりキャッシュが消えることがあり、永続保存を完全には保証できない。

## ローカルで動かす

```bash
npm ci
npm test
bash scripts/build-wllama.sh  # 初回だけ。Docker Compose必須。数十分かかることがある
npm run dev
```

iPhone向けQ4_0分割モデルをローカルで試す場合は `bash scripts/build-q4-shards.sh` も実行する。約550MBのモデルを取得し、llama.cppの `llama-gguf-split` をコンパイルして `public/models/` に分割モデルを生成する（32テンソルごとに分割。各ファイルのサイズは一定ではない）。CMake・C++ビルド環境・Git・curlが必要。通常のPC / iPhone Q2_K利用時は不要。

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
3. `main`へのpushで `.github/workflows/pages.yml` が実行され、PLaMo 3対応のwllamaとQ4_0分割モデルをビルド（以降はActionsキャッシュで再利用）してから、`npm test`と`npm run build`の成功後に自動公開される。初回はコンパイルとモデル取得に時間がかかる。
4. `https://<ユーザー名>.github.io/<リポジトリ名>/` にアクセスする。独自ドメインや費用は不要。

Viteの `base: './'`、PWAの `start_url: './'` / `scope: './'` により、ユーザーサイトとプロジェクトサイトの両方のパス構成に対応。

**GGUFはGitHubリポジトリにコミットしないこと。** PCのQ4_0とiPhoneのQ2_KはHugging Faceからユーザー端末へ直接ダウンロードする。一方、iPhone標準のQ4_0はGitHub ActionsでGGUFを正規形式の32テンソル単位に分割し、GitHub Pagesから配信する。いずれもブラウザ内OPFSへ保存する。分割モデルには配布元のPLaMo Community Licenseの全文も同梱する。GitHub Pagesの容量・帯域の制約には注意が必要。

**WASMバイナリもGitHubにコミットしないこと。** `scripts/build-wllama.sh` がwllamaの固定コミット `d275dac`（内部のllama.cpp `5aeac37`）をソースから取得・コンパイルする。生成したJS/WASMをGitHub Actionsが静的アセットとしてGitHub Pagesに配置する。初回アクセスでこれらの静的アセットを取得し、Service Workerが再訪用に保存する。

## LT向けオフライン実演

1. ネット接続中にGitHub Pagesを開く。
2. 「モデルを準備」を押す。初期設定ではPC・iPhone/iPadとも約550MBの取得を待つ。モデルはPLaMo 3 Translate 0.8Bに固定。
3. 翻訳できることを確認する。
4. Wi-Fiとモバイル通信を無効にする。DevToolsのNetwork Offlineでもよい。
5. 同じブラウザ・同じURLで再読み込みし、PWAがページを表示できることを確認する。
6. 「保存済みモデルを起動」を押して翻訳。キャッシュにあるモデルを再使用する。
7. 必要ならCSVを保存して処理速度をLTの結果として使う。

### iPhone Q2_K vs Q4_0 分割読み込み実験

1. 同じiPhone・同じSafariで、詳細設定の「標準 · Q4_0」を使って短い文章を翻訳し、CSVを保存する。
2. 詳細設定の「省メモリ · Q2_K」に切り替える。初回は約410MBを取得する。モデル起動と翻訳が成功するか観察する。
3. 同じ文章と設定でQ2_Kを翻訳し、結果・推論時間・tok/sを比較してCSVを保存する。再びQ4_0に戻し、ダウンロードを繰り返さずキャッシュから起動するか、オフラインでも切り替えられるかを試す。
4. 成功・失敗どちらでも機種／OS／ブラウザ、起動可否、ダウンロード後のページ終了有無、生成時間、翻訳結果を記録する。

**仮説：** ファイルを分割すればダウンロード・キャッシュ投入時の一時的なメモリ負担は軽くなる可能性があるが、読み込み後のGGUFモデル本体・KVキャッシュ・WASMヒープに必要なメモリは大きいまま。従って**Q4_0がすべてのiPhoneで動作する保証はない**。特定端末で動作したという報告と、普遍的な互換性の保証は区別する。

**注意：** OSの機内モードでもブラウザの保存領域は残るが、プライベートブラウジング、ストレージの削除、容量不足による自動消去はオフライン起動を妨げる。機種・ブラウザ・GPUで動作状況が変わるため、本番で使う端末で必ず事前検証すること。

## 性能・互換性の既知の制約

- GitHub PagesはCOOP/COEPレスポンスヘッダーを自由に設定できないため、PoCは **CPUを1スレッド**に固定している。WebGPUが使える端末ではGPUを優先する。
- Safari/iOSはwllamaの通常ビルドが必要とするJSPI/Memory64に未対応の場合があり、ソースから同時ビルドした `wllama-compat` に切り替える。通常ビルドより遅い可能性がある。
- iPhone/iPadは分割Q4_0（約550MB）を標準とし、CPU/WASM・コンテキスト512 tokens・バッチ32で動作させる。メモリ不足の場合はQ2_K（約410MB）に切り替えられる。**iOSのブラウザがWASMや大きなモデルを読み込める保証はなく**、メモリ制限でタブが終了する場合がある。SafariとChromeは多くのiOS環境でWebKitを利用するため、ブラウザを変えても回避できない可能性がある。
- Service Workerの更新はユーザーの明示操作で適用する。大きなモデルのダウンロード・読み込み途中にアプリ更新で勝手にページがリロードする問題を防ぐため。ただしiOSのメモリ不足によるプロセス終了・リロードはこの変更では防げない。
- PLaMo 3 Translate 0.8BのQ4_0モデル本体は約0.55GB。推論にはこれ以外にもWASM、作業用メモリ、KVキャッシュが必要。
- モバイル端末によってはWebGPUの初期化・メモリ確保に失敗する。その場合、CPUへ自動切り替えする。翻訳時の低水準エラーでもCPU・小さいコンテキストに一度だけ自動再試行する。
- 最大コンテキストはメモリを抑えるため実験的に **2,048 tokens**に制限。自動復旧時は1,024 tokensに縮小する。長文と大量の用語集は対象外。
- 推論の実動作は端末環境での確認が必要。これは実験用のPoCであって、商用サービスの品質を保証するものではない。

### WebLLMという名称について

WebLLM（MLC AIのライブラリ）は、MLC形式に変換してコンパイルされたモデルを実行する仕組み。PLaMo 3 Translateの公式GGUFをそのまま読み込むことはできない。このPoCでは、**WebGPUでブラウザ内推論するという目的**を満たすため、GGUF対応のwllamaを使用し、WebGPU非対応・エラー時にCPU/WASMを試す構成を採用している。

### `Invalid typed array length: 1163217991` への対処

この数値を16進数にすると `0x45554c47` で、wllama内部の通信識別子 `GLUE` をリトルエンディアンで読んだ値に一致する。応答が正常に返らず、入力ヘッダーが出力長として誤読されたことを意味する。

以前のPoCは**npm版 `@wllama/wllama` 3.8.1を利用していたが、こちらはPLaMo 3トークナイザーを読み込めない**。この制約は[PLaMo 3のブラウザ推論を実現したSakuttoのビルド資料](https://github.com/jammaru/sakutto/blob/main/docs/BUILDING.md)でも明記されている。そのため、このPoCはPLaMo 3を読み込めるwllamaコミット `d275dac` のソースビルドに変更した。なお、本番のGitHub Pagesでの翻訳成功は**実機テストで検証する必要がある**。エラー発生時は自動でCPU・省メモリプロファイルに再試行し、ブラウザのコンソールへwllamaのネイティブログを出す。

## ライセンス

ソースコードの著作権とモデルの利用条件は別。モデル本体は **PLaMo Community License** に従う。非商用の研究・学習目的を想定する。商用利用する場合は[PFNのライセンス条項](https://plamo.preferredai.jp/info/plamo-community-license-en)を確認すること。

関連情報：

- [PFN公式 PLaMo 3 Translate GGUFモデルカード](https://huggingface.co/pfnet/plamo-3-translate-0.8b-GGUF)
- [wllama（ブラウザ用llama.cpp）](https://github.com/ngxson/wllama)
- [SakuttoのPLaMo 3用wllamaビルド解説](https://github.com/jammaru/sakutto/blob/main/docs/BUILDING.md)（技術検証の参考）
- [GitHub Pages公式ドキュメント](https://docs.github.com/en/pages)

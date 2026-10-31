# Stock Scout

本人用の日本株スクリーニングWebアプリです。

- 本人用: https://stock-scout-glass-hskw.hskw1802.chatgpt.site/connect
- 公開入口: https://hskw1802.github.io/stock-scout-glass/

## 現在の実装状態

Freeプランのキー検証、暗号化Cookie、実データの銘柄一覧、日足・5/25/75日移動平均、ページを開いた際の購入候補の自動抽出を実装しています。常時監視・iPhone通知・注文情報の自動入力は未対応です。架空株価は使いません。

自動抽出は市場全体から時価総額1,000億円超・PER/ROEが正の上位100銘柄を一次抽出し、週次騰落率・業種の強弱で絞った最大5銘柄の日足を検証します。全銘柄の網羅的な移動平均ランキングではありません。条件は未検証の初期設定で、スコアは利益確率ではありません。地合い不良、ニュース未取得、古いデータ、基準日の不一致では判定を保留します。

指数は日経225連動ETF(1321)・TOPIX連動ETF(1306)で代用し、指数自体との違いを画面に表示します。金利・為替・業種・市場心理はZENITH Code、ニュースはGDELT DOCの全文検索を使用します。ニュース本文の全文検索でリスク語の言及を検出するルール評価です。生成AIによる記事読解・真偽判定・企業への影響の推定は実装していません。記事本文は再配信せず、見出し・原文リンク・検出時刻を表示します。

1回の自動判定は最大104トークン（画面の上限表示105）、約3分が目安です。8.5秒以上の取得間隔を取り、ニュースの回数制限にも配慮します。月間枠・取得元の稼働状況によっては停止します。有料枠への切替はしません。判定中は停止ボタンで中断できます。

## 接続手順

1. ZENITH Codeの無料アカウントを作成し、FreeプランのAPIキーを発行。
2. 本人用URLでChatGPTにログイン。
3. キーを入力し、本人利用の確認にチェックして接続。
4. 接続確認に `/stable/usage` を1回呼び、Freeプランを確認します（1トークン）。有料プランへの変更は行いません。

無料枠は月5,000トークン相当・10リクエスト/分です。株価は日次でありリアルタイムではありません。株価・移動平均等は会員本人のみ利用でき、公開再配信できません。

## キーの扱い

APIキーはPOSTで本人用サーバーへ送り、サーバーがAES-GCMで暗号化します。暗号文をHttpOnly・Secure・SameSite=StrictのCookieに2時間保持します。利用者IDと有効期限を暗号文に含めるため、他ユーザーのセッションとして利用できません。生キーはJavaScriptの永続ストレージ、公開リポジトリ、アクセスログには保存しません。Cookieの暗号化鍵はSitesの秘密環境変数 `SCOUT_COOKIE_SECRET` に設定します。Cookieを消すか接続解除すると再入力が必要です。

Sitesのアクセス権を本人限定に維持してください。APIはログインIDのないリクエストを拒否し、書き込みでは同じOriginからの操作のみ受け付けます。公開GitHub Pagesは本人用画面への入口だけで、キーの入力・送信処理を実行しません。

## 採用技術と理由

| 技術 | 理由 |
| --- | --- |
| HTML・CSS・ES Modules | 単一画面を追加依存なしで軽量に構成 |
| CSS backdrop-filter・グラデーション・影 | 白基調のLiquid Glass表現 |
| CSSアニメーション・軽減設定 | モーダルやローディングの動きと端末設定への対応 |
| Cloudflare Worker ESM（Sites） | PC常時起動なしで、本人の認証付きサーバー処理を実行 |
| Web Crypto AES-GCM | Cookie内のAPIキーの暗号化と改ざん検出 |
| HttpOnly Cookie | JavaScriptからキーを読み取らせず、本人のセッションで保持 |
| Sitesログイン・アクセス制御 | 独自OAuthを作らず本人用画面を保護 |
| Node.js標準機能 | ビルド・検証に追加パッケージを不要にする |
| node:test / assert | ログイン制限・Origin検証・暗号化・Freeプラン判定を検証 |
| GitHub Pages | キーを扱わない公開入口の配信 |
| SVG・システムフォント | 外部画像・外部フォントなしのアイコンと表示 |
| BigInt | 今後の予算計算用に小数誤差のない株数計算を保持 |

## ビルドとテスト

```sh
node --test
node scripts/build.mjs
node scripts/validate-artifact.mjs
```

`worker/index.js` がサーバーソース、`dist/connect.html` と `dist/connect.js` が本人用画面です。ビルドは必要な画面資産をWorkerに埋め込み、`dist/server/index.js` を生成します。生成物はGit管理しません。Sitesへは公式source workflowでソースをpushし、同じコミットから生成したWorkerを配信します。

`dist/index.html` は公開入口です。GitHub Pagesでは `gh-pages` の静的ファイルを配信します。`node scripts/serve.mjs` は静的ファイルの確認用で、認証付きAPIのローカル本番代替ではありません。

## 公式資料

- https://zenithcode.net/pricing
- https://zenithcode.net/docs/usage
- https://zenithcode.net/docs/display-rights
- https://zenithcode.net/docs/historical-price-eod

TradingView埋め込みは東証銘柄の表示制限をブラウザで確認したため不採用です。公開ページへ日本株が表示できるとの未検証の主張はしません。

- https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
- https://nextfunds.jp/lineup/

# YouTube API運用メモ

K都市観測局はフロントエンドからYouTube Data APIを直接呼びません。GitHub Actionsで取得したJSONを `public/data/` に出力し、GitHub Pages上の静的ファイルとして読み込みます。

## 公開データ

- `public/data/channels.json`: 監視対象チャンネル定義
- `public/data/schedule.json`: 配信予定・配信中・過去1ヶ月の配信履歴
- `public/data/health.json`: API使用量と最終成功・失敗情報
- `public/data/manual-schedule.json`: APIで取れない予定の手動補完

## GitHub Secrets

Repository settings の Secrets and variables から Actions secret を追加します。

- Name: `YOUTUBE_API_KEY`
- Value: Google Cloud Consoleで発行したYouTube Data API v3のAPIキー

APIキーはコード、`public/`、ビルド成果物へ入れません。

## GitHub Actions

- `update-schedule.yml`: 6時間ごと。`search.list eventType=upcoming` をチャンネルごとに呼び、今後の予定を取得します。
- `update-status.yml`: 1時間ごと。既存 `schedule.json` のvideoIdだけを `videos.list` で確認し、配信中・終了状態を更新します。`search.list` は使いません。
- `update-history.yml`: 1日1回。uploads playlistから直近投稿を取得し、`videos.list` の `liveStreamingDetails` で配信アーカイブだけを過去1ヶ月分残します。`search.list completed` は使いません。

## 想定quota

YouTube Data APIの主な単価は以下の想定です。

- `search.list`: 100 units / call
- `videos.list`: 1 unit / call
- `channels.list`: 1 unit / call
- `playlistItems.list`: 1 unit / call

22チャンネルの場合、upcoming取得は `search.list` 22回で約2200 units、詳細補完の `videos.list` が1回なら約1 unitです。status更新は `videos.list` のみなので、対象videoIdが50件以下なら約1 unitです。history更新は `channels.list` が必要なチャンネル数、`playlistItems.list` がチャンネル数、`videos.list` が最大50件ごとの回数だけ増えます。

## 監視対象チャンネル

`public/channels.json` を元定義、`public/data/channels.json` を公開用の実行時データとして扱います。取得スクリプトは `public/channels.json` を読み、内容を `public/data/channels.json` に同期します。現在はV.W.P本体、V.W.Pのサブ・メンバーシップ系チャンネル、CIEL、Sooda、空爽、少女革命計画を監視対象にしています。

`primaryGroupId` はアプリ上の主表示グループです。少女革命計画メンバー6人は `primaryGroupId: "girls_revolution_project"` に固定し、KAMITSUBAKI親カテゴリ側へ誤表示されないようにします。`groupIds` は補助的な所属・絞り込み用です。メンバーシップ用サブチャンネルも、APIで取得できる公開予定だけが対象です。メンバー限定、限定公開、非公開の自動取得は対象外です。

## Google Cloud Consoleで見る項目

- YouTube Data API v3 が有効になっていること
- API key の制限で不要なAPIを許可していないこと
- Quotas で daily quota と `search.list` 使用量が急増していないこと
- Metrics で 403 / quotaExceeded が出ていないこと
- Actionsを手動連打してquotaを消費しすぎていないこと

`search.list` はquota消費が大きいので、completed検索には使いません。過去履歴はuploads playlist経由で低quotaに寄せています。

## 失敗時

quota exceededやAPIエラーが起きた場合、取得スクリプトは既存の `public/data/schedule.json` を保持します。`public/data/health.json` には `lastError` と `lastSuccessAt` が残るため、Webアプリ側で「データ更新が停止している可能性があります」と表示できます。

## ローカル実行

`.env.local` または環境変数に `YOUTUBE_API_KEY` を設定します。

```bash
node scripts/fetch-youtube-schedule.mjs --scope=upcoming
node scripts/fetch-youtube-schedule.mjs --scope=status
node scripts/fetch-youtube-schedule.mjs --scope=history
```

フロントエンドの「最新データを再読み込み」ボタンは、GitHub Pages上のJSONを再取得するだけです。YouTube APIは呼びません。

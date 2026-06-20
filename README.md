# K都市観測局

神椿/KAMITSUBAKI 関連の YouTube 配信予定を一覧・日別カレンダーで確認する React + TypeScript + Vite アプリです。

フロントエンドは YouTube Data API を直接呼びません。GitHub Actions またはローカルの Node スクリプトで `public/data/schedule.json` を生成し、React 側は `public/data/schedule.json`、`public/data/channels.json`、`public/data/health.json` を読み込みます。

## ローカル起動

Windows 環境では `npm.cmd` を明示して実行します。

```sh
npm.cmd install
npm.cmd run dev
npm.cmd run build
```

## YouTube予定取得

YouTube Data API キーが必要です。API キーはコード、`public` 配下、ビルド成果物に入れないでください。

ローカルでは `.env.local` または環境変数で `YOUTUBE_API_KEY` を設定します。

```sh
YOUTUBE_API_KEY=your-api-key
```

quota 節約のため、取得処理は scope ごとに分けています。

```sh
node scripts/fetch-youtube-schedule.mjs --scope=upcoming
node scripts/fetch-youtube-schedule.mjs --scope=status
node scripts/fetch-youtube-schedule.mjs --scope=history
```

スクリプトは `public/data/channels.json` の `enabled: true` なチャンネルを対象に、`public/data/schedule.json` と `public/data/health.json` を生成します。`videos.list` は最大50件までを1回にまとめて呼び出します。

## GitHub Actions

以下の workflow が定期実行と手動実行に対応しています。

- `update-schedule.yml`: 6時間に1回。`search.list eventType=upcoming` で予定取得
- `update-status.yml`: 1時間に1回。既存videoIdを `videos.list` で状態確認
- `update-history.yml`: 1日1回。uploads playlistから過去1ヶ月の配信履歴を取得

GitHub 側で以下を設定してください。

1. YouTube Data API の API キーを取得する
2. GitHub repository の `Settings` -> `Secrets and variables` -> `Actions` を開く
3. Repository secret として `YOUTUBE_API_KEY` を登録する
4. `Actions` タブから必要な更新 workflow を手動実行する

workflow は `npm ci` 後に `node scripts/fetch-youtube-schedule.mjs --scope=...` を実行し、`public/data/*.json` に変更があれば commit & push します。

## Quota注意

- `search.list` は quota 消費が大きい API です
- upcoming取得以外では `search.list` を使いません
- status確認は `videos.list` のみを使います
- 過去履歴は `search.list completed` を使わず、uploads playlist経由で取得します
- Actions の手動連打は quota exceeded の原因になります
- quota exceeded が発生した場合、既存の `public/data/schedule.json` を保持します
- API使用量とエラー情報は `public/data/health.json` に出力します

Actions ログと `health.json` には `search.list`、`videos.list`、`channels.list`、`playlistItems.list` の呼び出し回数と推定unitsを出します。

## データファイル

- `public/data/channels.json`: 監視対象チャンネル定義
- `public/data/schedule.json`: 自動生成される配信データ
- `public/data/health.json`: API使用量と最終成功・失敗情報
- `public/data/manual-schedule.json`: API で取れない予定を補完するための手動データ

`channels.json` は以下のような形式です。

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-19T13:02:00+09:00",
  "groups": [
    {
      "groupId": "vwp",
      "displayName": "V.W.P",
      "description": "V.W.P関連チャンネル"
    }
  ],
  "channels": [
    {
      "talentId": "rim",
      "displayName": "理芽",
      "groupIds": ["vwp", "solo"],
      "tags": ["artist"],
      "youtubeChannelId": "UCfBkUgaJ6eqYA9_TX2cmq9A",
      "channelName": "理芽 -RIM-",
      "colorKey": "rim",
      "enabled": true
    }
  ]
}
```

## localStorage

ユーザー設定は `k-city-observatory:user-settings` に保存します。

保存対象:

- 選択中のグループ
- 表示対象チャンネル ID
- お気に入りチャンネル ID
- お気に入りのみ表示
- ステータスフィルター
- 30分前通知 ON/OFF
- debug ログ表示 ON/OFF
- 通知済み配信 ID

localStorage の値が壊れている場合でも、初期設定に戻してアプリが落ちないようにしています。

## v0.1機能

- 配信予定一覧と今日から7日分のカレンダー表示
- 過去1か月分の過去配信表示
- グループフィルター
- ステータスフィルター
- チャンネルごとの表示/非表示設定
- チャンネルごとのお気に入り設定
- お気に入りのみ表示
- localStorage による設定保存
- 30分前通知の土台実装
- エラー/info/debug ログ表示
- GitHub Pages を想定した Vite `base` 設定
- GitHub Actions + YouTube Data API による `schedule.json` 生成の土台

## 注意

- メンバー限定、限定公開、非公開の配信は自動取得の対象外です
- API で取れない予定は、将来的に `manual-schedule.json` で補完する想定です
- GitHub Actions、quota節約方針、Google Cloud Consoleで確認する項目は `docs/youtube-api-operations.md` にまとめています

# K都市観測局

神椿/KAMITSUBAKI 関連の YouTube 配信予定を一覧・日別カレンダーで確認する React + TypeScript + Vite アプリです。

フロントエンドは YouTube Data API を直接呼びません。GitHub Actions またはローカルの Node スクリプトで `public/schedule.json` を生成し、React 側は `public/schedule.json` と `public/channels.json` を読み込みます。

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

通常取得は quota 節約のため `upcoming` と `live` だけを取得します。

```sh
npm.cmd run fetch:schedule
```

過去配信も含める場合だけ、手動で completed を有効にします。

```sh
INCLUDE_COMPLETED=true npm.cmd run fetch:schedule
```

スクリプトは `public/channels.json` の `enabled: true` なチャンネルを対象に、`search.list` と `videos.list` を使って `public/schedule.json` を生成します。`videos.list` は最大50件までを1回にまとめて呼び出します。

## GitHub Actions

`.github/workflows/update-schedule.yml` が定期実行と手動実行に対応しています。

- 定期実行: 6時間に1回
- 通常実行: `upcoming` / `live` のみ取得
- 手動実行: `include_completed` を `true` にすると `completed` も取得

GitHub 側で以下を設定してください。

1. YouTube Data API の API キーを取得する
2. GitHub repository の `Settings` -> `Secrets and variables` -> `Actions` を開く
3. Repository secret として `YOUTUBE_API_KEY` を登録する
4. `Actions` タブから `Update YouTube schedule` を手動実行する

workflow は `npm ci` 後に `node scripts/fetch-youtube-schedule.mjs` を実行し、`public/schedule.json` に変更があれば commit & push します。

## Quota注意

- `search.list` は quota 消費が大きい API です
- チャンネル数 × eventType 数だけ `search.list` を呼びます
- 通常実行では `completed` を取得しません
- `completed` は手動実行で必要なときだけ取得してください
- Actions の手動連打は quota exceeded の原因になります
- quota exceeded が発生した場合、既存の `public/schedule.json` を保持します
- `videos.list` で quota exceeded した場合、取得済みの `upcoming` / `live` の search 結果から可能な範囲で `schedule.json` を更新します

Actions ログには予定している `search.list` 呼び出し回数、実行した `search.list` 呼び出し回数、`videos.list` 呼び出し回数、quota exceeded 時の明確なメッセージを出します。

## データファイル

- `public/channels.json`: 監視対象チャンネル定義
- `public/schedule.json`: 自動生成される配信データ
- `public/manual-schedule.json`: API で取れない予定を将来補完するための手動データ

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

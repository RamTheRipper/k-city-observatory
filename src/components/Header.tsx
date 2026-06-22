type HeaderProps = {
  lastUpdatedAt: string | null;
};

export function Header({ lastUpdatedAt }: HeaderProps) {
  const updatedLabel = lastUpdatedAt
    ? new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(lastUpdatedAt))
    : '未取得';

  return (
    <header className="appHeader">
      <p className="eyebrow">KAMITSUBAKI STREAM OBSERVATORY</p>
      <div className="headerTitleRow">
        <div>
          <h1>K都市観測局</h1>
          <p className="lead">
            神椿関連のYouTube配信予定を、日付ごとに見やすく観測するビューアです。
          </p>
        </div>
        <p className="updatedAt">最終更新: {updatedLabel}</p>
      </div>
    </header>
  );
}

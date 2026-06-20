type HeaderProps = {
  scheduleCount: number;
  channelCount: number;
  lastUpdatedAt: string | null;
};

export function Header({ scheduleCount, channelCount, lastUpdatedAt }: HeaderProps) {
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
      <div>
        <p className="eyebrow">KAMITSUBAKI STREAM OBSERVATORY</p>
        <h1>K都市観測局</h1>
        <p className="lead">神椿関連のYouTube配信予定を、日別に観測するためのビューアです。</p>
      </div>

      <dl className="headerStats" aria-label="読み込み状況">
        <div>
          <dt>配信</dt>
          <dd>{scheduleCount}</dd>
        </div>
        <div>
          <dt>配信者</dt>
          <dd>{channelCount}</dd>
        </div>
        <div>
          <dt>最終更新</dt>
          <dd>{updatedLabel}</dd>
        </div>
      </dl>
    </header>
  );
}

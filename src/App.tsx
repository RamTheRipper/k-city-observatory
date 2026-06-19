import sampleSchedule from './data/sampleSchedule.json';
import type { StreamSchedule } from './types/stream';
import './App.css';

function formatDateTime(startAt: string): string {
  const date = new Date(startAt);

  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function App() {
  const schedules = sampleSchedule as StreamSchedule[];

  return (
    <main className="app">
      <header className="appHeader">
        <h1>K都市観測局</h1>
        <p>神椿関連の配信予定を観測します。</p>
      </header>

      <section className="scheduleList">
        {schedules.map((stream) => (
          <article key={stream.id} className="scheduleCard">
            <div className="scheduleMeta">
              <span>{stream.group}</span>
              <span>{formatDateTime(stream.startAt)}</span>
            </div>

            <h2>{stream.title}</h2>
            <p>{stream.channelName}</p>

            <a href={stream.url} target="_blank" rel="noreferrer">
              YouTubeで開く
            </a>
          </article>
        ))}
      </section>
    </main>
  );
}

export default App;
import type { LogEntry, UserSettings } from '../types';
import { formatDateTime } from '../utils/date';

type LogPanelProps = {
  logs: LogEntry[];
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
};

export function LogPanel({ logs, settings, onChange }: LogPanelProps) {
  const visibleLogs = logs.filter((log) => log.level !== 'debug' || settings.debugEnabled);

  return (
    <section className="logPanel" aria-label="ログ">
      <div className="panelHeader">
        <h2>ログ</h2>
        <label className="switchRow compact">
          <input
            type="checkbox"
            checked={settings.debugEnabled}
            onChange={(event) => onChange({ ...settings, debugEnabled: event.target.checked })}
          />
          debug
        </label>
      </div>

      <div className="logList">
        {visibleLogs.length > 0 ? (
          visibleLogs.map((log) => (
            <p key={log.id} className={`logEntry logEntry-${log.level}`}>
              <span>{formatDateTime(log.createdAt)}</span>
              <strong>{log.level}</strong>
              {log.message}
            </p>
          ))
        ) : (
          <p className="emptyText">ログはありません。</p>
        )}
      </div>
    </section>
  );
}

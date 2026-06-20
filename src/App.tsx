import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarView } from './components/CalendarView';
import { ChannelSettings } from './components/ChannelSettings';
import { FilterPanel } from './components/FilterPanel';
import { Header } from './components/Header';
import { LogPanel } from './components/LogPanel';
import { NotificationSettings } from './components/NotificationSettings';
import type { ChannelItem, LogEntry, LogLevel, ScheduleItem, UserSettings } from './types';
import { isWithinVisibleRange, parseDate } from './utils/date';
import { createLog } from './utils/logger';
import { loadSettings, saveSettings } from './utils/storage';
import './App.css';

const assetPath = (fileName: string) => `${import.meta.env.BASE_URL}${fileName}`;
const fallbackGroup = 'other';

async function fetchJson(fileName: string): Promise<unknown> {
  const response = await fetch(assetPath(fileName), { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`${fileName} の読み込みに失敗しました (${response.status})`);
  }

  return response.json();
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeChannel(rawChannel: unknown): ChannelItem | null {
  if (!rawChannel || typeof rawChannel !== 'object') {
    return null;
  }

  const channel = rawChannel as Record<string, unknown>;
  const groupIds = asArray(channel.groupIds).map(String);
  const youtubeChannelId = String(channel.youtubeChannelId || channel.channelId || '');
  const name = String(
    channel.name || channel.displayName || channel.channelName || youtubeChannelId || 'unknown',
  );

  if (!youtubeChannelId) {
    return null;
  }

  return {
    channelId: youtubeChannelId,
    youtubeChannelId,
    talentId: channel.talentId ? String(channel.talentId) : undefined,
    name,
    displayName: channel.displayName ? String(channel.displayName) : undefined,
    channelName: channel.channelName ? String(channel.channelName) : undefined,
    group: groupIds[0] || (channel.group ? String(channel.group) : fallbackGroup),
    groupIds,
    tags: asArray(channel.tags).map(String),
    category: channel.category ? String(channel.category) : undefined,
    thumbnailUrl: channel.thumbnailUrl ? String(channel.thumbnailUrl) : '',
    colorKey: channel.colorKey ? String(channel.colorKey) : undefined,
    enabled: channel.enabled !== false,
  };
}

function normalizeChannels(value: unknown): ChannelItem[] {
  const source =
    value && typeof value === 'object' && Array.isArray((value as { channels?: unknown }).channels)
      ? (value as { channels: unknown[] }).channels
      : asArray(value);

  return source.map(normalizeChannel).filter((channel): channel is ChannelItem => Boolean(channel));
}

function normalizeSchedules(value: unknown): ScheduleItem[] {
  return asArray(value) as ScheduleItem[];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja-JP'));
}

function mergeSelectedChannels(settings: UserSettings, channels: ChannelItem[]): UserSettings {
  if (channels.length === 0) {
    return settings;
  }

  const availableChannelIds = new Set(channels.map((channel) => channel.channelId));
  const hasKnownSelectedChannel = settings.selectedChannelIds.some((channelId) =>
    availableChannelIds.has(channelId),
  );

  if (settings.selectedChannelIds.length > 0 && hasKnownSelectedChannel) {
    return settings;
  }

  return {
    ...settings,
    selectedChannelIds: channels.map((channel) => channel.channelId),
  };
}

function App() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [isChannelSettingsOpen, setIsChannelSettingsOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => ('Notification' in window ? Notification.permission : 'unsupported'));

  const addLog = useCallback((level: LogLevel, message: string) => {
    const entry = createLog(level, message);
    setLogs((currentLogs) => [entry, ...currentLogs].slice(0, 80));

    if (level === 'error') {
      console.error(message);
    } else {
      console.info(message);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [scheduleData, channelData] = await Promise.all([
          fetchJson('schedule.json'),
          fetchJson('channels.json'),
        ]);
        const nextSchedules = normalizeSchedules(scheduleData);
        const nextChannels = normalizeChannels(channelData);

        if (!isMounted) {
          return;
        }

        setSchedules(nextSchedules);
        setChannels(nextChannels);
        setSettings((currentSettings) => mergeSelectedChannels(currentSettings, nextChannels));
        setLastUpdatedAt(new Date().toISOString());
        addLog(
          'info',
          `データを読み込みました: 配信 ${nextSchedules.length}件 / 配信者 ${nextChannels.length}件`,
        );
        addLog('debug', 'schedule.json / channels.json を public から取得しました');
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : 'データ読み込み中に不明なエラーが発生しました';
        addLog('error', message);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [addLog]);

  useEffect(() => {
    try {
      saveSettings(settings);
    } catch {
      window.setTimeout(() => addLog('error', 'localStorage への設定保存に失敗しました'), 0);
    }
  }, [addLog, settings]);

  useEffect(() => {
    if (!settings.notificationEnabled || notificationPermission !== 'granted') {
      return;
    }

    const timerId = window.setInterval(() => {
      const now = new Date();
      const notifiedIds = new Set(settings.notifiedScheduleIds);
      const target = schedules.find((schedule) => {
        const startAt = parseDate(schedule.startAt);

        if (!startAt || notifiedIds.has(schedule.id) || schedule.status === 'archived') {
          return false;
        }

        const minutesUntilStart = (startAt.getTime() - now.getTime()) / 60000;
        return minutesUntilStart > 0 && minutesUntilStart <= 30;
      });

      if (!target) {
        return;
      }

      new Notification('K都市観測局', {
        body: `${target.channelName} の配信が30分以内に始まります: ${target.title}`,
      });

      setSettings((currentSettings) => ({
        ...currentSettings,
        notifiedScheduleIds: [...new Set([...currentSettings.notifiedScheduleIds, target.id])],
      }));
      addLog('info', `通知を送信しました: ${target.title}`);
    }, 60_000);

    return () => window.clearInterval(timerId);
  }, [
    addLog,
    notificationPermission,
    schedules,
    settings.notificationEnabled,
    settings.notifiedScheduleIds,
  ]);

  const groups = useMemo(
    () =>
      uniqueSorted([
        ...channels.map((channel) => channel.group || fallbackGroup),
        ...schedules.map((schedule) => schedule.group || fallbackGroup),
      ]),
    [channels, schedules],
  );

  const filteredSchedules = useMemo(() => {
    const selectedChannelIds = new Set(settings.selectedChannelIds);
    const favoriteChannelIds = new Set(settings.favoriteChannelIds);
    const now = new Date();

    return schedules.filter((schedule) => {
      const group = schedule.group || fallbackGroup;
      const matchesGroup = settings.selectedGroup === 'all' || group === settings.selectedGroup;
      const matchesChannel =
        selectedChannelIds.size === 0 || selectedChannelIds.has(schedule.channelId);
      const matchesFavorite =
        !settings.showFavoritesOnly || favoriteChannelIds.has(schedule.channelId);
      const matchesStatus =
        settings.statusFilter === 'all' ||
        (settings.statusFilter !== 'unknown' && schedule.status === settings.statusFilter) ||
        (settings.statusFilter === 'unknown' && schedule.status === 'unknown');
      const matchesRange = isWithinVisibleRange(schedule, settings.statusFilter, now);

      return matchesGroup && matchesChannel && matchesFavorite && matchesStatus && matchesRange;
    });
  }, [schedules, settings]);

  function updateSettings(nextSettings: UserSettings): void {
    setSettings(nextSettings);
    addLog('debug', '設定を更新しました');
  }

  function resetFilters(): void {
    setSettings((currentSettings) => ({
      ...currentSettings,
      selectedGroup: 'all',
      showFavoritesOnly: false,
      statusFilter: 'upcoming',
    }));
    addLog('info', 'フィルターをリセットしました');
  }

  async function requestNotificationPermission(): Promise<void> {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      addLog('error', 'このブラウザは通知に対応していません');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    addLog(permission === 'granted' ? 'info' : 'error', `通知権限: ${permission}`);
  }

  return (
    <main className="app">
      <Header lastUpdatedAt={lastUpdatedAt} />

      <FilterPanel
        groups={groups}
        settings={settings}
        onChange={updateSettings}
        onReset={resetFilters}
        onOpenChannelSettings={() => setIsChannelSettingsOpen(true)}
      />

      <CalendarView
        schedules={filteredSchedules}
        favoriteChannelIds={settings.favoriteChannelIds}
        statusFilter={settings.statusFilter}
      />

      <details className="utilityDetails">
        <summary>通知とログ</summary>
        <div className="utilityGrid">
          <NotificationSettings
            settings={settings}
            permission={notificationPermission}
            onChange={updateSettings}
            onRequestPermission={requestNotificationPermission}
          />
          <LogPanel logs={logs} settings={settings} onChange={updateSettings} />
        </div>
      </details>

      {isChannelSettingsOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => setIsChannelSettingsOpen(false)}
        >
          <section
            className="settingsDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="channel-settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialogHeader">
              <div>
                <h2 id="channel-settings-title">配信者設定</h2>
                <p>表示する配信者とお気に入りを選択できます。</p>
              </div>
              <button
                type="button"
                className="iconButton"
                onClick={() => setIsChannelSettingsOpen(false)}
              >
                閉じる
              </button>
            </div>
            <ChannelSettings channels={channels} settings={settings} onChange={updateSettings} />
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default App;

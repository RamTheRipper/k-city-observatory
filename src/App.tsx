import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarView } from './components/CalendarView';
import { ChannelSettings } from './components/ChannelSettings';
import { FilterPanel } from './components/FilterPanel';
import { Header } from './components/Header';
import { LogPanel } from './components/LogPanel';
import { NotificationSettings } from './components/NotificationSettings';
import type {
  ChannelItem,
  GroupItem,
  LogEntry,
  LogLevel,
  ScheduleDocument,
  ScheduleItem,
  UserSettings,
} from './types';
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

async function fetchOptionalJson(fileName: string, fallback: unknown): Promise<unknown> {
  try {
    return await fetchJson(fileName);
  } catch {
    return fallback;
  }
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

function normalizeGroups(value: unknown): GroupItem[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return asArray((value as { groups?: unknown }).groups)
    .flatMap((group) => {
      if (!group || typeof group !== 'object') {
        return [];
      }

      const source = group as Record<string, unknown>;
      const groupId = source.groupId ? String(source.groupId) : '';

      if (!groupId) {
        return [];
      }

      const item: GroupItem = {
        groupId,
        displayName: source.displayName ? String(source.displayName) : groupId,
        description: source.description ? String(source.description) : undefined,
      };

      return [item];
    });
}

function normalizeScheduleDocument(value: unknown): ScheduleDocument {
  if (Array.isArray(value)) {
    return { items: value as ScheduleItem[] };
  }

  if (value && typeof value === 'object') {
    const source = value as { generatedAt?: unknown; items?: unknown };

    return {
      schemaVersion: 1,
      generatedAt: source.generatedAt ? String(source.generatedAt) : undefined,
      items: asArray(source.items) as ScheduleItem[],
    };
  }

  return { items: [] };
}

function getScheduleId(schedule: ScheduleItem): string {
  return schedule.videoId || schedule.id;
}

function normalizeManualSchedules(value: unknown): ScheduleItem[] {
  return asArray(value)
    .flatMap((item) => {
      if (!item || typeof item !== 'object') {
        return [];
      }

      const schedule = item as ScheduleItem;
      const videoId = getScheduleId(schedule);
      const startAt = schedule.scheduledStartTime || schedule.startAt;

      if (!videoId || !startAt) {
        return [];
      }

      return [{
        ...schedule,
        id: schedule.id || videoId,
        videoId,
        startAt,
        source: 'manual' as const,
        startAtSource: schedule.scheduledStartTime ? 'manual-scheduledStartTime' : 'manual-startAt',
        isManual: true,
      }];
    });
}

function applyManualSchedules(schedules: ScheduleItem[], manualSchedules: ScheduleItem[]): ScheduleItem[] {
  const byId = new Map(schedules.map((schedule) => [getScheduleId(schedule), schedule]));

  for (const manual of manualSchedules) {
    const id = getScheduleId(manual);
    const existing = byId.get(id);

    byId.set(id, existing ? { ...existing, ...manual, isManual: true, source: 'manual' } : manual);
  }

  return [...byId.values()];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja-JP'));
}

function mergeSelectedChannels(settings: UserSettings, channels: ChannelItem[]): UserSettings {
  if (channels.length === 0) {
    return settings;
  }

  const channelIds = channels.map((channel) => channel.channelId);

  if (settings.selectedChannelIds.length === 0) {
    return {
      ...settings,
      selectedChannelIds: channelIds,
      knownChannelIds: channelIds,
    };
  }

  const knownChannelIds = new Set(settings.knownChannelIds);
  const selectedChannelIds = new Set(settings.selectedChannelIds);

  for (const channelId of channelIds) {
    if (!knownChannelIds.has(channelId)) {
      selectedChannelIds.add(channelId);
    }
  }

  return {
    ...settings,
    selectedChannelIds: channelIds.filter((channelId) => selectedChannelIds.has(channelId)),
    knownChannelIds: channelIds,
  };
}

function App() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
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
        const [scheduleData, channelData, manualScheduleData] = await Promise.all([
          fetchJson('schedule.json'),
          fetchJson('channels.json'),
          fetchOptionalJson('manual-schedule.json', []),
        ]);
        const scheduleDocument = normalizeScheduleDocument(scheduleData);
        const manualSchedules = normalizeManualSchedules(manualScheduleData);
        const nextSchedules = applyManualSchedules(scheduleDocument.items, manualSchedules);
        const nextChannels = normalizeChannels(channelData);
        const nextGroups = normalizeGroups(channelData);

        if (!isMounted) {
          return;
        }

        setSchedules(nextSchedules);
        setChannels(nextChannels);
        setGroups(nextGroups);
        setSettings((currentSettings) => mergeSelectedChannels(currentSettings, nextChannels));
        setLastUpdatedAt(scheduleDocument.generatedAt ?? new Date().toISOString());
        addLog(
          'info',
          `データを読み込みました: 配信 ${nextSchedules.length}件 / 手動補完 ${manualSchedules.length}件 / 配信者 ${nextChannels.length}件`,
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

  const groupOptions = useMemo(
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
        groups={groupOptions}
        settings={settings}
        onChange={updateSettings}
        onReset={resetFilters}
        onOpenChannelSettings={() => setIsChannelSettingsOpen(true)}
        groupLabels={groups}
      />

      <CalendarView
        schedules={filteredSchedules}
        favoriteChannelIds={settings.favoriteChannelIds}
        statusFilter={settings.statusFilter}
        groupLabels={groups}
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
            <ChannelSettings
              channels={channels}
              settings={settings}
              onChange={updateSettings}
              groupLabels={groups}
            />
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default App;

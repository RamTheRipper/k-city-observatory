import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarView } from './components/CalendarView';
import { ChannelSettings } from './components/ChannelSettings';
import { FilterPanel } from './components/FilterPanel';
import { Header } from './components/Header';
import { NotificationSettings } from './components/NotificationSettings';
import type {
  ChannelItem,
  GroupItem,
  HealthDocument,
  ScheduleDocument,
  ScheduleItem,
  StatusFilter,
  UserSettings,
} from './types';
import { isWithinVisibleRange, parseDate } from './utils/date';
import { loadSettings, saveSettings } from './utils/storage';
import './App.css';

const assetPath = (fileName: string) => `${import.meta.env.BASE_URL}${fileName}`;
const fallbackGroup = 'other';
const groupDisplayOrder = [
  'vwp',
  'girls_revolution_project',
  'sinsekai_record',
  'kuusou',
  'official',
];

function getTabFromUrl(): StatusFilter {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tab === 'past' ? 'past' : 'upcoming';
}

function updateTabUrl(tab: StatusFilter): void {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  window.history.replaceState(null, '', url);
}

async function fetchJson(fileName: string): Promise<unknown> {
  const response = await fetch(assetPath(fileName), { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`${fileName} の読み込みに失敗しました (${response.status})`);
  }

  return response.json();
}

async function fetchJsonWithFallback(fileNames: string[], fallback?: unknown): Promise<unknown> {
  let lastError: unknown;

  for (const fileName of fileNames) {
    try {
      return await fetchJson(fileName);
    } catch (error) {
      lastError = error;
    }
  }

  if (arguments.length >= 2) {
    return fallback;
  }

  throw lastError instanceof Error ? lastError : new Error(`${fileNames.join(', ')} の読み込みに失敗しました`);
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
  const primaryGroupId = channel.primaryGroupId
    ? String(channel.primaryGroupId)
    : groupIds[0] || (channel.group ? String(channel.group) : fallbackGroup);
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
    group: primaryGroupId,
    groupIds,
    primaryGroupId,
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

function normalizeHealthDocument(value: unknown): HealthDocument | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<HealthDocument>;

  if (!source.apiUsage) {
    return null;
  }

  return {
    schemaVersion: source.schemaVersion,
    generatedAt: source.generatedAt,
    apiUsage: source.apiUsage,
  };
}

function getScheduleId(schedule: ScheduleItem): string {
  return schedule.videoId || extractVideoIdFromUrl(schedule.url) || schedule.id || '';
}

function extractVideoIdFromUrl(url: string | undefined): string {
  if (!url) {
    return '';
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.hostname === 'youtu.be') {
      return parsedUrl.pathname.split('/').filter(Boolean)[0] || '';
    }

    if (parsedUrl.searchParams.has('v')) {
      return parsedUrl.searchParams.get('v') || '';
    }

    return parsedUrl.pathname.match(/\/(?:shorts|live|embed)\/([^/?#]+)/)?.[1] || '';
  } catch {
    return url.match(/(?:v=|youtu\.be\/|\/live\/|\/embed\/)([a-zA-Z0-9_-]{6,})/)?.[1] || '';
  }
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

    if (!id) {
      continue;
    }

    if (!existing) {
      byId.set(id, manual);
      continue;
    }

    const hasYoutubeData =
      existing.source === 'youtube-details' || existing.source === 'youtube-search-fallback';

    byId.set(id, {
      ...manual,
      ...existing,
      id: existing.id || manual.id || id,
      videoId: existing.videoId || manual.videoId || id,
      title: hasYoutubeData ? existing.title || manual.title : manual.title || existing.title,
      channelId: existing.channelId || manual.channelId,
      channelName: existing.channelName || manual.channelName,
      group: manual.group || existing.group,
      groupIds: manual.groupIds || existing.groupIds,
      primaryGroupId: manual.primaryGroupId || manual.group || existing.primaryGroupId || existing.group,
      tags: manual.tags || existing.tags,
      category: manual.category || existing.category,
      url: existing.url || manual.url,
      thumbnailUrl: hasYoutubeData
        ? existing.thumbnailUrl || manual.thumbnailUrl
        : manual.thumbnailUrl || existing.thumbnailUrl,
      startAt: hasYoutubeData ? existing.startAt || manual.startAt : manual.startAt || existing.startAt,
      scheduledStartTime: hasYoutubeData
        ? existing.scheduledStartTime || manual.scheduledStartTime
        : manual.scheduledStartTime || existing.scheduledStartTime,
      actualStartTime: existing.actualStartTime || manual.actualStartTime,
      actualEndTime: existing.actualEndTime || manual.actualEndTime,
      publishedAt: existing.publishedAt || manual.publishedAt,
      status: hasYoutubeData ? existing.status || manual.status : manual.status || existing.status,
      source: hasYoutubeData ? existing.source : 'manual',
      startAtSource: hasYoutubeData
        ? existing.startAtSource || manual.startAtSource
        : manual.startAtSource || existing.startAtSource,
      isManual: true,
    });
  }

  return [...byId.values()];
}

function applyChannelGroupsToSchedules(
  schedules: ScheduleItem[],
  channels: ChannelItem[],
): ScheduleItem[] {
  const channelsById = new Map(channels.map((channel) => [channel.channelId, channel]));

  return schedules.map((schedule) => {
    const channel = channelsById.get(schedule.channelId);

    if (!channel) {
      return schedule;
    }

    return {
      ...schedule,
      group: channel.primaryGroupId || channel.group || schedule.group,
      groupIds: channel.groupIds?.length ? channel.groupIds : schedule.groupIds,
      primaryGroupId: channel.primaryGroupId || channel.group || schedule.primaryGroupId,
      tags: channel.tags?.length ? channel.tags : schedule.tags,
      channelThumbnailUrl: channel.thumbnailUrl || schedule.channelThumbnailUrl,
    };
  });
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '未取得';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getFreshnessWarning(health: HealthDocument | null, lastUpdatedAt: string | null): string | null {
  const lastSuccessAt = health?.apiUsage.lastSuccessAt ?? lastUpdatedAt;
  const lastError = health?.apiUsage.lastError;

  if (lastError?.message) {
    return `最新情報ではない可能性があります。前回の更新でエラーが発生しました: ${lastError.message}`;
  }

  if (!lastSuccessAt) {
    return null;
  }

  const updatedAt = new Date(lastSuccessAt);
  const ageHours = (Date.now() - updatedAt.getTime()) / 3_600_000;

  if (Number.isFinite(ageHours) && ageHours >= 8) {
    return `最新情報ではない可能性があります。最終更新: ${formatTimestamp(lastSuccessAt)}`;
  }

  return null;
}

function getSearchText(schedule: ScheduleItem, groupLabels: GroupItem[]): string {
  const groupLabel =
    groupLabels.find((group) => group.groupId === schedule.group)?.displayName ?? schedule.group ?? '';

  return [
    schedule.title,
    schedule.channelName,
    groupLabel,
    schedule.group,
    schedule.category,
    ...(schedule.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isFreeChatSchedule(schedule: ScheduleItem): boolean {
  return /\bfree\s*chat\b/i.test(schedule.title);
}

function uniqueOrderedGroups(values: string[]): string[] {
  const uniqueGroups = [...new Set(values.filter(Boolean))];
  const orderByGroup = new Map(groupDisplayOrder.map((group, index) => [group, index]));

  return uniqueGroups.sort((a, b) => {
    const orderA = orderByGroup.get(a);
    const orderB = orderByGroup.get(b);

    if (orderA !== undefined || orderB !== undefined) {
      return (orderA ?? Number.MAX_SAFE_INTEGER) - (orderB ?? Number.MAX_SAFE_INTEGER);
    }

    return a.localeCompare(b, 'ja-JP');
  });
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

function getFavoriteChannelKey(channel: ChannelItem | undefined): string | null {
  if (!channel) {
    return null;
  }

  return channel.colorKey || channel.talentId || channel.channelId;
}

function expandFavoriteChannelIds(favoriteChannelIds: string[], channels: ChannelItem[]): string[] {
  const channelsById = new Map(channels.map((channel) => [channel.channelId, channel]));
  const favoriteIds = new Set(favoriteChannelIds);
  const favoriteKeys = new Set(
    favoriteChannelIds
      .map((channelId) => getFavoriteChannelKey(channelsById.get(channelId)))
      .filter((key): key is string => Boolean(key)),
  );

  for (const channel of channels) {
    const favoriteKey = getFavoriteChannelKey(channel);

    if (favoriteKey && favoriteKeys.has(favoriteKey)) {
      favoriteIds.add(channel.channelId);
    }
  }

  return [...favoriteIds];
}

function App() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [settings, setSettings] = useState<UserSettings>(() => ({
    ...loadSettings(),
    statusFilter: getTabFromUrl(),
  }));
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthDocument | null>(null);
  const [isChannelSettingsOpen, setIsChannelSettingsOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => ('Notification' in window ? Notification.permission : 'unsupported'));

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const [scheduleData, channelData, manualScheduleData, healthData] = await Promise.all([
        fetchJsonWithFallback(['data/schedule.json', 'schedule.json']),
        fetchJsonWithFallback(['data/channels.json', 'channels.json']),
        fetchJsonWithFallback(['data/manual-schedule.json', 'manual-schedule.json'], []),
        fetchJsonWithFallback(['data/health.json'], null),
      ]);
      const scheduleDocument = normalizeScheduleDocument(scheduleData);
      const manualSchedules = normalizeManualSchedules(manualScheduleData);
      const nextChannels = normalizeChannels(channelData);
      const nextGroups = normalizeGroups(channelData);
      const nextSchedules = applyChannelGroupsToSchedules(
        applyManualSchedules(scheduleDocument.items, manualSchedules),
        nextChannels,
      );
      const nextHealth = normalizeHealthDocument(healthData);

      setSchedules(nextSchedules);
      setChannels(nextChannels);
      setGroups(nextGroups);
      setHealth(nextHealth);
      setSettings((currentSettings) => mergeSelectedChannels(currentSettings, nextChannels));
      setLastUpdatedAt(
        scheduleDocument.generatedAt ?? nextHealth?.apiUsage.lastSuccessAt ?? new Date().toISOString(),
      );

      if (!options?.silent) {
        console.info(
          `データを読み込みました: 配信 ${nextSchedules.length}件 / 手動補完 ${manualSchedules.length}件 / 配信者 ${nextChannels.length}件`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'データ読み込み中に不明なエラーが発生しました';
      console.error(message);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadData({ silent: false });
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadData]);

  useEffect(() => {
    updateTabUrl(getTabFromUrl());

    const handlePopState = () => {
      const nextTab = getTabFromUrl();
      setSettings((currentSettings) => ({ ...currentSettings, statusFilter: nextTab }));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    try {
      saveSettings(settings);
    } catch {
      window.setTimeout(() => console.error('localStorage への設定保存に失敗しました'), 0);
    }
  }, [settings]);

  const effectiveFavoriteChannelIds = useMemo(
    () => expandFavoriteChannelIds(settings.favoriteChannelIds, channels),
    [channels, settings.favoriteChannelIds],
  );

  useEffect(() => {
    if (
      (!settings.notificationBeforeStartEnabled && !settings.notificationAtStartEnabled) ||
      notificationPermission !== 'granted'
    ) {
      return;
    }

    const timerId = window.setInterval(() => {
      const now = new Date();
      const beforeNotifiedIds = new Set(settings.notifiedBeforeStartScheduleIds);
      const startNotifiedIds = new Set(settings.notifiedStartScheduleIds);
      const favoriteChannelIds = new Set(effectiveFavoriteChannelIds);
      const beforeTarget = settings.notificationBeforeStartEnabled
        ? schedules.find((schedule) => {
            const startAt = parseDate(schedule.startAt);

            if (
              !startAt ||
              beforeNotifiedIds.has(schedule.id) ||
              (settings.notificationFavoritesOnly && !favoriteChannelIds.has(schedule.channelId))
            ) {
              return false;
            }

            const minutesUntilStart = (startAt.getTime() - now.getTime()) / 60000;
            return minutesUntilStart > 0 && minutesUntilStart <= settings.notificationLeadTimeMinutes;
          })
        : undefined;
      const startTarget = settings.notificationAtStartEnabled
        ? schedules.find((schedule) => {
            const startAt = parseDate(schedule.startAt);

            if (
              !startAt ||
              startNotifiedIds.has(schedule.id) ||
              (settings.notificationFavoritesOnly && !favoriteChannelIds.has(schedule.channelId))
            ) {
              return false;
            }

            const minutesSinceStart = (now.getTime() - startAt.getTime()) / 60000;
            return minutesSinceStart >= 0 && minutesSinceStart < 1.5;
          })
        : undefined;

      if (beforeTarget) {
        new Notification('K都市観測局', {
          body: `${beforeTarget.channelName} の配信が${settings.notificationLeadTimeMinutes}分以内に始まります: ${beforeTarget.title}`,
        });

        setSettings((currentSettings) => ({
          ...currentSettings,
          notifiedScheduleIds: [
            ...new Set([...currentSettings.notifiedScheduleIds, beforeTarget.id]),
          ],
          notifiedBeforeStartScheduleIds: [
            ...new Set([...currentSettings.notifiedBeforeStartScheduleIds, beforeTarget.id]),
          ],
        }));
      }

      if (startTarget) {
        new Notification('K都市観測局', {
          body: `${startTarget.channelName} の配信開始時刻です: ${startTarget.title}`,
        });

        setSettings((currentSettings) => ({
          ...currentSettings,
          notifiedStartScheduleIds: [
            ...new Set([...currentSettings.notifiedStartScheduleIds, startTarget.id]),
          ],
        }));
      }
    }, 60_000);

    return () => window.clearInterval(timerId);
  }, [
    notificationPermission,
    schedules,
    settings.notificationAtStartEnabled,
    settings.notificationBeforeStartEnabled,
    settings.notificationFavoritesOnly,
    settings.notificationLeadTimeMinutes,
    settings.notifiedBeforeStartScheduleIds,
    settings.notifiedStartScheduleIds,
    effectiveFavoriteChannelIds,
  ]);

  const groupOptions = useMemo(
    () =>
      uniqueOrderedGroups([
        ...channels.map((channel) => channel.group || fallbackGroup),
        ...schedules.map((schedule) => schedule.group || fallbackGroup),
      ]),
    [channels, schedules],
  );

  const filteredSchedules = useMemo(() => {
    const selectedChannelIds = new Set(settings.selectedChannelIds);
    const favoriteChannelIds = new Set(effectiveFavoriteChannelIds);
    const now = new Date();
    const searchWords = settings.searchQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return schedules.filter((schedule) => {
      if (isFreeChatSchedule(schedule)) {
        return false;
      }

      const group = schedule.group || fallbackGroup;
      const scheduleGroupIds = schedule.groupIds ?? [];
      const matchesGroup =
        settings.selectedGroup === 'all' ||
        group === settings.selectedGroup ||
        scheduleGroupIds.includes(settings.selectedGroup);
      const matchesChannel =
        selectedChannelIds.size === 0 || selectedChannelIds.has(schedule.channelId);
      const matchesFavorite =
        !settings.showFavoritesOnly || favoriteChannelIds.has(schedule.channelId);
      const matchesRange = isWithinVisibleRange(schedule, settings.statusFilter, now);
      const searchableText = getSearchText(schedule, groups);
      const matchesSearch =
        searchWords.length === 0 || searchWords.every((word) => searchableText.includes(word));

      return matchesGroup && matchesChannel && matchesFavorite && matchesRange && matchesSearch;
    });
  }, [effectiveFavoriteChannelIds, groups, schedules, settings]);

  function updateSettings(nextSettings: UserSettings): void {
    if (nextSettings.statusFilter !== settings.statusFilter) {
      updateTabUrl(nextSettings.statusFilter);
    }

    setSettings(nextSettings);
  }

  function resetFilters(): void {
    setSettings((currentSettings) => ({
      ...currentSettings,
      selectedGroup: 'all',
      showFavoritesOnly: false,
      searchQuery: '',
      statusFilter: 'upcoming',
    }));
    updateTabUrl('upcoming');
  }

  async function requestNotificationPermission(): Promise<void> {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      console.error('このブラウザは通知に対応していません');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  const freshnessWarning = getFreshnessWarning(health, lastUpdatedAt);

  return (
    <main className="app">
      <Header lastUpdatedAt={lastUpdatedAt} />

      {freshnessWarning ? (
        <aside className="freshnessNotice" role="status">
          {freshnessWarning}
        </aside>
      ) : null}

      <NotificationSettings
        settings={settings}
        permission={notificationPermission}
        onChange={updateSettings}
        onRequestPermission={requestNotificationPermission}
      />

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
        favoriteChannelIds={effectiveFavoriteChannelIds}
        statusFilter={settings.statusFilter}
        groupLabels={groups}
      />

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

      <footer className="appFooter">
        <span>非公式ファンメイドビューア</span>
        <a href="https://x.com/Ram_T_R" target="_blank" rel="noreferrer">
          製作者: らむ。
        </a>
      </footer>
    </main>
  );
}

export default App;

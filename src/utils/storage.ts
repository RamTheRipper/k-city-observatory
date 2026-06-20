import type { UserSettings } from '../types';
import type { StatusFilter } from '../types';

export const SETTINGS_KEY = 'k-city-observatory:user-settings';

export const defaultSettings: UserSettings = {
  selectedGroup: 'all',
  selectedChannelIds: [],
  favoriteChannelIds: [],
  showFavoritesOnly: false,
  statusFilter: 'upcoming',
  notificationEnabled: false,
  debugEnabled: false,
  notifiedScheduleIds: [],
};

function stringArrayOrDefault(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : fallback;
}

function isStatusFilter(value: unknown): value is StatusFilter {
  return ['upcoming', 'live', 'archived', 'unknown', 'all'].includes(String(value));
}

export function normalizeSettings(value: unknown): UserSettings {
  if (!value || typeof value !== 'object') {
    return defaultSettings;
  }

  const source = value as Partial<UserSettings>;
  const statusFilter = isStatusFilter(source.statusFilter)
    ? source.statusFilter
    : defaultSettings.statusFilter;

  return {
    selectedGroup: typeof source.selectedGroup === 'string' ? source.selectedGroup : 'all',
    selectedChannelIds: stringArrayOrDefault(source.selectedChannelIds, []),
    favoriteChannelIds: stringArrayOrDefault(source.favoriteChannelIds, []),
    showFavoritesOnly: Boolean(source.showFavoritesOnly),
    statusFilter,
    notificationEnabled: Boolean(source.notificationEnabled),
    debugEnabled: Boolean(source.debugEnabled),
    notifiedScheduleIds: stringArrayOrDefault(source.notifiedScheduleIds, []),
  };
}

export function loadSettings(): UserSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);

    if (!raw) {
      return defaultSettings;
    }

    return normalizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: UserSettings): void {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export type ScheduleStatus = 'upcoming' | 'live' | 'archived' | 'unknown';
export type StatusFilter = ScheduleStatus | 'all';
export type LogLevel = 'error' | 'info' | 'debug';

export type ScheduleItem = {
  id: string;
  title: string;
  channelId: string;
  channelName: string;
  startAt: string;
  endAt?: string | null;
  url?: string;
  thumbnailUrl?: string;
  group?: string;
  tags?: string[];
  category?: string;
  status: ScheduleStatus;
  isManual?: boolean;
};

export type ChannelItem = {
  channelId: string;
  name: string;
  displayName?: string;
  group?: string;
  tags?: string[];
  category?: string;
  thumbnailUrl?: string;
  enabled?: boolean;
};

export type UserSettings = {
  selectedGroup: string;
  selectedChannelIds: string[];
  favoriteChannelIds: string[];
  showFavoritesOnly: boolean;
  statusFilter: StatusFilter;
  notificationEnabled: boolean;
  debugEnabled: boolean;
  notifiedScheduleIds: string[];
};

export type LogEntry = {
  id: string;
  level: LogLevel;
  message: string;
  createdAt: string;
};

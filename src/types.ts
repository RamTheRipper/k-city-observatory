export type ScheduleStatus = 'upcoming' | 'live' | 'ended' | 'archived' | 'unknown';
export type StatusFilter = ScheduleStatus | 'all';
export type LogLevel = 'error' | 'info' | 'debug';

export type ScheduleItem = {
  id: string;
  videoId?: string;
  title: string;
  channelId: string;
  channelName: string;
  startAt: string;
  endAt?: string | null;
  url?: string;
  thumbnailUrl?: string;
  group?: string;
  groupIds?: string[];
  tags?: string[];
  category?: string;
  status: ScheduleStatus;
  scheduledStartTime?: string | null;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  publishedAt?: string | null;
  source?: 'youtube-details' | 'youtube-search-fallback' | 'manual';
  startAtSource?: string;
  isManual?: boolean;
};

export type GroupItem = {
  groupId: string;
  displayName: string;
  description?: string;
};

export type ScheduleDocument = {
  schemaVersion?: number;
  generatedAt?: string;
  items: ScheduleItem[];
};

export type ApiUsage = {
  searchListCalls: number;
  videosListCalls: number;
  channelsListCalls: number;
  playlistItemsListCalls: number;
  estimatedUnits: number;
  lastSuccessAt: string | null;
  lastError: {
    message: string;
    status?: number | null;
    scope?: string;
    reason?: string;
    occurredAt?: string;
  } | null;
  fetchedScope: 'upcoming' | 'status' | 'history' | 'manual' | 'unknown' | string;
};

export type HealthDocument = {
  schemaVersion?: number;
  generatedAt?: string;
  apiUsage: ApiUsage;
};

export type ChannelItem = {
  channelId: string;
  youtubeChannelId?: string;
  name: string;
  displayName?: string;
  channelName?: string;
  group?: string;
  groupIds?: string[];
  tags?: string[];
  category?: string;
  thumbnailUrl?: string;
  talentId?: string;
  colorKey?: string;
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
  knownChannelIds: string[];
};

export type LogEntry = {
  id: string;
  level: LogLevel;
  message: string;
  createdAt: string;
};

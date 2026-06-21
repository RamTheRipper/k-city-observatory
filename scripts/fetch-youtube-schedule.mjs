import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');
const dataDir = path.join(publicDir, 'data');
const dataChannelsPath = path.join(dataDir, 'channels.json');
const dataSchedulePath = path.join(dataDir, 'schedule.json');
const dataHealthPath = path.join(dataDir, 'health.json');
const dataManualSchedulePath = path.join(dataDir, 'manual-schedule.json');
const legacyChannelsPath = path.join(publicDir, 'channels.json');
const legacySchedulePath = path.join(publicDir, 'schedule.json');
const legacyManualSchedulePath = path.join(publicDir, 'manual-schedule.json');
const youtubeApiBase = 'https://www.googleapis.com/youtube/v3';
const maxSearchResults = 5;
const maxVideosListIds = 50;
const maxPlaylistItemsResults = 50;
const historyDays = 31;

const quotaUnits = {
  searchList: 100,
  videosList: 1,
  channelsList: 1,
  playlistItemsList: 1,
};

class YouTubeApiError extends Error {
  constructor(message, statusCode, endpoint) {
    super(message);
    this.name = 'YouTubeApiError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.isQuotaExceeded = /quota|quotaExceeded/i.test(message);
  }
}

function getScope() {
  const arg = process.argv.find((value) => value.startsWith('--scope='));
  const scope = arg?.split('=')[1] || process.env.FETCH_SCOPE || 'upcoming';

  if (!['upcoming', 'status', 'history'].includes(scope)) {
    throw new Error(`Unknown FETCH_SCOPE: ${scope}`);
  }

  return scope;
}

function createCounters(scope) {
  return {
    fetchedScope: scope,
    searchListCalls: 0,
    videosListCalls: 0,
    channelsListCalls: 0,
    playlistItemsListCalls: 0,
  };
}

function estimateUnits(counters) {
  return (
    counters.searchListCalls * quotaUnits.searchList +
    counters.videosListCalls * quotaUnits.videosList +
    counters.channelsListCalls * quotaUnits.channelsList +
    counters.playlistItemsListCalls * quotaUnits.playlistItemsList
  );
}

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

async function loadEnvLocal() {
  const envPath = path.join(rootDir, '.env.local');

  if (!existsSync(envPath)) {
    return;
  }

  const content = await readFile(envPath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function readJson(filePath, fallback) {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

async function readFirstJson(filePaths, fallback) {
  for (const filePath of filePaths) {
    if (existsSync(filePath)) {
      return readJson(filePath, fallback);
    }
  }

  return fallback;
}

async function writeJson(filePath, value) {
  await ensureDataDir();
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractChannels(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object' && Array.isArray(value.channels)) {
    return value.channels;
  }

  return [];
}

function getScheduleItems(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object' && Array.isArray(value.items)) {
    return value.items;
  }

  return [];
}

function extractVideoIdFromUrl(url) {
  if (!url || typeof url !== 'string') {
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

    const shortsMatch = parsedUrl.pathname.match(/\/(?:shorts|live|embed)\/([^/?#]+)/);
    return shortsMatch?.[1] || '';
  } catch {
    const match = url.match(/(?:v=|youtu\.be\/|\/live\/|\/embed\/)([a-zA-Z0-9_-]{6,})/);
    return match?.[1] || '';
  }
}

function getVideoId(item) {
  return item?.videoId || extractVideoIdFromUrl(item?.url) || item?.id || '';
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeChannel(channel) {
  const groupIds = asArray(channel.groupIds).map(String);
  const primaryGroupId = channel.primaryGroupId
    ? String(channel.primaryGroupId)
    : groupIds[0] || (channel.group ? String(channel.group) : 'other');
  const youtubeChannelId = String(channel.youtubeChannelId || channel.channelId || '');

  return {
    talentId: channel.talentId ? String(channel.talentId) : undefined,
    youtubeChannelId,
    channelId: youtubeChannelId,
    name: String(channel.name || channel.displayName || channel.channelName || youtubeChannelId),
    displayName: channel.displayName ? String(channel.displayName) : undefined,
    channelName: channel.channelName ? String(channel.channelName) : undefined,
    group: primaryGroupId,
    groupIds,
    primaryGroupId,
    tags: asArray(channel.tags).map(String),
    category: channel.category ? String(channel.category) : undefined,
    thumbnailUrl: channel.thumbnailUrl ? String(channel.thumbnailUrl) : '',
    colorKey: channel.colorKey ? String(channel.colorKey) : undefined,
    uploadsPlaylistId: channel.uploadsPlaylistId ? String(channel.uploadsPlaylistId) : undefined,
    enabled: channel.enabled !== false,
  };
}

function getChannelLabel(channel) {
  return channel.displayName || channel.channelName || channel.name || channel.youtubeChannelId;
}

function getSkipReason(channel) {
  if (!channel.enabled) {
    return 'disabled';
  }

  if (isPlaceholderChannelId(channel.youtubeChannelId)) {
    return 'placeholder-or-missing-channel-id';
  }

  return '';
}

function getGroupCounts(channels) {
  return channels.reduce((counts, channel) => {
    const group = channel.primaryGroupId || channel.group || channel.groupIds?.[0] || 'other';
    counts[group] = (counts[group] || 0) + 1;
    return counts;
  }, {});
}

function getScheduleChannelName(channel, snippet = {}) {
  return (
    channel.channelName ||
    channel.displayName ||
    channel.name ||
    snippet.channelTitle ||
    channel.channelId
  );
}

function isPlaceholderChannelId(channelId) {
  return !channelId || channelId.includes('REPLACE_WITH_REAL') || channelId.endsWith('-sample');
}

function getBestThumbnail(thumbnails = {}) {
  return (
    thumbnails.maxres?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    ''
  );
}

function getFallbackThumbnail(videoId, thumbnails = {}, existingThumbnailUrl = '') {
  return (
    getBestThumbnail(thumbnails) ||
    existingThumbnailUrl ||
    (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '')
  );
}

function normalizeStatus(eventType, liveStreamingDetails = {}) {
  if (liveStreamingDetails.actualEndTime || eventType === 'ended' || eventType === 'completed') {
    return 'ended';
  }

  if (liveStreamingDetails.actualStartTime || eventType === 'live') {
    return 'live';
  }

  if (liveStreamingDetails.scheduledStartTime || eventType === 'upcoming') {
    return 'upcoming';
  }

  return 'unknown';
}

function getStartInfo(snippet = {}, liveStreamingDetails = {}) {
  const candidates = [
    ['scheduledStartTime', liveStreamingDetails.scheduledStartTime],
    ['actualStartTime', liveStreamingDetails.actualStartTime],
    ['actualEndTime', liveStreamingDetails.actualEndTime],
    ['publishedAt', snippet.publishedAt],
  ];

  for (const [source, value] of candidates) {
    const isoString = toIsoString(value);

    if (isoString) {
      return { startAt: isoString, source };
    }
  }

  return { startAt: new Date().toISOString(), source: 'fallback-now' };
}

function mapDetailToSchedule(video, channel, eventType = 'unknown') {
  const snippet = video.snippet || {};
  const liveStreamingDetails = video.liveStreamingDetails || {};
  const videoId = video.id;
  const resolvedChannel =
    channel || {
      youtubeChannelId: snippet.channelId || '',
      channelId: snippet.channelId || '',
      name: snippet.channelTitle || snippet.channelId || 'unknown',
      channelName: snippet.channelTitle || snippet.channelId || 'unknown',
      group: 'other',
      groupIds: ['other'],
      primaryGroupId: 'other',
      tags: [],
      category: '',
    };
  const { startAt, source } = getStartInfo(snippet, liveStreamingDetails);
  const scheduledStartTime = toIsoString(liveStreamingDetails.scheduledStartTime);
  const actualStartTime = toIsoString(liveStreamingDetails.actualStartTime);
  const actualEndTime = toIsoString(liveStreamingDetails.actualEndTime);
  const publishedAt = toIsoString(snippet.publishedAt);

  return {
    id: videoId,
    videoId,
    title: snippet.title || 'Untitled',
    channelId: resolvedChannel.youtubeChannelId,
    channelName: getScheduleChannelName(resolvedChannel, snippet),
    startAt,
    endAt: actualEndTime,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: getFallbackThumbnail(videoId, snippet.thumbnails),
    group: resolvedChannel.group,
    groupIds: resolvedChannel.groupIds,
    primaryGroupId: resolvedChannel.primaryGroupId || resolvedChannel.group,
    tags: resolvedChannel.tags,
    category: resolvedChannel.category || '',
    status:
      eventType === 'upcoming' && source === 'publishedAt'
        ? 'unknown'
        : normalizeStatus(eventType, liveStreamingDetails),
    scheduledStartTime,
    actualStartTime,
    actualEndTime,
    publishedAt,
    source: 'youtube-details',
    startAtSource: source,
    isManual: false,
  };
}

function mapSearchToSchedule(result, existingById) {
  const snippet = result.snippet || {};
  const channel = result.channel;
  const videoId = result.videoId;
  const publishedAt = toIsoString(snippet.publishedAt);
  const existing = existingById.get(videoId);
  const existingScheduledStartTime = toIsoString(existing?.scheduledStartTime);
  const existingActualStartTime = toIsoString(existing?.actualStartTime);
  const existingActualEndTime = toIsoString(existing?.actualEndTime);
  const fallbackGeneratedAt = new Date().toISOString();
  const startAt =
    existingScheduledStartTime ||
    (result.eventType === 'live' ? existingActualStartTime : null) ||
    publishedAt ||
    fallbackGeneratedAt;
  const startAtSource = existingScheduledStartTime
    ? 'existing-scheduledStartTime'
    : result.eventType === 'live' && existingActualStartTime
      ? 'existing-actualStartTime'
      : publishedAt
        ? 'publishedAt'
        : 'fallback-now';

  return {
    id: videoId,
    videoId,
    title: snippet.title || existing?.title || 'Untitled',
    channelId: channel.youtubeChannelId,
    channelName: getScheduleChannelName(channel, snippet),
    startAt,
    endAt: existingActualEndTime,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: getFallbackThumbnail(videoId, snippet.thumbnails, existing?.thumbnailUrl),
    group: channel.group,
    groupIds: channel.groupIds,
    primaryGroupId: channel.primaryGroupId || channel.group,
    tags: channel.tags,
    category: channel.category || '',
    status:
      result.eventType === 'live'
        ? 'live'
        : result.eventType === 'upcoming' && !existingScheduledStartTime
          ? 'unknown'
          : 'upcoming',
    scheduledStartTime: existingScheduledStartTime,
    actualStartTime: existingActualStartTime,
    actualEndTime: existingActualEndTime,
    publishedAt,
    source: 'youtube-search-fallback',
    startAtSource,
    isManual: false,
  };
}

function normalizeManualSchedule(item) {
  const videoId = getVideoId(item);
  const scheduledStartTime = toIsoString(item.scheduledStartTime);
  const startAt = scheduledStartTime || toIsoString(item.startAt) || null;

  if (!videoId || !startAt) {
    return null;
  }

  return {
    ...item,
    id: item.id || videoId,
    videoId,
    startAt,
    scheduledStartTime,
    actualStartTime: toIsoString(item.actualStartTime),
    actualEndTime: toIsoString(item.actualEndTime),
    publishedAt: toIsoString(item.publishedAt),
    url: item.url || `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl:
      item.thumbnailUrl || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
    primaryGroupId: item.primaryGroupId || item.group || asArray(item.groupIds)[0],
    status: item.status || 'upcoming',
    source: 'manual',
    startAtSource: scheduledStartTime ? 'manual-scheduledStartTime' : 'manual-startAt',
    isManual: true,
  };
}

function dedupeSchedules(items) {
  const byId = new Map();

  for (const item of items) {
    const videoId = getVideoId(item);

    if (videoId && !byId.has(videoId)) {
      byId.set(videoId, item);
    }
  }

  return [...byId.values()].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
}

function applyManualSchedules(schedules, manualSchedules) {
  const byId = new Map(schedules.map((item) => [getVideoId(item), item]));
  let mergedCount = 0;
  let addedCount = 0;
  let youtubeSyncedCount = 0;
  let preservedManualCount = 0;
  let updatedStartTimeCount = 0;

  for (const manual of manualSchedules) {
    const videoId = getVideoId(manual);
    const existing = byId.get(videoId);

    if (existing) {
      const hasYoutubeData =
        existing.source === 'youtube-details' || existing.source === 'youtube-search-fallback';
      const previousStartAt = manual.scheduledStartTime || manual.startAt;
      const nextStartAt =
        existing.scheduledStartTime || existing.startAt || manual.scheduledStartTime || manual.startAt;

      if (hasYoutubeData) {
        youtubeSyncedCount += 1;
      } else {
        preservedManualCount += 1;
      }

      if (previousStartAt && nextStartAt && previousStartAt !== nextStartAt) {
        updatedStartTimeCount += 1;
        console.log(
          `[manual] Updated start time from YouTube: videoId=${videoId} old=${previousStartAt} new=${nextStartAt}.`,
        );
      }

      byId.set(videoId, {
        ...manual,
        ...existing,
        id: existing.id || manual.id || videoId,
        videoId,
        title: hasYoutubeData ? existing.title || manual.title : manual.title || existing.title,
        channelId: existing.channelId || manual.channelId,
        channelName: existing.channelName || manual.channelName,
        group: manual.group || existing.group,
        groupIds: manual.groupIds || existing.groupIds,
        primaryGroupId:
          manual.primaryGroupId ||
          manual.group ||
          existing.primaryGroupId ||
          existing.group,
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
      mergedCount += 1;
    } else {
      console.warn(`[manual] Keeping manual schedule without YouTube details: videoId=${videoId}.`);
      byId.set(videoId, manual);
      addedCount += 1;
    }
  }

  console.log(
    `[manual] Applied manual schedules: merged=${mergedCount}, added=${addedCount}, youtubeSynced=${youtubeSyncedCount}, preservedManual=${preservedManualCount}, updatedStartTimes=${updatedStartTimeCount}.`,
  );
  return [...byId.values()];
}

function filterRecentHistory(items, now = new Date()) {
  const archiveStart = new Date(now);
  archiveStart.setDate(archiveStart.getDate() - historyDays);

  return items.filter((item) => {
    if (item.status !== 'ended') {
      return true;
    }

    const date = new Date(
      item.actualEndTime ||
        item.actualStartTime ||
        item.publishedAt ||
        item.startAt,
    );
    return !Number.isNaN(date.getTime()) && date >= archiveStart;
  });
}

function getEffectiveScheduleStatus(item, now = new Date()) {
  if (item.status === 'live') {
    return 'live';
  }

  if (item.actualStartTime && !item.actualEndTime) {
    return 'live';
  }

  const startAt = new Date(item.startAt);

  if (Number.isNaN(startAt.getTime())) {
    return item.status || 'unknown';
  }

  if (startAt.getTime() > now.getTime()) {
    return 'upcoming';
  }

  return 'ended';
}

function normalizeScheduleStatuses(items, now = new Date()) {
  return items.map((item) => ({
    ...item,
    status: getEffectiveScheduleStatus(item, now),
  }));
}

async function youtubeGet(endpoint, params, apiKey, counters) {
  const url = new URL(`${youtubeApiBase}/${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set('key', apiKey);

  if (endpoint === 'search') counters.searchListCalls += 1;
  if (endpoint === 'videos') counters.videosListCalls += 1;
  if (endpoint === 'channels') counters.channelsListCalls += 1;
  if (endpoint === 'playlistItems') counters.playlistItemsListCalls += 1;

  const response = await fetch(url);
  const body = await response.text();
  const data = body ? JSON.parse(body) : {};

  if (!response.ok) {
    const message = data?.error?.message || `${endpoint} failed with ${response.status}`;
    throw new YouTubeApiError(message, response.status, endpoint);
  }

  return data;
}

async function fetchUpcomingSearch(channel, apiKey, counters) {
  const data = await youtubeGet(
    'search',
    {
      part: 'snippet',
      channelId: channel.youtubeChannelId,
      type: 'video',
      eventType: 'upcoming',
      order: 'date',
      maxResults: maxSearchResults,
    },
    apiKey,
    counters,
  );

  const results = (data.items || [])
    .map((item) => ({
      videoId: item.id?.videoId,
      snippet: item.snippet || {},
      channel,
      eventType: 'upcoming',
    }))
    .filter((item) => item.videoId);

  console.log(`[youtube] ${getChannelLabel(channel)} upcoming search=${results.length}.`);
  return results;
}

async function fetchVideoDetails(videoIds, apiKey, counters) {
  const uniqueIds = [...new Set(videoIds)].filter(Boolean);

  if (uniqueIds.length === 0) {
    return [];
  }

  const output = [];

  for (let index = 0; index < uniqueIds.length; index += maxVideosListIds) {
    const chunk = uniqueIds.slice(index, index + maxVideosListIds);
    const data = await youtubeGet(
      'videos',
      {
        part: 'snippet,liveStreamingDetails,status',
        id: chunk.join(','),
        maxResults: maxVideosListIds,
      },
      apiKey,
      counters,
    );

    const items = data.items || [];
    console.log(`[youtube] videos.list requested=${chunk.length}, enriched=${items.length}.`);
    output.push(...items);
  }

  return output;
}

async function fetchUploadsPlaylistId(channel, apiKey, counters) {
  if (channel.uploadsPlaylistId) {
    return channel.uploadsPlaylistId;
  }

  const data = await youtubeGet(
    'channels',
    {
      part: 'contentDetails',
      id: channel.youtubeChannelId,
      maxResults: 1,
    },
    apiKey,
    counters,
  );

  return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || '';
}

async function fetchRecentUploadVideoIds(channel, apiKey, counters) {
  const uploadsPlaylistId = await fetchUploadsPlaylistId(channel, apiKey, counters);

  if (!uploadsPlaylistId) {
    console.warn(`[history] uploadsPlaylistId not found: ${getChannelLabel(channel)}`);
    return [];
  }

  const data = await youtubeGet(
    'playlistItems',
    {
      part: 'snippet,contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: maxPlaylistItemsResults,
    },
    apiKey,
    counters,
  );

  const videoIds = (data.items || [])
    .map((item) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId)
    .filter(Boolean);
  console.log(`[history] ${getChannelLabel(channel)} uploads=${videoIds.length}.`);
  return videoIds.map((videoId) => ({ videoId, channel }));
}

async function writeSchedule(output) {
  const normalizedOutput = normalizeScheduleStatuses(output);
  const document = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    items: normalizedOutput,
  };

  console.log(`[schedule] Writing ${normalizedOutput.length} schedules to ${dataSchedulePath}.`);
  await writeJson(dataSchedulePath, document);
}

async function writeHealth(counters, { success, error = null, diagnostics = {} }) {
  const previousHealth = await readJson(dataHealthPath, null);
  const previousLastSuccessAt = previousHealth?.apiUsage?.lastSuccessAt || null;
  const now = new Date().toISOString();
  const health = {
    schemaVersion: 1,
    generatedAt: now,
    apiUsage: {
      searchListCalls: counters.searchListCalls,
      videosListCalls: counters.videosListCalls,
      channelsListCalls: counters.channelsListCalls,
      playlistItemsListCalls: counters.playlistItemsListCalls,
      estimatedUnits: estimateUnits(counters),
      lastSuccessAt: success ? now : previousLastSuccessAt,
      lastError: error,
      fetchedScope: counters.fetchedScope,
      loadedChannels: diagnostics.loadedChannels ?? 0,
      enabledChannels: diagnostics.enabledChannels ?? 0,
      fetchTargets: diagnostics.fetchTargets ?? 0,
      skippedChannels: diagnostics.skippedChannels ?? [],
      groupCounts: diagnostics.groupCounts ?? {},
    },
  };

  console.log(`[health] Writing health to ${dataHealthPath}.`);
  await writeJson(dataHealthPath, health);
}

function getErrorInfo(error) {
  const message = error instanceof Error ? error.message : String(error);

  return {
    message,
    quotaExceeded: isQuotaExceeded(error),
    statusCode: error instanceof YouTubeApiError ? error.statusCode : undefined,
    endpoint: error instanceof YouTubeApiError ? error.endpoint : undefined,
  };
}

function isQuotaExceeded(error) {
  if (error instanceof YouTubeApiError) {
    return error.isQuotaExceeded;
  }

  if (error instanceof Error) {
    return /quota|quotaExceeded/i.test(error.message) || isQuotaExceeded(error.cause);
  }

  return false;
}

async function loadManualSchedules() {
  const manualData = await readFirstJson([dataManualSchedulePath, legacyManualSchedulePath], []);
  const manualSchedules = asArray(manualData).map(normalizeManualSchedule).filter(Boolean);
  console.log(`[manual] Loaded ${manualSchedules.length} manual schedules.`);
  return manualSchedules;
}

async function loadInputs() {
  const channelsData = await readFirstJson(
    [legacyChannelsPath, dataChannelsPath],
    { channels: [] },
  );
  const scheduleData = await readFirstJson(
    [dataSchedulePath, legacySchedulePath],
    { items: [] },
  );
  const channels = extractChannels(channelsData).map(normalizeChannel);
  const skippedChannels = [];
  const enabledChannels = channels.filter((channel) => {
    const reason = getSkipReason(channel);

    const groupIds = (channel.groupIds || []).join(',');
    const primaryGroup = channel.primaryGroupId || channel.group;
    const channelId = channel.youtubeChannelId || '(none)';

    console.log(
      `[channels] ${getChannelLabel(channel)} channelId=${channelId} enabled=${channel.enabled} primaryGroup=${primaryGroup} groupIds=${groupIds}`,
    );

    if (reason) {
      console.warn(`[channels] Skip ${getChannelLabel(channel)}: ${reason}.`);
      skippedChannels.push({
        channelId: channel.youtubeChannelId,
        channelName: getChannelLabel(channel),
        reason,
        enabled: channel.enabled,
        groupIds: channel.groupIds || [],
      });
      return false;
    }

    return true;
  });
  const existingItems = getScheduleItems(scheduleData);
  const diagnostics = {
    loadedChannels: channels.length,
    enabledChannels: channels.filter((channel) => channel.enabled).length,
    fetchTargets: enabledChannels.length,
    skippedChannels,
    groupCounts: getGroupCounts(enabledChannels),
  };

  console.log(`[channels] Loaded channels: ${channels.length}.`);
  console.log(`[channels] Enabled channels: ${diagnostics.enabledChannels}.`);
  console.log(`[channels] Fetch targets: ${diagnostics.fetchTargets}.`);
  console.log(`[channels] Skipped channels: ${skippedChannels.length}.`);
  console.log(`[channels] Group counts: ${JSON.stringify(diagnostics.groupCounts)}.`);
  console.log(`[schedule] Existing items: ${existingItems.length}.`);

  return { channelsData, channels, enabledChannels, existingItems, diagnostics };
}

function applyChannelMetadata(items, channels) {
  const channelsById = new Map(channels.map((channel) => [channel.youtubeChannelId, channel]));

  return items.map((item) => {
    const channel = channelsById.get(item.channelId);

    if (!channel) {
      return item;
    }

    return {
      ...item,
      group: channel.primaryGroupId || channel.group,
      groupIds: channel.groupIds,
      primaryGroupId: channel.primaryGroupId || channel.group,
      tags: channel.tags,
      category: channel.category || item.category,
    };
  });
}

function mergeSchedules(existingItems, nextItems, manualSchedules, channels) {
  const merged = new Map(existingItems.map((item) => [getVideoId(item), item]));

  for (const item of nextItems) {
    merged.set(getVideoId(item), item);
  }

  return dedupeSchedules(
    filterRecentHistory(
      applyChannelMetadata(
        applyManualSchedules([...merged.values()], manualSchedules),
        channels,
      ),
    ),
  );
}

async function runUpcoming({ enabledChannels, existingItems, apiKey, counters }) {
  const existingById = new Map(existingItems.map((item) => [getVideoId(item), item]));
  const searchResults = [];

  for (const channel of enabledChannels) {
    searchResults.push(...(await fetchUpcomingSearch(channel, apiKey, counters)));
  }

  console.log(`[youtube] upcoming search collected ${searchResults.length} results.`);

  let detailItems = [];

  try {
    detailItems = await fetchVideoDetails(
      searchResults.map((result) => result.videoId),
      apiKey,
      counters,
    );
  } catch (error) {
    if (!isQuotaExceeded(error)) {
      throw error;
    }

    console.warn(
      '[quota] videos.list quota exceeded during upcoming. Falling back to search.list results.',
    );
  }

  const detailById = new Map(detailItems.map((item) => [item.id, item]));

  return searchResults.map((result) => {
    const detail = detailById.get(result.videoId);
    return detail ? mapDetailToSchedule(detail, result.channel, 'upcoming') : mapSearchToSchedule(result, existingById);
  });
}

async function runStatus({ enabledChannels, existingItems, manualSchedules, apiKey, counters }) {
  const channelById = new Map(
    enabledChannels.map((channel) => [channel.youtubeChannelId, channel]),
  );
  const targetItemsById = new Map();

  for (const item of [...existingItems, ...manualSchedules]) {
    const videoId = getVideoId(item);

    if (!videoId) {
      continue;
    }

    if (
      item.isManual ||
      item.source === 'manual' ||
      ['upcoming', 'live', 'unknown'].includes(item.status)
    ) {
      targetItemsById.set(videoId, { ...item, videoId });
    }
  }

  const targetItems = [...targetItemsById.values()];
  const manualTargetCount = targetItems.filter(
    (item) => item.isManual || item.source === 'manual',
  ).length;

  console.log(`[status] Target schedules for videos.list: ${targetItems.length}.`);
  console.log(`[manual] Manual schedules targeted for YouTube sync: ${manualTargetCount}.`);

  const details = await fetchVideoDetails(
    targetItems.map((item) => getVideoId(item)),
    apiKey,
    counters,
  );

  return details.map((detail) => {
    const existing = targetItems.find((item) => getVideoId(item) === detail.id);
    const channel = channelById.get(existing?.channelId) || {
      youtubeChannelId: existing?.channelId || detail.snippet?.channelId,
      channelId: existing?.channelId || detail.snippet?.channelId,
      name: detail.snippet?.channelTitle || existing?.channelName || 'unknown',
      channelName: existing?.channelName || detail.snippet?.channelTitle,
      group: existing?.group || 'other',
      groupIds: existing?.groupIds || [],
      primaryGroupId: existing?.primaryGroupId || existing?.group || 'other',
      tags: existing?.tags || [],
      category: existing?.category || '',
    };

    return mapDetailToSchedule(detail, channel, existing?.status || 'unknown');
  });
}

async function runHistory({ enabledChannels, apiKey, counters }) {
  const uploadEntries = [];

  for (const channel of enabledChannels) {
    uploadEntries.push(...(await fetchRecentUploadVideoIds(channel, apiKey, counters)));
  }

  const channelByVideoId = new Map(uploadEntries.map((entry) => [entry.videoId, entry.channel]));
  const details = await fetchVideoDetails(
    uploadEntries.map((entry) => entry.videoId),
    apiKey,
    counters,
  );
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - historyDays);

  return details
    .map((detail) => mapDetailToSchedule(detail, channelByVideoId.get(detail.id), 'unknown'))
    .filter((item) => {
      const isArchiveLike = item.actualStartTime || item.actualEndTime;
      const date = new Date(
        item.actualEndTime ||
          item.actualStartTime ||
          item.publishedAt ||
          item.startAt,
      );
      return (
        isArchiveLike &&
        !Number.isNaN(date.getTime()) &&
        date >= cutoff &&
        date <= new Date()
      );
    });
}

async function main() {
  await loadEnvLocal();
  await ensureDataDir();

  const scope = getScope();
  const counters = createCounters(scope);
  const apiKey = process.env.YOUTUBE_API_KEY;
  const {
    channelsData,
    channels,
    enabledChannels,
    existingItems,
    diagnostics,
  } = await loadInputs();
  const manualSchedules = await loadManualSchedules();

  await writeJson(dataChannelsPath, channelsData);

  if (!apiKey) {
    const error = { message: 'YOUTUBE_API_KEY is not set', quotaExceeded: false };
    console.warn('[youtube] YOUTUBE_API_KEY is not set. Keeping existing schedule.');
    await writeHealth(counters, { success: false, error, diagnostics });
    return;
  }

  try {
    let fetchedItems = [];

    if (scope === 'upcoming') {
      fetchedItems = await runUpcoming({ enabledChannels, existingItems, apiKey, counters });
    } else if (scope === 'status') {
      fetchedItems = await runStatus({
        enabledChannels,
        existingItems,
        manualSchedules,
        apiKey,
        counters,
      });
    } else if (scope === 'history') {
      fetchedItems = await runHistory({ enabledChannels, apiKey, counters });
    }

    const output = mergeSchedules(existingItems, fetchedItems, manualSchedules, channels);
    await writeSchedule(output);
    await writeHealth(counters, { success: true, diagnostics });
    console.log(
      `[quota] apiUsage=${JSON.stringify({
        ...counters,
        estimatedUnits: estimateUnits(counters),
      })}`,
    );
  } catch (error) {
    const errorInfo = getErrorInfo(error);

    if (errorInfo.quotaExceeded) {
      console.error(`[quota] Quota exceeded during ${scope}. Keeping existing schedule.`);
    }

    console.error(
      `[youtube] Failed to fetch ${scope}. Keeping existing schedule. ${errorInfo.message}`,
    );
    await writeHealth(counters, { success: false, error: errorInfo, diagnostics });
  }
}

main();

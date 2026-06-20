import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');
const channelsPath = path.join(publicDir, 'channels.json');
const schedulePath = path.join(publicDir, 'schedule.json');
const manualSchedulePath = path.join(publicDir, 'manual-schedule.json');
const youtubeApiBase = 'https://www.googleapis.com/youtube/v3';
const defaultEventTypes = ['upcoming', 'live'];
const completedEventType = 'completed';
const maxSearchResults = 10;
const maxVideosListIds = 50;

class YouTubeApiError extends Error {
  constructor(message, statusCode, endpoint) {
    super(message);
    this.name = 'YouTubeApiError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.isQuotaExceeded = /quota/i.test(message);
  }
}

function shouldIncludeCompleted() {
  return (
    process.argv.includes('--include-completed') ||
    process.env.INCLUDE_COMPLETED === 'true' ||
    process.env.FETCH_COMPLETED === 'true'
  );
}

function getEventTypes() {
  return shouldIncludeCompleted() ? [...defaultEventTypes, completedEventType] : defaultEventTypes;
}

function createEventStats(eventTypes) {
  return Object.fromEntries(
    eventTypes.map((eventType) => [
      eventType,
      {
        searchResults: 0,
        detailResults: 0,
        withLiveStreamingDetails: 0,
        convertedSchedules: 0,
        convertedFromSearchFallback: 0,
        missingDetails: 0,
        missingLiveStreamingDetails: 0,
        missingDate: 0,
      },
    ]),
  );
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

function normalizeChannel(channel) {
  const groupIds = asArray(channel.groupIds).map(String);
  const youtubeChannelId = String(channel.youtubeChannelId || channel.channelId || '');

  return {
    talentId: channel.talentId ? String(channel.talentId) : undefined,
    youtubeChannelId,
    channelId: youtubeChannelId,
    name: String(channel.name || channel.displayName || channel.channelName || youtubeChannelId),
    displayName: channel.displayName ? String(channel.displayName) : undefined,
    channelName: channel.channelName ? String(channel.channelName) : undefined,
    group: groupIds[0] || (channel.group ? String(channel.group) : 'other'),
    groupIds,
    tags: asArray(channel.tags).map(String),
    category: channel.category ? String(channel.category) : undefined,
    thumbnailUrl: channel.thumbnailUrl ? String(channel.thumbnailUrl) : '',
    colorKey: channel.colorKey ? String(channel.colorKey) : undefined,
    enabled: channel.enabled !== false,
  };
}

function getChannelLabel(channel) {
  return channel.displayName || channel.channelName || channel.name || channel.youtubeChannelId;
}

function getScheduleChannelName(channel, snippet = {}) {
  return channel.channelName || channel.displayName || channel.name || snippet.channelTitle || channel.channelId;
}

function isPlaceholderChannelId(channelId) {
  return !channelId || channelId.includes('REPLACE_WITH_REAL') || channelId.endsWith('-sample');
}

function getBestThumbnail(thumbnails = {}) {
  return thumbnails.maxres?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || '';
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeStatus(eventType, liveStreamingDetails = {}) {
  if (liveStreamingDetails.actualEndTime || eventType === 'completed') {
    return 'archived';
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

function getExistingScheduleItems(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object' && Array.isArray(value.items)) {
    return value.items;
  }

  return [];
}

function getVideoId(item) {
  return item?.videoId || item?.id || '';
}

function getFallbackThumbnail(videoId, thumbnails = {}, existingThumbnailUrl = '') {
  return (
    getBestThumbnail(thumbnails) ||
    existingThumbnailUrl ||
    (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '')
  );
}

function mapScheduleItemFromDetail(video, channel, eventType) {
  const snippet = video.snippet || {};
  const liveStreamingDetails = video.liveStreamingDetails || {};
  const videoId = video.id;
  const { startAt, source } = getStartInfo(snippet, liveStreamingDetails);
  const status =
    eventType === 'upcoming' && source === 'publishedAt'
      ? 'unknown'
      : normalizeStatus(eventType, liveStreamingDetails);

  return {
    item: {
      id: videoId,
      videoId,
      title: snippet.title || 'Untitled',
      channelId: channel.youtubeChannelId,
      channelName: getScheduleChannelName(channel, snippet),
      startAt,
      endAt: toIsoString(liveStreamingDetails.actualEndTime),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: getFallbackThumbnail(videoId, snippet.thumbnails),
      group: channel.group,
      groupIds: channel.groupIds,
      tags: channel.tags,
      category: channel.category || '',
      status,
      scheduledStartTime: toIsoString(liveStreamingDetails.scheduledStartTime),
      actualStartTime: toIsoString(liveStreamingDetails.actualStartTime),
      actualEndTime: toIsoString(liveStreamingDetails.actualEndTime),
      publishedAt: toIsoString(snippet.publishedAt),
      source: 'youtube-details',
      startAtSource: source,
      isManual: false,
    },
    diagnostics: {
      hasLiveStreamingDetails: Object.keys(liveStreamingDetails).length > 0,
      startAtSource: source,
    },
  };
}

function mapScheduleItemFromSearchResult(result, existingById) {
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
    title: snippet.title || 'Untitled',
    channelId: channel.youtubeChannelId,
    channelName: getScheduleChannelName(channel, snippet),
    startAt,
    endAt: null,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: getFallbackThumbnail(videoId, snippet.thumbnails, existing?.thumbnailUrl),
    group: channel.group,
    groupIds: channel.groupIds,
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

async function youtubeGet(endpoint, params, apiKey) {
  const url = new URL(`${youtubeApiBase}/${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set('key', apiKey);

  const response = await fetch(url);
  const body = await response.text();
  const data = body ? JSON.parse(body) : {};

  if (!response.ok) {
    const message = data?.error?.message || `${endpoint} failed with ${response.status}`;
    throw new YouTubeApiError(message, response.status, endpoint);
  }

  return data;
}

async function searchVideos(channel, eventType, apiKey, counters) {
  counters.executedSearchCalls += 1;

  try {
    const data = await youtubeGet(
      'search',
      {
        part: 'snippet',
        channelId: channel.youtubeChannelId,
        type: 'video',
        eventType,
        order: 'date',
        maxResults: maxSearchResults,
      },
      apiKey,
    );

    const videos = (data.items || [])
      .map((item) => ({
        videoId: item.id?.videoId,
        snippet: item.snippet || {},
        channel,
        eventType,
      }))
      .filter((item) => item.videoId);

    console.log(
      `[youtube] ${getChannelLabel(channel)} (${channel.youtubeChannelId}) ${eventType}: search=${videos.length}.`,
    );

    return videos;
  } catch (error) {
    const status = error instanceof YouTubeApiError ? error.statusCode : 'unknown';
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `YouTube API search failed: status=${status}, channel="${getChannelLabel(
        channel,
      )}", youtubeChannelId="${channel.youtubeChannelId}", eventType=${eventType}, message="${message}"`,
      { cause: error },
    );
  }
}

async function searchActiveBroadcasts(channel, apiKey, counters) {
  counters.executedSearchCalls += 1;

  try {
    const data = await youtubeGet(
      'search',
      {
        part: 'snippet',
        channelId: channel.youtubeChannelId,
        type: 'video',
        order: 'date',
        maxResults: maxSearchResults,
      },
      apiKey,
    );

    const videos = (data.items || [])
      .map((item) => {
        const liveBroadcastContent = item.snippet?.liveBroadcastContent;
        const eventType =
          liveBroadcastContent === 'live' || liveBroadcastContent === 'upcoming'
            ? liveBroadcastContent
            : null;

        return {
          videoId: item.id?.videoId,
          snippet: item.snippet || {},
          channel,
          eventType,
        };
      })
      .filter((item) => item.videoId && item.eventType);

    const upcomingCount = videos.filter((item) => item.eventType === 'upcoming').length;
    const liveCount = videos.filter((item) => item.eventType === 'live').length;
    console.log(
      `[youtube] ${getChannelLabel(channel)} (${channel.youtubeChannelId}) active search: upcoming=${upcomingCount}, live=${liveCount}.`,
    );

    return videos;
  } catch (error) {
    const status = error instanceof YouTubeApiError ? error.statusCode : 'unknown';
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `YouTube API active search failed: status=${status}, channel="${getChannelLabel(
        channel,
      )}", youtubeChannelId="${channel.youtubeChannelId}", message="${message}"`,
      { cause: error },
    );
  }
}

async function fetchVideoDetails(videoIds, apiKey, counters) {
  if (videoIds.length === 0) {
    console.warn('[youtube] videos.list skipped because search returned 0 unique video IDs.');
    return [];
  }

  const chunks = [];

  for (let index = 0; index < videoIds.length; index += maxVideosListIds) {
    chunks.push(videoIds.slice(index, index + maxVideosListIds));
  }

  const output = [];

  for (const chunk of chunks) {
    counters.executedVideosListCalls += 1;

    try {
      const data = await youtubeGet(
        'videos',
        {
          part: 'snippet,liveStreamingDetails,status',
          id: chunk.join(','),
          maxResults: maxVideosListIds,
        },
        apiKey,
      );

      const items = data.items || [];
      console.log(
        `[youtube] videos.list call #${counters.executedVideosListCalls}: requested=${chunk.length}, enriched=${items.length}.`,
      );
      output.push(...items);
    } catch (error) {
      const status = error instanceof YouTubeApiError ? error.statusCode : 'unknown';
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`YouTube API videos.list failed: status=${status}, message="${message}"`, {
        cause: error,
      });
    }
  }

  return output;
}

function dedupeSchedules(items) {
  const byId = new Map();

  for (const item of items) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }

  return [...byId.values()].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
}

function logStats(stats, eventTypes) {
  for (const eventType of eventTypes) {
    const stat = stats[eventType];
    console.log(
      `[summary] ${eventType}: search=${stat.searchResults}, details=${stat.detailResults}, withLiveStreamingDetails=${stat.withLiveStreamingDetails}, converted=${stat.convertedSchedules}, searchFallback=${stat.convertedFromSearchFallback}.`,
    );

    if (eventType === 'completed') {
      console.log(
        `[summary] completed diagnostics: missingDetails=${stat.missingDetails}, missingLiveStreamingDetails=${stat.missingLiveStreamingDetails}, missingDate=${stat.missingDate}.`,
      );
    }
  }
}

function isQuotaExceeded(error) {
  if (error instanceof YouTubeApiError) {
    return error.isQuotaExceeded;
  }

  if (error instanceof Error) {
    return /quota/i.test(error.message) || isQuotaExceeded(error.cause);
  }

  return false;
}

async function writeSchedule(output) {
  console.log(`[schedule] Output path: ${schedulePath}`);
  console.log(`[schedule] Writing ${output.length} schedules.`);
  await writeFile(
    schedulePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        items: output,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`[schedule] Wrote ${output.length} schedules to ${schedulePath}.`);
}

async function main() {
  await loadEnvLocal();

  const apiKey = process.env.YOUTUBE_API_KEY;
  const existingSchedule = await readJson(schedulePath, []);
  const existingScheduleItems = getExistingScheduleItems(existingSchedule);
  const existingById = new Map(
    existingScheduleItems.map((item) => [getVideoId(item), item]).filter(([id]) => id),
  );
  const channelsData = await readJson(channelsPath, { channels: [] });
  const channels = extractChannels(channelsData).map(normalizeChannel);
  const enabledCount = channels.filter((channel) => channel.enabled).length;
  const enabledChannels = channels.filter(
    (channel) => channel.enabled && !isPlaceholderChannelId(channel.youtubeChannelId),
  );
  const eventTypes = getEventTypes();
  const counters = {
    plannedSearchCalls: enabledChannels.length + (shouldIncludeCompleted() ? enabledChannels.length : 0),
    executedSearchCalls: 0,
    executedVideosListCalls: 0,
  };

  console.log(`[channels] Loading file: ${channelsPath}`);
  console.log(`[channels] Loaded channels: ${channels.length}.`);
  console.log(`[channels] enabled=true channels: ${enabledCount}.`);
  console.log(`[channels] fetch targets after excluding placeholders: ${enabledChannels.length}.`);
  console.log(`[quota] Event types for this run: ${eventTypes.join(', ')}.`);
  console.log('[quota] upcoming/live are fetched with one combined search.list call per channel.');
  console.log(`[quota] Planned search.list calls: ${counters.plannedSearchCalls}.`);
  console.log('[quota] Planned videos.list calls: 0 or more, batched in chunks of up to 50 video IDs.');

  for (const channel of enabledChannels) {
    console.log(`[channels] target: ${getChannelLabel(channel)} (${channel.youtubeChannelId})`);
  }

  if (!apiKey) {
    console.warn('YOUTUBE_API_KEY is not set. Keeping existing public/schedule.json.');
    return;
  }

  try {
    const stats = createEventStats(eventTypes);
    const searchResults = [];

    for (const channel of enabledChannels) {
      console.log(`[youtube] Fetching channel "${getChannelLabel(channel)}" (${channel.youtubeChannelId}).`);

      const activeVideos = await searchActiveBroadcasts(channel, apiKey, counters);

      for (const video of activeVideos) {
        stats[video.eventType].searchResults += 1;
        searchResults.push(video);
      }

      if (shouldIncludeCompleted()) {
        const videos = await searchVideos(channel, completedEventType, apiKey, counters);
        stats[completedEventType].searchResults += videos.length;
        searchResults.push(...videos);
      }
    }

    const videoIds = [...new Set(searchResults.map((item) => item.videoId))];
    console.log(`[quota] Executed search.list calls: ${counters.executedSearchCalls}.`);
    console.log(`[youtube] search.list collected ${searchResults.length} results.`);
    console.log(`[youtube] Unique video IDs for videos.list: ${videoIds.length}.`);

    if (searchResults.length === 0) {
      console.warn('[youtube] search.list returned 0 results. Writing an empty generated schedule.');
    }

    let detailItems = [];
    let usedSearchFallback = false;

    try {
      detailItems = await fetchVideoDetails(videoIds, apiKey, counters);
    } catch (error) {
      if (!isQuotaExceeded(error)) {
        throw error;
      }

      usedSearchFallback = true;
      console.warn('[quota] Quota exceeded during videos.list. Skipping detail enrichment.');
      console.warn('[quota] Updating schedule from already fetched upcoming/live search results only.');
    }

    console.log(`[quota] Executed videos.list calls: ${counters.executedVideosListCalls}.`);

    const detailById = new Map(detailItems.map((item) => [item.id, item]));
    const manualSchedules = (await readJson(manualSchedulePath, [])).map((item) => ({
      ...item,
      isManual: true,
      source: 'manual',
    }));
    console.log(`[manual] Loaded ${manualSchedules.length} manual schedules.`);

    const schedules = [];

    for (const result of searchResults) {
      const stat = stats[result.eventType];
      const detail = detailById.get(result.videoId);

      if (!detail) {
        stat.missingDetails += 1;

        if (usedSearchFallback && result.eventType !== completedEventType) {
          stat.convertedSchedules += 1;
          stat.convertedFromSearchFallback += 1;
          schedules.push(mapScheduleItemFromSearchResult(result, existingById));
        }

        continue;
      }

      stat.detailResults += 1;

      const mapped = mapScheduleItemFromDetail(detail, result.channel, result.eventType);

      if (mapped.diagnostics.hasLiveStreamingDetails) {
        stat.withLiveStreamingDetails += 1;
      } else {
        stat.missingLiveStreamingDetails += 1;
      }

      if (mapped.diagnostics.startAtSource === 'fallback-now') {
        stat.missingDate += 1;
      }

      stat.convertedSchedules += 1;
      schedules.push(mapped.item);
    }

    logStats(stats, eventTypes);

    if (stats.completed?.searchResults > 0 && stats.completed.convertedSchedules === 0) {
      console.warn(
        `[diagnostics] completed search returned ${stats.completed.searchResults} videos but converted 0 schedules. Reasons: missingDetails=${stats.completed.missingDetails}, missingLiveStreamingDetails=${stats.completed.missingLiveStreamingDetails}, missingDate=${stats.completed.missingDate}.`,
      );
    }

    const output = dedupeSchedules([...schedules, ...manualSchedules]);

    if (output.length === 0) {
      console.warn('[schedule] Output contains 0 schedules. Writing [] to public/schedule.json.');
    }

    await writeSchedule(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (isQuotaExceeded(error)) {
      console.error(`[quota] Quota exceeded; skipping schedule update and keeping existing public/schedule.json. ${message}`);
    } else {
      console.error(`Failed to fetch YouTube schedule: ${message}`);
    }

    console.log(`[quota] Executed search.list calls: ${counters.executedSearchCalls}.`);
    console.log(`[quota] Executed videos.list calls: ${counters.executedVideosListCalls}.`);

    if (existingScheduleItems.length > 0 || Array.isArray(existingSchedule)) {
      console.error('Keeping existing public/schedule.json.');
      return;
    }

    await writeSchedule([]);
    console.error('No valid existing schedule found. Wrote an empty schedule.json.');
  }
}

main();

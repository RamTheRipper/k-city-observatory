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
const eventTypes = ['upcoming', 'live', 'completed'];

class YouTubeApiError extends Error {
  constructor(message, statusCode, endpoint) {
    super(message);
    this.name = 'YouTubeApiError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }
}

function createEventStats() {
  return Object.fromEntries(
    eventTypes.map((eventType) => [
      eventType,
      {
        searchResults: 0,
        detailResults: 0,
        withLiveStreamingDetails: 0,
        convertedSchedules: 0,
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
    group: groupIds[0] || (channel.group ? String(channel.group) : 'その他'),
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
  return (
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    ''
  );
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

function mapScheduleItem(video, channel, eventType) {
  const snippet = video.snippet || {};
  const liveStreamingDetails = video.liveStreamingDetails || {};
  const videoId = video.id;
  const { startAt, source } = getStartInfo(snippet, liveStreamingDetails);

  return {
    item: {
      id: videoId,
      title: snippet.title || 'Untitled',
      channelId: channel.youtubeChannelId,
      channelName: getScheduleChannelName(channel, snippet),
      startAt,
      endAt: toIsoString(liveStreamingDetails.actualEndTime),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: getBestThumbnail(snippet.thumbnails),
      group: channel.group,
      groupIds: channel.groupIds,
      tags: channel.tags,
      category: channel.category || '',
      status: normalizeStatus(eventType, liveStreamingDetails),
      isManual: false,
    },
    diagnostics: {
      hasLiveStreamingDetails: Object.keys(liveStreamingDetails).length > 0,
      startAtSource: source,
    },
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

async function searchVideos(channel, eventType, apiKey) {
  try {
    const data = await youtubeGet(
      'search',
      {
        part: 'snippet',
        channelId: channel.youtubeChannelId,
        type: 'video',
        eventType,
        order: 'date',
        maxResults: eventType === 'completed' ? 8 : 5,
      },
      apiKey,
    );

    const videos = (data.items || [])
      .map((item) => ({
        videoId: item.id?.videoId,
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
    );
  }
}

async function fetchVideoDetails(videoIds, apiKey) {
  if (videoIds.length === 0) {
    console.warn('[youtube] videos.list skipped because search returned 0 unique video IDs.');
    return [];
  }

  try {
    const data = await youtubeGet(
      'videos',
      {
        part: 'snippet,liveStreamingDetails',
        id: videoIds.join(','),
        maxResults: 50,
      },
      apiKey,
    );

    const items = data.items || [];
    console.log(`[youtube] videos.list enriched ${items.length}/${videoIds.length} unique videos.`);
    return items;
  } catch (error) {
    const status = error instanceof YouTubeApiError ? error.statusCode : 'unknown';
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`YouTube API videos.list failed: status=${status}, message="${message}"`);
  }
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

function logStats(stats) {
  for (const eventType of eventTypes) {
    const stat = stats[eventType];
    console.log(
      `[summary] ${eventType}: search=${stat.searchResults}, details=${stat.detailResults}, withLiveStreamingDetails=${stat.withLiveStreamingDetails}, converted=${stat.convertedSchedules}.`,
    );

    if (eventType === 'completed') {
      console.log(
        `[summary] completed diagnostics: missingDetails=${stat.missingDetails}, missingLiveStreamingDetails=${stat.missingLiveStreamingDetails}, missingDate=${stat.missingDate}.`,
      );
    }
  }
}

async function main() {
  await loadEnvLocal();

  const apiKey = process.env.YOUTUBE_API_KEY;
  const existingSchedule = await readJson(schedulePath, []);
  const channelsData = await readJson(channelsPath, { channels: [] });
  const channels = extractChannels(channelsData).map(normalizeChannel);
  const enabledCount = channels.filter((channel) => channel.enabled).length;
  const enabledChannels = channels.filter(
    (channel) => channel.enabled && !isPlaceholderChannelId(channel.youtubeChannelId),
  );

  console.log(`[channels] Loading file: ${channelsPath}`);
  console.log(`[channels] Loaded channels: ${channels.length}.`);
  console.log(`[channels] enabled=true channels: ${enabledCount}.`);
  console.log(`[channels] fetch targets after excluding placeholders: ${enabledChannels.length}.`);

  for (const channel of enabledChannels) {
    console.log(`[channels] target: ${getChannelLabel(channel)} (${channel.youtubeChannelId})`);
  }

  if (!apiKey) {
    console.warn('YOUTUBE_API_KEY is not set. Keeping existing public/schedule.json.');
    return;
  }

  try {
    const stats = createEventStats();
    const searchResults = [];

    for (const channel of enabledChannels) {
      console.log(`[youtube] Fetching channel "${getChannelLabel(channel)}" (${channel.youtubeChannelId}).`);

      for (const eventType of eventTypes) {
        const videos = await searchVideos(channel, eventType, apiKey);
        stats[eventType].searchResults += videos.length;
        searchResults.push(...videos);
      }
    }

    const videoIds = [...new Set(searchResults.map((item) => item.videoId))];
    console.log(`[youtube] search.list collected ${searchResults.length} results.`);
    console.log(`[youtube] Unique video IDs for videos.list: ${videoIds.length}.`);

    if (searchResults.length === 0) {
      console.warn('[youtube] search.list returned 0 results. Writing an empty generated schedule.');
    }

    const detailItems = await fetchVideoDetails(videoIds, apiKey);
    const detailById = new Map(detailItems.map((item) => [item.id, item]));
    const manualSchedules = (await readJson(manualSchedulePath, [])).map((item) => ({
      ...item,
      isManual: true,
    }));
    console.log(`[manual] Loaded ${manualSchedules.length} manual schedules.`);

    const schedules = [];

    for (const result of searchResults) {
      const detail = detailById.get(result.videoId);
      const stat = stats[result.eventType];

      if (!detail) {
        stat.missingDetails += 1;
        continue;
      }

      stat.detailResults += 1;

      const mapped = mapScheduleItem(detail, result.channel, result.eventType);

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

    logStats(stats);

    if (stats.completed.searchResults > 0 && stats.completed.convertedSchedules === 0) {
      console.warn(
        `[diagnostics] completed search returned ${stats.completed.searchResults} videos but converted 0 schedules. Reasons: missingDetails=${stats.completed.missingDetails}, missingLiveStreamingDetails=${stats.completed.missingLiveStreamingDetails}, missingDate=${stats.completed.missingDate}.`,
      );
    }

    const output = dedupeSchedules([...schedules, ...manualSchedules]);

    if (output.length === 0) {
      console.warn('[schedule] Output contains 0 schedules. Writing [] to public/schedule.json.');
    }

    console.log(`[schedule] Output path: ${schedulePath}`);
    console.log(`[schedule] Writing ${output.length} schedules.`);
    await writeFile(schedulePath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(`[schedule] Wrote ${output.length} schedules to ${schedulePath}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to fetch YouTube schedule: ${message}`);

    if (Array.isArray(existingSchedule)) {
      console.error('Keeping existing public/schedule.json.');
      return;
    }

    await writeFile(schedulePath, '[]\n', 'utf8');
    console.error('No valid existing schedule found. Wrote an empty schedule.json.');
  }
}

main();

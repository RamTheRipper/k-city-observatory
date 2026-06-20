import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');
const channelsPath = path.join(publicDir, 'channels.json');
const schedulePath = path.join(publicDir, 'schedule.json');
const manualSchedulePath = path.join(publicDir, 'manual-schedule.json');
const youtubeApiBase = 'https://www.googleapis.com/youtube/v3';
const eventTypes = ['upcoming', 'live', 'completed'];

function loadEnvLocal() {
  const envPath = path.join(rootDir, '.env.local');

  if (!existsSync(envPath)) {
    return;
  }

  const content = readFile(envPath, 'utf8');
  return content.then((text) => {
    for (const line of text.split(/\r?\n/)) {
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
  });
}

async function readJsonArray(filePath, fallback = []) {
  try {
    const content = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeChannel(channel) {
  return {
    channelId: String(channel.channelId || ''),
    name: String(channel.name || channel.displayName || channel.channelId || ''),
    displayName: channel.displayName ? String(channel.displayName) : undefined,
    group: channel.group ? String(channel.group) : undefined,
    tags: Array.isArray(channel.tags) ? channel.tags.map(String) : [],
    category: channel.category ? String(channel.category) : undefined,
    thumbnailUrl: channel.thumbnailUrl ? String(channel.thumbnailUrl) : '',
    enabled: channel.enabled !== false,
  };
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

function getStartAt(eventType, snippet = {}, liveStreamingDetails = {}) {
  return (
    toIsoString(liveStreamingDetails.scheduledStartTime) ||
    toIsoString(liveStreamingDetails.actualStartTime) ||
    toIsoString(liveStreamingDetails.actualEndTime) ||
    toIsoString(snippet.publishedAt) ||
    new Date().toISOString()
  );
}

function mapScheduleItem(video, channel, eventType) {
  const snippet = video.snippet || {};
  const liveStreamingDetails = video.liveStreamingDetails || {};
  const videoId = video.id;

  return {
    id: videoId,
    title: snippet.title || 'Untitled',
    channelId: channel.channelId,
    channelName: channel.displayName || channel.name || snippet.channelTitle || channel.channelId,
    startAt: getStartAt(eventType, snippet, liveStreamingDetails),
    endAt: toIsoString(liveStreamingDetails.actualEndTime),
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: getBestThumbnail(snippet.thumbnails),
    group: channel.group || 'その他',
    tags: channel.tags || [],
    category: channel.category || '',
    status: normalizeStatus(eventType, liveStreamingDetails),
    isManual: false,
  };
}

async function youtubeGet(pathname, params, apiKey) {
  const url = new URL(`${youtubeApiBase}/${pathname}`);

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
    const message = data?.error?.message || `${pathname} failed with ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function searchVideos(channel, eventType, apiKey) {
  const data = await youtubeGet(
    'search',
    {
      part: 'snippet',
      channelId: channel.channelId,
      type: 'video',
      eventType,
      order: 'date',
      maxResults: eventType === 'completed' ? 8 : 5,
    },
    apiKey,
  );

  return (data.items || [])
    .map((item) => ({
      videoId: item.id?.videoId,
      channel,
      eventType,
    }))
    .filter((item) => item.videoId);
}

async function fetchVideoDetails(videoIds, apiKey) {
  if (videoIds.length === 0) {
    return [];
  }

  const data = await youtubeGet(
    'videos',
    {
      part: 'snippet,liveStreamingDetails',
      id: videoIds.join(','),
      maxResults: 50,
    },
    apiKey,
  );

  return data.items || [];
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

async function main() {
  await loadEnvLocal();

  const apiKey = process.env.YOUTUBE_API_KEY;
  const existingSchedule = await readJsonArray(schedulePath);

  if (!apiKey) {
    console.warn('YOUTUBE_API_KEY is not set. Keeping existing public/schedule.json.');
    return;
  }

  const channels = (await readJsonArray(channelsPath)).map(normalizeChannel);
  const enabledChannels = channels.filter(
    (channel) => channel.enabled && !isPlaceholderChannelId(channel.channelId),
  );

  if (enabledChannels.length === 0) {
    console.warn('No enabled real channel IDs found. Keeping existing public/schedule.json.');
    return;
  }

  try {
    const searchResults = [];

    for (const channel of enabledChannels) {
      for (const eventType of eventTypes) {
        const videos = await searchVideos(channel, eventType, apiKey);
        searchResults.push(...videos);
      }
    }

    const videoIds = [...new Set(searchResults.map((item) => item.videoId))];
    const detailItems = await fetchVideoDetails(videoIds, apiKey);
    const detailById = new Map(detailItems.map((item) => [item.id, item]));
    const manualSchedules = (await readJsonArray(manualSchedulePath)).map((item) => ({
      ...item,
      isManual: true,
    }));

    const schedules = searchResults
      .map((result) => {
        const detail = detailById.get(result.videoId);
        return detail ? mapScheduleItem(detail, result.channel, result.eventType) : null;
      })
      .filter(Boolean);

    const output = dedupeSchedules([...schedules, ...manualSchedules]);

    await writeFile(schedulePath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${output.length} schedules to public/schedule.json.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to fetch YouTube schedule: ${message}`);

    if (existingSchedule.length > 0) {
      console.error('Keeping existing public/schedule.json.');
      return;
    }

    await writeFile(schedulePath, '[]\n', 'utf8');
    console.error('No existing schedule found. Wrote an empty schedule.json.');
  }
}

main();

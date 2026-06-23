import type { GroupItem, ScheduleItem } from '../types';
import { formatDateTime, getEffectiveScheduleStatus } from '../utils/date';

type ScheduleCardProps = {
  schedule: ScheduleItem;
  isFavorite: boolean;
  groupLabels: GroupItem[];
  isFeatured?: boolean;
  countdownLabel?: string;
};

const statusLabels: Record<string, string> = {
  upcoming: '予定',
  ended: '配信済み',
};

const tagClassNames: Record<string, string> = {
  manual: 'tagManual',
  手動: 'tagManual',
  official: 'tagOfficial',
  公式: 'tagOfficial',
  main: 'tagMain',
  sub: 'tagSub',
  membership: 'tagMembership',
  game: 'tagGame',
  ゲーム: 'tagGame',
  live: 'tagLive',
  ライブ: 'tagLive',
  歌枠: 'tagMusic',
  music: 'tagMusic',
  radio: 'tagRadio',
  ラジオ: 'tagRadio',
};

const showInternalSyncBadges = false;

function getGroupLabel(group: string | undefined, groupLabels: GroupItem[]): string {
  if (!group) {
    return 'その他';
  }

  return groupLabels.find((item) => item.groupId === group)?.displayName ?? group;
}

function getInitial(name: string): string {
  return [...name.trim()][0] || 'K';
}

function getSyncBadges(schedule: ScheduleItem): string[] {
  const badges: string[] = [];

  if (schedule.isManual) {
    badges.push('手動');
  }

  if (showInternalSyncBadges && schedule.source === 'youtube-details') {
    badges.push('API同期済み');
  }

  if (
    showInternalSyncBadges &&
    (schedule.startAtSource?.includes('youtube-page') || schedule.startAtSource?.includes('scheduledStartTime'))
  ) {
    badges.push('時刻同期');
  }

  return badges;
}

export function ScheduleCard({
  schedule,
  isFavorite,
  groupLabels,
  isFeatured = false,
  countdownLabel,
}: ScheduleCardProps) {
  const groupLabel = getGroupLabel(schedule.group, groupLabels);
  const tags = schedule.tags ?? [];
  const effectiveStatus = getEffectiveScheduleStatus(schedule);
  const syncBadges = getSyncBadges(schedule);
  const channelInitial = getInitial(schedule.channelName);

  return (
    <article className={isFeatured ? 'scheduleCard scheduleCardFeatured' : 'scheduleCard'}>
      {schedule.thumbnailUrl ? (
        <img className="scheduleThumbnail" src={schedule.thumbnailUrl} alt="" loading="lazy" />
      ) : (
        <div className="scheduleThumbnail placeholderThumbnail">NO IMAGE</div>
      )}

      <div className="scheduleBody">
        <div className="scheduleTimeRow">
          <time dateTime={schedule.startAt}>{formatDateTime(schedule.startAt)}</time>
          <span className={`statusBadge statusBadge-${effectiveStatus}`}>
            {statusLabels[effectiveStatus]}
          </span>
        </div>

        {countdownLabel ? <p className="countdownText">{countdownLabel}</p> : null}

        <div className="channelName">
          {schedule.channelThumbnailUrl ? (
            <img
              className="channelIcon"
              src={schedule.channelThumbnailUrl}
              alt=""
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <span className="channelIcon channelIconFallback" aria-hidden="true">
              {channelInitial}
            </span>
          )}
          {isFavorite ? <span className="favoriteMark">★</span> : null}
          <span>{schedule.channelName}</span>
        </div>

        <div className="scheduleTitleRow">
          <h3>{schedule.title}</h3>
        </div>

        <div className="scheduleMeta">
          <span>{groupLabel}</span>
          {syncBadges.map((badge) => (
            <span key={badge} className="syncBadge">
              {badge}
            </span>
          ))}
        </div>

        {tags.length > 0 ? (
          <div className="tagList" aria-label="タグ">
            {tags.map((tag) => (
              <span key={tag} className={tagClassNames[tag] ?? undefined}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {schedule.url ? (
          <a href={schedule.url} target="_blank" rel="noreferrer">
            YouTubeで開く
          </a>
        ) : (
          <span className="mutedText">リンク未設定</span>
        )}
      </div>
    </article>
  );
}

import type { GroupItem, ScheduleItem } from '../types';
import { formatDateTime } from '../utils/date';

type ScheduleCardProps = {
  schedule: ScheduleItem;
  isFavorite: boolean;
  groupLabels: GroupItem[];
};

const statusLabels: Record<string, string> = {
  upcoming: '予定',
  live: '配信中',
  ended: '過去',
  archived: '過去',
  unknown: '不明',
};

function getGroupLabel(group: string | undefined, groupLabels: GroupItem[]): string {
  if (!group) {
    return 'その他';
  }

  return groupLabels.find((item) => item.groupId === group)?.displayName ?? group;
}

export function ScheduleCard({ schedule, isFavorite, groupLabels }: ScheduleCardProps) {
  const groupLabel = getGroupLabel(schedule.group, groupLabels);
  const tags = schedule.tags ?? [];

  return (
    <article className="scheduleCard">
      {schedule.thumbnailUrl ? (
        <img className="scheduleThumbnail" src={schedule.thumbnailUrl} alt="" loading="lazy" />
      ) : (
        <div className="scheduleThumbnail placeholderThumbnail">NO IMAGE</div>
      )}

      <div className="scheduleBody">
        <div className="scheduleMeta">
          <span>{groupLabel}</span>
          <span>{formatDateTime(schedule.startAt)}</span>
        </div>

        <div className="scheduleTitleRow">
          <h3>{schedule.title}</h3>
          <span className={`statusBadge statusBadge-${schedule.status}`}>
            {statusLabels[schedule.status] ?? statusLabels.unknown}
          </span>
        </div>

        <p className="channelName">
          {isFavorite ? <span className="favoriteMark">★</span> : null}
          {schedule.channelName}
          {schedule.isManual ? <span className="manualMark">手動</span> : null}
        </p>

        {tags.length > 0 ? (
          <div className="tagList" aria-label="タグ">
            {tags.map((tag) => (
              <span key={tag}>{tag}</span>
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

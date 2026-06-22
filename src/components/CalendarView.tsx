import type { GroupItem, ScheduleItem, StatusFilter } from '../types';
import { formatDayLabel, parseDate, toDateKey } from '../utils/date';
import { ScheduleCard } from './ScheduleCard';

type CalendarViewProps = {
  schedules: ScheduleItem[];
  favoriteChannelIds: string[];
  statusFilter: StatusFilter;
  groupLabels: GroupItem[];
};

type ScheduleGroup = {
  key: string;
  label: string;
  schedules: ScheduleItem[];
};

function getScheduleTime(schedule: ScheduleItem): number {
  return parseDate(schedule.startAt)?.getTime() ?? 0;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getCountdownLabel(schedule: ScheduleItem, now: Date): string {
  const startAt = parseDate(schedule.startAt);

  if (!startAt) {
    return '';
  }

  const diffMinutes = Math.round((startAt.getTime() - now.getTime()) / 60000);

  if (diffMinutes <= 0) {
    return '開始予定時刻を過ぎています';
  }

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  if (hours <= 0) {
    return `あと${minutes}分`;
  }

  return minutes > 0 ? `あと${hours}時間${minutes}分` : `あと${hours}時間`;
}

function groupUpcomingSchedules(schedules: ScheduleItem[], now: Date): ScheduleGroup[] {
  const todayKey = toDateKey(now);
  const tomorrowKey = toDateKey(addDays(now, 1));
  const weekEndKey = toDateKey(addDays(now, 6));
  const groups: ScheduleGroup[] = [
    { key: 'today', label: '今日', schedules: [] },
    { key: 'tomorrow', label: '明日', schedules: [] },
    { key: 'this-week', label: '今週', schedules: [] },
    { key: 'later', label: 'それ以降', schedules: [] },
  ];

  for (const schedule of schedules) {
    const startAt = parseDate(schedule.startAt);
    const dateKey = startAt ? toDateKey(startAt) : '';

    if (dateKey === todayKey) {
      groups[0].schedules.push(schedule);
    } else if (dateKey === tomorrowKey) {
      groups[1].schedules.push(schedule);
    } else if (dateKey && dateKey <= weekEndKey) {
      groups[2].schedules.push(schedule);
    } else {
      groups[3].schedules.push(schedule);
    }
  }

  return groups.filter((group) => group.schedules.length > 0);
}

function groupPastSchedules(schedules: ScheduleItem[]): ScheduleGroup[] {
  const grouped = new Map<string, ScheduleItem[]>();

  for (const schedule of schedules) {
    const startAt = parseDate(schedule.startAt);
    const key = startAt ? toDateKey(startAt) : 'unknown';
    grouped.set(key, [...(grouped.get(key) ?? []), schedule]);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => {
      const firstDate = parseDate(items[0]?.startAt ?? '');
      return {
        key,
        label: firstDate ? formatDayLabel(firstDate) : '日時不明',
        schedules: items.sort((a, b) => getScheduleTime(b) - getScheduleTime(a)),
      };
    });
}

export function CalendarView({
  schedules,
  favoriteChannelIds,
  statusFilter,
  groupLabels,
}: CalendarViewProps) {
  const isPastTab = statusFilter === 'past';
  const now = new Date();
  const sortedSchedules = [...schedules].sort((a, b) => {
    const aTime = getScheduleTime(a);
    const bTime = getScheduleTime(b);
    return isPastTab ? bTime - aTime : aTime - bTime;
  });

  if (isPastTab) {
    const groups = groupPastSchedules(sortedSchedules);

    return (
      <section className="calendarView" aria-label="過去配信">
        <div className="dayBlock">
          <h2>過去1か月</h2>
          {groups.length > 0 ? (
            groups.map((group) => (
              <section key={group.key} className="periodBlock">
                <h3>{group.label}</h3>
                <div className="scheduleList">
                  {group.schedules.map((schedule) => (
                    <ScheduleCard
                      key={schedule.id}
                      schedule={schedule}
                      isFavorite={favoriteChannelIds.includes(schedule.channelId)}
                      groupLabels={groupLabels}
                    />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <p className="emptyText">過去配信はありません。</p>
          )}
        </div>
      </section>
    );
  }

  const nextSchedule = sortedSchedules.find((schedule) => {
    const startAt = parseDate(schedule.startAt);
    return startAt ? startAt.getTime() > now.getTime() : false;
  });
  const nextScheduleId = nextSchedule?.id;
  const groupedSchedules = groupUpcomingSchedules(
    sortedSchedules.filter((schedule) => schedule.id !== nextScheduleId),
    now,
  );

  return (
    <section className="calendarView" aria-label="配信カレンダー">
      {nextSchedule ? (
        <section className="nextScheduleBlock" aria-label="次の配信">
          <div className="sectionHeadingRow">
            <h2>次の配信</h2>
            <span>{getCountdownLabel(nextSchedule, now)}</span>
          </div>
          <ScheduleCard
            schedule={nextSchedule}
            isFavorite={favoriteChannelIds.includes(nextSchedule.channelId)}
            groupLabels={groupLabels}
            isFeatured
            countdownLabel={getCountdownLabel(nextSchedule, now)}
          />
        </section>
      ) : null}

      {groupedSchedules.length > 0 ? (
        groupedSchedules.map((group) => (
          <section key={group.key} className="dayBlock">
            <h2>{group.label}</h2>
            <div className="scheduleList">
              {group.schedules.map((schedule) => (
                <ScheduleCard
                  key={schedule.id}
                  schedule={schedule}
                  isFavorite={favoriteChannelIds.includes(schedule.channelId)}
                  groupLabels={groupLabels}
                />
              ))}
            </div>
          </section>
        ))
      ) : !nextSchedule ? (
        <p className="emptyText">予定なし</p>
      ) : null}
    </section>
  );
}

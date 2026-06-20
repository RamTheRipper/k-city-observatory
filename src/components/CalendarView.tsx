import type { GroupItem, ScheduleItem, StatusFilter } from '../types';
import { formatDayLabel, getCalendarDays, parseDate, toDateKey } from '../utils/date';
import { ScheduleCard } from './ScheduleCard';

type CalendarViewProps = {
  schedules: ScheduleItem[];
  favoriteChannelIds: string[];
  statusFilter: StatusFilter;
  groupLabels: GroupItem[];
};

export function CalendarView({
  schedules,
  favoriteChannelIds,
  statusFilter,
  groupLabels,
}: CalendarViewProps) {
  const sortedSchedules = [...schedules].sort((a, b) => {
    const aTime = parseDate(a.startAt)?.getTime() ?? 0;
    const bTime = parseDate(b.startAt)?.getTime() ?? 0;
    return aTime - bTime;
  });

  if (statusFilter === 'archived' || statusFilter === 'ended') {
    return (
      <section className="calendarView" aria-label="過去配信">
        <div className="dayBlock">
          <h2>過去1か月</h2>
          {sortedSchedules.length > 0 ? (
            <div className="scheduleList">
              {sortedSchedules.map((schedule) => (
                <ScheduleCard
                  key={schedule.id}
                  schedule={schedule}
                  isFavorite={favoriteChannelIds.includes(schedule.channelId)}
                  groupLabels={groupLabels}
                />
              ))}
            </div>
          ) : (
            <p className="emptyText">過去配信はありません。</p>
          )}
        </div>
      </section>
    );
  }

  const days = getCalendarDays(new Date(), 7);

  return (
    <section className="calendarView" aria-label="配信カレンダー">
      {days.map((day) => {
        const dayKey = toDateKey(day);
        const daySchedules = sortedSchedules.filter((schedule) => {
          const startAt = parseDate(schedule.startAt);
          return startAt ? toDateKey(startAt) === dayKey : false;
        });

        return (
          <div key={dayKey} className="dayBlock">
            <h2>{formatDayLabel(day)}</h2>
            {daySchedules.length > 0 ? (
              <div className="scheduleList">
                {daySchedules.map((schedule) => (
                  <ScheduleCard
                    key={schedule.id}
                    schedule={schedule}
                    isFavorite={favoriteChannelIds.includes(schedule.channelId)}
                    groupLabels={groupLabels}
                  />
                ))}
              </div>
            ) : (
              <p className="emptyText">予定なし</p>
            )}
          </div>
        );
      })}
    </section>
  );
}

import type { ScheduleItem } from '../types';

export function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string): string {
  const date = parseDate(value);

  if (!date) {
    return '日時不明';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(date);
}

export function toDateKey(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getCalendarDays(baseDate: Date, days = 7): Date[] {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(baseDate);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return date;
  });
}

export function isWithinVisibleRange(
  schedule: ScheduleItem,
  statusFilter: string,
  now: Date,
): boolean {
  const startAt = parseDate(schedule.startAt);

  if (!startAt) {
    return true;
  }

  const futureEnd = new Date(now);
  futureEnd.setDate(futureEnd.getDate() + 7);

  const archiveStart = new Date(now);
  archiveStart.setMonth(archiveStart.getMonth() - 1);

  if (statusFilter === 'archived') {
    return startAt >= archiveStart && startAt <= now;
  }

  if (statusFilter === 'all') {
    return startAt >= archiveStart && startAt <= futureEnd;
  }

  return startAt <= futureEnd;
}

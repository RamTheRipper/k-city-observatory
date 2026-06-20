import type { LogEntry, LogLevel } from '../types';

export function createLog(level: LogLevel, message: string): LogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    level,
    message,
    createdAt: new Date().toISOString(),
  };
}

import { useCurrentWorkspace } from './useWorkspaces';

const DEFAULT_TIMEZONE = 'America/New_York';

export function useTimezone(): string {
  const { workspace } = useCurrentWorkspace();
  return workspace?.settings?.timezone || DEFAULT_TIMEZONE;
}

export function useFormatDate() {
  const timezone = useTimezone();

  const formatDate = (date: string | Date, options?: Intl.DateTimeFormatOptions) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { timeZone: timezone, ...options });
  };

  const formatDateTime = (date: string | Date, options?: Intl.DateTimeFormatOptions) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('en-US', { timeZone: timezone, ...options });
  };

  const formatTime = (date: string | Date, options?: Intl.DateTimeFormatOptions) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('en-US', { timeZone: timezone, ...options });
  };

  return { formatDate, formatDateTime, formatTime, timezone };
}

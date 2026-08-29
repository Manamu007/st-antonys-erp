import { useSettings } from '../context/SettingsContext';

export function useDateFormatter() {
  const { settings } = useSettings();
  const timezone = settings.timezone || 'Asia/Kolkata';

  const formatDate = (date: Date | string | number, options: Intl.DateTimeFormatOptions = {}) => {
    const d = new Date(date);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: timezone,
      dateStyle: 'medium',
      ...options
    }).format(d);
  };

  const formatTime = (date: Date | string | number, options: Intl.DateTimeFormatOptions = {}) => {
    const d = new Date(date);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: timezone,
      timeStyle: 'short',
      ...options
    }).format(d);
  };

  const formatDateTime = (date: Date | string | number, options: Intl.DateTimeFormatOptions = {}) => {
    const d = new Date(date);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
      ...options
    }).format(d);
  };

  return { formatDate, formatTime, formatDateTime, timezone };
}

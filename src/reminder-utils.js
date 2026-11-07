import { isScheduled, isLogComplete } from './domain.js';

function localDate(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function validTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isQuietTime(time, start, end) {
  if (!validTime(time) || !validTime(start) || !validTime(end) || start === end) return false;
  return start < end ? time >= start && time < end : time >= start || time < end;
}

export function reminderId(habitId, date, suffix = 'habit') {
  const source = `${suffix}:${habitId}:${date}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return (hash >>> 0) % 2_000_000_000 + 1;
}

export function buildUpcomingReminders({ habits, logs, settings, now = new Date(), days = 14, limit = 1000 }) {
  if (!settings?.reminders) return [];
  const logsByHabitDate = new Map((logs || []).map(log => [`${log.habitId}:${log.date}`, log]));
  const sent = new Set(settings.reminderSent || []);
  const reminders = [];
  for (let offset = 0; offset < days && reminders.length < limit; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const date = localDate(day);
    for (const habit of habits || []) {
      if (reminders.length >= limit) break;
      if (habit.archived || !validTime(habit.time) || !isScheduled(habit, date)
        || (settings.quietHoursEnabled && isQuietTime(habit.time, settings.quietHoursStart, settings.quietHoursEnd))) continue;
      const key = `${habit.id}:${date}`;
      if (sent.has(key)) continue;
      const log = logsByHabitDate.get(key);
      if (log?.status === 'skip' || isLogComplete(habit, log)) continue;
      const [hour, minute] = habit.time.split(':').map(Number);
      day.setHours(hour, minute, 0, 0);
      if (day <= now) continue;
      reminders.push({
        id: reminderId(habit.id, date),
        habitId: habit.id,
        date,
        at: new Date(day),
        title: 'Daily Habits',
        body: 'A planned habit is waiting. Tap to view your habits.',
      });
    }
  }
  return reminders;
}

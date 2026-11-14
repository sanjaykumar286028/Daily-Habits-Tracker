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

export function moveReminderOutOfQuietHours(date, settings) {
  const adjusted = new Date(date);
  if (!settings?.quietHoursEnabled) return adjusted;
  const clock = `${String(adjusted.getHours()).padStart(2, '0')}:${String(adjusted.getMinutes()).padStart(2, '0')}`;
  if (!isQuietTime(clock, settings.quietHoursStart, settings.quietHoursEnd)) return adjusted;
  if (settings.quietHoursStart > settings.quietHoursEnd && clock >= settings.quietHoursStart) adjusted.setDate(adjusted.getDate() + 1);
  const [hour, minute] = settings.quietHoursEnd.split(':').map(Number);
  adjusted.setHours(hour, minute, 0, 0);
  return adjusted;
}

export function reminderId(habitId, date, suffix = 'habit') {
  const source = `${suffix}:${habitId}:${date}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return (hash >>> 0) % 2_000_000_000 + 1;
}

export function buildDueHabitReminders({ habits, logs, settings, now = new Date(), graceMinutes = 30 }) {
  if (!settings?.reminders) return [];
  const date = localDate(now);
  const sent = new Set(settings.reminderSent || []);
  const logsByHabit = new Map((logs || []).filter(log => log.date === date).map(log => [log.habitId, log]));
  const reminders = [];
  for (const habit of habits || []) {
    if (habit.archived || !validTime(habit.time) || !isScheduled(habit, date)
      || (settings.quietHoursEnabled && isQuietTime(habit.time, settings.quietHoursStart, settings.quietHoursEnd))) continue;
    const key = `${habit.id}:${date}`;
    if (sent.has(key)) continue;
    const log = logsByHabit.get(habit.id);
    if (log?.status === 'skip' || isLogComplete(habit, log)) continue;
    const [hour, minute] = habit.time.split(':').map(Number);
    const dueAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    const overdueMs = now.getTime() - dueAt.getTime();
    if (overdueMs < 0 || overdueMs > graceMinutes * 60_000) continue;
    reminders.push({
      id: reminderId(habit.id, date),
      habitId: habit.id,
      habitName: habit.name,
      date,
      at: dueAt,
      title: 'Daily Habits reminder',
      body: `${habit.name} is scheduled now. Your progress is still pending.`,
    });
  }
  return reminders;
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

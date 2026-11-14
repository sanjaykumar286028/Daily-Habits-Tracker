import { isQuietTime, reminderId } from './reminder-utils.js';

const validDateTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const leadChoices = new Set([5, 10]);

export function taskStatus(task, now = Date.now()) {
  if (task?.status === 'completed' || task?.completedAt) return 'completed';
  if (validDateTime(task?.endAt) && Date.parse(task.endAt) <= Number(now)) return 'overdue';
  return task?.status === 'in_progress' ? 'in_progress' : 'pending';
}

export function normalizeTaskStatuses(tasks, now = Date.now()) {
  let changed = false;
  const normalized = (tasks || []).map(task => {
    const status = taskStatus(task, now);
    if (task.status === status) return task;
    changed = true;
    return { ...task, status, updatedAt:new Date(Number(now)).toISOString() };
  });
  return { tasks:normalized, changed };
}

export function validateTask(task) {
  if (!task || typeof task !== 'object' || typeof task.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(task.id)) return false;
  if (typeof task.title !== 'string' || !task.title.trim() || task.title.length > 120) return false;
  if (task.description !== undefined && (typeof task.description !== 'string' || task.description.length > 1000)) return false;
  if (!validDateTime(task.endAt)) return false;
  if (task.startAt !== undefined && task.startAt !== '' && (!validDateTime(task.startAt) || Date.parse(task.startAt) > Date.parse(task.endAt))) return false;
  if (!['pending', 'in_progress', 'completed', 'overdue'].includes(task.status || 'pending')) return false;
  if (task.reminderLeadMinutes !== undefined && (!Array.isArray(task.reminderLeadMinutes)
    || task.reminderLeadMinutes.some(minutes => !leadChoices.has(Number(minutes))))) return false;
  if (task.completedAt !== undefined && task.completedAt !== null && !validDateTime(task.completedAt)) return false;
  if (task.snoozeUntil !== undefined && task.snoozeUntil !== null && !validDateTime(task.snoozeUntil)) return false;
  return true;
}

function localClock(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function taskReminderEvents(task, settings, now, includePast) {
  const end = new Date(task.endAt);
  if (!Number.isFinite(end.getTime())) return [];
  const endMs = end.getTime();
  const leadTimes = (task.reminderLeadMinutes || []).map(Number).filter(value => leadChoices.has(value));
  const events = leadTimes.map(minutes => ({ type:`lead-${minutes}`, at:new Date(endMs - minutes * 60_000), minutes }));
  events.push({ type:'deadline', at:end, minutes:0 });
  if (task.snoozeUntil && (includePast || Date.parse(task.snoozeUntil) > now.getTime())) events.push({ type:`snooze-${Date.parse(task.snoozeUntil)}`, at:new Date(task.snoozeUntil), minutes:0 });
  return events.filter(event => (includePast || event.at > now)
    && !(settings?.quietHoursEnabled && isQuietTime(localClock(event.at), settings.quietHoursStart, settings.quietHoursEnd)));
}

export function buildDueTaskReminders({ tasks, settings, sent = [], now = new Date(), graceMinutes = 60 }) {
  if (!settings?.taskReminders && !settings?.deadlineAlerts) return [];
  const current = now instanceof Date ? now : new Date(now);
  const sentSet = new Set(sent || []);
  const result = [];
  for (const task of tasks || []) {
    if (!validateTask(task) || taskStatus(task, current.getTime()) === 'completed') continue;
    const endMs = Date.parse(task.endAt);
    for (const event of taskReminderEvents(task, settings, current, true)) {
      if (event.type.startsWith('lead-') ? !settings.taskReminders : !settings.deadlineAlerts) continue;
      const eventAt = event.at.getTime();
      if (eventAt > current.getTime() || current.getTime() - eventAt > graceMinutes * 60_000) continue;
      if (event.type.startsWith('lead-') && current.getTime() >= endMs) continue;
      const key = `${task.id}:${endMs}:${event.type}`;
      if (sentSet.has(key)) continue;
      const body = event.type === 'deadline' || event.type.startsWith('snooze-')
        ? `Time is up! Your ${task.title} task is still pending.`
        : `${task.title} is due in ${event.minutes} minutes.`;
      result.push({ id:reminderId(task.id, `${endMs}:${event.type}`, 'task'), taskId:task.id, title:task.title, type:event.type, key, at:event.at, body });
    }
  }
  return result;
}

export function buildUpcomingTaskReminders({ tasks, settings, sent = [], now = new Date(), limit = 500 }) {
  if (!settings?.taskReminders && !settings?.deadlineAlerts) return [];
  const current = now instanceof Date ? now : new Date(now);
  const sentSet = new Set(sent || []);
  const events = [];
  for (const task of tasks || []) {
    if (!validateTask(task) || taskStatus(task, current.getTime()) === 'completed') continue;
    const endMs = Date.parse(task.endAt);
    for (const event of taskReminderEvents(task, settings, current, false)) {
      if (event.type.startsWith('lead-') ? !settings.taskReminders : !settings.deadlineAlerts) continue;
      const key = `${task.id}:${endMs}:${event.type}`;
      if (sentSet.has(key) || event.at <= current) continue;
      const body = event.type === 'deadline'
        ? `Time is up! Your ${task.title} task is still pending.`
        : event.type.startsWith('snooze-')
          ? `Reminder: ${task.title} is still pending.`
          : `${task.title} is due in ${event.minutes} minutes.`;
      events.push({ id:reminderId(task.id, `${endMs}:${event.type}`, 'task'), taskId:task.id, title:task.title, type:event.type, key, at:event.at, body });
    }
  }
  return events.sort((a,b)=>a.at-b.at).slice(0,limit);
}


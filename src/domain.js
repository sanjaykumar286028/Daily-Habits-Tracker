export function isScheduled(habit, date) {
  if (date < habit.startDate || date > (habit.endDate || '9999-12-31')) return false;
  const day = new Date(`${date}T12:00:00`).getDay();
  if (habit.frequency === 'weekdays') return day > 0 && day < 6;
  if (habit.frequency === 'weekends') return day === 0 || day === 6;
  if (habit.frequency === 'weekly' || habit.frequency === 'custom') return (habit.days || []).includes(day);
  return true;
}

export function completionSummary(habits, logs, date) {
  const eligible = habits.filter(habit => !habit.archived && isScheduled(habit, date));
  const done = eligible.filter(habit => isLogComplete(habit, logs.find(row => row.habitId === habit.id && row.date === date))).length;
  return { eligible, done, remaining: eligible.length - done, percentage: eligible.length ? Math.round(done / eligible.length * 100) : 0 };
}

export function isLogComplete(habit, log) {
  if (!habit || !log || log.status === 'skip') return false;
  if (habit.type === 'count' || habit.type === 'duration') return Number(log.value) >= Number(habit.target || 1);
  return log.status === 'done';
}

export function habitStreak(habit, logs, today) {
  const byDate = new Map(logs.filter(log => log.habitId === habit.id).map(log => [log.date, log]));
  const start = new Date(`${habit.startDate}T12:00:00`);
  const end = new Date(`${today}T12:00:00`);
  let current = 0, longest = 0, run = 0;
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const date = day.toLocaleDateString('en-CA');
    if (!isScheduled(habit, date)) continue;
    const log = byDate.get(date);
    const completed = isLogComplete(habit, log);
    if (completed) { run++; longest = Math.max(longest, run); }
    else run = 0;
  }
  longest = Math.max(longest, run);
  const day = new Date(`${today}T12:00:00`);
  // Today's scheduled habit can still be completed, so streaks carry through the day.
  const todayLog = byDate.get(today);
  const pendingTarget = ['count', 'duration'].includes(habit.type) && todayLog?.status !== 'skip' && !isLogComplete(habit, todayLog);
  if (isScheduled(habit, today) && (!todayLog || pendingTarget)) day.setDate(day.getDate() - 1);
  for (; day >= start; day.setDate(day.getDate() - 1)) {
    const date = day.toLocaleDateString('en-CA');
    if (!isScheduled(habit, date)) continue;
    const log = byDate.get(date);
    if (!isLogComplete(habit, log)) break;
    current++;
  }
  return { current, longest };
}

export function goalProgress(goal, habits, logs, today = new Date().toLocaleDateString('en-CA')) {
  const linked = new Set(goal.habitIds || []);
  const byId = new Map(habits.filter(habit => linked.has(habit.id)).map(habit => [habit.id, habit]));
  const completed = logs.filter(log => {
    const habit = byId.get(log.habitId);
    return habit && log.date <= today && isScheduled(habit, log.date) && isLogComplete(habit, log);
  }).length;
  const target = Number(goal.target) > 0 ? Number(goal.target) : Math.max(byId.size * 30, 1);
  return { completed, target, percentage: Math.min(100, Math.round(completed / target * 100)), linkedHabits: byId.size };
}

export function validateBackup(data) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.habits) || !Array.isArray(data.logs)) return false;
  if (!['goals', 'journal', 'focus'].every(key => data[key] === undefined || Array.isArray(data[key]))) return false;
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const validRows = (rows, required) => rows.length <= 10000 && rows.every(row => row && typeof row === 'object' && !Array.isArray(row)
    && required.every(key => typeof row[key] === 'string' && row[key].length > 0));
  const uniqueIds = rows => new Set(rows.map(row => row.id)).size === rows.length;
  if (!validRows(data.habits, ['id', 'name', 'startDate', 'frequency']) || data.habits.some(h =>
    !validId(h.id) || h.name.length > 80 || !validDate(h.startDate) || (h.endDate && !validDate(h.endDate))
    || (h.endDate && h.endDate < h.startDate)
    || !['daily', 'weekdays', 'weekends', 'weekly', 'custom'].includes(h.frequency)
    || !['boolean', 'count', 'duration'].includes(h.type || 'boolean')
    || (h.frequency === 'weekly' && (!Array.isArray(h.days) || !h.days.length))
    || (h.days !== undefined && (!Array.isArray(h.days) || h.days.some(day => !Number.isInteger(day) || day < 0 || day > 6)))
    || (h.color !== undefined && (typeof h.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(h.color)))
    || (h.target !== undefined && (!Number.isFinite(Number(h.target)) || Number(h.target) < 1)))) return false;
  if (!uniqueIds(data.habits) || !validRows(data.logs, ['id', 'habitId', 'date', 'status']) || !uniqueIds(data.logs) || new Set(data.logs.map(log => `${log.habitId}:${log.date}`)).size !== data.logs.length || data.logs.some(log =>
    !validId(log.id) || !validId(log.habitId) || !validDate(log.date) || !['done', 'skip'].includes(log.status)
    || (log.value !== undefined && (!Number.isFinite(Number(log.value)) || Number(log.value) < 0))
    || (log.reason !== undefined && (typeof log.reason !== 'string' || log.reason.length > 500)))) return false;
  if (data.goals !== undefined) {
    if (!validRows(data.goals, ['id', 'title']) || !uniqueIds(data.goals)) return false;
    for (const goal of data.goals) {
      if (!validId(goal.id) || goal.title.length > 100
        || (goal.habitIds !== undefined && (!Array.isArray(goal.habitIds) || goal.habitIds.some(id => !validId(id))))) return false;
      if (goal.milestones !== undefined) {
        if (!Array.isArray(goal.milestones) || goal.milestones.length > 100) return false;
        if (goal.milestones.some(m => !m || !validId(m.id) || typeof m.title !== 'string' || m.title.length > 200
          || (m.completed !== undefined && typeof m.completed !== 'boolean'))) return false;
        if (new Set(goal.milestones.map(m => m.id)).size !== goal.milestones.length) return false;
      }
    }
  }
  if (data.journal && (!validRows(data.journal, ['id', 'date', 'body']) || !uniqueIds(data.journal) || data.journal.some(entry =>
    !validId(entry.id) || !validDate(entry.date) || entry.body.length > 5000 || (entry.title !== undefined && (typeof entry.title !== 'string' || entry.title.length > 100))))) return false;
  if (data.focus && (!validRows(data.focus, ['id', 'date']) || !uniqueIds(data.focus) || data.focus.some(session =>
    !validId(session.id) || !validDate(session.date) || (session.duration !== undefined && (!Number.isFinite(Number(session.duration)) || Number(session.duration) <= 0))))) return false;
  if (data.achievements !== undefined && (!Array.isArray(data.achievements) || data.achievements.length > 1000
    || data.achievements.some(item => !item || !validId(item.id)))) return false;
  if (data.reminderSent !== undefined && (!Array.isArray(data.reminderSent) || data.reminderSent.length > 10000
    || data.reminderSent.some(item => typeof item !== 'string' || item.length > 256))) return false;
  if (data.settings !== undefined && (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)
    || (data.settings.theme !== undefined && !['light', 'dark'].includes(data.settings.theme))
    || (data.settings.weekStart !== undefined && !['monday', 'sunday'].includes(data.settings.weekStart))
    || (data.settings.reminders !== undefined && typeof data.settings.reminders !== 'boolean')
    || (data.settings.timezone !== undefined && (typeof data.settings.timezone !== 'string' || data.settings.timezone.length > 64)))) return false;
  return true;
}

export function remainingSeconds(deadline, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function shiftMonth(date, offset) {
  const shifted = new Date(date.getFullYear(), date.getMonth(), 1);
  shifted.setMonth(shifted.getMonth() + Number(offset));
  return shifted;
}


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
  const done = eligible.filter(habit => {
    const log = logs.find(row => row.habitId === habit.id && row.date === date);
    if (!log) return false;
    if (habit.type === 'count' || habit.type === 'duration') return Number(log.value) >= Number(habit.target || 1);
    return log.status === 'done';
  }).length;
  return { eligible, done, remaining: eligible.length - done, percentage: eligible.length ? Math.round(done / eligible.length * 100) : 0 };
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
    const completed = habit.type === 'count' || habit.type === 'duration'
      ? Number(log?.value) >= Number(habit.target || 1)
      : log?.status === 'done';
    if (completed) { run++; longest = Math.max(longest, run); }
    else run = 0;
  }
  longest = Math.max(longest, run);
  const day = new Date(`${today}T12:00:00`);
  // Today's scheduled habit can still be completed, so streaks carry through the day.
  if (isScheduled(habit, today) && !byDate.has(today)) day.setDate(day.getDate() - 1);
  for (; day >= start; day.setDate(day.getDate() - 1)) {
    const date = day.toLocaleDateString('en-CA');
    if (!isScheduled(habit, date)) continue;
    const log = byDate.get(date);
    const completed = habit.type === 'count' || habit.type === 'duration'
      ? Number(log?.value) >= Number(habit.target || 1)
      : log?.status === 'done';
    if (!completed) break;
    current++;
  }
  return { current, longest };
}

export function validateBackup(data) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.habits) || !Array.isArray(data.logs)) return false;
  if (!['goals', 'journal', 'focus'].every(key => data[key] === undefined || Array.isArray(data[key]))) return false;
  const validRows = (rows, required) => rows.every(row => row && typeof row === 'object' && !Array.isArray(row)
    && required.every(key => typeof row[key] === 'string' && row[key].length > 0));
  if (!validRows(data.habits, ['id', 'name', 'startDate', 'frequency'])) return false;
  if (!validRows(data.logs, ['id', 'habitId', 'date', 'status'])) return false;
  if (data.logs.some(log => !['done', 'skip'].includes(log.status))) return false;
  if (data.goals && !validRows(data.goals, ['id', 'title'])) return false;
  if (data.journal && !validRows(data.journal, ['id', 'date', 'body'])) return false;
  if (data.focus && !validRows(data.focus, ['id', 'date'])) return false;
  return data.settings === undefined || (!!data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings));
}

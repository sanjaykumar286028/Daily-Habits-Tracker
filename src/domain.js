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
  const done = eligible.filter(habit => logs.some(log => log.habitId === habit.id && log.date === date && ['done', 'skip'].includes(log.status))).length;
  return { eligible, done, remaining: eligible.length - done, percentage: eligible.length ? Math.round(done / eligible.length * 100) : 0 };
}

export function validateBackup(data) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.habits) || !Array.isArray(data.logs)) return false;
  return ['goals', 'journal', 'focus'].every(key => data[key] === undefined || Array.isArray(data[key]));
}

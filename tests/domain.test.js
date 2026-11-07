import test from 'node:test';
import assert from 'node:assert/strict';
import { isScheduled, completionSummary, validateBackup, habitStreak, goalProgress, remainingSeconds, shiftMonth, focusDurationFromParts, formatFocusTime } from '../src/domain.js';

test('scheduling respects weekdays, selected days, and start dates', () => {
  const weekdays = { startDate: '2026-11-02', frequency: 'weekdays' };
  assert.equal(isScheduled(weekdays, '2026-11-02'), true);
  assert.equal(isScheduled(weekdays, '2026-11-07'), false);
  assert.equal(isScheduled(weekdays, '2026-11-01'), false);
  assert.equal(isScheduled({ startDate: '2026-11-01', frequency: 'weekly', days: [1] }, '2026-11-02'), true);
});

test('completion summary excludes archived and unscheduled habits', () => {
  const habits = [{ id: 'a', startDate: '2026-01-01' }, { id: 'b', startDate: '2026-01-01', archived: true }, { id: 'c', startDate: '2026-01-01', frequency: 'weekends' }];
  const result = completionSummary(habits, [{ habitId: 'a', date: '2026-11-02', status: 'done' }], '2026-11-02');
  assert.deepEqual(result.eligible.map(h => h.id), ['a']);
  assert.equal(result.percentage, 100);
  assert.equal(result.remaining, 0);
});

test('backup validation checks version and collection shapes', () => {
  assert.equal(validateBackup({ schemaVersion: 1, habits: [], logs: [] }), true);
  assert.equal(validateBackup({ schemaVersion: 2, habits: [], logs: [] }), false);
  assert.equal(validateBackup({ schemaVersion: 1, habits: {}, logs: [] }), false);
});

test('count and duration habits only complete at their target; skipped is not complete', () => {
  const habits = [
    { id: 'pages', type: 'count', target: 10, startDate: '2026-01-01' },
    { id: 'walk', type: 'duration', target: 20, startDate: '2026-01-01' },
    { id: 'rest', type: 'boolean', startDate: '2026-01-01' },
  ];
  const logs = [
    { habitId: 'pages', date: '2026-11-05', status: 'done', value: 7 },
    { habitId: 'walk', date: '2026-11-05', status: 'done', value: 20 },
    { habitId: 'rest', date: '2026-11-05', status: 'skip' },
  ];
  assert.deepEqual(completionSummary(habits, logs, '2026-11-05'), {
    eligible: habits, done: 1, remaining: 2, percentage: 33,
  });
});

test('streaks skip unscheduled weekdays and do not include future dates', () => {
  const habit = { id: 'weekly', startDate: '2026-10-26', frequency: 'weekly', days: [1], type: 'boolean' };
  const logs = [
    { habitId: 'weekly', date: '2026-10-26', status: 'done' },
    { habitId: 'weekly', date: '2026-11-02', status: 'done' },
    { habitId: 'weekly', date: '2026-11-09', status: 'done' },
  ];
  assert.deepEqual(habitStreak(habit, logs, '2026-11-05'), { current: 2, longest: 2 });
});

test('backup validation rejects markup-bearing IDs, invalid dates, duplicate logs, and malformed milestones', () => {
  const backup = {
    schemaVersion: 1,
    habits: [{ id: 'walk_1', name: 'Walk', startDate: '2026-11-01', frequency: 'daily', type: 'boolean' }],
    logs: [],
    goals: [{ id: 'goal_1', title: 'Move more', milestones: [{ id: 'step_1', title: 'First week', completed: false }] }],
  };
  assert.equal(validateBackup(backup), true);
  assert.equal(validateBackup({ ...backup, habits: [{ ...backup.habits[0], id: '" onfocus="alert(1)' }] }), false);
  assert.equal(validateBackup({ ...backup, habits: [{ ...backup.habits[0], startDate: '2026-02-30' }] }), false);
  assert.equal(validateBackup({ ...backup, goals: [{ ...backup.goals[0], milestones: [{ id: 'bad<script>', title: 'Step' }] }] }), false);
  assert.equal(validateBackup({ ...backup, logs: [
    { id: 'log_1', habitId: 'walk_1', date: '2026-11-02', status: 'done' },
    { id: 'log_2', habitId: 'walk_1', date: '2026-11-02', status: 'skip' },
  ] }), false);
});

test('habit end dates constrain scheduling and reject reversed ranges in backups', () => {
  const habit = { startDate: '2026-11-02', endDate: '2026-11-04', frequency: 'daily' };
  assert.equal(isScheduled(habit, '2026-11-04'), true);
  assert.equal(isScheduled(habit, '2026-11-05'), false);
  const backup = { schemaVersion: 1, habits: [{ id: 'habit_1', name: 'Read', ...habit, endDate: '2026-11-01' }], logs: [] };
  assert.equal(validateBackup(backup), false);
});

test('goal progress counts linked scheduled completions only through today', () => {
  const habits = [
    { id: 'daily', startDate: '2026-11-01', frequency: 'daily', type: 'boolean' },
    { id: 'weekly', startDate: '2026-11-01', frequency: 'weekly', days: [1], type: 'count', target: 3 },
  ];
  const logs = [
    { habitId: 'daily', date: '2026-11-02', status: 'done' },
    { habitId: 'weekly', date: '2026-11-02', status: 'done', value: 2 },
    { habitId: 'daily', date: '2026-11-06', status: 'done' },
  ];
  assert.deepEqual(goalProgress({ habitIds: ['daily', 'weekly'], target: 2 }, habits, logs, '2026-11-05'), {
    completed: 1, target: 2, percentage: 50, linkedHabits: 2,
  });
});

test('a partial count target does not break the current streak before day end', () => {
  const habit = { id: 'pages', startDate: '2026-11-03', frequency: 'daily', type: 'count', target: 10 };
  const logs = [
    { habitId: 'pages', date: '2026-11-03', status: 'done', value: 10 },
    { habitId: 'pages', date: '2026-11-04', status: 'done', value: 10 },
    { habitId: 'pages', date: '2026-11-05', status: 'done', value: 3 },
  ];
  assert.deepEqual(habitStreak(habit, logs, '2026-11-05'), { current: 2, longest: 2 });
});

test('focus remaining time follows the deadline rather than timer tick count', () => {
  assert.equal(remainingSeconds(15000, 1000), 14);
  assert.equal(remainingSeconds(1000, 1000), 0);
  assert.equal(remainingSeconds(500, 1000), 0);
});

test('focus timer accepts and formats custom minute and hour durations', () => {
  assert.equal(focusDurationFromParts(0, 25), 25 * 60);
  assert.equal(focusDurationFromParts(2, 30), 150 * 60);
  assert.equal(focusDurationFromParts(999, 59), (999 * 60 + 59) * 60);
  assert.equal(focusDurationFromParts(0, 0), null);
  assert.equal(focusDurationFromParts(1, 60), null);
  assert.equal(focusDurationFromParts(1000, 0), null);
  assert.equal(focusDurationFromParts(1.5, 0), null);
  assert.equal(formatFocusTime(25 * 60), '25:00');
  assert.equal(formatFocusTime(2 * 3600 + 30 * 60 + 5), '2:30:05');
});

test('calendar month navigation clamps to month start across short months', () => {
  const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  assert.equal(localDate(shiftMonth(new Date(2026, 2, 31), -1)), '2026-02-01');
  assert.equal(localDate(shiftMonth(new Date(2026, 0, 31), 1)), '2026-02-01');
  assert.equal(shiftMonth(new Date(2026, 11, 20), 1).getMonth(), 0);
});


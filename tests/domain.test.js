import test from 'node:test';
import assert from 'node:assert/strict';
import { isScheduled, completionSummary, validateBackup, habitStreak } from '../src/domain.js';

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

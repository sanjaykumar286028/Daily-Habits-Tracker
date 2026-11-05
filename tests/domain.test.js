import test from 'node:test';
import assert from 'node:assert/strict';
import { isScheduled, completionSummary, validateBackup } from '../src/domain.js';

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

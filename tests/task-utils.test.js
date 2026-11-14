import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDueTaskReminders, buildUpcomingTaskReminders, normalizeTaskStatuses, taskStatus, validateTask } from '../src/task-utils.js';

const base = { id:'task-1', title:'Physics chapter', startAt:'2026-11-14T10:00:00.000Z', endAt:'2026-11-14T11:00:00.000Z', status:'pending', reminderLeadMinutes:[10,5] };

test('task status stays pending or in progress until its deadline, then becomes overdue', () => {
  assert.equal(taskStatus(base, Date.parse('2026-11-14T10:30:00Z')), 'pending');
  assert.equal(taskStatus({ ...base, status:'in_progress' }, Date.parse('2026-11-14T10:30:00Z')), 'in_progress');
  assert.equal(taskStatus(base, Date.parse('2026-11-14T11:00:00Z')), 'overdue');
  assert.equal(taskStatus({ ...base, status:'completed' }, Date.parse('2026-11-14T12:00:00Z')), 'completed');
  const normalized = normalizeTaskStatuses([base], Date.parse('2026-11-14T11:00:00Z'));
  assert.equal(normalized.tasks[0].status, 'overdue');
  assert.equal(normalized.changed, true);
});

test('deadline reminders include lead times and exact due time without duplicates', () => {
  const settings = { taskReminders:true, deadlineAlerts:true, quietHoursEnabled:false };
  const dueAt = new Date('2026-11-14T11:00:00Z');
  const upcoming = buildUpcomingTaskReminders({ tasks:[base], settings, now:new Date('2026-11-14T10:00:00Z') });
  assert.deepEqual(upcoming.map(item=>item.type), ['lead-10','lead-5','deadline']);
  const lead = buildDueTaskReminders({ tasks:[base], settings, now:new Date('2026-11-14T10:50:15Z') });
  assert.equal(lead.length, 1);
  assert.equal(lead[0].body, 'Physics chapter is due in 10 minutes.');
  const deadline = buildDueTaskReminders({ tasks:[base], settings, now:dueAt });
  assert.equal(deadline.length, 1);
  assert.match(deadline[0].body, /Time is up!.*still pending/);
  assert.equal(buildDueTaskReminders({ tasks:[base], settings, sent:[deadline[0].key], now:dueAt }).length, 0);
});

test('completed tasks suppress deadline notifications and quiet hours suppress scheduled alerts', () => {
  const completed = { ...base, status:'completed', completedAt:'2026-11-14T10:30:00Z' };
  assert.equal(buildUpcomingTaskReminders({ tasks:[completed], settings:{ taskReminders:true, deadlineAlerts:true }, now:new Date('2026-11-14T10:00:00Z') }).length, 0);
  const nightTask = { ...base, startAt:'2026-11-14T22:00:00.000Z', endAt:'2026-11-14T23:00:00.000Z' };
  const quiet = buildUpcomingTaskReminders({ tasks:[nightTask], settings:{ taskReminders:true, deadlineAlerts:true, quietHoursEnabled:true, quietHoursStart:'22:00', quietHoursEnd:'08:00' }, now:new Date('2026-11-14T22:00:00Z') });
  assert.equal(quiet.length, 0);
});

test('task validation rejects invalid dates, statuses and reminder lead choices', () => {
  assert.equal(validateTask(base), true);
  assert.equal(validateTask({ ...base, status:'done' }), false);
  assert.equal(validateTask({ ...base, endAt:'not-a-date' }), false);
  assert.equal(validateTask({ ...base, reminderLeadMinutes:[3] }), false);
});


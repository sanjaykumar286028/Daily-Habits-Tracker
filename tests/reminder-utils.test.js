import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDueHabitReminders, buildUpcomingReminders, isQuietTime, moveReminderOutOfQuietHours, reminderId } from '../src/reminder-utils.js';

const habit = overrides => ({ id:'habit-1', name:'Read', startDate:'2026-11-01', frequency:'daily', time:'09:30', ...overrides });

test('quiet hours handle daytime and overnight windows', () => {
  assert.equal(isQuietTime('13:00', '12:00', '14:00'), true);
  assert.equal(isQuietTime('23:30', '22:00', '08:00'), true);
  assert.equal(isQuietTime('07:59', '22:00', '08:00'), true);
  assert.equal(isQuietTime('08:00', '22:00', '08:00'), false);
  assert.equal(isQuietTime('12:00', '12:00', '12:00'), false);
});

test('snoozed reminders move past an active overnight quiet window', () => {
  const settings = { quietHoursEnabled:true, quietHoursStart:'22:00', quietHoursEnd:'08:00' };
  assert.equal(moveReminderOutOfQuietHours(new Date(2026, 10, 7, 23, 5), settings).getTime(), new Date(2026, 10, 8, 8, 0).getTime());
  assert.equal(moveReminderOutOfQuietHours(new Date(2026, 10, 8, 7, 50), settings).getTime(), new Date(2026, 10, 8, 8, 0).getTime());
  assert.equal(moveReminderOutOfQuietHours(new Date(2026, 10, 8, 9, 0), settings).getTime(), new Date(2026, 10, 8, 9, 0).getTime());
});

test('upcoming reminders respect schedule, completion, quiet hours, and past times', () => {
  const now = new Date(2026, 10, 7, 8, 0, 0);
  const habits = [
    habit(),
    habit({ id:'done', time:'10:00' }),
    habit({ id:'quiet', time:'23:00' }),
    habit({ id:'archived', time:'10:30', archived:true }),
    habit({ id:'weekday', frequency:'weekdays', time:'11:00' }),
    habit({ id:'past', time:'07:00' }),
  ];
  const reminders = buildUpcomingReminders({
    habits,
    logs:[{ id:'log-1', habitId:'done', date:'2026-11-07', status:'done' }],
    settings:{ reminders:true, quietHoursEnabled:true, quietHoursStart:'22:00', quietHoursEnd:'08:00' },
    now,
    days:1,
  });
  assert.deepEqual(reminders.map(item => item.habitId), ['habit-1']);
  assert.equal(reminders[0].at.getHours(), 9);
  assert.equal(reminders[0].at.getMinutes(), 30);
});

test('upcoming reminders schedule selected weekdays and suppress existing sends', () => {
  const reminders = buildUpcomingReminders({
    habits:[habit({ frequency:'custom', days:[1,3,5] })],
    logs:[],
    settings:{ reminders:true, reminderSent:['habit-1:2026-11-09'] },
    now:new Date(2026, 10, 7, 8, 0, 0),
    days:5,
  });
  assert.deepEqual(reminders.map(item => item.date), ['2026-11-11']);
});

test('reminder identifiers remain positive 32-bit values and distinguish dates', () => {
  const first = reminderId('habit-1', '2026-11-07');
  assert.ok(first > 0 && first <= 2_000_000_000);
  assert.notEqual(first, reminderId('habit-1', '2026-11-08'));
});

test('due habit reminders survive a missed polling minute but remain deduplicated', () => {
  const now = new Date(2026, 10, 9, 17, 0, 12);
  const habits = [{ id:'read', name:'Read', time:'17:00', type:'boolean', frequency:'daily' }];
  const settings = { reminders:true, reminderSent:[] };
  const reminders = buildDueHabitReminders({ habits, logs:[], settings, now });
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].body, 'Read is scheduled now. Your progress is still pending.');
  assert.equal(buildDueHabitReminders({ habits, logs:[], settings:{...settings, reminderSent:['read:2026-11-09']}, now }).length, 0);
  assert.equal(buildDueHabitReminders({ habits, logs:[{habitId:'read',date:'2026-11-09',status:'done'}], settings, now }).length, 0);
  assert.equal(buildDueHabitReminders({ habits, logs:[], settings, now:new Date(2026,10,9,17,31) }).length, 0);
});


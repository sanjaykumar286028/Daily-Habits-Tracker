import test from 'node:test';
import assert from 'node:assert/strict';
import { completedFocusSession, createFocusSession, focusProgress, focusRemainingSeconds, pauseFocusSession, resumeFocusSession } from '../src/focus-timer.js';

test('focus session progress follows its absolute deadline without interval drift', () => {
  const session = createFocusSession(1800, { id:'s1', now:1000 });
  assert.equal(focusRemainingSeconds(session, 601000), 1200);
  assert.equal(focusProgress(session, 601000), 2 / 3);
  assert.equal(focusProgress(session, 901000), 0.5);
  assert.equal(focusProgress(session, 1201000), 1 / 3);
  assert.equal(completedFocusSession(session, 1801000).remainingSeconds, 0);
});

test('pause and resume preserve remaining time across refreshes', () => {
  const running = createFocusSession(60, { id:'s2', now:10_000 });
  const paused = pauseFocusSession(running, 31_500);
  assert.equal(paused.paused, true);
  assert.equal(paused.remainingSeconds, 39);
  assert.equal(focusProgress(paused, 500_000), 0.65);
  const resumed = resumeFocusSession(paused, 500_000);
  assert.equal(resumed.deadlineAt, 539_000);
  assert.equal(focusRemainingSeconds(resumed, 520_000), 19);
});

test('focus completion is emitted only when an unpaused deadline has expired', () => {
  const session = createFocusSession(10, { id:'s3', now:0 });
  assert.equal(completedFocusSession(session, 9999), null);
  assert.equal(completedFocusSession(pauseFocusSession(session, 5000), 60_000), null);
  assert.equal(completedFocusSession(session, 10_000).completedAt, 10_000);
  assert.throws(() => createFocusSession(0, { now:0 }), /at least one second/);
});

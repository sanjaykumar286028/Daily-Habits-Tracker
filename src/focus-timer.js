export function createFocusSession(durationSeconds, { id, now = Date.now() } = {}) {
  const duration = Number(durationSeconds);
  if (!Number.isInteger(duration) || duration < 1) throw new Error('Focus duration must be at least one second.');
  return {
    id: id || globalThis.crypto?.randomUUID?.() || `${now}-${Math.random().toString(36).slice(2)}`,
    durationSeconds: duration,
    startedAt: now,
    deadlineAt: now + duration * 1000,
    remainingSeconds: duration,
    paused: false,
  };
}

export function focusRemainingSeconds(session, now = Date.now()) {
  if (!session) return 0;
  if (session.paused) return Math.max(0, Math.ceil(Number(session.remainingSeconds) || 0));
  return Math.max(0, Math.ceil((Number(session.deadlineAt) - now) / 1000));
}

export function focusProgress(session, now = Date.now()) {
  if (!session?.durationSeconds) return 0;
  return Math.min(1, focusRemainingSeconds(session, now) / session.durationSeconds);
}

export function pauseFocusSession(session, now = Date.now()) {
  if (!session || session.paused) return session;
  const remainingSeconds = focusRemainingSeconds(session, now);
  return { ...session, deadlineAt: null, remainingSeconds, paused: true };
}

export function resumeFocusSession(session, now = Date.now()) {
  if (!session || !session.paused || focusRemainingSeconds(session, now) <= 0) return session;
  const remainingSeconds = focusRemainingSeconds(session, now);
  return { ...session, deadlineAt: now + remainingSeconds * 1000, remainingSeconds, paused: false };
}

export function completedFocusSession(session, now = Date.now()) {
  if (!session || session.paused || focusRemainingSeconds(session, now) > 0) return null;
  return { ...session, deadlineAt: null, remainingSeconds: 0, paused: true, completedAt: now };
}

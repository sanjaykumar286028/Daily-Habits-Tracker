export function canSyncAuthenticatedRecords(user, { googleIdentity = false, approved = false } = {}) {
  return Boolean(user?.id) && (!googleIdentity || approved);
}

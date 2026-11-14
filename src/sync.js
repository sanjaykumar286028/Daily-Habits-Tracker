const COLLECTIONS = ['habits', 'logs', 'tasks', 'goals', 'journal', 'focus', 'achievements'];

function stamp(record, fallback) {
  const time = Date.parse(record?.updatedAt || '');
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date(fallback).toISOString();
}

export function makeSyncRows(state, userId) {
  const updatedFallback = Number(state.savedAt) || Date.now();
  const rows = [];
  for (const collection of COLLECTIONS) {
    for (const record of state[collection] || []) {
      if (!record?.id) continue;
      rows.push({ user_id:userId, collection, record_id:String(record.id), record, updated_at:stamp(record, updatedFallback), deleted_at:null });
    }
  }
  rows.push({ user_id:userId, collection:'preferences', record_id:'profile', record:state.settings || {}, updated_at:stamp(state.settings, updatedFallback), deleted_at:null });
  for (const tombstone of state.syncTombstones || []) {
    if (!COLLECTIONS.includes(tombstone.collection) || !tombstone.recordId) continue;
    rows.push({ user_id:userId, collection:tombstone.collection, record_id:String(tombstone.recordId), record:{}, updated_at:stamp(tombstone, updatedFallback), deleted_at:stamp(tombstone, updatedFallback) });
  }
  return rows;
}

export function mergeSyncRecords(state, remoteRows, userId, now = Date.now()) {
  const merged = structuredClone(state);
  const localRows = makeSyncRows(merged, userId);
  const localByKey = new Map(localRows.map(row => [`${row.collection}:${row.record_id}`, row]));
  const selected = new Map();
  for (const row of [...remoteRows, ...localRows]) {
    if (row.user_id !== userId) continue;
    const key = `${row.collection}:${row.record_id}`;
    const previous = selected.get(key);
    const time = Date.parse(row.updated_at || row.updatedAt || '') || 0;
    const previousTime = previous ? Date.parse(previous.updated_at || previous.updatedAt || '') || 0 : -1;
    // On timestamp ties prefer local data so a legacy guest record can be
    // migrated deterministically; subsequent writes receive a newer timestamp.
    if (!previous || time > previousTime || (time === previousTime && localByKey.get(key) === row)) selected.set(key, row);
  }

  for (const collection of COLLECTIONS) merged[collection] = [];
  merged.syncTombstones = [];
  for (const row of selected.values()) {
    const updatedAt = row.updated_at || row.updatedAt || new Date(now).toISOString();
    if (row.deleted_at) {
      merged.syncTombstones.push({ collection:row.collection, recordId:row.record_id, updatedAt:row.deleted_at });
      continue;
    }
    if (row.collection === 'preferences' && row.record_id === 'profile') {
      merged.settings = { ...merged.settings, ...row.record };
      merged.settings.updatedAt = updatedAt;
    } else if (COLLECTIONS.includes(row.collection) && row.record && typeof row.record === 'object') {
      merged[row.collection].push({ ...row.record, updatedAt:row.record.updatedAt || updatedAt });
    }
  }
  return { state:merged, rows:makeSyncRows(merged,userId) };
}

export async function syncState(client, state, userId, now = Date.now()) {
  const remote = await client.getSyncRecords(userId);
  const result = mergeSyncRecords(state, remote, userId, now);
  await client.upsertSyncRecords(result.rows);
  return result.state;
}


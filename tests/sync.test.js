import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSyncRows, mergeSyncRecords, syncState } from '../src/sync.js';

const now = Date.parse('2026-11-05T12:00:00.000Z');
const baseState = () => ({
  schemaVersion:1, savedAt:now,
  habits:[{ id:'habit-1', name:'Local', updatedAt:'2026-11-05T10:00:00.000Z' }],
  tasks:[],
  logs:[], goals:[], journal:[], focus:[], achievements:[], settings:{ theme:'light', updatedAt:'2026-11-05T10:00:00.000Z' }, syncTombstones:[],
});

test('sync creates owner-scoped records and includes private journal only in an authenticated sync payload', () => {
  const state = baseState();
  state.journal.push({ id:'journal-1', date:'2026-11-05', body:'private reflection', updatedAt:'2026-11-05T11:00:00.000Z' });
  state.tasks.push({ id:'task-1', title:'Submit assignment', endAt:'2026-11-05T12:00:00.000Z', status:'pending', updatedAt:'2026-11-05T11:00:00.000Z' });
  const rows = makeSyncRows(state, 'owner-1');
  assert.equal(rows.every(row => row.user_id === 'owner-1'), true);
  assert.equal(rows.find(row => row.collection === 'journal').record.body, 'private reflection');
  assert.equal(rows.find(row => row.collection === 'tasks').record.title, 'Submit assignment');
});

test('sync uses the newest per-record timestamp and ignores rows for other owners', () => {
  const local = baseState();
  const remote = [
    { user_id:'owner-1', collection:'habits', record_id:'habit-1', record:{ id:'habit-1', name:'Remote newer' }, updated_at:'2026-11-05T11:00:00.000Z' },
    { user_id:'other-user', collection:'habits', record_id:'foreign', record:{ id:'foreign', name:'Private' }, updated_at:'2026-11-05T11:30:00.000Z' },
  ];
  const result = mergeSyncRecords(local, remote, 'owner-1', now);
  assert.deepEqual(result.state.habits.map(row => row.name), ['Remote newer']);
  assert.equal(result.rows.some(row => row.record_id === 'foreign'), false);
});

test('sync preserves newer local edits and applies newer cloud tombstones', () => {
  const local = baseState();
  local.habits[0].name = 'New local';
  local.habits[0].updatedAt = '2026-11-05T11:30:00.000Z';
  let result = mergeSyncRecords(local, [{
    user_id:'owner-1', collection:'habits', record_id:'habit-1', record:{ id:'habit-1', name:'Old cloud' }, updated_at:'2026-11-05T10:30:00.000Z', deleted_at:null,
  }], 'owner-1', now);
  assert.equal(result.state.habits[0].name, 'New local');
  result = mergeSyncRecords(local, [{
    user_id:'owner-1', collection:'habits', record_id:'habit-1', record:{}, updated_at:'2026-11-05T11:45:00.000Z', deleted_at:'2026-11-05T11:45:00.000Z',
  }], 'owner-1', now);
  assert.equal(result.state.habits.length, 0);
  assert.equal(result.state.syncTombstones[0].recordId, 'habit-1');
});

test('sync uploads merged guest records and stores profile preferences through the client adapter', async () => {
  const calls = [];
  const client = {
    getSyncRecords:async userId => { calls.push(['read',userId]); return []; },
    upsertSyncRecords:async rows => { calls.push(['write',rows]); },
  };
  const result = await syncState(client, baseState(), 'owner-1', now);
  assert.equal(result.habits[0].name, 'Local');
  assert.deepEqual(calls[0], ['read','owner-1']);
  assert.equal(calls[1][1].some(row => row.collection === 'preferences'), true);
});


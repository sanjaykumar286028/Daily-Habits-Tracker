import test from 'node:test';
import assert from 'node:assert/strict';
import { canSyncAuthenticatedRecords } from '../src/sync-consent.js';

test('sync requires an authenticated user', () => {
  assert.equal(canSyncAuthenticatedRecords(null, { approved:true }), false);
  assert.equal(canSyncAuthenticatedRecords({}, { approved:true }), false);
});

test('email account sync follows the existing explicit sign-in consent', () => {
  assert.equal(canSyncAuthenticatedRecords({ id:'email-user' }, { googleIdentity:false, approved:false }), true);
});

test('Google account device sync stays blocked until the user approves it', () => {
  const user={ id:'google-user' };
  assert.equal(canSyncAuthenticatedRecords(user, { googleIdentity:true, approved:false }), false);
  assert.equal(canSyncAuthenticatedRecords(user, { googleIdentity:true, approved:true }), true);
});

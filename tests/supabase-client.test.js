import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseClient, validateSupabaseConfig } from '../src/supabase-client.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

function jsonResponse(body, status = 200) {
  return { ok:status >= 200 && status < 300, status, text:async () => JSON.stringify(body) };
}

test('Supabase configuration requires HTTPS except for local development', () => {
  const anonJwt = `header.${Buffer.from(JSON.stringify({ role:'anon' })).toString('base64url')}.signature`;
  assert.equal(validateSupabaseConfig('https://habits.supabase.co', `sb_publishable_${'x'.repeat(32)}`), true);
  assert.equal(validateSupabaseConfig('https://habits.supabase.co', anonJwt), true);
  assert.equal(validateSupabaseConfig('https://habits.supabase.co', `sb_secret_${'x'.repeat(32)}`), false);
  const serviceJwt = `header.${Buffer.from(JSON.stringify({ role:'service_role' })).toString('base64url')}.signature`;
  assert.equal(validateSupabaseConfig('https://habits.supabase.co', serviceJwt), false);
  assert.equal(validateSupabaseConfig('https://habits.supabase.co', 'publishable-key'), false);
  assert.equal(validateSupabaseConfig('http://habits.supabase.co', 'key'), false);
  assert.equal(validateSupabaseConfig('http://localhost:54321', `sb_publishable_${'x'.repeat(32)}`), true);
  assert.equal(validateSupabaseConfig('https://user:pass@habits.supabase.co', 'key'), false);
  assert.equal(validateSupabaseConfig('', ''), false);
});

test('password sign-in stores a user session and applies anon and bearer headers', async () => {
  const calls = [];
  const storage = memoryStorage();
  const client = new SupabaseClient({
    url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage,
    fetchImpl:async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ access_token:'user-token', refresh_token:'refresh-token', expires_in:3600, user:{ id:'user-1', email:'person@example.com' } });
    },
  });
  const user = await client.signIn('person@example.com', 'correct horse battery');
  assert.equal(user.id, 'user-1');
  assert.equal(client.session.access_token, 'user-token');
  assert.equal(calls[0].options.headers.apikey, `sb_publishable_${'x'.repeat(32)}`);
  assert.equal(calls[0].options.headers.Authorization, `Bearer sb_publishable_${'x'.repeat(32)}`);
  assert.equal(calls[0].options.credentials, 'omit');
});

test('expired sessions refresh before restoring the signed-in user', async () => {
  const storage = memoryStorage();
  const calls = [];
  const client = new SupabaseClient({
    url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage,
    fetchImpl:async (url, options) => {
      calls.push({ url, options });
      if (url.includes('grant_type=refresh_token')) return jsonResponse({ access_token:'fresh-token', refresh_token:'next-refresh', expires_in:3600, user:{ id:'user-2' } });
      return jsonResponse({ id:'user-2', email:'person@example.com' });
    },
  });
  client.saveSession({ access_token:'expired-token', refresh_token:'old-refresh', expires_at:1, user:{ id:'user-2' } });
  const user = await client.restoreSession();
  assert.equal(user.id, 'user-2');
  assert.equal(client.session.access_token, 'fresh-token');
  assert.equal(calls.length, 2);
  assert.match(calls[1].options.headers.Authorization, /fresh-token/);
});

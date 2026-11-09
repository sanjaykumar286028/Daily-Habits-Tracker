import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseClient, validateAuthCredentials, validatePasswordConfirmation, validateSupabaseConfig } from '../src/supabase-client.js';

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
  const wrongProjectJwt = `header.${Buffer.from(JSON.stringify({ role:'anon', ref:'another-project' })).toString('base64url')}.signature`;
  assert.equal(validateSupabaseConfig('https://habits.supabase.co', wrongProjectJwt), false);
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

test('fetch adapter is called with the browser global receiver', async () => {
  let receiver;
  const client = new SupabaseClient({
    url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage:memoryStorage(),
    fetchImpl:function () {
      receiver = this;
      return Promise.resolve(jsonResponse({ id:'user-1' }));
    },
  });
  await client.rawRequest('/auth/v1/user');
  assert.equal(receiver, globalThis);
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

test('credential validation trims email and rejects invalid email or short passwords before requests', async () => {
  assert.equal(validateAuthCredentials(' person@example.com ', '12345678'), 'person@example.com');
  assert.throws(() => validateAuthCredentials('not-an-email', '12345678'), /valid email/);
  assert.throws(() => validateAuthCredentials('person@example.com', 'short'), /at least 8/);
  let calls = 0;
  const client = new SupabaseClient({ url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage:memoryStorage(), fetchImpl:async () => { calls++; return jsonResponse({}); } });
  await assert.rejects(client.signIn('bad', '12345678'), /valid email/);
  await assert.rejects(client.signUp('person@example.com', 'short'), /at least 8/);
  assert.equal(calls, 0);
  assert.equal(validatePasswordConfirmation('12345678', '12345678'), true);
  assert.throws(() => validatePasswordConfirmation('12345678', '87654321'), /do not match/);
  assert.throws(() => validatePasswordConfirmation('short', 'short'), /at least 8/);
});

test('sign-up requests the configured app confirmation redirect and leaves confirmed-email signups unauthenticated', async () => {
  const calls = [];
  const client = new SupabaseClient({
    url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage:memoryStorage(), redirectUrl:'https://example.github.io/habits/',
    fetchImpl:async (url, options) => { calls.push({ url, options }); return jsonResponse({ id:'user-1', email:'person@example.com' }); },
  });
  const user = await client.signUp(' person@example.com ', 'correct horse battery');
  assert.equal(user.id, 'user-1');
  assert.equal(client.session, null);
  assert.match(calls[0].url, /\/auth\/v1\/signup\?redirect_to=https%3A%2F%2Fexample\.github\.io%2Fhabits%2F$/);
  assert.equal(JSON.parse(calls[0].options.body).email, 'person@example.com');
});

test('duplicate registration errors are returned without creating a local session', async () => {
  const client = new SupabaseClient({
    url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage:memoryStorage(),
    fetchImpl:async () => jsonResponse({ msg:'User already registered' }, 400),
  });
  await assert.rejects(client.signUp('person@example.com', 'correct horse battery'), /already registered/);
  assert.equal(client.session, null);
});

test('incorrect login credentials preserve the server error and create no session', async () => {
  const client = new SupabaseClient({
    url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage:memoryStorage(),
    fetchImpl:async () => jsonResponse({ msg:'Invalid login credentials' }, 400),
  });
  await assert.rejects(client.signIn('person@example.com', 'correct horse battery'), /Invalid login credentials/);
  assert.equal(client.session, null);
});

test('Google OAuth uses the app callback and only OpenID, email, and profile scopes', () => {
  const client = new SupabaseClient({
    url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage:memoryStorage(), redirectUrl:'https://example.github.io/habits/',
  });
  const url = new URL(client.googleOAuthUrl());
  assert.equal(url.origin, 'https://habits.supabase.co');
  assert.equal(url.pathname, '/auth/v1/authorize');
  assert.equal(url.searchParams.get('provider'), 'google');
  assert.equal(url.searchParams.get('redirect_to'), 'https://example.github.io/habits/');
  assert.equal(url.searchParams.get('scopes'), 'openid email profile');
});

test('Google OAuth rejects an invalid or external app callback', () => {
  const invalid = new SupabaseClient({ url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage:memoryStorage(), redirectUrl:'javascript:alert(1)' });
  assert.throws(() => invalid.googleOAuthUrl(), /return URL is invalid/);
  const external = new SupabaseClient({ url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage:memoryStorage(), redirectUrl:'https://attacker.example/callback' });
  const priorLocation = globalThis.location;
  globalThis.location = { origin:'https://example.github.io' };
  try { assert.throws(() => external.googleOAuthUrl(), /must stay on this app/); }
  finally { if (priorLocation === undefined) delete globalThis.location; else globalThis.location = priorLocation; }
});

test('confirmation resend and recovery use the app redirect and email-only request body', async () => {
  const calls = [];
  const client = new SupabaseClient({
    url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage:memoryStorage(), redirectUrl:'https://example.github.io/habits/',
    fetchImpl:async (url, options) => { calls.push({ url, options }); return jsonResponse({}); },
  });
  await client.resendSignupConfirmation(' person@example.com ');
  await client.recoverPassword('person@example.com');
  assert.match(calls[0].url, /\/auth\/v1\/resend\?redirect_to=https%3A%2F%2Fexample\.github\.io%2Fhabits%2F$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { type:'signup', email:'person@example.com' });
  assert.match(calls[1].url, /\/auth\/v1\/recover\?redirect_to=https%3A%2F%2Fexample\.github\.io%2Fhabits%2F$/);
  assert.deepEqual(JSON.parse(calls[1].options.body), { email:'person@example.com' });
});

test('email confirmation and recovery callbacks persist sessions and clean token fragments', () => {
  const storage = memoryStorage();
  const client = new SupabaseClient({ url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage });
  let cleanedUrl = '';
  const callback = type => client.acceptRecoveryFromUrl({
    hash:`#access_token=access-${type}&refresh_token=refresh-${type}&type=${type}&expires_in=3600`,
    pathname:'/habits/', search:'', replaceState:(_state, _title, url) => { cleanedUrl = url; },
  });
  assert.equal(callback('signup'), 'signup');
  assert.equal(client.session.access_token, 'access-signup');
  assert.equal(cleanedUrl, '/habits/');
  assert.equal(callback('recovery'), 'recovery');
  assert.equal(client.session.access_token, 'access-recovery');
  assert.equal(callback('oauth'), 'oauth');
  assert.equal(client.session.access_token, 'access-oauth');
  assert.equal(client.acceptRecoveryFromUrl({ hash:'#type=signup' }), false);
});

test('auth listeners observe initial, sign-in, refresh, and sign-out states', async () => {
  const events = [];
  const client = new SupabaseClient({
    url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage:memoryStorage(),
    fetchImpl:async () => jsonResponse({ access_token:'fresh-token', refresh_token:'fresh-refresh', expires_in:3600, user:{ id:'user-1' } }),
  });
  const stop = client.onAuthStateChange((event, session) => events.push([event, session?.user?.id || null]));
  client.saveSession({ access_token:'old-token', refresh_token:'old-refresh', expires_at:1, user:{ id:'user-1' } });
  await client.refreshSession();
  await client.signOut();
  stop();
  assert.deepEqual(events.map(([event]) => event), ['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED','SIGNED_OUT']);
  assert.equal(events.at(-1)[1], null);
});

test('network and RLS errors stay visible to the caller', async () => {
  const offline = new SupabaseClient({
    url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage:memoryStorage(),
    fetchImpl:async () => { throw new TypeError('Failed to fetch'); },
  });
  await assert.rejects(offline.rawRequest('/auth/v1/user'), /Failed to fetch/);
  const denied = new SupabaseClient({
    url:'https://habits.supabase.co', anonKey:`sb_publishable_${'x'.repeat(32)}`, storage:memoryStorage(),
    fetchImpl:async () => jsonResponse({ msg:'new row violates row-level security policy' }, 403),
  });
  denied.saveSession({ access_token:'user-token', refresh_token:'refresh-token', expires_at:Math.floor(Date.now()/1000)+3600 });
  await assert.rejects(denied.getSyncRecords('user-1'), /row-level security/);
});

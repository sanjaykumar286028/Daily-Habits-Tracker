const SESSION_KEY = 'daily-habits-supabase-session';

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim() : '';
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('Password must be at least 8 characters.');
  return password;
}

export function validatePasswordConfirmation(password, confirmation) {
  validatePassword(password);
  if (password !== confirmation) throw new Error('The passwords do not match.');
  return true;
}

export function validateAuthCredentials(email, password) {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Enter a valid email address.');
  }
  validatePassword(password);
  return normalizedEmail;
}

function appRedirectUrl() {
  if (typeof location === 'undefined' || !location.origin || !location.pathname) return undefined;
  return `${location.origin}${location.pathname}`;
}

export function validateSupabaseConfig(url, anonKey) {
  if (typeof url !== 'string' || typeof anonKey !== 'string' || !url || !anonKey) return false;
  try {
    const parsed = new URL(url);
    const safeUrl = (parsed.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(parsed.hostname))
      && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
    if (!safeUrl || anonKey.startsWith('sb_secret_')) return false;
    if (anonKey.startsWith('sb_publishable_')) return anonKey.length >= 32;
    // Legacy anon keys are JWTs. Never embed a service_role JWT in a browser build.
    const payload = anonKey.split('.')[1];
    if (!payload) return false;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = typeof atob === 'function'
      ? atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
      : Buffer.from(normalized, 'base64').toString('utf8');
    const claims = JSON.parse(decoded);
    return claims.role === 'anon' && (!claims.ref || claims.ref === parsed.hostname.split('.')[0]);
  } catch {
    return false;
  }
}

export class SupabaseClient {
  constructor({ url, anonKey, fetchImpl = fetch, storage = localStorage, redirectUrl = appRedirectUrl() }) {
    if (!validateSupabaseConfig(url, anonKey)) throw new Error('Supabase project URL and publishable key are not configured safely.');
    this.url = url.replace(/\/$/, '');
    this.anonKey = anonKey;
    this.fetchImpl = fetchImpl;
    this.storage = storage;
    this.redirectUrl = redirectUrl;
    this.authListeners = new Set();
    this.session = this.readSession();
  }

  onAuthStateChange(listener) {
    if (typeof listener !== 'function') throw new TypeError('Auth listener must be a function.');
    this.authListeners.add(listener);
    listener('INITIAL_SESSION', this.session);
    return () => this.authListeners.delete(listener);
  }

  emitAuthState(event) {
    for (const listener of this.authListeners) listener(event, this.session);
  }

  readSession() {
    try {
      const session = JSON.parse(this.storage.getItem(SESSION_KEY) || 'null');
      return session?.access_token && session?.refresh_token ? session : null;
    } catch {
      return null;
    }
  }

  saveSession(session, event = 'SIGNED_IN') {
    if (!session?.access_token || !session?.refresh_token) throw new Error('Authentication response did not include a complete session.');
    const expiresAt = session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
    this.session = { ...session, expires_at: expiresAt };
    try {
      this.storage.setItem(SESSION_KEY, JSON.stringify(this.session));
    } catch {
      this.session = null;
      throw new Error('This browser cannot securely retain a sign-in session. Enable site storage and try again.');
    }
    this.emitAuthState(event);
    return this.session;
  }

  clearSession() {
    const hadSession = Boolean(this.session);
    this.session = null;
    try { this.storage.removeItem(SESSION_KEY); } catch {}
    if (hadSession) this.emitAuthState('SIGNED_OUT');
  }

  async rawRequest(path, { method = 'GET', body, token, headers = {} } = {}) {
    const requestHeaders = { apikey: this.anonKey, ...headers };
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
    const response = await this.fetchImpl.call(globalThis, `${this.url}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }
    if (!response.ok) {
      const message = data?.msg || data?.message || data?.error_description || data?.error || 'Supabase request failed.';
      throw new Error(String(message).slice(0, 240));
    }
    return data;
  }

  async refreshSession() {
    if (!this.session?.refresh_token) return null;
    try {
      const next = await this.rawRequest('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: { refresh_token: this.session.refresh_token }, token: this.anonKey,
      });
      return this.saveSession(next, 'TOKEN_REFRESHED');
    } catch (error) {
      if (!navigator.onLine || error instanceof TypeError) throw error;
      this.clearSession();
      throw error;
    }
  }

  async validAccessToken() {
    if (!this.session) return null;
    if (Number(this.session.expires_at) <= Math.floor(Date.now() / 1000) + 60) await this.refreshSession();
    return this.session?.access_token || null;
  }

  async restoreSession() {
    if (!this.session) return null;
    try {
      await this.validAccessToken();
      return await this.currentUser();
    } catch (error) {
      if (!navigator.onLine || error instanceof TypeError) return this.session?.user || null;
      this.clearSession();
      return null;
    }
  }

  async signUp(email, password) {
    const normalizedEmail = validateAuthCredentials(email, password);
    const redirectTo = this.redirectUrl;
    const path = redirectTo ? `/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}` : '/auth/v1/signup';
    const result = await this.rawRequest(path, { method: 'POST', body: { email:normalizedEmail, password }, token: this.anonKey });
    if (result?.access_token) this.saveSession(result);
    else if (result?.session?.access_token) this.saveSession(result.session);
    return result;
  }

  async signIn(email, password) {
    const normalizedEmail = validateAuthCredentials(email, password);
    const result = await this.rawRequest('/auth/v1/token?grant_type=password', { method: 'POST', body: { email:normalizedEmail, password }, token: this.anonKey });
    this.saveSession(result);
    return result.user;
  }

  googleOAuthUrl() {
    if (!this.redirectUrl) throw new Error('This app could not determine a secure sign-in return URL.');
    let redirect;
    try { redirect = new URL(this.redirectUrl); } catch { throw new Error('The Google sign-in return URL is invalid.'); }
    if (!['https:', 'http:'].includes(redirect.protocol) || redirect.username || redirect.password || redirect.hash) {
      throw new Error('The Google sign-in return URL is invalid.');
    }
    if (typeof location !== 'undefined' && location.origin && redirect.origin !== location.origin) {
      throw new Error('The Google sign-in return URL must stay on this app.');
    }
    const authorization = new URL(`${this.url}/auth/v1/authorize`);
    authorization.searchParams.set('provider', 'google');
    authorization.searchParams.set('redirect_to', redirect.href);
    authorization.searchParams.set('scopes', 'openid email profile');
    return authorization.toString();
  }

  async currentUser() {
    const token = await this.validAccessToken();
    if (!token) return null;
    return this.rawRequest('/auth/v1/user', { token });
  }

  async updateProfile(displayName) {
    const token = await this.validAccessToken();
    return this.rawRequest('/auth/v1/user', { method: 'PUT', body: { data: { display_name: displayName } }, token });
  }

  async recoverPassword(email, redirectTo = this.redirectUrl) {
    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('Enter a valid email address.');
    const path = redirectTo ? `/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}` : '/auth/v1/recover';
    return this.rawRequest(path, {
      method: 'POST', body: { email:normalizedEmail }, token: this.anonKey,
    });
  }

  async resendSignupConfirmation(email) {
    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('Enter a valid email address.');
    const path = this.redirectUrl ? `/auth/v1/resend?redirect_to=${encodeURIComponent(this.redirectUrl)}` : '/auth/v1/resend';
    return this.rawRequest(path, {
      method:'POST', body:{ type:'signup', email:normalizedEmail }, token:this.anonKey,
    });
  }

  async signOut() {
    let error;
    const token = await this.validAccessToken().catch(() => null);
    if (token) {
      try { await this.rawRequest('/auth/v1/logout', { method: 'POST', token }); }
      catch (caught) { error = caught; }
    }
    this.clearSession();
    if (error) throw new Error(`Signed out on this device. The server could not revoke the session: ${error.message}`);
  }

  async updatePassword(password) {
    validatePassword(password);
    const token = await this.validAccessToken();
    return this.rawRequest('/auth/v1/user', { method: 'PUT', body: { password }, token });
  }

  acceptRecoveryFromUrl(urlState = {}) {
    const currentLocation = typeof location === 'undefined' ? {} : location;
    const currentHash = urlState.hash ?? currentLocation.hash ?? '';
    const pathname = urlState.pathname ?? currentLocation.pathname ?? '/';
    const search = urlState.search ?? currentLocation.search ?? '';
    const params = new URLSearchParams(currentHash.replace(/^#/, ''));
    const type = params.get('type');
    if (!params.get('access_token') || !params.get('refresh_token')) return false;
    const callbackType = ['recovery', 'signup', 'invite', 'email'].includes(type) ? type : 'oauth';
    this.saveSession({
      access_token:params.get('access_token'), refresh_token:params.get('refresh_token'),
      expires_in:Number(params.get('expires_in') || 3600), token_type:params.get('token_type') || 'bearer',
    });
    const replaceState = urlState.replaceState || (typeof history !== 'undefined' ? history.replaceState.bind(history) : () => {});
    const title = typeof document === 'undefined' ? '' : document.title;
    replaceState(null, title, `${pathname}${search}`);
    return callbackType;
  }

  async getSyncRecords(userId) {
    const token = await this.validAccessToken();
    if (!token) throw new Error('Sign in before syncing.');
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const response = await this.rawRequest(`/rest/v1/user_sync_records?select=user_id,collection,record_id,record,updated_at,deleted_at&user_id=eq.${encodeURIComponent(userId)}&order=updated_at.asc`, {
        token, headers: { Range: `${offset}-${offset + 999}` },
      });
      if (!Array.isArray(response)) throw new Error('Supabase returned an invalid sync response.');
      rows.push(...response);
      if (response.length < 1000) break;
    }
    return rows;
  }

  async upsertSyncRecords(rows) {
    const token = await this.validAccessToken();
    if (!token) throw new Error('Sign in before syncing.');
    for (let offset = 0; offset < rows.length; offset += 250) {
      const batch = rows.slice(offset, offset + 250);
      await this.rawRequest('/rest/v1/user_sync_records?on_conflict=user_id%2Ccollection%2Crecord_id', {
        method: 'POST', body: batch, token,
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      });
    }
  }
}

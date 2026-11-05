const SESSION_KEY = 'daily-habits-supabase-session';

export function validateSupabaseConfig(url, anonKey) {
  if (typeof url !== 'string' || typeof anonKey !== 'string' || !url || !anonKey) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(parsed.hostname))
      && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

export class SupabaseClient {
  constructor({ url, anonKey, fetchImpl = fetch, storage = localStorage }) {
    if (!validateSupabaseConfig(url, anonKey)) throw new Error('Supabase project URL and publishable key are not configured safely.');
    this.url = url.replace(/\/$/, '');
    this.anonKey = anonKey;
    this.fetchImpl = fetchImpl;
    this.storage = storage;
    this.session = this.readSession();
  }

  readSession() {
    try {
      const session = JSON.parse(this.storage.getItem(SESSION_KEY) || 'null');
      return session?.access_token && session?.refresh_token ? session : null;
    } catch {
      return null;
    }
  }

  saveSession(session) {
    if (!session?.access_token || !session?.refresh_token) throw new Error('Authentication response did not include a complete session.');
    const expiresAt = session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
    this.session = { ...session, expires_at: expiresAt };
    try {
      this.storage.setItem(SESSION_KEY, JSON.stringify(this.session));
    } catch {
      this.session = null;
      throw new Error('This browser cannot securely retain a sign-in session. Enable site storage and try again.');
    }
    return this.session;
  }

  clearSession() {
    this.session = null;
    try { this.storage.removeItem(SESSION_KEY); } catch {}
  }

  async rawRequest(path, { method = 'GET', body, token, headers = {} } = {}) {
    const requestHeaders = { apikey: this.anonKey, ...headers };
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
    const response = await this.fetchImpl(`${this.url}${path}`, {
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
      return this.saveSession(next);
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
    const result = await this.rawRequest('/auth/v1/signup', { method: 'POST', body: { email, password }, token: this.anonKey });
    if (result?.access_token) this.saveSession(result);
    else if (result?.session?.access_token) this.saveSession(result.session);
    return result;
  }

  async signIn(email, password) {
    const result = await this.rawRequest('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, token: this.anonKey });
    this.saveSession(result);
    return result.user;
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

  async recoverPassword(email, redirectTo = location.href.split('#')[0]) {
    return this.rawRequest(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: 'POST', body: { email }, token: this.anonKey,
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
    const token = await this.validAccessToken();
    return this.rawRequest('/auth/v1/user', { method: 'PUT', body: { password }, token });
  }

  acceptRecoveryFromUrl() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (params.get('type') !== 'recovery' || !params.get('access_token') || !params.get('refresh_token')) return false;
    this.saveSession({
      access_token:params.get('access_token'), refresh_token:params.get('refresh_token'),
      expires_in:Number(params.get('expires_in') || 3600), token_type:params.get('token_type') || 'bearer',
    });
    history.replaceState(null, document.title, `${location.pathname}${location.search}`);
    return true;
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


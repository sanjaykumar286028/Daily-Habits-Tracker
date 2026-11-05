# Supabase setup

Supabase support is optional. Without project configuration, the app stays in guest mode and keeps records on the current device. When a user signs in to a configured project, the app syncs habits, logs, goals, journal entries, focus sessions, achievements, and preferences. Journal content is sent only after the user signs in and sees the in-app disclosure.

## Configure a project

1. Create a Supabase project and enable email/password authentication.
2. Apply the migrations in `supabase/migrations/` in filename order. The second migration creates `user_sync_records`, grants database access only to authenticated users, and enforces owner-scoped RLS.
3. In Supabase Authentication → URL Configuration, add the deployed app URL to the redirect allowlist. Password recovery redirects to the current app page.
4. Add these GitHub repository **variables**:
   - `SUPABASE_URL`: the HTTPS project URL.
   - `SUPABASE_ANON_KEY`: the publishable/anon key from the project API settings.
5. Run a new GitHub Pages, Cloudflare, or Android build. The build embeds those two browser-visible values in `dist/src/public-config.js`.

The publishable key is visible to app visitors by design. Do not use a `service_role` key in the browser or GitHub build variables. Row Level Security and the signed-in user's access token are the database access controls. Never disable RLS on `user_sync_records`.

For local builds, set both environment variables before `npm run build`. Leave both empty for guest-only mode. The build rejects a partial or non-HTTPS project configuration.

## Accounts and synchronization

Settings supports account creation, sign-in, session restoration/refresh, sign-out, password recovery, display-name updates, and manual sync. Signing in merges local guest records into the account and merges existing cloud records. Conflicts are resolved per record by last-updated timestamp; later local changes stay in IndexedDB and the recovery copy, then retry when the device reconnects. Deletes create sync tombstones. The app does not send records before sign-in.

Sign-out leaves local records intact. **Delete local data** signs out and deletes device data; it does not delete the account's cloud copy. Users can sign in again to retrieve cloud records.

## Verify before production use

Repository tests cover request headers, token refresh, merge precedence, owner filtering, and tombstones. These do not prove deployed database policies. After configuring a real project, create two test users and verify each can read/write only its own rows. Test signup confirmation, password recovery redirects, guest migration, offline edits, conflict behavior, and sign-out. Confirm the RLS migration is applied in Supabase. This source has not been tested against a live project because no credentials were provided.


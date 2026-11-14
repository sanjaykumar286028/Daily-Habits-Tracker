# Supabase setup

Supabase support is optional. Without project configuration, the app stays in guest mode and keeps records on the current device. When a user signs in to a configured project, the app syncs habits, logs, tasks, goals, journal entries, focus sessions, achievements, and preferences. Journal content is sent only after the user signs in and sees the in-app disclosure.

## Configure a project

1. Enable email/password authentication. Keep email confirmation enabled for real users.
2. Apply these migrations in the listed order to a new project:
   1. `20261105000100_initial_schema.sql` — creates the private tables and owner policies.
   2. `20261105000200_sync_records.sql` — creates the app's per-user sync table.
   3. `20261107000100_prevent_stale_sync_overwrites.sql` — rejects stale concurrent upserts.
   4. `20261107000200_secure_private_table_grants.sql` — limits all nine tables to authenticated CRUD and owner-only RLS; removes broad client grants such as `TRUNCATE`.
   5. `20261114000100_add_tasks_sync_collection.sql` — allows task records in the existing owner-scoped sync table without deleting or rewriting records.
3. In Authentication → URL Configuration, set Site URL to `https://sanjaykumar286028.github.io/Daily-Habits-Tracker/` and allow that exact URL as a redirect URL. Password recovery returns to the app URL.
4. Add these GitHub repository **Actions variables** (not secrets):
   - `SUPABASE_URL`: the HTTPS project URL.
   - `SUPABASE_ANON_KEY`: the project's `sb_publishable_...` key (or legacy `anon` JWT) from the project API settings.
5. Run a new GitHub Pages build. It embeds those two intentionally public values in `dist/src/public-config.js`.

The Supabase Dashboard's SQL Editor can run each migration file, one file at a time and in the order above. For a new empty project, wait for each query to succeed before running the next. If the project's original migrations have already been applied, run only the new task collection migration after checking the existing schema. Never use `db reset` on a remote project. Running SQL manually may not record the filenames in Supabase's migration history; use the Supabase CLI migration workflow for ongoing deployments so the remote history remains aligned. Do not claim a migration is applied until the resulting tables, policies, grants, and migration history have been checked.

The publishable key is visible to app visitors by design. The build rejects `sb_secret_` keys and legacy JWTs whose role is not `anon`. Do not use a `service_role` key in the browser or GitHub build variables. The private tables grant authenticated clients only select/insert/update/delete, and RLS restricts rows to the signed-in user's UUID. Never disable RLS on any app table.

For local builds, set both environment variables before `npm run build`. Leave both empty for guest-only mode. The build rejects a partial or non-HTTPS project configuration.

## Accounts and synchronization

Settings supports account creation, sign-in, session restoration/refresh, sign-out, password recovery, display-name updates, and manual sync. Signing in merges local guest records into the account and merges existing cloud records. Conflicts are resolved per record by last-updated timestamp; the database trigger rejects a stale concurrent upsert. Later local changes stay in IndexedDB and the recovery copy, then retry when the device reconnects. Deletes create sync tombstones. The app does not send records before sign-in.

The Supabase Dashboard login is an administrator account, separate from a Daily Habits application user. An app user must exist in this project's **Authentication → Users** list. To register from the app, enter a valid email and an 8+ character password, choose **Create account**, confirm the password, and open the confirmation email. Email confirmation redirects to the deployed app and establishes a session; if no session is returned, the UI stays signed out and asks the user to verify before signing in. A pending confirmation can be resent from the app. Reset-password links return to the app, are accepted from the URL fragment, and require the user to enter and confirm a new password.

If sign-in returns `Invalid login credentials`, the Auth endpoint was reached, but the response alone cannot distinguish a missing app user from a wrong password. Verify whether the exact email is listed under Authentication → Users in this project and whether it is confirmed. Do not infer user existence from Dashboard access, and do not disable confirmation or RLS as a workaround. Password-reset and resend endpoints intentionally avoid revealing whether an email is registered.

## Google sign-in

The Settings panel supports a web Google OAuth entry point through Supabase Auth using the authorization-code flow with PKCE. It creates a high-entropy verifier in tab-scoped session storage, sends only the SHA-256 challenge, and exchanges the returned one-time code before establishing a session. The app requests only openid email profile, restores the Supabase session on reload, and keeps Email/Password and Guest modes available. Google OAuth itself requires a network connection. Before starting Google sign-in, the user must explicitly agree to sync the current device's local records, including journal entries; if the migration fails, IndexedDB and the local recovery copy remain available. Without that consent, manual, reconnect-triggered, and background sync all remain blocked; the user can approve later from Settings. Approval is stored per Google-linked app account. Existing cloud sync stays scoped to the authenticated Supabase user by the RLS policies.

Supabase uses its own provider callback, then returns the browser to the app. In Google Cloud Console create a Web application OAuth client under Google Auth Platform. Configure the consent screen branding with Daily Habits Tracker, add the user-support and developer-contact email addresses, choose External audience, and keep the app in Testing with only intended tester accounts until you complete Google verification/publishing. In Data Access, request only openid, .../auth/userinfo.email, and .../auth/userinfo.profile.

Google OAuth client settings:

- Authorized JavaScript origins: https://sanjaykumar286028.github.io and local development http://127.0.0.1:4173.
- Authorized redirect URI: the exact callback shown in Supabase → Authentication → Sign In / Providers → Google. With the verified project reference fsyjuijrwglpqswysxkc, the expected Supabase callback is https://fsyjuijrwglpqswysxkc.supabase.co/auth/v1/callback; confirm it matches the Dashboard before saving the Google client. This callback is not the post-login application URL.
- Do not add a Cloudflare origin: no Cloudflare production domain is configured or verified for this repository.

Then in Supabase Dashboard → Authentication → Sign In / Providers → Google, enable Google, enter the Web client ID and secret directly in the Dashboard, and save. Never put the secret in GitHub, frontend files, build variables, or this chat. In Authentication → URL Configuration, set Site URL to https://sanjaykumar286028.github.io/Daily-Habits-Tracker/ and allow that exact app URL plus http://127.0.0.1:4173/. These are post-login destinations; the Supabase callback above is the Google redirect URI.

Supabase Auth performs its documented identity-linking behavior for OAuth identities with matching email addresses; the app does not independently merge accounts based on email text. Review Supabase's identity-linking rules and ensure email confirmation remains enabled for password accounts. No user records are deleted or overwritten during identity linking; local app records are merged only after the explicit sync consent described above.

The repository has no generated android/ Capacitor platform or native Google Sign-In plugin. The app ID in capacitor.config.json is com.sanjaykumar286028.dailyhabitstracker, but there are no Android signing fingerprints to verify. This implementation is web/PWA OAuth; native Android Google OAuth is not implemented or verified. Do not ship Android Google sign-in until a secure native flow (Google Android OAuth client, package/SHA-1 fingerprints, and deep-link/session handling) is configured and tested. Google Client Secrets must never be embedded in an APK.


Sign-out leaves local records intact. **Delete local data** signs out and deletes device data; it does not delete the account's cloud copy. Users can sign in again to retrieve cloud records.

## Verify before production use

Repository tests cover request headers, token refresh, merge precedence, owner filtering, and tombstones. These do not prove deployed database policies. After applying the migrations, create two test users and verify each can read/write only its own rows. Test signup confirmation, password recovery redirects, guest migration, offline edits, conflict behavior, and sign-out. Verify `supabase_migrations.schema_migrations`, all nine RLS policies, and table privileges in the dashboard. A healthy project by itself does not prove live authentication or sync works.


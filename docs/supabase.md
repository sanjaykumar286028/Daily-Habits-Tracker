# Supabase setup

Supabase support is optional. Without project configuration, the app stays in guest mode and keeps records on the current device. When a user signs in to a configured project, the app syncs habits, logs, goals, journal entries, focus sessions, achievements, and preferences. Journal content is sent only after the user signs in and sees the in-app disclosure.

## Configure a project

1. Enable email/password authentication. Keep email confirmation enabled for real users.
2. Apply these migrations in the listed order to a new project:
   1. `20261105000100_initial_schema.sql` — creates the private tables and owner policies.
   2. `20261105000200_sync_records.sql` — creates the app's per-user sync table.
   3. `20261107000100_prevent_stale_sync_overwrites.sql` — rejects stale concurrent upserts.
   4. `20261107000200_secure_private_table_grants.sql` — limits all nine tables to authenticated CRUD and owner-only RLS; removes broad client grants such as `TRUNCATE`.
3. In Authentication → URL Configuration, set Site URL to `https://sanjaykumar286028.github.io/Daily-Habits-Tracker/` and allow that exact URL as a redirect URL. Password recovery returns to the app URL.
4. Add these GitHub repository **Actions variables** (not secrets):
   - `SUPABASE_URL`: the HTTPS project URL.
   - `SUPABASE_ANON_KEY`: the project's `sb_publishable_...` key (or legacy `anon` JWT) from the project API settings.
5. Run a new GitHub Pages build. It embeds those two intentionally public values in `dist/src/public-config.js`.

The Supabase Dashboard's SQL Editor can run each migration file, one file at a time and in the order above. For a new empty project, wait for each query to succeed before running the next. Never use `db reset` on a remote project. Running SQL manually may not record the filenames in Supabase's migration history; use the Supabase CLI migration workflow for ongoing deployments so the remote history remains aligned. Do not claim a migration is applied until the resulting tables, policies, grants, and migration history have been checked.

The publishable key is visible to app visitors by design. The build rejects `sb_secret_` keys and legacy JWTs whose role is not `anon`. Do not use a `service_role` key in the browser or GitHub build variables. The private tables grant authenticated clients only select/insert/update/delete, and RLS restricts rows to the signed-in user's UUID. Never disable RLS on any app table.

For local builds, set both environment variables before `npm run build`. Leave both empty for guest-only mode. The build rejects a partial or non-HTTPS project configuration.

## Accounts and synchronization

Settings supports account creation, sign-in, session restoration/refresh, sign-out, password recovery, display-name updates, and manual sync. Signing in merges local guest records into the account and merges existing cloud records. Conflicts are resolved per record by last-updated timestamp; the database trigger rejects a stale concurrent upsert. Later local changes stay in IndexedDB and the recovery copy, then retry when the device reconnects. Deletes create sync tombstones. The app does not send records before sign-in.

The Supabase Dashboard login is an administrator account, separate from a Daily Habits application user. An app user must exist in this project's **Authentication → Users** list. To register from the app, enter a valid email and an 8+ character password, choose **Create account**, confirm the password, and open the confirmation email. Email confirmation redirects to the deployed app and establishes a session; if no session is returned, the UI stays signed out and asks the user to verify before signing in. A pending confirmation can be resent from the app. Reset-password links return to the app, are accepted from the URL fragment, and require the user to enter and confirm a new password.

If sign-in returns `Invalid login credentials`, the Auth endpoint was reached, but the response alone cannot distinguish a missing app user from a wrong password. Verify whether the exact email is listed under Authentication → Users in this project and whether it is confirmed. Do not infer user existence from Dashboard access, and do not disable confirmation or RLS as a workaround. Password-reset and resend endpoints intentionally avoid revealing whether an email is registered.

For GitHub OAuth, configure a GitHub OAuth app and its client ID/secret in Supabase's GitHub provider settings, then use Supabase's project callback URI and allow the deployed app URL. This repository does not enable a GitHub OAuth button until those owner-managed provider credentials and callback settings exist; never put the OAuth client secret in this public repository or browser build.

Sign-out leaves local records intact. **Delete local data** signs out and deletes device data; it does not delete the account's cloud copy. Users can sign in again to retrieve cloud records.

## Verify before production use

Repository tests cover request headers, token refresh, merge precedence, owner filtering, and tombstones. These do not prove deployed database policies. After applying the migrations, create two test users and verify each can read/write only its own rows. Test signup confirmation, password recovery redirects, guest migration, offline edits, conflict behavior, and sign-out. Verify `supabase_migrations.schema_migrations`, all nine RLS policies, and table privileges in the dashboard. A healthy project by itself does not prove live authentication or sync works.

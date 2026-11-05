# Daily Habits Tracker

A responsive, installable local-first habit tracker. Habits, completion history, goals, milestones, journal entries, and focus sessions are stored in IndexedDB on the user's device. The app works without an account or network after its shell has been loaded once.

## Run and verify

Requirements: Node.js 22 or newer. The browser app has no runtime JavaScript dependencies; Capacitor packages are pinned in `package.json` for Android builds.

```sh
npm run build
npm test
npm run dev
```

Open `http://127.0.0.1:4173`. Service workers, notifications, and PWA install prompts require localhost or HTTPS. `npm run build` creates/updates `dist/`; `BASE_PATH` can be set for subpath hosting.

## Included features

- Dashboard, habit manager, monthly calendar, goals and milestones, analytics and rolling weekly report, focus timer, private journal search, achievements, and settings.
- Boolean, count, and duration habits; daily, weekday, weekend, and chosen-weekday schedules; pause by archiving; daily completion, progress logging, and optional skip reasons.
- Schedule-aware completion percentages and streaks that ignore unscheduled dates and future dates.
- IndexedDB local persistence with a localStorage recovery copy, stable IDs, one log per habit/day, and offline app-shell caching.
- Light/dark themes, mobile bottom navigation, a desktop sidebar, and reduced-motion support.
- Journal search, CSV completion export, validated JSON backup, and confirmed merge import.
- Rule-based insights and achievement conditions based on saved activity.
- PWA install prompt when the browser provides one, manual installation instructions otherwise, and a user-controlled service-worker update prompt.
- Optional browser reminders at a habit's preferred time while the app is open and notification permission is granted.

## PWA installation and updates

The manifest uses **Daily Habits Tracker** / **Habits** and the app-shell service worker caches only static assets. Private records remain in IndexedDB and are not added to the Cache API. Updates wait for the user to choose **Update now**. Background reminder delivery is not guaranteed when a browser or installed app is closed.

## Android

Capacitor configuration is in `capacitor.config.json` with app ID `com.sanjaykumar286028.dailyhabitstracker`. The Android workflow generates the native project and creates a debug APK plus an unsigned release candidate. A signed release artifact is produced only when protected keystore secrets are configured. No APK download link is published until a signed artifact is released and verified. See [Android build and release](docs/android-release.md).

The local environment used for this implementation has Node.js but no npm, Java, Gradle, or Android SDK, so no APK was built or device-tested here.

## Deployments and CI

- GitHub Actions runs unit tests, syntax checks, and a production build.
- The GitHub Pages workflow deploys from `main` to `https://sanjaykumar286028.github.io/Daily-Habits-Tracker/` after GitHub Pages is enabled with **GitHub Actions** in repository settings.
- The Cloudflare Pages workflow runs tests and builds. Deployment requires the `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_PAGES_PROJECT` repository variables and `CLOUDFLARE_API_TOKEN` secret.
- The Android workflow can produce APK artifacts in GitHub Actions. Signed release builds require the protected keystore secrets described in [Android build and release](docs/android-release.md).

See [deployment instructions](docs/deployment.md). A workflow file or successful build does not mean a site has been deployed; verify the action run and live URL.

## Cloud data and security status

This version does not implement Supabase authentication or remote synchronization. The SQL migration in `supabase/migrations/` defines owner-scoped tables and row-level policies as a starting point; it has not been applied or tested against a Supabase project. Guest data stays local. No service-role key is used. Journal content is local-only.

The export includes the data needed by this local version. Restore validates the version and record shapes, asks before merge, and upserts records. Browser storage can be cleared by the user or browser; keep regular backups.

## Data format

The local IndexedDB database is `daily-habits-v1` and stores a `schemaVersion: 1` state object. Logs are unique per habit and local date. Updates to a habit's description or schedule do not rewrite old log records.

## Future updates

1. Install Node.js 22+, npm, Java 21, and Android Studio with an Android SDK.
2. Pull the `main` branch and run `npm install`, `npm test`, and `npm run build`.
3. For Android, use `npm run android:add` once, then `npm run android:sync`. Keep the generated Android project and release keystore backed up.
4. Configure GitHub Pages, Cloudflare Pages, and Android signing secrets before expecting their workflows to publish/deploy.
5. Verify new site URLs and APK artifacts before sharing them.

## Current verification limits

The five automated Node tests cover scheduling, completion summaries, count/duration targets, schedule-aware streaks, and backup validation. Browser automation, PWA installation across browsers, Supabase authorization/sync tests, Android device/lifecycle testing, signed APK generation, and live deployment verification remain outstanding.

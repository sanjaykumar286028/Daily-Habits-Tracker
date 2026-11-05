# Daily Habits Tracker

A quiet, responsive habit tracker built for local-first personal use. Create habits and goals, track a daily check-in, review history, write private reflections, use a focus timer, and export or restore your data.

## Run locally

Requirements: Node.js 20 or newer. The application has no runtime packages.

```sh
npm run build
```

Serve the generated `dist/` directory with any static web server. For local development, use any static server pointed at the repository root. Service workers and notifications work on `localhost` or HTTPS.

## Features

- Nine destinations: Dashboard, My Habits, Calendar, Goals, Analytics, Focus, Journal, Achievements, and Settings.
- Boolean, count, and duration habit models; daily, weekday, weekend, and selected-day schedules; archive and edit.
- Daily completion records, schedule-aware summary calculations, calendar, recent activity heatmap, and streak summaries.
- Goal tracking with linked habits, target dates, and progress views.
- Private local journal with mood and energy check-in.
- Focus timer, earned milestone conditions, and rule-based daily insight.
- Light and dark themes; responsive desktop sidebar and mobile navigation.
- IndexedDB persistence with a localStorage recovery copy; guest use requires no account.
- Installable PWA shell and offline static assets.
- JSON backup export and validated, confirmed merge import.

## Storage, sync, and privacy

The app stores personal records in the browser on the current device. Journal content is not sent to a service. Browser storage can be cleared by the user or browser, so export backups regularly. This version does **not** include Supabase authentication, remote database synchronization, offline change queues, cross-device sync, or account deletion. The settings page labels cloud sync as not configured. `.env.example` documents the intended public configuration names but no code reads them.

Notifications require browser permission. Browsers do not guarantee delivery at a chosen time, and this version does not implement a background reminder scheduler.

## Build, tests, and deployment

```sh
npm run build
npm test
```

The build outputs static files to `dist/`. For Cloudflare Pages, use build command `npm run build` and output directory `dist`. No secrets or environment variables are required for local functionality. A custom domain/production URL is not configured by this repository.

## Data format

The local IndexedDB database is `daily-habits-v1`, with a versioned state record. Exported JSON contains `schemaVersion: 1`, habits, logs, goals, journal entries, focus sessions, settings, and export time. Import validates version and collection types, asks for confirmation, then merges by stable record ID. A future database migration should preserve IDs and historical completion records.

## Quality checks

The pure scheduling, completion-summary, and backup-validation functions have Node tests. Full browser automation, accessibility audit, cloud authorization tests, and multi-device synchronization tests are not included. Run `npm test` and `npm run build` before publishing.

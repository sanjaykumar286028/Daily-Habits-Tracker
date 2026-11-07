# Deployment

## GitHub Pages

`.github/workflows/github-pages.yml` builds the project with the repository subpath as `BASE_PATH`, runs the unit tests, and deploys `dist/` from `main`. GitHub Pages is enabled with **GitHub Actions** as the publishing source. The live site is `https://sanjaykumar286028.github.io/Daily-Habits-Tracker/`; the latest verified deployment is [workflow run 42374038699](https://github.com/sanjaykumar286028/Daily-Habits-Tracker/actions/runs/42374038699). The homepage and primary navigation were checked in a browser. The isolated browser used for QA did not expose IndexedDB or localStorage, so data persistence could not be verified there.

Optional Supabase browser settings use repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`. They are embedded in the public app bundle. Never set a `SUPABASE_SERVICE_ROLE_KEY` as a build variable.

## Cloudflare Pages

The Cloudflare workflow tests and builds on `main`. To enable deploys, set repository variables `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_PAGES_PROJECT`, and the protected secret `CLOUDFLARE_API_TOKEN`. The token needs permission to deploy the target Pages project. Build output is `dist/`. If those values are missing, the run summary explicitly says deployment was skipped; a successful build alone does not mean a Cloudflare deployment exists. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` repository variables to enable optional cloud sync in the built app.

Use a Cloudflare Pages project connected to this GitHub repository or retain the workflow as the single direct-upload deployment path. Do not enable two competing production deployment methods for the same project.

## PWA and offline behaviour

The service worker caches only the static application shell, not journal records, IndexedDB, or arbitrary same-origin GET responses. Navigations use the network when available and fall back to the cached application shell. A waiting service worker update is shown to the user; the app reloads only after the user selects **Update now**. Install prompts are browser-controlled. Browsers without a prompt show platform-specific manual instructions.

## Remaining owner configuration

GitHub Pages is already enabled and deployed. To enable Cloudflare deploys, configure a Pages project, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_PROJECT`, and the protected `CLOUDFLARE_API_TOKEN` secret. The latest Cloudflare run built the app successfully but skipped its deploy step because these values are not set. Configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` only if cloud sync is desired.

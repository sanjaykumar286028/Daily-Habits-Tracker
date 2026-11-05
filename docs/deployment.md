# Deployment

## GitHub Pages

`.github/workflows/github-pages.yml` builds the project with the repository subpath as `BASE_PATH`, runs the unit tests, and deploys `dist/` from `main`. In repository Settings → Pages, select **GitHub Actions** as the publishing source if it is not already enabled. The expected project URL is `https://sanjaykumar286028.github.io/Daily-Habits-Tracker/`; it is not considered live until the workflow completes and the URL is checked.

## Cloudflare Pages

The Cloudflare workflow builds and tests on `main`. To enable deploys, set repository variables `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_PAGES_PROJECT`, and the protected secret `CLOUDFLARE_API_TOKEN`. The token needs permission to deploy the target Pages project. Build output is `dist/`. The deploy step is skipped while these values are absent; a successful build alone does not mean a Cloudflare deployment exists.

Use a Cloudflare Pages project connected to this GitHub repository or retain the workflow as the single direct-upload deployment path. Do not enable two competing production deployment methods for the same project.

## PWA and offline behaviour

The service worker caches only the static application shell, not journal records, IndexedDB, or arbitrary same-origin GET responses. Navigations use the network when available and fall back to the cached application shell. A waiting service worker update is shown to the user; the app reloads only after the user selects **Update now**. Install prompts are browser-controlled. Browsers without a prompt show platform-specific manual instructions.

## Required owner actions

GitHub Pages must be enabled in repository settings. Cloudflare needs an account, Pages project, account ID, and API token. Neither account configuration is available in the local build environment, so deployment URLs must be verified from the respective dashboards after configuration.

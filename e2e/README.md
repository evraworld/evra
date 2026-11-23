# EVRA end-to-end tests

Playwright tests that drive the real app in a browser.

## Before you run

- Seed the database, then start the dev server: `npm run db:seed` and `npm run dev` in the repo root. Set `EVRA_URL` to test another host (default `http://localhost:3000`).
- Install once, from this folder: `npm install`, then `npx playwright install chromium`.
- In the app's `.env.local`, set `OTP_MAX_PER_HOUR=1000`: the suite signs the demo brand in many times, past the default five codes an hour.
- `auth-onboarding` has Evra draft the creator's kit, so it needs `ANTHROPIC_API_KEY` in `.env.local`.

## Commands

| Command | What it runs |
| --- | --- |
| `npm test` | `auth-onboarding`, `deal-flow` and `accessibility` on desktop Chromium, plus `auth-onboarding` and `accessibility` at iPhone 13 size. Add `-- --project=desktop` for one project. |
| `npm run typecheck` | TypeScript check of the suite. |

The HTML report is in `playwright-report/` (`npx playwright show-report`).

## Notes

- Runs serially (`workers: 1`) with one retry.
- Tests create users with `e2e-…@demo.evra.world` emails and read sign-in codes from `/api/dev/outbox`, which exists only in development.
- The accessibility tests fail on any serious or critical axe finding and print every finding.

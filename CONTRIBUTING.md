# Contributing to EVRA

Thanks for taking a look. Issues and pull requests are welcome.

## Run it

Follow the [quick start](README.md#quick-start). The app needs only Node.js 22.12 or later; the database is embedded.

## Before you open a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs the same four checks on every pull request. Browser tests live in [`e2e/`](e2e/README.md); run them when you change a flow people click through.

## How we work

- **One change per pull request**, linked to its issue (`Closes #12`). Keep commits small, and name each one after what it does, in the imperative: "Add the review-window path to the Deal Terms contract".
- **Rules live in `lib/`.** Pages and route handlers stay thin; a rule that matters gets a unit test next to its siblings in `tests/unit/`.
- **Schema changes** go in `lib/db/schema.ts`, then `npm run db:generate` writes the migration into `drizzle/`. Commit both.
- **Copy is plain English** in `lib/i18n/`, with Arabic and Hindi where a screen ships them.
- **Money is integer US cents** everywhere in the app.

## Non-negotiables

- No private keys, seed phrases or signing secrets on the server, in the repo or in logs, even on testnet.
- The assistant never signs, approves, releases or moves money, and it is never used to check delivery.
- Testnet only until the Deal Terms contract has an independent audit.
- Never commit `.env.local` or any real credential. `.env.example` lists every setting.

## Security issues

Please don't open a public issue. See [SECURITY.md](SECURITY.md).

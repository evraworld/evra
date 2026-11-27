# Off-chain roadmap (28 Nov – 17 Dec 2026)

The app side of the [testnet milestones](MILESTONES.md): everything a creator and a brand see and click, the database rows that mirror the chain, and the tests. Contracts are tracked separately under the `on-chain` label.

The chain sits behind one interface, `lib/chain`. Until the contracts land, a **simulated testnet adapter** implements it, so every screen and every test runs offline. The real Stellar adapter later plugs into the same interface without touching the screens.

**Rules for every change**
- One issue, one branch, one pull request. Small commits that each pass lint, types and tests.
- The server never stores or uses a private key. Tables hold public addresses, signer labels and transaction hashes only.
- Evra, the assistant, never signs, approves, releases or moves funds.

## Plan

| Day | Date | Work | Milestone | Related |
| --- | --- | --- | --- | --- |
| 1 | 28 Nov | Chain port: Stellar address checks, explorer links, the `ChainAdapter` interface | 1 | #1 |
| 2 | 29 Nov | Simulated testnet adapter for local development and tests | 1 | #1 |
| 3 | 30 Nov | `chain_accounts` table: public addresses and signers, no keys | 1 | #1 |
| 4 | 1 Dec | Account page: smart account address, network and signers | 1 | #1 |
| 5 | 2 Dec | Backup passkey: add and remove signers, never the last one | 1 | #2 |
| 6 | 3 Dec | Connect an existing Stellar wallet: entry, validation and linking | 1 | #3 |
| 7 | 4 Dec | Test funds: fund button and balances | 1 | #4 |
| 8 | 5 Dec | Escrow state machine for a deal, pure and fully tested | 2 | #5 |
| 9 | 6 Dec | `deal_escrows` table and the fund step in the Deal Room | 2 | #6 |
| 10 | 7 Dec | Signing prompt: what you are about to sign, in plain words | 2 | #6 |
| 11 | 8 Dec | Mark delivery and the review-window countdown | 2 | #7, #8 |
| 12 | 9 Dec | Brand approval, and creator release after the window | 2 | #7, #8 |
| 13 | 10 Dec | Chain transactions in the deal timeline, with explorer links | 2 | #6 |
| 14 | 11 Dec | Reconcile job: sync escrow state from the chain, idempotent | 2 | #6 |
| 15 | 12 Dec | Disputes on escrow deals: raise, propose a split, both sides sign | 2 | #9 |
| 16 | 13 Dec | Dispute deadline and the default anyone can trigger | 3 | #10 |
| 17 | 14 Dec | Deal record read model: creator and brand stats | 3 | #11 |
| 18 | 15 Dec | Public record page and a read-only JSON endpoint | 3 | #12 |
| 19 | 16 Dec | Browser test: a whole deal on the simulated adapter | 3 | #13 |
| 20 | 17 Dec | Trust, threat, key-management and recovery docs, app side | 3 | #14 |

Each day has its own `off-chain` issue: day 1 is #15, day 2 is #16, and so on to day 20, #34. The pull request for a day closes its issue and references the related milestone issue.

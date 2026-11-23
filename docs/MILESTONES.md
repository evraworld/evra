# Testnet milestones (December 2026)

By the end of December, a creator and a brand can run a complete deal on **Stellar testnet** from **passkey smart accounts they control**:

1. The brand funds a Trustless Work escrow in testnet USDC.
2. The creator marks delivery.
3. The money is released when the brand approves. If the brand stays silent past the review window, the creator releases it.
4. A dispute settles by a split both sides sign, or by a fixed default after the deadline.
5. Every outcome is written to a **two-sided deal record** that any app can read.

No server holds keys, AI never touches funds, and nothing goes to mainnet before an independent audit.

Each box below is ticked when its evidence is linked: a pull request, a contract or account link, a transaction hash or a recording.

## 1. Passkey smart accounts

Every creator and brand gets a smart account secured by a passkey on their own device, through the **Smart Account Kit**. People who already use a Stellar wallet can connect it through **Stellar Wallets Kit**. Every deal action (funding, marking delivery, approving, releasing) is signed on the person's device through Soroban authorization. EVRA's backend stores no private keys and never signs for anyone.

**Key management and recovery**
- Each account registers a second passkey on another device as a backup signer. Either passkey can sign, and adding or removing a signer needs an existing one.
- A lost device is replaced by signing in with the backup passkey. EVRA can't recover, freeze or move anyone's funds.
- Test accounts are funded with Friendbot XLM and testnet USDC. There is no gas float or pooled wallet.

**Evidence**
- [ ] Smart account addresses for test creators and brands, as Stellar explorer links
- [ ] Transaction hashes signed by passkeys
- [ ] A short screen recording: sign-up, signing, and recovery with the backup passkey
- [ ] Source showing that no private key is stored or used on the server

## 2. Deal Terms contract on Trustless Work escrow

A new Soroban contract, the **EVRA Deal Terms contract**, is connected to **Trustless Work's audited escrow**. The brand funds a single-release escrow in testnet USDC, and the creator is the service provider, release signer and receiver. The Deal Terms contract holds the escrow's **Approver** and **Dispute Resolver** roles and adds the rules the escrow doesn't have:

- **Review window.** The brand can approve at any time with their passkey. If the brand stays silent for the agreed window after delivery, the creator calls the contract to approve, then releases the funds. Soroban contracts are passive, so the trigger is the creator's own transaction; no keeper or EVRA server is involved.
- **Disputes without a trusted resolver.** Either side can raise a dispute. It settles by a split that both the brand and the creator sign. After the dispute deadline, a default that anyone can trigger applies instead: a full refund if delivery was never marked; otherwise the agreed kill fee goes to the creator and the rest goes back to the brand.

**Trust model:** only the brand and the creator can move money, each by signing on their own device, and the contract's rules decide timeouts and defaults. EVRA holds no admin key over escrowed funds, and Evra, the AI assistant, never signs or approves anything. If EVRA's servers go down, both sides can still call the contracts directly.

**Evidence**
- [ ] The Deal Terms contract on testnet, with the Trustless Work escrows it controls
- [ ] Transaction hashes for each path: brand approval, release after the review window, a split both sides signed, the deterministic default
- [ ] Unit tests for every path, and testnet integration runs, in this repo

## 3. Two-sided deal record

The Deal Terms contract writes every final outcome to a **deal record** as it happens, so no outside reporter or oracle ever writes to it.

- **For creators:** deals completed, total paid, delivery on time, approval on the first try, and disputes.
- **For brands:** deals paid, average days to approve, releases after the review window (ghosting), and disputes opened.

A read function any app can call, and a public record page in the EVRA app that reads straight from the contract.

**Evidence**
- [ ] The public record page in the EVRA testnet app
- [ ] Contract reads showing the entries written after each outcome above

## Weekly plan

| Week | Work | Done when |
| --- | --- | --- |
| 1–7 Dec | Smart Account Kit and Stellar Wallets Kit in the app: passkey sign-up, a backup passkey, testnet USDC, on-device signing. The Deal Terms contract's interface and its tests, written first. | People create passkey smart accounts on testnet and sign on their own devices; recovery with a backup passkey works; the contract interface and its tests exist. |
| 8–14 Dec | The approval and review-window paths, connected to a single-release Trustless Work escrow: the brand funds, the creator marks delivery, the brand approves or the creator approves after the window. | Both paths work end to end against the escrow on testnet, with unit tests passing. |
| 15–21 Dec | Disputes: raising one, a split both sides sign, and the deterministic default after the deadline. Deal-record writes for every final outcome, for both sides. | Every settlement path is covered by unit tests and testnet runs, and each outcome writes a record entry. |
| 22–30 Dec | The read function and the public record page. Every path run end to end on testnet with passkey accounts, with the transaction hashes collected. The trust model, threat model, key-management model, and failure and recovery plan, written in this repo. | A complete non-custodial deal on testnet with a public two-sided record, every path proven by transaction hashes, and the documentation ready for review. |

## Not in this sprint

- **Mainnet and real money.** Everything runs on Stellar testnet. Mainnet comes only after an independent audit of the Deal Terms contract.
- **A security audit.**
- **AI features.** Evra can never sign, approve, release or move funds, and it isn't used to check delivery or any evidence.
- **Local-currency cash-out.** Payouts stay in testnet USDC; cash-out through standard SEP-24 anchors comes later.
- **Native iOS and Android apps.** The EVRA app is a mobile-ready web app.

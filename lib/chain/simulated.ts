import { createHash } from "node:crypto";
import { addressKind } from "./address";
import type { Account, Balances, ChainAdapter, Signer, TxRef } from "./index";

// An in-process stand-in for Stellar testnet: same interface, no network, deterministic hashes.
// It runs local development and CI until the real adapter lands, then keeps running the tests.

const FRIENDBOT_XLM = "10000.0000000";
const TEST_USDC_CENTS = 100_000;

type Entry = { balances: Balances; signers: Signer[] };

export function simulatedChain(now: () => Date = () => new Date()): ChainAdapter {
  const ledger = new Map<string, Entry>();
  let seq = 0;

  const tx = (op: string, address: string): TxRef => {
    seq += 1;
    return { hash: createHash("sha256").update(`${seq}:${op}:${address}`).digest("hex"), ledger: seq, at: now() };
  };

  const check = (address: string) => {
    const kind = addressKind(address);
    if (!kind) throw new Error(`Not a Stellar address: ${address}`);
    return kind;
  };

  return {
    network: "testnet",

    async account(address) {
      const kind = check(address);
      const e = ledger.get(address);
      return e ? ({ address, kind: kind === "contract" ? "smart" : "wallet", signers: [...e.signers] } satisfies Account) : null;
    },

    async balances(address) {
      check(address);
      return { ...(ledger.get(address)?.balances ?? { xlm: "0", usdcCents: 0 }) };
    },

    // Like Friendbot: creates and funds the account once, and refuses a second time.
    async fundTestAccount(address) {
      check(address);
      if (ledger.has(address)) throw new Error("This test account is already funded.");
      ledger.set(address, { balances: { xlm: FRIENDBOT_XLM, usdcCents: TEST_USDC_CENTS }, signers: [] });
      return tx("fund", address);
    },
  };
}

// The one door between the app and the chain. Screens, jobs and tests call a ChainAdapter;
// a simulated adapter backs development and CI, the Stellar testnet adapter plugs in later.
// No method takes or returns a secret: people sign on their own devices, never on our server.

export * from "./address";
import type { Network } from "./address";

export type TxRef = { hash: string; ledger: number; at: Date };

export type Signer = { id: string; label: string; kind: "passkey" | "wallet" };

export type Account = { address: string; kind: "smart" | "wallet"; signers: Signer[] };

export type Balances = { xlm: string; usdcCents: number };

export interface ChainAdapter {
  readonly network: Network;
  /** Null when the address has never been created on chain. */
  account(address: string): Promise<Account | null>;
  balances(address: string): Promise<Balances>;
  /** Testnet only: Friendbot XLM plus test USDC. */
  fundTestAccount(address: string): Promise<TxRef>;
}

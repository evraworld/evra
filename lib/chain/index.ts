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

// One adapter per process, cached on globalThis like the database so dev hot reloads keep its state.
// shortcut: always the simulated adapter; pick by env once the Stellar testnet adapter exists.
const g = globalThis as unknown as { __evraChain?: ChainAdapter };

export async function getChain(): Promise<ChainAdapter> {
  if (!g.__evraChain) g.__evraChain = (await import("./simulated")).simulatedChain();
  return g.__evraChain;
}

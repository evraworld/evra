// Stellar StrKey checks (SEP-23) and explorer links. Public data only: nothing here touches a key.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const VERSION = { account: 6 << 3, contract: 2 << 3 } as const; // G… and C…

export type AddressKind = keyof typeof VERSION;

function base32(s: string) {
  const out: number[] = [];
  let bits = 0;
  let val = 0;
  for (const c of s) {
    const i = B32.indexOf(c);
    if (i < 0) return null;
    val = ((val << 5) | i) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return out;
}

function crc16(bytes: number[]) {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** The kind of a G (account) or C (contract) address, or null when it isn't a valid one. */
export function addressKind(input: string): AddressKind | null {
  if (input.length !== 56) return null;
  const raw = base32(input);
  if (!raw || raw.length !== 35) return null;
  const kind = (Object.keys(VERSION) as AddressKind[]).find((k) => VERSION[k] === raw[0]);
  if (!kind) return null;
  const sum = raw[33] | (raw[34] << 8); // little-endian CRC16-XModem over version + payload
  return crc16(raw.slice(0, 33)) === sum ? kind : null;
}

export const isAddress = (input: string, kind?: AddressKind) => {
  const k = addressKind(input);
  return k !== null && (!kind || k === kind);
};

/** "GABC…WXYZ" for tight spaces; the full address stays one click away. */
export const shortAddress = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

export type Network = "testnet";
const EXPLORER = "https://stellar.expert/explorer";

export const explorerUrl = {
  tx: (hash: string, net: Network = "testnet") => `${EXPLORER}/${net}/tx/${hash}`,
  address: (a: string, net: Network = "testnet") => `${EXPLORER}/${net}/${addressKind(a) === "contract" ? "contract" : "account"}/${a}`,
};

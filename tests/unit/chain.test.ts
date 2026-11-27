import { describe, expect, it } from "vitest";
import { addressKind, explorerUrl, isAddress, shortAddress } from "@/lib/chain/address";

// Vectors from the StrKey spec (SEP-23).
const G = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const C = "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE";

describe("stellar addresses", () => {
  it("accepts valid account and contract addresses", () => {
    expect(addressKind(G)).toBe("account");
    expect(addressKind(C)).toBe("contract");
    expect(isAddress(G, "account")).toBe(true);
    expect(isAddress(C, "account")).toBe(false);
  });

  it("rejects a typo, a wrong length, lowercase and secret seeds", () => {
    const typo = G.slice(0, 10) + (G[10] === "A" ? "B" : "A") + G.slice(11);
    expect(isAddress(typo)).toBe(false);
    expect(isAddress(G.slice(1))).toBe(false);
    expect(isAddress(G.toLowerCase())).toBe(false);
    expect(isAddress("SBGWSG6BTNCKCOB3DIFBGCVMUPQFYPA2G4O34RMTB343OYPXU5DJDVMN")).toBe(false);
  });

  it("builds testnet explorer links and short labels", () => {
    expect(explorerUrl.address(G)).toBe(`https://stellar.expert/explorer/testnet/account/${G}`);
    expect(explorerUrl.address(C)).toBe(`https://stellar.expert/explorer/testnet/contract/${C}`);
    expect(explorerUrl.tx("abc")).toBe("https://stellar.expert/explorer/testnet/tx/abc");
    expect(shortAddress(G)).toBe("GA7Q…VSGZ");
  });
});

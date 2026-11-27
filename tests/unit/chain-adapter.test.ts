import { describe, expect, it } from "vitest";
import { getChain, type ChainAdapter } from "@/lib/chain";
import { simulatedChain } from "@/lib/chain/simulated";

const G = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const C = "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE";

// The behaviour every ChainAdapter must show. The Stellar testnet adapter will run this same suite.
function adapterContract(name: string, make: () => ChainAdapter) {
  describe(`${name} adapter`, () => {
    it("is on testnet", () => {
      expect(make().network).toBe("testnet");
    });

    it("knows nothing about an unfunded address", async () => {
      const chain = make();
      expect(await chain.account(G)).toBeNull();
      expect(await chain.balances(G)).toEqual({ xlm: "0", usdcCents: 0 });
    });

    it("funds a test account once and reports its balances", async () => {
      const chain = make();
      const ref = await chain.fundTestAccount(C);
      expect(ref.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(ref.ledger).toBeGreaterThan(0);
      expect(await chain.account(C)).toMatchObject({ address: C, kind: "smart" });
      const b = await chain.balances(C);
      expect(Number(b.xlm)).toBeGreaterThan(0);
      expect(b.usdcCents).toBeGreaterThan(0);
      await expect(chain.fundTestAccount(C)).rejects.toThrow(/already funded/);
    });

    it("rejects anything that isn't a Stellar address", async () => {
      const chain = make();
      await expect(chain.balances("not-an-address")).rejects.toThrow(/Not a Stellar address/);
      await expect(chain.fundTestAccount(G.toLowerCase())).rejects.toThrow(/Not a Stellar address/);
    });
  });
}

adapterContract("simulated", () => simulatedChain());

describe("simulated adapter", () => {
  it("gives the same hashes for the same run", async () => {
    const at = new Date("2026-12-01T00:00:00Z");
    const run = async () => {
      const chain = simulatedChain(() => at);
      return [await chain.fundTestAccount(G), await chain.fundTestAccount(C)];
    };
    expect(await run()).toEqual(await run());
  });

  it("is the one adapter the app gets", async () => {
    expect(await getChain()).toBe(await getChain());
    expect((await getChain()).network).toBe("testnet");
  });

  it("reports a G address as a wallet account", async () => {
    const chain = simulatedChain();
    await chain.fundTestAccount(G);
    expect((await chain.account(G))?.kind).toBe("wallet");
  });
});

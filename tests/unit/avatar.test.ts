import { describe, expect, it } from "vitest";
import { CAST, SHAPES, eyesFor, fileName, outline, parseAvatar } from "@/lib/avatar";

describe("EVRA avatars", () => {
  it("draws every shape as one closed, finite outline about its radius", () => {
    for (const s of SHAPES) {
      const d = outline(s, 80);
      expect(d, s).toMatch(/^M[^MZ]+Z$/);
      const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      expect(nums.every((n) => Number.isFinite(n) && Math.abs(n) <= 86), s).toBe(true);
      expect(Math.max(...nums.map(Math.abs)), s).toBeGreaterThan(78); // fitted out to the radius, not shrunk
    }
  });

  it("round-trips every character through the avatar file", () => {
    for (const c of CAST) expect(parseAvatar(JSON.parse(JSON.stringify(c.def)))).toEqual(c.def);
  });

  it("rejects files that aren't avatars and pictures that aren't raster data", () => {
    const evi = CAST[0].def;
    for (const bad of [null, "evi", { ...evi, v: 2 }, { ...evi, shape: "cube" }, { ...evi, body: "red" }, { ...evi, name: "  " }, { ...evi, eyeSize: 9 }])
      expect(parseAvatar(bad)).toBeNull();
    for (const photo of ["data:image/svg+xml;base64,PHN2Zz4=", "javascript:alert(1)", "https://example.com/a.png", "data:image/png;base64,iVBO<script>"])
      expect(parseAvatar({ ...evi, photo }), photo).toBeNull();
    expect(parseAvatar({ ...evi, photo: "data:image/webp;base64,UklGRg==" })?.photo).toBe("data:image/webp;base64,UklGRg==");
    expect(parseAvatar({ ...evi, extra: "dropped" })).toEqual(evi);
  });

  it("keeps eyes readable when the body colour changes", () => {
    expect(eyesFor("#ffffff", "#6a1fd0")).toBe("#6a1fd0");
    expect(eyesFor("#000000", "#000000")).toBe("#ffffff");
    expect(eyesFor("#ead1fd", "#ffffff")).toBe("#000000");
  });

  it("names downloads after the avatar", () => {
    expect(fileName({ ...CAST[0].def, name: "Evi the Agent!" })).toBe("evi-the-agent");
    expect(fileName({ ...CAST[0].def, name: "✦✦" })).toBe("avatar");
  });
});

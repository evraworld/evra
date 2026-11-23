import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { BRAND_EMAIL, SARA, newCreator, sendOffer, signIn, uniq } from "../helpers/app";

// Fails on serious/critical axe findings; every finding (any impact) is printed and attached to the report.
async function audit(page: Page) {
  const info = test.info();
  // nextjs-portal is the Next dev-tools overlay, not part of the product.
  const { violations } = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  const where = (n: (typeof violations)[number]["nodes"][number]) => {
    const d = n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number; expectedContrastRatio?: string } | undefined;
    return `${n.target.join(" ")}${d?.contrastRatio ? ` (${d.fgColor} on ${d.bgColor} = ${d.contrastRatio}:1, needs ${d.expectedContrastRatio})` : ""}`;
  };
  const lines = violations.map((v) => `${v.impact} ${v.id}: ${v.help} [${v.nodes.length}x] ${v.nodes.slice(0, 3).map(where).join(" | ")}`);
  await info.attach("axe-violations", { body: JSON.stringify(violations, null, 2), contentType: "application/json" });
  if (lines.length) console.log(`[axe] ${info.project.name} ${new URL(page.url()).pathname}\n  ${lines.join("\n  ")}`);
  expect(lines.filter((l) => /^(serious|critical) /.test(l)), "serious or critical axe violations").toEqual([]);
}

test("/signin", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Sign in to EVRA" })).toBeVisible();
  await audit(page);
});

test("/onboarding (signed in, new account)", async ({ page }) => {
  await signIn(page.request, `e2e-a11y-${uniq()}@demo.evra.world`);
  await page.goto("/onboarding");
  await expect(page.getByText("What brings you to EVRA?")).toBeVisible();
  await audit(page);
});

test("/home (brand)", async ({ page }) => {
  await signIn(page.request, BRAND_EMAIL);
  await page.goto("/home");
  await expect(page.locator("main")).toBeVisible();
  await audit(page);
});

test("/home (creator)", async ({ page }) => {
  await signIn(page.request, `${SARA}@demo.evra.world`);
  await page.goto("/home");
  await expect(page.locator("main")).toBeVisible();
  await audit(page);
});

test("Deal Room (brand, new offer)", async ({ page, browser, baseURL }) => {
  const creatorCtx = await browser.newContext({ baseURL });
  const creator = await newCreator(creatorCtx.request);
  await creatorCtx.close();
  await signIn(page.request, BRAND_EMAIL);
  await sendOffer(page, creator.handle);
  await expect(page.getByRole("button", { name: "Approve these terms" })).toBeVisible();
  await audit(page);
});

test("/@sara.creates (public kit)", async ({ page }) => {
  await page.goto(`/@${SARA}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await audit(page);
});

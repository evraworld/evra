import { expect, test } from "@playwright/test";
import { appError, codeIn, nextMessage, seenIds, uniq } from "../helpers/app";

test("a new creator signs up, onboards with a Claude-drafted kit and the kit is public", async ({ page, browser, baseURL }) => {
  test.setTimeout(4 * 60_000);
  const id = uniq();
  const email = `e2e-${id}@demo.evra.world`;
  const handle = `e2e_${id}`;
  const name = `E2E Signup ${id}`;
  const next = page.getByRole("button", { name: "Continue" });
  let drafted = "";

  await test.step("sign in with an email code", async () => {
    await page.goto("/signin");
    await page.getByLabel("Email").fill(email);
    const seen = await seenIds(page.request, email);
    await page.getByRole("button", { name: "Send my code" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await page.getByLabel("6-digit code").fill(codeIn(await nextMessage(page.request, email, "signin_code", seen)));
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/onboarding");
  });

  await test.step("role and basics", async () => {
    await page.getByRole("radio", { name: /I make content/ }).check();
    await next.click();
    await page.getByLabel("Your name").fill(name);
    await page.getByLabel("Your EVRA link").fill(handle);
    await page.getByLabel("Your EVRA link").blur();
    await expect(page.getByText(`evra.world/@${handle}`, { exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: /I'm 18 or older/ }).check();
    await next.click();
  });

  await test.step("accounts with demo numbers", async () => {
    await page.getByLabel("Username").fill(handle);
    await page.getByRole("button", { name: "Use demo numbers" }).click();
    await expect(page.getByText("Demo data")).toBeVisible();
    await next.click();
  });

  await test.step("work, extras", async () => {
    await page.getByRole("checkbox", { name: "Beauty" }).check();
    await page.getByLabel("Your minimum for one Reel (USD)").fill("300");
    await next.click();
    await expect(page.getByRole("heading", { name: "Anything else?" })).toBeVisible();
    await next.click();
  });

  await test.step("kit drafted by Claude, then publish", async () => {
    const headline = page.getByLabel("Headline");
    // The empty form flashes before the draft request starts, so poll for "filled" or "error" instead of visibility.
    const state = async () => ((await appError(page).count()) ? `error: ${await appError(page).first().innerText()}` : (await headline.isVisible()) && (await headline.inputValue()) ? "ready" : "drafting");
    await expect.poll(state, { timeout: 90_000 }).not.toBe("drafting");
    expect(await state()).toBe("ready");
    await expect(page.getByLabel("Bio")).not.toHaveValue("");
    drafted = (await headline.inputValue()).trim();
    await page.getByRole("button", { name: "Publish my kit" }).click();
    await page.waitForURL("**/me?welcome=1");
    await expect(page.getByText("Your kit is live")).toBeVisible();
  });

  await test.step("kit is public at /@handle", async () => {
    const anon = await browser.newContext({ baseURL });
    const kit = await anon.newPage();
    const res = await kit.goto(`/@${handle}`);
    expect(res?.status()).toBe(200);
    await expect(kit.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(kit.getByText(`@${handle}`, { exact: true })).toBeVisible();
    await expect(kit.getByText(drafted, { exact: true })).toBeVisible();
    await anon.close();
  });
});

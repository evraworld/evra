import { expect, test } from "@playwright/test";
import { BRAND_EMAIL, appError, newCreator, sendOffer, signIn, uniq } from "../helpers/app";

test("deal flow: offer, both approve, brand starts the work, live post, approval completes the deal", async ({ browser, baseURL }) => {
  test.setTimeout(4 * 60_000);
  const brandCtx = await browser.newContext({ baseURL });
  const creatorCtx = await browser.newContext({ baseURL });
  const creator = await newCreator(creatorCtx.request);
  await signIn(brandCtx.request, BRAND_EMAIL);
  const brand = await brandCtx.newPage();
  const me = await creatorCtx.newPage();

  const deal = await test.step("Glow Co. sends an offer from the creator's kit and approves", async () => {
    const path = await sendOffer(brand, creator.handle);
    await brand.getByRole("button", { name: "Approve these terms" }).click();
    await expect(brand.getByText("You approved these terms.")).toBeVisible();
    return path;
  });

  await test.step("creator approves, terms lock", async () => {
    await me.goto(deal);
    await me.getByRole("button", { name: "Approve these terms" }).click();
    await expect(me.getByText("Agreed. Waiting for the brand to start the work.")).toBeVisible();
  });

  await test.step("brand starts the work", async () => {
    await brand.reload();
    await brand.getByRole("button", { name: "Start the work" }).click();
    await expect(brand.getByText("Working. The brand approves the work, then pays the creator directly, as agreed.")).toBeVisible();
    await expect(appError(brand)).toHaveCount(0);
  });

  await test.step("creator sends the live post", async () => {
    await me.reload();
    await me.getByLabel("Link to the draft or the live post").fill(`https://www.instagram.com/p/e2e${uniq()}/`);
    await me.getByRole("radio", { name: "The live post" }).check();
    await me.getByRole("button", { name: "Send work" }).click();
    await expect(me.getByText("Delivered, waiting for approval")).toBeVisible();
  });

  await test.step("brand confirms the post is live and approves", async () => {
    await brand.reload();
    await brand.getByRole("checkbox", { name: "I've seen the post live with the disclosure" }).check();
    await brand.getByRole("button", { name: "Approve the work" }).click();
    await expect(brand.getByText("Approved. Payment is between the brand and the creator, as agreed.")).toBeVisible();
  });

  await test.step("creator sees the deal completed", async () => {
    await me.reload();
    await expect(me.getByText("Approved. Payment is between the brand and the creator, as agreed.")).toBeVisible();
    await expect(me.locator(".ev-timeline")).toContainText("completed");
  });

  await brandCtx.close();
  await creatorCtx.close();
});

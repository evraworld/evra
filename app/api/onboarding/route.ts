import { z } from "zod";
import { getDb } from "@/lib/db";
import { apiUser, HttpError } from "@/lib/auth/guards";
import { body, route } from "@/lib/http";
import { draftKit, brandProfile } from "@/lib/ai/agents";
import { AgentUnavailable } from "@/lib/ai/claude";
import { fetchPublicText, FetchBlocked } from "@/lib/fetchPublic";
import { rateRange } from "@/lib/rates";
import { demoStats, publicInstagram } from "@/lib/social";
import { handleAvailable, HANDLE_RE, normalizeHandle } from "@/lib/users";
import { completeBrand, completeCreator, completeManager, NICHES, OnboardingInput } from "@/lib/onboarding";
import { formatMoney } from "@/lib/money";

const allowDemo = () => process.env.NODE_ENV !== "production" || process.env.EVRA_DEMO === "1";
const origin = () => process.env.APP_ORIGIN ?? "http://localhost:3000";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("handle"), handle: z.string().max(40) }),
  z.object({ action: z.literal("brand-profile"), website: z.string().min(3).max(200) }),
  z.object({ action: z.literal("rate-hint"), niche: z.enum(NICHES), country: z.string().max(5), followers: z.number().int().min(0) }),
  z.object({ action: z.literal("account-stats"), platform: z.enum(["instagram", "tiktok", "youtube"]), handle: z.string().min(1).max(60), mode: z.enum(["demo", "public"]) }),
  z.object({ action: z.literal("kit-draft"), name: z.string().max(80), handle: z.string().max(40), platform: z.string().max(20), followers: z.number().int(), avgViews: z.number().int(), city: z.string().max(60).optional(), captions: z.array(z.string().max(500)).max(8).default([]) }),
  z.object({ action: z.literal("complete"), data: z.unknown() }),
]);

// One endpoint for the onboarding flow's helper calls, so the client keeps a single, simple contract.
export const POST = route(async (req) => {
  const user = await apiUser();
  const db = await getDb();
  const a = Action.parse(await body(req));
  try {
    switch (a.action) {
      case "handle": {
        const h = normalizeHandle(a.handle);
        return { handle: h, valid: HANDLE_RE.test(h), available: HANDLE_RE.test(h) && (await handleAvailable(db, h, user.id)) };
      }
      case "brand-profile": {
        const text = await fetchPublicText(a.website);
        return await brandProfile({ url: a.website, pageText: text });
      }
      case "rate-hint": {
        const country = a.country === "IN" ? "IN" : "AE";
        const r = await rateRange(db, { niche: a.niche, country, deliverable: "reel", followers: a.followers });
        return r ? { ...r, low: formatMoney(r.lowCents), high: formatMoney(r.highCents) } : { none: true };
      }
      case "account-stats": {
        if (a.mode === "demo") {
          if (!allowDemo()) throw new HttpError(403, "Demo numbers are only for local testing.");
          return { ...demoStats(a.handle, a.platform), source: "demo" };
        }
        const p = a.platform === "instagram" ? await publicInstagram(normalizeHandle(a.handle)) : null;
        if (!p) throw new HttpError(404, "We couldn't read that public profile. Type your follower count instead.");
        return { ...p, source: "public" };
      }
      case "kit-draft":
        return await draftKit({ ...a, locale: user.locale });
      case "complete": {
        const input = OnboardingInput.parse(a.data);
        if (input.role === "creator") await completeCreator(db, user, input, { allowDemo: allowDemo(), origin: origin() });
        else if (input.role === "brand") await completeBrand(db, user, input);
        else await completeManager(db, user, input);
        return { next: input.role === "creator" ? "/me?welcome=1" : "/home" };
      }
    }
  } catch (e) {
    if (e instanceof AgentUnavailable) throw new HttpError(503, e.message);
    if (e instanceof FetchBlocked) throw new HttpError(400, `We couldn't read that website: ${e.message}`);
    throw e;
  }
});

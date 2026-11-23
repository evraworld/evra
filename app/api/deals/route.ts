import { after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { apiUser, HttpError } from "@/lib/auth/guards";
import { brandForUser } from "@/lib/brands";
import { createDeal, defaultTerms } from "@/lib/deals/create";
import { runCreatorAgent } from "@/lib/deals/agent";
import { body, route } from "@/lib/http";

const Input = z.object({
  action: z.literal("create_from_kit"),
  creatorId: z.string().uuid(),
  totalCents: z.number().int().min(100).max(10_000_000),
  deliverable: z.enum(["reel", "story", "post", "short", "video", "tiktok", "ugc", "live", "event"]).default("reel"),
  title: z.string().trim().max(80).optional(),
});

export const POST = route(async (req) => {
  const user = await apiUser();
  const p = Input.parse(await body(req));
  const db = await getDb();
  const brand = await brandForUser(db, user.id);
  if (!brand) throw new HttpError(403, "Only brands can send offers.");
  const [creator] = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.id, p.creatorId)).limit(1);
  if (!creator || creator.role !== "creator") throw new HttpError(404, "Creator not found.");
  const deal = await createDeal(db, {
    brandId: brand.id,
    creatorId: creator.id,
    title: p.title || `${brand.name} x ${creator.name ?? "creator"}`,
    terms: defaultTerms({ totalCents: p.totalCents, deliverables: [{ type: p.deliverable, count: 1 }] }),
    proposedBy: user.id,
    side: "brand",
  });
  after(() => runCreatorAgent(db, deal.id).catch((e) => console.error("creator agent failed", e)));
  return { next: `/deals/${deal.id}` };
});

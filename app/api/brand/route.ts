import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { brands } from "@/lib/db/schema";
import { apiUser, HttpError } from "@/lib/auth/guards";
import { brandForUser } from "@/lib/brands";
import { body, route } from "@/lib/http";
import { COUNTRIES } from "@/lib/onboarding";

const Profile = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters.").max(80),
  website: z.string().trim().max(200).default(""),
  category: z.string().trim().max(60).default(""),
  description: z.string().trim().max(500).default(""),
  country: z.enum(COUNTRIES),
});

const hostOf = (url: string) => {
  try {
    return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

// Brand profile settings. A new website re-runs the domain check, so a verified mark never carries over to another domain.
export const POST = route(async (req) => {
  const user = await apiUser();
  const db = await getDb();
  const brand = await brandForUser(db, user.id);
  if (!brand) throw new HttpError(403, "Only brands have a brand profile.");
  if (brand.memberRole !== "owner" && brand.memberRole !== "admin") throw new HttpError(403, "Ask an owner or admin to change the brand profile.");
  const p = Profile.parse(await body(req));
  const domain = p.website ? hostOf(p.website) : null;
  if (p.website && !domain?.includes(".")) throw new HttpError(400, "That website doesn't look right. Try something like glowco.com.");
  await db
    .update(brands)
    .set({
      name: p.name,
      website: p.website || null,
      category: p.category || null,
      description: p.description || null,
      country: p.country,
      domain,
      domainVerified: domain === brand.domain ? brand.domainVerified : !!domain && domain === user.email.split("@")[1]?.toLowerCase(),
    })
    .where(eq(brands.id, brand.id));
  return { ok: true };
});

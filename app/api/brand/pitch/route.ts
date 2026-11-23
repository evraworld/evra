import { z } from "zod";
import { getDb } from "@/lib/db";
import { apiUser, HttpError } from "@/lib/auth/guards";
import { body, route } from "@/lib/http";
import { pitchBrand } from "@/lib/discovery";

// A creator pitches a brand from the directory: a Deal Room opens with their Reel price.
export const POST = route(async (req) => {
  const user = await apiUser();
  if (user.role !== "creator") throw new HttpError(403, "Only creators can pitch brands.");
  const { brandId } = z.object({ brandId: z.uuid() }).parse(await body(req));
  const dealId = await pitchBrand(await getDb(), { user, brandId, origin: process.env.APP_ORIGIN ?? "http://localhost:3000" });
  return { dealId, next: `/deals/${dealId}` };
});

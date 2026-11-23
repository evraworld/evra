import { getDb } from "@/lib/db";
import { apiUser } from "@/lib/auth/guards";
import { verifyRegistration } from "@/lib/auth/passkeys";
import { body, route } from "@/lib/http";

export const POST = route(async (req) => {
  const { response, deviceName } = await body(req);
  await verifyRegistration(await getDb(), await apiUser(), response, typeof deviceName === "string" ? deviceName.slice(0, 60) : undefined);
  return { ok: true };
});

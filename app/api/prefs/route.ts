import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { currentUser } from "@/lib/auth/session";
import { body, route } from "@/lib/http";

const Input = z.object({ locale: z.enum(["en", "ar", "hi"]).optional(), text: z.enum(["md", "lg", "xl"]).optional() });
const YEAR = 365 * 86_400;

export const POST = route(async (req) => {
  const p = Input.parse(await body(req));
  const jar = await cookies();
  if (p.locale) jar.set("evra_lang", p.locale, { path: "/", maxAge: YEAR, sameSite: "lax" });
  if (p.text) jar.set("evra_text", p.text, { path: "/", maxAge: YEAR, sameSite: "lax" });
  const user = await currentUser();
  if (user && p.locale) await (await getDb()).update(users).set({ locale: p.locale }).where(eq(users.id, user.id));
  return { ok: true };
});

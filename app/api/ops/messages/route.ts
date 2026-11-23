import { z } from "zod";
import { getDb } from "@/lib/db";
import { apiStaff } from "@/lib/auth/guards";
import { body, route } from "@/lib/http";
import { sendTest, TEMPLATE_KEYS } from "@/lib/ops/messages";

const Input = z.object({ template: z.enum(TEMPLATE_KEYS), locale: z.enum(["en", "ar", "hi"]) });

// Test sends only ever go to the signed-in staff member's own email.
export const POST = route(async (req) => {
  const staff = await apiStaff();
  const { template, locale } = Input.parse(await body(req));
  await sendTest(await getDb(), staff, template, locale);
  return { to: staff.email };
});

import { z } from "zod";
import { getDb } from "@/lib/db";
import { apiStaff } from "@/lib/auth/guards";
import { body, route } from "@/lib/http";
import { approveDraft, deleteDraft, editDraft, importKits, inviteDraft, redraft } from "@/lib/ops/kits";

const origin = () => process.env.APP_ORIGIN ?? "http://localhost:3000";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import"), csv: z.string().max(20_000) }),
  z.object({ action: z.literal("draft"), id: z.uuid(), followers: z.number().int().min(1).max(500_000_000).optional() }),
  z.object({ action: z.literal("edit"), id: z.uuid(), displayName: z.string().trim().min(1).max(80), headline: z.string().trim().max(120), synopsis: z.string().trim().max(400) }),
  z.object({ action: z.literal("approve"), id: z.uuid() }),
  z.object({ action: z.literal("invite"), id: z.uuid() }),
  z.object({ action: z.literal("delete"), id: z.uuid() }),
]);

export const POST = route(async (req) => {
  const staff = await apiStaff();
  const db = await getDb();
  const a = Action.parse(await body(req));
  switch (a.action) {
    case "import":
      return importKits(db, staff.id, a.csv);
    case "draft":
      return redraft(db, staff.id, a.id, { followers: a.followers });
    case "edit":
      return editDraft(db, staff.id, a.id, a);
    case "approve":
      return approveDraft(db, staff.id, a.id);
    case "invite":
      return inviteDraft(db, staff.id, a.id, origin());
    case "delete":
      return deleteDraft(db, staff.id, a.id);
  }
});

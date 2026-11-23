import { after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { brands, dealTerms, users } from "@/lib/db/schema";
import { apiUser, HttpError } from "@/lib/auth/guards";
import { dealAccess } from "@/lib/deals/access";
import * as act from "@/lib/deals/actions";
import { decideAgentProposal, runCreatorAgent } from "@/lib/deals/agent";
import { summarizeTerms } from "@/lib/ai/agents";
import { AgentUnavailable } from "@/lib/ai/claude";
import { body, route } from "@/lib/http";

const idx = z.number().int().min(0).max(4);
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("counter"), terms: z.unknown() }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("submit"), idx, url: z.string().max(500), note: z.string().max(500).optional(), kind: z.enum(["draft", "live"]) }),
  z.object({ action: z.literal("request_changes"), idx, comment: z.string().max(1000) }),
  z.object({ action: z.literal("approve_milestone"), idx, liveConfirmed: z.boolean().optional() }),
  z.object({ action: z.literal("dispute"), idx, reason: z.string().max(1000) }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("comment"), body: z.string().max(2000) }),
  z.object({ action: z.literal("rate"), score: z.number().int().min(1).max(5), onTime: z.boolean(), comment: z.string().max(500).optional() }),
  z.object({ action: z.literal("agent_decide"), actionId: z.string().uuid(), approve: z.boolean() }),
  z.object({ action: z.literal("agent_review") }),
  z.object({ action: z.literal("summary") }),
]);

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const user = await apiUser();
  const db = await getDb();
  const ctx = await dealAccess(db, id, user);
  const a = Action.parse(await body(req));
  try {
    switch (a.action) {
      case "counter":
        await act.counter(db, ctx, a.terms);
        if (ctx.side === "brand") after(() => runCreatorAgent(db, id).catch((e) => console.error("creator agent failed", e)));
        return { ok: true };
      case "approve":
        return await act.approveTerms(db, ctx);
      case "start":
        await act.startWork(db, ctx);
        return { ok: true };
      case "submit":
        await act.submitWork(db, ctx, a);
        return { ok: true };
      case "request_changes":
        await act.requestChanges(db, ctx, a);
        return { ok: true };
      case "approve_milestone":
        await act.approveMilestone(db, ctx, a);
        return { ok: true };
      case "dispute":
        await act.openDispute(db, ctx, a);
        return { ok: true };
      case "cancel":
        await act.cancelDeal(db, ctx);
        return { ok: true };
      case "comment":
        await act.addComment(db, ctx, a.body);
        return { ok: true };
      case "rate":
        await act.rateDeal(db, ctx, a);
        return { ok: true };
      case "agent_decide":
        if (ctx.side !== "creator") throw new HttpError(403, "Only the creator decides on their agent's drafts.");
        await decideAgentProposal(db, ctx, a.actionId, a.approve);
        return { ok: true };
      case "agent_review":
        if (ctx.side !== "creator") throw new HttpError(403, "Only the creator can ask their agent.");
        await runCreatorAgent(db, id);
        return { ok: true };
      case "summary": {
        const t = await act.currentTerms(db, ctx.deal);
        const [[b], [c]] = await Promise.all([db.select({ name: brands.name }).from(brands).where(eq(brands.id, ctx.deal.brandId)), db.select({ name: users.name }).from(users).where(eq(users.id, ctx.deal.creatorId))]);
        const s = await summarizeTerms({ terms: t.terms, brandName: b?.name ?? "Brand", creatorName: c?.name ?? "Creator", locale: user.locale });
        if (user.locale === "en") await db.update(dealTerms).set({ summary: [s.summary, ...s.watchOut.map((w) => `Check: ${w}`)].join("\n") }).where(eq(dealTerms.id, t.id));
        return s;
      }
    }
  } catch (e) {
    if (e instanceof AgentUnavailable) throw new HttpError(503, e.message);
    throw e;
  }
});

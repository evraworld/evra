import type { RequestType } from "@/lib/db/schema";

// Client-safe request vocabulary: the request menu, the inboxes and the API all read these.
// Ownership offers join in P3 (module 14), so they are not offered yet.
export const REQUEST_TYPES = ["paid_collab", "seeding", "event", "feedback_call", "licence"] as const satisfies readonly RequestType[];
export type P1RequestType = (typeof REQUEST_TYPES)[number];

export const DECLINE_REASONS = ["rate", "timing", "category", "rights", "budget", "fit"] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

export const REQUEST_DELIVERABLES = ["reel", "story", "post", "tiktok", "short", "video", "ugc"] as const;

export type FormField = "amount" | "deliverable" | "product" | "date" | "place" | "minutes" | "postUrl" | "months";

// Each type's short form; the message is always asked for.
export const FORM_FIELDS: Record<P1RequestType, FormField[]> = {
  paid_collab: ["amount", "deliverable"],
  seeding: ["product"],
  event: ["date", "place", "amount"],
  feedback_call: ["minutes", "amount"],
  licence: ["postUrl", "months", "amount"],
};

// A paid collab with an amount is a funded offer: it never spends request credits.
export const isFunded = (type: RequestType, amountCents?: number | null) => type === "paid_collab" && (amountCents ?? 0) > 0;

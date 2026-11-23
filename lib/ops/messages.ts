import type { DB } from "@/lib/db";
import type { Locale } from "@/lib/db/schema";
import { render, send } from "@/lib/messages";
import { templates, type TemplateData, type TemplateKey } from "@/lib/messages/templates";
import { audit } from "./audit";

const url = (path: string) => `https://evra.world${path}`;

// Sample data for every template. The type makes a new template fail to compile until it has a sample here.
export const SAMPLES: { [K in TemplateKey]: TemplateData<K> } = {
  signin_code: { code: "123456" },
  claim_code: { code: "123456", amount: "$300" },
  pay_link: { from: "Glow Co.", amount: "$300", by: "20 Nov", url: url("/pay/sample") },
  request_new: { from: "Glow Co.", type: "paid collab", url: url("/reply/sample") },
  request_reminder: { from: "Glow Co.", url: url("/reply/sample") },
  request_no_response: { creator: "Sara Ahmed" },
  manager_invite: { creator: "Sara Ahmed", url: url("/manager/sample") },
  kit_claim_invite: { name: "Sara Ahmed", url: url("/claim/sample") },
  deal_update: { title: "Summer glow reel", what: "Glow Co. approved your draft", url: url("/deals/sample") },
  review_decision: { approved: false, reason: "We couldn't confirm your audience numbers yet" },
  weekly_digest: { lines: ["2 new offers this week", "1 deal waiting for your draft"] },
  tool_result: { tool: "Brand-ready score", summary: "You scored 72 out of 100. Your rate card and disclosure answers were strongest." },
};

export const TEMPLATE_KEYS = Object.keys(templates) as TemplateKey[];
export const MESSAGE_LOCALES: Locale[] = ["en", "ar", "hi"];

export const preview = (key: TemplateKey, locale: Locale) => render(key, locale, SAMPLES[key]);

export async function sendTest(db: DB, staff: { id: string; email: string }, key: TemplateKey, locale: Locale) {
  await send(db, { to: staff.email, template: key, locale, data: SAMPLES[key], test: true });
  await audit(db, staff.id, "message_test", { data: { template: key, locale } });
}

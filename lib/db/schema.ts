import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();

export type Locale = "en" | "ar" | "hi";
export type Role = "creator" | "brand" | "manager";
export type AgentLevel = "manual" | "copilot" | "delegate";
export type RequestType = "paid_collab" | "seeding" | "event" | "feedback_call" | "licence" | "ownership";
export type HelpTag = "content" | "reach" | "events" | "product_feedback" | "community";
export type Deliverable = "reel" | "story" | "post" | "short" | "video" | "tiktok" | "ugc" | "live" | "event";
export type Platform = "instagram" | "tiktok" | "youtube" | "x";

// ---------- identity ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role").$type<Role>(),
    locale: text("locale").$type<Locale>().notNull().default("en"),
    handle: text("handle"),
    staff: boolean("staff").notNull().default(false),
    status: text("status").$type<"active" | "pending_review" | "declined" | "suspended">().notNull().default("active"),
    country: text("country"),
    city: text("city"),
    adult: boolean("adult").notNull().default(false),
    referralCode: text("referral_code"),
    referredBy: uuid("referred_by"),
    foundingNumber: integer("founding_number"),
    onboardedAt: ts("onboarded_at"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email), uniqueIndex("users_handle_uq").on(t.handle), uniqueIndex("users_ref_uq").on(t.referralCode)],
);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  createdAt: created(),
  expiresAt: ts("expires_at").notNull(),
  userAgent: text("user_agent"),
});

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    purpose: text("purpose").$type<"signin" | "claim">().notNull().default("signin"),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    createdAt: created(),
  },
  (t) => [index("otp_email_idx").on(t.email)],
);

export const passkeys = pgTable("passkeys", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  transports: jsonb("transports").$type<string[]>(),
  deviceName: text("device_name"),
  createdAt: created(),
});

export const webauthnChallenges = pgTable("webauthn_challenges", {
  id: text("id").primaryKey(),
  userId: uuid("user_id"),
  challenge: text("challenge").notNull(),
  expiresAt: ts("expires_at").notNull(),
});

// Every email / WhatsApp / push EVRA sends; in development it is the only delivery channel.
export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: text("channel").$type<"email" | "whatsapp" | "push">().notNull().default("email"),
    to: text("to").notNull(),
    template: text("template").notNull(),
    locale: text("locale").$type<Locale>().notNull().default("en"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    test: boolean("test").notNull().default(false),
    createdAt: created(),
  },
  (t) => [index("outbox_to_idx").on(t.to)],
);

// ---------- creators ----------

export const creatorProfiles = pgTable("creator_profiles", {
  userId: uuid("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  headline: text("headline"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  niches: jsonb("niches").$type<string[]>().notNull().default([]),
  languages: jsonb("languages").$type<string[]>().notNull().default([]),
  openTo: jsonb("open_to").$type<RequestType[]>().notNull().default(["paid_collab", "seeding"]),
  howIHelp: jsonb("how_i_help").$type<HelpTag[]>().notNull().default([]),
  minRateCents: integer("min_rate_cents").notNull().default(0),
  blockedBrands: jsonb("blocked_brands").$type<string[]>().notNull().default([]),
  maxMonthlyDeals: integer("max_monthly_deals").notNull().default(8),
  agentLevel: text("agent_level").$type<AgentLevel>().notNull().default("copilot"),
  counterRangePct: integer("counter_range_pct").notNull().default(15),
  kitPublic: boolean("kit_public").notNull().default(true),
  hiddenStats: jsonb("hidden_stats").$type<string[]>().notNull().default([]),
  links: jsonb("links").$type<{ label: string; url: string }[]>().notNull().default([]),
  updatedAt: updated(),
});

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    platform: text("platform").$type<Platform>().notNull(),
    handle: text("handle").notNull(),
    followers: integer("followers").notNull().default(0),
    avgViews: integer("avg_views").notNull().default(0),
    engagementBps: integer("engagement_bps").notNull().default(0),
    audience: jsonb("audience").$type<{ countries?: Record<string, number>; ages?: Record<string, number>; genders?: Record<string, number> }>(),
    reach90d: jsonb("reach_90d").$type<number[]>(),
    topPosts: jsonb("top_posts").$type<{ url: string; views: number; likes: number; caption?: string }[]>(),
    source: text("source").$type<"oauth" | "demo" | "public" | "self" | "review">().notNull(),
    verified: boolean("verified").notNull().default(false),
    syncedAt: created(),
  },
  (t) => [uniqueIndex("social_user_platform_uq").on(t.userId, t.platform)],
);

export const showcaseItems = pgTable("showcase_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  kind: text("kind").$type<"collab" | "press" | "post" | "video">().notNull(),
  title: text("title").notNull(),
  url: text("url"),
  brandName: text("brand_name"),
  metric: text("metric"),
  verification: text("verification").$type<"verified" | "self_reported" | "found_public">().notNull().default("self_reported"),
  createdAt: created(),
});

export const rateCardItems = pgTable("rate_card_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  deliverable: text("deliverable").$type<Deliverable>().notNull(),
  label: text("label").notNull(),
  priceCents: integer("price_cents").notNull(),
  isPackage: boolean("is_package").notNull().default(false),
  position: integer("position").notNull().default(0),
});

// Anonymised deal prices behind rate guidance and the Pay Index. source=seed rows are illustrative and labelled as such.
export const rateSamples = pgTable(
  "rate_samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    niche: text("niche").notNull(),
    country: text("country").notNull(),
    platform: text("platform").$type<Platform>().notNull(),
    deliverable: text("deliverable").$type<Deliverable>().notNull(),
    followers: integer("followers").notNull(),
    amountCents: integer("amount_cents").notNull(),
    source: text("source").$type<"deal" | "seed">().notNull(),
    createdAt: created(),
  },
  (t) => [index("rate_samples_lookup_idx").on(t.niche, t.country, t.deliverable)],
);

// ---------- brands ----------

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  website: text("website"),
  domain: text("domain"),
  domainVerified: boolean("domain_verified").notNull().default(false),
  category: text("category"),
  country: text("country"),
  description: text("description"),
  plan: text("plan").$type<"pay_per_deal" | "growth" | "scale" | "agency">().notNull().default("pay_per_deal"),
  kybStatus: text("kyb_status").$type<"none" | "pending" | "verified">().notNull().default("none"),
  createdAt: created(),
});

export const brandMembers = pgTable(
  "brand_members",
  {
    brandId: uuid("brand_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").$type<"owner" | "admin" | "member" | "approver" | "finance" | "viewer">().notNull().default("owner"),
  },
  (t) => [primaryKey({ columns: [t.brandId, t.userId] })],
);

export const managerLinks = pgTable("manager_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: uuid("creator_id").notNull(),
  managerEmail: text("manager_email").notNull(),
  managerUserId: uuid("manager_user_id"),
  copyTypes: jsonb("copy_types").$type<RequestType[]>().notNull().default([]),
  minValueCents: integer("min_value_cents").notNull().default(0),
  canNegotiate: boolean("can_negotiate").notNull().default(false),
  approveLimitCents: integer("approve_limit_cents").notNull().default(0),
  status: text("status").$type<"invited" | "active" | "revoked">().notNull().default("invited"),
  tokenHash: text("token_hash"),
  createdAt: created(),
});

// ---------- money ----------

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull(),
  dealId: uuid("deal_id"),
  kind: text("kind").$type<"deal" | "fee">().notNull(),
  sellerName: text("seller_name").notNull(),
  buyerName: text("buyer_name").notNull(),
  buyerCountry: text("buyer_country"),
  amountCents: integer("amount_cents").notNull(),
  taxLabel: text("tax_label").$type<"VAT" | "GST" | "none">().notNull().default("none"),
  taxBps: integer("tax_bps").notNull().default(0),
  lines: jsonb("lines").$type<{ label: string; amountCents: number }[]>().notNull(),
  issuedAt: created(),
});

// ---------- opportunities, requests, deals ----------

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").notNull(),
  createdBy: uuid("created_by").notNull(),
  title: text("title").notNull(),
  brief: text("brief").notNull(),
  niches: jsonb("niches").$type<string[]>().notNull().default([]),
  platforms: jsonb("platforms").$type<Platform[]>().notNull().default([]),
  deliverables: jsonb("deliverables").$type<{ type: Deliverable; count: number }[]>().notNull().default([]),
  budgetCents: integer("budget_cents").notNull(),
  slots: integer("slots").notNull().default(1),
  country: text("country"),
  audience: text("audience").$type<"public" | "invite" | "collective" | "founding">().notNull().default("public"),
  collectiveId: uuid("collective_id"),
  foundingUntil: ts("founding_until"),
  publicTeaser: boolean("public_teaser").notNull().default(true),
  status: text("status").$type<"open" | "closed">().notNull().default("open"),
  createdAt: created(),
});

export const opportunityInvites = pgTable(
  "opportunity_invites",
  { opportunityId: uuid("opportunity_id").notNull(), creatorId: uuid("creator_id").notNull() },
  (t) => [primaryKey({ columns: [t.opportunityId, t.creatorId] })],
);

export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").$type<RequestType>().notNull(),
    fromUserId: uuid("from_user_id").notNull(),
    fromBrandId: uuid("from_brand_id"),
    toCreatorId: uuid("to_creator_id").notNull(),
    opportunityId: uuid("opportunity_id"),
    message: text("message").notNull(),
    amountCents: integer("amount_cents"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").$type<"open" | "accepted" | "declined" | "closed_no_response" | "converted">().notNull().default("open"),
    declineReason: text("decline_reason").$type<"rate" | "timing" | "category" | "rights" | "budget" | "fit">(),
    funded: boolean("funded").notNull().default(false),
    creditsSpent: integer("credits_spent").notNull().default(0),
    dealId: uuid("deal_id"),
    remindedAt: ts("reminded_at"),
    respondedAt: ts("responded_at"),
    createdAt: created(),
  },
  (t) => [index("requests_to_idx").on(t.toCreatorId), index("requests_from_brand_idx").on(t.fromBrandId)],
);

export const replyLinks = pgTable("reply_links", {
  tokenHash: text("token_hash").primaryKey(),
  requestId: uuid("request_id").notNull(),
  userId: uuid("user_id").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
});

export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").notNull(),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  requestId: uuid("request_id"),
  createdAt: created(),
});

export type UsageRight = {
  kind: "organic_repost" | "paid_brand_handle" | "paid_creator_handle" | "dark_post" | "boosted_post" | "likeness";
  platforms: Platform[];
  territory: "worldwide" | "region" | "country";
  months: number;
  spendCapCents?: number;
  exclusions?: string[];
  priceCents: number;
};

export type Terms = {
  deliverables: { type: Deliverable; count: number; platform: Platform; notes?: string }[];
  postingWindow: { start: string; end: string };
  usageRights: UsageRight[];
  exclusivityDays: number;
  exclusivityCategory?: string;
  revisions: number;
  killFeeBps: number;
  milestones: { title: string; amountCents: number }[];
  disclosure: string;
  reviewDays: number;
  notes?: string;
};

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id").notNull(),
    creatorId: uuid("creator_id").notNull(),
    opportunityId: uuid("opportunity_id"),
    requestId: uuid("request_id"),
    title: text("title").notNull(),
    status: text("status").$type<"negotiating" | "agreed" | "active" | "completed" | "cancelled" | "disputed">().notNull().default("negotiating"),
    feeBps: integer("fee_bps").notNull().default(500),
    currentTermsId: uuid("current_terms_id"),
    agreedHash: text("agreed_hash"),
    fundedAt: ts("funded_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("deals_brand_idx").on(t.brandId), index("deals_creator_idx").on(t.creatorId)],
);

export const dealTerms = pgTable("deal_terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull(),
  version: integer("version").notNull(),
  proposedBy: uuid("proposed_by"),
  proposedBySide: text("proposed_by_side").$type<"brand" | "creator" | "agent">().notNull(),
  terms: jsonb("terms").$type<Terms>().notNull(),
  summary: text("summary"),
  createdAt: created(),
});

export const dealApprovals = pgTable(
  "deal_approvals",
  {
    termsId: uuid("terms_id").notNull(),
    side: text("side").$type<"brand" | "creator">().notNull(),
    userId: uuid("user_id").notNull(),
    hash: text("hash").notNull(),
    approvedAt: created(),
  },
  (t) => [primaryKey({ columns: [t.termsId, t.side] })],
);

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id").notNull(),
    idx: integer("idx").notNull(),
    title: text("title").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").$type<"pending" | "submitted" | "released" | "disputed" | "resolved" | "refunded">().notNull().default("pending"),
    revisionsUsed: integer("revisions_used").notNull().default(0),
    submittedAt: ts("submitted_at"),
    reviewDueAt: ts("review_due_at"),
    releasedAt: ts("released_at"),
    liveUrl: text("live_url"),
    liveCheckedAt: ts("live_checked_at"),
  },
  (t) => [uniqueIndex("milestones_deal_idx_uq").on(t.dealId, t.idx)],
);

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull(),
  milestoneIdx: integer("milestone_idx").notNull(),
  kind: text("kind").$type<"draft" | "live">().notNull(),
  url: text("url").notNull(),
  note: text("note"),
  createdBy: uuid("created_by").notNull(),
  createdAt: created(),
});

export const dealComments = pgTable("deal_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull(),
  submissionId: uuid("submission_id"),
  userId: uuid("user_id").notNull(),
  body: text("body").notNull(),
  atSecond: integer("at_second"),
  createdAt: created(),
});

export const dealEvents = pgTable(
  "deal_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id").notNull(),
    actorId: uuid("actor_id"),
    actorKind: text("actor_kind").$type<"brand" | "creator" | "agent" | "system" | "staff">().notNull(),
    kind: text("kind").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
  },
  (t) => [index("deal_events_deal_idx").on(t.dealId)],
);

export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull(),
  milestoneIdx: integer("milestone_idx").notNull(),
  openedBy: uuid("opened_by").notNull(),
  reason: text("reason").notNull(),
  status: text("status").$type<"open" | "resolved">().notNull().default("open"),
  creatorBps: integer("creator_bps"),
  resolvedBy: uuid("resolved_by"),
  createdAt: created(),
  resolvedAt: ts("resolved_at"),
});

export const ratings = pgTable("ratings", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull(),
  fromUserId: uuid("from_user_id").notNull(),
  toUserId: uuid("to_user_id").notNull(),
  score: integer("score").notNull(),
  onTime: boolean("on_time").notNull(),
  comment: text("comment"),
  createdAt: created(),
});

// ---------- agents ----------

export const agentActions = pgTable(
  "agent_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agent: text("agent").$type<"creator" | "brand" | "onboarding" | "triage" | "summary" | "checker" | "kit_draft" | "brand_profile" | "ownership">().notNull(),
    userId: uuid("user_id"),
    dealId: uuid("deal_id"),
    requestId: uuid("request_id"),
    level: text("level").$type<AgentLevel>().notNull(),
    action: text("action").notNull(),
    status: text("status").$type<"proposed" | "approved" | "rejected" | "executed" | "blocked">().notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
    model: text("model"),
    decidedBy: uuid("decided_by"),
    createdAt: created(),
    decidedAt: ts("decided_at"),
  },
  (t) => [index("agent_actions_user_idx").on(t.userId), index("agent_actions_deal_idx").on(t.dealId)],
);

// ---------- network ----------

export const collectives = pgTable(
  "collectives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: text("kind").$type<"city" | "niche" | "roster" | "ugc" | "founding">().notNull(),
    description: text("description").notNull().default(""),
    rules: text("rules").notNull().default(""),
    ownerId: uuid("owner_id").notNull(),
    membersVisible: boolean("members_visible").notNull().default(false),
    createdAt: created(),
  },
  (t) => [uniqueIndex("collectives_slug_uq").on(t.slug)],
);

export const collectiveMembers = pgTable(
  "collective_members",
  {
    collectiveId: uuid("collective_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").$type<"owner" | "moderator" | "member">().notNull().default("member"),
    status: text("status").$type<"requested" | "active">().notNull().default("requested"),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.collectiveId, t.userId] })],
);

export const collectivePosts = pgTable("collective_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  collectiveId: uuid("collective_id").notNull(),
  userId: uuid("user_id").notNull(),
  kind: text("kind").$type<"post" | "ask">().notNull().default("post"),
  body: text("body").notNull(),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: created(),
});

export const viewEvents = pgTable(
  "view_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectKind: text("subject_kind").$type<"kit" | "brief" | "offer">().notNull(),
    subjectId: text("subject_id").notNull(),
    viewerUserId: uuid("viewer_user_id"),
    viewerBrandId: uuid("viewer_brand_id"),
    section: text("section"),
    seconds: integer("seconds").notNull().default(0),
    createdAt: created(),
  },
  (t) => [index("view_events_subject_idx").on(t.subjectKind, t.subjectId)],
);

// First-party product analytics: no third-party trackers inside the signed-in app.
export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  userId: uuid("user_id"),
  anonId: text("anon_id"),
  props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
});

// ---------- ops ----------

export const kitDrafts = pgTable("kit_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  handle: text("handle").notNull(),
  platform: text("platform").$type<Platform>().notNull(),
  displayName: text("display_name"),
  email: text("email"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  headline: text("headline"),
  synopsis: text("synopsis"),
  source: text("source").$type<"public" | "csv" | "manual">().notNull(),
  status: text("status").$type<"draft" | "approved" | "invited" | "claimed" | "deleted">().notNull().default("draft"),
  claimTokenHash: text("claim_token_hash"),
  createdBy: uuid("created_by").notNull(),
  claimedBy: uuid("claimed_by"),
  createdAt: created(),
  invitedAt: ts("invited_at"),
  deleteAfter: ts("delete_after").notNull(),
});

export const flags = pgTable("flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  brandId: uuid("brand_id"),
  reason: text("reason").notNull(),
  source: text("source").$type<"auto" | "report" | "founding_application">().notNull(),
  status: text("status").$type<"open" | "approved" | "declined">().notNull().default("open"),
  decisionReason: text("decision_reason"),
  toldAt: ts("told_at"),
  decidedBy: uuid("decided_by"),
  createdAt: created(),
  decidedAt: ts("decided_at"),
});

export const staffActions = pgTable("staff_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull(),
  action: text("action").notNull(),
  targetUserId: uuid("target_user_id"),
  reason: text("reason"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
});

export const supportViews = pgTable("support_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull(),
  memberId: uuid("member_id").notNull(),
  reason: text("reason").notNull(),
  startedAt: created(),
  endsAt: ts("ends_at").notNull(),
});

export const homeSlots = pgTable("home_slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  segment: text("segment").$type<"creator" | "brand" | "all">().notNull(),
  locale: text("locale").$type<Locale | "all">().notNull().default("all"),
  kind: text("kind").$type<"announcement" | "opportunity" | "tip">().notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  href: text("href"),
  startsAt: created(),
  endsAt: ts("ends_at"),
  createdBy: uuid("created_by").notNull(),
});

// ---------- P2/P3 ----------

export const challenges = pgTable("challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").notNull(),
  title: text("title").notNull(),
  brief: text("brief").notNull(),
  pricePerEntryCents: integer("price_per_entry_cents").notNull(),
  slots: integer("slots").notNull(),
  perCreatorCap: integer("per_creator_cap").notNull().default(1),
  status: text("status").$type<"open" | "closed">().notNull().default("open"),
  createdAt: created(),
});

export const challengeEntries = pgTable("challenge_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  challengeId: uuid("challenge_id").notNull(),
  creatorId: uuid("creator_id").notNull(),
  url: text("url").notNull(),
  status: text("status").$type<"submitted" | "approved" | "rejected" | "paid">().notNull().default("submitted"),
  dealId: uuid("deal_id"),
  createdAt: created(),
});

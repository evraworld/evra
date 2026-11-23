CREATE TABLE "agent_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent" text NOT NULL,
	"user_id" uuid,
	"deal_id" uuid,
	"request_id" uuid,
	"level" text NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"user_id" uuid,
	"anon_id" text,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_members" (
	"brand_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	CONSTRAINT "brand_members_brand_id_user_id_pk" PRIMARY KEY("brand_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"domain" text,
	"domain_verified" boolean DEFAULT false NOT NULL,
	"category" text,
	"country" text,
	"description" text,
	"plan" text DEFAULT 'pay_per_deal' NOT NULL,
	"kyb_status" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"deal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"title" text NOT NULL,
	"brief" text NOT NULL,
	"price_per_entry_cents" integer NOT NULL,
	"slots" integer NOT NULL,
	"per_creator_cap" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collective_members" (
	"collective_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collective_members_collective_id_user_id_pk" PRIMARY KEY("collective_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "collective_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collective_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'post' NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"rules" text DEFAULT '' NOT NULL,
	"owner_id" uuid NOT NULL,
	"members_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"headline" text,
	"bio" text,
	"avatar_url" text,
	"niches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_to" jsonb DEFAULT '["paid_collab","seeding"]'::jsonb NOT NULL,
	"how_i_help" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_rate_cents" integer DEFAULT 0 NOT NULL,
	"blocked_brands" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_monthly_deals" integer DEFAULT 8 NOT NULL,
	"agent_level" text DEFAULT 'copilot' NOT NULL,
	"counter_range_pct" integer DEFAULT 15 NOT NULL,
	"kit_public" boolean DEFAULT true NOT NULL,
	"hidden_stats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_approvals" (
	"terms_id" uuid NOT NULL,
	"side" text NOT NULL,
	"user_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_approvals_terms_id_side_pk" PRIMARY KEY("terms_id","side")
);
--> statement-breakpoint
CREATE TABLE "deal_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"submission_id" uuid,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"at_second" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_kind" text NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"proposed_by" uuid,
	"proposed_by_side" text NOT NULL,
	"terms" jsonb NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"request_id" uuid,
	"title" text NOT NULL,
	"status" text DEFAULT 'negotiating' NOT NULL,
	"fee_bps" integer DEFAULT 500 NOT NULL,
	"current_terms_id" uuid,
	"agreed_hash" text,
	"funded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"milestone_idx" integer NOT NULL,
	"opened_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"creator_bps" integer,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"brand_id" uuid,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decision_reason" text,
	"told_at" timestamp with time zone,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "home_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment" text NOT NULL,
	"locale" text DEFAULT 'all' NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"deal_id" uuid,
	"kind" text NOT NULL,
	"seller_name" text NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_country" text,
	"amount_cents" integer NOT NULL,
	"tax_label" text DEFAULT 'none' NOT NULL,
	"tax_bps" integer DEFAULT 0 NOT NULL,
	"lines" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kit_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"platform" text NOT NULL,
	"display_name" text,
	"email" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"headline" text,
	"synopsis" text,
	"source" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"claim_token_hash" text,
	"created_by" uuid NOT NULL,
	"claimed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_at" timestamp with time zone,
	"delete_after" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manager_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"manager_email" text NOT NULL,
	"manager_user_id" uuid,
	"copy_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_value_cents" integer DEFAULT 0 NOT NULL,
	"can_negotiate" boolean DEFAULT false NOT NULL,
	"approve_limit_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"title" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"revisions_used" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"review_due_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"live_url" text,
	"live_checked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"title" text NOT NULL,
	"brief" text NOT NULL,
	"niches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deliverables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"budget_cents" integer NOT NULL,
	"slots" integer DEFAULT 1 NOT NULL,
	"country" text,
	"audience" text DEFAULT 'public' NOT NULL,
	"collective_id" uuid,
	"founding_until" timestamp with time zone,
	"public_teaser" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_invites" (
	"opportunity_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	CONSTRAINT "opportunity_invites_opportunity_id_creator_id_pk" PRIMARY KEY("opportunity_id","creator_id")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"purpose" text DEFAULT 'signin' NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"to" text NOT NULL,
	"template" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb,
	"test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" jsonb,
	"device_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_card_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"deliverable" text NOT NULL,
	"label" text NOT NULL,
	"price_cents" integer NOT NULL,
	"is_package" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche" text NOT NULL,
	"country" text NOT NULL,
	"platform" text NOT NULL,
	"deliverable" text NOT NULL,
	"followers" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"on_time" boolean NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reply_links" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"from_user_id" uuid NOT NULL,
	"from_brand_id" uuid,
	"to_creator_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"message" text NOT NULL,
	"amount_cents" integer,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decline_reason" text,
	"funded" boolean DEFAULT false NOT NULL,
	"credits_spent" integer DEFAULT 0 NOT NULL,
	"deal_id" uuid,
	"reminded_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "showcase_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"brand_name" text,
	"metric" text,
	"verification" text DEFAULT 'self_reported' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"avg_views" integer DEFAULT 0 NOT NULL,
	"engagement_bps" integer DEFAULT 0 NOT NULL,
	"audience" jsonb,
	"reach_90d" jsonb,
	"top_posts" jsonb,
	"source" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_user_id" uuid,
	"reason" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"milestone_idx" integer NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"handle" text,
	"staff" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"country" text,
	"city" text,
	"adult" boolean DEFAULT false NOT NULL,
	"referral_code" text,
	"referred_by" uuid,
	"founding_number" integer,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "view_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"viewer_user_id" uuid,
	"viewer_brand_id" uuid,
	"section" text,
	"seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_actions_user_idx" ON "agent_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_actions_deal_idx" ON "agent_actions" USING btree ("deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collectives_slug_uq" ON "collectives" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "deal_events_deal_idx" ON "deal_events" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "deals_brand_idx" ON "deals" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "deals_creator_idx" ON "deals" USING btree ("creator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "milestones_deal_idx_uq" ON "milestones" USING btree ("deal_id","idx");--> statement-breakpoint
CREATE INDEX "otp_email_idx" ON "otp_codes" USING btree ("email");--> statement-breakpoint
CREATE INDEX "outbox_to_idx" ON "outbox" USING btree ("to");--> statement-breakpoint
CREATE INDEX "rate_samples_lookup_idx" ON "rate_samples" USING btree ("niche","country","deliverable");--> statement-breakpoint
CREATE INDEX "requests_to_idx" ON "requests" USING btree ("to_creator_id");--> statement-breakpoint
CREATE INDEX "requests_from_brand_idx" ON "requests" USING btree ("from_brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_user_platform_uq" ON "social_accounts" USING btree ("user_id","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_uq" ON "users" USING btree ("handle");--> statement-breakpoint
CREATE UNIQUE INDEX "users_ref_uq" ON "users" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "view_events_subject_idx" ON "view_events" USING btree ("subject_kind","subject_id");
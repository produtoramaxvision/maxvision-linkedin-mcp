CREATE TABLE IF NOT EXISTS "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"cookie_encrypted" "bytea" NOT NULL,
	"cookie_expires_at" timestamp with time zone NOT NULL,
	"rate_limit_bucket" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text,
	"job_url" text NOT NULL,
	"job_title" text,
	"company" text,
	"status" text NOT NULL,
	"resume_used" text,
	"cover_letter" text,
	"answers" jsonb,
	"screenshot_path" text,
	"submitted_at" timestamp with time zone DEFAULT now(),
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tool" text NOT NULL,
	"account_id" text,
	"input_hash" text,
	"output_hash" text,
	"success" boolean NOT NULL,
	"latency_ms" integer,
	"error_msg" text,
	"ts" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "captcha_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" text,
	"context" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"payload" jsonb NOT NULL,
	"match_score" real,
	"fetched_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone,
	CONSTRAINT "jobs_cache_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "license_cache" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"tier" text NOT NULL,
	"features" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text,
	"recipient_url" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles_cache" (
	"public_id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone,
	CONSTRAINT "profiles_cache_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" text,
	"action" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "applications" ADD CONSTRAINT "applications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "captcha_events" ADD CONSTRAINT "captcha_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages_drafts" ADD CONSTRAINT "messages_drafts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rate_limit_events" ADD CONSTRAINT "rate_limit_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_accounts_status" ON "accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_applications_account" ON "applications" USING btree ("account_id","submitted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_applications_status" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_account" ON "audit_log" USING btree ("account_id","ts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_tool" ON "audit_log" USING btree ("tool","ts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_captcha_account" ON "captcha_events" USING btree ("account_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jobs_fetched" ON "jobs_cache" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jobs_source" ON "jobs_cache" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jobs_expires" ON "jobs_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drafts_account" ON "messages_drafts" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profiles_expires" ON "profiles_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rate_limit_account_time" ON "rate_limit_events" USING btree ("account_id","occurred_at");
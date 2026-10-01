CREATE TABLE "llm_switches" (
	"feature" "llm_feature" PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_switches" ENABLE ROW LEVEL SECURITY;
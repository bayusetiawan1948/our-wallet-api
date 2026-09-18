ALTER TYPE "debt_status" ADD VALUE 'partial' BEFORE 'paid';--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "note" text;
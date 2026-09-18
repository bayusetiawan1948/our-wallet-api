CREATE TYPE "category_type" AS ENUM('income', 'expense', 'both');--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "type" "category_type" DEFAULT 'both'::"category_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "icon" varchar(100);
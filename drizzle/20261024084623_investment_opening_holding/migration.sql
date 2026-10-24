ALTER TYPE "investment_transaction_type" ADD VALUE 'opening';--> statement-breakpoint
ALTER TABLE "investment_transactions" ALTER COLUMN "wallet_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_wallet_check" CHECK (("type"::text = 'opening') = ("wallet_id" IS NULL));
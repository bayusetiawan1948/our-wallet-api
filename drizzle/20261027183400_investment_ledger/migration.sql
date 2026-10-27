ALTER TYPE "transaction_source" ADD VALUE 'investment_buy';--> statement-breakpoint
ALTER TYPE "transaction_source" ADD VALUE 'investment_sell';--> statement-breakpoint
ALTER TYPE "transaction_source" ADD VALUE 'investment_void';--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "investment_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_eAmwsVgniH1e_fkey" FOREIGN KEY ("investment_transaction_id") REFERENCES "investment_transactions"("id") ON DELETE SET NULL;
CREATE TYPE "transaction_source" AS ENUM('debt_create', 'debt_revision', 'debt_cancel', 'debt_payment', 'debt_payment_void');--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "source" "transaction_source";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "debt_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "debt_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "wallet_id" uuid;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "opening_paid" numeric(15,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debt_id_debts_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debt_payment_id_debt_payments_id_fkey" FOREIGN KEY ("debt_payment_id") REFERENCES "debt_payments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_wallet_id_wallets_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_opening_paid_check" CHECK ("opening_paid" >= 0 AND "opening_paid" <= "principal" AND ("wallet_id" IS NULL OR "opening_paid" = 0));
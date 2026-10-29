ALTER TABLE "transactions" ADD COLUMN "import_hash" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transactions_wallet_import_hash" ON "transactions" ("wallet_id","import_hash");
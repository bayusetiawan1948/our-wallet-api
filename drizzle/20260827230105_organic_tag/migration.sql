CREATE TYPE "allocation_method" AS ENUM('manual', 'percentage', 'formula');--> statement-breakpoint
CREATE TYPE "budget_period" AS ENUM('weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "budget_period_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "debt_status" AS ENUM('active', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "debt_type" AS ENUM('utang', 'piutang');--> statement-breakpoint
CREATE TYPE "goal_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "household_member_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "investment_asset_type" AS ENUM('emas', 'perak', 'crypto', 'saham');--> statement-breakpoint
CREATE TYPE "investment_transaction_status" AS ENUM('active', 'void');--> statement-breakpoint
CREATE TYPE "investment_transaction_type" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "investment_valuation_source" AS ENUM('manual', 'scrape', 'api');--> statement-breakpoint
CREATE TYPE "transaction_status" AS ENUM('active', 'void');--> statement-breakpoint
CREATE TYPE "transaction_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "wallet_type" AS ENUM('bank', 'ewallet', 'cash');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL UNIQUE,
	"base_currency" varchar(10) DEFAULT 'IDR' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"household_id" uuid,
	"user_id" uuid,
	"role" "household_member_role" DEFAULT 'member'::"household_member_role" NOT NULL,
	"can_edit_others_transactions" boolean DEFAULT false NOT NULL,
	CONSTRAINT "household_members_pkey" PRIMARY KEY("household_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "household_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"household_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"code" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_user_id" uuid,
	"owner_household_id" uuid,
	"name" varchar(255) NOT NULL,
	"type" "wallet_type" NOT NULL,
	"currency" varchar(10) DEFAULT 'IDR' NOT NULL,
	CONSTRAINT "wallets_owner_check" CHECK (("owner_user_id" IS NOT NULL AND "owner_household_id" IS NULL) OR ("owner_user_id" IS NULL AND "owner_household_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "wallet_access" (
	"wallet_id" uuid,
	"user_id" uuid,
	"assigned_by" uuid NOT NULL,
	CONSTRAINT "wallet_access_pkey" PRIMARY KEY("wallet_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "wallet_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"wallet_id" uuid NOT NULL,
	"recorded_balance" numeric(15,2) NOT NULL,
	"actual_balance" numeric(15,2) NOT NULL,
	"date" date NOT NULL,
	"adjustment_transaction_id" uuid
);
--> statement-breakpoint
CREATE TABLE "wallet_balance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"wallet_id" uuid NOT NULL,
	"balance" numeric(15,2) NOT NULL,
	"snapshot_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"household_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" varchar(255) NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"wallet_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"recorded_by" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" numeric(15,2) NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"attachment_url" varchar(500),
	"status" "transaction_status" DEFAULT 'active'::"transaction_status" NOT NULL,
	"correction_of_id" uuid
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"from_wallet_id" uuid NOT NULL,
	"to_wallet_id" uuid NOT NULL,
	"amount" numeric(15,2) NOT NULL,
	"fee" numeric(15,2) DEFAULT '0' NOT NULL,
	"date" date NOT NULL,
	"status" "transaction_status" DEFAULT 'active'::"transaction_status" NOT NULL,
	"correction_of_id" uuid
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_user_id" uuid,
	"owner_household_id" uuid,
	"type" "debt_type" NOT NULL,
	"counterparty" varchar(255) NOT NULL,
	"principal" numeric(15,2) NOT NULL,
	"portion_admin" numeric(15,2) DEFAULT '0' NOT NULL,
	"portion_member" numeric(15,2) DEFAULT '0' NOT NULL,
	"due_date" date,
	"status" "debt_status" DEFAULT 'active'::"debt_status" NOT NULL,
	CONSTRAINT "debts_owner_check" CHECK (("owner_user_id" IS NOT NULL AND "owner_household_id" IS NULL) OR ("owner_user_id" IS NULL AND "owner_household_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "debt_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"debt_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"amount" numeric(15,2) NOT NULL,
	"date" date NOT NULL,
	"status" "transaction_status" DEFAULT 'active'::"transaction_status" NOT NULL,
	"correction_of_id" uuid
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_user_id" uuid,
	"owner_household_id" uuid,
	"asset_type" "investment_asset_type" NOT NULL,
	"asset_name" varchar(255) NOT NULL,
	"unit" varchar(50) NOT NULL,
	CONSTRAINT "investments_owner_check" CHECK (("owner_user_id" IS NOT NULL AND "owner_household_id" IS NULL) OR ("owner_user_id" IS NULL AND "owner_household_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "investment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"investment_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"type" "investment_transaction_type" NOT NULL,
	"quantity" numeric(18,8) NOT NULL,
	"price" numeric(15,2) NOT NULL,
	"date" date NOT NULL,
	"status" "investment_transaction_status" DEFAULT 'active'::"investment_transaction_status" NOT NULL,
	"correction_of_id" uuid
);
--> statement-breakpoint
CREATE TABLE "investment_valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"investment_id" uuid NOT NULL,
	"price_per_unit" numeric(15,2) NOT NULL,
	"date" date NOT NULL,
	"source" "investment_valuation_source" DEFAULT 'manual'::"investment_valuation_source" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"category_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"owner_household_id" uuid,
	"name" varchar(255) NOT NULL,
	"target_amount" numeric(15,2) NOT NULL,
	"period" "budget_period" NOT NULL,
	"start_date" date NOT NULL,
	CONSTRAINT "budgets_owner_check" CHECK (("owner_user_id" IS NOT NULL AND "owner_household_id" IS NULL) OR ("owner_user_id" IS NULL AND "owner_household_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "budget_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"budget_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"target_amount" numeric(15,2) NOT NULL,
	"carried_deficit" numeric(15,2) DEFAULT '0' NOT NULL,
	"status" "budget_period_status" DEFAULT 'active'::"budget_period_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_user_id" uuid,
	"owner_household_id" uuid,
	"name" varchar(255) NOT NULL,
	"target_amount" numeric(15,2) NOT NULL,
	"target_date" date,
	"status" "goal_status" DEFAULT 'active'::"goal_status" NOT NULL,
	CONSTRAINT "goals_owner_check" CHECK (("owner_user_id" IS NOT NULL AND "owner_household_id" IS NULL) OR ("owner_user_id" IS NULL AND "owner_household_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"wallet_id" uuid NOT NULL,
	"budget_id" uuid,
	"goal_id" uuid,
	"reserved_amount" numeric(15,2) DEFAULT '0' NOT NULL,
	"allocation_method" "allocation_method" DEFAULT 'manual'::"allocation_method" NOT NULL,
	"allocation_config" jsonb,
	CONSTRAINT "reservations_target_check" CHECK (("budget_id" IS NOT NULL AND "goal_id" IS NULL) OR ("budget_id" IS NULL AND "goal_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "budget_encroachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"transaction_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"budget_id" uuid,
	"goal_id" uuid,
	"amount" numeric(15,2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_encroachments_target_check" CHECK (("budget_id" IS NOT NULL AND "goal_id" IS NULL) OR ("budget_id" IS NULL AND "goal_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"actor_id" uuid NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid,
	"action" varchar(50) NOT NULL,
	"before_data" jsonb,
	"after_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_household_id_households_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_invited_by_users_id_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_household_id_households_id_fkey" FOREIGN KEY ("owner_household_id") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wallet_access" ADD CONSTRAINT "wallet_access_wallet_id_wallets_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wallet_access" ADD CONSTRAINT "wallet_access_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wallet_access" ADD CONSTRAINT "wallet_access_assigned_by_users_id_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wallet_reconciliations" ADD CONSTRAINT "wallet_reconciliations_wallet_id_wallets_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wallet_reconciliations" ADD CONSTRAINT "wallet_reconciliations_Z7oPsWvk00j1_fkey" FOREIGN KEY ("adjustment_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "wallet_balance_snapshots" ADD CONSTRAINT "wallet_balance_snapshots_wallet_id_wallets_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_households_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_wallets_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recorded_by_users_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_correction_of_id_transactions_id_fkey" FOREIGN KEY ("correction_of_id") REFERENCES "transactions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_wallet_id_wallets_id_fkey" FOREIGN KEY ("from_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_wallet_id_wallets_id_fkey" FOREIGN KEY ("to_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_correction_of_id_transfers_id_fkey" FOREIGN KEY ("correction_of_id") REFERENCES "transfers"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_owner_household_id_households_id_fkey" FOREIGN KEY ("owner_household_id") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_id_debts_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_wallet_id_wallets_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_correction_of_id_debt_payments_id_fkey" FOREIGN KEY ("correction_of_id") REFERENCES "debt_payments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_owner_household_id_households_id_fkey" FOREIGN KEY ("owner_household_id") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_investment_id_investments_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "investments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_wallet_id_wallets_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_lWpuFldWmpUG_fkey" FOREIGN KEY ("correction_of_id") REFERENCES "investment_transactions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "investment_valuations" ADD CONSTRAINT "investment_valuations_investment_id_investments_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "investments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_owner_household_id_households_id_fkey" FOREIGN KEY ("owner_household_id") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budget_periods" ADD CONSTRAINT "budget_periods_budget_id_budgets_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_owner_household_id_households_id_fkey" FOREIGN KEY ("owner_household_id") REFERENCES "households"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_wallet_id_wallets_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_budget_id_budgets_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_goal_id_goals_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budget_encroachments" ADD CONSTRAINT "budget_encroachments_transaction_id_transactions_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budget_encroachments" ADD CONSTRAINT "budget_encroachments_wallet_id_wallets_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budget_encroachments" ADD CONSTRAINT "budget_encroachments_budget_id_budgets_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budget_encroachments" ADD CONSTRAINT "budget_encroachments_goal_id_goals_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE;
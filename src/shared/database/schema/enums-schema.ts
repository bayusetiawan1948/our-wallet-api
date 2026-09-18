import { pgEnum } from 'drizzle-orm/pg-core';

export const householdMemberRoleEnum = pgEnum('household_member_role', [
  'admin',
  'member',
]);

export const walletTypeEnum = pgEnum('wallet_type', [
  'bank',
  'ewallet',
  'cash',
]);

export const transactionTypeEnum = pgEnum('transaction_type', [
  'income',
  'expense',
]);

export const transactionStatusEnum = pgEnum('transaction_status', [
  'active',
  'void',
]);

export const debtTypeEnum = pgEnum('debt_type', ['utang', 'piutang']);

export const debtStatusEnum = pgEnum('debt_status', [
  'active',
  'partial',
  'paid',
  'overdue',
  'cancelled',
]);

export const investmentAssetTypeEnum = pgEnum('investment_asset_type', [
  'emas',
  'perak',
  'crypto',
  'saham',
  'reksadana',
  'obligasi',
  'lainnya',
]);

export const investmentTransactionTypeEnum = pgEnum(
  'investment_transaction_type',
  ['buy', 'sell'],
);

export const investmentTransactionStatusEnum = pgEnum(
  'investment_transaction_status',
  ['active', 'void'],
);

export const investmentValuationSourceEnum = pgEnum(
  'investment_valuation_source',
  ['manual', 'scrape', 'api'],
);

export const budgetPeriodEnum = pgEnum('budget_period', [
  'weekly',
  'monthly',
  'yearly',
]);

export const budgetPeriodStatusEnum = pgEnum('budget_period_status', [
  'active',
  'closed',
]);

export const allocationMethodEnum = pgEnum('allocation_method', [
  'manual',
  'percentage',
  'formula',
]);

export const goalStatusEnum = pgEnum('goal_status', [
  'active',
  'completed',
  'cancelled',
]);

export const categoryTypeEnum = pgEnum('category_type', [
  'income',
  'expense',
  'both',
]);

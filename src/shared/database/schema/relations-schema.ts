import { defineRelations } from 'drizzle-orm';
import { users } from './users-schema';
import { households } from './households-schema';
import { householdMembers } from './household_members-schema';
import { householdInvites } from './household_invites-schema';
import { wallets } from './wallets-schema';
import { walletAccess } from './wallet_access-schema';
import { walletReconciliations } from './wallet_reconciliations-schema';
import { walletBalanceSnapshots } from './wallet_balance_snapshots-schema';
import { categories } from './categories-schema';
import { transactions } from './transactions-schema';
import { transfers } from './transfers-schema';
import { debts } from './debts-schema';
import { debtPayments } from './debt_payments-schema';
import { investments } from './investments-schema';
import { investmentTransactions } from './investment_transactions-schema';
import { investmentValuations } from './investment_valuations-schema';
import { budgets } from './budgets-schema';
import { budgetPeriods } from './budget_periods-schema';
import { goals } from './goals-schema';
import { reservations } from './reservations-schema';
import { budgetEncroachments } from './budget_encroachments-schema';
import { auditLogs } from './audit_logs-schema';
import { sessions } from './sessions-schema';

export const relations = defineRelations(
  {
    users,
    households,
    householdMembers,
    householdInvites,
    wallets,
    walletAccess,
    walletReconciliations,
    walletBalanceSnapshots,
    categories,
    transactions,
    transfers,
    debts,
    debtPayments,
    investments,
    investmentTransactions,
    investmentValuations,
    budgets,
    budgetPeriods,
    goals,
    reservations,
    budgetEncroachments,
    auditLogs,
    sessions,
  },
  (r) => ({
    users: {
      householdMembers: r.many.householdMembers(),
      householdInvitesSent: r.many.householdInvites(),
      wallets: r.many.wallets(),
      walletAccessReceived: r.many.walletAccess({
        alias: 'wallet_access_user',
      }),
      walletAccessAssigned: r.many.walletAccess({
        alias: 'wallet_access_assigned_by',
      }),
      transactionsOwned: r.many.transactions({
        alias: 'transaction_owner',
      }),
      transactionsRecorded: r.many.transactions({
        alias: 'transaction_recorded_by',
      }),
      debts: r.many.debts(),
      investments: r.many.investments(),
      budgets: r.many.budgets(),
      goals: r.many.goals(),
      auditLogs: r.many.auditLogs(),
      sessions: r.many.sessions(),
    },
    households: {
      members: r.many.householdMembers(),
      invites: r.many.householdInvites(),
      wallets: r.many.wallets(),
      categories: r.many.categories(),
      debts: r.many.debts(),
      investments: r.many.investments(),
      budgets: r.many.budgets(),
      goals: r.many.goals(),
    },
    householdMembers: {
      household: r.one.households({
        from: r.householdMembers.householdId,
        to: r.households.id,
      }),
      user: r.one.users({
        from: r.householdMembers.userId,
        to: r.users.id,
      }),
    },
    householdInvites: {
      household: r.one.households({
        from: r.householdInvites.householdId,
        to: r.households.id,
      }),
      inviter: r.one.users({
        from: r.householdInvites.invitedBy,
        to: r.users.id,
      }),
    },
    wallets: {
      ownerUser: r.one.users({
        from: r.wallets.ownerUserId,
        to: r.users.id,
      }),
      ownerHousehold: r.one.households({
        from: r.wallets.ownerHouseholdId,
        to: r.households.id,
      }),
      accessList: r.many.walletAccess(),
      reconciliations: r.many.walletReconciliations(),
      balanceSnapshots: r.many.walletBalanceSnapshots(),
      transactions: r.many.transactions(),
      transfersFrom: r.many.transfers({
        alias: 'transfer_from_wallet',
      }),
      transfersTo: r.many.transfers({
        alias: 'transfer_to_wallet',
      }),
      debtPayments: r.many.debtPayments(),
      investmentTransactions: r.many.investmentTransactions(),
      reservations: r.many.reservations(),
      budgetEncroachments: r.many.budgetEncroachments(),
    },
    walletAccess: {
      wallet: r.one.wallets({
        from: r.walletAccess.walletId,
        to: r.wallets.id,
      }),
      user: r.one.users({
        from: r.walletAccess.userId,
        to: r.users.id,
        alias: 'wallet_access_user',
      }),
      assigner: r.one.users({
        from: r.walletAccess.assignedBy,
        to: r.users.id,
        alias: 'wallet_access_assigned_by',
      }),
    },
    walletReconciliations: {
      wallet: r.one.wallets({
        from: r.walletReconciliations.walletId,
        to: r.wallets.id,
      }),
      adjustmentTransaction: r.one.transactions({
        from: r.walletReconciliations.adjustmentTransactionId,
        to: r.transactions.id,
      }),
    },
    walletBalanceSnapshots: {
      wallet: r.one.wallets({
        from: r.walletBalanceSnapshots.walletId,
        to: r.wallets.id,
      }),
    },
    categories: {
      household: r.one.households({
        from: r.categories.householdId,
        to: r.households.id,
      }),
      parent: r.one.categories({
        from: r.categories.parentId,
        to: r.categories.id,
        alias: 'category_children',
      }),
      children: r.many.categories({
        alias: 'category_children',
      }),
      transactions: r.many.transactions(),
      budgets: r.many.budgets(),
    },
    transactions: {
      wallet: r.one.wallets({
        from: r.transactions.walletId,
        to: r.wallets.id,
      }),
      category: r.one.categories({
        from: r.transactions.categoryId,
        to: r.categories.id,
      }),
      owner: r.one.users({
        from: r.transactions.ownerId,
        to: r.users.id,
        alias: 'transaction_owner',
      }),
      recorder: r.one.users({
        from: r.transactions.recordedBy,
        to: r.users.id,
        alias: 'transaction_recorded_by',
      }),
      correctionOf: r.one.transactions({
        from: r.transactions.correctionOfId,
        to: r.transactions.id,
        alias: 'transaction_corrections',
      }),
      corrections: r.many.transactions({
        alias: 'transaction_corrections',
      }),
      encroachments: r.many.budgetEncroachments(),
      reconciliationAdjustments: r.many.walletReconciliations(),
    },
    transfers: {
      fromWallet: r.one.wallets({
        from: r.transfers.fromWalletId,
        to: r.wallets.id,
        alias: 'transfer_from_wallet',
      }),
      toWallet: r.one.wallets({
        from: r.transfers.toWalletId,
        to: r.wallets.id,
        alias: 'transfer_to_wallet',
      }),
      correctionOf: r.one.transfers({
        from: r.transfers.correctionOfId,
        to: r.transfers.id,
        alias: 'transfer_corrections',
      }),
      corrections: r.many.transfers({
        alias: 'transfer_corrections',
      }),
    },
    debts: {
      ownerUser: r.one.users({
        from: r.debts.ownerUserId,
        to: r.users.id,
      }),
      ownerHousehold: r.one.households({
        from: r.debts.ownerHouseholdId,
        to: r.households.id,
      }),
      payments: r.many.debtPayments(),
    },
    debtPayments: {
      debt: r.one.debts({
        from: r.debtPayments.debtId,
        to: r.debts.id,
      }),
      wallet: r.one.wallets({
        from: r.debtPayments.walletId,
        to: r.wallets.id,
      }),
      correctionOf: r.one.debtPayments({
        from: r.debtPayments.correctionOfId,
        to: r.debtPayments.id,
        alias: 'debt_payment_corrections',
      }),
      corrections: r.many.debtPayments({
        alias: 'debt_payment_corrections',
      }),
    },
    investments: {
      ownerUser: r.one.users({
        from: r.investments.ownerUserId,
        to: r.users.id,
      }),
      ownerHousehold: r.one.households({
        from: r.investments.ownerHouseholdId,
        to: r.households.id,
      }),
      transactions: r.many.investmentTransactions(),
      valuations: r.many.investmentValuations(),
    },
    investmentTransactions: {
      investment: r.one.investments({
        from: r.investmentTransactions.investmentId,
        to: r.investments.id,
      }),
      wallet: r.one.wallets({
        from: r.investmentTransactions.walletId,
        to: r.wallets.id,
      }),
      correctionOf: r.one.investmentTransactions({
        from: r.investmentTransactions.correctionOfId,
        to: r.investmentTransactions.id,
        alias: 'investment_tx_corrections',
      }),
      corrections: r.many.investmentTransactions({
        alias: 'investment_tx_corrections',
      }),
    },
    investmentValuations: {
      investment: r.one.investments({
        from: r.investmentValuations.investmentId,
        to: r.investments.id,
      }),
    },
    budgets: {
      category: r.one.categories({
        from: r.budgets.categoryId,
        to: r.categories.id,
      }),
      ownerUser: r.one.users({
        from: r.budgets.ownerUserId,
        to: r.users.id,
      }),
      ownerHousehold: r.one.households({
        from: r.budgets.ownerHouseholdId,
        to: r.households.id,
      }),
      periods: r.many.budgetPeriods(),
      reservations: r.many.reservations(),
      encroachments: r.many.budgetEncroachments(),
    },
    budgetPeriods: {
      budget: r.one.budgets({
        from: r.budgetPeriods.budgetId,
        to: r.budgets.id,
      }),
    },
    goals: {
      ownerUser: r.one.users({
        from: r.goals.ownerUserId,
        to: r.users.id,
      }),
      ownerHousehold: r.one.households({
        from: r.goals.ownerHouseholdId,
        to: r.households.id,
      }),
      reservations: r.many.reservations(),
      encroachments: r.many.budgetEncroachments(),
    },
    reservations: {
      wallet: r.one.wallets({
        from: r.reservations.walletId,
        to: r.wallets.id,
      }),
      budget: r.one.budgets({
        from: r.reservations.budgetId,
        to: r.budgets.id,
      }),
      goal: r.one.goals({
        from: r.reservations.goalId,
        to: r.goals.id,
      }),
    },
    budgetEncroachments: {
      transaction: r.one.transactions({
        from: r.budgetEncroachments.transactionId,
        to: r.transactions.id,
      }),
      wallet: r.one.wallets({
        from: r.budgetEncroachments.walletId,
        to: r.wallets.id,
      }),
      budget: r.one.budgets({
        from: r.budgetEncroachments.budgetId,
        to: r.budgets.id,
      }),
      goal: r.one.goals({
        from: r.budgetEncroachments.goalId,
        to: r.goals.id,
      }),
    },
    auditLogs: {
      actor: r.one.users({
        from: r.auditLogs.actorId,
        to: r.users.id,
      }),
    },
    sessions: {
      user: r.one.users({
        from: r.sessions.userId,
        to: r.users.id,
      }),
    },
  }),
);

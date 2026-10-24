import { authed, type Actor } from './actors';
import type { TestContext } from './test-app';

export const TODAY = new Date().toISOString().split('T')[0];

export async function createWallet(
  ctx: TestContext,
  admin: Actor,
  overrides: Record<string, unknown> = {},
) {
  const res = await authed(ctx, admin)
    .post('/wallets')
    .send({
      owner_type: 'household',
      name: 'Dompet Utama',
      type: 'bank',
      initial_balance: 1_000_000,
      ...overrides,
    })
    .expect(201);

  return res.body.data as {
    id: string;
    name: string;
    balance: number;
    owner_user_id: string | null;
    owner_household_id: string | null;
  };
}

export async function createCategory(
  ctx: TestContext,
  admin: Actor,
  overrides: Record<string, unknown> = {},
) {
  const res = await authed(ctx, admin)
    .post('/categories')
    .send({ name: 'Makanan', type: 'expense', ...overrides })
    .expect(201);

  return res.body.data as { id: string; name: string; type: string };
}

export async function createTransaction(
  ctx: TestContext,
  actor: Actor,
  walletId: string,
  categoryId: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await authed(ctx, actor)
    .post('/transactions')
    .send({
      wallet_id: walletId,
      category_id: categoryId,
      type: 'expense',
      amount: 10_000,
      date: TODAY,
      ...overrides,
    })
    .expect(201);

  return res.body.data as { id: string; status: string; amount: number };
}

export async function getWalletBalance(
  ctx: TestContext,
  actor: Actor,
  walletId: string,
): Promise<number> {
  const res = await authed(ctx, actor).get(`/wallets/${walletId}`).expect(200);

  return res.body.data.balance;
}

export async function createBudget(
  ctx: TestContext,
  actor: Actor,
  categoryId: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await authed(ctx, actor)
    .post('/budgets')
    .send({
      owner_type: 'household',
      category_id: categoryId,
      name: 'Budget Makan',
      target_amount: 100_000,
      period: 'monthly',
      start_date: '2030-01-01',
      ...overrides,
    })
    .expect(201);

  return res.body.data as { id: string };
}

export async function createGoal(
  ctx: TestContext,
  actor: Actor,
  overrides: Record<string, unknown> = {},
) {
  const res = await authed(ctx, actor)
    .post('/goals')
    .send({
      owner_type: 'household',
      name: 'Liburan',
      target_amount: 100_000,
      ...overrides,
    })
    .expect(201);

  return res.body.data as { id: string };
}

export async function createReservation(
  ctx: TestContext,
  actor: Actor,
  walletId: string,
  target: { budget_id?: string; goal_id?: string },
  reservedAmount = 10_000,
) {
  const res = await authed(ctx, actor)
    .post('/reservations')
    .send({ wallet_id: walletId, reserved_amount: reservedAmount, ...target })
    .expect(201);

  return res.body.data as { id: string; reserved_amount: number };
}

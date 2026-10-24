import { Inject, Injectable } from '@nestjs/common';
import { eq, or } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import {
  budgets,
  goals,
  NewReservation,
  Reservation,
  reservations,
} from '../../shared/database/schema';

export interface ReservationTargetOwner {
  ownerUserId: string | null;
  ownerHouseholdId: string | null;
}

@Injectable()
export class ReservationsRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async Create(data: NewReservation): Promise<Reservation> {
    const [created] = await this.db
      .insert(reservations)
      .values(data)
      .returning();

    return created;
  }

  async FindBudgetOwner(
    budgetId: string,
  ): Promise<ReservationTargetOwner | undefined> {
    const [found] = await this.db
      .select({
        ownerUserId: budgets.ownerUserId,
        ownerHouseholdId: budgets.ownerHouseholdId,
      })
      .from(budgets)
      .where(eq(budgets.id, budgetId))
      .limit(1);

    return found;
  }

  async FindGoalOwner(
    goalId: string,
  ): Promise<ReservationTargetOwner | undefined> {
    const [found] = await this.db
      .select({
        ownerUserId: goals.ownerUserId,
        ownerHouseholdId: goals.ownerHouseholdId,
      })
      .from(goals)
      .where(eq(goals.id, goalId))
      .limit(1);

    return found;
  }

  async FindById(id: string): Promise<Reservation | undefined> {
    const [found] = await this.db
      .select()
      .from(reservations)
      .where(eq(reservations.id, id))
      .limit(1);

    return found;
  }

  async ListByWallet(walletId: string): Promise<Reservation[]> {
    return this.db
      .select()
      .from(reservations)
      .where(eq(reservations.walletId, walletId));
  }

  async ListByBudget(budgetId: string): Promise<Reservation[]> {
    return this.db
      .select()
      .from(reservations)
      .where(eq(reservations.budgetId, budgetId));
  }

  async ListByGoal(goalId: string): Promise<Reservation[]> {
    return this.db
      .select()
      .from(reservations)
      .where(eq(reservations.goalId, goalId));
  }

  async ListByWallets(walletIds: string[]): Promise<Reservation[]> {
    if (walletIds.length === 0) {
      return [];
    }

    const conditions = walletIds.map((id) => eq(reservations.walletId, id));

    return this.db
      .select()
      .from(reservations)
      .where(or(...conditions));
  }

  async UpdateReservedAmount(
    id: string,
    reservedAmount: number,
  ): Promise<Reservation | undefined> {
    const [updated] = await this.db
      .update(reservations)
      .set({ reservedAmount: reservedAmount.toString() })
      .where(eq(reservations.id, id))
      .returning();

    return updated;
  }

  async Delete(id: string): Promise<void> {
    await this.db.delete(reservations).where(eq(reservations.id, id));
  }
}

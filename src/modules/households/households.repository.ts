import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../shared/database/database.provider';
import {
  Household,
  HouseholdInvite,
  HouseholdMember,
  households,
  householdInvites,
  householdMembers,
  NewHousehold,
  NewHouseholdInvite,
  NewHouseholdMember,
  User,
  users,
} from '../../shared/database/schema';

export interface HouseholdMemberWithUser extends HouseholdMember {
  user: Pick<User, 'id' | 'name' | 'email' | 'baseCurrency'>;
}

@Injectable()
export class HouseholdsRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async CreateHousehold(data: NewHousehold): Promise<Household> {
    const [created] = await this.db.insert(households).values(data).returning();

    return created;
  }

  async FindHouseholdById(id: string): Promise<Household | undefined> {
    const [found] = await this.db
      .select()
      .from(households)
      .where(eq(households.id, id))
      .limit(1);

    return found;
  }

  async AddMember(data: NewHouseholdMember): Promise<HouseholdMember> {
    const [created] = await this.db
      .insert(householdMembers)
      .values(data)
      .returning();

    return created;
  }

  async FindMembershipByUserId(
    userId: string,
  ): Promise<HouseholdMember | undefined> {
    const [found] = await this.db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId))
      .limit(1);

    return found;
  }

  async FindMembersByHouseholdId(
    householdId: string,
  ): Promise<HouseholdMemberWithUser[]> {
    const rows = await this.db
      .select({
        householdId: householdMembers.householdId,
        userId: householdMembers.userId,
        role: householdMembers.role,
        canEditOthersTransactions: householdMembers.canEditOthersTransactions,
        userIdCol: users.id,
        userName: users.name,
        userEmail: users.email,
        userBaseCurrency: users.baseCurrency,
      })
      .from(householdMembers)
      .innerJoin(users, eq(users.id, householdMembers.userId))
      .where(eq(householdMembers.householdId, householdId));

    return rows.map((row) => ({
      householdId: row.householdId,
      userId: row.userId,
      role: row.role,
      canEditOthersTransactions: row.canEditOthersTransactions,
      user: {
        id: row.userIdCol,
        name: row.userName,
        email: row.userEmail,
        baseCurrency: row.userBaseCurrency,
      },
    }));
  }

  async CountAdmins(householdId: string): Promise<number> {
    const rows = await this.db
      .select({ userId: householdMembers.userId })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.role, 'admin'),
        ),
      );

    return rows.length;
  }

  async UpdateMemberPermission(
    householdId: string,
    userId: string,
    canEditOthersTransactions: boolean,
  ): Promise<void> {
    await this.db
      .update(householdMembers)
      .set({ canEditOthersTransactions })
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, userId),
        ),
      );
  }

  async RemoveMember(householdId: string, userId: string): Promise<void> {
    await this.db
      .delete(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, userId),
        ),
      );
  }

  async CreateInvite(data: NewHouseholdInvite): Promise<HouseholdInvite> {
    const [created] = await this.db
      .insert(householdInvites)
      .values(data)
      .returning();

    return created;
  }

  async FindInviteByCode(code: string): Promise<HouseholdInvite | undefined> {
    const [found] = await this.db
      .select()
      .from(householdInvites)
      .where(eq(householdInvites.code, code))
      .limit(1);

    return found;
  }

  async MarkInviteStatus(id: string, status: string): Promise<void> {
    await this.db
      .update(householdInvites)
      .set({ status })
      .where(eq(householdInvites.id, id));
  }
}

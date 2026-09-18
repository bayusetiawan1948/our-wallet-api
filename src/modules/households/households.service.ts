import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Household, HouseholdMember } from '../../shared/database/schema';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import {
  HouseholdMemberWithUser,
  HouseholdsRepository,
} from './households.repository';

const INVITE_EXPIRY_DAYS = 7;
const INVITE_STATUS_PENDING = 'pending';
const INVITE_STATUS_ACCEPTED = 'accepted';

export interface HouseholdMembershipView {
  household: Household;
  membership: HouseholdMember;
}

@Injectable()
export class HouseholdsService {
  constructor(private readonly householdsRepository: HouseholdsRepository) {}

  async FindMembershipByUserId(
    userId: string,
  ): Promise<HouseholdMember | undefined> {
    return this.householdsRepository.FindMembershipByUserId(userId);
  }

  async GetMyHousehold(userId: string): Promise<HouseholdMembershipView> {
    const membership =
      await this.householdsRepository.FindMembershipByUserId(userId);

    if (!membership) {
      throw new NotFoundException('You do not belong to a household yet');
    }

    const household = await this.householdsRepository.FindHouseholdById(
      membership.householdId,
    );

    if (!household) {
      throw new NotFoundException('Household not found');
    }

    return { household, membership };
  }

  async CreateHousehold(userId: string, name: string): Promise<Household> {
    const existingMembership =
      await this.householdsRepository.FindMembershipByUserId(userId);

    if (existingMembership) {
      throw new ConflictException(
        'User already belongs to a household. Leave the current household before creating a new one.',
      );
    }

    const household = await this.householdsRepository.CreateHousehold({
      name,
    });

    await this.householdsRepository.AddMember({
      householdId: household.id,
      userId,
      role: 'admin',
      canEditOthersTransactions: true,
    });

    return household;
  }

  async InviteMember(currentUser: AuthenticatedUser): Promise<string> {
    this.assertIsAdmin(currentUser);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const invite = await this.householdsRepository.CreateInvite({
      householdId: currentUser.householdId as string,
      invitedBy: currentUser.userId,
      code: this.generateInviteCode(),
      status: INVITE_STATUS_PENDING,
      expiresAt,
    });

    return invite.code;
  }

  async AcceptInvite(userId: string, code: string): Promise<Household> {
    const existingMembership =
      await this.householdsRepository.FindMembershipByUserId(userId);

    if (existingMembership) {
      throw new ConflictException(
        'User already belongs to a household. Leave the current household before accepting an invite.',
      );
    }

    const invite = await this.householdsRepository.FindInviteByCode(code);

    if (!invite || invite.status !== INVITE_STATUS_PENDING) {
      throw new NotFoundException('Invite code is invalid or already used');
    }

    if (invite.expiresAt.getTime() < Date.now()) {
      throw new ConflictException('Invite code has expired');
    }

    await this.householdsRepository.AddMember({
      householdId: invite.householdId,
      userId,
      role: 'member',
      canEditOthersTransactions: false,
    });

    await this.householdsRepository.MarkInviteStatus(
      invite.id,
      INVITE_STATUS_ACCEPTED,
    );

    const household = await this.householdsRepository.FindHouseholdById(
      invite.householdId,
    );

    if (!household) {
      throw new NotFoundException('Household not found');
    }

    return household;
  }

  async ListMembers(
    currentUser: AuthenticatedUser,
  ): Promise<HouseholdMemberWithUser[]> {
    this.assertHasHousehold(currentUser);

    return this.householdsRepository.FindMembersByHouseholdId(
      currentUser.householdId as string,
    );
  }

  async UpdateMemberPermission(
    currentUser: AuthenticatedUser,
    targetUserId: string,
    canEditOthersTransactions: boolean,
  ): Promise<void> {
    this.assertIsAdmin(currentUser);

    const targetMembership = await this.assertMemberOfSameHousehold(
      currentUser,
      targetUserId,
    );

    if (targetMembership.role === 'admin') {
      throw new ForbiddenException(
        'Cannot change permission of an admin member',
      );
    }

    await this.householdsRepository.UpdateMemberPermission(
      currentUser.householdId as string,
      targetUserId,
      canEditOthersTransactions,
    );
  }

  async RemoveMember(
    currentUser: AuthenticatedUser,
    targetUserId: string,
  ): Promise<void> {
    this.assertIsAdmin(currentUser);

    if (currentUser.userId === targetUserId) {
      throw new ForbiddenException(
        'You cannot remove yourself from the household',
      );
    }

    await this.assertMemberOfSameHousehold(currentUser, targetUserId);

    await this.householdsRepository.RemoveMember(
      currentUser.householdId as string,
      targetUserId,
    );
  }

  private async assertMemberOfSameHousehold(
    currentUser: AuthenticatedUser,
    targetUserId: string,
  ): Promise<HouseholdMember> {
    this.assertHasHousehold(currentUser);

    const targetMembership =
      await this.householdsRepository.FindMembershipByUserId(targetUserId);

    if (
      !targetMembership ||
      targetMembership.householdId !== currentUser.householdId
    ) {
      throw new NotFoundException('Member not found in this household');
    }

    return targetMembership;
  }

  private assertIsAdmin(currentUser: AuthenticatedUser): void {
    this.assertHasHousehold(currentUser);

    if (currentUser.role !== 'admin') {
      throw new ForbiddenException(
        'Only household admin can perform this action',
      );
    }
  }

  private assertHasHousehold(currentUser: AuthenticatedUser): void {
    if (!currentUser.householdId) {
      throw new ForbiddenException('You do not belong to a household yet');
    }
  }

  private generateInviteCode(): string {
    return randomBytes(6).toString('hex');
  }
}

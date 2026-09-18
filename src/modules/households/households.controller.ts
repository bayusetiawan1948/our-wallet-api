import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { HouseholdsService } from './households.service';

@Controller('households')
export class HouseholdsController {
  constructor(private readonly householdsService: HouseholdsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateHouseholdDto,
  ) {
    const household = await this.householdsService.CreateHousehold(
      currentUser.userId,
      dto.name,
    );

    return {
      id: household.id,
      name: household.name,
    };
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  async getMyHousehold(@CurrentUser() currentUser: AuthenticatedUser) {
    const { household, membership } =
      await this.householdsService.GetMyHousehold(currentUser.userId);

    return {
      id: household.id,
      name: household.name,
      role: membership.role,
      can_edit_others_transactions: membership.canEditOthersTransactions,
    };
  }

  @Get('members')
  @HttpCode(HttpStatus.OK)
  async listMembers(@CurrentUser() currentUser: AuthenticatedUser) {
    const members = await this.householdsService.ListMembers(currentUser);

    return members.map((member) => ({
      user_id: member.userId,
      name: member.user.name,
      email: member.user.email,
      base_currency: member.user.baseCurrency,
      role: member.role,
      can_edit_others_transactions: member.canEditOthersTransactions,
    }));
  }

  @Post('invites')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async createInvite(@CurrentUser() currentUser: AuthenticatedUser) {
    const code = await this.householdsService.InviteMember(currentUser);

    return { code };
  }

  @Post('invites/accept')
  @HttpCode(HttpStatus.OK)
  async acceptInvite(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: AcceptInviteDto,
  ) {
    const household = await this.householdsService.AcceptInvite(
      currentUser.userId,
      dto.code,
    );

    return {
      id: household.id,
      name: household.name,
    };
  }

  @Patch('members/:userId')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async updateMember(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    await this.householdsService.UpdateMemberPermission(
      currentUser,
      userId,
      dto.can_edit_others_transactions,
    );

    return {
      user_id: userId,
      can_edit_others_transactions: dto.can_edit_others_transactions,
    };
  }

  @Delete('members/:userId')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async removeMember(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    await this.householdsService.RemoveMember(currentUser, userId);

    return { user_id: userId };
  }
}

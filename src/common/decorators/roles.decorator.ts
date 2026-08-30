import { SetMetadata } from '@nestjs/common';
import { HouseholdMemberRole } from '../types/role.type';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: HouseholdMemberRole[]) =>
  SetMetadata(ROLES_KEY, roles);

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

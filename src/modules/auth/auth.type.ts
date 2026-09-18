import { NullableHouseholdMemberRole } from '../../common/types/role.type';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
}

export interface AuthUserView {
  id: string;
  name: string;
  email: string;
  baseCurrency: string;
  householdId: string | null;
  role: NullableHouseholdMemberRole;
}

export interface RequestMeta {
  userAgent?: string;
}

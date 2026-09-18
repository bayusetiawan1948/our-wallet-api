import { NullableHouseholdMemberRole } from './role.type';

export interface JwtPayload {
  userId: string;
  email: string;
  fullName: string;
  householdId: string | null;
  role: NullableHouseholdMemberRole;
  sessionId: string;
  deviceId: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  deviceId: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  fullName: string;
  householdId: string | null;
  role: NullableHouseholdMemberRole;
  sessionId: string;
  deviceId: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

import { HouseholdMemberRole } from './role.type';

export interface JwtPayload {
  userId: string;
  email: string;
  fullName: string;
  role: HouseholdMemberRole;
  sessionId: string;
  deviceId: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  fullName: string;
  role: HouseholdMemberRole;
  sessionId: string;
  deviceId: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

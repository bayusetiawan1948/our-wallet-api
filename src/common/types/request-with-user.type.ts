import { Request } from 'express';
import { AuthenticatedUser } from './jwt-payload.type';

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

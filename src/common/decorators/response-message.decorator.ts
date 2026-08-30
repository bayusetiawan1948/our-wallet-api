import { SetMetadata } from '@nestjs/common';
import { ResponseCode } from '../constants/response-code.constant';

export const RESPONSE_MESSAGE_KEY = 'response_message';
export const RESPONSE_RC_KEY = 'response_rc';

/**
 * Decorator to set static custom success response message
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);

/**
 * Decorator to set static custom response code
 */
export const ResponseRC = (rc: ResponseCode) =>
  SetMetadata(RESPONSE_RC_KEY, rc);

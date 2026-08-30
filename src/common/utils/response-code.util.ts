import { RC_HTTP_STATUS, RCCode } from '../constants/response-code.constant';

export function getHttpStatus(rc: string): number {
  return RC_HTTP_STATUS[rc as RCCode] ?? 500;
}

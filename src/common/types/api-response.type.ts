import { ResponseCode } from '../constants/response-code.constant';

export interface ApiResponse<T = unknown> {
  rc: ResponseCode;
  message: string;
  data: T | null;
}

export interface ServiceResponse<T = unknown> {
  rc?: ResponseCode;
  message?: string;
  data?: T;
}

export function isServiceResponse(value: unknown): value is ServiceResponse {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

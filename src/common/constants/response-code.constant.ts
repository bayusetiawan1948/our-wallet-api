export enum ResponseCode {
  SUCCESS = '00',
  INVALID_REQUEST = '01',
  UNAUTHORIZED = '02',
  FORBIDDEN = '03',
  NOT_FOUND = '04',
  FORMAT_ERROR = '05',
  PRODUCT_INVALID = '13',
  USER_NOT_FOUND = '14',
  GENERAL_ERROR = '30',
  INSUFFICIENT_BALANCE = '51',
  WRONG_PASSWORD = '55',
  SECURITY_ERROR = '63',
  NETWORK_ERROR = '89',
  DATABASE_ERROR = '91',
  DUPLICATE = '94',
  INTERNAL_ERROR = '99',
}

/**
 * Backward compatibility alias for RC constant object
 */
export const RC = {
  SUCCESS: ResponseCode.SUCCESS,
  FORMAT_ERROR: ResponseCode.FORMAT_ERROR,
  PRODUCT_INVALID: ResponseCode.PRODUCT_INVALID,
  USER_NOT_FOUND: ResponseCode.USER_NOT_FOUND,
  NOT_FOUND: ResponseCode.NOT_FOUND,
  GENERAL_ERROR: ResponseCode.GENERAL_ERROR,
  INSUFFICIENT_BALANCE: ResponseCode.INSUFFICIENT_BALANCE,
  WRONG_PASSWORD: ResponseCode.WRONG_PASSWORD,
  SECURITY_ERROR: ResponseCode.SECURITY_ERROR,
  NETWORK_ERROR: ResponseCode.NETWORK_ERROR,
  DATABASE_ERROR: ResponseCode.DATABASE_ERROR,
  DUPLICATE: ResponseCode.DUPLICATE,
  INTERNAL_ERROR: ResponseCode.INTERNAL_ERROR,
  INVALID_REQUEST: ResponseCode.INVALID_REQUEST,
  UNAUTHORIZED: ResponseCode.UNAUTHORIZED,
  FORBIDDEN: ResponseCode.FORBIDDEN,
} as const;

export type RCCode = (typeof RC)[keyof typeof RC];

/**
 * HTTP Status to ResponseCode Mapping
 */
export const HTTP_STATUS_TO_RC: Record<number, ResponseCode> = {
  200: ResponseCode.SUCCESS,
  201: ResponseCode.SUCCESS,
  204: ResponseCode.SUCCESS,
  400: ResponseCode.INVALID_REQUEST,
  401: ResponseCode.UNAUTHORIZED,
  403: ResponseCode.FORBIDDEN,
  404: ResponseCode.NOT_FOUND,
  409: ResponseCode.DUPLICATE,
  422: ResponseCode.FORMAT_ERROR,
  500: ResponseCode.INTERNAL_ERROR,
  503: ResponseCode.DATABASE_ERROR,
};

export const RC_HTTP_STATUS: Record<RCCode, number> = {
  [ResponseCode.SUCCESS]: 200,
  [ResponseCode.INVALID_REQUEST]: 400,
  [ResponseCode.UNAUTHORIZED]: 401,
  [ResponseCode.FORBIDDEN]: 403,
  [ResponseCode.NOT_FOUND]: 404,
  [ResponseCode.FORMAT_ERROR]: 400,
  [ResponseCode.PRODUCT_INVALID]: 422,
  [ResponseCode.USER_NOT_FOUND]: 404,
  [ResponseCode.GENERAL_ERROR]: 500,
  [ResponseCode.INSUFFICIENT_BALANCE]: 422,
  [ResponseCode.WRONG_PASSWORD]: 401,
  [ResponseCode.SECURITY_ERROR]: 403,
  [ResponseCode.NETWORK_ERROR]: 400,
  [ResponseCode.DATABASE_ERROR]: 503,
  [ResponseCode.DUPLICATE]: 409,
  [ResponseCode.INTERNAL_ERROR]: 500,
};

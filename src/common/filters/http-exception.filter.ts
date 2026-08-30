import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import {
  HTTP_STATUS_TO_RC,
  ResponseCode,
} from '../constants/response-code.constant';
import { ApiResponse } from '../types/api-response.type';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<ExpressResponse>();
    const request = ctx.getRequest<ExpressRequest>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let rc: ResponseCode = ResponseCode.INTERNAL_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      rc = HTTP_STATUS_TO_RC[status] || ResponseCode.INTERNAL_ERROR;

      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const resObj = exceptionResponse as {
          rc?: ResponseCode;
          message?: string | string[];
          error?: string;
        };

        // If custom rc is passed in exception response
        if (resObj.rc && Object.values(ResponseCode).includes(resObj.rc)) {
          rc = resObj.rc;
        }

        // Handle class-validator validation array or string message
        if (Array.isArray(resObj.message)) {
          message = resObj.message.join(', ');
        } else if (typeof resObj.message === 'string') {
          message = resObj.message;
        } else if (typeof resObj.error === 'string') {
          message = resObj.error;
        }
      }
    } else {
      // Internal unhandled exception
      const error = exception as Error;
      this.logger.error(
        `Unhandled Exception [${request?.method ?? 'UNKNOWN'} ${request?.url ?? ''}]: ${error?.message || error}`,
        error?.stack,
      );
    }

    const payload: ApiResponse<null> = {
      rc,
      message,
      data: null,
    };

    response.status(status).json(payload);
  }
}

import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ResponseCode } from '../constants/response-code.constant';
import { ApiResponse, isServiceResponse } from '../types/api-response.type';
import {
  RESPONSE_MESSAGE_KEY,
  RESPONSE_RC_KEY,
} from '../decorators/response-message.decorator';
import type { Response as ExpressResponse } from 'express';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<unknown>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<unknown>> {
    const httpContext = context.switchToHttp();
    const response = httpContext.getResponse<ExpressResponse>();

    // Handle 204 No Content -> convert to 200 OK with envelope
    if (response && response.statusCode === Number(HttpStatus.NO_CONTENT)) {
      response.status(HttpStatus.OK);
    }

    // Ambil metadata dari decorator (Priority 2)
    const decoratorMessage = this.reflector.getAllAndOverride<string>(
      RESPONSE_MESSAGE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const decoratorRC = this.reflector.getAllAndOverride<ResponseCode>(
      RESPONSE_RC_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      map((result) => {
        let finalRC = decoratorRC || ResponseCode.SUCCESS;
        let finalMessage = decoratorMessage || 'Success';
        let finalData: unknown =
          result === undefined || result === null ? null : result;

        // Cek jika return value dari service/controller adalah object wrapper khusus (Priority 1)
        if (isServiceResponse(result)) {
          if (result.message !== undefined) {
            finalMessage = result.message;
          }

          if (result.rc !== undefined) {
            finalRC = result.rc;
          }

          if (result.data !== undefined) {
            finalData = result.data;
          }
        }

        return {
          rc: finalRC,
          message: finalMessage,
          data: finalData,
        };
      }),
    );
  }
}

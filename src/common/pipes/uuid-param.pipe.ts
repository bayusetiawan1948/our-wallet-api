import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { isUUID } from 'class-validator';

const ID_PARAM_NAME = /^(id|[a-z]+Id)$/;

/**
 * Semua path param bernama `id` atau berakhiran `Id` (userId, paymentId, ...) adalah UUID.
 * Menolak nilai lain dengan 400 supaya tidak diteruskan ke Postgres (yang akan menghasilkan 500).
 */
@Injectable()
export class UuidParamPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (
      metadata.type !== 'param' ||
      !metadata.data ||
      !ID_PARAM_NAME.test(metadata.data)
    ) {
      return value;
    }

    if (typeof value !== 'string' || !isUUID(value)) {
      throw new BadRequestException(`${metadata.data} must be a valid UUID`);
    }

    return value;
  }
}

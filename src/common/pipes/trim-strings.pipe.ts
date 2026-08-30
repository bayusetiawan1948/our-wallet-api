import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

export interface TrimStringsOptions {
  /**
   * Field names that should be excluded from trimming (e.g. passwords, tokens).
   */
  except?: string[];
}

const DEFAULT_EXCEPT_FIELDS = [
  'password',
  'password_confirmation',
  'current_password',
  'new_password',
  'secret',
  'api_key',
  'access_token',
  'refresh_token',
  'private_key',
];

@Injectable()
export class TrimStringsPipe implements PipeTransform {
  private readonly exceptFields: Set<string>;

  constructor(options?: TrimStringsOptions) {
    const customExcept = options?.except ?? [];
    this.exceptFields = new Set([...DEFAULT_EXCEPT_FIELDS, ...customExcept]);
  }

  transform(values: unknown, metadata: ArgumentMetadata): unknown {
    // Only process body, query, and param payloads
    if (metadata.type === 'custom' || values === null || values === undefined) {
      return values;
    }

    return this.trim(values);
  }

  private trim(values: unknown, key?: string): unknown {
    if (key && this.isExcepted(key)) {
      return values;
    }

    if (typeof values === 'string') {
      return values.trim();
    }

    if (Array.isArray(values)) {
      return values.map((item) => this.trim(item));
    }

    if (this.isObject(values)) {
      return Object.keys(values).reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = this.trim(values[k], k);
        return acc;
      }, {});
    }

    return values;
  }

  private isExcepted(key: string): boolean {
    return (
      this.exceptFields.has(key) || this.exceptFields.has(key.toLowerCase())
    );
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      !(value instanceof Date) &&
      !(value instanceof RegExp)
    );
  }
}

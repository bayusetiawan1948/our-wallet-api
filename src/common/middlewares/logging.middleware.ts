import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LoggingMiddleware.name);
  private readonly logFilePath = path.resolve(process.cwd(), 'data-log.txt');
  private logStream: fs.WriteStream;

  private readonly sensitiveKeys = new Set([
    'password',
    'pass',
    'token',
    'access_token',
    'refresh_token',
    'authorization',
    'secret',
    'apikey',
    'api_key',
    'pin',
    'cvv',
    'card_number',
    'credit_card',
  ]);

  constructor() {
    this.logStream = fs.createWriteStream(this.logFilePath, {
      flags: 'a',
      encoding: 'utf8',
    });

    this.logStream.on('error', (err) => {
      this.logger.error(
        `Error writing to log file at ${this.logFilePath}`,
        err.stack,
      );
    });
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    req.headers['x-request-id'] = requestId;

    const timestamp = this.formatTimestamp(new Date());
    const method = req.method;
    const requestPath = req.originalUrl || req.url;
    const ip = req.ip || req.socket.remoteAddress || '-';

    // Support user_id / client_id jika terpasang dari auth middleware/jwt sebelumnya
    const userId =
      (req as Request & { user?: { id?: string | number } }).user?.id ?? '-';
    const clientId = (req.headers['x-client-id'] as string) ?? '-';

    const sanitizedHeaders = this.maskSensitiveData(req.headers);
    const sanitizedBody = this.maskSensitiveData(req.body);

    const logEntry = [
      `[${timestamp}] INFO`,
      `[REQUEST]`,
      `request_id=${requestId}`,
      `method=${method}`,
      `path=${requestPath}`,
      `ip=${ip}`,
      `user_id=${userId}`,
      `client_id=${clientId}`,
      ``,
      `Request received.`,
      ``,
      `Headers:`,
      JSON.stringify(sanitizedHeaders, null, 2),
      ``,
      `Body:`,
      sanitizedBody && Object.keys(sanitizedBody).length > 0
        ? JSON.stringify(sanitizedBody, null, 2)
        : '{}',
      ``,
      `--------------------------------------------------`,
      ``,
    ].join('\n');

    this.writeLog(logEntry);

    next();
  }

  private writeLog(content: string): void {
    if (this.logStream.writable) {
      this.logStream.write(content);
    } else {
      fs.appendFile(this.logFilePath, content, 'utf8', (err) => {
        if (err) {
          this.logger.error(
            `Failed to append log to ${this.logFilePath}`,
            err.stack,
          );
        }
      });
    }
  }

  private formatTimestamp(date: Date): string {
    const pad = (n: number, z = 2) => String(n).padStart(z, '0');
    const yyyy = date.getFullYear();
    const MM = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    const ms = pad(date.getMilliseconds(), 3);

    return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}.${ms}`;
  }

  private maskSensitiveData(data: unknown): unknown {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.maskSensitiveData(item));
    }

    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (this.sensitiveKeys.has(lowerKey)) {
        masked[key] = '[REDACTED]';
      } else if (value !== null && typeof value === 'object') {
        masked[key] = this.maskSensitiveData(value);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }
}

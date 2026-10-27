import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  // Default hanya localhost: akses dari luar lewat `tailscale serve` (HTTPS).
  // Di Docker set HOST=0.0.0.0 (port host tetap di-bind ke 127.0.0.1 oleh compose).
  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '127.0.0.1');
}
void bootstrap();

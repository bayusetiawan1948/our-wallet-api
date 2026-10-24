import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  // Hanya localhost: akses dari luar lewat `tailscale serve` (HTTPS)
  await app.listen(process.env.PORT ?? 3000, '127.0.0.1');
}
void bootstrap();

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Hapus field liar yang tidak didefinisikan di DTO
      forbidNonWhitelisted: false, // Tolak request jika ada property asing
      transform: true, // Otomatis cast payload ke instance DTO
      transformOptions: {
        enableImplicitConversion: false, // Disarankan false agar konversi tipe data eksplisit via @Type()
      },
    }),
  );

  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
  });

  // Hanya localhost: akses dari luar lewat `tailscale serve` (HTTPS)
  await app.listen(process.env.PORT ?? 3000, '127.0.0.1');
}
void bootstrap();

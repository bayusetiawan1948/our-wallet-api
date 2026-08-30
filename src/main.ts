import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // main.ts
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

  // app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();

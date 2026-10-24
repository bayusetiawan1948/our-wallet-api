import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { UuidParamPipe } from './common/pipes/uuid-param.pipe';

export function configureApp(app: INestApplication): void {
  app.use(cookieParser());

  app.useGlobalPipes(
    new UuidParamPipe(),
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
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
process.env.TZ = 'Asia/Jakarta';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable CORS dengan konfigurasi lebih lengkap
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });

  // Serve static files untuk multiple directories
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // Serve static files untuk build frontend (jika diperlukan)
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/public/',
  });

  // Global prefix untuk API routes
  app.setGlobalPrefix('api');

  // Enable validation pipe dengan konfigurasi lengkap
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true, // Mengubah string ke number/boolean secara otomatis
      },
      forbidNonWhitelisted: true,
      disableErrorMessages: process.env.NODE_ENV === 'production', // Sembunyikan error detail di production
    }),
  );

  // Global error handling filter (optional)
  // app.useGlobalFilters(new HttpExceptionFilter());

  // Shutdown hooks untuk graceful shutdown
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Application is running on: ${await app.getUrl()}`);
  console.log(
    `📁 Serving static files from: ${join(__dirname, '..', 'uploads')}`,
  );
  console.log(
    `🌐 CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3001'}`,
  );
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
});

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

// Set timezone to Indonesia
process.env.TZ = 'Asia/Jakarta';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enhanced CORS configuration for PWA
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3001',
      'http://localhost:3000',
      'https://localhost:3001',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Cache-Control',
    ],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400,
  });

  // Security headers for PWA
  app.use((req, res, next) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Powered-By', 'Rental Motor App');

    // CORS headers (additional)
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    next();
  });

  // Special handling for service worker
  app.use((req, res, next) => {
    if (req.url.includes('/sw.js')) {
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    // Special handling for manifest
    if (
      req.url.includes('/manifest.json') ||
      req.url.includes('/manifest.webmanifest')
    ) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }

    next();
  });

  // Global prefix untuk API routes
  app.setGlobalPrefix('api');

  // Enhanced validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      forbidNonWhitelisted: true,
      disableErrorMessages: process.env.NODE_ENV === 'production',
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  // Graceful shutdown configuration
  app.enableShutdownHooks();

  // Health check endpoint - FIXED
  app.getHttpAdapter().get('/health', (req, res) => {
    (res as any).status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // PWA manifest endpoint - FIXED
  app.getHttpAdapter().get('/api/pwa/manifest', (req, res) => {
    (res as any).json({
      name: 'Rental Motor Management',
      short_name: 'RentalMotor',
      description: 'Aplikasi manajemen rental motor dengan fitur lengkap',
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#000000',
      orientation: 'portrait-primary',
      scope: '/',
      icons: [
        {
          src: '/icons/icon-72x72.png',
          sizes: '72x72',
          type: 'image/png',
          purpose: 'maskable any',
        },
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable any',
        },
        {
          src: '/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable any',
        },
      ],
      categories: ['business', 'productivity'],
      lang: 'id-ID',
    });
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Application is running on: ${await app.getUrl()}`);
  console.log(`📱 PWA Support: Enabled`);
  console.log(`🌐 CORS enabled for multiple origins`);
  console.log(`⏰ Timezone: ${process.env.TZ}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   - API: ${await app.getUrl()}/api`);
  console.log(`   - Health: ${await app.getUrl()}/health`);
  console.log(`   - PWA Manifest: ${await app.getUrl()}/api/pwa/manifest`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
});

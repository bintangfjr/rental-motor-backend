import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { MotorModule } from './motor/motor.module';
import { MotorServiceModule } from './motor-service/motor-service.module';
import { PenyewaModule } from './penyewa/penyewa.module';
import { SewaModule } from './sewa/sewa.module';
import { HistoryModule } from './history/history.module';
import { ReportModule } from './report/report.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SettingsModule } from './settings/settings.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { IopgpsModule } from './iopgps/iopgps.module';
import { WebsocketModule } from './websocket/websocket.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    // Global modules
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 90 * 60 * 1000,
      max: 100,
    }),
    ScheduleModule.forRoot(),
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),

    // Serve static files for frontend build
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'rental-motor-frontend', 'dist'),
      serveRoot: '/',
      exclude: ['/api/*'],
      serveStaticOptions: {
        index: false,
        setHeaders: (res, path) => {
          // Set proper cache headers for PWA assets
          if (path.includes('sw.js')) {
            res.setHeader(
              'Cache-Control',
              'no-cache, no-store, must-revalidate',
            );
            res.setHeader('Service-Worker-Allowed', '/');
          }
          if (path.includes('manifest.webmanifest')) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('Content-Type', 'application/manifest+json');
          }
        },
      },
    }),

    // Serve uploads directory
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),

    // Feature modules
    AuthModule,
    AdminModule,
    MotorModule,
    MotorServiceModule,
    PenyewaModule,
    SewaModule,
    HistoryModule,
    ReportModule,
    DashboardModule,
    SettingsModule,
    WhatsAppModule,
    IopgpsModule,
    WebsocketModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}

// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';

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
import { WebsocketModule } from './websocket/websocket.module'; // ✅ Tambahkan ini
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
      ttl: 90 * 60 * 1000, // 90 menit untuk cache token
      max: 100,
    }),
    ScheduleModule.forRoot(),
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
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
    WebsocketModule, // ✅ Masukkan di sini
  ],
  providers: [PrismaService],
})
export class AppModule {}

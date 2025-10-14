// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { MotorModule } from './motor/motor.module';
import { PenyewaModule } from './penyewa/penyewa.module';
import { SewaModule } from './sewa/sewa.module';
import { HistoryModule } from './history/history.module';
import { ReportModule } from './report/report.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SettingsModule } from './settings/settings.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { IopgpsModule } from './iopgps/iopgps.module';
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
    ScheduleModule.forRoot(), // Untuk scheduler service
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),

    // Feature modules
    AuthModule, // Autentikasi & guard
    AdminModule, // Manajemen admin
    MotorModule, // Manajemen motor (sudah terintegrasi dengan IOPGPS)
    PenyewaModule, // Manajemen penyewa
    SewaModule, // Proses sewa
    HistoryModule, // Riwayat sewa
    ReportModule, // Laporan
    DashboardModule, // Dashboard ringkasan
    SettingsModule, // Konfigurasi aplikasi
    WhatsAppModule, // WhatsApp notification
    IopgpsModule, // Integrasi IOPGPS
  ],
  providers: [PrismaService],
})
export class AppModule {}

// app.module.ts
import { Module } from '@nestjs/common';
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
import { TraccarModule } from './traccar/traccar.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    AuthModule, // Autentikasi & guard
    AdminModule, // Manajemen admin
    MotorModule, // Manajemen motor
    PenyewaModule, // Manajemen penyewa
    SewaModule, // Proses sewa
    HistoryModule, // Riwayat sewa
    ReportModule, // Laporan
    DashboardModule, // Dashboard ringkasan
    SettingsModule, // Konfigurasi aplikasi
    WhatsAppModule, // WhatsApp notification
    TraccarModule, // Integrasi GPS Traccar
  ],
  providers: [PrismaService],
})
export class AppModule {}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { NotificationService } from './notification.service';
import { WhatsAppConfig } from './interfaces/whatsapp.interface';
import * as moment from 'moment-timezone';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly STATUS = {
    AKTIF: 'Aktif',
    LEWAT_TEMPO: 'Lewat Tempo',
  };

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  @Cron('0 * * * * *')
  async handleAutomaticNotifications() {
    this.logger.log('🚀 Memeriksa notifikasi otomatis setiap menit...');

    try {
      const settings = await this.getSettings();

      if (settings.auto_notifications !== 'true') {
        this.logger.log('⏸️ Notifikasi otomatis dinonaktifkan');
        return;
      }

      await this.sendAutomaticReminders(settings);
      await this.sendAutomaticAlerts(settings);

      this.logger.log('✅ Pemeriksaan notifikasi otomatis selesai');
    } catch (error: unknown) {
      this.logger.error(
        '❌ Error dalam notifikasi otomatis:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async sendAutomaticReminders(settings: WhatsAppConfig) {
    const nowUTC = moment().utc();

    // ✅ PERBAIKI: Rentang lebih longgar (2 jam ± 10 menit)
    const reminderThresholdStart = nowUTC
      .clone()
      .add(2, 'hours')
      .subtract(10, 'minutes');
    const reminderThresholdEnd = nowUTC
      .clone()
      .add(2, 'hours')
      .add(10, 'minutes');

    this.logger.log(
      `🕒 Waktu UTC saat ini: ${nowUTC.format('YYYY-MM-DD HH:mm:ss')}`,
    );
    this.logger.log(
      `📅 Rentang pengingat 2 jam: ${reminderThresholdStart.format('HH:mm:ss')} - ${reminderThresholdEnd.format('HH:mm:ss')}`,
    );

    // ✅ PERBAIKI: Query lebih sederhana
    const dueSewas = await this.prisma.sewa.findMany({
      where: {
        status: this.STATUS.AKTIF,
        tgl_kembali: {
          gte: reminderThresholdStart.toDate(),
          lte: reminderThresholdEnd.toDate(),
        },
        // ✅ Hanya yang belum pernah sukses
        status_notifikasi: { not: 'sent' },
      },
      include: {
        penyewa: {
          select: { id: true, nama: true, no_whatsapp: true },
        },
        motor: {
          select: { id: true, plat_nomor: true, merk: true, model: true },
        },
      },
    });

    this.logger.log(
      `📨 Menemukan ${dueSewas.length} sewa untuk pengingat 2 jam sebelum jatuh tempo`,
    );

    let successCount = 0;
    let skipCount = 0;

    for (const sewa of dueSewas) {
      try {
        // ✅ PERBAIKI: Gunakan sewa_id yang sudah tersedia
        const recentlyNotified = await this.checkRecentNotification(
          sewa.id,
          30, // 30 menit
        );

        if (recentlyNotified) {
          this.logger.log(
            `⏩ Skip sewa ID: ${sewa.id} - sudah dikirim dalam 30 menit terakhir`,
          );
          skipCount++;
          continue;
        }

        // ✅ PERBAIKI: Langsung kirim tanpa update status pending
        const result = await this.notificationService.sendReminder(
          sewa.id,
          settings,
        );

        if (result.success) {
          successCount++;
          this.logger.log(
            `✅ Pengingat 2 jam berhasil dikirim untuk sewa ID: ${sewa.id}`,
          );
        } else {
          this.logger.warn(
            `❌ Pengingat 2 jam gagal untuk sewa ID: ${sewa.id}`,
          );
        }

        // ✅ Delay 1 detik antara pengiriman
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        this.logger.error(
          `💥 Gagal mengirim pengingat 2 jam untuk sewa ID: ${sewa.id}`,
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    }

    // ✅ LOG STATISTIK
    this.logger.log(
      `📊 STATISTIK REMINDER: ${successCount} berhasil, ${skipCount} skip, ${dueSewas.length - successCount - skipCount} gagal`,
    );
  }

  async sendAutomaticAlerts(settings: WhatsAppConfig) {
    const nowUTC = moment().utc();

    this.logger.log(
      `🔍 Memeriksa sewa lewat tempo pada UTC: ${nowUTC.format('YYYY-MM-DD HH:mm:ss')}`,
    );

    // ✅ PERBAIKI: Query lebih sederhana
    const overdueSewas = await this.prisma.sewa.findMany({
      where: {
        status: this.STATUS.AKTIF,
        tgl_kembali: {
          lt: nowUTC.toDate(),
        },
        // ✅ Hanya yang belum pernah sukses
        status_notifikasi: { not: 'sent' },
      },
      include: {
        penyewa: {
          select: { id: true, nama: true, no_whatsapp: true },
        },
        motor: {
          select: { id: true, plat_nomor: true, merk: true, model: true },
        },
      },
    });

    this.logger.log(
      `⚠️ Menemukan ${overdueSewas.length} sewa yang lewat tempo untuk alert otomatis`,
    );

    // Debug log
    overdueSewas.forEach((sewa) => {
      const tglKembaliUTC = moment(sewa.tgl_kembali).utc();
      const diffMinutes = nowUTC.diff(tglKembaliUTC, 'minutes');
      this.logger.log(
        `📋 Sewa ID: ${sewa.id}, Terlambat: ${diffMinutes} menit, Status Notif: ${sewa.status_notifikasi}`,
      );
    });

    let successCount = 0;
    let skipCount = 0;

    for (const sewa of overdueSewas) {
      try {
        // ✅ PERBAIKI: Gunakan sewa_id yang sudah tersedia
        const recentlyNotified = await this.checkRecentNotification(
          sewa.id,
          60, // 60 menit
        );

        if (recentlyNotified) {
          this.logger.log(
            `⏩ Skip alert sewa ID: ${sewa.id} - sudah dikirim dalam 1 jam terakhir`,
          );
          skipCount++;
          continue;
        }

        const result = await this.notificationService.sendAlert(
          sewa.id,
          settings,
        );

        if (result.success) {
          successCount++;
          this.logger.log(
            `✅ Alert otomatis berhasil dikirim untuk sewa ID: ${sewa.id}`,
          );
        } else {
          this.logger.warn(`❌ Alert otomatis gagal untuk sewa ID: ${sewa.id}`);
        }

        // ✅ Delay 1 detik antara pengiriman
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        this.logger.error(
          `💥 Gagal mengirim alert otomatis untuk sewa ID: ${sewa.id}`,
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    }

    // ✅ LOG STATISTIK
    this.logger.log(
      `📊 STATISTIK ALERT: ${successCount} berhasil, ${skipCount} skip, ${overdueSewas.length - successCount - skipCount} gagal`,
    );
  }

  // ✅ PERBAIKI: Method checkRecentNotification yang AKURAT
  private async checkRecentNotification(
    sewaId: number,
    minutesThreshold: number,
  ): Promise<boolean> {
    const thresholdTime = moment()
      .utc()
      .subtract(minutesThreshold, 'minutes')
      .toDate();

    // ✅ GUNAKAN sewa_id yang sudah tersedia di database
    const recentNotification = await this.prisma.whatsAppNotification.findFirst(
      {
        where: {
          sewa_id: sewaId, // ✅ LANGSUNG PAKAI sewa_id
          type: { in: ['reminder_2jam', 'alert_admin'] },
          status: 'sent',
          created_at: {
            gte: thresholdTime,
          },
        },
      },
    );

    return !!recentNotification;
  }

  async triggerManualNotifications() {
    this.logger.log('🔧 Trigger manual notifikasi otomatis dipanggil');
    return await this.handleAutomaticNotifications();
  }

  private async getSettings(): Promise<WhatsAppConfig> {
    const settings = await this.prisma.settings.findMany({
      where: { OR: [{ group: 'whatsapp' }, { group: 'notification' }] },
    });

    const result: Record<string, string> = {};
    settings.forEach((setting) => {
      result[setting.key] = setting.value;
    });

    return {
      api_key: process.env.WHATSAPP_API_KEY || result.whatsapp_api_key || '',
      fonnte_number:
        process.env.WHATSAPP_FONNTE_NUMBER ||
        result.whatsapp_fonnte_number ||
        '',
      admin_numbers:
        process.env.WHATSAPP_ADMIN_NUMBERS ||
        result.whatsapp_admin_numbers ||
        '',
      reminder_template:
        result.reminder_template ||
        'Halo {nama}! Ini adalah pengingat bahwa sewa motor {motor} (Plat: {plat}) akan jatuh tempo pada {jatuh_tempo}. Sisa waktu: {sisa_waktu}. Harap siapkan pengembalian motor tepat waktu. Terima kasih.',
      alert_template:
        result.alert_template ||
        'PERINGATAN: Sewa motor {motor} (Plat: {plat}) oleh {nama} telah lewat jatuh tempo sejak {jatuh_tempo}. Keterlambatan: {keterlambatan}. Segera tindak lanjuti!',
      auto_notifications: result.auto_notifications || 'true',
    };
  }
}

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

  // ✅ UBAH: Setiap menit sekali (detik 0 dari setiap menit)
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
    // GUNAKAN UTC TIME untuk konsistensi dengan database
    const nowUTC = moment().utc();

    // ✅ PERBAIKI: Rentang waktu lebih presisi (2 jam ± 1 menit)
    const reminderThresholdStart = nowUTC
      .clone()
      .add(2, 'hours')
      .subtract(1, 'minute');
    const reminderThresholdEnd = nowUTC
      .clone()
      .add(2, 'hours')
      .add(1, 'minute');

    this.logger.log(
      `🕒 Waktu UTC saat ini: ${nowUTC.format('YYYY-MM-DD HH:mm:ss')}`,
    );
    this.logger.log(
      `📅 Rentang pengingat 2 jam: ${reminderThresholdStart.format('HH:mm:ss')} - ${reminderThresholdEnd.format('HH:mm:ss')}`,
    );

    const dueSewas = await this.prisma.sewa.findMany({
      where: {
        status: this.STATUS.AKTIF,
        tgl_kembali: {
          gte: reminderThresholdStart.toDate(),
          lte: reminderThresholdEnd.toDate(),
        },
        OR: [
          { status_notifikasi: null },
          { status_notifikasi: 'failed' },
          { status_notifikasi: 'pending' },
        ],
      },
      include: {
        penyewa: true,
        motor: true,
      },
    });

    this.logger.log(
      `📨 Menemukan ${dueSewas.length} sewa untuk pengingat 2 jam sebelum jatuh tempo`,
    );

    for (const sewa of dueSewas) {
      try {
        // ✅ PERBAIKI: Cek apakah notifikasi sudah dikirim dalam 30 menit terakhir
        const recentlyNotified = await this.checkRecentNotification(
          sewa.id,
          30,
        ); // 30 menit
        if (recentlyNotified) {
          this.logger.log(
            `⏩ Skip sewa ID: ${sewa.id} - sudah dikirim notifikasi baru-baru ini`,
          );
          continue;
        }

        await this.prisma.sewa.update({
          where: { id: sewa.id },
          data: {
            status_notifikasi: 'pending',
          },
        });

        const result = await this.notificationService.sendReminder(
          sewa.id,
          settings,
        );

        if (result.success) {
          this.logger.log(
            `✅ Pengingat 2 jam berhasil dikirim untuk sewa ID: ${sewa.id}`,
          );
        } else {
          this.logger.warn(
            `❌ Pengingat 2 jam gagal untuk sewa ID: ${sewa.id}`,
          );
          await this.prisma.sewa.update({
            where: { id: sewa.id },
            data: { status_notifikasi: 'failed' },
          });
        }

        // ✅ Delay 1 detik antara pengiriman untuk menghindari spam
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        this.logger.error(
          `💥 Gagal mengirim pengingat 2 jam untuk sewa ID: ${sewa.id}`,
          error instanceof Error ? error.message : 'Unknown error',
        );
        await this.prisma.sewa.update({
          where: { id: sewa.id },
          data: { status_notifikasi: 'failed' },
        });
      }
    }
  }

  async sendAutomaticAlerts(settings: WhatsAppConfig) {
    // GUNAKAN UTC TIME untuk konsistensi dengan database
    const nowUTC = moment().utc();

    this.logger.log(
      `🔍 Memeriksa sewa lewat tempo pada UTC: ${nowUTC.format('YYYY-MM-DD HH:mm:ss')}`,
    );

    const overdueSewas = await this.prisma.sewa.findMany({
      where: {
        status: this.STATUS.AKTIF,
        tgl_kembali: {
          lt: nowUTC.toDate(), // Gunakan waktu UTC
        },
        OR: [
          { status_notifikasi: null },
          { status_notifikasi: 'failed' },
          { status_notifikasi: 'pending' },
        ],
      },
      include: {
        penyewa: true,
        motor: true,
      },
    });

    this.logger.log(
      `⚠️ Menemukan ${overdueSewas.length} sewa yang lewat tempo untuk alert otomatis`,
    );

    // Debug: log detail sewa yang ditemukan
    overdueSewas.forEach((sewa) => {
      const tglKembaliUTC = moment(sewa.tgl_kembali).utc();
      const diffMinutes = nowUTC.diff(tglKembaliUTC, 'minutes');
      this.logger.log(
        `📋 Sewa ID: ${sewa.id}, Tgl Kembali (UTC): ${tglKembaliUTC.format('YYYY-MM-DD HH:mm:ss')}, Terlambat: ${diffMinutes} menit`,
      );
    });

    for (const sewa of overdueSewas) {
      try {
        // ✅ PERBAIKI: Cek apakah notifikasi sudah dikirim dalam 1 jam terakhir
        const recentlyNotified = await this.checkRecentNotification(
          sewa.id,
          60,
        ); // 60 menit
        if (recentlyNotified) {
          this.logger.log(
            `⏩ Skip alert sewa ID: ${sewa.id} - sudah dikirim notifikasi baru-baru ini`,
          );
          continue;
        }

        await this.prisma.sewa.update({
          where: { id: sewa.id },
          data: {
            status_notifikasi: 'pending',
          },
        });

        const result = await this.notificationService.sendAlert(
          sewa.id,
          settings,
        );

        if (result.success) {
          this.logger.log(
            `✅ Alert otomatis berhasil dikirim untuk sewa ID: ${sewa.id}`,
          );
        } else {
          this.logger.warn(`❌ Alert otomatis gagal untuk sewa ID: ${sewa.id}`);
          await this.prisma.sewa.update({
            where: { id: sewa.id },
            data: { status_notifikasi: 'failed' },
          });
        }

        // ✅ Delay 1 detik antara pengiriman untuk menghindari spam
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        this.logger.error(
          `💥 Gagal mengirim alert otomatis untuk sewa ID: ${sewa.id}`,
          error instanceof Error ? error.message : 'Unknown error',
        );
        await this.prisma.sewa.update({
          where: { id: sewa.id },
          data: { status_notifikasi: 'failed' },
        });
      }
    }
  }

  // ✅ METHOD BARU: Cek notifikasi terakhir untuk menghindari spam
  private async checkRecentNotification(
    sewaId: number,
    minutesThreshold: number,
  ): Promise<boolean> {
    const thresholdTime = moment()
      .utc()
      .subtract(minutesThreshold, 'minutes')
      .toDate();

    const recentNotification = await this.prisma.whatsAppNotification.findFirst(
      {
        where: {
          target: { contains: sewaId.toString() }, // Target mungkin berisi ID sewa
          type: { in: ['reminder_2jam', 'alert_admin'] },
          status: 'sent',
          created_at: {
            gte: thresholdTime,
          },
        },
        orderBy: {
          created_at: 'desc',
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

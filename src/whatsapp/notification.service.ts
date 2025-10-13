import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FonnteApiService } from './fonnte-api.service';
import { TemplateService } from './template.service';
import {
  WhatsAppConfig,
  NotificationResult,
  SewaWithRemainingTime,
  SisaWaktuStatus,
} from './interfaces/whatsapp.interface';
import * as moment from 'moment';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly STATUS = {
    AKTIF: 'Aktif',
    LEWAT_TEMPO: 'Lewat Tempo',
  };

  constructor(
    private prisma: PrismaService,
    private fonnteApi: FonnteApiService,
    private templateService: TemplateService,
  ) {}

  async sendReminder(
    sewaId: number,
    config: WhatsAppConfig,
  ): Promise<NotificationResult> {
    const sewa = await this.prisma.sewa.findUnique({
      where: { id: sewaId },
      include: { penyewa: true, motor: true },
    });

    if (!sewa) throw new NotFoundException('Sewa not found');
    if (!sewa.penyewa.no_whatsapp) {
      throw new BadRequestException('Penyewa tidak memiliki nomor WhatsApp');
    }

    const { text: sisaWaktuText } = this.templateService.formatRemainingTime(
      sewa.tgl_kembali,
    );

    const message = this.templateService.compileReminderTemplate(
      config.reminder_template,
      {
        nama: sewa.penyewa.nama,
        motor: `${sewa.motor.merk} ${sewa.motor.model}`,
        plat: sewa.motor.plat_nomor,
        jatuh_tempo: moment(sewa.tgl_kembali).format('DD/MM/YYYY HH:mm'),
        sisa_waktu: sisaWaktuText,
      },
    );

    const success = await this.fonnteApi.sendMessage(
      config.api_key,
      sewa.penyewa.no_whatsapp,
      message,
    );

    // PERBAIKAN: Hapus last_reminder_sent
    await this.prisma.sewa.update({
      where: { id: sewaId },
      data: {
        status_notifikasi: success ? 'sent' : 'failed',
      },
    });

    await this.prisma.whatsAppNotification.create({
      data: {
        target: sewa.penyewa.no_whatsapp,
        message,
        type: 'reminder_2jam',
        status: success ? 'sent' : 'failed',
        response: success ? 'Success' : 'Failed',
      },
    });

    return {
      success,
      message: success
        ? 'Notifikasi pengingat 2 jam sebelum jatuh tempo berhasil dikirim.'
        : 'Gagal mengirim notifikasi pengingat.',
      data: { message },
    };
  }

  async sendAlert(
    sewaId: number,
    config: WhatsAppConfig,
  ): Promise<NotificationResult> {
    const sewa = await this.prisma.sewa.findUnique({
      where: { id: sewaId },
      include: { penyewa: true, motor: true },
    });

    if (!sewa) throw new NotFoundException('Sewa not found');

    const adminNumbers = config.admin_numbers
      .split(',')
      .map((num) => num.trim())
      .filter((num) => num);

    if (adminNumbers.length === 0) {
      throw new BadRequestException('Tidak ada nomor admin yang dikonfigurasi');
    }

    const keterlambatanText = this.templateService.formatOverdueTime(
      sewa.tgl_kembali,
    );

    const message = this.templateService.compileAlertTemplate(
      config.alert_template,
      {
        nama: sewa.penyewa.nama,
        motor: `${sewa.motor.merk} ${sewa.motor.model}`,
        plat: sewa.motor.plat_nomor,
        jatuh_tempo: moment(sewa.tgl_kembali).format('DD/MM/YYYY HH:mm'),
        keterlambatan: keterlambatanText,
        whatsapp: sewa.penyewa.no_whatsapp,
      },
    );

    let successCount = 0;

    for (const adminNumber of adminNumbers) {
      const success = await this.fonnteApi.sendMessage(
        config.api_key,
        adminNumber,
        message,
      );

      if (success) successCount++;

      await this.prisma.whatsAppNotification.create({
        data: {
          target: adminNumber,
          message,
          type: 'alert_admin',
          status: success ? 'sent' : 'failed',
          response: success ? 'Success' : 'Failed',
        },
      });
    }

    // PERBAIKAN: Hapus last_alert_sent
    await this.prisma.sewa.update({
      where: { id: sewaId },
      data: {
        status: this.STATUS.LEWAT_TEMPO,
        status_notifikasi: successCount > 0 ? 'sent' : 'failed',
      },
    });

    return {
      success: successCount > 0,
      message:
        successCount > 0
          ? `Notifikasi peringatan berhasil dikirim ke ${successCount} admin.`
          : 'Gagal mengirim notifikasi peringatan.',
      data: { message, successCount },
    };
  }

  async getNotificationsData(): Promise<{
    sewasAktif: SewaWithRemainingTime[];
    tenantsCount: number;
    settings: WhatsAppConfig;
  }> {
    const [sewasAktif, tenantsCount, settings] = await Promise.all([
      this.prisma.sewa.findMany({
        where: { status: this.STATUS.AKTIF },
        include: {
          penyewa: {
            select: { id: true, nama: true, no_whatsapp: true },
          },
          motor: {
            select: { id: true, plat_nomor: true, merk: true, model: true },
          },
        },
      }),
      this.prisma.penyewa.count({
        where: { no_whatsapp: { not: null } },
      }),
      this.getSettings(),
    ]);

    const sewasWithRemainingTime = sewasAktif.map((sewa) => {
      const tglKembali = moment(sewa.tgl_kembali);
      const now = moment();
      const diff = moment.duration(tglKembali.diff(now));

      const sisaWaktu = {
        status:
          diff.asMilliseconds() >= 0
            ? SisaWaktuStatus.NORMAL
            : SisaWaktuStatus.LEWAT,
        hari: Math.abs(Math.floor(diff.asDays())),
        jam: Math.abs(diff.hours()),
        menit: Math.abs(diff.minutes()),
        totalMenit: Math.abs(diff.asMinutes()),
      };

      return { ...sewa, sisa_waktu: sisaWaktu };
    });

    sewasWithRemainingTime.sort(
      (a, b) => a.sisa_waktu.totalMenit - b.sisa_waktu.totalMenit,
    );

    return {
      sewasAktif: sewasWithRemainingTime,
      tenantsCount,
      settings,
    };
  }

  async getNotificationHistory() {
    const notifications = await this.prisma.whatsAppNotification.findMany({
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return notifications.map((notif) => ({
      id: notif.id,
      target: notif.target,
      type: notif.type,
      status: notif.status,
      message:
        notif.message.substring(0, 100) +
        (notif.message.length > 100 ? '...' : ''),
      response: notif.response,
      created_at: notif.created_at,
    }));
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
        this.templateService.getDefaultTemplates().reminder,
      alert_template:
        result.alert_template ||
        this.templateService.getDefaultTemplates().alert,
      auto_notifications: result.auto_notifications || 'true',
    };
  }
}

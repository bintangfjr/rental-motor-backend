import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FonnteApiService } from './fonnte-api.service';
import { NotificationService } from './notification.service';
import { SchedulerService } from './scheduler.service';
import { TemplateService } from './template.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { TestConnectionDto } from './dto/test-connection.dto';
import {
  WhatsAppConfig,
  NotificationResult,
  TestConnectionResult,
} from './interfaces/whatsapp.interface';

@Injectable()
export class WhatsAppService {
  private readonly notificationsEnabled = false; // ✅ NONAKTIFKAN NOTIFIKASI

  constructor(
    private prisma: PrismaService,
    private fonnteApi: FonnteApiService,
    private notificationService: NotificationService,
    private schedulerService: SchedulerService,
    private templateService: TemplateService,
  ) {}

  async getNotificationsData() {
    return await this.notificationService.getNotificationsData();
  }

  async sendReminder(sewaId: number): Promise<NotificationResult> {
    const settings = await this.getSettings();
    return await this.notificationService.sendReminder(sewaId, settings);
  }

  async sendAlert(sewaId: number): Promise<NotificationResult> {
    const settings = await this.getSettings();
    return await this.notificationService.sendAlert(sewaId, settings);
  }

  async getSettings(): Promise<WhatsAppConfig> {
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

  async updateSettings(updateSettingsDto: UpdateSettingsDto) {
    const {
      api_key,
      fonnte_number,
      admin_numbers,
      reminder_template,
      alert_template,
      auto_notifications,
    } = updateSettingsDto;

    if (api_key) {
      await this.upsertSetting(
        'whatsapp_api_key',
        api_key,
        'string',
        'whatsapp',
        'API Key untuk Fonnte WhatsApp',
        false,
      );
    }

    if (fonnte_number) {
      await this.upsertSetting(
        'whatsapp_fonnte_number',
        fonnte_number,
        'string',
        'whatsapp',
        'Nomor Fonnte untuk mengirim WhatsApp',
        false,
      );
    }

    if (admin_numbers) {
      await this.upsertSetting(
        'whatsapp_admin_numbers',
        admin_numbers,
        'string',
        'whatsapp',
        'Nomor admin untuk menerima notifikasi',
        false,
      );
    }

    await this.upsertSetting(
      'reminder_template',
      reminder_template || this.templateService.getDefaultTemplates().reminder,
      'text',
      'notification',
      'Template pesan pengingat jatuh tempo',
      true,
    );

    await this.upsertSetting(
      'alert_template',
      alert_template || this.templateService.getDefaultTemplates().alert,
      'text',
      'notification',
      'Template pesan peringatan admin',
      true,
    );

    await this.upsertSetting(
      'auto_notifications',
      auto_notifications !== undefined ? auto_notifications.toString() : 'true',
      'boolean',
      'notification',
      'Aktifkan notifikasi otomatis',
      false,
    );
  }

  async testConnection(
    testConnectionDto: TestConnectionDto,
  ): Promise<TestConnectionResult> {
    const { api_key, fonnte_number } = testConnectionDto;

    const actualApiKey = api_key || process.env.WHATSAPP_API_KEY;
    const actualFonnteNumber =
      fonnte_number || process.env.WHATSAPP_FONNTE_NUMBER;

    return await this.fonnteApi.testConnection(
      actualApiKey,
      actualFonnteNumber,
    );
  }

  async triggerAutomaticNotifications() {
    return await this.schedulerService.triggerManualNotifications();
  }

  async getNotificationHistory() {
    return await this.notificationService.getNotificationHistory();
  }

  private async upsertSetting(
    key: string,
    value: string,
    type: string,
    group: string,
    description: string,
    isEncrypted: boolean,
  ) {
    await this.prisma.settings.upsert({
      where: { key },
      update: { value, type, group, description, is_encrypted: isEncrypted },
      create: {
        key,
        value,
        type,
        group,
        description,
        is_encrypted: isEncrypted,
      },
    });
  }
}

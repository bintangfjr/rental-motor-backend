import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { TestConnectionDto } from './dto/test-connection.dto';
import {
  NotificationResult,
  TestConnectionResult,
} from './interfaces/whatsapp.interface';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get('notifications')
  @UseGuards(JwtAuthGuard)
  async getNotifications() {
    try {
      const data = await this.whatsappService.getNotificationsData();
      return { success: true, data };
    } catch {
      throw new HttpException(
        'Failed to fetch notifications data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('reminder/:sewaId')
  @UseGuards(JwtAuthGuard)
  async sendReminder(@Param('sewaId') sewaId: string) {
    try {
      const result: NotificationResult =
        await this.whatsappService.sendReminder(+sewaId);
      return {
        success: result.success,
        message: result.message,
        data: result.data,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send reminder';
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('alert/:sewaId')
  @UseGuards(JwtAuthGuard)
  async sendAlert(@Param('sewaId') sewaId: string) {
    try {
      const result: NotificationResult =
        await this.whatsappService.sendAlert(+sewaId);
      return {
        success: result.success,
        message: result.message,
        data: result.data,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send alert';
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('settings')
  @UseGuards(JwtAuthGuard)
  async getSettings() {
    try {
      const settings = await this.whatsappService.getSettings();
      return { success: true, data: settings };
    } catch {
      throw new HttpException(
        'Failed to fetch settings',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('settings')
  @UseGuards(JwtAuthGuard)
  async updateSettings(@Body() updateSettingsDto: UpdateSettingsDto) {
    try {
      await this.whatsappService.updateSettings(updateSettingsDto);
      return { success: true, message: 'Pengaturan berhasil diperbarui.' };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update settings';
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('test-connection')
  @UseGuards(JwtAuthGuard)
  async testConnection(@Body() testConnectionDto: TestConnectionDto) {
    try {
      const result: TestConnectionResult =
        await this.whatsappService.testConnection(testConnectionDto);
      return {
        success: result.success,
        message: result.message,
        data: result.data,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to test connection';
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('trigger-automatic-notifications')
  @UseGuards(JwtAuthGuard)
  async triggerAutomaticNotifications() {
    try {
      await this.whatsappService.triggerAutomaticNotifications();
      return {
        success: true,
        message: 'Notifikasi otomatis berhasil dijalankan',
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Gagal menjalankan notifikasi otomatis';
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('automatic-notifications-status')
  @UseGuards(JwtAuthGuard)
  async getAutomaticNotificationsStatus() {
    try {
      const settings = await this.whatsappService.getSettings();
      const status = settings.auto_notifications === 'true';

      return {
        success: true,
        data: {
          enabled: status,
          nextRun: 'Setiap 1 jam sekali',
          description:
            'Sistem akan memeriksa dan mengirim notifikasi otomatis setiap 1 jam',
        },
      };
    } catch {
      throw new HttpException(
        'Failed to fetch automatic notifications status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('notification-history')
  @UseGuards(JwtAuthGuard)
  async getNotificationHistory() {
    try {
      const history = await this.whatsappService.getNotificationHistory();
      return { success: true, data: history };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get history';
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

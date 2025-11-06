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
  ParseIntPipe,
} from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { TestConnectionDto } from './dto/test-connection.dto';
import {
  NotificationResult,
  TestConnectionResult,
} from './interfaces/whatsapp.interface';

// ✅ DEFINE RESPONSE INTERFACES
interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

interface NotificationStatus {
  enabled: boolean;
  nextRun: string;
  description: string;
}

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get('notifications')
  @UseGuards(JwtAuthGuard)
  async getNotifications(): Promise<ApiResponse> {
    try {
      const data = await this.whatsappService.getNotificationsData();
      return {
        success: true,
        message: 'Data notifikasi berhasil diambil',
        data,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to fetch notifications data';

      this.logError('getNotifications', errorMessage);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('reminder/:sewaId')
  @UseGuards(JwtAuthGuard)
  async sendReminder(
    @Param('sewaId', ParseIntPipe) sewaId: number,
  ): Promise<ApiResponse> {
    try {
      const result: NotificationResult =
        await this.whatsappService.sendReminder(sewaId);

      return {
        success: result.success,
        message: result.message,
        data: result.data,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send reminder';

      this.logError('sendReminder', errorMessage, sewaId);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('alert/:sewaId')
  @UseGuards(JwtAuthGuard)
  async sendAlert(
    @Param('sewaId', ParseIntPipe) sewaId: number,
  ): Promise<ApiResponse> {
    try {
      const result: NotificationResult =
        await this.whatsappService.sendAlert(sewaId);

      return {
        success: result.success,
        message: result.message,
        data: result.data,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send alert';

      this.logError('sendAlert', errorMessage, sewaId);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('settings')
  @UseGuards(JwtAuthGuard)
  async getSettings(): Promise<ApiResponse> {
    try {
      const settings = await this.whatsappService.getSettings();
      return {
        success: true,
        message: 'Pengaturan berhasil diambil',
        data: settings,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch settings';

      this.logError('getSettings', errorMessage);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('settings')
  @UseGuards(JwtAuthGuard)
  async updateSettings(
    @Body() updateSettingsDto: UpdateSettingsDto,
  ): Promise<ApiResponse> {
    try {
      await this.whatsappService.updateSettings(updateSettingsDto);
      return {
        success: true,
        message: 'Pengaturan berhasil diperbarui.',
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update settings';

      this.logError('updateSettings', errorMessage);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('test-connection')
  @UseGuards(JwtAuthGuard)
  async testConnection(
    @Body() testConnectionDto: TestConnectionDto,
  ): Promise<ApiResponse> {
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

      this.logError('testConnection', errorMessage);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('trigger-automatic-notifications')
  @UseGuards(JwtAuthGuard)
  async triggerAutomaticNotifications(): Promise<ApiResponse> {
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

      this.logError('triggerAutomaticNotifications', errorMessage);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('automatic-notifications-status')
  @UseGuards(JwtAuthGuard)
  async getAutomaticNotificationsStatus(): Promise<
    ApiResponse<NotificationStatus>
  > {
    try {
      const settings = await this.whatsappService.getSettings();
      const status = settings.auto_notifications === 'true';

      const statusData: NotificationStatus = {
        enabled: status,
        nextRun: 'Setiap menit sekali',
        description:
          'Sistem akan memeriksa dan mengirim notifikasi otomatis setiap menit',
      };

      return {
        success: true,
        message: 'Status notifikasi otomatis berhasil diambil',
        data: statusData,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to fetch automatic notifications status';

      this.logError('getAutomaticNotificationsStatus', errorMessage);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('notification-history')
  @UseGuards(JwtAuthGuard)
  async getNotificationHistory(): Promise<ApiResponse> {
    try {
      const history = await this.whatsappService.getNotificationHistory();
      return {
        success: true,
        message: 'Riwayat notifikasi berhasil diambil',
        data: history,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get history';

      this.logError('getNotificationHistory', errorMessage);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ✅ PRIVATE HELPER METHOD untuk consistent logging
  private logError(method: string, error: string, sewaId?: number): void {
    const context = sewaId ? `Sewa ID: ${sewaId}` : '';
    console.error(
      `[WhatsAppController.${method}] ${context} - Error: ${error}`,
    );
  }
}

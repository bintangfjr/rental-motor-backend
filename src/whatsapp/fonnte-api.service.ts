import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { TestConnectionResult } from './interfaces/whatsapp.interface';

@Injectable()
export class FonnteApiService {
  private readonly logger = new Logger(FonnteApiService.name);

  constructor(private httpService: HttpService) {}

  async sendMessage(
    apiKey: string,
    target: string,
    message: string,
  ): Promise<boolean> {
    if (!apiKey) {
      throw new BadRequestException('API Key tidak dikonfigurasi dengan benar');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.fonnte.com/send',
          {
            target,
            message,
            countryCode: '62',
          },
          {
            headers: {
              Authorization: apiKey,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          },
        ),
      );

      const responseData = response.data as { status: boolean };
      return responseData.status === true;
    } catch (error: unknown) {
      this.logger.error('WhatsApp send error:', this.getErrorMessage(error));
      return false;
    }
  }

  async testConnection(
    apiKey: string,
    fonnteNumber: string,
  ): Promise<TestConnectionResult> {
    if (!apiKey || !fonnteNumber) {
      throw new BadRequestException('API Key dan nomor Fonnte harus diisi');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.fonnte.com/validate',
          {
            target: fonnteNumber,
            message: 'Test connection from rental system',
          },
          {
            headers: {
              Authorization: apiKey,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          },
        ),
      );

      const responseData = response.data as {
        status: boolean;
        reason?: string;
      };

      return {
        success: responseData.status === true,
        data: response.data,
        message: responseData.status
          ? 'Koneksi berhasil! API Key dan nomor Fonnte valid.'
          : `Koneksi gagal: ${responseData.reason || 'Unknown error'}`,
      };
    } catch (error: unknown) {
      return {
        success: false,
        data: null,
        message: `Error: ${this.getErrorMessage(error)}`,
      };
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    const errorObj = error as {
      response?: {
        data?: {
          message?: string;
          reason?: string;
        };
      };
      message?: string;
    };

    return (
      errorObj.response?.data?.message ||
      errorObj.response?.data?.reason ||
      errorObj.message ||
      'Unknown error occurred'
    );
  }
}

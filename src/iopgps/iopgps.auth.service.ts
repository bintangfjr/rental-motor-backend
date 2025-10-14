// src/iopgps/iopgps.auth.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { IOPGPS_CONSTANTS, CACHE_TTL } from './iopgps.constants';
import { IopgpsAuthResponse } from './interfaces/responses.interface';

// Interface untuk axios error response
interface IopgpsErrorResponse {
  code: number;
  result: string;
}

// Interface untuk HTTP error
interface HttpError {
  response?: {
    status: number;
    statusText: string;
    data?: unknown;
  };
  message: string;
  code?: string;
  config?: unknown;
}

@Injectable()
export class IopgpsAuthService {
  private readonly logger = new Logger(IopgpsAuthService.name);
  private readonly appid: string;
  private readonly secretKey: string;
  private tokenRefreshInProgress = false;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.appid = this.configService.get<string>('IOPGPS_APPID') || '';
    this.secretKey = this.configService.get<string>('IOPGPS_SECRET_KEY') || '';

    if (!this.appid || !this.secretKey) {
      this.logger.warn(
        'IOPGPS_APPID or IOPGPS_SECRET_KEY not found in environment variables',
      );
    }
  }

  /**
   * Generate signature sesuai algoritma IOPGPS
   */
  private generateSignature(time: number): string {
    if (!this.secretKey) {
      throw new Error('IOPGPS_SECRET_KEY is not configured');
    }

    const firstHash = crypto
      .createHash('md5')
      .update(this.secretKey)
      .digest('hex');
    return crypto
      .createHash('md5')
      .update(firstHash + time)
      .digest('hex');
  }

  /**
   * Extract error message safely
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error occurred';
  }

  /**
   * Type guard untuk HTTP error
   */
  private isHttpError(error: unknown): error is HttpError {
    const httpError = error as HttpError;
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in httpError &&
      typeof httpError.message === 'string'
    );
  }

  /**
   * Type guard untuk IOPGPS auth response
   */
  private isIopgpsAuthResponse(data: unknown): data is IopgpsAuthResponse {
    return (
      typeof data === 'object' &&
      data !== null &&
      'code' in data &&
      typeof (data as IopgpsAuthResponse).code === 'number'
    );
  }

  /**
   * Type guard untuk IOPGPS error response
   */
  private isIopgpsErrorResponse(data: unknown): data is IopgpsErrorResponse {
    return (
      typeof data === 'object' &&
      data !== null &&
      'code' in data &&
      'result' in data &&
      typeof (data as IopgpsErrorResponse).code === 'number' &&
      typeof (data as IopgpsErrorResponse).result === 'string'
    );
  }

  /**
   * Generate new access token dengan retry mechanism
   */
  private async generateNewAccessToken(): Promise<string> {
    if (this.tokenRefreshInProgress) {
      this.logger.debug('Token refresh already in progress, waiting...');

      // Tunggu sampai refresh selesai (max 5 detik)
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const cachedToken = await this.cacheManager.get<string>(
          'iopgps_access_token',
        );
        if (cachedToken) {
          this.logger.debug('Token refresh completed by another process');
          return cachedToken;
        }
      }
      this.logger.warn('Token refresh timeout, proceeding with new request');
    }

    this.tokenRefreshInProgress = true;

    try {
      // Validasi configuration
      if (!this.appid || !this.secretKey) {
        throw new Error('IOPGPS credentials not configured properly');
      }

      const time = Math.floor(Date.now() / 1000);
      const authData = {
        appid: this.appid,
        time: time,
        signature: this.generateSignature(time),
      };

      this.logger.debug('Generating new access token from IOPGPS API');

      // Gunakan approach yang lebih sederhana tanpa complex types
      const response = await firstValueFrom(
        this.httpService.post(
          `${IOPGPS_CONSTANTS.BASE_URL}${IOPGPS_CONSTANTS.AUTH_ENDPOINT}`,
          authData,
          {
            timeout: IOPGPS_CONSTANTS.TIMEOUT,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const responseData = response.data;

      // Validasi response structure dengan type guard
      if (!this.isIopgpsAuthResponse(responseData)) {
        throw new Error('Invalid response format from IOPGPS API');
      }

      if (responseData.code === 0 && responseData.accessToken) {
        const accessToken = responseData.accessToken;

        // Simpan token dengan TTL lebih pendek dari expiry time
        const tokenTtl = responseData.expiresIn
          ? Math.min(responseData.expiresIn - 300, CACHE_TTL.ACCESS_TOKEN) // 5 menit sebelum expiry
          : CACHE_TTL.ACCESS_TOKEN;

        await this.cacheManager.set(
          'iopgps_access_token',
          accessToken,
          tokenTtl,
        );

        this.logger.log(
          `New access token generated and cached for ${tokenTtl / 1000 / 60} minutes`,
        );
        return accessToken;
      } else {
        const errorMessage =
          responseData.result ||
          'Authentication failed without specific reason';
        throw new Error(`IOPGPS authentication failed: ${errorMessage}`);
      }
    } catch (error: unknown) {
      let detailedErrorMessage = this.getErrorMessage(error);

      // Handle HTTP error dengan type safety
      if (this.isHttpError(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data;

        if (errorData && this.isIopgpsErrorResponse(errorData)) {
          detailedErrorMessage = `HTTP ${status}: ${errorData.result}`;
        } else if (
          errorData &&
          typeof errorData === 'object' &&
          'result' in errorData
        ) {
          detailedErrorMessage = `HTTP ${status}: ${String(errorData.result)}`;
        } else {
          detailedErrorMessage = `HTTP ${status}: ${error.message}`;
        }

        this.logger.error(`IOPGPS API Error: ${detailedErrorMessage}`);
      } else {
        this.logger.error(
          `Failed to generate new access token: ${detailedErrorMessage}`,
        );
      }

      throw new Error(
        `Failed to authenticate with IOPGPS: ${detailedErrorMessage}`,
      );
    } finally {
      this.tokenRefreshInProgress = false;
    }
  }

  /**
   * Get access token dengan auto-refresh
   */
  async getAccessToken(): Promise<string> {
    try {
      // Cek cache dulu
      const cachedToken = await this.cacheManager.get<string>(
        'iopgps_access_token',
      );

      if (cachedToken) {
        this.logger.debug('Using cached access token');
        return cachedToken;
      }

      // Generate token baru
      return await this.generateNewAccessToken();
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Failed to get access token', errorMessage);
      throw error;
    }
  }

  /**
   * Force refresh token (untuk manual refresh)
   */
  async refreshAccessToken(): Promise<string> {
    try {
      this.logger.debug('Manually refreshing access token');
      await this.cacheManager.del('iopgps_access_token');
      return await this.generateNewAccessToken();
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Failed to refresh access token', errorMessage);
      throw new Error(`Token refresh failed: ${errorMessage}`);
    }
  }

  /**
   * Check token validity
   */
  async isTokenValid(): Promise<boolean> {
    try {
      const token = await this.cacheManager.get<string>('iopgps_access_token');
      return !!token;
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.warn('Error checking token validity', errorMessage);
      return false;
    }
  }

  /**
   * Get token info untuk debugging
   */
  async getTokenInfo(): Promise<{
    hasToken: boolean;
    refreshInProgress: boolean;
    appidConfigured: boolean;
    secretKeyConfigured: boolean;
  }> {
    const token = await this.cacheManager.get<string>('iopgps_access_token');

    return {
      hasToken: !!token,
      refreshInProgress: this.tokenRefreshInProgress,
      appidConfigured: !!this.appid,
      secretKeyConfigured: !!this.secretKey,
    };
  }

  /**
   * Clear token cache (untuk testing atau reset)
   */
  async clearTokenCache(): Promise<void> {
    try {
      await this.cacheManager.del('iopgps_access_token');
      this.logger.debug('Token cache cleared');
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Failed to clear token cache', errorMessage);
      throw new Error(`Failed to clear token cache: ${errorMessage}`);
    }
  }

  /**
   * Validate credentials configuration
   */
  validateConfiguration(): { isValid: boolean; missing: string[] } {
    const missing: string[] = [];

    if (!this.appid) missing.push('IOPGPS_APPID');
    if (!this.secretKey) missing.push('IOPGPS_SECRET_KEY');

    return {
      isValid: missing.length === 0,
      missing,
    };
  }
}

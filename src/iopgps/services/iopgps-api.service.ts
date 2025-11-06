// src/iopgps/services/iopgps-api.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { IopgpsAuthService } from '../iopgps.auth.service';
import { TokenManagerService } from './token-manager.service';
import { IOPGPS_CONSTANTS, CACHE_TTL } from '../iopgps.constants';
import {
  VehicleStatusResponse,
  DeviceLocationResponse,
  DeviceListResponse,
  MileageResponse,
  BaseIopgpsResponse,
  VehicleStatus,
} from '../interfaces/responses.interface';
import { DeviceListDto } from '../dto/device-list.dto';

// Type-safe error interface
interface IopgpsError {
  message: string;
  status?: number;
  code?: string;
  response?: {
    status: number;
    data?: unknown;
  };
}

// Type-safe auth request data
interface AuthRequestData {
  appid: string;
  time: number;
  signature: string;
}

// Type-safe token manager status
interface TokenManagerStatus {
  token: any;
  queue: { queueLength: number; isProcessing: boolean };
  systemStatus: string;
  error?: string;
}

// Type-safe health check response
interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
}

@Injectable()
export class IopgpsApiService {
  private readonly logger = new Logger(IopgpsApiService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly authService: IopgpsAuthService,
    private readonly tokenManager: TokenManagerService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Extract error message safely dengan type guard
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
   * Check if error is unauthorized (401) dengan type guard
   */
  private isUnauthorizedError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'response' in error) {
      const err = error as IopgpsError;
      return err.response?.status === 401;
    }
    return false;
  }

  /**
   * Make authenticated request dengan token manager dan improved retry mechanism
   */
  private async makeAuthenticatedRequest<T = BaseIopgpsResponse>(
    url: string,
    params?: Record<string, string>,
    retries: number = IOPGPS_CONSTANTS.MAX_RETRIES,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // GUNAKAN TOKEN MANAGER
        const accessToken = await this.tokenManager.getToken();

        const response = await firstValueFrom(
          this.httpService.get<T>(url, {
            params,
            headers: {
              accessToken,
            },
            timeout: 8000,
          }),
        );

        return response.data;
      } catch (error: unknown) {
        const errorMessage = this.getErrorMessage(error);
        lastError = error instanceof Error ? error : new Error(errorMessage);

        // Handle different error types
        if (errorMessage.includes('Rate limit exceeded')) {
          this.logger.warn(
            `Rate limit hit on attempt ${attempt}. Token manager should handle this.`,
          );

          if (attempt === retries) {
            break;
          }

          // Tunggu lebih lama untuk rate limit errors
          const rateLimitDelay = 30000;
          await new Promise((resolve) => setTimeout(resolve, rateLimitDelay));
          continue;
        }

        this.logger.warn(
          `Request attempt ${attempt}/${retries} failed: ${errorMessage}`,
        );

        if (attempt === retries) {
          break;
        }

        // Jika unauthorized, clear token cache dan coba lagi
        if (this.isUnauthorizedError(error)) {
          this.logger.debug('Token might be expired, clearing cache...');
          this.tokenManager.clearCache();

          // Coba refresh token
          try {
            await this.authService.refreshAccessToken();
          } catch {
            this.logger.warn('Token refresh failed during retry');
            // Tidak perlu handle error lebih lanjut
          }
        }

        // Exponential backoff untuk error lainnya
        const delay = IOPGPS_CONSTANTS.RETRY_DELAY * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  /**
   * Get vehicle status dari IOPGPS dengan cache - TYPE SAFE
   */
  async getVehicleStatus(
    licenseNumber?: string,
    vin?: string,
    forceRefresh: boolean = false,
  ): Promise<VehicleStatus[]> {
    const cacheKey = `vehicle_status_${licenseNumber || 'all'}_${vin || 'none'}`;

    // Cek cache dulu kecuali force refresh
    if (!forceRefresh) {
      const cached = await this.cacheManager.get<VehicleStatus[]>(cacheKey);
      if (cached) {
        this.logger.debug('Returning cached vehicle status');
        return cached;
      }
    }

    try {
      const params: Record<string, string> = {};
      if (licenseNumber) params.licenseNumber = licenseNumber;
      if (vin) params.vin = vin;

      const data = await this.makeAuthenticatedRequest<VehicleStatusResponse>(
        `${IOPGPS_CONSTANTS.BASE_URL}${IOPGPS_CONSTANTS.VEHICLE_STATUS}`,
        params,
      );

      const result = data.data || [];

      // Cache hasil dengan TTL dari constants
      await this.cacheManager.set(cacheKey, result, CACHE_TTL.VEHICLE_STATUS);

      return result;
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        'Failed to get vehicle status from IOPGPS',
        errorMessage,
      );
      throw error;
    }
  }

  /**
   * Get device location dengan fallback dan timeout - TYPE SAFE
   */
  async getDeviceLocation(
    imei: string,
    useCache: boolean = true,
  ): Promise<DeviceLocationResponse> {
    const cacheKey = `device_location_${imei}`;

    // Cek cache dulu
    if (useCache) {
      const cached =
        await this.cacheManager.get<DeviceLocationResponse>(cacheKey);
      if (cached) {
        this.logger.debug(`Returning cached location for IMEI: ${imei}`);
        return cached;
      }
    }

    try {
      // Gunakan Promise.race dengan timeout
      const data = await Promise.race([
        this.makeAuthenticatedRequest<DeviceLocationResponse>(
          `${IOPGPS_CONSTANTS.BASE_URL}${IOPGPS_CONSTANTS.DEVICE_LOCATION}`,
          { imei },
        ),
        new Promise<DeviceLocationResponse>((_, reject) =>
          setTimeout(() => reject(new Error('IOPGPS API timeout')), 6000),
        ),
      ]);

      // Simpan ke cache hanya jika successful
      if (data.code === 0) {
        await this.cacheManager.set(cacheKey, data, CACHE_TTL.LOCATION_DATA);
        this.logger.debug(`Location cached for IMEI: ${imei}`);
      }

      return data;
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.warn(
        `Failed to get device location for IMEI: ${imei}`,
        errorMessage,
      );
      throw error;
    }
  }

  /**
   * Get device list dari IOPGPS API - TYPE SAFE
   */
  async getDeviceList(query: DeviceListDto): Promise<DeviceListResponse> {
    try {
      const params: Record<string, string> = {
        currentPage: query.currentPage || '1',
        pageSize: query.pageSize || '20',
      };

      if (query.id) params.id = query.id;

      const data = await this.makeAuthenticatedRequest<DeviceListResponse>(
        `${IOPGPS_CONSTANTS.BASE_URL}${IOPGPS_CONSTANTS.DEVICE_LIST}`,
        params,
      );

      return data;
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Failed to get device list', errorMessage);
      throw error;
    }
  }

  /**
   * Get device mileage dari IOPGPS dengan parameter string - TYPE SAFE
   */
  async getDeviceMileage(
    imei: string,
    startTime: string,
    endTime?: string,
  ): Promise<MileageResponse> {
    try {
      const params: Record<string, string> = {
        imei,
        startTime,
        endTime: endTime || Math.floor(Date.now() / 1000).toString(),
      };

      const data = await this.makeAuthenticatedRequest<MileageResponse>(
        `${IOPGPS_CONSTANTS.BASE_URL}${IOPGPS_CONSTANTS.DEVICE_MILES}`,
        params,
      );

      return data;
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `Failed to get mileage for IMEI: ${imei}`,
        errorMessage,
      );
      throw new Error(`Failed to get mileage: ${errorMessage}`);
    }
  }

  /**
   * Test auth request untuk debugging - TYPE SAFE
   */
  async testAuthRequest(
    authData: AuthRequestData,
  ): Promise<BaseIopgpsResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<BaseIopgpsResponse>(
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
      return response.data;
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Test auth request failed', errorMessage);
      throw new Error(`Test auth failed: ${errorMessage}`);
    }
  }

  /**
   * Get token manager status untuk monitoring - TYPE SAFE
   */
  async getTokenManagerStatus(): Promise<TokenManagerStatus> {
    try {
      const tokenInfo = await this.authService.getTokenInfo();
      const queueStatus = this.tokenManager.getQueueStatus();

      return {
        token: tokenInfo,
        queue: queueStatus,
        systemStatus:
          queueStatus.queueLength > 0 ? 'MANAGING_RATE_LIMIT' : 'NORMAL',
      };
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      return {
        token: null,
        queue: { queueLength: 0, isProcessing: false },
        systemStatus: 'ERROR',
        error: errorMessage,
      };
    }
  }

  /**
   * Health check untuk API connectivity - TYPE SAFE
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const startTime = Date.now();

    try {
      // Test dengan request sederhana
      await this.makeAuthenticatedRequest(
        `${IOPGPS_CONSTANTS.BASE_URL}${IOPGPS_CONSTANTS.DEVICE_LOCATION}`,
        { imei: 'test_health_check' },
      );

      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime,
      };
    } catch (error: unknown) {
      const responseTime = Date.now() - startTime;

      // Jika error adalah 401, API masih accessible tapi token invalid
      if (this.isUnauthorizedError(error)) {
        return {
          status: 'degraded',
          responseTime,
        };
      }

      return {
        status: 'unhealthy',
        responseTime,
      };
    }
  }
}

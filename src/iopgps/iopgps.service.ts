// src/iopgps/iopgps.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { IopgpsAuthService } from './iopgps.auth.service';
import { IopgpsApiService } from './services/iopgps-api.service';
import { IopgpsSyncService } from './services/iopgps-sync.service';
import { IopgpsCacheService } from './services/iopgps-cache.service';
import { MotorLocationService } from './services/motor-location.service';
import { IopgpsHealthService } from './services/iopgps-health.service';
import { IopgpsEventsService } from '../websocket/services/iopgps-events.service';
import {
  VehicleStatus,
  DeviceLocationResponse,
  MileageResponse,
  MotorWithLocationStatus,
  IopgpsHealthStatus,
  SyncOperationResult,
  TokenInfo,
  DeviceListResponse,
} from './interfaces/responses.interface';
import { DeviceListDto } from './dto/device-list.dto';

// Type-safe auth request data
interface AuthRequestData {
  appid: string;
  time: number;
  signature: string;
}

// Type-safe system status response
interface SystemStatusResponse {
  tokenStatus: TokenInfo;
  rateLimitInfo: {
    message: string;
    lastAuthCall: string;
  };
  cacheStatus: {
    size: number;
    keys: string[];
  };
}

// Type-safe debug response
interface QuickDebugResponse {
  token: {
    hasToken: boolean;
    preview: string;
    info: TokenInfo;
  };
  credentials: {
    appid: string;
    secretKey: string;
  };
  services: {
    auth: string;
    api: string;
    sync: string;
    cache: string;
    health: string;
  };
  timestamp: Date;
  error?: string;
}

@Injectable()
export class IopgpsService {
  private readonly logger = new Logger(IopgpsService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authService: IopgpsAuthService,
    private readonly apiService: IopgpsApiService,
    private readonly syncService: IopgpsSyncService,
    private readonly cacheService: IopgpsCacheService,
    private readonly motorLocationService: MotorLocationService,
    private readonly healthService: IopgpsHealthService,
    private readonly iopgpsEventsService: IopgpsEventsService, // <-- Inject events service
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  // ========== NEW METHODS FOR CONTROLLER ==========

  /**
   * Reset rate limit counter - TYPE SAFE VERSION (tanpa extended interface)
   */
  async resetRateLimit(): Promise<void> {
    const resetFn = (
      this.authService as unknown as {
        resetRateLimit?: () => unknown;
      }
    ).resetRateLimit;

    if (typeof resetFn === 'function') {
      // Pastikan hasilnya selalu aman di-await meski bukan Promise
      await Promise.resolve(resetFn.call(this.authService));
      this.logger.log('Rate limit reset via resetRateLimit()');
    } else {
      // Fallback jika method tidak tersedia
      await this.authService.clearTokenCache();
      this.logger.log('Rate limit reset via token cache clearance');
    }
  }

  /**
   * Get system status untuk debugging
   */
  async getSystemStatus(): Promise<SystemStatusResponse> {
    try {
      const [tokenInfo, cacheStats] = await Promise.all([
        this.authService.getTokenInfo(),
        this.cacheService.getCacheStats(),
      ]);

      return {
        tokenStatus: tokenInfo,
        rateLimitInfo: {
          message: 'Rate limit service integrated',
          lastAuthCall: 'Check tokenInfo for details',
        },
        cacheStatus: cacheStats,
      };
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Failed to get system status', errorMessage);

      return {
        tokenStatus: {
          hasToken: false,
          refreshInProgress: false,
          appidConfigured: false,
          secretKeyConfigured: false,
        },
        rateLimitInfo: {
          message: 'Failed to get rate limit info',
          lastAuthCall: 'Unknown',
        },
        cacheStatus: {
          size: 0,
          keys: [],
        },
      };
    }
  }

  /**
   * Quick debug info
   */
  async quickDebug(): Promise<QuickDebugResponse> {
    try {
      const tokenInfo = await this.authService.getTokenInfo();
      const hasToken = await this.cacheManager.get<string>(
        'iopgps_access_token',
      );

      const appid = this.configService.get<string>('IOPGPS_APPID');
      const secretKey = this.configService.get<string>('IOPGPS_SECRET_KEY');

      return {
        token: {
          hasToken: !!hasToken,
          preview: hasToken ? `${hasToken.substring(0, 10)}...` : 'No token',
          info: tokenInfo,
        },
        credentials: {
          appid: appid ? 'SET' : 'MISSING',
          secretKey: secretKey ? 'SET' : 'MISSING',
        },
        services: {
          auth: 'Available',
          api: 'Available',
          sync: 'Available',
          cache: 'Available',
          health: 'Available',
        },
        timestamp: new Date(),
      };
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Quick debug failed', errorMessage);

      return {
        token: {
          hasToken: false,
          preview: 'No token',
          info: {
            hasToken: false,
            refreshInProgress: false,
            appidConfigured: false,
            secretKeyConfigured: false,
          },
        },
        credentials: {
          appid: 'MISSING',
          secretKey: 'MISSING',
        },
        services: {
          auth: 'Error',
          api: 'Error',
          sync: 'Error',
          cache: 'Error',
          health: 'Error',
        },
        timestamp: new Date(),
        error: errorMessage,
      };
    }
  }

  // ========== EXISTING DEBUG METHODS ==========

  async debugAuth(): Promise<unknown> {
    return await this.authService.debugAuth();
  }

  async setManualToken(token: string): Promise<void> {
    await this.authService.setManualToken(token);
  }

  async testAuthRequest(authData: AuthRequestData): Promise<unknown> {
    return await this.apiService.testAuthRequest(authData);
  }

  async debugConfig(): Promise<unknown> {
    return await this.authService.debugAuth();
  }

  async clearTokenCache(): Promise<void> {
    await this.authService.clearTokenCache();
  }

  // ========== EXISTING API METHODS ==========

  async getVehicleStatus(
    licenseNumber?: string,
    vin?: string,
  ): Promise<VehicleStatus[]> {
    return this.apiService.getVehicleStatus(licenseNumber, vin);
  }

  async getDeviceLocation(imei: string): Promise<DeviceLocationResponse> {
    return this.apiService.getDeviceLocation(imei);
  }

  async getDeviceList(query: DeviceListDto): Promise<DeviceListResponse> {
    return this.apiService.getDeviceList(query);
  }

  async getDeviceMileage(
    imei: string,
    startTime: string,
    endTime?: string,
  ): Promise<MileageResponse> {
    return this.apiService.getDeviceMileage(imei, startTime, endTime);
  }

  // ========== EXISTING SYNC & LOCATION METHODS ==========

  async syncMotorLocations(): Promise<SyncOperationResult> {
    return this.syncService.syncMotorLocations();
  }

  async updateMotorLocationManually(
    motorId: number,
    lat: number,
    lng: number,
  ): Promise<void> {
    await this.syncService.updateMotorLocationManually(motorId, lat, lng);

    // Event sudah di-emit dari sync service
  }

  async getMotorsWithLocationStatus(): Promise<MotorWithLocationStatus[]> {
    return this.motorLocationService.getMotorsWithLocationStatus();
  }

  async getMotorWithRealTimeLocation(
    motorId: number,
  ): Promise<MotorWithLocationStatus | null> {
    return this.motorLocationService.getMotorWithRealTimeLocation(motorId);
  }

  // ========== EXISTING HEALTH & MONITORING METHODS ==========

  async healthCheck(): Promise<IopgpsHealthStatus> {
    return this.healthService.healthCheck();
  }

  async getTokenInfo(): Promise<TokenInfo> {
    return await this.authService.getTokenInfo();
  }

  /**
   * Refresh token dengan WebSocket event
   */
  async refreshToken(): Promise<void> {
    const oldTokenInfo = await this.authService.getTokenInfo();

    await this.authService.refreshAccessToken();

    const newTokenInfo = await this.authService.getTokenInfo();

    // Emit token update
    this.iopgpsEventsService.emitTokenUpdate(
      newTokenInfo.hasToken,
      oldTokenInfo.hasToken !== newTokenInfo.hasToken
        ? 'Token refreshed successfully'
        : 'Token refresh completed',
    );
  }

  // ========== NEW METHODS FOR SYNC STATUS ==========

  /**
   * Get last sync time dari sync service
   */
  getLastSyncTime(): Date | null {
    return this.syncService.getLastSyncTime();
  }

  /**
   * Get current sync cycle info
   */
  getSyncCycleInfo(): { cycle: number; type: 'location' | 'status' } {
    return this.syncService.getSyncCycleInfo();
  }

  /**
   * Get motor count dengan IMEI
   */
  async getMotorCount(): Promise<number> {
    return this.prisma.motor.count({
      where: {
        imei: { not: null },
        status: { in: ['tersedia', 'disewa'] },
      },
    });
  }

  // ========== HELPER METHODS ==========

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

  // ========== ADDITIONAL CONVENIENCE METHODS ==========

  async getMotorStatistics() {
    return this.motorLocationService.getMotorStatistics();
  }

  async getDetailedHealth(): Promise<
    ReturnType<IopgpsHealthService['getDetailedHealth']>
  > {
    return this.healthService.getDetailedHealth();
  }

  async clearAllCache(): Promise<void> {
    await this.cacheService.clearAllCache();
  }
}

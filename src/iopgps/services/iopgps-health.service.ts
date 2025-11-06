// src/iopgps/services/iopgps-health.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { IopgpsAuthService } from '../iopgps.auth.service';
import { IopgpsApiService } from './iopgps-api.service';
import { IopgpsSyncService } from './iopgps-sync.service';
import { MotorLocationService } from './motor-location.service';
import {
  IopgpsHealthStatus,
  TokenInfo,
  DeviceLocationResponse,
} from '../interfaces/responses.interface';

// Type-safe health component details
interface DatabaseHealthDetails {
  totalMotors: number;
  motorsWithImei: number;
  motorsWithRecentData: number;
  connection: string;
  error?: string;
}

interface ApiHealthDetails {
  accessible: boolean;
  responseTime: number | null;
  tokenConfigured: boolean;
  lastResponse?: number;
  error?: string;
}

interface SyncHealthDetails {
  lastSync: Date | null;
  timeSinceLastSync: number | null;
  autoSyncEnabled: boolean;
  syncStatus: string;
  error?: string;
}

interface HealthComponent<T> {
  status: string;
  details: T;
}

interface DetailedHealthResponse {
  overall: IopgpsHealthStatus;
  components: {
    authentication: HealthComponent<TokenInfo>;
    database: HealthComponent<DatabaseHealthDetails>;
    api: HealthComponent<ApiHealthDetails>;
    sync: HealthComponent<SyncHealthDetails>;
  };
}

interface HealthHistoryItem {
  timestamp: Date;
  status: string;
  responseTime: number;
}

@Injectable()
export class IopgpsHealthService {
  private readonly logger = new Logger(IopgpsHealthService.name);

  constructor(
    private readonly authService: IopgpsAuthService,
    private readonly apiService: IopgpsApiService,
    private readonly syncService: IopgpsSyncService,
    private readonly motorLocationService: MotorLocationService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Comprehensive health check
   */
  async healthCheck(): Promise<IopgpsHealthStatus> {
    const startTime = Date.now();

    try {
      const [
        tokenValid,
        databaseConnected,
        motorsCount,
        motorsWithImeiCount,
        apiAccessible,
        lastSyncTime,
        motorStats,
      ] = await Promise.all([
        this.checkTokenHealth(),
        this.checkDatabaseHealth(),
        this.prisma.motor.count(),
        this.prisma.motor.count({ where: { imei: { not: null } } }),
        this.checkApiHealth(),
        // ✅ FIX: Wrap dalam Promise.resolve untuk konsistensi
        Promise.resolve(this.syncService.getLastSyncTime()),
        this.motorLocationService.getMotorStatistics(),
      ]);

      const responseTime = Date.now() - startTime;

      // Determine overall status
      const status = this.determineOverallStatus(
        tokenValid,
        apiAccessible,
        databaseConnected,
      );

      const healthStatus: IopgpsHealthStatus = {
        status,
        tokenValid,
        apiAccessible,
        databaseConnected,
        lastSync: lastSyncTime || undefined,
        connectedDevices: motorsWithImeiCount,
        totalDevices: motorsCount,
        responseTime,
      };

      // ✅ FIX: Use type assertion untuk details
      (healthStatus as IopgpsHealthStatus & { details?: unknown }).details = {
        totalMotors: motorStats.total,
        motorsWithImei: motorStats.withImei,
        motorsWithGps: motorStats.online,
      };

      return healthStatus;
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Health check failed', errorMessage);
      return {
        status: 'unhealthy',
        tokenValid: false,
        apiAccessible: false,
        databaseConnected: false,
        connectedDevices: 0,
        totalDevices: 0,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check token health
   */
  private async checkTokenHealth(): Promise<boolean> {
    try {
      return await this.authService.isTokenValid();
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.warn('Token health check failed', errorMessage);
      return false;
    }
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Database health check failed', errorMessage);
      return false;
    }
  }

  /**
   * Check API health
   */
  private async checkApiHealth(): Promise<boolean> {
    try {
      // Test with a simple API call that should fail gracefully
      const apiResponse = await Promise.race([
        this.apiService.getDeviceLocation('test_imei_health_check', false),
        new Promise<DeviceLocationResponse>((_, reject) =>
          setTimeout(() => reject(new Error('API timeout')), 5000),
        ),
      ]);

      // API call should fail, but we check the response type
      return this.isApiResponseValid(apiResponse);
    } catch (error: unknown) {
      // API call should fail, but we check if it's unauthorized (which means API is accessible)
      return this.isUnauthorizedError(error);
    }
  }

  /**
   * Check if API response is valid (even if it's an error response)
   */
  private isApiResponseValid(response: unknown): boolean {
    return (
      response !== null &&
      typeof response === 'object' &&
      'code' in response &&
      typeof (response as { code: unknown }).code === 'number'
    );
  }

  /**
   * Determine overall health status
   */
  private determineOverallStatus(
    tokenValid: boolean,
    apiAccessible: boolean,
    databaseConnected: boolean,
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (tokenValid && apiAccessible && databaseConnected) {
      return 'healthy';
    }

    if ((tokenValid || apiAccessible) && databaseConnected) {
      return 'degraded';
    }

    return 'unhealthy';
  }

  /**
   * Get detailed health information - FIXED VERSION
   */
  async getDetailedHealth(): Promise<DetailedHealthResponse> {
    // ✅ FIX: Pisahkan async dan sync calls
    const [overallHealth, tokenInfo, databaseInfo, apiInfo] = await Promise.all(
      [
        this.healthCheck(),
        this.getAuthenticationHealth(),
        this.getDatabaseHealth(),
        this.getApiHealth(),
      ],
    );

    // ✅ FIX: Panggil sync method secara terpisah
    const syncInfo = this.getSyncHealth();

    return {
      overall: overallHealth,
      components: {
        authentication: tokenInfo,
        database: databaseInfo,
        api: apiInfo,
        sync: syncInfo,
      },
    };
  }

  /**
   * Get authentication health details
   */
  private async getAuthenticationHealth(): Promise<HealthComponent<TokenInfo>> {
    try {
      const tokenInfo = await this.authService.getTokenInfo();
      const status = tokenInfo.hasToken ? 'healthy' : 'unhealthy';

      return {
        status,
        details: tokenInfo,
      };
    } catch {
      // ✅ FIX: Remove unused error variable
      return {
        status: 'unhealthy',
        details: {
          hasToken: false,
          refreshInProgress: false,
          appidConfigured: false,
          secretKeyConfigured: false,
        },
      };
    }
  }

  /**
   * Get database health details
   */
  private async getDatabaseHealth(): Promise<
    HealthComponent<DatabaseHealthDetails>
  > {
    try {
      const [motorCount, withImeiCount, onlineCount] = await Promise.all([
        this.prisma.motor.count(),
        this.prisma.motor.count({ where: { imei: { not: null } } }),
        this.prisma.motor.count({
          where: {
            last_update: {
              gte: new Date(Date.now() - 30 * 60 * 1000), // Last 30 minutes
            },
          },
        }),
      ]);

      return {
        status: 'healthy',
        details: {
          totalMotors: motorCount,
          motorsWithImei: withImeiCount,
          motorsWithRecentData: onlineCount,
          connection: 'established',
        },
      };
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      return {
        status: 'unhealthy',
        details: {
          totalMotors: 0,
          motorsWithImei: 0,
          motorsWithRecentData: 0,
          connection: 'failed',
          error: errorMessage,
        },
      };
    }
  }

  /**
   * Get API health details
   */
  private async getApiHealth(): Promise<HealthComponent<ApiHealthDetails>> {
    try {
      const tokenInfo = await this.authService.getTokenInfo();

      // Test API with a simple call
      const startTime = Date.now();
      const apiResponse = await Promise.race([
        this.apiService.getDeviceLocation('test_imei', false),
        new Promise<DeviceLocationResponse>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 10000),
        ),
      ]);
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        details: {
          accessible: true,
          responseTime,
          tokenConfigured:
            tokenInfo.appidConfigured && tokenInfo.secretKeyConfigured,
          lastResponse: apiResponse.code,
        },
      };
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      return {
        status: this.isUnauthorizedError(error) ? 'degraded' : 'unhealthy',
        details: {
          accessible: this.isUnauthorizedError(error),
          error: errorMessage,
          responseTime: null,
          tokenConfigured: false,
        },
      };
    }
  }

  /**
   * Get sync health details - SYNC VERSION
   */
  private getSyncHealth(): HealthComponent<SyncHealthDetails> {
    try {
      const lastSync = this.syncService.getLastSyncTime();
      const now = new Date();
      const timeSinceLastSync = lastSync
        ? now.getTime() - lastSync.getTime()
        : null;

      const isSyncHealthy =
        timeSinceLastSync && timeSinceLastSync < 5 * 60 * 1000; // 5 minutes

      return {
        status: isSyncHealthy ? 'healthy' : 'degraded',
        details: {
          lastSync,
          timeSinceLastSync,
          autoSyncEnabled: true,
          syncStatus: isSyncHealthy ? 'active' : 'stale',
        },
      };
    } catch {
      // ✅ FIX: Remove unused error variable
      return {
        status: 'unhealthy',
        details: {
          lastSync: null,
          timeSinceLastSync: null,
          autoSyncEnabled: false,
          syncStatus: 'error',
        },
      };
    }
  }

  /**
   * Check if error is unauthorized (401)
   */
  private isUnauthorizedError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'response' in error) {
      const err = error as { response?: { status?: number } };
      return err.response?.status === 401;
    }
    return false;
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
   * Get health check history (simplified)
   */
  async getHealthHistory(): Promise<HealthHistoryItem[]> {
    // In a real implementation, you might store this in database
    // For now, return current health as history
    const health = await this.healthCheck();

    return [
      {
        timestamp: new Date(),
        status: health.status,
        responseTime: health.responseTime || 0,
      },
    ];
  }

  /**
   * Quick health status untuk monitoring
   */
  async getQuickHealth(): Promise<{
    status: string;
    timestamp: Date;
    components: string[];
  }> {
    const health = await this.healthCheck();

    const components: string[] = [];
    if (health.tokenValid) components.push('auth');
    if (health.apiAccessible) components.push('api');
    if (health.databaseConnected) components.push('database');
    if (health.lastSync) components.push('sync');

    return {
      status: health.status,
      timestamp: new Date(),
      components,
    };
  }
}

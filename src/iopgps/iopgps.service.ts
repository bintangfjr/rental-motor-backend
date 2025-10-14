// src/iopgps/iopgps.service.ts
import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma.service';
import { IopgpsAuthService } from './iopgps.auth.service';
import {
  IOPGPS_CONSTANTS,
  CACHE_TTL,
  FALLBACK_CONFIG,
} from './iopgps.constants';
import {
  VehicleStatus,
  DeviceLocationResponse,
  MileageResponse,
  DeviceTrackResponse,
  VehicleStatusResponse,
  BaseIopgpsResponse,
} from './interfaces/responses.interface';

// Local interfaces untuk internal use
interface MotorWithLocationStatus {
  id: number;
  plat_nomor: string;
  merk: string;
  model: string;
  status: string;
  imei: string | null;
  lat: number | null;
  lng: number | null;
  last_update: Date | null;
  location_status: string;
  last_update_age: number | null;
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  tokenValid: boolean;
  apiAccessible: boolean;
  databaseConnected: boolean;
  lastSync?: Date;
  details?: {
    totalMotors: number;
    motorsWithImei: number;
    motorsWithGps: number;
  };
}

interface SyncResult {
  success: number;
  failed: number;
  total: number;
  duration: number;
}

// Custom interface untuk error handling
interface IopgpsError {
  message: string;
  status?: number;
  code?: string;
  response?: {
    status: number;
    data?: unknown;
  };
}

@Injectable()
export class IopgpsService implements OnModuleInit {
  private readonly logger = new Logger(IopgpsService.name);
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime: Date | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authService: IopgpsAuthService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startAutoSync();
  }

  onModuleDestroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Start automatic location sync
   */
  private async startAutoSync(): Promise<void> {
    // Initial sync
    try {
      await this.syncMotorLocations();
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Initial sync failed', errorMessage);
    }

    // Set up interval
    this.syncInterval = setInterval(() => {
      this.syncMotorLocations().catch((error: unknown) => {
        const errorMessage = this.getErrorMessage(error);
        this.logger.error('Auto sync failed', errorMessage);
      });
    }, FALLBACK_CONFIG.SYNC_INTERVAL);

    this.logger.log(
      `Auto sync started with ${FALLBACK_CONFIG.SYNC_INTERVAL / 1000}s interval`,
    );
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
   * Check if error is unauthorized (401)
   */
  private isUnauthorizedError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as IopgpsError;
      return err.response?.status === 401;
    }
    return false;
  }

  /**
   * Make authenticated request dengan retry mechanism
   */
  private async makeAuthenticatedRequest<T = BaseIopgpsResponse>(
    url: string,
    params?: Record<string, string | number>,
    retries: number = IOPGPS_CONSTANTS.MAX_RETRIES,
  ): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const accessToken = await this.authService.getAccessToken();

        const response = await firstValueFrom(
          this.httpService.get<T>(url, {
            params,
            headers: {
              accessToken,
            },
            timeout: IOPGPS_CONSTANTS.TIMEOUT,
          }),
        );

        return response.data;
      } catch (error: unknown) {
        const errorMessage = this.getErrorMessage(error);
        this.logger.warn(
          `Request attempt ${attempt}/${retries} failed: ${errorMessage}`,
        );

        if (attempt === retries) {
          throw error;
        }

        // Jika unauthorized, refresh token dan coba lagi
        if (this.isUnauthorizedError(error)) {
          this.logger.debug('Token expired, refreshing...');
          await this.authService.refreshAccessToken();
        }

        // Exponential backoff
        const delay = IOPGPS_CONSTANTS.RETRY_DELAY * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error('All retry attempts failed');
  }

  /**
   * Get vehicle status dari IOPGPS
   */
  async getVehicleStatus(
    licenseNumber?: string,
    vin?: string,
  ): Promise<VehicleStatus[]> {
    try {
      const params: Record<string, string> = {};
      if (licenseNumber) params.licenseNumber = licenseNumber;
      if (vin) params.vin = vin;

      const data = await this.makeAuthenticatedRequest<VehicleStatusResponse>(
        `${IOPGPS_CONSTANTS.BASE_URL}${IOPGPS_CONSTANTS.VEHICLE_STATUS}`,
        params,
      );

      return data.data || [];
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        'Failed to get vehicle status from IOPGPS',
        errorMessage,
      );

      // Fallback: Return data dari database
      return await this.getVehicleStatusFromDatabase(licenseNumber);
    }
  }

  /**
   * Fallback: Get vehicle status dari database
   */
  private async getVehicleStatusFromDatabase(
    licenseNumber?: string,
  ): Promise<VehicleStatus[]> {
    const where: Record<string, unknown> = {};
    if (licenseNumber) where.plat_nomor = licenseNumber;

    const motors = await this.prisma.motor.findMany({
      where,
      select: {
        id: true,
        plat_nomor: true,
        imei: true,
        lat: true,
        lng: true,
        last_update: true,
        status: true,
      },
    });

    return motors.map(
      (motor): VehicleStatus => ({
        imei: motor.imei || '',
        licenseNumber: motor.plat_nomor,
        lat: motor.lat || 0,
        lng: motor.lng || 0,
        speed: 0,
        direction: 0,
        gpsTime: motor.last_update
          ? Math.floor(motor.last_update.getTime() / 1000)
          : 0,
        location: 'Data from database',
        status: this.mapMotorStatus(motor.status),
        acc: 'off',
        online: 'offline',
        locType: 'database',
      }),
    );
  }

  private mapMotorStatus(status: string): string {
    const statusMap: Record<string, string> = {
      tersedia: 'active',
      disewa: 'rented',
      perbaikan: 'maintenance',
    };
    return statusMap[status] || 'unknown';
  }

  /**
   * Get device location dengan fallback
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
      const data = await this.makeAuthenticatedRequest<DeviceLocationResponse>(
        `${IOPGPS_CONSTANTS.BASE_URL}${IOPGPS_CONSTANTS.DEVICE_LOCATION}`,
        { imei },
      );

      // Simpan ke cache hanya jika successful
      if (data.code === 0) {
        await this.cacheManager.set(cacheKey, data, CACHE_TTL.LOCATION_DATA);
        this.logger.debug(`Location cached for IMEI: ${imei}`);
      }

      return data;
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `Failed to get device location for IMEI: ${imei}`,
        errorMessage,
      );

      // Fallback: Get from database
      return await this.getDeviceLocationFromDatabase(imei);
    }
  }

  /**
   * Fallback: Get device location dari database
   */
  private async getDeviceLocationFromDatabase(
    imei: string,
  ): Promise<DeviceLocationResponse> {
    const motor = await this.prisma.motor.findFirst({
      where: { imei },
      select: {
        lat: true,
        lng: true,
        last_update: true,
        plat_nomor: true,
      },
    });

    // Perbaikan: Cek motor existence terlebih dahulu
    if (!motor) {
      return {
        code: 1,
        result: 'Device not found in database',
      };
    }

    // Kemudian cek lat/lng
    if (!motor.lat || !motor.lng) {
      return {
        code: 1,
        result: 'No location data in database',
      };
    }

    // Cek apakah data lokasi masih fresh
    const locationAge = Date.now() - (motor.last_update?.getTime() || 0);
    const isFresh = locationAge <= FALLBACK_CONFIG.MAX_LOCATION_AGE;

    return {
      code: isFresh ? 0 : 2, // 2 = data exists but may be stale
      result: isFresh ? 'success' : 'data may be stale',
      lng: motor.lng.toString(),
      lat: motor.lat.toString(),
      address: `Motor: ${motor.plat_nomor}`,
      gpsTime: motor.last_update
        ? Math.floor(motor.last_update.getTime() / 1000)
        : 0,
      speed: 0,
      direction: 0,
      locType: 'database',
    };
  }

  /**
   * Get device mileage dari IOPGPS
   */
  async getDeviceMileage(
    imei: string,
    startTime: number,
    endTime?: number,
  ): Promise<MileageResponse> {
    try {
      const params: Record<string, string | number> = {
        imei,
        startTime,
        endTime: endTime || Math.floor(Date.now() / 1000),
      };

      const data = await this.makeAuthenticatedRequest<MileageResponse>(
        `${IOPGPS_CONSTANTS.BASE_URL}/api/device/miles`,
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
   * Get device track history
   */
  async getDeviceTrackHistory(
    imei: string,
    startTime: number,
    endTime?: number,
  ): Promise<DeviceTrackResponse> {
    try {
      const params: Record<string, string | number> = {
        imei,
        startTime,
        coordType: 'wgs84',
      };

      if (endTime) {
        params.endTime = endTime;
      }

      const data = await this.makeAuthenticatedRequest<DeviceTrackResponse>(
        `${IOPGPS_CONSTANTS.BASE_URL}${IOPGPS_CONSTANTS.DEVICE_TRACK}`,
        params,
      );

      return data;
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `Failed to get track history for IMEI: ${imei}`,
        errorMessage,
      );
      throw new Error(`Failed to get track history: ${errorMessage}`);
    }
  }

  /**
   * Enhanced sync dengan error handling
   */
  async syncMotorLocations(): Promise<SyncResult> {
    const startTime = Date.now();
    const results: SyncResult = {
      success: 0,
      failed: 0,
      total: 0,
      duration: 0,
    };

    try {
      // Ambil semua motor yang memiliki IMEI
      const motors = await this.prisma.motor.findMany({
        where: {
          imei: { not: null },
          status: { in: ['tersedia', 'disewa'] },
        },
        select: {
          id: true,
          imei: true,
          plat_nomor: true,
          lat: true,
          lng: true,
          last_update: true,
        },
      });

      results.total = motors.length;
      this.logger.debug(`Starting sync for ${results.total} motors`);

      for (const motor of motors) {
        // Pastikan imei tidak null
        if (!motor.imei) {
          results.failed++;
          continue;
        }

        try {
          const location = await this.getDeviceLocation(motor.imei, false);

          if (location.code === 0 && location.lat && location.lng) {
            const newLat = parseFloat(location.lat);
            const newLng = parseFloat(location.lng);
            const newUpdate = new Date((location.gpsTime || 0) * 1000);

            // Only update if location changed significantly or data is stale
            const locationChanged =
              Math.abs(newLat - (motor.lat || 0)) > 0.0001 ||
              Math.abs(newLng - (motor.lng || 0)) > 0.0001;

            const dataStale =
              !motor.last_update ||
              Date.now() - motor.last_update.getTime() > 60000; // 1 menit

            if (locationChanged || dataStale) {
              await this.prisma.motor.update({
                where: { id: motor.id },
                data: {
                  lat: newLat,
                  lng: newLng,
                  last_update: newUpdate,
                },
              });
              results.success++;
              this.logger.debug(
                `Updated location for motor ${motor.plat_nomor}`,
              );
            } else {
              results.success++; // Tidak diupdate tapi tetap dianggap success
            }
          } else {
            this.logger.warn(
              `No valid location data for motor ${motor.plat_nomor}: ${location.result}`,
            );
            results.failed++;
          }
        } catch (error: unknown) {
          const errorMessage = this.getErrorMessage(error);
          this.logger.warn(
            `Failed to sync location for motor ${motor.plat_nomor}: ${errorMessage}`,
          );
          results.failed++;
        }
      }

      results.duration = Date.now() - startTime;
      this.lastSyncTime = new Date();

      this.logger.log(
        `Location sync completed: ${results.success}/${results.total} success, ${results.failed} failed, took ${results.duration}ms`,
      );
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Location sync process failed', errorMessage);
      throw new Error(`Sync process failed: ${errorMessage}`);
    }

    return results;
  }

  /**
   * Manual update motor location (untuk input manual)
   */
  async updateMotorLocationManually(
    motorId: number,
    lat: number,
    lng: number,
  ): Promise<void> {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
      select: { plat_nomor: true, imei: true },
    });

    if (!motor) {
      throw new Error(`Motor with ID ${motorId} not found`);
    }

    await this.prisma.motor.update({
      where: { id: motorId },
      data: {
        lat,
        lng,
        last_update: new Date(),
      },
    });

    this.logger.log(`Manual location update for motor ${motor.plat_nomor}`);

    // Clear cache untuk motor ini
    if (motor.imei) {
      await this.cacheManager.del(`device_location_${motor.imei}`);
    }
  }

  /**
   * Get motor dengan status lokasi
   */
  async getMotorsWithLocationStatus(): Promise<MotorWithLocationStatus[]> {
    const motors = await this.prisma.motor.findMany({
      select: {
        id: true,
        plat_nomor: true,
        merk: true,
        model: true,
        status: true,
        imei: true,
        lat: true,
        lng: true,
        last_update: true,
      },
      orderBy: { plat_nomor: 'asc' },
    });

    return motors.map((motor): MotorWithLocationStatus => {
      const locationAge = motor.last_update
        ? Date.now() - motor.last_update.getTime()
        : null;

      const isLocationFresh =
        locationAge !== null && locationAge <= FALLBACK_CONFIG.MAX_LOCATION_AGE;

      let locationStatus = 'none';
      if (motor.last_update) {
        locationStatus = isLocationFresh ? 'realtime' : 'stale';
      }

      return {
        ...motor,
        location_status: locationStatus,
        last_update_age: locationAge ? Math.floor(locationAge / 1000) : null,
      };
    });
  }

  /**
   * Get single motor dengan data GPS terbaru
   */
  async getMotorWithRealTimeLocation(
    motorId: number,
  ): Promise<MotorWithLocationStatus | null> {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
      select: {
        id: true,
        plat_nomor: true,
        merk: true,
        model: true,
        status: true,
        imei: true,
        lat: true,
        lng: true,
        last_update: true,
      },
    });

    if (!motor) {
      return null;
    }

    // Jika motor memiliki IMEI, coba dapatkan data real-time
    if (motor.imei) {
      try {
        const realTimeLocation = await this.getDeviceLocation(motor.imei, true);

        if (
          realTimeLocation.code === 0 &&
          realTimeLocation.lat &&
          realTimeLocation.lng
        ) {
          return {
            ...motor,
            lat: parseFloat(realTimeLocation.lat),
            lng: parseFloat(realTimeLocation.lng),
            last_update: new Date((realTimeLocation.gpsTime || 0) * 1000),
            location_status: 'realtime',
            last_update_age: 0,
          };
        }
      } catch (error) {
        this.logger.warn(
          `Failed to get real-time location for motor ${motorId}`,
        );
      }
    }

    // Fallback ke data database
    const locationAge = motor.last_update
      ? Date.now() - motor.last_update.getTime()
      : null;

    const isLocationFresh =
      locationAge !== null && locationAge <= FALLBACK_CONFIG.MAX_LOCATION_AGE;

    let locationStatus = 'none';
    if (motor.last_update) {
      locationStatus = isLocationFresh ? 'cached' : 'stale';
    }

    return {
      ...motor,
      location_status: locationStatus,
      last_update_age: locationAge ? Math.floor(locationAge / 1000) : null,
    };
  }

  /**
   * Health check IOPGPS service
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const [tokenValid, motors, motorsWithImei, motorsWithGps] =
        await Promise.all([
          this.authService.isTokenValid(),
          this.prisma.motor.count(),
          this.prisma.motor.count({ where: { imei: { not: null } } }),
          this.prisma.motor.count({
            where: { lat: { not: null }, lng: { not: null } },
          }),
        ]);

      // Test API access dengan request yang lebih sederhana
      let apiAccessible = false;
      try {
        // Gunakan request yang lebih ringan untuk health check
        await this.makeAuthenticatedRequest(
          `${IOPGPS_CONSTANTS.BASE_URL}${IOPGPS_CONSTANTS.DEVICE_LOCATION}`,
          { imei: 'test' }, // IMEI dummy, akan return error tapi test koneksi
        );
        apiAccessible = true;
      } catch (error: unknown) {
        // Jika error bukan 401, API accessible
        apiAccessible = !this.isUnauthorizedError(error);
      }

      const status: 'healthy' | 'degraded' | 'unhealthy' =
        tokenValid && apiAccessible
          ? 'healthy'
          : tokenValid || apiAccessible
            ? 'degraded'
            : 'unhealthy';

      return {
        status,
        tokenValid,
        apiAccessible,
        databaseConnected: motors > 0,
        lastSync: this.lastSyncTime || undefined,
        details: {
          totalMotors: motors,
          motorsWithImei,
          motorsWithGps,
        },
      };
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Health check failed', errorMessage);
      return {
        status: 'unhealthy',
        tokenValid: false,
        apiAccessible: false,
        databaseConnected: false,
      };
    }
  }

  /**
   * Get last sync time
   */
  getLastSyncTime(): Date | null {
    return this.lastSyncTime;
  }

  /**
   * Force immediate sync
   */
  async forceSync(): Promise<SyncResult> {
    this.logger.log('Manual force sync triggered');
    return await this.syncMotorLocations();
  }
}

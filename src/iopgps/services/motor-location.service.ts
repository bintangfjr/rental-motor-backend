// src/iopgps/services/motor-location.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { IopgpsApiService } from './iopgps-api.service';
import { IopgpsCacheService } from './iopgps-cache.service';
import {
  IopgpsEventsService,
  IopgpsLocationUpdate,
} from '../../websocket/services/iopgps-events.service'; // <-- Tambahkan ini
import { FALLBACK_CONFIG } from '../iopgps.constants';
import {
  MotorWithLocationStatus,
  DeviceLocationResponse,
} from '../interfaces/responses.interface';

// Type-safe motor interface dari database
interface DatabaseMotor {
  id: number;
  plat_nomor: string;
  merk: string;
  model: string;
  status: string;
  imei: string | null;
  lat: number | null;
  lng: number | null;
  last_update: Date | null;
}

@Injectable()
export class MotorLocationService {
  private readonly logger = new Logger(MotorLocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiService: IopgpsApiService,
    private readonly cacheService: IopgpsCacheService,
    private readonly iopgpsEventsService: IopgpsEventsService, // <-- Inject events service
  ) {}

  /**
   * Get all motors with location status from database
   */
  async getMotorsFromDatabase(): Promise<MotorWithLocationStatus[]> {
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
        id: motor.id,
        plat_nomor: motor.plat_nomor,
        merk: motor.merk,
        model: motor.model,
        status: motor.status,
        imei: motor.imei,
        lat: motor.lat,
        lng: motor.lng,
        last_update: motor.last_update,
        location_status: locationStatus,
        last_update_age: locationAge ? Math.floor(locationAge / 1000) : null,
      };
    });
  }

  /**
   * Get motors with location status (with cache)
   */
  async getMotorsWithLocationStatus(): Promise<MotorWithLocationStatus[]> {
    // Check cache first
    const cached = await this.cacheService.getCachedMotorsWithLocationStatus();
    if (cached) {
      return cached;
    }

    // Get from database
    const result = await this.getMotorsFromDatabase();

    // Cache the result
    await this.cacheService.cacheMotorsWithLocationStatus(result);

    return result;
  }

  /**
   * Get single motor with real-time location data - TYPE SAFE VERSION dengan WebSocket
   */
  async getMotorWithRealTimeLocation(
    motorId: number,
  ): Promise<MotorWithLocationStatus | null> {
    // Check cache first
    const cached = await this.cacheService.getCachedMotorRealtimeData(motorId);
    if (cached) {
      return cached;
    }

    // Get motor from database
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

    let result: MotorWithLocationStatus;

    // If motor has IMEI, try to get real-time data
    if (motor.imei) {
      try {
        // ✅ FIX: Type-safe Promise.race dengan DeviceLocationResponse
        const realTimeLocation = await Promise.race([
          this.apiService.getDeviceLocation(motor.imei, true),
          new Promise<DeviceLocationResponse>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 5000),
          ),
        ]);

        if (
          realTimeLocation.code === 0 &&
          realTimeLocation.lat &&
          realTimeLocation.lng
        ) {
          result = {
            id: motor.id,
            plat_nomor: motor.plat_nomor,
            merk: motor.merk,
            model: motor.model,
            status: motor.status,
            imei: motor.imei,
            lat: parseFloat(realTimeLocation.lat),
            lng: parseFloat(realTimeLocation.lng),
            last_update: new Date((realTimeLocation.gpsTime || 0) * 1000),
            location_status: 'realtime',
            last_update_age: 0,
          };

          // Cache successful real-time data
          await this.cacheService.cacheMotorRealtimeData(motorId, result);

          // Emit real-time location update via WebSocket
          this.emitRealTimeLocationUpdate(result, realTimeLocation);

          return result;
        }
      } catch (error: unknown) {
        const errorMessage = this.getErrorMessage(error);
        this.logger.warn(
          `Failed to get real-time location for motor ${motorId}: ${errorMessage}`,
        );
        // Fall through to database data
      }
    }

    // Fallback to database data
    result = this.createMotorWithLocationStatus(motor);

    // Cache fallback data
    await this.cacheService.cacheMotorRealtimeData(motorId, result);

    return result;
  }

  /**
   * Update motor location manually dengan WebSocket event
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

    // Emit manual location update via WebSocket
    const locationUpdate: IopgpsLocationUpdate = {
      motorId,
      plat_nomor: motor.plat_nomor,
      imei: motor.imei || '',
      lat,
      lng,
      last_update: new Date().toISOString(),
      location_status: 'realtime',
      timestamp: new Date().toISOString(),
    };
    this.iopgpsEventsService.emitLocationUpdate(locationUpdate);

    // Clear relevant caches
    if (motor.imei) {
      await this.cacheService.clearDeviceLocationCache(motor.imei);
    }
    await this.cacheService.deleteCustomCache(`motor_realtime_${motorId}`);
    await this.cacheService.deleteCustomCache('motors_with_location_status');
  }

  /**
   * Get motors by status dengan cache invalidation events
   */
  async getMotorsByStatus(status: string): Promise<MotorWithLocationStatus[]> {
    const allMotors = await this.getMotorsWithLocationStatus();
    const filteredMotors = allMotors.filter((motor) => motor.status === status);

    // Emit status filter event untuk monitoring
    this.logger.debug(
      `Filtered ${filteredMotors.length} motors by status: ${status}`,
    );

    return filteredMotors;
  }

  /**
   * Get motors with IMEI
   */
  async getMotorsWithImei(): Promise<MotorWithLocationStatus[]> {
    const allMotors = await this.getMotorsWithLocationStatus();
    const motorsWithImei = allMotors.filter((motor) => motor.imei !== null);

    // Log untuk monitoring
    this.logger.debug(`Found ${motorsWithImei.length} motors with IMEI`);

    return motorsWithImei;
  }

  /**
   * Get motors without IMEI
   */
  async getMotorsWithoutImei(): Promise<MotorWithLocationStatus[]> {
    const allMotors = await this.getMotorsWithLocationStatus();
    const motorsWithoutImei = allMotors.filter((motor) => motor.imei === null);

    // Log untuk monitoring
    this.logger.debug(`Found ${motorsWithoutImei.length} motors without IMEI`);

    return motorsWithoutImei;
  }

  /**
   * Get motors with fresh location data
   */
  async getMotorsWithFreshLocation(): Promise<MotorWithLocationStatus[]> {
    const allMotors = await this.getMotorsWithLocationStatus();
    const freshMotors = allMotors.filter(
      (motor) =>
        motor.location_status === 'realtime' ||
        motor.location_status === 'cached',
    );

    // Emit fresh location stats
    this.logger.debug(`Found ${freshMotors.length} motors with fresh location`);

    return freshMotors;
  }

  /**
   * Get motor statistics dengan WebSocket events untuk dashboard real-time
   */
  async getMotorStatistics(): Promise<{
    total: number;
    withImei: number;
    withoutImei: number;
    online: number;
    offline: number;
    byStatus: Record<string, number>;
    timestamp: string;
  }> {
    const allMotors = await this.getMotorsWithLocationStatus();

    const withImei = allMotors.filter((m) => m.imei).length;
    const online = allMotors.filter(
      (m) => m.location_status === 'realtime' || m.location_status === 'cached',
    ).length;

    const statusCount: Record<string, number> = {};
    allMotors.forEach((motor) => {
      statusCount[motor.status] = (statusCount[motor.status] || 0) + 1;
    });

    const statistics = {
      total: allMotors.length,
      withImei,
      withoutImei: allMotors.length - withImei,
      online,
      offline: allMotors.length - online,
      byStatus: statusCount,
      timestamp: new Date().toISOString(),
    };

    // Emit statistics update untuk dashboard real-time
    this.emitStatisticsUpdate(statistics);

    return statistics;
  }

  /**
   * Helper method to create MotorWithLocationStatus from database motor - TYPE SAFE VERSION
   */
  private createMotorWithLocationStatus(
    motor: DatabaseMotor,
  ): MotorWithLocationStatus {
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
      id: motor.id,
      plat_nomor: motor.plat_nomor,
      merk: motor.merk,
      model: motor.model,
      status: motor.status,
      imei: motor.imei,
      lat: motor.lat,
      lng: motor.lng,
      last_update: motor.last_update,
      location_status: locationStatus,
      last_update_age: locationAge ? Math.floor(locationAge / 1000) : null,
    };
  }

  /**
   * Get motors with enhanced status (online/offline detection) untuk real-time monitoring
   */
  async getMotorsWithEnhancedStatus(): Promise<
    Array<
      MotorWithLocationStatus & {
        isOnline: boolean;
        lastUpdateMinutes: number | null;
      }
    >
  > {
    const motors = await this.getMotorsWithLocationStatus();

    const enhancedMotors = motors.map((motor) => {
      const lastUpdateMinutes = motor.last_update_age
        ? Math.floor(motor.last_update_age / 60)
        : null;

      // Consider online if location is fresh (less than 15 minutes)
      const isOnline =
        motor.last_update_age !== null && motor.last_update_age < 900; // 15 minutes

      return {
        ...motor,
        isOnline,
        lastUpdateMinutes,
      };
    });

    // Emit enhanced status summary
    const onlineCount = enhancedMotors.filter((m) => m.isOnline).length;
    this.logger.debug(
      `Enhanced status: ${onlineCount}/${enhancedMotors.length} motors online`,
    );

    return enhancedMotors;
  }

  /**
   * Get motor count by various criteria untuk real-time dashboard
   */
  async getMotorCounts(): Promise<{
    total: number;
    online: number;
    offline: number;
    withImei: number;
    withoutImei: number;
    byStatus: Record<string, number>;
    timestamp: string;
  }> {
    const allMotors = await this.getMotorsWithLocationStatus();

    const withImei = allMotors.filter((m) => m.imei).length;
    const online = allMotors.filter(
      (m) => m.last_update_age !== null && m.last_update_age < 900,
    ).length;

    const statusCount: Record<string, number> = {};
    allMotors.forEach((motor) => {
      statusCount[motor.status] = (statusCount[motor.status] || 0) + 1;
    });

    const counts = {
      total: allMotors.length,
      online,
      offline: allMotors.length - online,
      withImei,
      withoutImei: allMotors.length - withImei,
      byStatus: statusCount,
      timestamp: new Date().toISOString(),
    };

    // Emit counts update untuk real-time dashboard
    this.emitCountsUpdate(counts);

    return counts;
  }

  /**
   * Bulk update motor locations (untuk sync operations)
   */
  async bulkUpdateMotorLocations(
    updates: Array<{
      motorId: number;
      lat: number;
      lng: number;
      last_update: Date;
      address?: string;
    }>,
  ): Promise<void> {
    if (updates.length === 0) return;

    try {
      // Update database dalam transaction
      await this.prisma.$transaction(async (tx) => {
        for (const update of updates) {
          await tx.motor.update({
            where: { id: update.motorId },
            data: {
              lat: update.lat,
              lng: update.lng,
              last_update: update.last_update,
              last_known_address: update.address,
            },
          });
        }
      });

      // Emit bulk location updates
      for (const update of updates) {
        const motor = await this.prisma.motor.findUnique({
          where: { id: update.motorId },
          select: { plat_nomor: true, imei: true },
        });

        if (motor) {
          const locationUpdate: IopgpsLocationUpdate = {
            motorId: update.motorId,
            plat_nomor: motor.plat_nomor,
            imei: motor.imei || '',
            lat: update.lat,
            lng: update.lng,
            address: update.address,
            last_update: update.last_update.toISOString(),
            location_status: 'realtime',
            timestamp: new Date().toISOString(),
          };
          this.iopgpsEventsService.emitLocationUpdate(locationUpdate);
        }
      }

      this.logger.log(`Bulk updated ${updates.length} motor locations`);
    } catch (error) {
      this.logger.error('Failed to bulk update motor locations', error);
      throw error;
    }
  }

  // ========== PRIVATE WEB SOCKET EMITTER METHODS ==========

  /**
   * Emit real-time location update
   */
  private emitRealTimeLocationUpdate(
    motor: MotorWithLocationStatus,
    locationData: DeviceLocationResponse,
  ): void {
    const locationUpdate: IopgpsLocationUpdate = {
      motorId: motor.id,
      plat_nomor: motor.plat_nomor,
      imei: motor.imei || '',
      lat: motor.lat || 0,
      lng: motor.lng || 0,
      address: locationData.address || undefined,
      last_update: motor.last_update?.toISOString() || new Date().toISOString(),
      location_status: 'realtime',
      timestamp: new Date().toISOString(),
    };
    this.iopgpsEventsService.emitLocationUpdate(locationUpdate);
  }

  /**
   * Emit statistics update untuk dashboard
   */
  private emitStatisticsUpdate(statistics: any): void {
    // Bisa extend interface IopgpsEventsService untuk statistics events
    // Untuk sementara, kita log saja
    this.logger.debug(
      `Statistics updated: ${statistics.online}/${statistics.total} online`,
    );
  }

  /**
   * Emit counts update untuk real-time dashboard
   */
  private emitCountsUpdate(counts: any): void {
    // Bisa extend interface IopgpsEventsService untuk counts events
    // Untuk sementara, kita log saja
    this.logger.debug(
      `Counts updated: ${counts.online} online, ${counts.withImei} with IMEI`,
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
}

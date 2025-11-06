// src/iopgps/services/iopgps-sync.service.ts
import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma.service';
import { IopgpsApiService } from './iopgps-api.service';
import {
  IopgpsEventsService,
  IopgpsSyncUpdate,
  IopgpsLocationUpdate,
} from '../../websocket/services/iopgps-events.service';
import { FALLBACK_CONFIG, CACHE_TTL } from '../iopgps.constants';
import {
  SyncOperationResult,
  MotorWithLocationStatus,
} from '../interfaces/responses.interface';

// Import enum dari Prisma
import { motors_gps_status } from '@prisma/client';

interface MotorForSync {
  id: number;
  imei: string;
  plat_nomor: string;
  last_update?: Date | null;
  gps_status?: motors_gps_status | null;
}

interface LocationUpdateData {
  lat: number;
  lng: number;
  last_update: Date;
  last_known_address?: string | null;
  gps_status?: motors_gps_status;
}

interface IopgpsLocationResponse {
  code: number;
  lat?: string;
  lng?: string;
  gpsTime?: number;
  address?: string;
  result?: string;
  message?: string;
  speed?: number;
  direction?: number;
}

@Injectable()
export class IopgpsSyncService implements OnModuleInit {
  private readonly logger = new Logger(IopgpsSyncService.name);
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime: Date | null = null;
  private isSyncing = false;
  private consecutiveFailures = 0;
  private readonly maxConsecutiveFailures = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiService: IopgpsApiService,
    private readonly iopgpsEventsService: IopgpsEventsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startAutoSync();
  }

  onModuleDestroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }

  private async startAutoSync(): Promise<void> {
    try {
      await this.syncMotorLocations();
      this.logger.log('Initial sync completed successfully');
    } catch (error) {
      this.logger.error('Initial sync failed', error);
    }

    const syncInterval = this.getSyncInterval();

    this.syncInterval = setInterval(() => {
      this.syncMotorLocations().catch((error) => {
        this.logger.error('Auto sync failed', error);
      });
    }, syncInterval);

    this.logger.log(`Auto sync started with ${syncInterval / 1000}s interval`);
  }

  private getSyncInterval(): number {
    if (process.env.NODE_ENV === 'development') {
      return 15000; // 15 detik untuk development
    }

    if (this.consecutiveFailures > 0) {
      return Math.min(
        FALLBACK_CONFIG.SYNC_INTERVAL * (this.consecutiveFailures + 1),
        300000, // Max 5 menit
      );
    }

    return FALLBACK_CONFIG.SYNC_INTERVAL; // Default 1 menit
  }

  async syncMotorLocations(): Promise<SyncOperationResult> {
    if (this.isSyncing) {
      this.logger.warn('Sync already in progress, skipping...');
      return {
        success: 0,
        failed: 0,
        total: 0,
        duration: 0,
        timestamp: new Date(),
        errors: ['Sync already in progress'],
      };
    }

    this.isSyncing = true;
    const startTime = Date.now();
    const results: SyncOperationResult = {
      success: 0,
      failed: 0,
      total: 0,
      duration: 0,
      timestamp: new Date(),
      errors: [],
    };

    try {
      this.emitSyncStarted();

      const motors = await this.getMotorsForSync();
      results.total = motors.length;

      if (results.total === 0) {
        this.logger.debug(
          'No motors found for sync - all motors are up to date',
        );
        return results;
      }

      this.logger.log(`Starting sync for ${results.total} motors`);

      const syncPromises = motors.map(async (motor, index) => {
        if (index > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
        }

        try {
          await this.processSingleMotor(motor);
          results.success++;
          this.logger.debug(`✓ Success sync for ${motor.plat_nomor}`);
        } catch (error) {
          results.failed++;
          const errorMsg = `Motor ${motor.plat_nomor}: ${this.getErrorMessage(error)}`;
          results.errors.push(errorMsg);
          this.logger.warn(
            `✗ Failed sync for ${motor.plat_nomor}: ${errorMsg}`,
          );
        }
      });

      await Promise.allSettled(syncPromises);

      results.duration = Date.now() - startTime;
      this.lastSyncTime = new Date();

      if (results.failed === 0) {
        this.consecutiveFailures = 0;
      } else {
        this.consecutiveFailures++;
      }

      this.emitSyncCompleted(results);

      this.logger.log(
        `Sync completed: ${results.success}/${results.total} success in ${results.duration}ms. Consecutive failures: ${this.consecutiveFailures}`,
      );
    } catch (error) {
      this.consecutiveFailures++;
      const errorMsg = `Sync process failed: ${this.getErrorMessage(error)}`;
      results.errors.push(errorMsg);
      this.emitSyncFailed(results, errorMsg);
      this.logger.error(errorMsg);
    } finally {
      this.isSyncing = false;
    }

    return results;
  }

  /**
   * IMPROVED: Process single motor dengan pengecekan status yang lebih detail
   */
  private async processSingleMotor(motor: MotorForSync): Promise<void> {
    if (!motor.imei) {
      throw new Error('No IMEI');
    }

    try {
      const location = await this.apiService.getDeviceLocation(
        motor.imei,
        false,
      );

      // Log response untuk debug
      this.logger.debug(`IOPGPS Response for ${motor.plat_nomor}:`, {
        code: location.code,
        result: location.result,
        message: location.message,
        gpsTime: location.gpsTime,
        hasCoords: !!(location.lat && location.lng),
      });

      // Validasi response dari IOPGPS
      if (location.code !== 0) {
        const errorMessage =
          location.result || location.message || 'Unknown IOPGPS error';
        throw new Error(`IOPGPS API error: ${errorMessage}`);
      }

      // Jika response code 0 tapi ada indicator offline di result/message
      if (
        (location.result && this.isOfflineIndicator(location.result)) ||
        (location.message && this.isOfflineIndicator(location.message))
      ) {
        throw new Error(
          `IOPGPS indicates offline: ${location.result || location.message}`,
        );
      }

      // Validasi data koordinat
      if (!location.lat || !location.lng) {
        throw new Error('No valid coordinates from IOPGPS');
      }

      const lat = parseFloat(location.lat);
      const lng = parseFloat(location.lng);

      // Validasi koordinat numeric
      if (isNaN(lat) || isNaN(lng)) {
        throw new Error('Invalid coordinate format');
      }

      // Validasi range koordinat Indonesia
      if (lat < -11 || lat > 6 || lng < 95 || lng > 141) {
        throw new Error('Coordinates outside Indonesia range');
      }

      // FIXED: Tentukan GPS status dengan logic yang lebih akurat
      const gpsStatus = await this.determineGpsStatusFromIopgps(
        location,
        lat,
        lng,
        motor.plat_nomor,
      ); // Tambah await

      // FIXED: Update BOTH coordinates dan GPS status
      const updateData: LocationUpdateData = {
        lat,
        lng,
        last_update: new Date((location.gpsTime || Date.now() / 1000) * 1000),
        last_known_address: location.address || null,
        gps_status: gpsStatus,
      };

      await this.prisma.motor.update({
        where: { id: motor.id },
        data: updateData,
      });

      this.emitLocationUpdate(motor, updateData);

      this.logger.debug(
        `Updated location for ${motor.plat_nomor}: ${lat}, ${lng} | GPS Status: ${gpsStatus}`,
      );
    } catch (error) {
      // Jika gagal get location, update status ke Offline
      await this.handleSyncFailure(motor, error);
      throw error;
    }
  }

  /**
   * FIXED: Determine GPS status dengan pengecekan yang lebih akurat - dibuat async
   */
  private async determineGpsStatusFromIopgps(
    location: IopgpsLocationResponse,
    lat: number,
    lng: number,
    platNomor: string,
  ): Promise<motors_gps_status> {
    // 1. Check response code utama
    if (location.code !== 0) {
      this.logger.debug(
        `[${platNomor}] Device offline: response code ${location.code}`,
      );
      return motors_gps_status.Offline;
    }

    // 2. Check jika ada error message yang indicate offline
    if (location.result && this.isOfflineIndicator(location.result)) {
      this.logger.debug(
        `[${platNomor}] Device offline: result indicates offline - "${location.result}"`,
      );
      return motors_gps_status.Offline;
    }

    if (location.message && this.isOfflineIndicator(location.message)) {
      this.logger.debug(
        `[${platNomor}] Device offline: message indicates offline - "${location.message}"`,
      );
      return motors_gps_status.Offline;
    }

    // 3. Check jika koordinat tidak valid atau 0,0
    if (!location.lat || !location.lng || lat === 0 || lng === 0) {
      this.logger.debug(`[${platNomor}] Device offline: invalid coordinates`);
      return motors_gps_status.Offline;
    }

    // 4. Check GPS time freshness - INI YANG PENTING!
    if (location.gpsTime) {
      const gpsTime = new Date(location.gpsTime * 1000);
      const now = new Date();
      const timeDiffMinutes = (now.getTime() - gpsTime.getTime()) / (1000 * 60);

      // Jika data GPS lebih dari 10 menit, consider offline
      if (timeDiffMinutes > 10) {
        this.logger.debug(
          `[${platNomor}] Device offline: stale data (${Math.floor(timeDiffMinutes)} minutes old)`,
        );
        return motors_gps_status.Offline;
      }

      this.logger.debug(
        `[${platNomor}] Device online: fresh data (${Math.floor(timeDiffMinutes)} minutes old)`,
      );
    } else {
      // Jika tidak ada GPS time, consider offline
      this.logger.debug(`[${platNomor}] Device offline: no GPS time`);
      return motors_gps_status.Offline;
    }

    // 5. Check jika koordinat sama dengan sebelumnya (stagnan) - mungkin device mati
    const isStagnant = await this.checkStagnantCoordinates(platNomor, lat, lng);
    if (isStagnant) {
      this.logger.debug(`[${platNomor}] Device offline: coordinates stagnant`);
      return motors_gps_status.Offline;
    }

    // 6. Jika semua kondisi terpenuhi, device benar-benar Online
    this.logger.debug(`[${platNomor}] Device online: all conditions met`);
    return motors_gps_status.Online;
  }
  /**
   * NEW: Check jika response mengandung indicator offline
   */
  private isOfflineIndicator(text: string): boolean {
    if (!text) return false;

    const offlineKeywords = [
      'offline',
      'no data',
      'no signal',
      'disconnected',
      'timeout',
      'not found',
      'invalid',
      'error',
      'device offline',
      'no location',
      'tidak ada data',
      'gps not',
      'signal lost',
      'disconnect',
      'mati',
      'tidak aktif',
      'gps error',
    ];

    const lowerText = text.toLowerCase();
    return offlineKeywords.some((keyword) => lowerText.includes(keyword));
  }

  /**
   * NEW: Check jika koordinat stagnan (sama dengan sebelumnya)
   */
  private async checkStagnantCoordinates(
    platNomor: string,
    currentLat: number,
    currentLng: number,
  ): Promise<boolean> {
    try {
      // Ambil beberapa data location cache terakhir
      const recentLocations = await this.prisma.motorLocationCache.findMany({
        where: {
          motor: { plat_nomor: platNomor },
        },
        orderBy: { gps_time: 'desc' },
        take: 3,
        select: { lat: true, lng: true, gps_time: true },
      });

      if (recentLocations.length === 0) return false;

      // Check jika semua koordinat sama dalam 30 menit terakhir
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const stagnantLocations = recentLocations.filter(
        (loc) =>
          loc.gps_time > thirtyMinutesAgo &&
          Math.abs(loc.lat - currentLat) < 0.0001 && // ~11 meter
          Math.abs(loc.lng - currentLng) < 0.0001,
      );

      return stagnantLocations.length >= 2; // Jika 2 dari 3 data sama, consider stagnant
    } catch (error) {
      this.logger.debug(
        `Error checking stagnant coordinates for ${platNomor}:`,
        error,
      );
      return false;
    }
  }

  /**
   * NEW: Handle sync failure dengan update status yang tepat
   */
  private async handleSyncFailure(
    motor: MotorForSync,
    error: any,
  ): Promise<void> {
    try {
      let gpsStatus: motors_gps_status = motors_gps_status.Offline;
      const errorMessage = this.getErrorMessage(error);

      // Tentukan status error yang lebih spesifik
      if (
        errorMessage.includes('IMEI') ||
        errorMessage.includes('device not found')
      ) {
        gpsStatus = motors_gps_status.NoImei;
      } else if (
        errorMessage.includes('token') ||
        errorMessage.includes('auth') ||
        errorMessage.includes('API')
      ) {
        gpsStatus = motors_gps_status.Error;
      } else if (errorMessage.includes('IOPGPS indicates offline')) {
        gpsStatus = motors_gps_status.Offline;
      }

      await this.prisma.motor.update({
        where: { id: motor.id },
        data: {
          gps_status: gpsStatus,
          last_update: new Date(), // Update timestamp meski gagal
        },
      });

      this.logger.warn(
        `Updated GPS status for ${motor.plat_nomor} to ${gpsStatus}: ${errorMessage}`,
      );

      // Emit status update via WebSocket
      const statusUpdate: IopgpsLocationUpdate = {
        motorId: motor.id,
        plat_nomor: motor.plat_nomor,
        imei: motor.imei,
        lat: 0,
        lng: 0,
        address: `Sync failed: ${errorMessage}`,
        last_update: new Date().toISOString(),
        location_status: 'none',
        timestamp: new Date().toISOString(),
      };
      this.iopgpsEventsService.emitLocationUpdate(statusUpdate);
    } catch (updateError) {
      this.logger.error(
        `Failed to update GPS status for ${motor.plat_nomor}:`,
        updateError,
      );
    }
  }

  private validateCoordinates(
    lat: number,
    lng: number,
    platNomor: string,
  ): void {
    if (isNaN(lat) || isNaN(lng)) {
      throw new Error('Invalid coordinate format');
    }

    // Validasi range koordinat Indonesia
    if (lat < -11 || lat > 6 || lng < 95 || lng > 141) {
      throw new Error('Coordinates outside Indonesia range');
    }
  }

  /**
   * IMPROVED: Get motors untuk sync dengan debug info
   */
  private async getMotorsForSync(): Promise<MotorForSync[]> {
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000); // 1 menit untuk testing

    const motors = await this.prisma.motor.findMany({
      where: {
        imei: { not: null },
        status: { in: ['tersedia', 'disewa'] },
        OR: [{ last_update: { lt: oneMinuteAgo } }, { last_update: null }],
      },
      select: {
        id: true,
        imei: true,
        plat_nomor: true,
        last_update: true,
        gps_status: true,
      },
      orderBy: [
        { last_update: 'asc' }, // Prioritaskan yang paling lama tidak update
        { plat_nomor: 'asc' },
      ],
    });

    // Debug info
    if (motors.length > 0) {
      this.logger.debug(`Found ${motors.length} motors for sync:`);
      motors.forEach((motor) => {
        const lastUpdateStr = motor.last_update
          ? motor.last_update.toISOString()
          : 'never';
        this.logger.debug(
          `- ${motor.plat_nomor}: last_update=${lastUpdateStr}, gps_status=${motor.gps_status}`,
        );
      });
    }

    return motors;
  }

  /**
   * IMPROVED: Manual sync untuk motor tertentu
   */
  async syncSingleMotor(
    motorId: number,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const motor = await this.prisma.motor.findUnique({
        where: { id: motorId },
        select: {
          id: true,
          imei: true,
          plat_nomor: true,
          gps_status: true,
          last_update: true,
        },
      });

      if (!motor?.imei) {
        return { success: false, message: 'Motor atau IMEI tidak ditemukan' };
      }

      this.logger.log(
        `Manual sync triggered for motor ${motor.plat_nomor} (Current GPS Status: ${motor.gps_status})`,
      );

      await this.processSingleMotor(motor);

      return {
        success: true,
        message: `Berhasil sync lokasi untuk ${motor.plat_nomor}`,
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`Manual sync failed for motor ${motorId}:`, error);
      return { success: false, message: `Gagal sync: ${errorMessage}` };
    }
  }

  /**
   * IMPROVED: Force sync dengan reset failure count
   */
  async forceSync(): Promise<SyncOperationResult> {
    this.logger.log('Manual force sync triggered');
    this.consecutiveFailures = 0;

    const result = await this.syncMotorLocations();
    await this.cacheManager.del('motors_with_location_status');

    return result;
  }

  /**
   * NEW: Test method untuk debug status per motor
   */
  async testMotorStatus(motorId: number): Promise<any> {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
      select: { id: true, imei: true, plat_nomor: true, gps_status: true },
    });

    if (!motor?.imei) {
      return { error: 'Motor atau IMEI tidak ditemukan' };
    }

    try {
      const location = await this.apiService.getDeviceLocation(
        motor.imei,
        false,
      );

      const lat = location.lat ? parseFloat(location.lat) : 0;
      const lng = location.lng ? parseFloat(location.lng) : 0;

      const analysis = {
        motor: motor.plat_nomor,
        imei: motor.imei,
        current_gps_status: motor.gps_status,
        iopgps_response: {
          code: location.code,
          result: location.result,
          message: location.message,
          gpsTime: location.gpsTime
            ? new Date(location.gpsTime * 1000).toISOString()
            : null,
          gpsTimeUnix: location.gpsTime,
          hasCoords: !!(location.lat && location.lng),
          coordinates:
            location.lat && location.lng ? { lat: lat, lng: lng } : null,
        },
        status_analysis: {
          is_offline_indicator:
            this.isOfflineIndicator(location.result || '') ||
            this.isOfflineIndicator(location.message || ''),
          gps_time_fresh: location.gpsTime
            ? Date.now() / 1000 - location.gpsTime < 600
            : false, // 10 menit
          gps_time_diff_minutes: location.gpsTime
            ? Math.floor((Date.now() / 1000 - location.gpsTime) / 60)
            : null,
          calculated_status: await this.determineGpsStatusFromIopgps(
            location,
            lat,
            lng,
            motor.plat_nomor,
          ), // Tambah await
        },
      };

      this.logger.debug(`Status analysis for ${motor.plat_nomor}:`, analysis);
      return analysis;
    } catch (error) {
      return {
        motor: motor.plat_nomor,
        error: this.getErrorMessage(error),
        calculated_status: motors_gps_status.Offline,
      };
    }
  }

  // ========== EVENT EMITTERS ==========

  private emitSyncStarted(): void {
    const update: IopgpsSyncUpdate = {
      type: 'sync_started',
      timestamp: new Date().toISOString(),
    };
    this.iopgpsEventsService.emitSyncUpdate(update);
  }

  private emitSyncCompleted(results: SyncOperationResult): void {
    const update: IopgpsSyncUpdate = {
      type: 'sync_completed',
      success: results.success,
      failed: results.failed,
      total: results.total,
      duration: results.duration,
      timestamp: new Date().toISOString(),
      errors: results.errors.length > 0 ? results.errors : undefined,
    };
    this.iopgpsEventsService.emitSyncUpdate(update);
  }

  private emitSyncFailed(results: SyncOperationResult, error: string): void {
    const update: IopgpsSyncUpdate = {
      type: 'sync_failed',
      success: results.success,
      failed: results.failed,
      total: results.total,
      duration: results.duration,
      timestamp: new Date().toISOString(),
      errors: [...results.errors, error],
    };
    this.iopgpsEventsService.emitSyncUpdate(update);
  }

  private emitLocationUpdate(
    motor: MotorForSync,
    updateData: LocationUpdateData,
  ): void {
    const locationUpdate: IopgpsLocationUpdate = {
      motorId: motor.id,
      plat_nomor: motor.plat_nomor,
      imei: motor.imei,
      lat: updateData.lat,
      lng: updateData.lng,
      address: updateData.last_known_address || undefined,
      last_update: updateData.last_update.toISOString(),
      location_status:
        updateData.gps_status === motors_gps_status.Online
          ? 'realtime'
          : 'none',
      timestamp: new Date().toISOString(),
    };
    this.iopgpsEventsService.emitLocationUpdate(locationUpdate);
  }

  // ========== PUBLIC METHODS ==========

  async updateMotorLocationManually(
    motorId: number,
    lat: number,
    lng: number,
  ): Promise<void> {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
      select: { plat_nomor: true, imei: true, gps_status: true },
    });

    if (!motor) {
      throw new Error(`Motor with ID ${motorId} not found`);
    }

    // Tentukan status berdasarkan apakah koordinat valid
    const gpsStatus =
      lat && lng && lat !== 0 && lng !== 0
        ? motors_gps_status.Online
        : motors_gps_status.Offline;

    const updateData: LocationUpdateData = {
      lat,
      lng,
      last_update: new Date(),
      gps_status: gpsStatus,
    };

    await this.prisma.motor.update({
      where: { id: motorId },
      data: updateData,
    });

    const locationUpdate: IopgpsLocationUpdate = {
      motorId,
      plat_nomor: motor.plat_nomor,
      imei: motor.imei || '',
      lat,
      lng,
      last_update: updateData.last_update.toISOString(),
      location_status:
        gpsStatus === motors_gps_status.Online ? 'realtime' : 'none',
      timestamp: new Date().toISOString(),
    };

    this.iopgpsEventsService.emitLocationUpdate(locationUpdate);

    this.logger.log(
      `Manual location update for ${motor.plat_nomor} (GPS Status: ${gpsStatus})`,
    );
    await this.cacheManager.del('motors_with_location_status');
  }

  async getMotorsWithLocationStatus(): Promise<MotorWithLocationStatus[]> {
    const cacheKey = 'motors_with_location_status';
    const cached =
      await this.cacheManager.get<MotorWithLocationStatus[]>(cacheKey);

    if (cached) {
      return cached;
    }

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
        gps_status: true,
      },
      orderBy: { plat_nomor: 'asc' },
    });

    const result: MotorWithLocationStatus[] = motors.map((motor) => {
      const locationAge = motor.last_update
        ? Date.now() - motor.last_update.getTime()
        : null;

      const isFresh =
        locationAge !== null && locationAge <= FALLBACK_CONFIG.MAX_LOCATION_AGE;

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
        location_status: motor.last_update
          ? isFresh
            ? 'realtime'
            : 'stale'
          : 'none',
        last_update_age: locationAge ? Math.floor(locationAge / 1000) : null,
      };
    });

    await this.cacheManager.set(cacheKey, result, CACHE_TTL.MOTORS_LIST);
    return result;
  }

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
        gps_status: true,
      },
    });

    if (!motor) {
      return null;
    }

    const locationAge = motor.last_update
      ? Date.now() - motor.last_update.getTime()
      : null;

    const isFresh =
      locationAge !== null && locationAge <= FALLBACK_CONFIG.MAX_LOCATION_AGE;

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
      location_status: motor.last_update
        ? isFresh
          ? 'cached'
          : 'stale'
        : 'none',
      last_update_age: locationAge ? Math.floor(locationAge / 1000) : null,
    };
  }

  getLastSyncTime(): Date | null {
    return this.lastSyncTime;
  }

  getSyncCycleInfo(): { cycle: number; type: 'location' | 'status' } {
    return {
      cycle: 1,
      type: 'location',
    };
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return 'Unknown error';
  }
}

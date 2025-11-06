// src/motor/motor-gps.service.ts
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IopgpsService } from '../iopgps/iopgps.service';
import {
  MotorEventsService,
  MotorLocationUpdate,
} from '../websocket/services/motor-events.service';
import { MotorWithIopgps, MileageHistory, LocationCache } from '../types/motor';
import {
  IMotorGpsService,
  GpsDashboardResult,
  VehicleStatusResult,
  SyncLocationResult,
} from './interfaces/motor-service.interface';
import {
  IopgpsProcessedLocation,
  MotorLocationCacheData,
  GpsServiceResponse,
} from './interfaces/motor-gps.interface';
import { DeviceLocationResponse } from '../iopgps/interfaces/responses.interface';
import { Decimal } from '@prisma/client/runtime/library';
import { motors_gps_status } from '@prisma/client';

// Interface untuk Prisma motor dengan relations
interface PrismaMotorWithRelations {
  id: number;
  plat_nomor: string;
  merk: string;
  model: string;
  tahun: number;
  harga: number;
  no_gsm?: string | null;
  imei?: string | null;
  status: string;
  device_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  last_update?: Date | null;
  gps_status?: motors_gps_status | null;
  total_mileage?: Decimal | null;
  last_known_address?: string | null;
  last_mileage_sync?: Date | null;
  created_at: Date;
  updated_at: Date;
  mileage_history?: Array<{
    id: number;
    motor_id: number;
    imei: string;
    start_time: Date;
    end_time: Date;
    distance_km: Decimal;
    run_time_seconds: number;
    average_speed_kmh: Decimal;
    period_date: Date;
    created_at: Date;
    updated_at: Date;
  }>;
  location_cache?: Array<{
    id: number;
    motor_id: number;
    imei: string;
    lat: number;
    lng: number;
    address?: string | null;
    speed?: Decimal | null;
    direction?: number | null;
    gps_time: Date;
    location_type: string;
    created_at: Date;
  }>;
  sewas?: Array<{
    id: number;
    penyewa: {
      id: number;
      nama: string;
      no_whatsapp: string;
    };
  }>;
}

@Injectable()
export class MotorGpsService implements IMotorGpsService {
  private readonly logger = new Logger(MotorGpsService.name);

  constructor(
    private prisma: PrismaService,
    private iopgpsService: IopgpsService,
    private motorEventsService: MotorEventsService,
  ) {}

  /**
   * Validasi IMEI dengan IOPGPS
   */
  async validateImeiWithIopgps(imei: string): Promise<boolean> {
    if (!imei) return false;

    try {
      const deviceInfo = await this.iopgpsService.getDeviceLocation(imei);
      return deviceInfo.code === 0 && this.isDeviceOnline(deviceInfo);
    } catch (error) {
      this.logger.warn(`IMEI validation failed for ${imei}:`, error);
      return false;
    }
  }

  /**
   * Get vehicle status dari IOPGPS
   */
  async getVehicleStatus(motorId: number): Promise<VehicleStatusResult> {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
      select: { imei: true, plat_nomor: true },
    });

    if (!motor) {
      throw new NotFoundException(`Motor dengan ID ${motorId} tidak ditemukan`);
    }

    if (!motor.imei) {
      throw new BadRequestException('Motor tidak memiliki IMEI');
    }

    try {
      const vehicleStatus = await this.iopgpsService.getVehicleStatus(
        motor.plat_nomor,
        undefined,
      );

      const motorStatus = vehicleStatus.find(
        (status) => status.imei === motor.imei,
      );

      return {
        success: true,
        data: motorStatus || null,
        message: motorStatus
          ? 'Vehicle status retrieved successfully'
          : 'No vehicle status found',
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      throw new BadRequestException(
        `Gagal mengambil status kendaraan: ${errorMessage}`,
      );
    }
  }

  /**
   * FIXED: Get motors dengan data GPS dari database (bukan real-time langsung dari IOPGPS)
   */
  async findWithGps(): Promise<MotorWithIopgps[]> {
    const motors = await this.prisma.motor.findMany({
      include: {
        mileage_history: {
          orderBy: { period_date: 'desc' },
          take: 1,
        },
        location_cache: {
          orderBy: { gps_time: 'desc' },
          take: 1,
        },
        sewas: {
          include: {
            penyewa: {
              select: {
                id: true,
                nama: true,
                no_whatsapp: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
          take: 5,
        },
      },
      orderBy: { plat_nomor: 'asc' },
    });

    return motors.map(
      (motor): MotorWithIopgps =>
        this.convertPrismaMotorToMotorWithIopgps(motor),
    );
  }

  /**
   * FIXED: Get real-time location hanya untuk motor tertentu (manual refresh)
   */
  async getRealTimeLocation(
    motorId: number,
  ): Promise<GpsServiceResponse<IopgpsProcessedLocation>> {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
      select: { imei: true, plat_nomor: true },
    });

    if (!motor?.imei) {
      return {
        success: false,
        message: 'Motor tidak memiliki IMEI',
        timestamp: new Date(),
        metadata: { source: 'database' },
      };
    }

    const startTime = Date.now();

    try {
      const location = await this.iopgpsService.getDeviceLocation(motor.imei);
      const processedData = this.processIopgpsLocation(location);

      if (processedData) {
        // FIXED: Update database HANYA koordinat, TIDAK update gps_status
        await this.updateMotorCoordinatesOnly(motorId, processedData);

        return {
          success: true,
          data: processedData,
          message: 'Real-time location retrieved successfully',
          timestamp: new Date(),
          metadata: {
            source: 'iopgps',
            responseTime: Date.now() - startTime,
          },
        };
      } else {
        return {
          success: false,
          message: location.result || 'No valid location data',
          timestamp: new Date(),
          metadata: {
            source: 'iopgps',
            responseTime: Date.now() - startTime,
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        message: this.getErrorMessage(error),
        timestamp: new Date(),
        metadata: {
          source: 'iopgps',
          responseTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * FIXED: Sync lokasi manual - hanya update database dan emit event
   */
  async syncMotorLocation(motorId: number): Promise<SyncLocationResult> {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
    });

    if (!motor) {
      throw new NotFoundException(`Motor dengan ID ${motorId} tidak ditemukan`);
    }

    if (!motor.imei) {
      throw new BadRequestException('Motor tidak memiliki IMEI');
    }

    try {
      const gpsResponse = await this.getRealTimeLocation(motorId);

      if (gpsResponse.success && gpsResponse.data) {
        const processedData = gpsResponse.data;

        // FIXED: Determine status untuk UI saja, tidak save ke database
        const uiGpsStatus = this.determineGpsStatus(processedData);

        // Emit WebSocket event untuk location update
        const locationUpdate: MotorLocationUpdate = {
          motorId,
          plat_nomor: motor.plat_nomor,
          lat: processedData.lat,
          lng: processedData.lng,
          speed: processedData.speed,
          direction: processedData.direction,
          address: processedData.address,
          last_update: processedData.last_update.toISOString(),
          gps_status: uiGpsStatus, // Hanya untuk UI, tidak save ke database
        };
        this.motorEventsService.emitLocationUpdate(locationUpdate);

        return {
          success: true,
          data: {
            id: motorId,
            plat_nomor: motor.plat_nomor,
            lat: processedData.lat,
            lng: processedData.lng,
            last_update: processedData.last_update,
          },
          message: 'Lokasi motor berhasil disinkronisasi',
        };
      } else {
        throw new Error(gpsResponse.message);
      }
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      throw new BadRequestException(
        `Gagal sinkronisasi lokasi: ${errorMessage}`,
      );
    }
  }

  /**
   * FIXED: Update motor HANYA koordinat, TIDAK update gps_status
   */
  private async updateMotorCoordinatesOnly(
    motorId: number,
    processedData: IopgpsProcessedLocation,
  ): Promise<void> {
    // FIXED: HANYA update koordinat dan timestamp, BIARKAN gps_status sesuai kondisi asli
    await this.prisma.motor.update({
      where: { id: motorId },
      data: {
        lat: processedData.lat,
        lng: processedData.lng,
        last_update: processedData.last_update,
        last_known_address: processedData.address,
        // ❌ TIDAK update gps_status - biarkan sesuai kondisi real device
      },
    });

    // Cache location untuk tracking history (tanpa conditional)
    await this.cacheLocation({
      motor_id: motorId,
      imei: '', // akan diisi oleh caller jika needed
      lat: processedData.lat,
      lng: processedData.lng,
      address: processedData.address,
      speed: processedData.speed,
      direction: processedData.direction,
      gps_time: processedData.last_update,
    });
  }

  /**
   * FIXED: Determine GPS status untuk UI saja (tidak save ke database)
   */
  private determineGpsStatus(data: IopgpsProcessedLocation): string {
    // Check jika koordinat valid dan data fresh
    const isDataValid =
      data.lat !== null &&
      data.lng !== null &&
      data.lat !== 0 &&
      data.lng !== 0 &&
      !isNaN(data.lat) &&
      !isNaN(data.lng);

    const isDataFresh =
      data.last_update &&
      Date.now() - data.last_update.getTime() < 24 * 60 * 60 * 1000; // 24 jam

    // Validasi range koordinat Indonesia
    const isInIndonesiaRange =
      data.lat >= -11 && data.lat <= 6 && data.lng >= 95 && data.lng <= 141;

    return isDataValid && isDataFresh && isInIndonesiaRange
      ? 'Online'
      : 'Offline';
  }

  /**
   * FIXED: Convert Prisma motor object to MotorWithIopgps interface
   */
  private convertPrismaMotorToMotorWithIopgps(
    motor: PrismaMotorWithRelations,
  ): MotorWithIopgps {
    const mileageHistory: MileageHistory[] = (motor.mileage_history || []).map(
      (item) => ({
        id: item.id,
        motor_id: item.motor_id,
        imei: item.imei,
        start_time: item.start_time.toISOString(),
        end_time: item.end_time.toISOString(),
        distance_km: this.safeConvertDecimalToNumber(item.distance_km),
        run_time_seconds: item.run_time_seconds,
        average_speed_kmh: this.safeConvertDecimalToNumber(
          item.average_speed_kmh,
        ),
        period_date: item.period_date.toISOString(),
        created_at: item.created_at.toISOString(),
        updated_at: item.updated_at.toISOString(),
      }),
    );

    const locationCache: LocationCache[] = (motor.location_cache || []).map(
      (item) => ({
        id: item.id,
        motor_id: item.motor_id,
        imei: item.imei,
        lat: item.lat,
        lng: item.lng,
        address: item.address || undefined,
        speed: item.speed
          ? this.safeConvertDecimalToNumber(item.speed)
          : undefined,
        direction: item.direction || undefined,
        gps_time: item.gps_time.toISOString(),
        location_type: item.location_type,
        created_at: item.created_at.toISOString(),
      }),
    );

    // Determine iopgps_data berdasarkan data yang ada di database
    const iopgpsData = motor.last_update
      ? {
          location: {
            lat: motor.lat || 0,
            lng: motor.lng || 0,
            address: motor.last_known_address || 'Lokasi tidak diketahui',
            speed: 0,
            direction: 0,
            gps_time: motor.last_update.toISOString(),
          },
          status:
            motor.gps_status === motors_gps_status.Online
              ? 'online'
              : 'offline',
          online: motor.gps_status === motors_gps_status.Online,
          last_update: motor.last_update.toISOString(),
        }
      : undefined;

    return {
      id: motor.id,
      plat_nomor: motor.plat_nomor,
      merk: motor.merk,
      model: motor.model,
      tahun: motor.tahun,
      harga: motor.harga,
      no_gsm: motor.no_gsm || undefined,
      imei: motor.imei || undefined,
      status: motor.status as 'tersedia' | 'disewa' | 'perbaikan',
      device_id: motor.device_id || undefined,
      lat: motor.lat || undefined,
      lng: motor.lng || undefined,
      last_update: motor.last_update?.toISOString(),
      gps_status: motor.gps_status || motors_gps_status.NoImei,
      total_mileage: motor.total_mileage
        ? this.safeConvertDecimalToNumber(motor.total_mileage)
        : 0,
      last_known_address: motor.last_known_address || undefined,
      last_mileage_sync: motor.last_mileage_sync?.toISOString(),
      created_at: motor.created_at.toISOString(),
      updated_at: motor.updated_at.toISOString(),
      mileage_history: mileageHistory,
      location_cache: locationCache,
      sewas: motor.sewas || [],
      iopgps_data: iopgpsData,
    };
  }

  /**
   * FIXED: Get GPS dashboard summary dari data database
   */
  async getGpsDashboard(): Promise<GpsDashboardResult> {
    const motors = await this.findWithGps();

    const summary = {
      total: motors.length,
      online: motors.filter((m) => m.gps_status === motors_gps_status.Online)
        .length,
      offline: motors.filter((m) => m.gps_status === motors_gps_status.Offline)
        .length,
      no_imei: motors.filter(
        (m) => m.gps_status === motors_gps_status.NoImei || !m.imei,
      ).length,
      error: motors.filter((m) => m.gps_status === motors_gps_status.Error)
        .length,
      moving: motors.filter(
        (m) =>
          m.iopgps_data?.location?.speed && m.iopgps_data.location.speed > 5,
      ).length,
      parked: motors.filter(
        (m) =>
          m.iopgps_data?.location?.speed && m.iopgps_data.location.speed <= 5,
      ).length,
      lastUpdated: new Date(),
    };

    return {
      success: true,
      data: {
        summary,
        recentUpdates: motors.slice(0, 10),
      },
      message: 'GPS dashboard data retrieved successfully',
    };
  }

  /**
   * Check if device is online based on IOPGPS response
   */
  private isDeviceOnline(location: DeviceLocationResponse): boolean {
    if (location.code !== 0) {
      return false;
    }

    // Check jika device offline berdasarkan data dari IOPGPS
    const isOffline = this.checkDeviceOfflineIndicators(location);
    return !isOffline;
  }

  /**
   * Check offline indicators dari raw IOPGPS response
   */
  private checkDeviceOfflineIndicators(
    location: DeviceLocationResponse,
  ): boolean {
    // 1. Check response code
    if (location.code !== 0) {
      return true;
    }

    // 2. Check jika data lokasi tidak valid
    if (
      !location.lat ||
      !location.lng ||
      location.lat === '0' ||
      location.lng === '0'
    ) {
      return true;
    }

    // 3. Check GPS time (jika terlalu lama, device mungkin offline)
    if (location.gpsTime) {
      const gpsTime = new Date(location.gpsTime * 1000);
      const now = new Date();
      const timeDiffHours =
        (now.getTime() - gpsTime.getTime()) / (1000 * 60 * 60);

      // Jika data GPS lebih dari 24 jam, consider offline
      if (timeDiffHours > 24) {
        return true;
      }
    }

    // 4. Check additional offline indicators dari IOPGPS
    if (location.result && location.result.toLowerCase().includes('offline')) {
      return true;
    }

    return false;
  }

  // ========== HELPER METHODS ==========

  private safeConvertDecimalToNumber(decimalValue: Decimal): number {
    try {
      return decimalValue.toNumber();
    } catch (error) {
      this.logger.warn('Failed to convert decimal to number:', error);
      return 0;
    }
  }

  private processIopgpsLocation(
    location: DeviceLocationResponse,
  ): IopgpsProcessedLocation | null {
    if (location.code !== 0) {
      return null;
    }

    const lat = this.safeParseFloat(location.lat);
    const lng = this.safeParseFloat(location.lng);
    const speed = location.speed
      ? this.safeParseFloat(location.speed.toString())
      : 0;
    const direction = location.direction
      ? this.safeParseFloat(location.direction.toString())
      : 0;
    const lastUpdate = this.safeParseDate(location.gpsTime);

    if (lat === null || lng === null) {
      return null;
    }

    return {
      lat,
      lng,
      last_update: lastUpdate,
      speed,
      direction,
      address: location.address || 'Lokasi tidak diketahui',
      source: 'iopgps',
    };
  }

  /**
   * FIXED: Simplified cache method
   */
  private async cacheLocation(data: MotorLocationCacheData): Promise<void> {
    try {
      await this.prisma.motorLocationCache.create({
        data: {
          motor_id: data.motor_id,
          imei: data.imei,
          lat: data.lat,
          lng: data.lng,
          address: data.address,
          speed: data.speed,
          direction: data.direction,
          gps_time: data.gps_time,
          location_type: data.location_type || 'gps',
        },
      });
    } catch (error) {
      this.logger.error('Failed to cache motor location:', error);
      // Tidak perlu throw error, cukup log
    }
  }

  private safeParseFloat(value: string | undefined): number | null {
    if (!value) return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }

  private safeParseDate(timestamp: number | undefined): Date {
    return new Date((timestamp || 0) * 1000);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error occurred';
  }

  // ========== EXISTING PUBLIC METHODS ==========

  async getAccurateGpsStatus(
    motorId: number,
  ): Promise<{ gps_status: motors_gps_status; last_update: Date | null }> {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
      select: { gps_status: true, last_update: true },
    });

    if (!motor) {
      throw new NotFoundException(`Motor dengan ID ${motorId} tidak ditemukan`);
    }

    return {
      gps_status: motor.gps_status || motors_gps_status.NoImei,
      last_update: motor.last_update,
    };
  }

  async forceRefreshGpsStatus(
    motorId: number,
  ): Promise<{ gps_status: string; success: boolean; message: string }> {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
      select: { imei: true, plat_nomor: true, gps_status: true },
    });

    if (!motor) {
      throw new NotFoundException(`Motor dengan ID ${motorId} tidak ditemukan`);
    }

    if (!motor.imei) {
      return {
        gps_status: 'NoImei',
        success: false,
        message: 'Motor tidak memiliki IMEI',
      };
    }

    try {
      const gpsResponse = await this.getRealTimeLocation(motorId);

      if (gpsResponse.success && gpsResponse.data) {
        const processedData = gpsResponse.data;
        const accurateStatus = this.determineGpsStatus(processedData);

        // FIXED: Hanya emit WebSocket event, TIDAK update database
        const locationUpdate: MotorLocationUpdate = {
          motorId,
          plat_nomor: motor.plat_nomor,
          lat: processedData.lat,
          lng: processedData.lng,
          speed: processedData.speed,
          direction: processedData.direction,
          address: processedData.address,
          last_update: processedData.last_update.toISOString(),
          gps_status: accurateStatus, // Hanya untuk UI
        };
        this.motorEventsService.emitLocationUpdate(locationUpdate);

        return {
          gps_status: accurateStatus,
          success: true,
          message: `Status GPS: ${accurateStatus} (hanya tampilan UI)`,
        };
      } else {
        return {
          gps_status: 'Offline',
          success: false,
          message: gpsResponse.message || 'Gagal mendapatkan data GPS',
        };
      }
    } catch (error) {
      this.logger.error(
        `Error force refreshing GPS status for motor ${motorId}:`,
        error,
      );

      return {
        gps_status: 'Error',
        success: false,
        message: 'Error saat refresh status GPS',
      };
    }
  }
}

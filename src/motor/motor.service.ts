// src/motor/motor.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MotorGpsService } from './motor-gps.service';
import { MotorMileageService } from './motor-mileage.service';
import { CreateMotorDto } from './dto/create-motor.dto';
import { UpdateMotorDto } from './dto/update-motor.dto';
import { MotorCoreService } from './services/motor-core.service';
import { MotorServiceService } from './services/motor-service.service';
import { MotorValidatorService } from './services/motor-validator.service';
import {
  MotorEventsService,
  MotorStatusUpdate,
  MotorServiceUpdate,
} from '../websocket/services/motor-events.service';
import {
  MotorResponseDto,
  MotorDetailResponseDto,
  MotorStatisticsResponseDto,
} from './dto/motor-response.dto';

// Constants untuk konsistensi
const MOTOR_STATUS = {
  TERSEDIA: 'tersedia',
  DISEWA: 'disewa',
  PERBAIKAN: 'perbaikan',
  PENDING_PERBAIKAN: 'pending_perbaikan',
} as const;

const SERVICE_CONFIG = {
  DEFAULT_MILEAGE_THRESHOLD: 800,
  SERVICE_REMINDER_DAYS: 30,
} as const;

// Interface untuk relation items
interface MileageHistoryItem {
  id: number;
  motor_id: number;
  imei: string;
  start_time: Date;
  end_time: Date;
  distance_km: unknown;
  run_time_seconds: number;
  average_speed_kmh: unknown;
  period_date: Date;
  created_at: Date;
  updated_at: Date;
}

interface LocationCacheItem {
  id: number;
  motor_id: number;
  imei: string;
  lat: number;
  lng: number;
  address?: string | null;
  speed?: unknown;
  direction?: number | null;
  gps_time: Date;
  location_type: string;
  created_at: Date;
}

interface ServiceRecordItem {
  id: number;
  motor_id: number;
  status: string;
  service_type: string;
  service_date: Date;
  estimated_completion?: Date | null;
  actual_completion?: Date | null;
  service_location: string;
  service_technician: string;
  parts?: unknown;
  services?: unknown;
  estimated_cost?: unknown;
  actual_cost?: unknown;
  notes?: string | null;
  service_notes?: string | null;
  mileage_at_service?: unknown;
  created_at: Date;
  updated_at: Date;
}

interface SewaItem {
  id: number;
  penyewa: {
    id: number;
    nama: string;
    no_whatsapp: string;
  };
}

interface MotorWithRelations {
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
  gps_status?: string | null;
  total_mileage?: unknown;
  last_known_address?: string | null;
  last_mileage_sync?: Date | null;
  service_technician?: string | null;
  last_service_date?: Date | null;
  service_notes?: string | null;
  created_at: Date;
  updated_at: Date;
  sewas?: SewaItem[];
  mileage_history?: MileageHistoryItem[];
  location_cache?: LocationCacheItem[];
  service_records?: ServiceRecordItem[];
}

// Utility functions untuk conversion (sebagai fallback)
function safeConvertDecimal(value: unknown): number {
  if (value === null || value === undefined) return 0;

  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;

  // Handle Prisma Decimal type
  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber: unknown }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }

  return 0;
}

function safeConvertJsonToStringArray(value: unknown): string[] {
  if (!value) return [];

  try {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }

    if (typeof value === 'string') {
      const parsed = safeJsonParse<string[]>(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    }

    return [];
  } catch {
    return [];
  }
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

@Injectable()
export class MotorService {
  private readonly logger = new Logger(MotorService.name);

  constructor(
    private prisma: PrismaService,
    private motorGpsService: MotorGpsService,
    private motorMileageService: MotorMileageService,
    private motorCoreService: MotorCoreService,
    private motorServiceService: MotorServiceService,
    private motorValidatorService: MotorValidatorService,
    private motorEventsService: MotorEventsService,
  ) {}

  /**
   * Get all motors
   */
  async findAll(): Promise<MotorResponseDto[]> {
    const motors = await this.motorCoreService.findAll();
    return motors.map((motor) => MotorResponseDto.fromPrisma(motor));
  }

  /**
   * Get single motor dengan data lengkap
   */
  async findOne(id: number): Promise<MotorDetailResponseDto> {
    const motor = await this.motorCoreService.findOneWithRelations(id);

    if (!motor) {
      throw new NotFoundException(`Motor dengan ID ${id} tidak ditemukan`);
    }

    // Convert to DTO - handle type mismatch
    const motorDto = this.convertToDetailDto(motor);

    // Enhance dengan data GPS real-time jika tersedia
    if (motor.imei && motor.gps_status !== 'NoImei') {
      await this.enhanceWithGpsData(id, motorDto);
    }

    return motorDto;
  }

  /**
   * Create new motor dengan Automatic Initial Sync
   */
  async create(createMotorDto: CreateMotorDto): Promise<MotorResponseDto> {
    await this.motorValidatorService.validateCreateData(createMotorDto);

    const createData =
      this.motorValidatorService.buildCreateData(createMotorDto);
    const motor = await this.motorCoreService.create(createData);

    // Automatic Initial Sync untuk motor baru dengan IMEI
    if (motor.imei) {
      await this.performInitialSync(motor.id, motor.imei, motor.plat_nomor);
    }

    // Emit WebSocket event
    this.motorEventsService.emitMotorCreated(motor);

    return MotorResponseDto.fromPrisma(motor);
  }

  /**
   * Update motor dengan WebSocket event
   */
  async update(
    id: number,
    updateMotorDto: UpdateMotorDto,
  ): Promise<MotorResponseDto> {
    const existingMotor = await this.motorCoreService.findOne(id);

    if (!existingMotor) {
      throw new NotFoundException(`Motor dengan ID ${id} tidak ditemukan`);
    }

    await this.motorValidatorService.validateUpdateData(
      existingMotor,
      updateMotorDto,
    );

    const updateData = this.motorValidatorService.buildUpdateData(
      existingMotor,
      updateMotorDto,
    );
    const motor = await this.motorCoreService.update(id, updateData);

    return MotorResponseDto.fromPrisma(motor);
  }

  /**
   * Delete motor dengan WebSocket event
   */
  async remove(id: number): Promise<{ message: string }> {
    const motor = await this.motorCoreService.findOne(id);
    if (!motor) {
      throw new NotFoundException(`Motor dengan ID ${id} tidak ditemukan`);
    }

    await this.motorCoreService.remove(id);

    // Emit WebSocket event
    this.motorEventsService.emitMotorDeleted(id, motor.plat_nomor);

    return { message: 'Motor berhasil dihapus' };
  }

  /**
   * Update status dengan WebSocket event
   */
  async updateStatus(id: number, status: string): Promise<MotorResponseDto> {
    const existingMotor = await this.motorCoreService.findOne(id);
    if (!existingMotor) {
      throw new NotFoundException(`Motor dengan ID ${id} tidak ditemukan`);
    }

    const oldStatus = existingMotor.status;
    const motor = await this.motorCoreService.updateStatus(id, status);

    // Emit WebSocket event untuk status change
    const statusUpdate: MotorStatusUpdate = {
      motorId: id,
      plat_nomor: motor.plat_nomor,
      oldStatus,
      newStatus: status,
      timestamp: new Date().toISOString(),
    };
    this.motorEventsService.emitStatusUpdate(statusUpdate);

    return MotorResponseDto.fromPrisma(motor);
  }

  // ========== SERVICE METHODS DENGAN WEB SOCKET ==========

  async markForService(
    id: number,
    serviceNotes?: string,
  ): Promise<MotorResponseDto> {
    const existingMotor = await this.motorCoreService.findOne(id);
    if (!existingMotor) {
      throw new NotFoundException(`Motor dengan ID ${id} tidak ditemukan`);
    }

    const motor = await this.motorServiceService.markForService(
      id,
      serviceNotes,
    );

    // Emit WebSocket event untuk status change
    const statusUpdate: MotorStatusUpdate = {
      motorId: id,
      plat_nomor: motor.plat_nomor,
      oldStatus: existingMotor.status,
      newStatus: 'pending_perbaikan',
      timestamp: new Date().toISOString(),
    };
    this.motorEventsService.emitStatusUpdate(statusUpdate);

    // Juga emit service update event
    const serviceUpdate: MotorServiceUpdate = {
      motorId: id,
      plat_nomor: motor.plat_nomor,
      serviceStatus: 'pending',
      notes: serviceNotes,
      timestamp: new Date().toISOString(),
    };
    this.motorEventsService.emitServiceUpdate(serviceUpdate);

    return MotorResponseDto.fromPrisma(motor);
  }

  async completeService(id: number): Promise<MotorResponseDto> {
    const existingMotor = await this.motorCoreService.findOne(id);
    if (!existingMotor) {
      throw new NotFoundException(`Motor dengan ID ${id} tidak ditemukan`);
    }

    const motor = await this.motorServiceService.completeService(id);

    // Emit WebSocket event
    const serviceUpdate: MotorServiceUpdate = {
      motorId: id,
      plat_nomor: motor.plat_nomor,
      serviceStatus: 'completed',
      timestamp: new Date().toISOString(),
    };
    this.motorEventsService.emitServiceUpdate(serviceUpdate);

    return MotorResponseDto.fromPrisma(motor);
  }

  async startService(
    id: number,
    technician: string,
  ): Promise<MotorResponseDto> {
    const existingMotor = await this.motorCoreService.findOne(id);
    if (!existingMotor) {
      throw new NotFoundException(`Motor dengan ID ${id} tidak ditemukan`);
    }

    const motor = await this.motorServiceService.startService(id, technician);

    // Emit WebSocket event
    const serviceUpdate: MotorServiceUpdate = {
      motorId: id,
      plat_nomor: motor.plat_nomor,
      serviceStatus: 'in_progress',
      serviceType: 'perbaikan',
      technician,
      timestamp: new Date().toISOString(),
    };
    this.motorEventsService.emitServiceUpdate(serviceUpdate);

    return MotorResponseDto.fromPrisma(motor);
  }

  async cancelService(id: number): Promise<MotorResponseDto> {
    const existingMotor = await this.motorCoreService.findOne(id);
    if (!existingMotor) {
      throw new NotFoundException(`Motor dengan ID ${id} tidak ditemukan`);
    }

    const motor = await this.motorServiceService.cancelService(id);

    // Emit WebSocket event
    const serviceUpdate: MotorServiceUpdate = {
      motorId: id,
      plat_nomor: motor.plat_nomor,
      serviceStatus: 'cancelled',
      timestamp: new Date().toISOString(),
    };
    this.motorEventsService.emitServiceUpdate(serviceUpdate);

    return MotorResponseDto.fromPrisma(motor);
  }

  // ========== QUERY METHODS ==========

  async findPendingService(): Promise<MotorResponseDto[]> {
    const motors = await this.motorServiceService.findPendingService();
    return motors.map((motor) => MotorResponseDto.fromPrisma(motor));
  }

  async findInService(): Promise<MotorResponseDto[]> {
    const motors = await this.motorServiceService.findInService();
    return motors.map((motor) => MotorResponseDto.fromPrisma(motor));
  }

  async findCompletedService(): Promise<MotorResponseDto[]> {
    const motors = await this.prisma.motor.findMany({
      where: {
        service_records: {
          some: {
            status: 'completed',
          },
        },
      },
      include: {
        service_records: {
          where: { status: 'completed' },
          orderBy: { service_date: 'desc' },
          take: 1,
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return motors.map((motor) => MotorResponseDto.fromPrisma(motor));
  }

  async findByStatus(status: string): Promise<MotorResponseDto[]> {
    const motors = await this.motorCoreService.findByStatus(status);
    return motors.map((motor) => MotorResponseDto.fromPrisma(motor));
  }

  async findMotorsNeedingService(
    mileageThreshold: number = SERVICE_CONFIG.DEFAULT_MILEAGE_THRESHOLD,
  ): Promise<MotorResponseDto[]> {
    const motors =
      await this.motorCoreService.findMotorsNeedingService(mileageThreshold);
    return motors.map((motor) => MotorResponseDto.fromPrisma(motor));
  }

  // ========== SEARCH & STATISTICS ==========

  async searchByPlateNumber(plate: string): Promise<MotorResponseDto[]> {
    const motors = await this.prisma.motor.findMany({
      where: {
        plat_nomor: {
          contains: plate,
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // Filter case-insensitive secara manual
    const filteredMotors = motors.filter((motor) =>
      motor.plat_nomor.toLowerCase().includes(plate.toLowerCase()),
    );

    return filteredMotors.map((motor) => MotorResponseDto.fromPrisma(motor));
  }

  async getMotorStatistics(): Promise<MotorStatisticsResponseDto> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(
      thirtyDaysAgo.getDate() - SERVICE_CONFIG.SERVICE_REMINDER_DAYS,
    );

    const [
      totalMotors,
      availableMotors,
      rentedMotors,
      maintenanceMotors,
      pendingServiceMotors,
      motorsNeedingService,
    ] = await Promise.all([
      this.prisma.motor.count(),
      this.prisma.motor.count({ where: { status: MOTOR_STATUS.TERSEDIA } }),
      this.prisma.motor.count({ where: { status: MOTOR_STATUS.DISEWA } }),
      this.prisma.motor.count({ where: { status: MOTOR_STATUS.PERBAIKAN } }),
      this.prisma.motor.count({
        where: { status: MOTOR_STATUS.PENDING_PERBAIKAN },
      }),
      this.prisma.motor.count({
        where: {
          status: MOTOR_STATUS.TERSEDIA,
          OR: [
            {
              total_mileage: { gte: SERVICE_CONFIG.DEFAULT_MILEAGE_THRESHOLD },
            },
            { last_service_date: { lte: thirtyDaysAgo } },
          ],
        },
      }),
    ]);

    return MotorStatisticsResponseDto.fromCounts({
      total: totalMotors,
      available: availableMotors,
      rented: rentedMotors,
      maintenance: maintenanceMotors,
      pending_service: pendingServiceMotors,
      needing_service: motorsNeedingService,
    });
  }

  // ========== PRIVATE HELPER METHODS ==========

  /**
   * Perform Automatic Initial Sync untuk motor baru
   */
  private async performInitialSync(
    motorId: number,
    imei: string,
    platNomor: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Starting automatic initial sync for motor ${platNomor} (IMEI: ${imei})`,
      );

      // 1. Sync GPS location data
      await this.syncGpsData(motorId, imei, platNomor);

      // 2. Sync mileage data
      await this.syncMileageData(motorId, platNomor);

      this.logger.log(
        `Automatic initial sync completed for motor ${platNomor}`,
      );

      // Emit sync completion event
      this.motorEventsService.emitMileageSyncComplete(
        motorId,
        true,
        `Automatic initial sync completed for ${platNomor}`,
      );
    } catch (error) {
      this.logger.error(
        `Automatic initial sync failed for motor ${platNomor}:`,
        error,
      );

      // Emit sync failure event
      this.motorEventsService.emitMileageSyncComplete(
        motorId,
        false,
        `Automatic initial sync failed: ${error.message}`,
      );
    }
  }

  /**
   * Sync GPS data untuk motor baru
   */
  private async syncGpsData(
    motorId: number,
    imei: string,
    platNomor: string,
  ): Promise<void> {
    try {
      // Gunakan motor-gps service untuk sync lokasi
      const motorsWithGps = await this.motorGpsService.findWithGps();
      const motorGpsData = motorsWithGps.find((m) => m.imei === imei);

      if (motorGpsData?.iopgps_data) {
        // Type-safe access ke data GPS
        const iopgpsData = motorGpsData.iopgps_data as any;

        // Update motor dengan data GPS yang didapat - dengan safety check
        const updateData: any = {
          last_update: new Date(),
          gps_status: iopgpsData?.status ?? 'Unknown', // ✅ ikut data asli dari IOPGPS
        };

        // Safely access nested properties
        if (iopgpsData.location?.lat && iopgpsData.location?.lng) {
          updateData.lat = iopgpsData.location.lat;
          updateData.lng = iopgpsData.location.lng;
        } else if (iopgpsData.lat && iopgpsData.lng) {
          // Fallback untuk struktur data yang berbeda
          updateData.lat = iopgpsData.lat;
          updateData.lng = iopgpsData.lng;
        }

        if (iopgpsData.location?.address) {
          updateData.last_known_address = iopgpsData.location.address;
        } else if (iopgpsData.address) {
          // Fallback untuk struktur data yang berbeda
          updateData.last_known_address = iopgpsData.address;
        }

        await this.prisma.motor.update({
          where: { id: motorId },
          data: updateData,
        });

        this.logger.debug(`GPS data synced for motor ${platNomor}`);
      } else {
        this.logger.debug(
          `No GPS data found for motor ${platNomor} with IMEI ${imei}`,
        );
      }
    } catch (error) {
      this.logger.warn(`GPS sync failed for motor ${platNomor}:`, error);
      // Jangan throw error, biarkan sync mileage tetap berjalan
    }
  }

  /**
   * Sync mileage data untuk motor baru - VERSI LEBIH AMAN
   */
  private async syncMileageData(
    motorId: number,
    platNomor: string,
  ): Promise<void> {
    try {
      // Gunakan mileage service untuk sync data mileage
      // Tambahkan timeout untuk mencegah blocking terlalu lama
      const syncPromise = this.motorMileageService.syncMileageData(motorId);

      const timeoutPromise = new Promise<{ success: boolean; message: string }>(
        (resolve) =>
          setTimeout(
            () =>
              resolve({
                success: false,
                message: 'Sync timeout after 30 seconds',
              }),
            30000,
          ),
      );

      const syncResult = await Promise.race([syncPromise, timeoutPromise]);

      if (syncResult.success) {
        this.logger.log(
          `Mileage data synced for motor ${platNomor}: ${syncResult.message}`,
        );
      } else {
        this.logger.warn(
          `Mileage sync completed with issues for motor ${platNomor}: ${syncResult.message}`,
        );
      }
    } catch (error) {
      this.logger.warn(`Mileage sync failed for motor ${platNomor}:`, error);
      // Jangan throw error, biarkan proses create motor tetap berhasil
    }
  }

  private convertToDetailDto(
    motor: MotorWithRelations,
  ): MotorDetailResponseDto {
    // Manual conversion untuk handle type mismatch
    const baseDto = MotorResponseDto.fromPrisma(motor);
    const detailDto = Object.assign(new MotorDetailResponseDto(), baseDto);

    // Convert relations manually dengan type safety
    detailDto.mileage_history =
      motor.mileage_history?.map((item: MileageHistoryItem) => ({
        id: item.id,
        motor_id: item.motor_id,
        imei: item.imei,
        start_time: item.start_time.toISOString(),
        end_time: item.end_time.toISOString(),
        distance_km: safeConvertDecimal(item.distance_km),
        run_time_seconds: item.run_time_seconds,
        average_speed_kmh: safeConvertDecimal(item.average_speed_kmh),
        period_date: item.period_date.toISOString(),
        created_at: item.created_at.toISOString(),
        updated_at: item.updated_at.toISOString(),
      })) || [];

    detailDto.location_cache =
      motor.location_cache?.map((item: LocationCacheItem) => ({
        id: item.id,
        motor_id: item.motor_id,
        imei: item.imei,
        lat: item.lat,
        lng: item.lng,
        address: item.address || undefined,
        speed: item.speed ? safeConvertDecimal(item.speed) : undefined,
        direction: item.direction || undefined,
        gps_time: item.gps_time.toISOString(),
        location_type: item.location_type,
        created_at: item.created_at.toISOString(),
      })) || [];

    detailDto.service_records =
      motor.service_records?.map((record: ServiceRecordItem) => ({
        id: record.id,
        motor_id: record.motor_id,
        status: record.status,
        service_type: record.service_type,
        service_date: record.service_date.toISOString(),
        estimated_completion: record.estimated_completion?.toISOString(),
        actual_completion: record.actual_completion?.toISOString(),
        service_location: record.service_location,
        service_technician: record.service_technician,
        parts: safeConvertJsonToStringArray(record.parts),
        services: safeConvertJsonToStringArray(record.services),
        estimated_cost: record.estimated_cost
          ? safeConvertDecimal(record.estimated_cost)
          : undefined,
        actual_cost: record.actual_cost
          ? safeConvertDecimal(record.actual_cost)
          : undefined,
        notes: record.notes || undefined,
        service_notes: record.service_notes || undefined,
        mileage_at_service: record.mileage_at_service
          ? safeConvertDecimal(record.mileage_at_service)
          : undefined,
        created_at: record.created_at.toISOString(),
        updated_at: record.updated_at.toISOString(),
      })) || [];

    detailDto.sewas =
      motor.sewas?.map((sewa: SewaItem) => ({
        id: sewa.id,
        penyewa: {
          id: sewa.penyewa.id,
          nama: sewa.penyewa.nama,
          no_whatsapp: sewa.penyewa.no_whatsapp,
        },
      })) || [];

    return detailDto;
  }

  private async enhanceWithGpsData(
    id: number,
    motorDto: MotorDetailResponseDto,
  ): Promise<void> {
    try {
      const motorsWithGps = await this.motorGpsService.findWithGps();
      const motorWithGps = motorsWithGps.find((m) => m.id === id);

      if (motorWithGps?.iopgps_data) {
        motorDto.iopgps_data = motorWithGps.iopgps_data;
      }
    } catch (error) {
      this.logger.warn(`Failed to enhance motor ${id} with GPS data:`, error);
      // Jangan throw error, biarkan response tetap berhasil tanpa data GPS
    }
  }

  // ========== SERVICE ACCESSORS ==========

  getGpsService(): MotorGpsService {
    return this.motorGpsService;
  }

  getMileageService(): MotorMileageService {
    return this.motorMileageService;
  }
}

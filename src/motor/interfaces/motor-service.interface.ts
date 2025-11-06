// src/motor/interfaces/motor-service.interface.ts
import { Motor, MotorWithIopgps, MileageHistory } from '../../types/motor';

// ✅ TAMBAHKAN IMPORT UNTUK INTERNAL TYPES
import {
  PrismaMotor,
  PrismaMotorWithRelations,
  CreateMotorData,
  ServiceInfoDataInternal,
  MotorStatistics,
} from '../../types/motor';

// ... REST OF YOUR EXISTING INTERFACES REMAIN EXACTLY THE SAME ...
export interface IMotorService {
  findAll(): Promise<Motor[]>;
  findOne(id: number): Promise<MotorWithIopgps>;
  create(createMotorDto: any): Promise<Motor>;
  update(id: number, updateMotorDto: any): Promise<Motor>;
  remove(id: number): Promise<{ message: string }>;
}

export interface IMotorGpsService {
  findWithGps(): Promise<MotorWithIopgps[]>;
  syncMotorLocation(motorId: number): Promise<SyncLocationResult>;
  getVehicleStatus(motorId: number): Promise<VehicleStatusResult>;
  getGpsDashboard(): Promise<GpsDashboardResult>;
  validateImeiWithIopgps(imei: string): Promise<boolean>;
}

export interface IMotorMileageService {
  getMileage(
    motorId: number,
    startTime: number,
    endTime?: number,
  ): Promise<MileageData>;

  syncMileageData(
    motorId: number,
    startTime?: number,
    endTime?: number,
  ): Promise<{ success: boolean; recordsAdded: number; message: string }>;

  initialFullSync(
    motorId: number,
  ): Promise<{ success: boolean; recordsAdded: number; message: string }>;

  cleanupDuplicateMileageData(
    motorId?: number,
  ): Promise<{ deleted: number; message: string }>;

  getMileageStatistics(motorId?: number): Promise<{
    totalRecords: number;
    uniqueDays: number;
    duplicates: number;
    dateRange: { start: Date; end: Date };
    totalDistance: number;
  }>;
}

// ✅ INTERFACE BARU UNTUK SERVICE LAIN - GUNAKAN INTERNAL TYPES
export interface IMotorCoreService {
  findAll(): Promise<PrismaMotor[]>;
  findOne(id: number): Promise<PrismaMotor | null>;
  findOneWithRelations(id: number): Promise<PrismaMotorWithRelations | null>;
  create(data: CreateMotorData): Promise<PrismaMotor>;
  update(id: number, data: Partial<PrismaMotor>): Promise<PrismaMotor>;
  remove(id: number): Promise<void>;
  findByStatus(status: string): Promise<PrismaMotor[]>;
  updateStatus(id: number, status: string): Promise<PrismaMotor>;
  findMotorsNeedingService(mileageThreshold?: number): Promise<PrismaMotor[]>;
}

export interface IMotorServiceService {
  markForService(id: number, serviceNotes?: string): Promise<PrismaMotor>;
  completeService(id: number): Promise<PrismaMotor>;
  findPendingService(): Promise<PrismaMotor[]>;
  findInService(): Promise<PrismaMotor[]>;
  updateServiceInfo(
    id: number,
    data: ServiceInfoDataInternal,
  ): Promise<PrismaMotor>;
  startService(id: number, technician: string): Promise<PrismaMotor>;
  cancelService(id: number): Promise<PrismaMotor>;
}

export interface IMotorConverterService {
  convertPrismaMotorToMotor(prismaMotor: PrismaMotor): Motor;
  convertPrismaMotorsToMotors(prismaMotors: PrismaMotor[]): Motor[];
  convertPrismaMotorToMotorWithIopgps(
    prismaMotor: PrismaMotorWithRelations,
  ): MotorWithIopgps;
}

export interface IMotorValidatorService {
  validateCreateData(createMotorDto: any): Promise<void>;
  validateUpdateData(
    existingMotor: PrismaMotor,
    updateMotorDto: any,
  ): Promise<void>;
  buildCreateData(createMotorDto: any): CreateMotorData;
  buildUpdateData(
    existingMotor: PrismaMotor,
    updateMotorDto: any,
  ): Partial<PrismaMotor>;
}

// ✅ EXTEND MAIN MOTOR SERVICE INTERFACE
export interface IMotorServiceExtended extends IMotorService {
  // Service methods
  markForService(id: number, serviceNotes?: string): Promise<Motor>;
  completeService(id: number): Promise<Motor>;
  findPendingService(): Promise<Motor[]>;
  findInService(): Promise<Motor[]>;
  findCompletedService(): Promise<Motor[]>;
  updateServiceInfo(id: number, data: ServiceInfoDataInternal): Promise<Motor>;
  updateStatus(id: number, status: string): Promise<Motor>;
  findByStatus(status: string): Promise<Motor[]>;
  findMotorsNeedingService(mileageThreshold?: number): Promise<Motor[]>;
  startService(id: number, technician: string): Promise<Motor>;
  cancelService(id: number): Promise<Motor>;

  // Statistics & Search
  getMotorStatistics(): Promise<MotorStatistics>;
  searchByPlateNumber(plate: string): Promise<Motor[]>;

  // Get service instances
  getGpsService(): IMotorGpsService;
  getMileageService(): IMotorMileageService;
}

// ... REST OF YOUR EXISTING RESULT INTERFACES REMAIN EXACTLY THE SAME ...
export interface SyncLocationResult {
  success: boolean;
  data: {
    id: number;
    plat_nomor: string;
    lat: number | null;
    lng: number | null;
    last_update: Date | null;
    gps_status?: string; // Opsional, tambahkan jika diperlukan
  };
  message: string;
}
export interface DeviceInfoResult {
  success: boolean;
  data: any;
  message: string;
}

export interface VehicleStatusResult {
  success: boolean;
  data: any;
  message: string;
}

export interface GpsDashboardResult {
  success: boolean;
  data: {
    summary: {
      total: number;
      online: number;
      offline: number;
      no_imei: number;
      moving: number;
      parked: number;
      lastUpdated: Date;
    };
    recentUpdates: MotorWithIopgps[];
  };
  message: string;
}

export interface MileageData {
  imei: string;
  startTime: number;
  endTime: number;
  runTime: number;
  distance: number;
  averageSpeed: number;
  period: {
    start: Date;
    end: Date;
  };
}

export interface TrackHistory {
  imei: string;
  period: {
    start: Date;
    end: Date;
  };
  points: Array<{
    lat: number;
    lng: number;
    speed: number;
    direction: number;
    gpsTime: number;
    address?: string;
  }>;
  summary: {
    totalDistance: number;
    totalDuration: number;
    averageSpeed: number;
    maxSpeed: number;
    stops: number;
  };
}

export interface MileageHistoryPaginatedResponse {
  data: MileageHistory[];
  total: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// src/motor/interfaces/mileage.interface.ts
import { Decimal } from '@prisma/client/runtime/library';
import { TrackPoint } from '../../iopgps/interfaces/responses.interface';
import { MileageHistory } from '../../types/motor';

// Strongly typed interfaces untuk IOPGPS responses
export interface IopgpsMileageResponse {
  code: number;
  result?: string;
  msg?: string;
  message?: string;
  miles?: number;
  runTime?: number;
  distance?: number;
  totalDistance?: number;
  duration?: number;
  data?:
    | {
        miles?: number;
        distance?: number;
        totalDistance?: number;
        runTime?: number;
        duration?: number;
      }
    | number
    | string;
}

export interface IopgpsTrackResponse {
  code: number;
  result?: string;
  message?: string;
  data?: TrackPoint[];
}

export interface IopgpsDeviceInfoResponse {
  code: number;
  result?: string;
  message?: string;
  data?: any;
}

// Database interfaces
export interface MotorWithImei {
  id: number;
  imei: string;
  total_mileage?: Decimal | null;
}

export interface PrismaMileageHistoryItem {
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
}

export interface MileageHistoryPaginatedResponse {
  data: MileageHistory[];
  total: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Validation interfaces
export interface MileageValidationResult {
  isValid: boolean;
  distance: number;
  runTime: number;
  error?: string;
}

export interface TrackSummary {
  totalDistance: number;
  totalDuration: number;
  averageSpeed: number;
  maxSpeed: number;
  stops: number;
}

// Error types
export class MileageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly motorId?: number,
    public readonly imei?: string,
  ) {
    super(message);
    this.name = 'MileageError';
  }
}

export class ImeiNotFoundError extends MileageError {
  constructor(motorId: number) {
    super(`Motor ${motorId} tidak memiliki IMEI`, 'IMEI_NOT_FOUND', motorId);
  }
}

export class IopgpsApiError extends MileageError {
  constructor(
    message: string,
    motorId?: number,
    imei?: string,
    public readonly iopgpsCode?: number,
  ) {
    super(message, 'IOPGPS_API_ERROR', motorId, imei);
  }
}

// Type guards untuk error handling
export function isErrorWithMessage(
  error: unknown,
): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

export function isPrismaError(error: unknown): error is {
  code: string;
  message: string;
  meta?: Record<string, unknown>;
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}

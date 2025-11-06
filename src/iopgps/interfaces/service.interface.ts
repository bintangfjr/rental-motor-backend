// src/iopgps/interfaces/service.interface.ts

/**
 * Motor data for synchronization
 */
export interface SyncMotor {
  id: number;
  imei: string | null;
  plat_nomor: string;
  lat: number | null;
  lng: number | null;
  last_update: Date | null;
}

/**
 * Motor with location status for frontend
 */
export interface MotorWithLocationStatus {
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

/**
 * Health check result
 */
export interface HealthCheckResult {
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

/**
 * Sync result for motor locations
 */
export interface SyncResult {
  success: number;
  failed: number;
  total: number;
  duration: number;
  timestamp: Date;
}

/**
 * Device info query parameters
 */
export interface DeviceInfoQuery {
  imei: string;
  account?: string;
  lang?: string;
}

/**
 * Device list query parameters
 */
export interface DeviceListQuery {
  id?: string;
  currentPage: string;
  pageSize: string;
}

/**
 * Vehicle status query parameters
 */
export interface VehicleStatusQuery {
  licenseNumber?: string;
  vin?: string;
  mapType?: string;
}

/**
 * Mileage query parameters
 */
export interface MileageQuery {
  imei: string;
  startTime: string;
  endTime?: string;
}

/**
 * Authentication credentials
 */
export interface IopgpsCredentials {
  appid: string;
  secretKey: string;
}

/**
 * Cache token info
 */
export interface TokenInfo {
  hasToken: boolean;
  refreshInProgress: boolean;
  appidConfigured: boolean;
  secretKeyConfigured: boolean;
  tokenPreview?: string;
  tokenLength?: number;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  auth: number; // calls per minute
  other: number; // calls per second
}

/**
 * API request options
 */
export interface ApiRequestOptions {
  timeout?: number;
  maxRetries?: number;
  useCache?: boolean;
}

import { DeviceLocationResponse } from '../../iopgps/interfaces/responses.interface';

/**
 * Interface untuk data GPS yang diproses dari IOPGPS
 */
export interface IopgpsProcessedLocation {
  lat: number;
  lng: number;
  last_update: Date;
  speed: number;
  direction: number;
  address: string;
  source: 'iopgps';
}

export interface IopgpsRealTimeData {
  location: {
    lat: number;
    lng: number;
    address: string;
    speed: number;
    direction: number;
    gps_time: string;
    last_update: Date;
  };
  status: 'online' | 'offline';
  online: boolean;
  last_update: string;
  raw_data?: any; // ✅ Untuk debugging
  source: 'real-time'; // ✅ Tandai sebagai data real-time
}

/**
 * Interface untuk cache lokasi motor
 */
export interface MotorLocationCacheData {
  motor_id: number;
  imei: string;
  lat: number;
  lng: number;
  address?: string;
  speed?: number;
  direction?: number;
  gps_time: Date;
  location_type?: string;
}

/**
 * Interface untuk GPS status update
 */
export interface GpsStatusUpdate {
  motorId: number;
  status: 'Online' | 'Offline' | 'NoImei' | 'Error';
  lastUpdate?: Date;
  reason?: string;
}

/**
 * Interface untuk reverse geocoding result
 */
export interface ReverseGeocodingResult {
  address: string;
  city?: string;
  district?: string;
  province?: string;
  country?: string;
  postcode?: string;
}

/**
 * Interface untuk vehicle status dari IOPGPS
 */
export interface IopgpsVehicleStatus {
  imei: string;
  licenseNumber: string;
  vin?: string;
  lat: number;
  lng: number;
  speed: number;
  direction: number;
  gpsTime: number;
  location: string;
  status: string;
  acc?: string;
  online?: string;
  locType?: string;
  mileage?: number;
  totalMileage?: number;
}

/**
 * Interface untuk GPS dashboard data
 */
export interface GpsDashboardData {
  summary: {
    total: number;
    online: number;
    offline: number;
    no_imei: number;
    moving: number;
    parked: number;
    lastUpdated: Date;
  };
  recentUpdates: any[]; // MotorWithIopgps[]
  statistics: {
    dailyDistance: number;
    averageSpeed: number;
    activeHours: number;
  };
}

/**
 * Interface untuk GPS sync configuration
 */
export interface GpsSyncConfig {
  autoSync: boolean;
  syncInterval: number; // dalam menit
  maxRetries: number;
  timeout: number; // dalam detik
  enableCaching: boolean;
  cacheTtl: number; // dalam menit
}

/**
 * Interface untuk GPS service response
 */
export interface GpsServiceResponse<T = any> {
  success: boolean;
  data?: T;
  message: string;
  timestamp: Date;
  metadata?: {
    source: 'iopgps' | 'cache' | 'database';
    cached?: boolean;
    responseTime?: number;
    retryCount?: number;
  };
}

/**
 * Interface untuk batch GPS operations
 */
export interface BatchGpsOperation {
  motorIds: number[];
  operation: 'sync' | 'status_check' | 'location_update';
  options?: {
    forceRefresh?: boolean;
    useCache?: boolean;
    timeout?: number;
  };
}

/**
 * Interface untuk GPS error handling
 */
export interface GpsErrorInfo {
  motorId: number;
  imei: string;
  errorType:
    | 'connection'
    | 'timeout'
    | 'authentication'
    | 'validation'
    | 'unknown';
  errorMessage: string;
  timestamp: Date;
  retryCount: number;
}

/**
 * Interface untuk GPS health check
 */
export interface GpsHealthStatus {
  service: 'healthy' | 'degraded' | 'unhealthy';
  connectedDevices: number;
  totalDevices: number;
  lastSync: Date;
  averageResponseTime: number;
  errors: GpsErrorInfo[];
}

/**
 * Helper functions interface untuk GPS service
 */
export interface IGpsHelper {
  processIopgpsLocation(
    location: DeviceLocationResponse,
  ): IopgpsProcessedLocation | null;
  validateCoordinates(lat: number, lng: number): boolean;
  calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number;
  formatAddress(address: string): string;
  shouldUpdateLocation(
    newLocation: IopgpsProcessedLocation,
    oldLocation?: IopgpsProcessedLocation,
  ): boolean;
}

/**
 * Interface untuk GPS notification
 */
export interface GpsNotification {
  type:
    | 'location_update'
    | 'status_change'
    | 'geofence_alert'
    | 'maintenance_reminder';
  motorId: number;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  data?: any;
  timestamp: Date;
}

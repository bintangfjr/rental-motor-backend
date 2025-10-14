// src/iopgps/interfaces/service.interface.ts
export interface SyncMotor {
  id: number;
  imei: string | null;
  plat_nomor: string;
  lat: number | null;
  lng: number | null;
  last_update: Date | null;
}

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

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  tokenValid: boolean;
  apiAccessible: boolean;
  databaseConnected: boolean;
  lastSync?: Date;
}

export interface SyncResult {
  success: number;
  failed: number;
}

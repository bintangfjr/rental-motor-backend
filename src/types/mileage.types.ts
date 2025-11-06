// src/motor/types/mileage.types.ts
export interface MileageHistory {
  id: number;
  motor_id: number;
  imei: string;
  start_time: string;
  end_time: string;
  distance_km: number;
  run_time_seconds: number;
  average_speed_kmh: number;
  period_date: string;
  created_at: string;
  updated_at: string;
}

export interface AutoSyncResult {
  motorId: number;
  plat_nomor?: string;
  success: boolean;
  message: string;
}

export interface AutoSyncSummary {
  totalMotors: number;
  successful: number;
  failed: number;
  details: AutoSyncResult[];
}

export interface MileageStatistics {
  totalRecords: number;
  uniqueDays: number;
  duplicates: number;
  dateRange: { start: Date; end: Date };
  totalDistance: number;
}

export interface SyncResult {
  success: boolean;
  recordsAdded: number;
  message: string;
}

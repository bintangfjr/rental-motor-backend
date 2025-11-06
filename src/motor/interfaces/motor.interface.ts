// src/motor/interfaces/motor.interface.ts
export interface MotorBase {
  id: number;
  plat_nomor: string;
  merk: string;
  model: string;
  tahun: number;
  harga: number;
  no_gsm?: string | null;
  imei?: string | null;
  status: 'tersedia' | 'disewa' | 'perbaikan' | 'pending_perbaikan';
  device_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  last_update?: Date | null;
  gps_status?: 'Online' | 'Offline' | 'NoImei' | 'Error' | null;
  total_mileage?: unknown;
  last_known_address?: string | null;
  last_mileage_sync?: Date | null;
  service_technician?: string | null;
  last_service_date?: Date | null;
  service_notes?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MotorMileageHistoryItem {
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

export interface MotorLocationCacheItem {
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

export interface ServiceRecordItem {
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

export interface SewaItem {
  id: number;
  penyewa: {
    id: number;
    nama: string;
    no_whatsapp: string;
  };
}

export interface MotorWithRelations extends MotorBase {
  sewas?: SewaItem[];
  mileage_history?: MotorMileageHistoryItem[];
  location_cache?: MotorLocationCacheItem[];
  service_records?: ServiceRecordItem[];
}

// Types untuk Prisma operations
export type MotorCreateInput = {
  plat_nomor: string;
  merk: string;
  model: string;
  tahun: number;
  harga: number;
  no_gsm?: string | null;
  imei?: string | null;
  status?: 'tersedia' | 'disewa' | 'perbaikan' | 'pending_perbaikan';
  device_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  last_update?: Date | null;
  gps_status?: 'Online' | 'Offline' | 'NoImei' | 'Error';
  total_mileage?: unknown;
  last_known_address?: string | null;
  last_mileage_sync?: Date | null;
  service_technician?: string | null;
  last_service_date?: Date | null;
  service_notes?: string | null;
};

export type MotorUpdateInput = Partial<MotorCreateInput>;

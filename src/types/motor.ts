export interface Motor {
  id: number;
  plat_nomor: string;
  merk: string;
  model: string;
  tahun: number;
  harga: number;
  no_gsm?: string;
  imei?: string;
  status: 'tersedia' | 'disewa' | 'perbaikan' | 'pending_perbaikan';
  device_id?: string;
  lat?: number;
  lng?: number;
  last_update?: string;

  // ✅ GPS & MILEAGE FIELDS
  gps_status: 'Online' | 'Offline' | 'NoImei' | 'Error';
  total_mileage?: number;
  last_known_address?: string;
  last_mileage_sync?: string;

  // ✅ SERVICE FIELDS
  service_technician?: string;
  last_service_date?: string;
  service_notes?: string;

  created_at: string;
  updated_at: string;
}

export interface MotorWithIopgps extends Motor {
  iopgps_data?: {
    location?: {
      lat: number;
      lng: number;
      address: string;
      speed: number;
      direction: number;
      gps_time: string;
    };
    status?: string;
    online?: boolean;
    last_update?: string;
  };
  mileage_history?: MileageHistory[];
  location_cache?: LocationCache[];
  service_records?: ServiceRecord[];
  sewas?: Array<{
    id: number;
    penyewa: {
      id: number;
      nama: string;
      no_whatsapp: string;
    };
  }>;
}

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

export interface LocationCache {
  id: number;
  motor_id: number;
  imei: string;
  lat: number;
  lng: number;
  address?: string;
  speed?: number;
  direction?: number;
  gps_time: string;
  location_type: string;
  created_at: string;
}

export interface ServiceInfoData {
  lastServiceDate: Date | null;
  nextServiceDue: Date | null;
  mileage: number;
  status: 'normal' | 'due' | 'overdue';
}

// ✅ SERVICE RECORD INTERFACE - SESUAI DENGAN BACKEND
export interface ServiceRecord {
  id: number;
  motor_id: number;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  service_type: 'rutin' | 'berat' | 'perbaikan' | 'emergency';
  service_date: string;
  estimated_completion?: string;
  actual_completion?: string;
  service_location: string;
  service_technician: string;
  parts?: string[];
  services?: string[];
  estimated_cost?: number;
  actual_cost?: number;
  notes?: string;
  service_summary?: string;
  mileage_at_service?: number;
  created_at: string;
  updated_at: string;
  motor?: {
    id: number;
    plat_nomor: string;
    merk: string;
    model: string;
    status: string;
  };
}

export interface VehicleStatus {
  imei: string;
  licenseNumber: string;
  lat: number;
  lng: number;
  speed: number;
  direction: number;
  gpsTime: number;
  location: string;
  status: string;
  acc: string;
  online: string;
}

// ✅ SERVICE STATISTICS INTERFACE - SESUAI DENGAN BACKEND
export interface ServiceStatistics {
  total: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  totalCost: number;
}

// ✅ INTERFACE UNTUK START SERVICE
export interface StartServiceData {
  service_type: 'rutin' | 'berat' | 'perbaikan' | 'emergency';
  service_location: string;
  service_technician: string;
  parts?: string[];
  services?: string[];
  estimated_cost?: number;
  estimated_completion?: string;
  notes?: string;
  service_notes?: string;
}

// ✅ INTERFACE UNTUK COMPLETE SERVICE
export interface CompleteServiceData {
  actual_cost: number;
  actual_completion?: string;
  notes?: string;
  service_summary?: string;
}

// ✅ INTERFACE UNTUK CREATE SERVICE RECORD
export interface CreateServiceRecordData {
  motor_id: number;
  service_type: 'rutin' | 'berat' | 'perbaikan' | 'emergency';
  service_date: string;
  service_location: string;
  service_technician: string;
  parts?: string[];
  services?: string[];
  estimated_cost?: number;
  estimated_completion?: string;
  notes?: string;
}

// ✅ INTERFACE UNTUK UPDATE SERVICE RECORD
export interface UpdateServiceRecordData {
  service_type?: 'rutin' | 'berat' | 'perbaikan' | 'emergency';
  service_date?: string;
  service_location?: string;
  service_technician?: string;
  parts?: string[];
  services?: string[];
  estimated_cost?: number;
  estimated_completion?: string;
  notes?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

// ✅ INTERFACE UNTUK SERVICE RESPONSE
export interface ServiceResponse {
  serviceRecord: ServiceRecord;
  motor: Motor;
}

// ✅ ENUM UNTUK SERVICE STATUS (OPTIONAL)
export enum ServiceStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// ✅ ENUM UNTUK SERVICE TYPE (OPTIONAL)
export enum ServiceType {
  RUTIN = 'rutin',
  BERAT = 'berat',
  PERBAIKAN = 'perbaikan',
  EMERGENCY = 'emergency',
}

// ✅ INTERFACE UNTUK SERVICE FILTER
export interface ServiceFilter {
  status?: ServiceStatus | '';
  service_type?: ServiceType | '';
  start_date?: string;
  end_date?: string;
  technician?: string;
}

// ✅ INTERFACE UNTUK PAGINATED SERVICE RECORDS
export interface PaginatedServiceRecords {
  data: ServiceRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PrismaMotor {
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
  gps_status?: 'Online' | 'Offline' | 'NoImei' | 'Error' | null;
  total_mileage?: any;
  last_known_address?: string | null;
  last_mileage_sync?: Date | null;
  service_technician?: string | null;
  last_service_date?: Date | null;
  service_notes?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PrismaMotorWithRelations extends PrismaMotor {
  mileage_history?: any[];
  location_cache?: any[];
  service_records?: any[];
  sewas?: any[];
}

export type CreateMotorData = Omit<
  PrismaMotor,
  'id' | 'created_at' | 'updated_at'
>;

export interface ServiceInfoDataInternal {
  service_technician?: string;
  last_service_date?: string;
  service_notes?: string;
}

export interface MotorStatistics {
  total: number;
  available: number;
  rented: number;
  maintenance: number;
  pending_service: number;
  needing_service: number;
}

// src/motor/dto/motor-response.dto.ts
// Interface untuk GPS data
interface IopgpsData {
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
}

export class MotorResponseDto {
  id: number;
  plat_nomor: string;
  merk: string;
  model: string;
  tahun: number;
  harga: number;
  no_gsm?: string;
  imei?: string;
  status: string;
  device_id?: string;
  lat?: number;
  lng?: number;
  last_update?: string;
  gps_status?: string;
  total_mileage?: number;
  last_known_address?: string;
  last_mileage_sync?: string;
  service_technician?: string;
  last_service_date?: string;
  service_notes?: string;
  created_at: string;
  updated_at: string;

  static fromPrisma(motor: {
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
  }): MotorResponseDto {
    const dto = new MotorResponseDto();

    // Basic fields
    dto.id = motor.id;
    dto.plat_nomor = motor.plat_nomor;
    dto.merk = motor.merk;
    dto.model = motor.model;
    dto.tahun = motor.tahun;
    dto.harga = motor.harga;
    dto.no_gsm = motor.no_gsm ?? undefined;
    dto.imei = motor.imei ?? undefined;
    dto.status = motor.status;
    dto.device_id = motor.device_id ?? undefined;
    dto.lat = motor.lat ?? undefined;
    dto.lng = motor.lng ?? undefined;
    dto.last_update = motor.last_update?.toISOString();
    dto.gps_status = motor.gps_status ?? undefined;
    dto.last_known_address = motor.last_known_address ?? undefined;
    dto.last_mileage_sync = motor.last_mileage_sync?.toISOString();
    dto.service_technician = motor.service_technician ?? undefined;
    dto.last_service_date = motor.last_service_date?.toISOString();
    dto.service_notes = motor.service_notes ?? undefined;
    dto.created_at = motor.created_at.toISOString();
    dto.updated_at = motor.updated_at.toISOString();

    // Decimal conversions
    dto.total_mileage = this.safeConvertDecimal(motor.total_mileage);

    return dto;
  }

  // Ubah menjadi public agar bisa diakses dari luar
  static safeConvertDecimal(value: unknown): number {
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

  // Ubah menjadi public agar bisa diakses dari luar
  static safeConvertJsonToStringArray(value: unknown): string[] {
    if (!value) return [];

    try {
      if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
      }

      if (typeof value === 'string') {
        const parsed = this.safeJsonParse<string[]>(value);
        return Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === 'string')
          : [];
      }

      return [];
    } catch {
      return [];
    }
  }

  private static safeJsonParse<T>(text: string): T | null {
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }
}

export class MotorDetailResponseDto extends MotorResponseDto {
  mileage_history?: Array<{
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
  }>;

  location_cache?: Array<{
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
  }>;

  service_records?: Array<{
    id: number;
    motor_id: number;
    status: string;
    service_type: string;
    service_date: string;
    estimated_completion?: string;
    actual_completion?: string;
    service_location: string;
    service_technician: string;
    parts: string[];
    services: string[];
    estimated_cost?: number;
    actual_cost?: number;
    notes?: string;
    service_notes?: string;
    mileage_at_service?: number;
    created_at: string;
    updated_at: string;
  }>;

  sewas?: Array<{
    id: number;
    penyewa?: {
      id: number;
      nama: string;
      no_whatsapp: string;
    };
  }>;

  iopgps_data?: IopgpsData;
}

export class MotorStatisticsResponseDto {
  total: number;
  available: number;
  rented: number;
  maintenance: number;
  pending_service: number;
  needing_service: number;
  last_updated: string;

  static fromCounts(counts: {
    total: number;
    available: number;
    rented: number;
    maintenance: number;
    pending_service: number;
    needing_service: number;
  }): MotorStatisticsResponseDto {
    const dto = new MotorStatisticsResponseDto();

    dto.total = counts.total;
    dto.available = counts.available;
    dto.rented = counts.rented;
    dto.maintenance = counts.maintenance;
    dto.pending_service = counts.pending_service;
    dto.needing_service = counts.needing_service;
    dto.last_updated = new Date().toISOString();

    return dto;
  }
}

export interface WhatsAppConfig {
  api_key: string;
  fonnte_number: string;
  admin_numbers: string;
  reminder_template: string;
  alert_template: string;
  auto_notifications: string;
}

export interface FonnteResponse {
  status: boolean;
  reason?: string;
  message?: string;
  [key: string]: unknown;
}

export interface NotificationResult {
  success: boolean;
  message: string;
  data?: {
    message?: string;
    successCount?: number;
    [key: string]: unknown;
  };
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  data?: FonnteResponse | null;
}

export interface SewaWithRemainingTime {
  id: number;
  tgl_kembali: Date;
  status: string;
  status_notifikasi?: string;
  penyewa: {
    id: number;
    nama: string;
    no_whatsapp?: string;
  };
  motor: {
    id: number;
    plat_nomor: string;
    merk: string;
    model: string;
  };
  sisa_waktu: {
    status: string;
    hari: number;
    jam: number;
    menit: number;
    totalMenit: number;
  };
}

export enum SisaWaktuStatus {
  NORMAL = 'normal',
  LEWAT = 'lewat',
}

export interface Motor {
  id: number;
  plat_nomor: string;
  merk: string;
  model: string;
  tahun: number;
  harga: number;
  no_gsm?: string;
  imei?: string;
  status: 'tersedia' | 'disewa' | 'perbaikan';
  device_id?: string;
  lat?: number;
  lng?: number;
  last_update?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface MotorWithRelations extends Motor {
  sewas?: Sewa[];
}

export interface Sewa {
  id: number;
  tgl_mulai: Date;
  tgl_selesai: Date;
  harga_sewa: number;
  status: string;
  jaminan?: string;
  pembayaran?: string;
  penyewa: Penyewa;
}

export interface Penyewa {
  id: number;
  nama: string;
  no_hp: string;
}

export interface CreateMotorData {
  plat_nomor: string;
  merk: string;
  model: string;
  tahun: number;
  harga: number;
  no_gsm?: string;
  imei?: string;
  status: 'tersedia' | 'disewa' | 'perbaikan';
}

export interface UpdateMotorData extends Partial<CreateMotorData> {
  id: number;
}

export interface History {
  id: number;
  sewa_id: number;
  tgl_selesai: Date;
  status_selesai: string;
  harga: number;
  denda: number;
  catatan?: string;
  created_at: Date;
  sewa?: Sewa;
}

export interface Sewa {
  id: number;
  tgl_sewa: Date;
  tgl_kembali: Date;
  durasi_sewa: number;
  total_harga: number;
  status: string;
  motor: Motor;
  penyewa: Penyewa;
  admin?: Admin;
}

export interface Motor {
  id: number;
  plat_nomor: string;
  merk: string;
  model: string;
  tahun?: number;
  harga?: number;
}

export interface Penyewa {
  id: number;
  nama: string;
  no_whatsapp: string;
  alamat?: string;
}

export interface Admin {
  id: number;
  nama_lengkap: string;
  username: string;
}

export interface HistoryFilters {
  page?: number;
  limit?: number;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
}

export interface HistoryPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

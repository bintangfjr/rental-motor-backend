export class PenyewaHistoryDto {
  id: number;
  penyewa_id: number;
  motor_plat: string;
  penyewa_nama: string;
  tgl_mulai: Date;
  tgl_selesai: Date;
  harga: number;
  denda: number;
  status_selesai: string;
  catatan?: string;
  created_at: Date;
  updated_at: Date;
}

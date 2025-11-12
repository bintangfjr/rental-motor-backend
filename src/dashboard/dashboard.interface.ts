// dashboard.interface.ts
export interface MotorPerluService {
  id: number;
  plat_nomor: string;
  merk: string;
  model: string;
  status: string;
}

export interface SewaTerbaru {
  id: number;
  status: string;
  tgl_sewa: Date;
  tgl_kembali: Date;
  total_harga: number;
  motor: {
    id: number;
    plat_nomor: string;
    merk: string;
    model: string;
  };
  penyewa: {
    id: number;
    nama: string;
    no_whatsapp: string;
  };
}

export interface SewaHarianStats {
  tanggal: string;
  jumlah_sewa: number;
  total_pendapatan: number;
}

export interface SewaHarianResponse {
  hari_ini: number;
  kemarin: number;
  persentase_perubahan: number;
  tren_harian: SewaHarianStats[];
}

export interface DashboardData {
  totalMotor: number;
  motorTersedia: number;
  sewaAktif: number;
  sewaLewatTempo: number;
  totalSewa: number;
  pendapatanBulanIni: number;
  sewaTerbaru: SewaTerbaru[];
  motorPerluService: MotorPerluService[];
  totalAdmins: number;
  totalUsers: number;
  statistikHarian: SewaHarianResponse;
}

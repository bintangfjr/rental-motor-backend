export class MotorStatusDto {
  id: number;
  nama_motor: string;
  tipe_motor: string;
  plat_nomor: string;
  imei?: string;
  gps_status?: string;
  lat?: string;
  lng?: string;
  last_update?: string;
}

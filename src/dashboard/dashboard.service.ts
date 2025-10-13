import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as moment from 'moment';

// ==== INTERFACES ====
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
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private readonly STATUS = {
    TERSEDIA: 'tersedia',
    DISEWA: 'disewa',
    PERBAIKAN: 'perbaikan',
  };

  private readonly SEWA_STATUS = {
    AKTIF: 'Aktif',
    LEWAT_TEMPO: 'Lewat Tempo',
    SELESAI: 'Selesai',
  };

  async getDashboardData(): Promise<DashboardData> {
    try {
      // =========================
      // Total motor
      // =========================
      const totalMotor = await this.prisma.motor.count();

      // =========================
      // Motor tersedia
      // =========================
      const motorTersedia = await this.prisma.motor.count({
        where: { status: this.STATUS.TERSEDIA },
      });

      // =========================
      // Sewa aktif & lewat tempo
      // =========================
      const sewaAktif = await this.prisma.sewa.count({
        where: { status: this.SEWA_STATUS.AKTIF },
      });

      const sewaLewatTempo = await this.prisma.sewa.count({
        where: { status: this.SEWA_STATUS.LEWAT_TEMPO },
      });

      // =========================
      // Total semua sewa
      // =========================
      const totalSewa = await this.prisma.sewa.count();

      // =========================
      // Pendapatan bulan ini
      // =========================
      const startOfMonth = moment().startOf('month').toDate();
      const endOfMonth = moment().endOf('month').toDate();

      const historiesBulanIni = await this.prisma.history.findMany({
        where: {
          tgl_selesai: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
        select: {
          harga: true,
          denda: true,
        },
      });

      const pendapatanBulanIni = historiesBulanIni.reduce(
        (total, h) => total + (h.harga || 0) + (h.denda || 0),
        0,
      );

      // =========================
      // 5 Sewa terbaru (aktif/lewat tempo)
      // =========================
      const sewaTerbaruRaw = await this.prisma.sewa.findMany({
        where: {
          status: {
            in: [this.SEWA_STATUS.AKTIF, this.SEWA_STATUS.LEWAT_TEMPO],
          },
        },
        include: {
          motor: {
            select: { id: true, plat_nomor: true, merk: true, model: true },
          },
          penyewa: {
            select: { id: true, nama: true, no_whatsapp: true },
          },
        },
        orderBy: { created_at: 'desc' },
        take: 5,
      });

      const sewaTerbaru: SewaTerbaru[] = sewaTerbaruRaw.map((s) => ({
        id: s.id,
        status: s.status,
        tgl_sewa: s.tgl_sewa,
        tgl_kembali: s.tgl_kembali,
        total_harga: s.total_harga,
        motor: s.motor,
        penyewa: s.penyewa,
      }));

      // =========================
      // Motor yang perlu service (belum disewa 30 hari terakhir)
      // =========================
      const thirtyDaysAgo = moment().subtract(30, 'days').toDate();

      const semuaMotorTersedia = await this.prisma.motor.findMany({
        where: { status: this.STATUS.TERSEDIA },
        include: {
          sewas: {
            where: {
              created_at: { gt: thirtyDaysAgo },
            },
            select: { id: true },
          },
        },
      });

      const motorPerluService: MotorPerluService[] = semuaMotorTersedia
        .filter((motor) => motor.sewas.length === 0)
        .map((motor) => ({
          id: motor.id,
          plat_nomor: motor.plat_nomor,
          merk: motor.merk,
          model: motor.model,
          status: motor.status,
        }));

      // =========================
      // Total admins & users
      // =========================
      const totalAdmins = await this.prisma.admin.count();
      const totalUsers = await this.prisma.penyewa.count();

      // =========================
      // Return semua data
      // =========================
      return {
        totalMotor,
        motorTersedia,
        sewaAktif,
        sewaLewatTempo,
        totalSewa,
        pendapatanBulanIni,
        sewaTerbaru,
        motorPerluService,
        totalAdmins,
        totalUsers,
      };
    } catch (error) {
      console.error('DashboardService error:', error);
      throw new HttpException(
        'Failed to fetch dashboard data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

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

export interface PendapatanHarianStats {
  tanggal: string;
  total_pendapatan: number;
  pendapatan_sewa: number;
  pendapatan_denda: number;
}

export interface PendapatanHarianResponse {
  hari_ini: number;
  kemarin: number;
  persentase_perubahan: number;
  tren_harian: PendapatanHarianStats[];
}

export interface StatistikRingkasResponse {
  sewa: {
    hari_ini: number;
    kemarin: number;
    persentase: number;
  };
  pendapatan: {
    hari_ini: number;
    kemarin: number;
    persentase: number;
  };
  aktif: number;
  tersedia: number;
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
      // ✅ STATISTIK HARIAN - DITAMBAHKAN
      // =========================
      const statistikHarian = await this.getSewaHarianStats('7days');

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
        statistikHarian,
      };
    } catch (error) {
      console.error('DashboardService error:', error);
      throw new HttpException(
        'Failed to fetch dashboard data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ✅ METHOD BARU: Statistik Sewa Harian - DIPERBAIKI
  async getSewaHarianStats(
    period: '7days' | '30days' = '7days',
  ): Promise<SewaHarianResponse> {
    try {
      const days = period === '7days' ? 7 : 30;
      const startDate = moment()
        .subtract(days - 1, 'days')
        .startOf('day')
        .toDate(); // ✅ PERBAIKAN: -1 agar termasuk hari ini
      const endDate = moment().endOf('day').toDate();

      console.log(`📊 Fetching sewa harian stats for ${days} days`);
      console.log(
        `📅 Date range: ${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}`,
      );

      // Data untuk tren harian - group by tanggal sewa
      const sewaHarian = await this.prisma.sewa.groupBy({
        by: ['tgl_sewa'],
        where: {
          tgl_sewa: {
            gte: startDate,
            lte: endDate,
          },
        },
        _count: {
          id: true,
        },
        _sum: {
          total_harga: true,
        },
      });

      console.log(
        `📈 Raw sewa harian data:`,
        sewaHarian.map((item) => ({
          tanggal: moment(item.tgl_sewa).format('YYYY-MM-DD'),
          count: item._count.id,
          total: Number(item._sum.total_harga),
        })),
      );

      // ✅ PERBAIKAN: Format data tren harian dengan urutan yang benar (lama -> baru)
      const trenHarian: SewaHarianStats[] = [];

      // Generate data untuk setiap hari dalam periode
      for (let i = 0; i < days; i++) {
        const date = moment()
          .subtract(days - 1 - i, 'days')
          .startOf('day')
          .toDate(); // ✅ PERBAIKAN: Urutan dari yang terlama
        const dateString = moment(date).format('YYYY-MM-DD');

        // Cari data untuk tanggal ini
        const found = sewaHarian.find(
          (sewa) => moment(sewa.tgl_sewa).format('YYYY-MM-DD') === dateString,
        );

        // FIX: Gunakan Number() instead of toNumber()
        const totalPendapatan = found?._sum.total_harga
          ? Number(found._sum.total_harga)
          : 0;

        trenHarian.push({
          tanggal: dateString,
          jumlah_sewa: found?._count.id || 0,
          total_pendapatan: totalPendapatan,
        });
      }

      console.log(`📊 Processed tren harian:`, trenHarian);

      // Hitung jumlah sewa hari ini
      const todayStart = moment().startOf('day').toDate();
      const todayEnd = moment().endOf('day').toDate();
      const sewaHariIni = await this.prisma.sewa.count({
        where: {
          tgl_sewa: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      });

      // Hitung jumlah sewa kemarin
      const yesterdayStart = moment()
        .subtract(1, 'days')
        .startOf('day')
        .toDate();
      const yesterdayEnd = moment().subtract(1, 'days').endOf('day').toDate();
      const sewaKemarin = await this.prisma.sewa.count({
        where: {
          tgl_sewa: {
            gte: yesterdayStart,
            lte: yesterdayEnd,
          },
        },
      });

      // Hitung persentase perubahan
      let persentasePerubahan = 0;
      if (sewaKemarin > 0) {
        persentasePerubahan = ((sewaHariIni - sewaKemarin) / sewaKemarin) * 100;
      } else if (sewaHariIni > 0) {
        persentasePerubahan = 100; // Dari 0 ke positif = +100%
      } else {
        persentasePerubahan = 0; // Tetap 0 = 0%
      }

      const result = {
        hari_ini: sewaHariIni,
        kemarin: sewaKemarin,
        persentase_perubahan: Math.round(persentasePerubahan * 100) / 100,
        tren_harian: trenHarian,
      };

      console.log(`✅ Sewa harian stats result:`, {
        ...result,
        tren_harian_count: result.tren_harian.length,
        period: `${days} days`,
      });
      return result;
    } catch (error) {
      console.error('❌ Error getting sewa harian stats:', error);
      throw new HttpException(
        'Failed to fetch daily rental stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ✅ METHOD BARU: Statistik Pendapatan Harian - DIPERBAIKI
  async getPendapatanHarianStats(
    period: '7days' | '30days' = '7days',
  ): Promise<PendapatanHarianResponse> {
    try {
      const days = period === '7days' ? 7 : 30;
      const startDate = moment()
        .subtract(days - 1, 'days')
        .startOf('day')
        .toDate(); // ✅ PERBAIKAN: -1 agar termasuk hari ini
      const endDate = moment().endOf('day').toDate();

      console.log(`💰 Fetching pendapatan harian stats for ${days} days`);
      console.log(
        `📅 Date range: ${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}`,
      );

      // Data pendapatan dari history (sewa yang sudah selesai)
      const pendapatanHarian = await this.prisma.history.groupBy({
        by: ['tgl_selesai'],
        where: {
          tgl_selesai: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          harga: true,
          denda: true,
        },
      });

      console.log(
        `💰 Raw pendapatan harian data:`,
        pendapatanHarian.map((item) => ({
          tanggal: moment(item.tgl_selesai).format('YYYY-MM-DD'),
          harga: Number(item._sum.harga),
          denda: Number(item._sum.denda),
        })),
      );

      // ✅ PERBAIKAN: Format data dengan urutan yang benar (lama -> baru)
      const trenPendapatan: PendapatanHarianStats[] = [];
      for (let i = 0; i < days; i++) {
        const date = moment()
          .subtract(days - 1 - i, 'days')
          .startOf('day')
          .toDate(); // ✅ PERBAIKAN: Urutan dari yang terlama
        const dateString = moment(date).format('YYYY-MM-DD');

        const found = pendapatanHarian.find(
          (item) =>
            moment(item.tgl_selesai).format('YYYY-MM-DD') === dateString,
        );

        // FIX: Gunakan Number() instead of toNumber()
        const harga = found?._sum.harga ? Number(found._sum.harga) : 0;
        const denda = found?._sum.denda ? Number(found._sum.denda) : 0;
        const totalPendapatan = harga + denda;

        trenPendapatan.push({
          tanggal: dateString,
          total_pendapatan: totalPendapatan,
          pendapatan_sewa: harga,
          pendapatan_denda: denda,
        });
      }

      console.log(`💰 Processed tren pendapatan:`, trenPendapatan);

      // Hitung pendapatan hari ini
      const todayStart = moment().startOf('day').toDate();
      const todayEnd = moment().endOf('day').toDate();
      const pendapatanHariIni = await this.prisma.history.aggregate({
        where: {
          tgl_selesai: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
        _sum: {
          harga: true,
          denda: true,
        },
      });

      // FIX: Gunakan Number() instead of toNumber()
      const totalHariIni =
        (pendapatanHariIni._sum.harga
          ? Number(pendapatanHariIni._sum.harga)
          : 0) +
        (pendapatanHariIni._sum.denda
          ? Number(pendapatanHariIni._sum.denda)
          : 0);

      // Hitung pendapatan kemarin
      const yesterdayStart = moment()
        .subtract(1, 'days')
        .startOf('day')
        .toDate();
      const yesterdayEnd = moment().subtract(1, 'days').endOf('day').toDate();
      const pendapatanKemarin = await this.prisma.history.aggregate({
        where: {
          tgl_selesai: {
            gte: yesterdayStart,
            lte: yesterdayEnd,
          },
        },
        _sum: {
          harga: true,
          denda: true,
        },
      });

      // FIX: Gunakan Number() instead of toNumber()
      const totalKemarin =
        (pendapatanKemarin._sum.harga
          ? Number(pendapatanKemarin._sum.harga)
          : 0) +
        (pendapatanKemarin._sum.denda
          ? Number(pendapatanKemarin._sum.denda)
          : 0);

      // Hitung persentase perubahan
      let persentasePerubahan = 0;
      if (totalKemarin > 0) {
        persentasePerubahan =
          ((totalHariIni - totalKemarin) / totalKemarin) * 100;
      } else if (totalHariIni > 0) {
        persentasePerubahan = 100;
      }

      const result = {
        hari_ini: totalHariIni,
        kemarin: totalKemarin,
        persentase_perubahan: Math.round(persentasePerubahan * 100) / 100,
        tren_harian: trenPendapatan,
      };

      console.log(`✅ Pendapatan harian stats result:`, {
        ...result,
        tren_harian_count: result.tren_harian.length,
        period: `${days} days`,
      });
      return result;
    } catch (error) {
      console.error('Error getting pendapatan harian stats:', error);
      throw new HttpException(
        'Failed to fetch daily income stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

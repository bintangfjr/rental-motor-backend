import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as moment from 'moment';

// Export interface agar bisa diakses dari luar
export interface SewaPerBulan {
  bulan: string;
  total: number;
}

export interface SewaPerHari {
  tanggal: string;
  total: number;
}

export interface PendapatanPerBulan {
  bulan: string;
  pendapatan: number;
}

export interface MotorStatusCount {
  [key: string]: number;
}

export interface MotorUsage {
  id: number;
  plat_nomor: string;
  merk: string;
  model: string;
  status: string;
  total_sewa: number;
  total_durasi: number;
  total_pendapatan: number;
}

export interface FinancialReport {
  periode: {
    start: string;
    end: string;
  };
  totalPendapatan: number;
  totalDenda: number;
  pendapatanPerBulan: PendapatanPerBulan[];
  pendapatanPerMotor: Array<{
    motor_plat: string;
    motor_merk: string;
    motor_model: string;
    total_pendapatan: number;
  }>;
}

export interface DashboardStats {
  jumlahSewaAktif: number;
  jumlahMotorTersedia: number;
  totalPendapatan: number;
  totalPenyewaAktif: number;
  motorPerStatus: MotorStatusCount;
  sewaPerBulan: SewaPerBulan[];
}

export interface MonthlyReport {
  periode: string;
  totalSewa: number;
  totalPendapatan: number;
  sewaPerHari: SewaPerHari[];
  motorTerpopuler: Array<{
    motor_plat: string;
    motor_merk: string;
    motor_model: string;
    total_sewa: number;
  }>;
  penyewaTeraktif: Array<{
    penyewa_nama: string;
    penyewa_whatsapp: string;
    total_sewa: number;
  }>;
}

export interface BackupReport {
  periode: {
    start: string;
    end: string;
  };
  totalRecords: number;
  totalPendapatan: number;
  totalDenda: number;
  data: any[];
}

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaService) {}

  private readonly STATUS = {
    AKTIF: 'Aktif',
    SELESAI: 'Selesai',
    TERSEDIA: 'tersedia',
    DISEWA: 'disewa',
    PERBAIKAN: 'perbaikan',
  };

  async getDashboardStats(): Promise<DashboardStats> {
    const [
      jumlahSewaAktif,
      jumlahMotorTersedia,
      totalPendapatan,
      totalPenyewaAktif,
      motorPerStatus,
      sewaPerBulan,
    ] = await Promise.all([
      // Jumlah sewa aktif (masih dari sewa aktif)
      this.prisma.sewa.count({
        where: { status: this.STATUS.AKTIF },
      }),

      // Jumlah motor tersedia
      this.prisma.motor.count({
        where: { status: this.STATUS.TERSEDIA },
      }),

      // Total pendapatan dari HISTORY (backup data)
      this.prisma.history.aggregate({
        _sum: { harga: true },
      }),

      // Total penyewa aktif (punya sewa aktif)
      this.prisma.penyewa.count({
        where: {
          sewas: {
            some: {
              status: this.STATUS.AKTIF,
            },
          },
        },
      }),

      // Motor per status
      this.prisma.motor.groupBy({
        by: ['status'],
        _count: {
          id: true,
        },
      }),

      // Sewa per bulan dari HISTORY (6 bulan terakhir)
      this.getSewaLast6MonthsFromHistory(),
    ]);

    const motorStatusCount: MotorStatusCount = motorPerStatus.reduce(
      (acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      },
      {} as MotorStatusCount,
    );

    return {
      jumlahSewaAktif,
      jumlahMotorTersedia,
      totalPendapatan: totalPendapatan._sum.harga || 0,
      totalPenyewaAktif,
      motorPerStatus: motorStatusCount,
      sewaPerBulan,
    };
  }

  async getMonthlyReports(
    year?: number,
    month?: number,
  ): Promise<MonthlyReport> {
    const targetYear = year || new Date().getFullYear();
    const targetMonth = month || new Date().getMonth() + 1;

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    const [
      totalSewa,
      totalPendapatan,
      sewaPerHari,
      motorTerpopuler,
      penyewaTeraktif,
    ] = await Promise.all([
      // Total sewa bulan ini dari HISTORY
      this.prisma.history.count({
        where: {
          tgl_selesai: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),

      // Total pendapatan bulan ini dari HISTORY
      this.prisma.history.aggregate({
        where: {
          tgl_selesai: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: { harga: true },
      }),

      // Sewa per hari dalam bulan dari HISTORY
      this.getSewaPerHariFromHistory(targetYear, targetMonth),

      // Motor terpopuler bulan ini dari HISTORY
      this.prisma.history.groupBy({
        by: ['motor_plat', 'motor_merk', 'motor_model'],
        where: {
          tgl_selesai: {
            gte: startDate,
            lte: endDate,
          },
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 5,
      }),

      // Penyewa teraktif bulan ini dari HISTORY
      this.prisma.history.groupBy({
        by: ['penyewa_nama', 'penyewa_whatsapp'],
        where: {
          tgl_selesai: {
            gte: startDate,
            lte: endDate,
          },
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 5,
      }),
    ]);

    return {
      periode: `${targetMonth}/${targetYear}`,
      totalSewa,
      totalPendapatan: totalPendapatan._sum.harga || 0,
      sewaPerHari,
      motorTerpopuler: motorTerpopuler.map((item) => ({
        motor_plat: item.motor_plat,
        motor_merk: item.motor_merk,
        motor_model: item.motor_model,
        total_sewa: item._count.id,
      })),
      penyewaTeraktif: penyewaTeraktif.map((item) => ({
        penyewa_nama: item.penyewa_nama,
        penyewa_whatsapp: item.penyewa_whatsapp,
        total_sewa: item._count.id,
      })),
    };
  }

  async getMotorUsage(
    startDate?: string,
    endDate?: string,
  ): Promise<MotorUsage[]> {
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Get motor usage from HISTORY table
    const historyUsage = await this.prisma.history.groupBy({
      by: ['motor_plat', 'motor_merk', 'motor_model'],
      where: {
        tgl_selesai: {
          gte: start,
          lte: end,
        },
      },
      _count: {
        id: true,
      },
      _sum: {
        harga: true,
      },
    });

    // Get current motor status
    const motors = await this.prisma.motor.findMany({
      select: {
        id: true,
        plat_nomor: true,
        merk: true,
        model: true,
        status: true,
      },
    });

    return historyUsage.map((item) => {
      const motor = motors.find((m) => m.plat_nomor === item.motor_plat);
      return {
        id: motor?.id || 0,
        plat_nomor: item.motor_plat,
        merk: item.motor_merk,
        model: item.motor_model,
        status: motor?.status || 'unknown',
        total_sewa: item._count.id,
        total_durasi: item._count.id, // Approximate since durasi is not stored in history
        total_pendapatan: item._sum.harga || 0,
      };
    });
  }

  async getFinancialReports(
    startDate?: string,
    endDate?: string,
  ): Promise<FinancialReport> {
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const [
      totalPendapatan,
      pendapatanPerBulan,
      pendapatanPerMotor,
      dendaTotal,
    ] = await Promise.all([
      // Total pendapatan dari HISTORY
      this.prisma.history.aggregate({
        where: {
          tgl_selesai: {
            gte: start,
            lte: end,
          },
        },
        _sum: { harga: true },
      }),

      // Pendapatan per bulan dari HISTORY
      this.getPendapatanPerBulanFromHistory(start, end),

      // Pendapatan per motor dari HISTORY
      this.prisma.history.groupBy({
        by: ['motor_plat', 'motor_merk', 'motor_model'],
        where: {
          tgl_selesai: {
            gte: start,
            lte: end,
          },
        },
        _sum: { harga: true },
        orderBy: {
          _sum: {
            harga: 'desc',
          },
        },
      }),

      // Total denda dari HISTORY
      this.prisma.history.aggregate({
        where: {
          tgl_selesai: {
            gte: start,
            lte: end,
          },
        },
        _sum: { denda: true },
      }),
    ]);

    return {
      periode: {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      },
      totalPendapatan: totalPendapatan._sum.harga || 0,
      totalDenda: dendaTotal._sum.denda || 0,
      pendapatanPerBulan,
      pendapatanPerMotor: pendapatanPerMotor.map((item) => ({
        motor_plat: item.motor_plat,
        motor_merk: item.motor_merk,
        motor_model: item.motor_model,
        total_pendapatan: item._sum.harga || 0,
      })),
    };
  }

  // ✅ NEW METHOD: Backup data report from histories
  async getBackupReport(
    startDate?: string,
    endDate?: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<BackupReport> {
    const start = startDate ? new Date(startDate) : new Date(0); // Beginning of time
    const end = endDate ? new Date(endDate) : new Date();

    const skip = (page - 1) * limit;

    const [data, totalRecords, financialSummary] = await Promise.all([
      // Get paginated history data
      this.prisma.history.findMany({
        where: {
          tgl_selesai: {
            gte: start,
            lte: end,
          },
        },
        orderBy: { tgl_selesai: 'desc' },
        skip,
        take: limit,
      }),

      // Total records count
      this.prisma.history.count({
        where: {
          tgl_selesai: {
            gte: start,
            lte: end,
          },
        },
      }),

      // Financial summary
      this.prisma.history.aggregate({
        where: {
          tgl_selesai: {
            gte: start,
            lte: end,
          },
        },
        _sum: {
          harga: true,
          denda: true,
        },
      }),
    ]);

    return {
      periode: {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      },
      totalRecords,
      totalPendapatan: financialSummary._sum.harga || 0,
      totalDenda: financialSummary._sum.denda || 0,
      data,
    };
  }

  // ✅ NEW METHOD: Export backup data to CSV/Excel format
  async exportBackupData(startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();

    const histories = await this.prisma.history.findMany({
      where: {
        tgl_selesai: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { tgl_selesai: 'desc' },
    });

    // Transform data for export
    const exportData = histories.map((history) => ({
      'ID Sewa': history.sewa_id,
      'Tanggal Selesai': moment(history.tgl_selesai).format(
        'YYYY-MM-DD HH:mm:ss',
      ),
      'Status Selesai': history.status_selesai,
      Harga: history.harga,
      Denda: history.denda,
      'Keterlambatan (menit)': history.keterlambatan_menit,
      Catatan: history.catatan,
      'Plat Motor': history.motor_plat,
      'Merk Motor': history.motor_merk,
      'Model Motor': history.motor_model,
      'Tahun Motor': history.tahun_motor,
      'Nama Penyewa': history.penyewa_nama,
      'WhatsApp Penyewa': history.penyewa_whatsapp,
      'Nama Admin': history.admin_nama,
      'Tanggal Sewa': moment(history.tgl_sewa).format('YYYY-MM-DD HH:mm:ss'),
      'Tanggal Kembali': moment(history.tgl_kembali).format(
        'YYYY-MM-DD HH:mm:ss',
      ),
      'Durasi Sewa': history.durasi_sewa,
      'Satuan Durasi': history.satuan_durasi,
      Jaminan: history.jaminan,
      Pembayaran: history.pembayaran,
      'Biaya Tambahan': history.additional_costs,
      'Catatan Tambahan': history.catatan_tambahan,
      'Created At': moment(history.created_at).format('YYYY-MM-DD HH:mm:ss'),
      'Updated At': moment(history.updated_at).format('YYYY-MM-DD HH:mm:ss'),
    }));

    return {
      periode: {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      },
      totalRecords: histories.length,
      data: exportData,
    };
  }

  // Private methods using HISTORY table
  private async getSewaLast6MonthsFromHistory(): Promise<SewaPerBulan[]> {
    const months: SewaPerBulan[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = moment(month).format('MMM YYYY');

      const startDate = new Date(month.getFullYear(), month.getMonth(), 1);
      const endDate = new Date(
        month.getFullYear(),
        month.getMonth() + 1,
        0,
        23,
        59,
        59,
      );

      const count = await this.prisma.history.count({
        where: {
          tgl_selesai: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      months.push({
        bulan: monthName,
        total: count,
      });
    }

    return months;
  }

  private async getSewaPerHariFromHistory(
    year: number,
    month: number,
  ): Promise<SewaPerHari[]> {
    const daysInMonth = new Date(year, month, 0).getDate();
    const sewaPerHari: SewaPerHari[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const startDate = new Date(year, month - 1, day, 0, 0, 0);
      const endDate = new Date(year, month - 1, day, 23, 59, 59);

      const count = await this.prisma.history.count({
        where: {
          tgl_selesai: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      sewaPerHari.push({
        tanggal: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
        total: count,
      });
    }

    return sewaPerHari;
  }

  private async getPendapatanPerBulanFromHistory(
    start: Date,
    end: Date,
  ): Promise<PendapatanPerBulan[]> {
    const result: PendapatanPerBulan[] = [];
    const current = new Date(start);

    while (current <= end) {
      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      const monthEnd = new Date(
        current.getFullYear(),
        current.getMonth() + 1,
        0,
        23,
        59,
        59,
      );

      const monthName = moment(monthStart).format('MMM YYYY');

      const pendapatan = await this.prisma.history.aggregate({
        where: {
          tgl_selesai: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        _sum: { harga: true },
      });

      result.push({
        bulan: monthName,
        pendapatan: pendapatan._sum.harga || 0,
      });

      // Move to next month
      current.setMonth(current.getMonth() + 1);
    }

    return result;
  }
}

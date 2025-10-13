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
  sewas: Array<{
    id: number;
    durasi_sewa: number;
    total_harga: number;
    status: string;
    created_at: Date;
  }>;
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
    motor_id: number;
    _sum: {
      total_harga: number | null;
    };
    motor?: {
      plat_nomor: string;
      merk: string;
      model: string;
    };
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
    motor_id: number;
    _count: {
      id: number;
    };
    motor?: {
      plat_nomor: string;
      merk: string;
      model: string;
    };
  }>;
  penyewaTeraktif: Array<{
    penyewa_id: number;
    _count: {
      id: number;
    };
    penyewa?: {
      nama: string;
      no_whatsapp: string;
    };
  }>;
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
      // Jumlah sewa aktif
      this.prisma.sewa.count({
        where: { status: this.STATUS.AKTIF },
      }),

      // Jumlah motor tersedia
      this.prisma.motor.count({
        where: { status: this.STATUS.TERSEDIA },
      }),

      // Total pendapatan dari sewa yang selesai
      this.prisma.sewa.aggregate({
        where: { status: this.STATUS.SELESAI },
        _sum: { total_harga: true },
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

      // Sewa per bulan (6 bulan terakhir)
      this.getSewaLast6Months(),
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
      totalPendapatan: totalPendapatan._sum.total_harga || 0,
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
      // Total sewa bulan ini
      this.prisma.sewa.count({
        where: {
          created_at: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),

      // Total pendapatan bulan ini
      this.prisma.sewa.aggregate({
        where: {
          status: this.STATUS.SELESAI,
          created_at: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: { total_harga: true },
      }),

      // Sewa per hari dalam bulan
      this.getSewaPerHari(targetYear, targetMonth),

      // Motor terpopuler bulan ini
      this.prisma.sewa.groupBy({
        by: ['motor_id'],
        where: {
          created_at: {
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

      // Penyewa teraktif bulan ini
      this.prisma.sewa.groupBy({
        by: ['penyewa_id'],
        where: {
          created_at: {
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

    // Get motor details for popular motors
    const motorDetails = await Promise.all(
      motorTerpopuler.map(async (item) => {
        const motor = await this.prisma.motor.findUnique({
          where: { id: item.motor_id },
          select: { plat_nomor: true, merk: true, model: true },
        });
        return {
          ...item,
          motor,
        };
      }),
    );

    // Get penyewa details for active penyewa
    const penyewaDetails = await Promise.all(
      penyewaTeraktif.map(async (item) => {
        const penyewa = await this.prisma.penyewa.findUnique({
          where: { id: item.penyewa_id },
          select: { nama: true, no_whatsapp: true },
        });
        return {
          ...item,
          penyewa,
        };
      }),
    );

    return {
      periode: `${targetMonth}/${targetYear}`,
      totalSewa,
      totalPendapatan: totalPendapatan._sum.total_harga || 0,
      sewaPerHari,
      motorTerpopuler: motorDetails,
      penyewaTeraktif: penyewaDetails,
    };
  }

  async getMotorUsage(
    startDate?: string,
    endDate?: string,
  ): Promise<MotorUsage[]> {
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago
    const end = endDate ? new Date(endDate) : new Date();

    const motorUsage = await this.prisma.motor.findMany({
      include: {
        sewas: {
          where: {
            created_at: {
              gte: start,
              lte: end,
            },
          },
          select: {
            id: true,
            durasi_sewa: true,
            total_harga: true,
            status: true,
            created_at: true,
          },
        },
        _count: {
          select: {
            sewas: {
              where: {
                created_at: {
                  gte: start,
                  lte: end,
                },
              },
            },
          },
        },
      },
      orderBy: {
        sewas: {
          _count: 'desc',
        },
      },
    });

    return motorUsage.map((motor) => ({
      id: motor.id,
      plat_nomor: motor.plat_nomor,
      merk: motor.merk,
      model: motor.model,
      status: motor.status,
      total_sewa: motor._count.sewas,
      total_durasi: motor.sewas.reduce(
        (sum, sewa) => sum + sewa.durasi_sewa,
        0,
      ),
      total_pendapatan: motor.sewas.reduce(
        (sum, sewa) => sum + sewa.total_harga,
        0,
      ),
      sewas: motor.sewas,
    }));
  }

  async getFinancialReports(
    startDate?: string,
    endDate?: string,
  ): Promise<FinancialReport> {
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // Default: 1 year ago
    const end = endDate ? new Date(endDate) : new Date();

    const [
      totalPendapatan,
      pendapatanPerBulan,
      pendapatanPerMotor,
      dendaTotal,
    ] = await Promise.all([
      // Total pendapatan
      this.prisma.sewa.aggregate({
        where: {
          status: this.STATUS.SELESAI,
          created_at: {
            gte: start,
            lte: end,
          },
        },
        _sum: { total_harga: true },
      }),

      // Pendapatan per bulan
      this.getPendapatanPerBulan(start, end),

      // Pendapatan per motor
      this.prisma.sewa.groupBy({
        by: ['motor_id'],
        where: {
          status: this.STATUS.SELESAI,
          created_at: {
            gte: start,
            lte: end,
          },
        },
        _sum: { total_harga: true },
        orderBy: {
          _sum: {
            total_harga: 'desc',
          },
        },
      }),

      // Total denda
      this.prisma.history.aggregate({
        where: {
          created_at: {
            gte: start,
            lte: end,
          },
        },
        _sum: { denda: true },
      }),
    ]);

    // Get motor details for pendapatan per motor
    const motorDetails = await Promise.all(
      pendapatanPerMotor.map(async (item) => {
        const motor = await this.prisma.motor.findUnique({
          where: { id: item.motor_id },
          select: { plat_nomor: true, merk: true, model: true },
        });
        return {
          ...item,
          motor,
        };
      }),
    );

    return {
      periode: {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      },
      totalPendapatan: totalPendapatan._sum.total_harga || 0,
      totalDenda: dendaTotal._sum.denda || 0,
      pendapatanPerBulan,
      pendapatanPerMotor: motorDetails,
    };
  }

  private async getSewaLast6Months(): Promise<SewaPerBulan[]> {
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

      const count = await this.prisma.sewa.count({
        where: {
          created_at: {
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

  private async getSewaPerHari(
    year: number,
    month: number,
  ): Promise<SewaPerHari[]> {
    const daysInMonth = new Date(year, month, 0).getDate();
    const sewaPerHari: SewaPerHari[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const startDate = new Date(year, month - 1, day, 0, 0, 0);
      const endDate = new Date(year, month - 1, day, 23, 59, 59);

      const count = await this.prisma.sewa.count({
        where: {
          created_at: {
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

  private async getPendapatanPerBulan(
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

      const pendapatan = await this.prisma.sewa.aggregate({
        where: {
          status: this.STATUS.SELESAI,
          created_at: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        _sum: { total_harga: true },
      });

      result.push({
        bulan: monthName,
        pendapatan: pendapatan._sum.total_harga || 0,
      });

      // Move to next month
      current.setMonth(current.getMonth() + 1);
    }

    return result;
  }
}

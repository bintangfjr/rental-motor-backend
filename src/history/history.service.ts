import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class HistoryService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number = 1, limit: number = 10, search?: string) {
    const skip = (page - 1) * limit;

    // ✅ FIXED: Search langsung di field history (bukan melalui relation)
    const where: Prisma.HistoryWhereInput = search
      ? {
          OR: [
            { motor_plat: { contains: search } },
            { penyewa_nama: { contains: search } },
            { status_selesai: { contains: search } },
            { catatan: { contains: search } },
          ],
        }
      : {};

    const [histories, total] = await Promise.all([
      this.prisma.history.findMany({
        where,
        // ✅ FIXED: Tidak perlu include sewa karena data sudah lengkap
        orderBy: { tgl_selesai: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.history.count({ where }),
    ]);

    return {
      data: histories,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const history = await this.prisma.history.findUnique({
      where: { id },
      // ✅ FIXED: Data sudah lengkap, tidak perlu include relation
    });

    if (!history) {
      throw new NotFoundException('History not found');
    }

    return history;
  }

  async remove(id: number) {
    const history = await this.prisma.history.findUnique({
      where: { id },
    });

    if (!history) {
      throw new NotFoundException('History not found');
    }

    await this.prisma.history.delete({
      where: { id },
    });

    return { message: 'History berhasil dihapus.' };
  }

  async getStatsSummary() {
    const [
      totalHistories,
      totalPendapatan,
      totalDenda,
      statusSummary,
      recentHistories,
    ] = await Promise.all([
      this.prisma.history.count(),

      this.prisma.history.aggregate({
        _sum: { harga: true },
      }),

      this.prisma.history.aggregate({
        _sum: { denda: true },
      }),

      this.prisma.history.groupBy({
        by: ['status_selesai'],
        _count: { id: true },
      }),

      // ✅ FIXED: Data sudah lengkap, tidak perlu include relation
      this.prisma.history.findMany({
        orderBy: { created_at: 'desc' },
        take: 5,
      }),
    ]);

    return {
      totalHistories,
      totalPendapatan: totalPendapatan._sum.harga || 0,
      totalDenda: totalDenda._sum.denda || 0,
      statusSummary: statusSummary.reduce(
        (acc, item) => {
          acc[item.status_selesai] = item._count.id;
          return acc;
        },
        {} as Record<string, number>,
      ),
      recentHistories,
    };
  }

  async getHistoriesByDateRange(startDate: Date, endDate: Date) {
    return this.prisma.history.findMany({
      where: {
        tgl_selesai: {
          gte: startDate,
          lte: endDate,
        },
      },
      // ✅ FIXED: Data sudah lengkap, tidak perlu include relation
      orderBy: { tgl_selesai: 'desc' },
    });
  }

  // ✅ METHOD BARU: Cari history by plat motor
  async findByPlatMotor(platNomor: string) {
    return this.prisma.history.findMany({
      where: {
        motor_plat: {
          contains: platNomor,
        },
      },
      orderBy: { tgl_selesai: 'desc' },
    });
  }

  // ✅ METHOD BARU: Cari history by nama penyewa
  async findByPenyewa(namaPenyewa: string) {
    return this.prisma.history.findMany({
      where: {
        penyewa_nama: {
          contains: namaPenyewa,
        },
      },
      orderBy: { tgl_selesai: 'desc' },
    });
  }
}

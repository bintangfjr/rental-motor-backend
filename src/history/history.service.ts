import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class HistoryService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number = 1, limit: number = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.HistoryWhereInput = {};

    if (search) {
      where.OR = [
        {
          sewa: {
            motor: {
              plat_nomor: {
                contains: search,
              },
            },
          },
        },
        {
          sewa: {
            penyewa: {
              nama: {
                contains: search,
              },
            },
          },
        },
        {
          status_selesai: {
            contains: search,
          },
        },
      ];
    }

    const [histories, total] = await Promise.all([
      this.prisma.history.findMany({
        where,
        include: {
          sewa: {
            include: {
              motor: {
                select: {
                  id: true,
                  plat_nomor: true,
                  merk: true,
                  model: true,
                },
              },
              penyewa: {
                select: {
                  id: true,
                  nama: true,
                  no_whatsapp: true,
                },
              },
            },
          },
        },
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
      include: {
        sewa: {
          include: {
            motor: {
              select: {
                id: true,
                plat_nomor: true,
                merk: true,
                model: true,
                tahun: true,
                harga: true,
              },
            },
            penyewa: {
              select: {
                id: true,
                nama: true,
                no_whatsapp: true,
                alamat: true,
              },
            },
            admin: {
              select: {
                id: true,
                nama_lengkap: true,
                username: true,
              },
            },
          },
        },
      },
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

      this.prisma.history.findMany({
        include: {
          sewa: {
            include: {
              motor: { select: { plat_nomor: true, merk: true } },
              penyewa: { select: { nama: true } },
            },
          },
        },
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
      include: {
        sewa: {
          include: {
            motor: { select: { plat_nomor: true, merk: true, model: true } },
            penyewa: { select: { nama: true, no_whatsapp: true } },
          },
        },
      },
      orderBy: { tgl_selesai: 'desc' },
    });
  }
}

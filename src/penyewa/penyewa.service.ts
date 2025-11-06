import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreatePenyewaDto } from './dto/create-penyewa.dto';
import { UpdatePenyewaDto } from './dto/update-penyewa.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PenyewaService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.penyewa.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: {
            sewas: true,
          },
        },
        sewas: {
          where: {
            status: 'Aktif',
          },
          select: {
            id: true,
          },
        },
      },
    });
  }

  async findOne(id: number) {
    const penyewa = await this.prisma.penyewa.findUnique({
      where: { id },
      include: {
        sewas: {
          include: {
            motor: {
              select: {
                id: true,
                plat_nomor: true,
                merk: true,
                model: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        },
        _count: {
          select: {
            sewas: true,
          },
        },
      },
    });

    if (!penyewa) {
      throw new NotFoundException('Penyewa not found');
    }

    // Menambahkan count sewas aktif
    const sewasAktifCount = await this.prisma.sewa.count({
      where: {
        penyewa_id: id,
        status: 'Aktif',
      },
    });

    return {
      ...penyewa,
      sewas_aktif_count: sewasAktifCount,
    };
  }

  // ✅ METHOD BARU: Get History Sewa by Penyewa ID
  async getPenyewaHistory(penyewaId: number) {
    const penyewa = await this.prisma.penyewa.findUnique({
      where: { id: penyewaId },
    });

    if (!penyewa) {
      throw new NotFoundException('Penyewa not found');
    }

    return this.prisma.history.findMany({
      where: {
        penyewa_whatsapp: penyewa.no_whatsapp, // Menggunakan no_whatsapp sebagai identifier
      },
      orderBy: { tgl_selesai: 'desc' },
    });
  }

  // ✅ METHOD BARU: Get Statistik History Sewa
  async getPenyewaHistoryStats(penyewaId: number) {
    const penyewa = await this.prisma.penyewa.findUnique({
      where: { id: penyewaId },
    });

    if (!penyewa) {
      throw new NotFoundException('Penyewa not found');
    }

    const histories = await this.prisma.history.findMany({
      where: {
        penyewa_whatsapp: penyewa.no_whatsapp,
      },
    });

    const totalSewa = histories.length;
    const totalPendapatan = histories.reduce(
      (sum, item) => sum + item.harga,
      0,
    );
    const totalDenda = histories.reduce(
      (sum, item) => sum + (item.denda || 0),
      0,
    );
    const sewaSelesai = histories.filter(
      (item) => item.status_selesai === 'Selesai',
    ).length;
    const sewaDenda = histories.filter((item) => (item.denda || 0) > 0).length;
    const keterlambatanTotal = histories.reduce(
      (sum, item) => sum + (item.keterlambatan_menit || 0),
      0,
    );

    return {
      totalSewa,
      totalPendapatan,
      totalDenda,
      sewaSelesai,
      sewaDenda,
      keterlambatanTotal,
      rataRataDenda: sewaDenda > 0 ? totalDenda / sewaDenda : 0,
    };
  }

  async create(createPenyewaDto: CreatePenyewaDto, file?: Express.Multer.File) {
    try {
      const data: any = {
        nama: createPenyewaDto.nama,
        alamat: createPenyewaDto.alamat,
        no_whatsapp: createPenyewaDto.no_whatsapp,
      };

      if (file) {
        data.foto_ktp = `fotos_penyewa/${file.filename}`;
      }

      return await this.prisma.penyewa.create({
        data,
        select: {
          id: true,
          nama: true,
          alamat: true,
          no_whatsapp: true,
          foto_ktp: true,
          is_blacklisted: true,
          created_at: true,
          updated_at: true,
        },
      });
    } catch (error: unknown) {
      if (
        this.isPrismaClientKnownRequestError(error) &&
        error.code === 'P2002'
      ) {
        throw new HttpException(
          'Nomor WhatsApp already exists',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(
    id: number,
    updatePenyewaDto: UpdatePenyewaDto,
    file?: Express.Multer.File,
  ) {
    try {
      const penyewa = await this.prisma.penyewa.findUnique({ where: { id } });
      if (!penyewa) {
        throw new NotFoundException('Penyewa not found');
      }

      const data: any = {
        nama: updatePenyewaDto.nama,
        alamat: updatePenyewaDto.alamat,
        no_whatsapp: updatePenyewaDto.no_whatsapp,
      };

      if (file) {
        if (penyewa.foto_ktp) {
          const oldFilePath = path.join('uploads', penyewa.foto_ktp);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        data.foto_ktp = `fotos_penyewa/${file.filename}`;
      }

      return await this.prisma.penyewa.update({
        where: { id },
        data,
        select: {
          id: true,
          nama: true,
          alamat: true,
          no_whatsapp: true,
          foto_ktp: true,
          is_blacklisted: true,
          created_at: true,
          updated_at: true,
        },
      });
    } catch (error: unknown) {
      if (
        this.isPrismaClientKnownRequestError(error) &&
        error.code === 'P2002'
      ) {
        throw new HttpException(
          'Nomor WhatsApp already exists',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async toggleBlacklist(id: number) {
    const penyewa = await this.prisma.penyewa.findUnique({ where: { id } });
    if (!penyewa) {
      throw new NotFoundException('Penyewa not found');
    }

    return this.prisma.penyewa.update({
      where: { id },
      data: {
        is_blacklisted: !penyewa.is_blacklisted,
      },
      select: {
        id: true,
        nama: true,
        alamat: true,
        no_whatsapp: true,
        foto_ktp: true,
        is_blacklisted: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async remove(id: number) {
    const penyewa = await this.prisma.penyewa.findUnique({
      where: { id },
      include: {
        sewas: {
          where: {
            status: 'Aktif',
          },
        },
      },
    });

    if (!penyewa) {
      throw new NotFoundException('Penyewa not found');
    }

    if (penyewa.sewas.length > 0) {
      throw new BadRequestException(
        'Tidak dapat menghapus penyewa yang memiliki sewa aktif.',
      );
    }

    if (penyewa.foto_ktp) {
      const filePath = path.join('uploads', penyewa.foto_ktp);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await this.prisma.sewa.deleteMany({
      where: { penyewa_id: id },
    });

    await this.prisma.penyewa.delete({
      where: { id },
    });

    return { message: 'Penyewa berhasil dihapus.' };
  }

  private isPrismaClientKnownRequestError(
    error: unknown,
  ): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as any).code === 'string'
    );
  }
}

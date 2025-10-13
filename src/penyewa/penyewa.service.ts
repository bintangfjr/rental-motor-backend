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
    // ✅ Kembali ke number
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
      // Handle Prisma unique constraint error
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
    id: number, // ✅ Kembali ke number
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
        // Hapus foto lama jika ada
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
      // Handle Prisma unique constraint error
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
    // ✅ Kembali ke number
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
    // ✅ Kembali ke number
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

    // Hapus foto jika ada
    if (penyewa.foto_ktp) {
      const filePath = path.join('uploads', penyewa.foto_ktp);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Hapus semua sewa terkait
    await this.prisma.sewa.deleteMany({
      where: { penyewa_id: id },
    });

    // Hapus penyewa
    await this.prisma.penyewa.delete({
      where: { id },
    });

    return { message: 'Penyewa berhasil dihapus.' };
  }

  // Type guard untuk Prisma errors
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

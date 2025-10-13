import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateMotorDto } from './dto/create-motor.dto';
import { UpdateMotorDto } from './dto/update-motor.dto';

@Injectable()
export class MotorService {
  constructor(private prisma: PrismaService) {}

  private readonly STATUS = {
    TERSEDIA: 'tersedia',
    DISEWA: 'disewa',
    PERBAIKAN: 'perbaikan',
  };

  async findAll() {
    return this.prisma.motor.findMany({
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        plat_nomor: true,
        merk: true,
        model: true,
        tahun: true,
        harga: true,
        no_gsm: true,
        imei: true,
        status: true,
        device_id: true,
        lat: true,
        lng: true,
        last_update: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async findWithGps() {
    return this.prisma.motor.findMany({
      where: {
        lat: { not: null },
        lng: { not: null },
      },
      select: {
        id: true,
        plat_nomor: true,
        merk: true,
        model: true,
        status: true,
        lat: true,
        lng: true,
        last_update: true,
      },
    });
  }

  async findOne(id: number) {
    const motor = await this.prisma.motor.findUnique({
      where: { id },
      include: {
        sewas: {
          include: {
            penyewa: {
              select: {
                id: true,
                nama: true,
                no_whatsapp: true, // ✅ diganti dari no_hp ke no_whatsapp
              },
            },
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!motor) {
      throw new NotFoundException(`Motor dengan ID ${id} tidak ditemukan`);
    }

    return motor;
  }

  async create(createMotorDto: CreateMotorDto) {
    // Cek plat nomor sudah ada atau belum
    const existingMotor = await this.prisma.motor.findUnique({
      where: { plat_nomor: createMotorDto.plat_nomor },
    });

    if (existingMotor) {
      throw new ConflictException('Plat nomor sudah digunakan');
    }

    return this.prisma.motor.create({
      data: {
        plat_nomor: createMotorDto.plat_nomor,
        merk: createMotorDto.merk,
        model: createMotorDto.model,
        tahun: createMotorDto.tahun,
        harga: createMotorDto.harga,
        no_gsm: createMotorDto.no_gsm,
        imei: createMotorDto.imei,
        status: createMotorDto.status ?? this.STATUS.TERSEDIA,
      },
      select: {
        id: true,
        plat_nomor: true,
        merk: true,
        model: true,
        tahun: true,
        harga: true,
        no_gsm: true,
        imei: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async update(id: number, updateMotorDto: UpdateMotorDto) {
    // Pastikan motor ada
    const existingMotor = await this.prisma.motor.findUnique({
      where: { id },
    });

    if (!existingMotor) {
      throw new NotFoundException(`Motor dengan ID ${id} tidak ditemukan`);
    }

    // Cek apakah plat_nomor baru bentrok dengan motor lain
    if (
      updateMotorDto.plat_nomor &&
      updateMotorDto.plat_nomor !== existingMotor.plat_nomor
    ) {
      const motorWithSamePlat = await this.prisma.motor.findUnique({
        where: { plat_nomor: updateMotorDto.plat_nomor },
      });

      if (motorWithSamePlat && motorWithSamePlat.id !== id) {
        throw new ConflictException('Plat nomor sudah digunakan');
      }
    }

    return this.prisma.motor.update({
      where: { id },
      data: {
        plat_nomor: updateMotorDto.plat_nomor,
        merk: updateMotorDto.merk,
        model: updateMotorDto.model,
        tahun: updateMotorDto.tahun,
        harga: updateMotorDto.harga,
        no_gsm: updateMotorDto.no_gsm,
        imei: updateMotorDto.imei,
        status: updateMotorDto.status,
      },
      select: {
        id: true,
        plat_nomor: true,
        merk: true,
        model: true,
        tahun: true,
        harga: true,
        no_gsm: true,
        imei: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async remove(id: number) {
    const motor = await this.prisma.motor.findUnique({
      where: { id },
      include: {
        sewas: {
          where: {
            status: 'Aktif', // ✅ sesuaikan dengan enum status sewa
          },
        },
      },
    });

    if (!motor) {
      throw new NotFoundException(`Motor dengan ID ${id} tidak ditemukan`);
    }

    if (motor.status === this.STATUS.DISEWA || motor.sewas.length > 0) {
      throw new BadRequestException(
        'Tidak dapat menghapus motor yang sedang disewa.',
      );
    }

    // Hapus semua sewa terkait (jika ada)
    await this.prisma.sewa.deleteMany({
      where: { motor_id: id },
    });

    // Hapus motor
    await this.prisma.motor.delete({
      where: { id },
    });

    return { message: 'Motor berhasil dihapus.' };
  }
}

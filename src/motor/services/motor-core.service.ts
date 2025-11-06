// src/motor/services/motor-core.service.ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  Motor,
  MotorMileageHistory,
  MotorLocationCache,
  ServiceRecord,
  Sewa,
  Penyewa,
} from '@prisma/client';

// Interface untuk motor dengan relations - TYPE SAFE
interface MotorWithRelations extends Motor {
  sewas?: (Sewa & {
    penyewa: Pick<Penyewa, 'id' | 'nama' | 'no_whatsapp'>;
  })[];
  mileage_history?: MotorMileageHistory[];
  location_cache?: MotorLocationCache[];
  service_records?: ServiceRecord[];
}

// Constants untuk konsistensi
const MOTOR_STATUS = {
  TERSEDIA: 'tersedia',
  DISEWA: 'disewa',
  PERBAIKAN: 'perbaikan',
  PENDING_PERBAIKAN: 'pending_perbaikan',
} as const;

const SERVICE_CONFIG = {
  DEFAULT_MILEAGE_THRESHOLD: 800,
  SERVICE_REMINDER_DAYS: 30,
} as const;

@Injectable()
export class MotorCoreService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all motors
   */
  async findAll(): Promise<Motor[]> {
    return this.prisma.motor.findMany({
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Get single motor dengan relations lengkap
   */
  async findOneWithRelations(id: number): Promise<MotorWithRelations | null> {
    return this.prisma.motor.findUnique({
      where: { id },
      include: {
        sewas: {
          include: {
            penyewa: {
              select: {
                id: true,
                nama: true,
                no_whatsapp: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        },
        mileage_history: {
          orderBy: { period_date: 'desc' },
          take: 30,
        },
        location_cache: {
          orderBy: { gps_time: 'desc' },
          take: 5,
        },
        service_records: {
          orderBy: { service_date: 'desc' },
          take: 10,
        },
      },
    });
  }

  /**
   * Get motor by ID (basic)
   */
  async findOne(id: number): Promise<Motor | null> {
    return this.prisma.motor.findUnique({
      where: { id },
    });
  }

  /**
   * Create new motor
   */
  async create(
    createData: Parameters<PrismaService['motor']['create']>[0]['data'],
  ): Promise<Motor> {
    // Cek plat nomor sudah ada atau belum
    const existingMotor = await this.prisma.motor.findUnique({
      where: { plat_nomor: createData.plat_nomor },
    });

    if (existingMotor) {
      throw new ConflictException('Plat nomor sudah digunakan');
    }

    return this.prisma.motor.create({
      data: createData,
    });
  }

  /**
   * Update motor
   */
  async update(
    id: number,
    updateData: Parameters<PrismaService['motor']['update']>[0]['data'],
  ): Promise<Motor> {
    const existingMotor = await this.findOne(id);

    if (!existingMotor) {
      throw new NotFoundException(`Motor dengan ID ${id} tidak ditemukan`);
    }

    // Cek plat nomor bentrok
    if (
      updateData.plat_nomor &&
      updateData.plat_nomor !== existingMotor.plat_nomor
    ) {
      const motorWithSamePlat = await this.prisma.motor.findUnique({
        where: { plat_nomor: updateData.plat_nomor as string },
      });

      if (motorWithSamePlat && motorWithSamePlat.id !== id) {
        throw new ConflictException('Plat nomor sudah digunakan');
      }
    }

    return this.prisma.motor.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Delete motor dan data terkait
   */
  async remove(id: number): Promise<void> {
    const motor = await this.prisma.motor.findUnique({
      where: { id },
      include: {
        sewas: {
          where: {
            status: 'Aktif',
          },
        },
        service_records: {
          where: {
            status: 'in_progress',
          },
        },
      },
    });

    if (!motor) {
      throw new NotFoundException(`Motor dengan ID ${id} tidak ditemukan`);
    }

    if (
      motor.status === MOTOR_STATUS.DISEWA ||
      (motor.sewas && motor.sewas.length > 0)
    ) {
      throw new ConflictException(
        'Tidak dapat menghapus motor yang sedang disewa.',
      );
    }

    if (motor.service_records && motor.service_records.length > 0) {
      throw new ConflictException(
        'Tidak dapat menghapus motor yang sedang dalam proses service.',
      );
    }

    // Hapus data terkait dalam transaction
    await this.prisma.$transaction([
      this.prisma.motorMileageHistory.deleteMany({
        where: { motor_id: id },
      }),
      this.prisma.motorLocationCache.deleteMany({
        where: { motor_id: id },
      }),
      this.prisma.serviceRecord.deleteMany({
        where: { motor_id: id },
      }),
      this.prisma.sewa.deleteMany({
        where: { motor_id: id },
      }),
      this.prisma.motor.delete({
        where: { id },
      }),
    ]);
  }

  /**
   * Update motor status
   */
  async updateStatus(id: number, status: string): Promise<Motor> {
    const validStatuses = Object.values(MOTOR_STATUS);

    if (!validStatuses.includes(status as any)) {
      throw new BadRequestException('Status motor tidak valid');
    }

    const motor = await this.findOne(id);
    if (!motor) {
      throw new NotFoundException(`Motor dengan ID ${id} tidak ditemukan`);
    }

    return this.prisma.motor.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Get motors by status
   */
  async findByStatus(status: string): Promise<Motor[]> {
    const validStatuses = Object.values(MOTOR_STATUS);

    if (!validStatuses.includes(status as any)) {
      throw new BadRequestException('Status motor tidak valid');
    }

    return this.prisma.motor.findMany({
      where: { status },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Get motors that need routine service based on mileage
   */
  async findMotorsNeedingService(
    mileageThreshold: number = SERVICE_CONFIG.DEFAULT_MILEAGE_THRESHOLD,
  ): Promise<Motor[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(
      thirtyDaysAgo.getDate() - SERVICE_CONFIG.SERVICE_REMINDER_DAYS,
    );

    return this.prisma.motor.findMany({
      where: {
        status: MOTOR_STATUS.TERSEDIA,
        OR: [
          {
            total_mileage: {
              gte: mileageThreshold,
            },
          },
          {
            last_service_date: {
              lte: thirtyDaysAgo,
            },
          },
        ],
      },
      orderBy: { total_mileage: 'desc' },
    });
  }
}

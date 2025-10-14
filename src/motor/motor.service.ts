// src/motor/motor.service.ts
import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateMotorDto } from './dto/create-motor.dto';
import { UpdateMotorDto } from './dto/update-motor.dto';
import { IopgpsService } from '../iopgps/iopgps.service';

// Interface untuk enhanced motor dengan GPS
interface EnhancedMotor {
  id: number;
  plat_nomor: string;
  merk: string;
  model: string;
  status: string;
  lat?: number | null;
  lng?: number | null;
  last_update?: Date | null;
  imei?: string | null;
  no_gsm?: string | null;
  gps_status: 'realtime' | 'cached' | 'no_data' | 'no_imei';
  location_source: 'iopgps' | 'database';
}

// Interface untuk error handling
interface ErrorWithMessage {
  message: string;
}

@Injectable()
export class MotorService {
  private readonly logger = new Logger(MotorService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(IopgpsService) private iopgpsService: IopgpsService,
  ) {}

  private readonly STATUS = {
    TERSEDIA: 'tersedia',
    DISEWA: 'disewa',
    PERBAIKAN: 'perbaikan',
  };

  /**
   * Extract error message safely
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as ErrorWithMessage).message);
    }
    return 'Unknown error occurred';
  }

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

  async findWithGps(): Promise<EnhancedMotor[]> {
    const motors = await this.prisma.motor.findMany({
      where: {
        OR: [
          { lat: { not: null }, lng: { not: null } },
          { imei: { not: null } },
        ],
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
        imei: true,
        no_gsm: true,
      },
    });

    // Enhance with IOPGPS data for motors with IMEI
    const enhancedMotors = await Promise.all(
      motors.map(async (motor): Promise<EnhancedMotor> => {
        if (!motor.imei) {
          return {
            ...motor,
            gps_status: 'no_imei',
            location_source: 'database',
          };
        }

        try {
          // Try to get real-time location from IOPGPS
          const iopgpsLocation = await this.iopgpsService.getDeviceLocation(
            motor.imei,
          );

          if (
            iopgpsLocation.code === 0 &&
            iopgpsLocation.lat &&
            iopgpsLocation.lng
          ) {
            return {
              ...motor,
              lat: parseFloat(iopgpsLocation.lat),
              lng: parseFloat(iopgpsLocation.lng),
              last_update: iopgpsLocation.gpsTime
                ? new Date(iopgpsLocation.gpsTime * 1000)
                : motor.last_update,
              gps_status: 'realtime',
              location_source: 'iopgps',
            };
          }
        } catch (error: unknown) {
          // Fallback to database data
          const errorMessage = this.getErrorMessage(error);
          this.logger.warn(
            `Failed to get IOPGPS data for IMEI ${motor.imei}: ${errorMessage}`,
          );
        }

        return {
          ...motor,
          gps_status: motor.lat && motor.lng ? 'cached' : 'no_data',
          location_source: 'database',
        };
      }),
    );

    return enhancedMotors;
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
                no_whatsapp: true,
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

    // Enhance with IOPGPS data if available
    if (motor.imei) {
      try {
        const iopgpsData = await this.iopgpsService.getDeviceLocation(
          motor.imei,
        );
        if (iopgpsData.code === 0) {
          // Create a new object to avoid mutating the original
          return {
            ...motor,
            lat: iopgpsData.lat ? parseFloat(iopgpsData.lat) : motor.lat,
            lng: iopgpsData.lng ? parseFloat(iopgpsData.lng) : motor.lng,
            last_update: iopgpsData.gpsTime
              ? new Date(iopgpsData.gpsTime * 1000)
              : motor.last_update,
          };
        }
      } catch (error: unknown) {
        const errorMessage = this.getErrorMessage(error);
        this.logger.warn(
          `Failed to fetch IOPGPS data for motor ${id}: ${errorMessage}`,
        );
      }
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

    // Jika ada IMEI, validasi dengan IOPGPS
    if (createMotorDto.imei) {
      try {
        const deviceInfo = await this.iopgpsService.getDeviceLocation(
          createMotorDto.imei,
        );
        if (deviceInfo.code !== 0) {
          throw new BadRequestException(
            `IMEI ${createMotorDto.imei} tidak valid di sistem IOPGPS`,
          );
        }
      } catch (error: unknown) {
        const errorMessage = this.getErrorMessage(error);
        throw new BadRequestException(
          `Gagal memverifikasi IMEI: ${errorMessage}`,
        );
      }
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

    // Jika IMEI diubah, validasi dengan IOPGPS
    if (updateMotorDto.imei && updateMotorDto.imei !== existingMotor.imei) {
      try {
        const deviceInfo = await this.iopgpsService.getDeviceLocation(
          updateMotorDto.imei,
        );
        if (deviceInfo.code !== 0) {
          throw new BadRequestException(
            `IMEI ${updateMotorDto.imei} tidak valid di sistem IOPGPS`,
          );
        }
      } catch (error: unknown) {
        const errorMessage = this.getErrorMessage(error);
        throw new BadRequestException(
          `Gagal memverifikasi IMEI: ${errorMessage}`,
        );
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
            status: 'Aktif',
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

  // ✅ Method untuk mendapatkan mileage dari IOPGPS
  async getMileage(imei: string, startTime: number, endTime: number) {
    if (!imei) {
      throw new BadRequestException(
        'IMEI diperlukan untuk mendapatkan mileage',
      );
    }

    try {
      const mileage = await this.iopgpsService.getDeviceMileage(
        imei,
        startTime,
        endTime,
      );
      return {
        success: true,
        data: mileage,
        message: 'Data mileage berhasil diambil',
      };
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      throw new BadRequestException(
        `Gagal mengambil data mileage: ${errorMessage}`,
      );
    }
  }

  // ✅ Method untuk sync lokasi manual
  async syncMotorLocation(motorId: number) {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
      select: { id: true, imei: true, plat_nomor: true },
    });

    if (!motor) {
      throw new NotFoundException(`Motor dengan ID ${motorId} tidak ditemukan`);
    }

    if (!motor.imei) {
      throw new BadRequestException('Motor tidak memiliki IMEI');
    }

    try {
      const location = await this.iopgpsService.getDeviceLocation(motor.imei);

      if (location.code === 0 && location.lat && location.lng) {
        const updatedMotor = await this.prisma.motor.update({
          where: { id: motorId },
          data: {
            lat: parseFloat(location.lat),
            lng: parseFloat(location.lng),
            last_update: location.gpsTime
              ? new Date(location.gpsTime * 1000)
              : new Date(),
          },
        });

        return {
          success: true,
          data: updatedMotor,
          message: 'Lokasi motor berhasil disinkronisasi',
        };
      } else {
        throw new Error('Tidak ada data lokasi yang valid dari IOPGPS');
      }
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      throw new BadRequestException(
        `Gagal sinkronisasi lokasi: ${errorMessage}`,
      );
    }
  }

  // ✅ Method untuk mendapatkan riwayat perjalanan
  async getTrackHistory(imei: string, startTime: number, endTime?: number) {
    if (!imei) {
      throw new BadRequestException(
        'IMEI diperlukan untuk mendapatkan riwayat perjalanan',
      );
    }

    try {
      const trackHistory = await this.iopgpsService.getDeviceTrackHistory(
        imei,
        startTime,
        endTime,
      );
      return {
        success: true,
        data: trackHistory,
        message: 'Riwayat perjalanan berhasil diambil',
      };
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      throw new BadRequestException(
        `Gagal mengambil riwayat perjalanan: ${errorMessage}`,
      );
    }
  }
}

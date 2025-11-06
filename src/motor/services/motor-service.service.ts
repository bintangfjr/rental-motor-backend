// src/motor/services/motor-service.service.ts
import {
  Injectable,
  BadRequestException,
  // HAPUS: NotFoundException, // ❌ Tidak digunakan
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { MotorCoreService } from './motor-core.service';
import { Motor, Prisma } from '@prisma/client';

// Constants untuk konsistensi
const MOTOR_STATUS = {
  TERSEDIA: 'tersedia',
  DISEWA: 'disewa',
  PERBAIKAN: 'perbaikan',
  PENDING_PERBAIKAN: 'pending_perbaikan',
} as const;

// Interface untuk service info data
interface ServiceInfoUpdateData {
  service_technician?: string;
  last_service_date?: string;
  service_notes?: string;
}

@Injectable()
export class MotorServiceService {
  constructor(
    private prisma: PrismaService,
    private motorCoreService: MotorCoreService,
  ) {}

  /**
   * Mark motor for service
   */
  async markForService(id: number, serviceNotes?: string): Promise<Motor> {
    const motor = await this.motorCoreService.findOne(id);

    // ✅ Type safety - motor sudah pasti Motor type
    if (motor.status === MOTOR_STATUS.DISEWA) {
      throw new BadRequestException(
        'Tidak dapat melakukan service pada motor yang sedang disewa.',
      );
    }

    // Update status motor ke pending_perbaikan
    const updateData: Prisma.MotorUpdateInput = {
      status: MOTOR_STATUS.PENDING_PERBAIKAN,
    };

    if (serviceNotes) {
      updateData.service_notes = serviceNotes;
    }

    return this.motorCoreService.update(id, updateData);
  }

  /**
   * Complete service
   */
  async completeService(id: number): Promise<Motor> {
    const motor = await this.motorCoreService.findOne(id);

    if (
      motor.status !== MOTOR_STATUS.PERBAIKAN &&
      motor.status !== MOTOR_STATUS.PENDING_PERBAIKAN
    ) {
      throw new BadRequestException('Motor tidak dalam status service.');
    }

    // Update status motor ke tersedia dan reset service info
    return this.motorCoreService.update(id, {
      status: MOTOR_STATUS.TERSEDIA,
      service_technician: null,
      service_notes: null,
      total_mileage: 0, // Reset total_mileage untuk service rutin
    });
  }

  /**
   * Start service for motor
   */
  async startService(id: number, technician: string): Promise<Motor> {
    const motor = await this.motorCoreService.findOne(id);

    if (
      motor.status !== MOTOR_STATUS.PENDING_PERBAIKAN &&
      motor.status !== MOTOR_STATUS.TERSEDIA
    ) {
      throw new BadRequestException(
        'Motor tidak dapat memulai service dari status saat ini.',
      );
    }

    return this.motorCoreService.update(id, {
      status: MOTOR_STATUS.PERBAIKAN,
      service_technician: technician,
    });
  }

  /**
   * Cancel service for motor
   */
  async cancelService(id: number): Promise<Motor> {
    const motor = await this.motorCoreService.findOne(id);

    if (
      motor.status !== MOTOR_STATUS.PERBAIKAN &&
      motor.status !== MOTOR_STATUS.PENDING_PERBAIKAN
    ) {
      throw new BadRequestException('Motor tidak dalam status service.');
    }

    return this.motorCoreService.update(id, {
      status: MOTOR_STATUS.TERSEDIA,
      service_technician: null,
      service_notes: null,
    });
  }

  /**
   * Update motor service information
   */
  async updateServiceInfo(
    id: number,
    data: ServiceInfoUpdateData,
  ): Promise<Motor> {
    await this.motorCoreService.findOne(id); // ✅ Cek motor exists

    const updateData: Prisma.MotorUpdateInput = {};

    if (data.service_technician !== undefined) {
      updateData.service_technician = data.service_technician;
    }
    if (data.service_notes !== undefined) {
      updateData.service_notes = data.service_notes;
    }
    if (data.last_service_date !== undefined) {
      updateData.last_service_date = data.last_service_date
        ? new Date(data.last_service_date)
        : null;
    }

    return this.motorCoreService.update(id, updateData);
  }

  /**
   * Get motors that need service (pending service)
   */
  async findPendingService(): Promise<Motor[]> {
    return this.motorCoreService.findByStatus(MOTOR_STATUS.PENDING_PERBAIKAN);
  }

  /**
   * Get motors in service
   */
  async findInService(): Promise<Motor[]> {
    return this.prisma.motor.findMany({
      where: {
        status: MOTOR_STATUS.PERBAIKAN,
      },
      include: {
        service_records: {
          where: {
            status: 'in_progress',
          },
          orderBy: {
            created_at: 'desc',
          },
          take: 1,
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }
}

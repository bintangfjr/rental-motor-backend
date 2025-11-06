import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ServiceStatus, ServiceType } from '@prisma/client';
import { CreateServiceRecordDto } from './dto/create-service-record.dto';
import { UpdateServiceRecordDto } from './dto/update-service-record.dto';
import { StartServiceDto } from './dto/start-service.dto';
import { CompleteServiceDto } from './dto/complete-service.dto';

@Injectable()
export class MotorServiceService {
  private readonly logger = new Logger(MotorServiceService.name);

  constructor(private prisma: PrismaService) {}

  // Get all service records
  async getAllServiceRecords() {
    return this.prisma.serviceRecord.findMany({
      include: {
        motor: {
          select: {
            id: true,
            plat_nomor: true,
            merk: true,
            model: true,
            status: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  // Get service records by motor ID
  async getServiceRecordsByMotorId(motorId: number) {
    return this.prisma.serviceRecord.findMany({
      where: { motor_id: motorId },
      include: {
        motor: {
          select: {
            id: true,
            plat_nomor: true,
            merk: true,
            model: true,
            status: true,
          },
        },
      },
      orderBy: {
        service_date: 'desc',
      },
    });
  }

  // Get active service record for motor
  async getActiveServiceRecord(motorId: number) {
    return this.prisma.serviceRecord.findFirst({
      where: {
        motor_id: motorId,
        status: ServiceStatus.in_progress,
      },
      include: {
        motor: {
          select: {
            id: true,
            plat_nomor: true,
            merk: true,
            model: true,
            status: true,
          },
        },
      },
    });
  }

  // Create new service record
  async createServiceRecord(createServiceRecordDto: CreateServiceRecordDto) {
    const motor = await this.prisma.motor.findUnique({
      where: { id: createServiceRecordDto.motor_id },
    });

    if (!motor) {
      throw new NotFoundException('Motor tidak ditemukan');
    }

    // Check if motor already in service
    const activeService = await this.getActiveServiceRecord(motor.id);
    if (activeService) {
      throw new BadRequestException('Motor sedang dalam proses service');
    }

    return this.prisma.serviceRecord.create({
      data: {
        service_date: new Date(createServiceRecordDto.service_date),
        estimated_completion: createServiceRecordDto.estimated_completion
          ? new Date(createServiceRecordDto.estimated_completion)
          : null,
        mileage_at_service: motor.total_mileage,
        service_type: createServiceRecordDto.service_type,
        service_location: createServiceRecordDto.service_location,
        service_technician: createServiceRecordDto.service_technician,
        parts: createServiceRecordDto.parts
          ? JSON.stringify(createServiceRecordDto.parts)
          : null,
        services: createServiceRecordDto.services
          ? JSON.stringify(createServiceRecordDto.services)
          : null,
        estimated_cost: createServiceRecordDto.estimated_cost,
        notes: createServiceRecordDto.notes,
        service_notes: createServiceRecordDto.service_notes,
        motor: { connect: { id: createServiceRecordDto.motor_id } },
      },
      include: {
        motor: {
          select: {
            id: true,
            plat_nomor: true,
            merk: true,
            model: true,
            status: true,
          },
        },
      },
    });
  }

  // Start service for a motor
  async startService(motorId: number, startServiceDto: StartServiceDto) {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
    });

    if (!motor) {
      throw new NotFoundException('Motor tidak ditemukan');
    }

    // Check if motor already in service
    const activeService = await this.getActiveServiceRecord(motorId);
    if (activeService) {
      throw new BadRequestException('Motor sedang dalam proses service');
    }

    // Use transaction to update motor and create service record
    return this.prisma.$transaction(async (prisma) => {
      // Update motor status to "perbaikan"
      const updatedMotor = await prisma.motor.update({
        where: { id: motorId },
        data: {
          status: 'perbaikan',
          service_technician: startServiceDto.service_technician,
          last_service_date: new Date(),
        },
      });

      // Create service record
      const serviceRecord = await prisma.serviceRecord.create({
        data: {
          service_date: new Date(),
          estimated_completion: startServiceDto.estimated_completion
            ? new Date(startServiceDto.estimated_completion)
            : null,
          status: ServiceStatus.in_progress,
          mileage_at_service: motor.total_mileage,
          service_type: startServiceDto.service_type,
          service_location: startServiceDto.service_location,
          service_technician: startServiceDto.service_technician,
          parts: startServiceDto.parts
            ? JSON.stringify(startServiceDto.parts)
            : null,
          services: startServiceDto.services
            ? JSON.stringify(startServiceDto.services)
            : null,
          estimated_cost: startServiceDto.estimated_cost,
          notes: startServiceDto.notes,
          service_notes: startServiceDto.service_notes,
          motor: { connect: { id: motorId } },
        },
        include: {
          motor: {
            select: {
              id: true,
              plat_nomor: true,
              merk: true,
              model: true,
              status: true,
            },
          },
        },
      });

      return {
        serviceRecord,
        motor: updatedMotor,
      };
    });
  }

  // Complete service
  async completeService(
    serviceRecordId: number,
    completeServiceDto: CompleteServiceDto,
  ) {
    const serviceRecord = await this.prisma.serviceRecord.findUnique({
      where: { id: serviceRecordId },
      include: {
        motor: true,
      },
    });

    if (!serviceRecord) {
      throw new NotFoundException('Record service tidak ditemukan');
    }

    if (serviceRecord.status !== ServiceStatus.in_progress) {
      throw new BadRequestException('Service tidak dalam status progress');
    }

    // Use transaction to update service record and motor
    return this.prisma.$transaction(async (prisma) => {
      // Update service record
      const updatedServiceRecord = await prisma.serviceRecord.update({
        where: { id: serviceRecordId },
        data: {
          status: ServiceStatus.completed,
          actual_cost: completeServiceDto.actual_cost,
          actual_completion: completeServiceDto.actual_completion
            ? new Date(completeServiceDto.actual_completion)
            : new Date(),
          notes: completeServiceDto.notes || serviceRecord.notes,
          service_summary: completeServiceDto.service_summary,
        },
        include: {
          motor: {
            select: {
              id: true,
              plat_nomor: true,
              merk: true,
              model: true,
              status: true,
            },
          },
        },
      });

      // Update motor status to "tersedia" dan reset data service
      const motorUpdateData: any = {
        status: 'tersedia',
        service_technician: null,
        service_notes: null,
      };

      // Reset service mileage if routine service
      if (serviceRecord.service_type === ServiceType.rutin) {
        motorUpdateData.total_mileage = 0;
        this.logger.log(
          `Reset mileage untuk motor ${serviceRecord.motor_id} setelah service rutin`,
        );
      }

      const updatedMotor = await prisma.motor.update({
        where: { id: serviceRecord.motor_id },
        data: motorUpdateData,
      });

      this.logger.log(
        `Service completed untuk motor ${serviceRecord.motor_id}, status diubah ke tersedia`,
      );

      return {
        serviceRecord: updatedServiceRecord,
        motor: updatedMotor,
      };
    });
  }

  // Cancel service
  async cancelService(serviceRecordId: number) {
    const serviceRecord = await this.prisma.serviceRecord.findUnique({
      where: { id: serviceRecordId },
      include: {
        motor: true,
      },
    });

    if (!serviceRecord) {
      throw new NotFoundException('Record service tidak ditemukan');
    }

    if (
      serviceRecord.status !== ServiceStatus.in_progress &&
      serviceRecord.status !== ServiceStatus.pending
    ) {
      throw new BadRequestException(
        'Service tidak dapat dibatalkan dari status saat ini',
      );
    }

    return this.prisma.$transaction(async (prisma) => {
      // Update service record status to cancelled
      const updatedServiceRecord = await prisma.serviceRecord.update({
        where: { id: serviceRecordId },
        data: {
          status: ServiceStatus.cancelled,
        },
        include: {
          motor: {
            select: {
              id: true,
              plat_nomor: true,
              merk: true,
              model: true,
              status: true,
            },
          },
        },
      });

      // Update motor status back to tersedia untuk SEMUA status service
      if (
        serviceRecord.motor.status === 'perbaikan' ||
        serviceRecord.motor.status === 'pending_perbaikan'
      ) {
        await prisma.motor.update({
          where: { id: serviceRecord.motor_id },
          data: {
            status: 'tersedia',
            service_technician: null,
            service_notes: null,
          },
        });
        this.logger.log(
          `Motor ${serviceRecord.motor_id} status diubah ke tersedia setelah cancel service`,
        );
      }

      return updatedServiceRecord;
    });
  }

  // Update service record
  async updateServiceRecord(
    id: number,
    updateServiceRecordDto: UpdateServiceRecordDto,
  ) {
    const serviceRecord = await this.prisma.serviceRecord.findUnique({
      where: { id },
    });

    if (!serviceRecord) {
      throw new NotFoundException('Record service tidak ditemukan');
    }

    const updateData: any = {
      service_type: updateServiceRecordDto.service_type,
      service_location: updateServiceRecordDto.service_location,
      service_technician: updateServiceRecordDto.service_technician,
      estimated_cost: updateServiceRecordDto.estimated_cost,
      notes: updateServiceRecordDto.notes,
      service_notes: updateServiceRecordDto.service_notes,
    };

    // Handle array fields - convert to JSON string
    if (updateServiceRecordDto.parts) {
      updateData.parts = JSON.stringify(updateServiceRecordDto.parts);
    }

    if (updateServiceRecordDto.services) {
      updateData.services = JSON.stringify(updateServiceRecordDto.services);
    }

    if (updateServiceRecordDto.service_date) {
      updateData.service_date = new Date(updateServiceRecordDto.service_date);
    }

    if (updateServiceRecordDto.estimated_completion) {
      updateData.estimated_completion = new Date(
        updateServiceRecordDto.estimated_completion,
      );
    }

    return this.prisma.serviceRecord.update({
      where: { id },
      data: updateData,
      include: {
        motor: {
          select: {
            id: true,
            plat_nomor: true,
            merk: true,
            model: true,
            status: true,
          },
        },
      },
    });
  }

  // Delete service record
  async deleteServiceRecord(id: number): Promise<void> {
    const serviceRecord = await this.prisma.serviceRecord.findUnique({
      where: { id },
    });

    if (!serviceRecord) {
      throw new NotFoundException('Record service tidak ditemukan');
    }

    await this.prisma.$transaction(async (prisma) => {
      // If service is in progress, update motor status first
      if (serviceRecord.status === ServiceStatus.in_progress) {
        await prisma.motor.update({
          where: { id: serviceRecord.motor_id },
          data: {
            status: 'tersedia',
            service_technician: null,
            service_notes: null,
          },
        });
      }

      await prisma.serviceRecord.delete({
        where: { id },
      });
    });
  }

  // Get service statistics
  async getServiceStats() {
    const [total, inProgress, completed, cancelled, costResult] =
      await Promise.all([
        this.prisma.serviceRecord.count(),
        this.prisma.serviceRecord.count({
          where: { status: ServiceStatus.in_progress },
        }),
        this.prisma.serviceRecord.count({
          where: { status: ServiceStatus.completed },
        }),
        this.prisma.serviceRecord.count({
          where: { status: ServiceStatus.cancelled },
        }),
        this.prisma.serviceRecord.aggregate({
          where: { status: ServiceStatus.completed },
          _sum: {
            actual_cost: true,
          },
        }),
      ]);

    return {
      total,
      inProgress,
      completed,
      cancelled,
      totalCost: costResult._sum.actual_cost || 0,
    };
  }

  // Get pending service motors
  async getPendingServiceMotors() {
    return this.prisma.motor.findMany({
      where: {
        status: 'pending_perbaikan',
      },
      include: {
        service_records: {
          where: {
            status: {
              in: [ServiceStatus.in_progress, ServiceStatus.pending],
            },
          },
          orderBy: {
            created_at: 'desc',
          },
          take: 1,
        },
      },
    });
  }

  // Get motors in service
  async getMotorsInService() {
    return this.prisma.motor.findMany({
      where: {
        status: 'perbaikan',
      },
      include: {
        service_records: {
          where: {
            status: ServiceStatus.in_progress,
          },
          orderBy: {
            created_at: 'desc',
          },
          take: 1,
        },
      },
    });
  }

  // Cancel service by motor ID (untuk handle case tanpa service record)
  async cancelServiceByMotorId(motorId: number) {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
    });

    if (!motor) {
      throw new NotFoundException('Motor tidak ditemukan');
    }

    if (motor.status !== 'perbaikan' && motor.status !== 'pending_perbaikan') {
      throw new BadRequestException('Motor tidak dalam status service');
    }

    return this.prisma.$transaction(async (prisma) => {
      // Cancel any active service records
      await prisma.serviceRecord.updateMany({
        where: {
          motor_id: motorId,
          status: {
            in: [ServiceStatus.in_progress, ServiceStatus.pending],
          },
        },
        data: {
          status: ServiceStatus.cancelled,
        },
      });

      // Update motor status
      const updatedMotor = await prisma.motor.update({
        where: { id: motorId },
        data: {
          status: 'tersedia',
          service_technician: null,
          service_notes: null,
        },
      });

      this.logger.log(
        `Service dibatalkan untuk motor ${motorId}, status diubah ke tersedia`,
      );

      return updatedMotor;
    });
  }

  // Complete service by motor ID (untuk handle case tanpa service record)
  async completeServiceByMotorId(motorId: number) {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
    });

    if (!motor) {
      throw new NotFoundException('Motor tidak ditemukan');
    }

    if (motor.status !== 'perbaikan' && motor.status !== 'pending_perbaikan') {
      throw new BadRequestException('Motor tidak dalam status service');
    }

    return this.prisma.$transaction(async (prisma) => {
      // Complete any active service records
      await prisma.serviceRecord.updateMany({
        where: {
          motor_id: motorId,
          status: ServiceStatus.in_progress,
        },
        data: {
          status: ServiceStatus.completed,
          actual_completion: new Date(),
        },
      });

      // Update motor status dan reset mileage jika perlu
      const motorUpdateData: any = {
        status: 'tersedia',
        service_technician: null,
        service_notes: null,
      };

      const updatedMotor = await prisma.motor.update({
        where: { id: motorId },
        data: motorUpdateData,
      });

      this.logger.log(
        `Service diselesaikan untuk motor ${motorId}, status diubah ke tersedia`,
      );

      return updatedMotor;
    });
  }
}

// src/motor/services/motor-mileage-history.service.ts
import { Injectable, Logger } from '@nestjs/common'; // ✅ Hapus BadRequestException
import { PrismaService } from '../../prisma.service';
import { MileageHistory } from '../../types/mileage.types';
import { MileageHistoryPaginatedResponse } from '../interfaces/motor-service.interface';
import { PrismaMileageHistoryItem } from '../interfaces/mileage.interface';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class MotorMileageHistoryService {
  private readonly logger = new Logger(MotorMileageHistoryService.name);

  constructor(private prisma: PrismaService) {}

  async getMileageHistory(
    motorId: number,
    days: number = 30,
  ): Promise<MileageHistory[]> {
    if (days < 1 || days > 365) {
      throw new Error('Parameter days harus antara 1 dan 365'); // ✅ Gunakan Error biasa
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const history = await this.prisma.motorMileageHistory.findMany({
      where: {
        motor_id: motorId,
        period_date: { gte: startDate },
      },
      orderBy: { period_date: 'desc' },
    });

    return history.map((item) =>
      this.convertMileageHistoryItem(item as PrismaMileageHistoryItem),
    );
  }

  async getMileageHistoryPaginated(
    motorId: number,
    days: number = 30,
    page: number = 1,
    limit: number = 50,
  ): Promise<MileageHistoryPaginatedResponse> {
    if (days < 1 || days > 365)
      throw new Error('Parameter days harus antara 1 dan 365');
    if (page < 1) page = 1;
    if (limit < 1) limit = 1;
    if (limit > 100) limit = 100;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      this.prisma.motorMileageHistory.findMany({
        where: { motor_id: motorId, period_date: { gte: startDate } },
        orderBy: { period_date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.motorMileageHistory.count({
        where: { motor_id: motorId, period_date: { gte: startDate } },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: history.map((item) =>
        this.convertMileageHistoryItem(item as PrismaMileageHistoryItem),
      ),
      total,
      page,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  private convertMileageHistoryItem(
    item: PrismaMileageHistoryItem,
  ): MileageHistory {
    return {
      id: item.id,
      motor_id: item.motor_id,
      imei: item.imei,
      start_time: item.start_time.toISOString(),
      end_time: item.end_time.toISOString(),
      distance_km: this.safeConvertDecimalToNumber(item.distance_km),
      run_time_seconds: item.run_time_seconds,
      average_speed_kmh: this.safeConvertDecimalToNumber(
        item.average_speed_kmh,
      ),
      period_date: item.period_date.toISOString(),
      created_at: item.created_at.toISOString(),
      updated_at: item.updated_at.toISOString(),
    };
  }

  private safeConvertDecimalToNumber(decimalValue: Decimal): number {
    try {
      return decimalValue.toNumber();
    } catch (error) {
      this.logger.warn('Failed to convert decimal to number:', error);
      return 0;
    }
  }
}

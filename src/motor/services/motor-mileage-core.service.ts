// src/motor/services/motor-mileage-core.service.ts
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { IopgpsService } from '../../iopgps/iopgps.service';
import {
  MotorEventsService,
  MotorMileageUpdate,
} from '../../websocket/services/motor-events.service'; // <-- Tambahkan ini
import { Decimal } from '@prisma/client/runtime/library';
import {
  IMotorMileageService,
  MileageData,
} from '../interfaces/motor-service.interface';
import {
  IopgpsMileageResponse,
  MotorWithImei,
  MileageValidationResult,
  MileageError,
  ImeiNotFoundError,
  IopgpsApiError,
} from '../interfaces/mileage.interface';

type PrismaTransaction = Parameters<
  Parameters<PrismaService['$transaction']>[0]
>[0];

// ✅ Type-safe error interface
interface ErrorWithMessage {
  message: string;
}

@Injectable()
export class MotorMileageCoreService
  implements Pick<IMotorMileageService, 'getMileage' | 'syncMileageData'>
{
  private readonly logger = new Logger(MotorMileageCoreService.name);

  constructor(
    private prisma: PrismaService,
    private iopgpsService: IopgpsService,
    private motorEventsService: MotorEventsService, // <-- Inject events service
  ) {}

  async getMileage(
    motorId: number,
    startTime: number,
    endTime?: number,
  ): Promise<MileageData> {
    const motor = await this.getMotorWithImei(motorId);
    const endTimeValue = endTime || Math.floor(Date.now() / 1000);

    try {
      const mileageResponse = (await this.iopgpsService.getDeviceMileage(
        motor.imei,
        startTime.toString(),
        endTimeValue.toString(),
      )) as IopgpsMileageResponse;

      this.validateIopgpsResponse(mileageResponse, motorId, motor.imei);
      const validationResult =
        this.extractAndValidateMileageData(mileageResponse);

      if (!validationResult.isValid) {
        throw new IopgpsApiError(
          validationResult.error || 'Data mileage tidak valid',
          motorId,
          motor.imei,
          mileageResponse.code,
        );
      }

      const { distance, runTime } = validationResult;
      const averageSpeed = this.calculateAverageSpeed(distance, runTime);

      const mileageData = {
        imei: motor.imei,
        startTime,
        endTime: endTimeValue,
        runTime,
        distance,
        averageSpeed,
        period: {
          start: new Date(startTime * 1000),
          end: new Date(endTimeValue * 1000),
        },
      };

      // Emit mileage data fetched event
      this.emitMileageDataFetched(motorId, motor.plat_nomor, mileageData);

      return mileageData;
    } catch (error) {
      this.handleError('getMileage', error, motorId);
    }
  }

  async syncMileageData(
    motorId: number,
    startTime?: number,
    endTime?: number,
  ): Promise<{ success: boolean; recordsAdded: number; message: string }> {
    const motor = await this.getMotorWithImei(motorId);

    const now = Math.floor(Date.now() / 1000);
    const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

    const endTimeValue = endTime || now;
    const startTimeValue = startTime || startOfDay;

    if (endTimeValue <= startTimeValue) {
      const errorMessage = 'End time harus lebih besar dari start time';
      this.motorEventsService.emitMileageSyncComplete(
        motorId,
        false,
        errorMessage,
      );
      return {
        success: false,
        recordsAdded: 0,
        message: errorMessage,
      };
    }

    try {
      const mileageResponse = (await this.iopgpsService.getDeviceMileage(
        motor.imei,
        startTimeValue.toString(),
        endTimeValue.toString(),
      )) as IopgpsMileageResponse;

      this.validateIopgpsResponse(mileageResponse, motorId, motor.imei);
      const validationResult =
        this.extractAndValidateMileageData(mileageResponse);

      if (!validationResult.isValid) {
        const errorMessage =
          validationResult.error || 'Data mileage tidak valid';
        this.motorEventsService.emitMileageSyncComplete(
          motorId,
          false,
          errorMessage,
        );
        return {
          success: false,
          recordsAdded: 0,
          message: errorMessage,
        };
      }

      const { distance: distanceValue, runTime: runTimeSeconds } =
        validationResult;

      if (distanceValue <= 0) {
        const errorMessage = 'Tidak ada data mileage yang valid dari IOPGPS';
        this.motorEventsService.emitMileageSyncComplete(
          motorId,
          false,
          errorMessage,
        );
        return {
          success: false,
          recordsAdded: 0,
          message: errorMessage,
        };
      }

      const recordsAdded = await this.saveMileageData(
        motorId,
        motor.imei,
        motor.plat_nomor,
        distanceValue,
        runTimeSeconds,
        startTimeValue,
        endTimeValue,
      );

      const result = {
        success: true,
        recordsAdded,
        message: `Berhasil sync ${distanceValue} km mileage data`,
      };

      // Emit successful sync event
      this.motorEventsService.emitMileageSyncComplete(
        motorId,
        true,
        result.message,
      );

      // Emit mileage update event jika ada records yang ditambahkan
      if (recordsAdded > 0) {
        this.emitMileageUpdate(motorId, motor.plat_nomor, {
          distance_km: distanceValue,
          period_date: new Date().toISOString(),
          average_speed_kmh: this.calculateAverageSpeed(
            distanceValue,
            runTimeSeconds,
          ),
        });
      }

      return result;
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`Sync failed for motor ${motorId}:`, errorMessage);

      // Emit sync error event
      this.motorEventsService.emitMileageSyncComplete(
        motorId,
        false,
        errorMessage,
      );

      return {
        success: false,
        recordsAdded: 0,
        message: `Gagal sync: ${errorMessage}`,
      };
    }
  }

  private async saveMileageData(
    motorId: number,
    imei: string,
    plat_nomor: string,
    distanceValue: number,
    runTimeSeconds: number,
    startTime: number,
    endTime: number,
  ): Promise<number> {
    const startDate = new Date(startTime * 1000);
    const endDate = new Date(endTime * 1000);
    const periodDate = new Date(startDate);
    periodDate.setHours(0, 0, 0, 0);

    const distanceKm = new Decimal(distanceValue.toFixed(6));
    const averageSpeed = this.calculateAverageSpeed(
      distanceValue,
      runTimeSeconds,
    );
    const averageSpeedDecimal = new Decimal(averageSpeed.toFixed(2));

    return await this.prisma.$transaction(async (tx: PrismaTransaction) => {
      const existingRecord = await tx.motorMileageHistory.findFirst({
        where: {
          motor_id: motorId,
          period_date: periodDate,
          start_time: {
            gte: new Date(periodDate.getTime() - 2 * 60 * 60 * 1000),
            lte: new Date(periodDate.getTime() + 26 * 60 * 60 * 1000),
          },
        },
      });

      if (existingRecord) {
        this.logger.debug(
          `Mileage data already exists for motor ${motorId}, skipping...`,
        );
        return 0;
      }

      await tx.motorMileageHistory.create({
        data: {
          motor_id: motorId,
          imei: imei,
          start_time: startDate,
          end_time: endDate,
          distance_km: distanceKm,
          run_time_seconds: runTimeSeconds,
          average_speed_kmh: averageSpeedDecimal,
          period_date: periodDate,
        },
      });

      const totalMileage = await this.updateTotalMileage(
        motorId,
        distanceKm,
        tx,
      );

      // Emit total mileage update
      this.emitTotalMileageUpdate(motorId, plat_nomor, totalMileage);

      return 1;
    });
  }

  private async updateTotalMileage(
    motorId: number,
    distanceKm: Decimal,
    tx: PrismaTransaction,
  ): Promise<number> {
    try {
      const currentMotor = await tx.motor.findUnique({
        where: { id: motorId },
        select: { total_mileage: true, plat_nomor: true },
      });

      if (!currentMotor) return 0;

      const currentTotal = currentMotor.total_mileage
        ? new Decimal(currentMotor.total_mileage.toString())
        : new Decimal('0');

      const newTotalMileage = currentTotal.plus(distanceKm);

      await tx.motor.update({
        where: { id: motorId },
        data: {
          total_mileage: newTotalMileage,
          last_mileage_sync: new Date(),
        },
      });

      return newTotalMileage.toNumber();
    } catch (updateError) {
      const errorMessage = this.getErrorMessage(updateError);
      this.logger.warn(
        `Failed to update total mileage for motor ${motorId}:`,
        errorMessage,
      );
      return 0;
    }
  }

  private async getMotorWithImei(
    motorId: number,
  ): Promise<MotorWithImei & { plat_nomor: string }> {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
      select: { id: true, imei: true, total_mileage: true, plat_nomor: true },
    });

    if (!motor) {
      throw new NotFoundException(`Motor dengan ID ${motorId} tidak ditemukan`);
    }

    if (!motor.imei) {
      throw new ImeiNotFoundError(motorId);
    }

    return motor;
  }

  // ========== PRIVATE WEB SOCKET EMITTER METHODS ==========

  private emitMileageDataFetched(
    motorId: number,
    plat_nomor: string,
    mileageData: MileageData,
  ): void {
    const update: MotorMileageUpdate = {
      motorId,
      plat_nomor,
      total_mileage: mileageData.distance,
      distance_km: mileageData.distance,
      period_date: mileageData.period.start.toISOString(),
      average_speed_kmh: mileageData.averageSpeed,
      timestamp: new Date().toISOString(),
    };
    this.motorEventsService.emitMileageUpdate(update);
  }

  private emitMileageUpdate(
    motorId: number,
    plat_nomor: string,
    data: {
      distance_km: number;
      period_date: string;
      average_speed_kmh: number;
    },
  ): void {
    const update: MotorMileageUpdate = {
      motorId,
      plat_nomor,
      total_mileage: data.distance_km,
      distance_km: data.distance_km,
      period_date: data.period_date,
      average_speed_kmh: data.average_speed_kmh,
      timestamp: new Date().toISOString(),
    };
    this.motorEventsService.emitMileageUpdate(update);
  }

  private emitTotalMileageUpdate(
    motorId: number,
    plat_nomor: string,
    totalMileage: number,
  ): void {
    // Log total mileage update untuk monitoring
    this.logger.debug(
      `Total mileage updated for ${plat_nomor}: ${totalMileage} km`,
    );

    // Bisa juga emit event khusus untuk total mileage update jika diperlukan
    // this.motorEventsService.emitMileageUpdate(...);
  }

  // ========== EXISTING HELPER METHODS (tetap sama) ==========

  private validateIopgpsResponse(
    response: { code: number; result?: string; msg?: string; message?: string },
    motorId: number,
    imei: string,
  ): void {
    if (response.code !== 0) {
      const errorMessage =
        response.result ||
        response.msg ||
        response.message ||
        'IOPGPS API returned error';
      throw new IopgpsApiError(errorMessage, motorId, imei, response.code);
    }
  }

  private extractAndValidateMileageData(
    mileage: IopgpsMileageResponse,
  ): MileageValidationResult {
    let distance = 0;
    let runTime = 0;

    if (mileage.data) {
      if (typeof mileage.data === 'object' && mileage.data !== null) {
        distance =
          mileage.data.miles ||
          mileage.data.distance ||
          mileage.data.totalDistance ||
          0;
        runTime = mileage.data.runTime || mileage.data.duration || 0;
      } else if (typeof mileage.data === 'number') {
        distance = mileage.data;
        runTime = mileage.runTime || mileage.duration || 0;
      } else if (typeof mileage.data === 'string') {
        distance = parseFloat(mileage.data) || 0;
        runTime = mileage.runTime || mileage.duration || 0;
      }
    } else {
      distance =
        mileage.miles || mileage.distance || mileage.totalDistance || 0;
      runTime = mileage.runTime || mileage.duration || 0;
    }

    // Normalize distance unit
    if (distance > 1000) distance = distance / 1000;

    if (distance < 0) {
      return {
        isValid: false,
        distance: 0,
        runTime: 0,
        error: 'Distance tidak boleh negatif',
      };
    }

    if (distance > 1000) {
      return {
        isValid: false,
        distance,
        runTime,
        error: 'Distance melebihi batas maksimal 1000 km',
      };
    }

    return { isValid: true, distance, runTime };
  }

  private calculateAverageSpeed(distance: number, runTime: number): number {
    if (runTime <= 1 || distance <= 0) return 0;
    const hours = runTime / 3600;
    const speed = distance / hours;
    return speed > 200 ? 200 : speed;
  }

  private handleError(
    context: string,
    error: unknown,
    motorId?: number,
  ): never {
    this.logger.error(`Error in ${context} for motor ${motorId}:`, error);

    if (
      error instanceof MileageError ||
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    const errorMessage = this.getErrorMessage(error);
    throw new BadRequestException(`Gagal dalam ${context}: ${errorMessage}`);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    if (this.isErrorWithMessage(error)) {
      return error.message;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error occurred';
    }
  }

  private isErrorWithMessage(error: unknown): error is ErrorWithMessage {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as Record<string, unknown>).message === 'string'
    );
  }
}

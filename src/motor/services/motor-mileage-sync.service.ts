// src/motor/services/motor-mileage-sync.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { MotorMileageCoreService } from './motor-mileage-core.service';
import {
  MotorEventsService,
  MotorMileageUpdate,
} from '../../websocket/services/motor-events.service'; // <-- Tambahkan ini
import { AutoSyncResult, AutoSyncSummary } from '../../types/mileage.types';

@Injectable()
export class MotorMileageSyncService {
  private readonly logger = new Logger(MotorMileageSyncService.name);

  constructor(
    private prisma: PrismaService,
    private coreService: MotorMileageCoreService,
    private motorEventsService: MotorEventsService, // <-- Inject events service
  ) {}

  async autoSyncAllMotors(): Promise<AutoSyncSummary> {
    const motors = await this.prisma.motor.findMany({
      where: {
        imei: { not: null },
        status: { in: ['tersedia', 'disewa'] },
      },
      select: { id: true, imei: true, plat_nomor: true },
    });

    const results: AutoSyncResult[] = [];
    let successful = 0;
    let failed = 0;

    const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    const now = Math.floor(Date.now() / 1000);

    // Emit sync started event
    this.emitSyncStarted(motors.length);

    for (const motor of motors) {
      try {
        if (results.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const syncResult = await this.coreService.syncMileageData(
          motor.id,
          startOfDay,
          now,
        );

        const success = syncResult.success;
        if (success) {
          successful++;
          // Emit successful sync event
          this.emitMileageSyncSuccess(motor, syncResult);
        } else {
          failed++;
        }

        results.push({
          motorId: motor.id,
          plat_nomor: motor.plat_nomor,
          success,
          message: syncResult.message,
        });

        this.logger.log(
          `Auto-sync for motor ${motor.plat_nomor}: ${syncResult.message}`,
        );

        // Emit progress update
        this.emitSyncProgress({
          processed: results.length,
          total: motors.length,
          successful,
          failed,
        });
      } catch (error) {
        failed++;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        results.push({
          motorId: motor.id,
          plat_nomor: motor.plat_nomor,
          success: false,
          message: errorMessage,
        });

        // Emit sync error event
        this.emitSyncError(motor, errorMessage);

        this.logger.error(
          `Auto-sync failed for motor ${motor.plat_nomor}:`,
          error,
        );
      }
    }

    const summary = {
      totalMotors: motors.length,
      successful,
      failed,
      details: results,
    };

    // Emit sync completed event
    this.emitSyncCompleted(summary);

    return summary;
  }

  async initialFullSync(
    motorId: number,
  ): Promise<{ success: boolean; recordsAdded: number; message: string }> {
    const motor = await this.prisma.motor.findUnique({
      where: { id: motorId },
      select: { id: true, imei: true, plat_nomor: true },
    });

    if (!motor || !motor.imei) {
      return {
        success: false,
        recordsAdded: 0,
        message: 'Motor atau IMEI tidak ditemukan',
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60;

    this.logger.log(`Starting initial full sync for motor ${motorId}`);

    // Emit initial sync started
    this.emitInitialSyncStarted(motor);

    try {
      let totalRecords = 0;
      const currentDate = new Date(thirtyOneDaysAgo * 1000);
      currentDate.setHours(0, 0, 0, 0);

      const endDate = new Date(now * 1000);
      let daysProcessed = 0;
      const totalDays = Math.ceil(
        (endDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      while (currentDate <= endDate) {
        const dayStart = new Date(currentDate);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);

        const dayStartTime = Math.floor(dayStart.getTime() / 1000);
        const dayEndTime = Math.floor(dayEnd.getTime() / 1000);

        try {
          const syncResult = await this.coreService.syncMileageData(
            motorId,
            dayStartTime,
            dayEndTime,
          );

          if (syncResult.success) {
            totalRecords += syncResult.recordsAdded;
          }

          daysProcessed++;

          // Emit day progress
          this.emitInitialSyncProgress(motor, {
            daysProcessed,
            totalDays,
            recordsAdded: totalRecords,
            currentDate: currentDate.toISOString(),
          });

          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          this.logger.warn(
            `Failed to sync day ${currentDate.toISOString()}:`,
            error,
          );
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      const result = {
        success: true,
        recordsAdded: totalRecords,
        message: `Initial sync completed: ${totalRecords} records added for 31 days`,
      };

      // Emit initial sync completed
      this.emitInitialSyncCompleted(motor, result);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Initial full sync failed for motor ${motorId}:`,
        error,
      );

      // Emit initial sync failed
      this.emitInitialSyncFailed(motor, errorMessage);

      return {
        success: false,
        recordsAdded: 0,
        message: `Initial sync failed: ${errorMessage}`,
      };
    }
  }

  async cleanupDuplicateMileageData(
    motorId?: number,
  ): Promise<{ deleted: number; message: string }> {
    try {
      // Emit cleanup started
      this.emitCleanupStarted(motorId);

      const whereCondition = motorId ? { motor_id: motorId } : {};

      const allRecords = await this.prisma.motorMileageHistory.findMany({
        where: whereCondition,
        orderBy: [
          { motor_id: 'asc' },
          { period_date: 'asc' },
          { created_at: 'desc' },
        ],
      });

      const duplicatesToDelete: number[] = [];
      const seen = new Map<string, number>();

      for (const record of allRecords) {
        const key = `${record.motor_id}-${record.period_date.toISOString().split('T')[0]}-${record.distance_km.toString()}`;

        if (seen.has(key)) {
          duplicatesToDelete.push(record.id);
        } else {
          seen.set(key, record.id);
        }
      }

      if (duplicatesToDelete.length === 0) {
        const result = {
          deleted: 0,
          message: 'Tidak ada data duplikat ditemukan',
        };
        this.emitCleanupCompleted(motorId, result);
        return result;
      }

      await this.prisma.motorMileageHistory.deleteMany({
        where: { id: { in: duplicatesToDelete } },
      });

      this.logger.log(
        `Deleted ${duplicatesToDelete.length} duplicate mileage records`,
      );

      const result = {
        deleted: duplicatesToDelete.length,
        message: `Berhasil menghapus ${duplicatesToDelete.length} data duplikat`,
      };

      // Emit cleanup completed
      this.emitCleanupCompleted(motorId, result);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Cleanup duplicates failed:', error);

      // Emit cleanup failed
      this.emitCleanupFailed(motorId, errorMessage);

      throw new Error(`Gagal cleanup data duplikat: ${errorMessage}`);
    }
  }

  async getMileageStatistics(motorId?: number): Promise<{
    totalRecords: number;
    uniqueDays: number;
    duplicates: number;
    dateRange: { start: Date; end: Date };
    totalDistance: number;
  }> {
    const whereCondition = motorId ? { motor_id: motorId } : {};

    const [
      totalRecords,
      firstRecord,
      lastRecord,
      totalDistanceResult,
      uniqueDaysResult,
    ] = await Promise.all([
      this.prisma.motorMileageHistory.count({ where: whereCondition }),
      this.prisma.motorMileageHistory.findFirst({
        where: whereCondition,
        orderBy: { period_date: 'asc' },
        select: { period_date: true },
      }),
      this.prisma.motorMileageHistory.findFirst({
        where: whereCondition,
        orderBy: { period_date: 'desc' },
        select: { period_date: true },
      }),
      this.prisma.motorMileageHistory.aggregate({
        where: whereCondition,
        _sum: { distance_km: true },
      }),
      this.prisma.motorMileageHistory.groupBy({
        by: ['period_date'],
        where: whereCondition,
        _count: { period_date: true },
      }),
    ]);

    const uniqueDays = uniqueDaysResult.length;
    const duplicates = totalRecords - uniqueDays;
    const totalDistance = totalDistanceResult._sum.distance_km?.toNumber() || 0;

    const statistics = {
      totalRecords,
      uniqueDays,
      duplicates,
      dateRange: {
        start: firstRecord?.period_date || new Date(),
        end: lastRecord?.period_date || new Date(),
      },
      totalDistance,
    };

    // Emit statistics update
    this.emitStatisticsUpdate(motorId, statistics);

    return statistics;
  }

  // ========== PRIVATE WEB SOCKET EMITTER METHODS ==========

  private emitSyncStarted(totalMotors: number): void {
    this.motorEventsService.emitMileageSyncComplete(
      0,
      true,
      `Auto sync started for ${totalMotors} motors`,
    );
  }

  private emitSyncProgress(progress: {
    processed: number;
    total: number;
    successful: number;
    failed: number;
  }): void {
    // Bisa extend MotorEventsService untuk progress events
    this.logger.debug(`Sync progress: ${progress.processed}/${progress.total}`);
  }

  private emitSyncCompleted(summary: AutoSyncSummary): void {
    this.motorEventsService.emitMileageSyncComplete(
      0,
      true,
      `Auto sync completed: ${summary.successful}/${summary.totalMotors} successful`,
    );
  }

  private emitMileageSyncSuccess(
    motor: { id: number; plat_nomor: string },
    syncResult: { success: boolean; recordsAdded: number; message: string },
  ): void {
    this.motorEventsService.emitMileageSyncComplete(
      motor.id,
      true,
      syncResult.message,
    );
  }

  private emitSyncError(
    motor: { id: number; plat_nomor: string },
    errorMessage: string,
  ): void {
    this.motorEventsService.emitMileageSyncComplete(
      motor.id,
      false,
      errorMessage,
    );
  }

  private emitInitialSyncStarted(motor: {
    id: number;
    plat_nomor: string;
    imei: string;
  }): void {
    this.logger.log(`Initial sync started for motor ${motor.plat_nomor}`);
  }

  private emitInitialSyncProgress(
    motor: { id: number; plat_nomor: string },
    progress: {
      daysProcessed: number;
      totalDays: number;
      recordsAdded: number;
      currentDate: string;
    },
  ): void {
    // Progress tracking untuk initial sync
    if (progress.daysProcessed % 5 === 0) {
      this.logger.debug(
        `Initial sync progress for ${motor.plat_nomor}: ${progress.daysProcessed}/${progress.totalDays} days`,
      );
    }
  }

  private emitInitialSyncCompleted(
    motor: { id: number; plat_nomor: string },
    result: { success: boolean; recordsAdded: number; message: string },
  ): void {
    this.motorEventsService.emitMileageSyncComplete(
      motor.id,
      true,
      result.message,
    );
  }

  private emitInitialSyncFailed(
    motor: { id: number; plat_nomor: string },
    errorMessage: string,
  ): void {
    this.motorEventsService.emitMileageSyncComplete(
      motor.id,
      false,
      errorMessage,
    );
  }

  private emitCleanupStarted(motorId?: number): void {
    this.logger.log(
      `Cleanup started for ${motorId ? `motor ${motorId}` : 'all motors'}`,
    );
  }

  private emitCleanupCompleted(
    motorId: number | undefined,
    result: { deleted: number; message: string },
  ): void {
    this.logger.log(`Cleanup completed: ${result.message}`);
  }

  private emitCleanupFailed(
    motorId: number | undefined,
    errorMessage: string,
  ): void {
    this.logger.error(`Cleanup failed: ${errorMessage}`);
  }

  private emitStatisticsUpdate(
    motorId: number | undefined,
    statistics: any,
  ): void {
    // Statistics update untuk dashboard real-time
    this.logger.debug(
      `Statistics updated for ${motorId ? `motor ${motorId}` : 'all motors'}`,
    );
  }
}

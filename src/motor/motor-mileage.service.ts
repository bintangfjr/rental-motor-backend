// src/motor/motor-mileage.service.ts
import { Injectable } from '@nestjs/common';
import {
  IMotorMileageService,
  MileageData,
  MileageHistoryPaginatedResponse,
} from './interfaces/motor-service.interface';
import { MileageHistory } from '../types/motor';
import { MotorMileageCoreService } from './services/motor-mileage-core.service';
import { MotorMileageHistoryService } from './services/motor-mileage-history.service';
import { MotorMileageSyncService } from './services/motor-mileage-sync.service';
import { MotorEventsService } from '../websocket/services/motor-events.service'; // <-- Tambahkan ini

@Injectable()
export class MotorMileageService implements IMotorMileageService {
  constructor(
    private coreService: MotorMileageCoreService,
    private historyService: MotorMileageHistoryService,
    private syncService: MotorMileageSyncService,
    private motorEventsService: MotorEventsService, // <-- Inject events service
  ) {}

  // Core methods
  async getMileage(
    motorId: number,
    startTime: number,
    endTime?: number,
  ): Promise<MileageData> {
    return this.coreService.getMileage(motorId, startTime, endTime);
  }

  async syncMileageData(motorId: number, startTime?: number, endTime?: number) {
    const result = await this.coreService.syncMileageData(
      motorId,
      startTime,
      endTime,
    );

    // Emit sync completion event
    if (result.success) {
      this.motorEventsService.emitMileageSyncComplete(
        motorId,
        true,
        result.message,
      );
    } else {
      this.motorEventsService.emitMileageSyncComplete(
        motorId,
        false,
        result.message,
      );
    }

    return result;
  }

  // History methods
  async getMileageHistory(
    motorId: number,
    days: number = 30,
  ): Promise<MileageHistory[]> {
    return this.historyService.getMileageHistory(motorId, days);
  }

  async getMileageHistoryPaginated(
    motorId: number,
    days: number = 30,
    page: number = 1,
    limit: number = 50,
  ): Promise<MileageHistoryPaginatedResponse> {
    return this.historyService.getMileageHistoryPaginated(
      motorId,
      days,
      page,
      limit,
    );
  }

  // Sync methods
  async autoSyncAllMotors() {
    const result = await this.syncService.autoSyncAllMotors();

    // Emit bulk sync completion
    this.motorEventsService.emitMileageSyncComplete(
      0,
      result.failed === 0,
      `Bulk sync completed: ${result.successful}/${result.totalMotors} successful`,
    );

    return result;
  }

  async initialFullSync(motorId: number) {
    return this.syncService.initialFullSync(motorId);
  }

  async cleanupDuplicateMileageData(motorId?: number) {
    return this.syncService.cleanupDuplicateMileageData(motorId);
  }

  async getMileageStatistics(motorId?: number) {
    return this.syncService.getMileageStatistics(motorId);
  }
}

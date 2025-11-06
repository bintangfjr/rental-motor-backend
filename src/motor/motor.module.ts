import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { IopgpsModule } from '../iopgps/iopgps.module';

import { MotorController } from './motor.controller';
import { MotorService } from './motor.service';
import { MotorGpsService } from './motor-gps.service';
import { MotorMileageService } from './motor-mileage.service';
import { MotorCoreService } from './services/motor-core.service';
import { MotorServiceService } from './services/motor-service.service';
import { MotorValidatorService } from './services/motor-validator.service';
import { MotorMileageCoreService } from './services/motor-mileage-core.service';
import { MotorMileageHistoryService } from './services/motor-mileage-history.service';
import { MotorMileageSyncService } from './services/motor-mileage-sync.service';
// MotorEventsService sudah di-provide di WebsocketModule, tidak perlu di-declare ulang di sini

@Module({
  imports: [
    PrismaModule,
    WebsocketModule, // MotorEventsService sudah tersedia dari sini
    forwardRef(() => IopgpsModule),
  ],
  controllers: [MotorController],
  providers: [
    MotorService,
    MotorGpsService,
    MotorMileageService,
    MotorCoreService,
    MotorServiceService,
    MotorValidatorService,
    MotorMileageCoreService,
    MotorMileageHistoryService,
    MotorMileageSyncService,
    // ❌ HAPUS MotorEventsService dari sini (sudah di WebsocketModule)
  ],
  exports: [
    MotorService,
    MotorGpsService,
    MotorMileageService,
    MotorCoreService,
  ],
})
export class MotorModule {}

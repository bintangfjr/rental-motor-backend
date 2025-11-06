// src/iopgps/iopgps.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { IopgpsController } from './iopgps.controller';
import { IopgpsService } from './iopgps.service';
import { IopgpsAuthService } from './iopgps.auth.service';
import { IopgpsApiService } from './services/iopgps-api.service';
import { IopgpsSyncService } from './services/iopgps-sync.service';
import { IopgpsCacheService } from './services/iopgps-cache.service';
import { MotorLocationService } from './services/motor-location.service';
import { IopgpsHealthService } from './services/iopgps-health.service';
import { TokenManagerService } from './services/token-manager.service'; // ← TAMBAHKAN
import { IopgpsEventsService } from '../websocket/services/iopgps-events.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [HttpModule],
  controllers: [IopgpsController],
  providers: [
    IopgpsService,
    IopgpsAuthService,
    IopgpsApiService,
    IopgpsSyncService,
    IopgpsCacheService,
    MotorLocationService,
    IopgpsHealthService,
    MotorLocationService,
    TokenManagerService, // ← TAMBAHKAN INI
    PrismaService,
    IopgpsEventsService,
  ],
  exports: [IopgpsService, IopgpsAuthService],
})
export class IopgpsModule {}

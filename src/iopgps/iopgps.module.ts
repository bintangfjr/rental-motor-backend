// src/iopgps/iopgps.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { IopgpsController } from './iopgps.controller';
import { IopgpsService } from './iopgps.service';
import { IopgpsAuthService } from './iopgps.auth.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [HttpModule],
  controllers: [IopgpsController],
  providers: [IopgpsService, IopgpsAuthService, PrismaService],
  exports: [IopgpsService, IopgpsAuthService],
})
export class IopgpsModule {}

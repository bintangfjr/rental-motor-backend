// src/motor/motor.module.ts
import { Module } from '@nestjs/common';
import { MotorController } from './motor.controller';
import { MotorService } from './motor.service';
import { PrismaService } from '../prisma.service';
import { IopgpsModule } from '../iopgps/iopgps.module'; // Import IOPGPS module

@Module({
  imports: [forwardRef(() => IopgpsModule)], // Gunakan forwardRef untuk menghindari circular dependency
  controllers: [MotorController],
  providers: [MotorService, PrismaService],
  exports: [MotorService],
})
export class MotorModule {}

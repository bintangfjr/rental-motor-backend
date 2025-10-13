import { Module } from '@nestjs/common';
import { MotorController } from './motor.controller';
import { MotorService } from './motor.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [MotorController],
  providers: [MotorService, PrismaService],
  exports: [MotorService],
})
export class MotorModule {}

import { Module } from '@nestjs/common';
import { MotorServiceController } from './motor-service.controller';
import { MotorServiceService } from './motor-service.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [MotorServiceController],
  providers: [MotorServiceService, PrismaService],
  exports: [MotorServiceService],
})
export class MotorServiceModule {}

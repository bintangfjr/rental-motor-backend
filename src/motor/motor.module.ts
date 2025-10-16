// src/motor/motor.module.ts
import { Module, forwardRef } from '@nestjs/common'; // Tambahkan forwardRef di sini
import { MotorController } from './motor.controller';
import { MotorService } from './motor.service';
import { PrismaService } from '../prisma.service';
import { IopgpsModule } from '../iopgps/iopgps.module';

@Module({
  imports: [forwardRef(() => IopgpsModule)], // Sekarang forwardRef tersedia
  controllers: [MotorController],
  providers: [MotorService, PrismaService],
  exports: [MotorService],
})
export class MotorModule {}

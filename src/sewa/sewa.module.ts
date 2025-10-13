import { Module } from '@nestjs/common';
import { SewaController } from './sewa.controller';
import { SewaService } from './sewa.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [SewaController],
  providers: [SewaService, PrismaService],
  exports: [SewaService],
})
export class SewaModule {}

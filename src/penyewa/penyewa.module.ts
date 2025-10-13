import { Module } from '@nestjs/common';
import { PenyewaController } from './penyewa.controller';
import { PenyewaService } from '../penyewa/penyewa.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [PenyewaController],
  providers: [PenyewaService, PrismaService],
  exports: [PenyewaService],
})
export class PenyewaModule {}

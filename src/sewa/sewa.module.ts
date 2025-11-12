import { Module } from '@nestjs/common';
import { SewaController } from './sewa.controller';
import { SewaService } from './sewa.service';
import { OverdueService } from './overdue.service'; // Import service baru
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [SewaController],
  providers: [
    SewaService,
    OverdueService, // Tambahkan service baru
    PrismaService,
  ],
  exports: [
    SewaService,
    OverdueService, // Export jika diperlukan di module lain
  ],
})
export class SewaModule {}

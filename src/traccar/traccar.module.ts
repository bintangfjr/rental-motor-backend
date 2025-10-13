import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TraccarController } from './traccar.controller';
import { TraccarService } from './traccar.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [HttpModule],
  controllers: [TraccarController],
  providers: [TraccarService, PrismaService],
  exports: [TraccarService],
})
export class TraccarModule {}

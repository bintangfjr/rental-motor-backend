import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';

// Import controller dan service dari folder yang benar
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { NotificationService } from './notification.service';
import { SchedulerService } from './scheduler.service';
import { TemplateService } from './template.service';
import { FonnteApiService } from './fonnte-api.service';

// Import PrismaService dari src
import { PrismaService } from '../prisma.service';

@Module({
  imports: [HttpModule, ScheduleModule.forRoot()],
  controllers: [WhatsAppController],
  providers: [
    PrismaService,
    WhatsAppService,
    NotificationService,
    SchedulerService,
    TemplateService,
    FonnteApiService,
  ],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}

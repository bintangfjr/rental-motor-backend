// src/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import moment, { Moment } from 'moment-timezone';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log: ['query', 'info', 'warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();

    // Set timezone untuk setiap koneksi
    await this.$executeRaw`SET time_zone = '+07:00'`;
    console.log('✅ Database timezone set to Asia/Jakarta (+07:00)');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Helper method untuk parse date dengan timezone Jakarta
   * @param dateString string tanggal / datetime
   * @returns Date object sesuai Jakarta time
   */
  parseToDBDate(dateString: string): Date {
    if (!dateString) return new Date();

    let parsedDate: Moment;

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      // Format: 'YYYY-MM-DD' (date only)
      parsedDate = moment
        .tz(dateString, 'YYYY-MM-DD', 'Asia/Jakarta')
        .startOf('day');
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateString)) {
      // Format: 'YYYY-MM-DDTHH:mm' (datetime without timezone)
      parsedDate = moment.tz(dateString, 'YYYY-MM-DDTHH:mm', 'Asia/Jakarta');
    } else {
      // Format lain / full ISO string
      parsedDate = moment.tz(dateString, 'Asia/Jakarta');
    }

    return parsedDate.toDate();
  }

  /**
   * Helper method untuk format Date ke string Jakarta time
   * @param date Date object
   * @returns string dalam format 'YYYY-MM-DD HH:mm:ss'
   */
  formatToJakartaTime(date: Date): string {
    return moment(date).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss');
  }
}

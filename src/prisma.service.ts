import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as moment from 'moment-timezone';

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

    // Debug timezone
    await this.debugTimezone();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Helper method untuk parse date dengan timezone Jakarta
   */
  parseToDBDate(dateString: string): Date {
    if (!dateString) return new Date();

    let parsedDate: moment.Moment;

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      parsedDate = moment
        .tz(dateString, 'YYYY-MM-DD', 'Asia/Jakarta')
        .startOf('day');
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateString)) {
      parsedDate = moment.tz(dateString, 'YYYY-MM-DDTHH:mm', 'Asia/Jakarta');
    } else {
      parsedDate = moment.tz(dateString, 'Asia/Jakarta');
    }

    // 🚨 FIX: Return Date object dengan waktu yang tepat
    return new Date(parsedDate.format('YYYY-MM-DDTHH:mm:ss'));
  }

  /**
   * Helper method untuk format Date ke string Jakarta time
   */
  formatToJakartaTime(date: Date): string {
    return moment(date).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss');
  }

  /**
   * Debug method untuk check timezone issue
   */
  async debugTimezone() {
    try {
      const now = new Date();
      const dbResult = await this.$queryRaw<
        { db_now: Date }[]
      >`SELECT NOW() as db_now`;

      console.log('🔧 Timezone Debug Info:', {
        server_time: now.toLocaleString('id-ID'),
        server_iso: now.toISOString(),
        moment_wib: moment().tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss'),
        database_now: dbResult[0].db_now,
        database_now_locale: dbResult[0].db_now.toLocaleString('id-ID'),
      });
    } catch (error) {
      console.error('Error in timezone debug:', error);
    }
  }
}

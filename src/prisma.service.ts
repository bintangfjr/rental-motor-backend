import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

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
    // ✅ SET TIMEZONE untuk semua session Prisma
    await this.$executeRaw`SET time_zone = '+07:00'`;
    console.log('✅ Database timezone set to +07:00 (WIB)');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

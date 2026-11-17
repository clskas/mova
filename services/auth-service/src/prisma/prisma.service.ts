import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { DB_POOL_DEFAULTS, prismaPoolOptions } from '@mova/shared';
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Shared production database: keep this service inside its connection budget.
    super(prismaPoolOptions(DB_POOL_DEFAULTS.auth));
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicitesController } from './publicites.controller';
import { PublicitesService } from './publicites.service';

@Module({
  imports: [PrismaModule],
  controllers: [PublicitesController],
  providers: [PublicitesService],
  exports: [PublicitesService],
})
export class PublicitesModule {}

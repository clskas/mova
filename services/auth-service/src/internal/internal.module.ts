import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { UsersModule } from '../users/users.module';
@Module({ imports: [UsersModule], controllers: [InternalController] })
export class InternalModule {}

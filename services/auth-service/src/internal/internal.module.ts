import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
@Module({ imports: [UsersModule, AuthModule], controllers: [InternalController] })
export class InternalModule {}

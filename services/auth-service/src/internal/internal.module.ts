import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { ModerationModule } from '../moderation/moderation.module';
@Module({ imports: [UsersModule, AuthModule, ModerationModule], controllers: [InternalController] })
export class InternalModule {}

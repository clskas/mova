import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from '@mova/shared';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (c: ConfigService) => ({ secret: resolveJwtSecret(c.get('JWT_SECRET')) }),
      inject: [ConfigService],
    }),
  ],
  providers: [JwtStrategy, RolesGuard],
  exports: [RolesGuard],
})
export class AuthModule {}

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';
export class RequestOtpDto {
  @ApiProperty({ example: '+243812345678' })
  @IsString()
  phone: string;
}
export class VerifyOtpDto {
  @ApiProperty({ example: '+243812345678' })
  @IsString()
  phone: string;
  @ApiProperty({ example: '123456' })
  @IsString()
  code: string;
  @ApiProperty({ required: false, enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

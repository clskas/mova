import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
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

export class LoginOptionsDto {
  @ApiProperty({ example: '+243812345678' })
  @IsString()
  phone: string;
  @ApiProperty({ required: false, enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class PinLoginDto {
  @ApiProperty({ example: '+243812345678' })
  @IsString()
  phone: string;
  @ApiProperty({ example: '847291' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  pin: string;
  @ApiProperty({ required: false, enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class SetupLocalPinDto {
  @ApiProperty({ example: '847291' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  pin: string;
  @ApiProperty({ example: '847291' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  confirmPin: string;
}

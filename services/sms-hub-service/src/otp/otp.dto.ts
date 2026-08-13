import { IsOptional, IsString, Matches, MinLength, MaxLength } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @MinLength(2)
  app_id: string;

  @IsString()
  @MinLength(8)
  phone: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  idempotency_key?: string;
}

export class VerifyOtpDto {
  @IsString()
  @MinLength(2)
  app_id: string;

  @IsString()
  @MinLength(8)
  phone: string;

  @IsString()
  @Matches(/^\d{4,8}$/)
  code: string;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class SendSmsDto {
  @IsString()
  @MinLength(2)
  app_id: string;

  @IsString()
  @MinLength(8)
  phone: string;

  @IsString()
  @MinLength(1)
  @MaxLength(640)
  text: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  idempotency_key?: string;
}

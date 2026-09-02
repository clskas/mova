import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';
import { UserRole } from '@prisma/client';
import { PARTNER_PORTALS, PartnerPortalId } from './partner-auth.util';

export class AuthIntentDto {
  @ApiProperty({ required: false, enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiProperty({ required: false, enum: PARTNER_PORTALS, description: 'restaurant | rental — portails partenaires uniquement' })
  @IsOptional()
  @IsIn(PARTNER_PORTALS)
  portal?: PartnerPortalId;

  /** Allowlist only: PASSENGER | RESTAURANT | RENTAL_PARTNER. Staff / DRIVER ignored. */
  @ApiProperty({ required: false, enum: ['PASSENGER', 'RESTAURANT', 'RENTAL_PARTNER'] })
  @IsOptional()
  @IsIn(['PASSENGER', 'RESTAURANT', 'RENTAL_PARTNER'])
  intendedRole?: 'PASSENGER' | 'RESTAURANT' | 'RENTAL_PARTNER';
}

export class RequestOtpDto extends AuthIntentDto {
  @ApiProperty({ example: '+243812345678' })
  @IsString({ message: 'Numéro de téléphone requis.' })
  @IsNotEmpty({ message: 'Numéro de téléphone requis.' })
  phone: string;
}

export class VerifyOtpDto extends AuthIntentDto {
  @ApiProperty({ example: '+243812345678' })
  @IsString({ message: 'Numéro de téléphone requis.' })
  @IsNotEmpty({ message: 'Numéro de téléphone requis.' })
  phone: string;
  @ApiProperty({ example: '123456' })
  @IsString()
  code: string;
}

export class LoginOptionsDto extends AuthIntentDto {
  @ApiProperty({ example: '+243812345678', description: 'Téléphone +243 ou e-mail Google mémorisé' })
  @IsString({ message: 'Numéro de téléphone ou e-mail requis.' })
  @IsNotEmpty({ message: 'Numéro de téléphone ou e-mail requis.' })
  phone: string;
}

export class PinLoginDto extends AuthIntentDto {
  @ApiProperty({ example: '+243812345678', description: 'Téléphone +243 ou e-mail Google mémorisé' })
  @IsString({ message: 'Numéro de téléphone ou e-mail requis.' })
  @IsNotEmpty({ message: 'Numéro de téléphone ou e-mail requis.' })
  phone: string;
  @ApiProperty({ example: '847291' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  pin: string;
}

export class GoogleLoginDto extends AuthIntentDto {
  @ApiProperty({ description: 'Google ID token (GIS / google_sign_in)' })
  @IsString()
  idToken: string;
}

export class GoogleVerifyDto extends AuthIntentDto {
  @ApiProperty({ description: 'challengeId renvoyé par POST /auth/google' })
  @IsString()
  challengeId: string;
  @ApiProperty({ example: '123456' })
  @IsString()
  code: string;
}

export class LinkGoogleDto {
  @ApiProperty({ description: 'Google ID token (GIS / google_sign_in)' })
  @IsString()
  idToken: string;
  @ApiProperty({ required: false, example: '123456', description: 'OTP SMS du numéro déjà lié, si demandé' })
  @IsOptional()
  @IsString()
  otpCode?: string;
}

export class LinkPhoneDto {
  @ApiProperty({ example: '+243812345678' })
  @IsString({ message: 'Numéro de téléphone requis.' })
  @IsNotEmpty({ message: 'Numéro de téléphone requis.' })
  phone: string;
  @ApiProperty({ example: '123456' })
  @IsString()
  otpCode: string;
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

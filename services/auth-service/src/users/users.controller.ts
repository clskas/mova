import { Body, Controller, Get, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { ReferralService } from './referral.service';
class UpdateProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() firstName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lastName?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @IsEmail()
  email?: string;
  /** App language: 'fr', 'en', 'sw' or 'ln'. */
  @ApiProperty({ required: false, enum: ['fr', 'en', 'sw', 'ln'] })
  @IsOptional()
  @IsIn(['fr', 'en', 'sw', 'ln'])
  language?: 'fr' | 'en' | 'sw' | 'ln';
  /** Self-declared: 'F', 'M' or '' (not said). Only used for the woman-driver preference. */
  @ApiProperty({ required: false, enum: ['F', 'M', ''] })
  @IsOptional()
  @IsIn(['F', 'M', ''])
  gender?: 'F' | 'M' | '';
}
@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private usersService: UsersService, private referral: ReferralService) {}
  @Get('me/referral')
  @ApiOperation({ summary: 'Parrainage : mon code et mes filleuls' })
  myReferral(@Request() req: { user: { id: string } }) {
    return this.referral.mine(req.user.id);
  }
  @Post('me/referral')
  @ApiOperation({ summary: 'Saisir le code de son parrain' })
  applyReferral(@Request() req: { user: { id: string } }, @Body() body: { code?: string }) {
    return this.referral.applyCode(req.user.id, String(body?.code ?? ''));
  }
  @Get('me')
  @ApiOperation({ summary: 'Profil utilisateur' })
  me(@Request() req: { user: { id: string } }) { return this.usersService.findById(req.user.id); }
  @Patch('me')
  @ApiOperation({ summary: 'Mettre à jour profil' })
  update(@Request() req: { user: { id: string } }, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, dto);
  }
}

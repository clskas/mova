import { Body, Controller, Get, Patch, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
class UpdateProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() firstName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lastName?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @IsEmail()
  email?: string;
}
@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private usersService: UsersService) {}
  @Get('me')
  @ApiOperation({ summary: 'Profil utilisateur' })
  me(@Request() req: { user: { id: string } }) { return this.usersService.findById(req.user.id); }
  @Patch('me')
  @ApiOperation({ summary: 'Mettre à jour profil' })
  update(@Request() req: { user: { id: string } }, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, dto);
  }
}

import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IncidentType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IncidentsService } from './incidents.service';

class CreateIncidentDto {
  @ApiProperty({ enum: IncidentType }) @IsEnum(IncidentType) type!: IncidentType;
  @ApiProperty() @IsString() description!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() rideId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() lat?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() lng?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() referenceType?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() referenceId?: string;
}

@ApiTags('incidents')
@Controller('incidents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IncidentsController {
  constructor(private incidents: IncidentsService) {}

  @Post()
  @ApiOperation({ summary: 'Signaler un incident ou SOS' })
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateIncidentDto) {
    return this.incidents.create({
      userId: req.user.id,
      type: dto.type,
      description: dto.description,
      rideId: dto.rideId,
      lat: dto.lat,
      lng: dto.lng,
      referenceType: dto.referenceType,
      referenceId: dto.referenceId,
      isEmergency: dto.type === IncidentType.SOS,
    });
  }
}

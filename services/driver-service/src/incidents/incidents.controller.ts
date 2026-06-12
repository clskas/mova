import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { IncidentType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IncidentsService } from './incidents.service';
class CreateIncidentDto {
  @ApiProperty({ enum: IncidentType }) @IsEnum(IncidentType) type: IncidentType;
  @ApiProperty() @IsString() description: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() rideId?: string;
}
@ApiTags('incidents')
@Controller('incidents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IncidentsController {
  constructor(private incidents: IncidentsService) {}
  @Post()
  @ApiOperation({ summary: 'Signaler un incident' })
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateIncidentDto) {
    return this.incidents.create(req.user.id, dto.type, dto.description, dto.rideId);
  }
}

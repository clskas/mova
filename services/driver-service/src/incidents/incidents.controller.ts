import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IncidentType } from '@prisma/client';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IncidentsService } from './incidents.service';

class CreateIncidentDto {
  @ApiProperty({ enum: IncidentType }) @IsEnum(IncidentType) type!: IncidentType;
  @ApiProperty() @IsString() @MaxLength(2000) description!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() rideId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() lat?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() lng?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() referenceType?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() referenceId?: string;
}

class LocationDto {
  @IsNumber() lat!: number;
  @IsNumber() lng!: number;
}

class TrustedContactsDto {
  @IsArray() contacts!: { name: string; phone: string }[];
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

  @Get('mine')
  @ApiOperation({ summary: 'Mes signalements et leur suivi' })
  mine(@Request() req: { user: { id: string } }) {
    return this.incidents.listMine(req.user.id);
  }

  @Get('trusted-contacts')
  @ApiOperation({ summary: 'Mes contacts d’urgence (prévenus par SMS en cas de SOS)' })
  trustedContacts(@Request() req: { user: { id: string } }) {
    return this.incidents.listTrustedContacts(req.user.id);
  }

  @Post('trusted-contacts')
  @ApiOperation({ summary: 'Enregistrer mes contacts d’urgence (3 au plus)' })
  setTrustedContacts(@Request() req: { user: { id: string } }, @Body() dto: TrustedContactsDto) {
    return this.incidents.setTrustedContacts(req.user.id, dto.contacts);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Suivi d’un de mes signalements' })
  getMine(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.incidents.getMine(req.user.id, id);
  }

  @Post(':id/location')
  @ApiOperation({ summary: 'Position en direct après un SOS (30 minutes)' })
  location(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: LocationDto) {
    return this.incidents.addLocation(req.user.id, id, dto.lat, dto.lng);
  }
}

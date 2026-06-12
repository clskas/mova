import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';

class ApproveKycDto {
  @ApiProperty() @IsBoolean() approved: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private adminService: AdminService) {}
  @Get('metrics') @ApiOperation({ summary: 'Tableau de bord métriques' }) metrics() { return this.adminService.getMetrics(); }
  @Get('users') @ApiOperation({ summary: 'Liste utilisateurs' }) users(@Query('skip') skip?: string, @Query('take') take?: string) { return this.adminService.listUsers(Number(skip ?? 0), Number(take ?? 50)); }
  @Get('kyc/pending') @ApiOperation({ summary: 'KYC en attente' }) pendingKyc() { return this.adminService.pendingKyc(); }
  @Post('kyc/:id/review') @ApiOperation({ summary: 'Valider/rejeter KYC' }) reviewKyc(@Param('id') id: string, @Body() dto: ApproveKycDto) { return this.adminService.approveKyc(id, dto.approved, dto.notes); }
  @Get('incidents') @ApiOperation({ summary: 'Liste incidents' }) incidents() { return this.adminService.listIncidents(); }
  @Post('incidents/:id/resolve') @ApiOperation({ summary: 'Résoudre incident' }) resolve(@Param('id') id: string, @Body('status') status: string) { return this.adminService.resolveIncident(id, status ?? 'RESOLVED'); }
  @Get('deliveries') @ApiOperation({ summary: 'Vue livraisons en cours' }) deliveries() { return this.adminService.listDeliveries(); }
  @Get('scheduled-rides') @ApiOperation({ summary: 'Vue réservations planifiées' }) scheduledRides() { return this.adminService.listScheduledRides(); }
}

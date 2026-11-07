import { Body, Controller, Get, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DriversService } from './drivers.service';
import { SmileIdService } from '../smile-id/smile-id.service';
import { MatchingConfigService } from '../common/matching-config.service';
import { ActivationPinDto, DriverWithdrawDto, KycUploadDto, UpdateOnboardingDto } from './drivers.dto';

class AvailabilityDto { @ApiProperty() @IsBoolean() isAvailable: boolean; }
class ScanDocumentDto { @ApiProperty({ description: 'ID_PHOTO, DRIVERS_LICENSE, VEHICLE_REGISTRATION, …' }) @IsString() type: string; }
class LocationDto { @ApiProperty() @IsNumber() lat: number; @ApiProperty() @IsNumber() lng: number; }

@ApiTags('drivers')
@Controller('drivers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DriversController {
  constructor(
    private driversService: DriversService,
    private smileId: SmileIdService,
    private platformRules: MatchingConfigService,
  ) {}

  @Get('smile-id')
  @ApiOperation({ summary: 'Vérification d’identité Smile ID : faut-il l’afficher, et où en est-elle' })
  smileIdStatus(@Request() req: { user: { id: string } }) {
    return this.smileId.driverView(req.user.id, this.platformRules.smileIdInApp());
  }

  @Post('smile-id/link')
  @ApiOperation({ summary: 'Lien Smile ID du chauffeur (créé s’il n’existe pas)' })
  async smileIdLink(@Request() req: { user: { id: string } }) {
    const view = await this.smileId.driverView(req.user.id, this.platformRules.smileIdInApp());
    if (!view.visible || !view.canStart) return view;
    await this.smileId.createLink(req.user.id, { force: view.status != null && view.status !== 'PENDING' });
    return this.smileId.driverView(req.user.id, true);
  }

  @Patch('availability')
  availability(@Request() req: { user: { id: string } }, @Body() dto: AvailabilityDto) {
    return this.driversService.setAvailability(req.user.id, dto.isAvailable);
  }

  @Post('location')
  location(@Request() req: { user: { id: string } }, @Body() dto: LocationDto) {
    return this.driversService.updateLocation(req.user.id, dto.lat, dto.lng);
  }

  @Get('kyc')
  @ApiOperation({ summary: 'Statut documents KYC + checklist' })
  kycStatus(@Request() req: { user: { id: string } }) {
    return this.driversService.getKycStatus(req.user.id);
  }

  @Post('kyc')
  kyc(@Request() req: { user: { id: string } }, @Body() dto: KycUploadDto) {
    return this.driversService.uploadKyc(req.user.id, dto.type, dto.url);
  }

  @Get('onboarding')
  @ApiOperation({ summary: 'État du parcours d\'enregistrement chauffeur' })
  onboarding(@Request() req: { user: { id: string } }) {
    return this.driversService.getOnboarding(req.user.id);
  }

  @Post('onboarding/scan')
  @ApiOperation({ summary: 'Lire le dernier document envoyé (IA) pour pré-remplir le formulaire' })
  scanDocument(@Request() req: { user: { id: string } }, @Body() dto: ScanDocumentDto) {
    return this.driversService.scanDocument(req.user.id, dto.type);
  }

  @Patch('onboarding')
  @ApiOperation({ summary: 'Mettre à jour infos personnelles, véhicule, paiement' })
  updateOnboarding(@Request() req: { user: { id: string } }, @Body() dto: UpdateOnboardingDto) {
    return this.driversService.updateOnboarding(req.user.id, dto);
  }

  @Post('activation-pin')
  @ApiOperation({ summary: 'Valider le code PIN d\'activation après approbation KYC' })
  activationPin(@Request() req: { user: { id: string } }, @Body() dto: ActivationPinDto) {
    return this.driversService.verifyActivationPin(req.user.id, dto.pin);
  }

  @Get('earnings')
  earnings(@Request() req: { user: { id: string } }) {
    return this.driversService.getEarnings(req.user.id);
  }

  @Get('earnings/activity')
  @ApiOperation({ summary: 'Historique des gains chauffeur (filtres période / type)' })
  earningsActivity(
    @Request() req: { user: { id: string } },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: string,
    @Query('q') q?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.driversService.getEarningsActivity(req.user.id, {
      from,
      to,
      type,
      q,
      skip: Number(skip ?? 0),
      take: Number(take ?? 50),
    });
  }

  @Post('withdraw/otp')
  @ApiOperation({ summary: 'Envoyer le code de retrait au téléphone du compte' })
  withdrawOtp(@Request() req: { user: { id: string; phone?: string } }, @Body() dto: DriverWithdrawDto) {
    return this.driversService.withdrawOtp(req.user.id, dto.amountCdf, {
      provider: dto.provider,
      phone: dto.phone,
      accountPhone: req.user.phone,
    });
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Retrait Mobile Money vers le numéro configuré dans le dossier' })
  withdraw(@Request() req: { user: { id: string; phone?: string } }, @Body() dto: DriverWithdrawDto) {
    return this.driversService.withdraw(req.user.id, dto.amountCdf, {
      provider: dto.provider,
      phone: dto.phone,
      otp: dto.otp,
      accountPhone: req.user.phone,
    });
  }

  @Get('profile')
  profile(@Request() req: { user: { id: string } }) {
    return this.driversService.getProfileWithUser(req.user.id);
  }
}

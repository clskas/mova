import { Body, Controller, HttpStatus, Post, Request, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import {
  GoogleLoginDto,
  GoogleVerifyDto,
  LinkGoogleDto,
  LinkPhoneDto,
  LoginOptionsDto,
  PinLoginDto,
  RequestOtpDto,
  SetupLocalPinDto,
  VerifyOtpDto,
} from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('otp/request')
  @ApiOperation({ summary: 'Demander un code OTP' })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto.phone, dto.role, dto.portal, dto.intendedRole);
  }

  @Post('otp/verify')
  @ApiOperation({ summary: 'Vérifier OTP et obtenir JWT' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyOtp(
      dto.phone,
      dto.code,
      dto.role,
      dto.portal,
      dto.intendedRole,
    );
    res.status(result.isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Post('login/options')
  @ApiOperation({ summary: 'Options de connexion (PIN local ou SMS)' })
  loginOptions(@Body() dto: LoginOptionsDto) {
    return this.authService.getLoginOptions(dto.phone, dto.role, dto.portal, dto.intendedRole, dto.userId);
  }

  @Post('pin/login')
  @ApiOperation({ summary: 'Connexion par code PIN local (sans SMS)' })
  pinLogin(@Body() dto: PinLoginDto) {
    return this.authService.loginWithPin(dto.phone, dto.pin, dto.role, dto.portal, dto.intendedRole, dto.userId);
  }

  @Post('google')
  @ApiOperation({ summary: 'Connexion Google — étape 1 : ID token, puis OTP e-mail (jamais SMS)' })
  loginGoogle(@Body() dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto.idToken, dto.role, dto.portal, dto.intendedRole);
  }

  @Post('google/verify')
  @ApiOperation({ summary: 'Connexion Google — étape 2 : vérifier l\'OTP et obtenir le JWT' })
  async verifyGoogle(@Body() dto: GoogleVerifyDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyGoogleOtp(
      dto.challengeId,
      dto.code,
      dto.role,
      dto.portal,
      dto.intendedRole,
    );
    res.status(result.isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Post('link-google')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lier Google au compte courant (JWT + ID token)' })
  linkGoogle(@Request() req: { user: { id: string } }, @Body() dto: LinkGoogleDto) {
    return this.authService.linkGoogle(req.user.id, dto.idToken, dto.otpCode);
  }

  @Post('link-phone')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lier un numéro +243 au compte courant (JWT + OTP)' })
  linkPhone(@Request() req: { user: { id: string } }, @Body() dto: LinkPhoneDto) {
    return this.authService.linkPhone(req.user.id, dto.phone, dto.otpCode);
  }

  @Post('unlink-google')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Délier Google (uniquement si un numéro reste)' })
  unlinkGoogle(@Request() req: { user: { id: string } }) {
    return this.authService.unlinkGoogle(req.user.id);
  }

  @Post('unlink-phone')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Délier le numéro (uniquement si Google reste)' })
  unlinkPhone(@Request() req: { user: { id: string } }) {
    return this.authService.unlinkPhone(req.user.id);
  }

  @Post('pin/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Configurer ou réinitialiser le code PIN local' })
  setupPin(@Request() req: { user: { id: string } }, @Body() dto: SetupLocalPinDto) {
    return this.authService.setupLocalPin(req.user.id, dto.pin, dto.confirmPin);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Révoquer le JWT courant (denylist jti)' })
  logout(@Request() req: { user: { jti?: string } }) {
    return this.authService.logout(req.user.jti);
  }
}

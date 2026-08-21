import { Body, Controller, HttpStatus, Post, Request, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import {
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
    return this.authService.requestOtp(dto.phone);
  }

  @Post('otp/verify')
  @ApiOperation({ summary: 'Vérifier OTP et obtenir JWT' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyOtp(dto.phone, dto.code, dto.role);
    res.status(result.isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Post('login/options')
  @ApiOperation({ summary: 'Options de connexion (PIN local ou SMS)' })
  loginOptions(@Body() dto: LoginOptionsDto) {
    return this.authService.getLoginOptions(dto.phone, dto.role);
  }

  @Post('pin/login')
  @ApiOperation({ summary: 'Connexion par code PIN local (sans SMS)' })
  pinLogin(@Body() dto: PinLoginDto) {
    return this.authService.loginWithPin(dto.phone, dto.pin, dto.role);
  }

  @Post('pin/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Configurer ou réinitialiser le code PIN local' })
  setupPin(@Request() req: { user: { id: string } }, @Body() dto: SetupLocalPinDto) {
    return this.authService.setupLocalPin(req.user.id, dto.pin, dto.confirmPin);
  }
}

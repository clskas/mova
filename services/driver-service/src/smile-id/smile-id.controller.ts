import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SmileIdService } from './smile-id.service';

/** Public endpoint: Smile ID posts the verification verdict here (authenticated by its signature). */
@ApiExcludeController()
@Controller('drivers/smile-id')
export class SmileIdWebhookController {
  constructor(private smileId: SmileIdService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Headers() headers: Record<string, unknown>, @Body() body: Record<string, unknown>) {
    const outcome = await this.smileId.handleWebhook(headers ?? {}, body ?? {});
    // A bad signature gets 401; an unknown driver is still acknowledged so Smile ID stops retrying.
    if (outcome === 'bad_signature') throw new UnauthorizedException();
    return { received: true };
  }
}

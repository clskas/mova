import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AssistantApp, AssistantService } from './assistant.service';

class AssistantChatDto {
  @ApiProperty({ enum: ['passenger', 'driver'] })
  @IsOptional()
  @IsIn(['passenger', 'driver'])
  app?: AssistantApp;

  @ApiProperty({ description: 'Conversation so far: [{ role: "user" | "assistant", content }], last one from the user' })
  @IsArray()
  messages: unknown[];
}

@ApiTags('assistant')
@Controller('assistant')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AssistantController {
  constructor(private assistant: AssistantService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Assistant support IA (répond à partir du manuel SENGA)' })
  chat(@Request() req: { user: { id: string } }, @Body() dto: AssistantChatDto) {
    return this.assistant.chat(req.user.id, dto.app ?? 'passenger', dto.messages);
  }
}

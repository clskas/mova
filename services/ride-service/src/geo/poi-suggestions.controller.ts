import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePoiSuggestionDto } from './poi-suggestions.dto';
import { PoiSuggestionsService } from './poi-suggestions.service';

@ApiTags('poi-suggestions')
@Controller('poi-suggestions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PoiSuggestionsController {
  constructor(private suggestions: PoiSuggestionsService) {}

  @Post()
  @ApiOperation({ summary: 'Proposer un lieu (POI) — validation admin requise' })
  create(@Request() req: { user: { id: string } }, @Body() dto: CreatePoiSuggestionDto) {
    return this.suggestions.create(req.user.id, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Mes suggestions de lieux' })
  listMine(@Request() req: { user: { id: string } }) {
    return this.suggestions.listMine(req.user.id);
  }
}

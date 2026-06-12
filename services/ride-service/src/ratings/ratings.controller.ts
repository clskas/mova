import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateRatingDto } from './ratings.dto';
import { RatingsService } from './ratings.service';
@ApiTags('ratings')
@Controller('ratings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RatingsController {
  constructor(private ratings: RatingsService) {}
  @Post() @ApiOperation({ summary: 'Noter un utilisateur' }) create(@Request() req: { user: { id: string } }, @Body() dto: CreateRatingDto) { return this.ratings.create(req.user.id, dto); }
}

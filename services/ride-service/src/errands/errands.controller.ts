import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ErrandChatService } from '../chat/errand-chat.service';
import { SendRideChatDto } from '../chat/ride-chat.dto';
import { CreateErrandOrderDto, UpdateErrandProofDto, UpdateErrandStatusDto } from './errands.dto';
import { ErrandsService } from './errands.service';

@ApiTags('errands')
@Controller('errands')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ErrandsController {
  constructor(
    private errandsService: ErrandsService,
    private errandChatService: ErrandChatService,
  ) {}

  @Post('estimate')
  @ApiOperation({ summary: 'Estimer course/commission (CDF)' })
  estimate(@Body() dto: CreateErrandOrderDto) {
    return this.errandsService.estimate(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Créer commande courses/commissions' })
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateErrandOrderDto) {
    return this.errandsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Historique commandes courses' })
  list(@Request() req: { user: { id: string } }) {
    return this.errandsService.list(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail commande courses' })
  get(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.errandsService.get(id, req.user.id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler commande courses' })
  cancel(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.errandsService.cancel(id, req.user.id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Mettre à jour statut commande courses' })
  status(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: UpdateErrandStatusDto) {
    return this.errandsService.updateStatus(id, req.user.id, dto.status);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accepter une course/commission (chauffeur)' })
  accept(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.errandsService.acceptErrand(id, req.user.id);
  }

  @Patch(':id/driver-status')
  @ApiOperation({ summary: 'Avancer le statut (chauffeur assigné)' })
  driverStatus(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateErrandStatusDto,
  ) {
    return this.errandsService.updateStatusByDriver(
      id,
      req.user.id,
      dto.status,
      dto.purchaseTotalCdf,
      dto.proofPhotoUrl,
    );
  }

  @Patch(':id/proof-photo')
  @ApiOperation({ summary: 'Joindre photo preuve d\'achat (chauffeur)' })
  proofPhoto(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: UpdateErrandProofDto) {
    return this.errandsService.uploadProofPhoto(id, req.user.id, dto.proofPhotoUrl);
  }

  @Get(':id/chat')
  @ApiOperation({ summary: 'Messages chat course/commission' })
  listChat(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.errandChatService.listMessages(id, req.user.id);
  }

  @Post(':id/chat')
  @ApiOperation({ summary: 'Envoyer un message chat course/commission' })
  sendChat(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: SendRideChatDto) {
    return this.errandChatService.sendMessage(id, req.user.id, dto.text);
  }
}

import { Controller, Get, Param, Post, Body, Query, Request, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BillingReceiptService } from './billing-receipt.service';
import { BillingHistoryService } from './partner-billing.service';
import { SendReceiptEmailDto } from './billing.dto';

@ApiTags('billing')
@Controller('billing')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BillingController {
  constructor(
    private billing: BillingReceiptService,
    private billingHistory: BillingHistoryService,
  ) {}

  @Get('history')
  @ApiOperation({ summary: 'Historique des reçus / factures du passager' })
  listHistory(@Request() req: { user: { id: string } }, @Query('limit') limit?: string) {
    return this.billingHistory.listReceiptHistory(req.user.id, limit ? parseInt(limit, 10) : 30);
  }

  @Get(':referenceType/:referenceId')
  @ApiOperation({ summary: 'Reçu / facture (JSON)' })
  getReceipt(
    @Request() req: { user: { id: string } },
    @Param('referenceType') referenceType: string,
    @Param('referenceId') referenceId: string,
  ) {
    return this.billing.buildReceipt(req.user.id, referenceType, referenceId);
  }

  @Get(':referenceType/:referenceId/pdf')
  @ApiOperation({ summary: 'Reçu / facture en PDF (A4)' })
  @ApiProduces('application/pdf')
  async getPdf(
    @Request() req: { user: { id: string } },
    @Param('referenceType') referenceType: string,
    @Param('referenceId') referenceId: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.billing.getPdf(req.user.id, referenceType, referenceId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(':referenceType/:referenceId/thermal')
  @ApiOperation({ summary: 'Reçu thermique (texte + ESC/POS + PDF 80mm)' })
  async getThermal(
    @Request() req: { user: { id: string } },
    @Param('referenceType') referenceType: string,
    @Param('referenceId') referenceId: string,
  ) {
    const { receipt, text, escPos, filename } = await this.billing.getThermal(req.user.id, referenceType, referenceId);
    return {
      receipt,
      thermalText: text,
      escPosBase64: escPos.toString('base64'),
      thermalPdfUrl: `/api/billing/${referenceType}/${referenceId}/thermal.pdf`,
      filename,
    };
  }

  @Get(':referenceType/:referenceId/thermal.pdf')
  @ApiOperation({ summary: 'PDF format ticket 80 mm (impression thermique)' })
  @ApiProduces('application/pdf')
  async getThermalPdf(
    @Request() req: { user: { id: string } },
    @Param('referenceType') referenceType: string,
    @Param('referenceId') referenceId: string,
    @Res() res: Response,
  ) {
    const { pdfBuffer, filename } = await this.billing.getThermalPdf(req.user.id, referenceType, referenceId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdfBuffer);
  }

  @Post(':referenceType/:referenceId/email')
  @ApiOperation({ summary: 'Envoyer le reçu / facture par e-mail' })
  sendEmail(
    @Request() req: { user: { id: string } },
    @Param('referenceType') referenceType: string,
    @Param('referenceId') referenceId: string,
    @Body() dto: SendReceiptEmailDto,
  ) {
    return this.billing.sendEmail(req.user.id, referenceType, referenceId, dto.email);
  }

  @Post(':referenceType/:referenceId/share-chat')
  @ApiOperation({ summary: 'Partager le reçu dans le chat (course / commission)' })
  shareChat(
    @Request() req: { user: { id: string } },
    @Param('referenceType') referenceType: string,
    @Param('referenceId') referenceId: string,
  ) {
    return this.billing.shareInChat(req.user.id, referenceType, referenceId);
  }
}

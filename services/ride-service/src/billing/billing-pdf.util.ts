import PDFDocument from 'pdfkit';
import { MovaReceipt } from './billing.types';
import { formatCdfReceipt } from './billing-labels.util';

export function buildReceiptPdf(receipt: MovaReceipt): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const title = receipt.documentType === 'INVOICE' ? 'FACTURE' : 'REÇU DE PAIEMENT';

    doc.fontSize(22).fillColor('#6B21A8').text('MOVA RDC', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(14).fillColor('#333').text(title, { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(10).fillColor('#666');
    doc.text(`N° ${receipt.receiptNumber}`);
    doc.text(`Émis le ${new Date(receipt.issuedAt).toLocaleString('fr-CD')}`);
    doc.text(`Service : ${receipt.serviceTypeLabel}`);
    doc.moveDown(0.5);

    doc.fontSize(11).fillColor('#111').text(receipt.serviceLabel, { width: 500 });
    doc.moveDown(0.8);

    if (receipt.customer.name || receipt.customer.phone || receipt.customer.email) {
      doc.fontSize(10).fillColor('#444').text('Client', { underline: true });
      if (receipt.customer.name) doc.text(receipt.customer.name);
      if (receipt.customer.phone) doc.text(receipt.customer.phone);
      if (receipt.customer.email) doc.text(receipt.customer.email);
      doc.moveDown(0.8);
    }

    const tableTop = doc.y;
    doc.fontSize(10).fillColor('#111');
    doc.text('Désignation', 50, tableTop, { width: 320 });
    doc.text('Montant', 400, tableTop, { width: 145, align: 'right' });
    doc.moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).strokeColor('#ddd').stroke();
    doc.moveDown(0.5);

    for (const line of receipt.lines) {
      const y = doc.y;
      const sign = line.kind === 'discount' ? '−' : '';
      doc.text(line.label, 50, y, { width: 320 });
      doc.text(`${sign}${formatCdfReceipt(Math.abs(line.amountCdf))}`, 400, y, { width: 145, align: 'right' });
      doc.moveDown(0.4);
    }

    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#333').stroke();
    doc.moveDown(0.4);
    doc.fontSize(12).text('TOTAL', 50, doc.y, { continued: true });
    doc.text(formatCdfReceipt(receipt.totalCdf), { align: 'right' });
    doc.moveDown(1);

    if (receipt.payment) {
      doc.fontSize(10).fillColor('#444').text('Paiement', { underline: true });
      doc.text(`Mode : ${receipt.payment.methodLabel}`);
      doc.text(`Statut : ${receipt.payment.status}`);
      if (receipt.payment.providerRef) doc.text(`Référence : ${receipt.payment.providerRef}`);
      if (receipt.payment.paidAt) {
        doc.text(`Date de paiement : ${new Date(receipt.payment.paidAt).toLocaleString('fr-CD')}`);
      }
      doc.moveDown(0.8);
    }

    doc.fontSize(9).fillColor('#888').text(receipt.footerNote, { align: 'center' });
    doc.text('www.mova.cd', { align: 'center' });

    doc.end();
  });
}

/** PDF format ticket 80 mm (impression thermique via pilote système). */
export function buildThermalPdf(receipt: MovaReceipt): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [226.77, 600], margin: 12 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(11).text('MOVA RDC', { align: 'center' });
    doc.fontSize(9).text(receipt.documentType === 'INVOICE' ? 'FACTURE' : 'REÇU', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(8).text(`N° ${receipt.receiptNumber}`, { align: 'center' });
    doc.text(new Date(receipt.issuedAt).toLocaleString('fr-CD'), { align: 'center' });
    doc.moveDown(0.5);
    doc.text(receipt.serviceTypeLabel, { align: 'center' });
    doc.text(receipt.serviceLabel.slice(0, 40), { align: 'center' });
    doc.moveDown(0.5);

    for (const line of receipt.lines) {
      const sign = line.kind === 'discount' ? '−' : '';
      doc.text(`${line.label}: ${sign}${formatCdfReceipt(Math.abs(line.amountCdf))}`);
    }
    doc.moveDown(0.3);
    doc.fontSize(10).text(`TOTAL: ${formatCdfReceipt(receipt.totalCdf)}`, { align: 'center' });
    if (receipt.payment) {
      doc.fontSize(8).moveDown(0.3);
      doc.text(`${receipt.payment.methodLabel} · ${receipt.payment.status}`, { align: 'center' });
    }
    doc.fontSize(7).moveDown(0.5).text('Merci — mova.cd', { align: 'center' });
    doc.end();
  });
}

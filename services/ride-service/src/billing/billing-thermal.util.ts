import { MovaReceipt } from './billing.types';
import { formatCdfReceipt } from './billing-labels.util';

/** Texte 80 mm pour imprimante thermique (ESC/POS compatible via texte brut). */
export function buildThermalReceiptText(receipt: MovaReceipt, width = 32): string {
  const pad = (left: string, right: string) => {
    const space = Math.max(1, width - left.length - right.length);
    return `${left}${' '.repeat(space)}${right}`;
  };
  const center = (text: string) => {
    const trimmed = text.slice(0, width);
    const padLeft = Math.max(0, Math.floor((width - trimmed.length) / 2));
    return `${' '.repeat(padLeft)}${trimmed}`;
  };
  const divider = '='.repeat(width);
  const dash = '-'.repeat(width);

  const lines: string[] = [
    center('SENGA RDC'),
    center(receipt.documentType === 'INVOICE' ? 'FACTURE' : 'RECU DE PAIEMENT'),
    divider,
    `N° ${receipt.receiptNumber}`,
    new Date(receipt.issuedAt).toLocaleString('fr-CD'),
    dash,
    receipt.serviceTypeLabel,
    receipt.serviceLabel.slice(0, width),
    dash,
  ];

  if (receipt.customer.name) lines.push(`Client: ${receipt.customer.name.slice(0, width - 8)}`);
  if (receipt.customer.phone) lines.push(`Tel: ${receipt.customer.phone}`);

  lines.push(dash);
  for (const line of receipt.lines) {
    const sign = line.kind === 'discount' ? '-' : '';
    lines.push(pad(line.label.slice(0, 20), `${sign}${formatCdfReceipt(Math.abs(line.amountCdf))}`));
  }
  lines.push(dash);
  lines.push(pad('TOTAL', formatCdfReceipt(receipt.totalCdf)));

  if (receipt.payment) {
    lines.push(dash);
    lines.push(`Paiement: ${receipt.payment.methodLabel}`);
    lines.push(`Statut: ${receipt.payment.status}`);
    if (receipt.payment.providerRef) lines.push(`Ref: ${receipt.payment.providerRef.slice(0, width - 5)}`);
    if (receipt.payment.paidAt) {
      lines.push(`Payé le: ${new Date(receipt.payment.paidAt).toLocaleString('fr-CD')}`);
    }
  }

  lines.push(divider);
  lines.push(center('Merci pour votre confiance'));
  lines.push(center('mova.cd'));
  lines.push('\n');

  return lines.join('\n');
}

/** Commandes ESC/POS basiques (init + texte + coupe). */
export function buildEscPosBuffer(text: string): Buffer {
  const ESC = 0x1b;
  const GS = 0x1d;
  const init = Buffer.from([ESC, 0x40]);
  const alignCenter = Buffer.from([ESC, 0x61, 0x01]);
  const alignLeft = Buffer.from([ESC, 0x61, 0x00]);
  const cut = Buffer.from([GS, 0x56, 0x00]);
  const body = Buffer.from(text, 'utf8');
  return Buffer.concat([init, alignCenter, Buffer.from('SENGA RDC\n', 'utf8'), alignLeft, body, cut]);
}

export type ReceiptLineKind = 'item' | 'fee' | 'discount' | 'subtotal' | 'total';

export type ReceiptLine = {
  label: string;
  amountCdf: number;
  kind?: ReceiptLineKind;
};

export type ReceiptPayment = {
  method: string;
  methodLabel: string;
  status: string;
  amountCdf: number;
  providerRef?: string | null;
  paidAt?: string | null;
};

export type MovaReceipt = {
  receiptNumber: string;
  documentType: 'RECEIPT' | 'INVOICE';
  issuedAt: string;
  referenceType: string;
  referenceId: string;
  serviceLabel: string;
  serviceTypeLabel: string;
  customer: { name?: string; phone?: string; email?: string };
  lines: ReceiptLine[];
  subtotalCdf: number;
  discountCdf: number;
  totalCdf: number;
  currency: 'CDF';
  promoCode?: string | null;
  payment?: ReceiptPayment | null;
  footerNote: string;
};

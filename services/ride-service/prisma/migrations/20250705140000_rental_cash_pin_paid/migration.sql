-- PIN espèces location + statut Payée
ALTER TYPE "RentalInquiryStatus" ADD VALUE IF NOT EXISTS 'PAID';

ALTER TABLE "rental_inquiries" ADD COLUMN IF NOT EXISTS "completionPin" TEXT;

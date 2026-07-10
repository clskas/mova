-- PIN local (connexion sans SMS après première vérification OTP)
ALTER TABLE "users" ADD COLUMN "localPinHash" TEXT;
ALTER TABLE "users" ADD COLUMN "localPinSetAt" TIMESTAMP(3);

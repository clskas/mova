CREATE TYPE "UserRole" AS ENUM ('PASSENGER', 'DRIVER', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_KYC');
CREATE TABLE "users" ("id" TEXT NOT NULL, "phone" TEXT NOT NULL, "firstName" TEXT, "lastName" TEXT, "email" TEXT, "role" "UserRole" NOT NULL DEFAULT 'PASSENGER', "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE', "avatarUrl" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "users_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE TABLE "otp_codes" ("id" TEXT NOT NULL, "phone" TEXT NOT NULL, "code" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "used" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id"));
CREATE INDEX "otp_codes_phone_idx" ON "otp_codes"("phone");

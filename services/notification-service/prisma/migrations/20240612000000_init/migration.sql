CREATE TABLE "notifications" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "title" TEXT NOT NULL, "body" TEXT NOT NULL, "type" TEXT NOT NULL, "read" BOOLEAN NOT NULL DEFAULT false, "data" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"));
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateTable
CREATE TABLE "staff_alerts" (
    "id" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "city" TEXT,
    "href" TEXT,
    "targetRole" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_alerts_createdAt_idx" ON "staff_alerts"("createdAt");

-- CreateIndex
CREATE INDEX "staff_alerts_readAt_createdAt_idx" ON "staff_alerts"("readAt", "createdAt");

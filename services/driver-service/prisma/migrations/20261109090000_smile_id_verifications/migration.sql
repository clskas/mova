CREATE TABLE IF NOT EXISTS "smile_id_verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "env" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "smileUserId" TEXT,
    "jobId" TEXT,
    "link" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "reason" TEXT,
    "result" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "smile_id_verifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "smile_id_verifications_refId_key" ON "smile_id_verifications"("refId");
CREATE INDEX IF NOT EXISTS "smile_id_verifications_userId_idx" ON "smile_id_verifications"("userId");
CREATE INDEX IF NOT EXISTS "smile_id_verifications_smileUserId_idx" ON "smile_id_verifications"("smileUserId");
CREATE INDEX IF NOT EXISTS "smile_id_verifications_jobId_idx" ON "smile_id_verifications"("jobId");

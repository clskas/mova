CREATE TABLE IF NOT EXISTS "money_control_runs" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "checkedWallets" INTEGER NOT NULL DEFAULT 0,
    "checkedJobs" INTEGER NOT NULL DEFAULT 0,
    "anomalyCount" INTEGER NOT NULL DEFAULT 0,
    "anomalies" JSONB,
    CONSTRAINT "money_control_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "money_control_runs_startedAt_idx" ON "money_control_runs"("startedAt");

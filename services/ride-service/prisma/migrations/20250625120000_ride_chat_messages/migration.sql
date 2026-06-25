CREATE TABLE "ride_chat_messages" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ride_chat_messages_rideId_createdAt_idx" ON "ride_chat_messages"("rideId", "createdAt");

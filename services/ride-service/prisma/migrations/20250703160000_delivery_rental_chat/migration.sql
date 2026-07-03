-- Chat messages for deliveries and rental bookings (receipt share + courier chat)
CREATE TABLE "delivery_chat_messages" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_chat_messages_deliveryId_createdAt_idx" ON "delivery_chat_messages"("deliveryId", "createdAt");

CREATE TABLE "rental_chat_messages" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rental_chat_messages_inquiryId_createdAt_idx" ON "rental_chat_messages"("inquiryId", "createdAt");

FROM node:22-alpine AS shared-builder
WORKDIR /app/packages/shared
COPY packages/shared/package*.json ./
RUN npm ci
COPY packages/shared/ ./
RUN npm run build

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=shared-builder /app/packages/shared ./packages/shared
COPY services/payment-service/package*.json ./services/payment-service/
WORKDIR /app/services/payment-service
RUN npm ci
COPY services/payment-service/ ./
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app/services/payment-service
RUN apk add --no-cache openssl postgresql-client bash
COPY --from=shared-builder /app/packages/shared /app/packages/shared
COPY services/payment-service/package*.json ./
RUN npm ci --omit=dev
RUN npm install prisma@5.22.0 --no-save
COPY --from=builder /app/services/payment-service/dist ./dist
COPY --from=builder /app/services/payment-service/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/services/payment-service/prisma ./prisma
COPY scripts/backup-db.sh scripts/migrate-with-backup.sh /app/scripts/
RUN chmod +x /app/scripts/*.sh
ENV NODE_ENV=production MOVA_SERVICE=payments
EXPOSE 3000
CMD ["sh", "-c", "/app/scripts/migrate-with-backup.sh && node dist/main.js"]
